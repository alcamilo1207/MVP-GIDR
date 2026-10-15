from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Query
from sqlalchemy import func, select

from app.connectors.base import EventoEstado
from app.errors import ErrorApi, no_encontrado
from app.models import (
    Barrera,
    Escenario,
    EscenarioBarrera,
    EstadoBarreraHist,
    Nodo,
    PalabraGuia,
    ResultadoRiesgo,
    Unidad,
)
from app.schemas import (
    BarreraDetalle,
    BarreraIn,
    BarreraOut,
    BarreraUpdate,
    CambioEstadoIn,
    CambioEstadoOut,
    EscenarioDependiente,
    HistorialOut,
    ImpactoEscenario,
    Pagina,
    ResultadoSnap,
)
from app.security import Admin, DbSession, Usuario_
from app.services import cmms, recalc
from app.services.audit import registrar

router = APIRouter(prefix="/barreras", tags=["Barreras"])


def _out(db: DbSession, b: Barrera) -> BarreraOut:
    n = db.scalar(select(func.count()).select_from(EscenarioBarrera).where(EscenarioBarrera.barrera_id == b.id)) or 0
    o = BarreraOut.model_validate(b)
    o.n_escenarios = n
    return o


@router.get("", response_model=Pagina[BarreraOut])
def listar(
    db: DbSession, _: Usuario_,
    estado: str | None = Query(None, pattern="^(DISPONIBLE|DEGRADADO|EN_MANTENIMIENTO|FUERA_DE_SERVICIO|INEXISTENTE)$"),
    tipo: str | None = Query(None, pattern="^(EXISTENTE|TEMPORAL)$"),
    site_id: int | None = None, unidad_id: int | None = None, q: str | None = None,
    page: int = Query(1, ge=1), size: int = Query(50, ge=1, le=500),
) -> Any:
    stmt = select(Barrera)
    if estado:
        stmt = stmt.where(Barrera.estado_actual == estado)
    if tipo:
        stmt = stmt.where(Barrera.tipo == tipo)
    if q:
        stmt = stmt.where(Barrera.tag_activo.ilike(f"%{q}%") | Barrera.descripcion.ilike(f"%{q}%"))
    if site_id or unidad_id:
        sub = (
            select(EscenarioBarrera.barrera_id)
            .join(Escenario, EscenarioBarrera.escenario_id == Escenario.id)
            .join(PalabraGuia, Escenario.palabra_guia_id == PalabraGuia.id)
            .join(Nodo, PalabraGuia.nodo_id == Nodo.id)
            .join(Unidad, Nodo.unidad_id == Unidad.id)
        )
        if unidad_id:
            sub = sub.where(Unidad.id == unidad_id)
        if site_id:
            sub = sub.where(Unidad.site_id == site_id)
        stmt = stmt.where(Barrera.id.in_(sub))
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    filas = db.scalars(stmt.order_by(Barrera.tag_activo).offset((page - 1) * size).limit(size)).all()
    conteos = dict(db.execute(select(EscenarioBarrera.barrera_id, func.count())
                              .where(EscenarioBarrera.barrera_id.in_([b.id for b in filas]))
                              .group_by(EscenarioBarrera.barrera_id)).all()) if filas else {}
    items = []
    for b in filas:
        o = BarreraOut.model_validate(b)
        o.n_escenarios = conteos.get(b.id, 0)
        items.append(o)
    return {"items": items, "total": total, "page": page, "size": size}


def _obtener(db: DbSession, id_: int) -> Barrera:
    b = db.get(Barrera, id_)
    if b is None:
        raise no_encontrado("Barrera", id_)
    return b


@router.get("/{id_}", response_model=BarreraDetalle)
def detalle(id_: int, db: DbSession, _: Usuario_) -> BarreraDetalle:
    """Barrera con los escenarios que dependen de ella (impacto de cambiar su estado)."""
    b = _obtener(db, id_)
    filas = db.execute(
        select(Escenario, EscenarioBarrera, Nodo, Unidad)
        .join(EscenarioBarrera, EscenarioBarrera.escenario_id == Escenario.id)
        .join(PalabraGuia, Escenario.palabra_guia_id == PalabraGuia.id)
        .join(Nodo, PalabraGuia.nodo_id == Nodo.id)
        .join(Unidad, Nodo.unidad_id == Unidad.id)
        .where(EscenarioBarrera.barrera_id == id_)
        .order_by(Escenario.id)
    ).all()
    res = recalc.ultimos_resultados(db, [f[0].id for f in filas])
    deps = []
    for esc, vin, nodo, uni in filas:
        r: ResultadoRiesgo | None = res.get(esc.id)
        deps.append(EscenarioDependiente(
            escenario_id=esc.id, causa=esc.causa, unidad=uni.nombre, nodo=nodo.nombre, lado=vin.lado,
            frr_diseno=vin.frr_diseno, riesgo_diseno=r.riesgo_diseno if r else None,
            riesgo_actual=r.riesgo_actual if r else None, brecha=r.brecha if r else None))
    base = _out(db, b)
    return BarreraDetalle(**base.model_dump(), dependientes=deps)


@router.get("/{id_}/historial", response_model=list[HistorialOut])
def historial(id_: int, db: DbSession, _: Usuario_, limite: int = Query(200, ge=1, le=2000)) -> Any:
    _obtener(db, id_)
    return db.scalars(select(EstadoBarreraHist).where(EstadoBarreraHist.barrera_id == id_)
                      .order_by(EstadoBarreraHist.ts.desc()).limit(limite)).all()


@router.post("", response_model=BarreraDetalle, status_code=201)
def crear(datos: BarreraIn, db: DbSession, p: Admin) -> BarreraDetalle:
    """Alta de barrera (p. ej. TEMPORAL con vigencia y MOC) y vínculo a escenarios; recalcula."""
    empresa_id = datos.empresa_id
    if empresa_id is None:
        from app.models import Empresa
        e = db.scalars(select(Empresa).order_by(Empresa.id)).first()
        if e is None:
            raise ErrorApi(409, "SIN_EMPRESA", "Debe existir al menos una empresa")
        empresa_id = e.id
    if db.scalars(select(Barrera.id).filter_by(empresa_id=empresa_id, tag_activo=datos.tag_activo)).first():
        raise ErrorApi(409, "TAG_DUPLICADO", f"Ya existe una barrera con tag {datos.tag_activo}")
    ahora = recalc.ahora()
    b = Barrera(empresa_id=empresa_id, tag_activo=datos.tag_activo, descripcion=datos.descripcion,
                tipo=datos.tipo, vigencia_desde=datos.vigencia_desde, vigencia_hasta=datos.vigencia_hasta,
                moc_ref=datos.moc_ref, estado_actual="DISPONIBLE", estado_actualizado=ahora)
    db.add(b)
    db.flush()
    db.add(EstadoBarreraHist(barrera_id=b.id, ts=ahora, estado="DISPONIBLE", fuente="UI",
                             detalle={"nota": "Alta de barrera", "moc_ref": datos.moc_ref}))
    ids = []
    for v in datos.vinculos:
        if db.get(Escenario, v.escenario_id) is None:
            raise no_encontrado("Escenario", v.escenario_id)
        db.add(EscenarioBarrera(escenario_id=v.escenario_id, barrera_id=b.id, frr_diseno=v.frr_diseno, lado=v.lado))
        ids.append(v.escenario_id)
    registrar(db, p.username, "CREAR_BARRERA_TEMPORAL" if datos.tipo == "TEMPORAL" else "CREAR_BARRERA",
              "barrera", b.id, despues={**datos.model_dump(mode="json")})
    db.flush()
    if ids:
        recalc.recalcular(db, ids, f"Alta de barrera {datos.tipo.lower()} {datos.tag_activo}", p.username, auditar=False)
    db.commit()
    return detalle(b.id, db, p)


@router.put("/{id_}", response_model=BarreraDetalle)
def actualizar(id_: int, datos: BarreraUpdate, db: DbSession, p: Admin) -> BarreraDetalle:
    b = _obtener(db, id_)
    cambios = datos.model_dump(exclude_unset=True)
    antes = {k: str(getattr(b, k)) for k in cambios}
    for k, v in cambios.items():
        setattr(b, k, v)
    registrar(db, p.username, "ACTUALIZAR_BARRERA", "barrera", id_, antes=antes,
              despues={k: str(v) for k, v in cambios.items()})
    db.flush()
    ids = recalc.escenarios_de_barrera(db, id_)
    if ids:
        recalc.recalcular(db, ids, f"Modificación de barrera {b.tag_activo}", p.username, auditar=False)
    db.commit()
    return detalle(id_, db, p)


@router.delete("/{id_}", status_code=204)
def eliminar(id_: int, db: DbSession, p: Admin) -> None:
    b = _obtener(db, id_)
    ids = recalc.escenarios_de_barrera(db, id_)
    registrar(db, p.username, "ELIMINAR_BARRERA", "barrera", id_, antes={"tag": b.tag_activo})
    db.delete(b)
    db.flush()
    if ids:
        recalc.recalcular(db, ids, f"Eliminación de barrera {b.tag_activo}", p.username, auditar=False)
    db.commit()


@router.post("/{id_}/estado", response_model=CambioEstadoOut)
def cambiar_estado(id_: int, datos: CambioEstadoIn, db: DbSession, p: Admin) -> CambioEstadoOut:
    """Cambia (``aplicar=true``) o simula (``aplicar=false``) el estado de una barrera.

    Devuelve el antes/después del riesgo de cada escenario dependiente (botón 'Simular evento').
    """
    b = _obtener(db, id_)
    anterior = b.estado_actual
    impacto_raw = recalc.simular_cambio_estado(db, b, datos.estado)
    if datos.aplicar:
        ev = EventoEstado(b.tag_activo, datos.estado, datos.fuente, recalc.ahora(), datos.detalle or {})
        cmms.aplicar_eventos(db, [ev], p.username)
        db.commit()
    impacto = [ImpactoEscenario(
        escenario_id=int(i["escenario_id"]),  # type: ignore[call-overload]
        causa=str(i["causa"]),
        antes=ResultadoSnap(**i["antes"]) if i["antes"] else None,  # type: ignore[arg-type]
        despues=ResultadoSnap(**i["despues"]),  # type: ignore[arg-type]
    ) for i in impacto_raw]
    return CambioEstadoOut(aplicado=datos.aplicar, barrera_id=b.id, tag_activo=b.tag_activo,
                           estado_anterior=anterior, estado_nuevo=datos.estado, impacto=impacto)
