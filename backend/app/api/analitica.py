from __future__ import annotations

from collections import defaultdict
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import func, select

from app.api.escenarios import _detalle_barreras, _fila
from app.config import get_settings
from app.domain.engine import constants as c
from app.errors import no_encontrado
from app.models import Accion, Barrera, EscenarioBarrera, EstadoBarreraHist
from app.schemas import (
    BarreraEscenarioOut,
    CeldaMapa,
    EscenarioPriorizado,
    ResultadoOut,
    ResumenDashboard,
)
from app.security import DbSession, Usuario_
from app.services import recalc
from app.services.queries import a_escenario_out, consulta_escenarios

router = APIRouter(tags=["Analítica"])


@router.get("/dashboard/resumen", response_model=ResumenDashboard)
def resumen(db: DbSession, _: Usuario_, site_id: int | None = None, unidad_id: int | None = None) -> ResumenDashboard:
    filas = db.execute(consulta_escenarios(site_id, unidad_id)).all()
    ids = [f[0].id for f in filas]
    barreras_estado: dict[str, int] = defaultdict(int)
    if ids:
        sub = select(EscenarioBarrera.barrera_id).where(EscenarioBarrera.escenario_id.in_(ids)).distinct()
        for estado, n in db.execute(
            select(Barrera.estado_actual, func.count()).where(Barrera.id.in_(sub)).group_by(Barrera.estado_actual)
        ):
            barreras_estado[estado] = n
    total_b = sum(barreras_estado.values())
    disp = barreras_estado.get("DISPONIBLE", 0)
    empresa_id = filas[0][6].id if filas else 0
    matriz = recalc.cargar_config(db, empresa_id).matriz
    diseno: dict[tuple[str, int], int] = defaultdict(int)
    actual: dict[tuple[str, int], int] = defaultdict(int)
    en_brecha = ae_actual = ae_diseno = 0
    prio: list[EscenarioPriorizado] = []
    for esc, r, _pg, nodo, uni, _s, _e in filas:
        if r is None:
            continue
        diseno[(r.frecuencia_diseno_resid, r.severidad)] += 1
        actual[(r.frecuencia_actual, r.severidad)] += 1
        ae_actual += r.riesgo_actual in ("Alto", "Extremo")
        ae_diseno += r.riesgo_diseno in ("Alto", "Extremo")
        if r.brecha > 0:
            en_brecha += 1
            prio.append(EscenarioPriorizado(
                escenario_id=esc.id, causa=esc.causa, unidad=uni.nombre, nodo=nodo.nombre,
                riesgo_diseno=r.riesgo_diseno, riesgo_actual=r.riesgo_actual, brecha=r.brecha,
                puntaje_actual=r.puntaje_actual))
    prio.sort(key=lambda x: (-x.brecha, -x.puntaje_actual))
    mapa = [
        CeldaMapa(frecuencia=f, severidad=s, nivel=matriz[(i, s)], diseno=diseno[(f, s)], actual=actual[(f, s)])
        for i, f in enumerate(c.FRECUENCIAS) for s in range(5, 0, -1)
    ]
    return ResumenDashboard(
        barreras_total=total_b, barreras_disponibles=disp,
        pct_barreras_disponibles=round(100 * disp / total_b, 1) if total_b else 100.0,
        barreras_por_estado=dict(barreras_estado), escenarios_total=len(filas),
        escenarios_en_brecha=en_brecha, escenarios_alto_extremo_actual=ae_actual,
        escenarios_alto_extremo_diseno=ae_diseno, mapa_calor=mapa, priorizados=prio[:10])


# ---------------------------------------------------------------- API 754 (aproximación)
AVISO_754 = "Aproximación MVP, validar con API RP 754 y política del cliente"
ESTADOS_NO_DISPONIBLE = ("DEGRADADO", "EN_MANTENIMIENTO", "FUERA_DE_SERVICIO")


class TemporalVencimiento(BaseModel):
    barrera_id: int
    tag_activo: str
    vigencia_hasta: str | None
    dias_restantes: int | None
    moc_ref: str | None


class TiempoBarrera(BaseModel):
    tag_activo: str
    horas: float
    estado_actual: str


class Tier3(BaseModel):
    barreras_fuera_de_servicio: int
    barreras_degradadas: int
    barreras_en_mantenimiento: int
    tiempo_acumulado_horas: float
    tiempo_por_barrera: list[TiempoBarrera]
    escenarios_con_brecha: int


class Tier4(BaseModel):
    pct_barreras_disponibles: float
    acciones_abiertas: int
    temporales_activas: int
    temporales_proximas_a_vencer: list[TemporalVencimiento]
    dias_alerta_vencimiento: int


class IndicadoresApi754(BaseModel):
    aviso: str
    tier3: Tier3
    tier4: Tier4


def horas_en_estado_no_disponible(
    db: Any, ahora: Any
) -> dict[int, float]:
    """Horas acumuladas por barrera en estados no disponibles, integrando el historial."""
    filas = db.execute(select(EstadoBarreraHist.barrera_id, EstadoBarreraHist.ts, EstadoBarreraHist.estado)
                       .order_by(EstadoBarreraHist.barrera_id, EstadoBarreraHist.ts)).all()
    horas: dict[int, float] = defaultdict(float)
    previo: dict[int, tuple[Any, str]] = {}
    for bid, ts, estado in filas:
        ts = ts if ts.tzinfo else ts.replace(tzinfo=ahora.tzinfo)
        if bid in previo:
            t0, e0 = previo[bid]
            if e0 in ESTADOS_NO_DISPONIBLE:
                horas[bid] += max((ts - t0).total_seconds(), 0) / 3600
        previo[bid] = (ts, estado)
    for bid, (t0, e0) in previo.items():
        if e0 in ESTADOS_NO_DISPONIBLE:
            horas[bid] += max((ahora - t0).total_seconds(), 0) / 3600
    return dict(horas)


@router.get("/indicadores/api754", response_model=IndicadoresApi754)
def api754(db: DbSession, _: Usuario_) -> IndicadoresApi754:
    ahora = recalc.ahora()
    hoy = ahora.date()
    cuentas = dict(db.execute(select(Barrera.estado_actual, func.count()).group_by(Barrera.estado_actual)).all())
    total = sum(cuentas.values())
    horas = horas_en_estado_no_disponible(db, ahora)
    barreras = {b.id: b for b in db.scalars(select(Barrera))}
    top = sorted(((barreras[i].tag_activo, h, barreras[i].estado_actual) for i, h in horas.items() if i in barreras),
                 key=lambda x: -x[1])[:8]
    en_brecha = db.scalar(
        select(func.count()).select_from(consulta_escenarios(solo_brecha=True).subquery())) or 0
    dias = get_settings().dias_alerta_vencimiento
    activas = 0
    proximas: list[TemporalVencimiento] = []
    for b in barreras.values():
        if b.tipo != "TEMPORAL":
            continue
        vigente = (b.vigencia_desde is None or b.vigencia_desde <= hoy) and (b.vigencia_hasta is None or b.vigencia_hasta >= hoy)
        if vigente:
            activas += 1
            restantes = (b.vigencia_hasta - hoy).days if b.vigencia_hasta else None
            if restantes is not None and restantes <= dias:
                proximas.append(TemporalVencimiento(
                    barrera_id=b.id, tag_activo=b.tag_activo, vigencia_hasta=b.vigencia_hasta.isoformat() if b.vigencia_hasta else None,
                    dias_restantes=restantes, moc_ref=b.moc_ref))
    abiertas = db.scalar(select(func.count()).select_from(Accion).where(Accion.estado == "ABIERTA")) or 0
    return IndicadoresApi754(
        aviso=AVISO_754,
        tier3=Tier3(
            barreras_fuera_de_servicio=cuentas.get("FUERA_DE_SERVICIO", 0),
            barreras_degradadas=cuentas.get("DEGRADADO", 0),
            barreras_en_mantenimiento=cuentas.get("EN_MANTENIMIENTO", 0),
            tiempo_acumulado_horas=round(sum(horas.values()), 1),
            tiempo_por_barrera=[TiempoBarrera(tag_activo=t, horas=round(h, 1), estado_actual=e) for t, h, e in top],
            escenarios_con_brecha=en_brecha),
        tier4=Tier4(
            pct_barreras_disponibles=round(100 * cuentas.get("DISPONIBLE", 0) / total, 1) if total else 100.0,
            acciones_abiertas=abiertas, temporales_activas=activas,
            temporales_proximas_a_vencer=sorted(proximas, key=lambda x: x.dias_restantes or 0),
            dias_alerta_vencimiento=dias))


# ---------------------------------------------------------------- BowTie
class ConsecuenciaBowTie(BaseModel):
    categoria: str
    nivel: int
    texto: str


class BowTieOut(BaseModel):
    escenario_id: int
    causa: str
    evento_tope: str
    consecuencia: str
    ruta: str
    preventivas: list[BarreraEscenarioOut]
    mitigativas: list[BarreraEscenarioOut]
    consecuencias: list[ConsecuenciaBowTie]
    resultado: ResultadoOut | None


@router.get("/bowtie/{escenario_id}", response_model=BowTieOut)
def bowtie(escenario_id: int, db: DbSession, _: Usuario_) -> BowTieOut:
    fila = _fila(db, escenario_id)
    if fila is None:  # pragma: no cover
        raise no_encontrado("Escenario", escenario_id)
    esc = a_escenario_out(fila)
    barreras = _detalle_barreras(db, escenario_id)
    cats = [("Personas", esc.imp_personas), ("Ambiente", esc.imp_ambiente),
            ("Económico", esc.imp_economico), ("Reputación", esc.imp_reputacion)]
    cons = [ConsecuenciaBowTie(categoria=n, nivel=v, texto=esc.consecuencia)
            for n, v in sorted(cats, key=lambda x: -x[1]) if v >= 3] or [
        ConsecuenciaBowTie(categoria="General", nivel=max(v for _, v in cats), texto=esc.consecuencia)]
    return BowTieOut(
        escenario_id=escenario_id, causa=esc.causa,
        evento_tope=f"{esc.palabra_guia} en {esc.nodo}",
        consecuencia=esc.consecuencia,
        ruta=f"{esc.site} / {esc.unidad} / {esc.nodo} / {esc.palabra_guia}",
        preventivas=[b for b in barreras if b.lado == "PREVENTIVA"],
        mitigativas=[b for b in barreras if b.lado == "MITIGATIVA"],
        consecuencias=cons, resultado=esc.resultado)

