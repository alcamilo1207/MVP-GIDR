from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Query
from sqlalchemy import func, select

from app.domain.engine import constants as c
from app.errors import ErrorApi, no_encontrado
from app.models import Accion, Empresa, EventoAuditoria, MatrizRiesgo, PoliticaEstado
from app.schemas import (
    AccionIn,
    AccionOut,
    AuditoriaOut,
    CeldaMatrizIn,
    ConfiguracionOut,
    Estado,
    Pagina,
    PoliticaIn,
    RecalcularIn,
    RecalculoOut,
)
from app.security import Admin, DbSession, Usuario_
from app.services import importer, recalc
from app.services.audit import registrar

router = APIRouter(tags=["Sistema"])

SUPUESTOS = [
    "Frecuencia A (más frecuente) … E (más rara); índices 0–4.",
    "Severidad = máximo de los 4 impactos (estrategia intercambiable).",
    "Matriz 5x5: puntaje=(5−índice)×severidad; Bajo 1–4, Medio 5–9, Alto 10–14, Extremo 15–25.",
    "Cada orden de magnitud de FRR desplaza la frecuencia una categoría hacia E.",
    "FRR efectivo = FRR diseño × multiplicador(estado); <1 → sin crédito (aporta 1).",
    "Temporales: solo cuentan dentro de su vigencia y con estado DISPONIBLE/DEGRADADO.",
    "Brecha = niveles(riesgo actual) − niveles(riesgo de diseño); positiva = peor que el diseño.",
]


@router.get("/health", tags=["Sistema"])
def health() -> dict[str, str]:
    return {"estado": "ok", "version_motor": c.VERSION_MOTOR}


@router.post("/recalcular", response_model=RecalculoOut)
def recalcular(db: DbSession, p: Admin, datos: RecalcularIn | None = None) -> RecalculoOut:
    """Recálculo masivo manual (todos los escenarios) o de los ``escenario_ids`` indicados."""
    ids = datos.escenario_ids if datos else None
    motivo = "Recálculo masivo manual" if ids is None else "Recálculo manual selectivo"
    r = recalc.recalcular(db, ids, motivo, p.username)
    db.commit()
    return RecalculoOut(escenarios=r.escenarios, con_brecha=r.con_brecha, motivo=motivo, version_motor=c.VERSION_MOTOR)


@router.get("/auditoria", response_model=Pagina[AuditoriaOut])
def auditoria(
    db: DbSession, _: Usuario_, accion: str | None = None, entidad: str | None = None, usuario: str | None = None,
    page: int = Query(1, ge=1), size: int = Query(50, ge=1, le=500),
) -> Any:
    stmt = select(EventoAuditoria)
    if accion:
        stmt = stmt.where(EventoAuditoria.accion == accion)
    if entidad:
        stmt = stmt.where(EventoAuditoria.entidad == entidad)
    if usuario:
        stmt = stmt.where(EventoAuditoria.usuario == usuario)
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    items = db.scalars(stmt.order_by(EventoAuditoria.id.desc()).offset((page - 1) * size).limit(size)).all()
    return {"items": items, "total": total, "page": page, "size": size}


@router.get("/acciones", response_model=Pagina[AccionOut])
def acciones(
    db: DbSession, _: Usuario_, estado: str | None = Query(None, pattern="^(ABIERTA|CERRADA)$"),
    escenario_id: int | None = None, page: int = Query(1, ge=1), size: int = Query(50, ge=1, le=500),
) -> Any:
    stmt = select(Accion)
    if estado:
        stmt = stmt.where(Accion.estado == estado)
    if escenario_id:
        stmt = stmt.where(Accion.escenario_id == escenario_id)
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    items = db.scalars(stmt.order_by(Accion.id.desc()).offset((page - 1) * size).limit(size)).all()
    return {"items": items, "total": total, "page": page, "size": size}


@router.post("/acciones", response_model=AccionOut, status_code=201)
def crear_accion(datos: AccionIn, db: DbSession, p: Admin) -> Accion:
    a = Accion(**datos.model_dump(), origen="MANUAL")
    db.add(a)
    db.flush()
    registrar(db, p.username, "CREAR_ACCION", "accion", a.id, despues=datos.model_dump())
    db.commit()
    return a


@router.post("/acciones/{id_}/cerrar", response_model=AccionOut)
def cerrar_accion(id_: int, db: DbSession, p: Admin) -> Accion:
    a = db.get(Accion, id_)
    if a is None:
        raise no_encontrado("Acción", id_)
    a.estado, a.closed_at = "CERRADA", datetime.now(UTC)
    registrar(db, p.username, "CERRAR_ACCION", "accion", id_)
    db.commit()
    return a


def _empresa_id(db: DbSession) -> int:
    e = db.scalars(select(Empresa).order_by(Empresa.id)).first()
    if e is None:
        raise ErrorApi(404, "SIN_EMPRESA", "No hay empresas cargadas")
    return e.id


@router.get("/configuracion", response_model=ConfiguracionOut)
def configuracion(db: DbSession, _: Usuario_) -> ConfiguracionOut:
    eid = _empresa_id(db)
    cfg = recalc.cargar_config(db, eid)
    matriz = [CeldaMatrizIn(frecuencia=c.FRECUENCIAS[f], severidad=s, nivel=n)
              for (f, s), n in sorted(cfg.matriz.items())]
    return ConfiguracionOut(empresa_id=eid, version_motor=c.VERSION_MOTOR,
                            politica_estado=dict(cfg.multiplicadores), matriz=matriz, supuestos=SUPUESTOS)


@router.put("/configuracion/politica/{estado}", response_model=ConfiguracionOut)
def editar_politica(estado: Estado, datos: PoliticaIn, db: DbSession, p: Admin) -> ConfiguracionOut:
    """Edita el multiplicador de FRR de un estado y recalcula todo."""
    eid = _empresa_id(db)
    importer.asegurar_config_empresa(db, eid)
    db.flush()
    fila = db.scalars(select(PoliticaEstado).filter_by(empresa_id=eid, estado=estado)).one()
    antes = fila.multiplicador_frr
    fila.multiplicador_frr = datos.multiplicador_frr
    registrar(db, p.username, "EDITAR_POLITICA_ESTADO", "politica_estado", estado,
              antes={"multiplicador_frr": antes}, despues={"multiplicador_frr": datos.multiplicador_frr})
    db.flush()
    recalc.recalcular(db, None, f"Cambio de política de estado {estado}", p.username, auditar=False)
    db.commit()
    return configuracion(db, p)


@router.put("/configuracion/matriz", response_model=ConfiguracionOut)
def editar_matriz(celdas: list[CeldaMatrizIn], db: DbSession, p: Admin) -> ConfiguracionOut:
    """Edita celdas de la matriz de riesgo de la empresa y recalcula todo."""
    eid = _empresa_id(db)
    importer.asegurar_config_empresa(db, eid)
    db.flush()
    for ce in celdas:
        fila = db.scalars(select(MatrizRiesgo).filter_by(empresa_id=eid, frecuencia=ce.frecuencia, severidad=ce.severidad)).one()
        fila.nivel = ce.nivel
    registrar(db, p.username, "EDITAR_MATRIZ", "matriz_riesgo", eid, despues={"celdas": len(celdas)})
    db.flush()
    recalc.recalcular(db, None, "Cambio de matriz de riesgo", p.username, auditar=False)
    db.commit()
    return configuracion(db, p)
