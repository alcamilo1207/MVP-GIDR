from __future__ import annotations

from collections import defaultdict
from datetime import timedelta
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import func, select

from app.api.escenarios import _detalle_barreras, _fila
from app.config import get_settings
from app.domain.engine import constants as c
from app.errors import no_encontrado
from app.models import (
    Accion,
    Barrera,
    ControlFactorEscalamiento,
    Escenario,
    EscenarioBarrera,
    EstadoBarreraHist,
    FactorEscalamiento,
    PalabraGuia,
)
from app.schemas import (
    BarreraEscenarioOut,
    BowTieCompletoOut,
    BowTieGuardarIn,
    CeldaMapa,
    ConsecuenciaBowTie,
    ControlFactorOut,
    EscenarioPriorizado,
    FactorEscalamientoOut,
    ResultadoOut,
    ResumenDashboard,
)
from app.security import Admin, DbSession, Usuario_
from app.services import recalc
from app.services.audit import registrar
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


# ---------------------------------------------------------------- BowTie (Metodología 8 Bloques)
def _obtener_factores_escalamiento(db: DbSession, escenario_id: int) -> list[FactorEscalamientoOut]:
    factores = db.scalars(
        select(FactorEscalamiento).where(FactorEscalamiento.escenario_id == escenario_id)
    ).all()
    resultado = []
    for f in factores:
        eb = db.get(EscenarioBarrera, f.escenario_barrera_id)
        tag = eb.barrera.tag_activo if eb and eb.barrera else "BARRERA"
        controles_out = [
            ControlFactorOut(
                id=c.id,
                factor_escalamiento_id=c.factor_escalamiento_id,
                descripcion=c.descripcion,
                tag_activo=c.tag_activo,
                estado_actual=c.estado_actual,
            )
            for c in f.controles
        ]
        resultado.append(
            FactorEscalamientoOut(
                id=f.id,
                escenario_id=f.escenario_id,
                escenario_barrera_id=f.escenario_barrera_id,
                barrera_tag=tag,
                descripcion=f.descripcion,
                categoria=f.categoria,
                controles=controles_out,
            )
        )
    return resultado


@router.get("/bowtie/{escenario_id}", response_model=BowTieCompletoOut)
def bowtie(escenario_id: int, db: DbSession, _: Usuario_) -> BowTieCompletoOut:
    fila = _fila(db, escenario_id)
    if fila is None:  # pragma: no cover
        raise no_encontrado("Escenario", escenario_id)
    esc_modelo: Escenario = fila[0]
    esc = a_escenario_out(fila)
    barreras = _detalle_barreras(db, escenario_id)
    cats = [
        ("Personas", esc.imp_personas),
        ("Ambiente", esc.imp_ambiente),
        ("Económico", esc.imp_economico),
        ("Reputación", esc.imp_reputacion),
    ]
    cons = [
        ConsecuenciaBowTie(categoria=n, nivel=v, texto=esc.consecuencia)
        for n, v in sorted(cats, key=lambda x: -x[1])
        if v >= 3
    ] or [ConsecuenciaBowTie(categoria="General", nivel=max(v for _, v in cats), texto=esc.consecuencia)]

    peligro = esc_modelo.peligro or f"Peligro inherente en {esc.nodo}: Presencia de fluidos y energía de proceso"
    evento_tope = esc_modelo.evento_tope or f"{esc.palabra_guia} en {esc.nodo} (Pérdida de contención)"
    factores = _obtener_factores_escalamiento(db, escenario_id)

    return BowTieCompletoOut(
        escenario_id=escenario_id,
        peligro=peligro,
        evento_tope=evento_tope,
        causa=esc.causa,
        frecuencia_diseno=esc.frecuencia_diseno,
        consecuencia=esc.consecuencia,
        ruta=f"{esc.site} / {esc.unidad} / {esc.nodo} / {esc.palabra_guia}",
        imp_economico=esc.imp_economico,
        imp_personas=esc.imp_personas,
        imp_ambiente=esc.imp_ambiente,
        imp_reputacion=esc.imp_reputacion,
        preventivas=[b for b in barreras if b.lado == "PREVENTIVA"],
        mitigativas=[b for b in barreras if b.lado == "MITIGATIVA"],
        consecuencias=cons,
        factores_escalamiento=factores,
        resultado=esc.resultado,
        layout=esc_modelo.bowtie_layout,
    )


@router.put("/bowtie/{escenario_id}", response_model=BowTieCompletoOut)
def guardar_bowtie(
    escenario_id: int, datos: BowTieGuardarIn, db: DbSession, p: Admin
) -> BowTieCompletoOut:
    """Actualiza interactivamente los bloques del BowTie:

    Causa, Peligro, Evento Tope, Consecuencia, Impactos, Barreras (FRR, Lado, Estado),
    Factores de Escalamiento y Controles.
    """
    esc: Escenario | None = db.get(Escenario, escenario_id)
    if esc is None:
        raise no_encontrado("Escenario", escenario_id)

    antes = {
        "causa": esc.causa,
        "peligro": esc.peligro,
        "evento_tope": esc.evento_tope,
        "frecuencia_diseno": esc.frecuencia_diseno,
        "consecuencia": esc.consecuencia,
        "imp_economico": esc.imp_economico,
        "imp_personas": esc.imp_personas,
        "imp_ambiente": esc.imp_ambiente,
        "imp_reputacion": esc.imp_reputacion,
    }

    # 1. Actualizar atributos de escenario (Desviación, Amenaza, Peligro, Evento Tope, Consecuencia)
    if datos.palabra_guia and datos.palabra_guia.strip():
        pg_actual = db.get(PalabraGuia, esc.palabra_guia_id)
        if pg_actual and pg_actual.nombre != datos.palabra_guia.strip():
            pg_existente = db.scalars(
                select(PalabraGuia).where(
                    PalabraGuia.nodo_id == pg_actual.nodo_id,
                    PalabraGuia.nombre == datos.palabra_guia.strip(),
                )
            ).first()
            if pg_existente:
                esc.palabra_guia_id = pg_existente.id
            else:
                nueva_pg = PalabraGuia(nodo_id=pg_actual.nodo_id, nombre=datos.palabra_guia.strip())
                db.add(nueva_pg)
                db.flush()
                esc.palabra_guia_id = nueva_pg.id

    esc.causa = datos.causa
    esc.peligro = datos.peligro
    esc.evento_tope = datos.evento_tope
    esc.frecuencia_diseno = datos.frecuencia_diseno
    esc.consecuencia = datos.consecuencia
    esc.imp_economico = datos.imp_economico
    esc.imp_personas = datos.imp_personas
    esc.imp_ambiente = datos.imp_ambiente
    esc.imp_reputacion = datos.imp_reputacion
    if datos.layout is not None:
        esc.bowtie_layout = datos.layout
    esc.version += 1

    # 2. Sincronizar barreras
    empresa_id = recalc.empresa_de(esc)
    existentes_eb = {
        eb.barrera.tag_activo: eb
        for eb in db.scalars(
            select(EscenarioBarrera)
            .where(EscenarioBarrera.escenario_id == escenario_id)
        ).all()
    }
    tags_enviados = set()
    mapa_tag_a_eb_id: dict[str, int] = {}

    for b_in in datos.barreras:
        tags_enviados.add(b_in.tag_activo)
        # Buscar o crear entidad Barrera en la empresa
        barrera = db.scalars(
            select(Barrera).where(
                Barrera.empresa_id == empresa_id,
                Barrera.tag_activo == b_in.tag_activo,
            )
        ).first()

        vig_desde = b_in.vigencia_desde
        vig_hasta = b_in.vigencia_hasta
        moc_ref = b_in.moc_ref
        if b_in.tipo == "TEMPORAL":
            vig_desde = vig_desde or recalc.hoy()
            vig_hasta = vig_hasta or (recalc.hoy() + timedelta(days=30))
            moc_ref = moc_ref or "MOC-PHA-TEMP"

        if barrera is None:
            barrera = Barrera(
                empresa_id=empresa_id,
                tag_activo=b_in.tag_activo,
                descripcion=b_in.descripcion,
                tipo=b_in.tipo,
                vigencia_desde=vig_desde,
                vigencia_hasta=vig_hasta,
                moc_ref=moc_ref,
                estado_actual=b_in.estado_actual,
                factor_degradacion=b_in.factor_degradacion,
                estado_actualizado=recalc.ahora(),
            )
            db.add(barrera)
            db.flush()
            db.add(
                EstadoBarreraHist(
                    barrera_id=barrera.id,
                    ts=recalc.ahora(),
                    estado=b_in.estado_actual,
                    fuente="BOWTIE_PHA_EDITOR",
                    detalle={"nota": "Creada desde editor PHA/BowTie", "factor_degradacion": b_in.factor_degradacion},
                )
            )
        else:
            barrera.descripcion = b_in.descripcion
            barrera.tipo = b_in.tipo
            barrera.factor_degradacion = b_in.factor_degradacion
            if b_in.tipo == "TEMPORAL":
                barrera.vigencia_desde = vig_desde
                barrera.vigencia_hasta = vig_hasta
                barrera.moc_ref = moc_ref
            if barrera.estado_actual != b_in.estado_actual:
                ant_est = barrera.estado_actual
                barrera.estado_actual = b_in.estado_actual
                barrera.estado_actualizado = recalc.ahora()
                db.add(
                    EstadoBarreraHist(
                        barrera_id=barrera.id,
                        ts=recalc.ahora(),
                        estado=b_in.estado_actual,
                        fuente="BOWTIE_PHA_EDITOR",
                        detalle={"antes": ant_est, "factor_degradacion": b_in.factor_degradacion},
                    )
                )

        # Vincular en EscenarioBarrera
        eb = existentes_eb.get(b_in.tag_activo)
        if eb is None:
            eb = EscenarioBarrera(
                escenario_id=escenario_id,
                barrera_id=barrera.id,
                frr_diseno=b_in.frr_diseno,
                lado=b_in.lado,
            )
            db.add(eb)
            db.flush()
        else:
            eb.frr_diseno = b_in.frr_diseno
            eb.lado = b_in.lado
            db.flush()
        mapa_tag_a_eb_id[b_in.tag_activo] = eb.id

    # Eliminar barreras que se removieron del diagrama
    for tag_ant, eb_ant in existentes_eb.items():
        if tag_ant not in tags_enviados:
            db.delete(eb_ant)
    db.flush()

    # 3. Sincronizar Factores de Escalamiento y Controles
    # Limpiamos factores previos de este escenario y recreamos los enviados
    db.execute(
        select(FactorEscalamiento).where(FactorEscalamiento.escenario_id == escenario_id)
    )
    factores_antiguos = db.scalars(
        select(FactorEscalamiento).where(FactorEscalamiento.escenario_id == escenario_id)
    ).all()
    for fa in factores_antiguos:
        db.delete(fa)
    db.flush()

    for fe_in in datos.factores_escalamiento:
        eb_id = mapa_tag_a_eb_id.get(fe_in.barrera_tag)
        if not eb_id:
            continue
        fe = FactorEscalamiento(
            escenario_id=escenario_id,
            escenario_barrera_id=eb_id,
            descripcion=fe_in.descripcion,
            categoria=fe_in.categoria,
        )
        db.add(fe)
        db.flush()
        for c_in in fe_in.controles:
            c = ControlFactorEscalamiento(
                factor_escalamiento_id=fe.id,
                descripcion=c_in.descripcion,
                tag_activo=c_in.tag_activo,
                estado_actual=c_in.estado_actual,
            )
            db.add(c)
    db.flush()

    # 4. Disparar recálculo de riesgo automático
    recalc.recalcular(
        db, [escenario_id], "Actualización de bloques BowTie interactivo", p.username, auditar=False
    )
    registrar(
        db,
        p.username,
        "EDITAR_BOWTIE",
        "escenario",
        escenario_id,
        antes=antes,
        despues={
            "causa": esc.causa,
            "barreras_total": len(datos.barreras),
            "factores_total": len(datos.factores_escalamiento),
        },
    )
    db.commit()

    return bowtie(escenario_id, db, p)

