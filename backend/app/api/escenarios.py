from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Query
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.errors import ErrorApi, no_encontrado
from app.models import Barrera, Escenario, EscenarioBarrera, ResultadoRiesgo
from app.schemas import (
    BarreraEscenarioOut,
    EscenarioDetalle,
    EscenarioIn,
    EscenarioOut,
    EscenarioUpdate,
    Pagina,
    ResultadoOut,
    VinculoCrear,
)
from app.security import Admin, DbSession, Usuario_
from app.services import recalc
from app.services.audit import registrar
from app.services.queries import a_escenario_out, consulta_escenarios, conteo_barreras

router = APIRouter(prefix="/escenarios", tags=["Escenarios"])

ORDENES = {"brecha": (ResultadoRiesgo.brecha.desc(), ResultadoRiesgo.puntaje_actual.desc()),
           "riesgo": (ResultadoRiesgo.puntaje_actual.desc(),), "id": (Escenario.id,)}


@router.get("", response_model=Pagina[EscenarioOut])
def listar(
    db: DbSession, _: Usuario_,
    site_id: int | None = None, unidad_id: int | None = None, nodo_id: int | None = None,
    riesgo_actual: str | None = Query(None, pattern="^(Bajo|Medio|Alto|Extremo)$"),
    solo_brecha: bool = False, q: str | None = None,
    orden: str = Query("id", pattern="^(id|brecha|riesgo)$"),
    page: int = Query(1, ge=1), size: int = Query(50, ge=1, le=500),
) -> Any:
    stmt = consulta_escenarios(site_id, unidad_id, nodo_id, riesgo_actual, solo_brecha, q)
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    filas = db.execute(stmt.order_by(*ORDENES[orden], Escenario.id).offset((page - 1) * size).limit(size)).all()
    conteos = conteo_barreras(db, [f[0].id for f in filas])
    return {"items": [a_escenario_out(f, conteos.get(f[0].id, 0)) for f in filas],
            "total": total, "page": page, "size": size}


def _fila(db: DbSession, id_: int) -> Any:
    fila = db.execute(consulta_escenarios().where(Escenario.id == id_)).first()
    if fila is None:
        raise no_encontrado("Escenario", id_)
    return fila


def _detalle_barreras(db: DbSession, esc_id: int) -> list[BarreraEscenarioOut]:
    esc = db.scalars(
        select(Escenario).where(Escenario.id == esc_id).options(
            selectinload(Escenario.barreras).joinedload(EscenarioBarrera.barrera))
    ).one()
    cfg = recalc.cargar_config(db, recalc.empresa_de(esc))
    out: list[BarreraEscenarioOut] = []
    from app.domain.engine.core import BarreraEntrada, detallar_barrera

    for v in esc.barreras:
        b = v.barrera
        d = detallar_barrera(
            BarreraEntrada(b.tag_activo, b.tipo, v.frr_diseno, b.estado_actual, b.vigencia_desde,
                           b.vigencia_hasta, v.lado), cfg, recalc.hoy())
        out.append(BarreraEscenarioOut(
            barrera_id=b.id, tag_activo=b.tag_activo, descripcion=b.descripcion, tipo=b.tipo,
            estado_actual=b.estado_actual, lado=v.lado, frr_diseno=v.frr_diseno,
            frr_efectivo=d.frr_efectivo, cuenta_en_diseno=d.cuenta_en_diseno, vigente=d.vigente,
            vigencia_desde=b.vigencia_desde, vigencia_hasta=b.vigencia_hasta, moc_ref=b.moc_ref))
    return sorted(out, key=lambda x: (x.lado, x.tag_activo))


@router.get("/{id_}", response_model=EscenarioDetalle)
def detalle(id_: int, db: DbSession, _: Usuario_) -> EscenarioDetalle:
    fila = _fila(db, id_)
    barreras = _detalle_barreras(db, id_)
    hist = db.scalars(select(ResultadoRiesgo).where(ResultadoRiesgo.escenario_id == id_)
                      .order_by(ResultadoRiesgo.id.desc()).limit(50)).all()
    base = a_escenario_out(fila, len(barreras))
    return EscenarioDetalle(**base.model_dump(), barreras=barreras,
                            historial=[ResultadoOut.model_validate(h) for h in hist])


@router.get("/{id_}/resultado", response_model=EscenarioDetalle)
def resultado(id_: int, db: DbSession, u: Usuario_) -> EscenarioDetalle:
    """Resultado vigente del motor (campos calculados), barreras con FRR efectivo e historial."""
    return detalle(id_, db, u)


@router.post("", response_model=EscenarioOut, status_code=201)
def crear(datos: EscenarioIn, db: DbSession, p: Admin) -> EscenarioOut:
    esc = Escenario(**datos.model_dump())
    db.add(esc)
    db.flush()
    registrar(db, p.username, "CREAR_ESCENARIO", "escenario", esc.id, despues=datos.model_dump())
    recalc.recalcular(db, [esc.id], "Alta de escenario", p.username, auditar=False)
    db.commit()
    return a_escenario_out(_fila(db, esc.id))


@router.put("/{id_}", response_model=EscenarioOut)
def actualizar(id_: int, datos: EscenarioUpdate, db: DbSession, p: Admin) -> EscenarioOut:
    """Cambio de versión del escenario: incrementa ``version`` y recalcula."""
    esc = db.get(Escenario, id_)
    if esc is None:
        raise no_encontrado("Escenario", id_)
    cambios = datos.model_dump(exclude_unset=True, exclude_none=True)
    antes = {k: getattr(esc, k) for k in cambios}
    for k, v in cambios.items():
        setattr(esc, k, v)
    if cambios:
        esc.version += 1
        registrar(db, p.username, "ACTUALIZAR_ESCENARIO", "escenario", id_, antes=antes,
                  despues={**cambios, "version": esc.version})
        recalc.recalcular(db, [id_], f"Nueva versión {esc.version} del escenario", p.username, auditar=False)
    db.commit()
    return a_escenario_out(_fila(db, id_))


@router.delete("/{id_}", status_code=204)
def eliminar(id_: int, db: DbSession, p: Admin) -> None:
    esc = db.get(Escenario, id_)
    if esc is None:
        raise no_encontrado("Escenario", id_)
    registrar(db, p.username, "ELIMINAR_ESCENARIO", "escenario", id_, antes={"causa": esc.causa})
    db.delete(esc)
    db.commit()


@router.post("/{id_}/barreras", response_model=EscenarioDetalle, status_code=201)
def vincular_barrera(id_: int, datos: VinculoCrear, db: DbSession, p: Admin) -> EscenarioDetalle:
    if db.get(Escenario, id_) is None:
        raise no_encontrado("Escenario", id_)
    if db.get(Barrera, datos.barrera_id) is None:
        raise no_encontrado("Barrera", datos.barrera_id)
    existe = db.scalars(select(EscenarioBarrera).filter_by(escenario_id=id_, barrera_id=datos.barrera_id)).first()
    if existe:
        raise ErrorApi(409, "VINCULO_DUPLICADO", "La barrera ya está vinculada al escenario")
    db.add(EscenarioBarrera(escenario_id=id_, **datos.model_dump()))
    registrar(db, p.username, "VINCULAR_BARRERA", "escenario", id_, despues=datos.model_dump())
    db.flush()
    recalc.recalcular(db, [id_], "Barrera vinculada al escenario", p.username, auditar=False)
    db.commit()
    return detalle(id_, db, p)


@router.delete("/{id_}/barreras/{barrera_id}", status_code=204)
def desvincular_barrera(id_: int, barrera_id: int, db: DbSession, p: Admin) -> None:
    v = db.scalars(select(EscenarioBarrera).filter_by(escenario_id=id_, barrera_id=barrera_id)).first()
    if v is None:
        raise no_encontrado("Vínculo", f"{id_}/{barrera_id}")
    db.delete(v)
    registrar(db, p.username, "DESVINCULAR_BARRERA", "escenario", id_, antes={"barrera_id": barrera_id})
    db.flush()
    recalc.recalcular(db, [id_], "Barrera desvinculada del escenario", p.username, auditar=False)
    db.commit()
