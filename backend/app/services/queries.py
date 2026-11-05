"""Consultas compartidas (escenarios con último resultado, filtros por Site/Unidad)."""

from __future__ import annotations

from typing import Any

from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session

from app.domain.engine.core import ConfigMotor, indice_frecuencia, nivel_matriz
from app.models import (
    Empresa,
    Escenario,
    EscenarioBarrera,
    Nodo,
    PalabraGuia,
    ResultadoRiesgo,
    Site,
    Unidad,
)
from app.schemas import EscenarioOut, ResultadoOut, RiesgosPorImpactoOut

_CFG_DEFECTO = ConfigMotor()


def _latest_ids() -> Any:
    return select(func.max(ResultadoRiesgo.id)).group_by(ResultadoRiesgo.escenario_id).scalar_subquery()


def consulta_escenarios(
    site_id: int | None = None,
    unidad_id: int | None = None,
    nodo_id: int | None = None,
    riesgo_actual: str | None = None,
    solo_brecha: bool = False,
    q: str | None = None,
) -> Select[Any]:
    """SELECT (Escenario, ResultadoRiesgo|None, PalabraGuia, Nodo, Unidad, Site, Empresa)."""
    stmt: Any = (
        select(Escenario, ResultadoRiesgo, PalabraGuia, Nodo, Unidad, Site, Empresa)
        .join(PalabraGuia, Escenario.palabra_guia_id == PalabraGuia.id)
        .join(Nodo, PalabraGuia.nodo_id == Nodo.id)
        .join(Unidad, Nodo.unidad_id == Unidad.id)
        .join(Site, Unidad.site_id == Site.id)
        .join(Empresa, Site.empresa_id == Empresa.id)
        .outerjoin(
            ResultadoRiesgo,
            (ResultadoRiesgo.escenario_id == Escenario.id) & ResultadoRiesgo.id.in_(_latest_ids()),
        )
        .where(Escenario.activo.is_(True))
    )
    if site_id:
        stmt = stmt.where(Site.id == site_id)
    if unidad_id:
        stmt = stmt.where(Unidad.id == unidad_id)
    if nodo_id:
        stmt = stmt.where(Nodo.id == nodo_id)
    if riesgo_actual:
        stmt = stmt.where(ResultadoRiesgo.riesgo_actual == riesgo_actual)
    if solo_brecha:
        stmt = stmt.where(ResultadoRiesgo.brecha > 0)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(Escenario.causa.ilike(like) | Escenario.consecuencia.ilike(like))
    return stmt


def a_escenario_out(
    fila: Any, n_barreras: int = 0
) -> EscenarioOut:
    esc, res, pg, nodo, uni, site, emp = fila
    riesgo_diseno_imp = None
    riesgo_actual_imp = None
    if res is not None:
        idx_dis = indice_frecuencia(res.frecuencia_diseno_resid)
        idx_act = indice_frecuencia(res.frecuencia_actual)
        riesgo_diseno_imp = RiesgosPorImpactoOut(
            economico=nivel_matriz(_CFG_DEFECTO, idx_dis, esc.imp_economico),
            personas=nivel_matriz(_CFG_DEFECTO, idx_dis, esc.imp_personas),
            ambiente=nivel_matriz(_CFG_DEFECTO, idx_dis, esc.imp_ambiente),
            reputacion=nivel_matriz(_CFG_DEFECTO, idx_dis, esc.imp_reputacion),
        )
        riesgo_actual_imp = RiesgosPorImpactoOut(
            economico=nivel_matriz(_CFG_DEFECTO, idx_act, esc.imp_economico),
            personas=nivel_matriz(_CFG_DEFECTO, idx_act, esc.imp_personas),
            ambiente=nivel_matriz(_CFG_DEFECTO, idx_act, esc.imp_ambiente),
            reputacion=nivel_matriz(_CFG_DEFECTO, idx_act, esc.imp_reputacion),
        )
    return EscenarioOut(
        id=esc.id,
        empresa=emp.nombre,
        site_id=site.id,
        site=site.nombre,
        unidad_id=uni.id,
        unidad=uni.nombre,
        nodo_id=nodo.id,
        nodo=nodo.nombre,
        palabra_guia_id=pg.id,
        palabra_guia=pg.nombre,
        causa=esc.causa,
        peligro=esc.peligro or f"Peligro inherente en {nodo.nombre}: Presencia de fluidos y energía de proceso",
        evento_tope=esc.evento_tope or f"{pg.nombre} en {nodo.nombre} (Pérdida de contención)",
        recomendacion=esc.recomendacion,
        rec_prioridad=esc.rec_prioridad or "Medium",
        rec_responsable=esc.rec_responsable,
        rec_estado=esc.rec_estado or "Proposed",
        rec_comentarios=esc.rec_comentarios,
        frecuencia_diseno=esc.frecuencia_diseno,
        consecuencia=esc.consecuencia,
        imp_economico=esc.imp_economico,
        imp_personas=esc.imp_personas,
        imp_ambiente=esc.imp_ambiente,
        imp_reputacion=esc.imp_reputacion,
        version=esc.version,
        n_barreras=n_barreras,
        resultado=ResultadoOut.model_validate(res) if res is not None else None,
        riesgo_diseno_imp=riesgo_diseno_imp,
        riesgo_actual_imp=riesgo_actual_imp,
    )


def conteo_barreras(db: Session, ids: list[int]) -> dict[int, int]:
    if not ids:
        return {}
    rows = db.execute(
        select(EscenarioBarrera.escenario_id, func.count())
        .where(EscenarioBarrera.escenario_id.in_(ids))
        .group_by(EscenarioBarrera.escenario_id)
    )
    return {e: n for e, n in rows}
