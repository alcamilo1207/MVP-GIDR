"""Servicio de recálculo: conecta el motor puro con la base de datos."""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from datetime import UTC, date, datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.domain.engine import BarreraEntrada, ConfigMotor, Impactos, ResultadoMotor, evaluar_escenario
from app.domain.engine import constants as c
from app.models import (
    Accion,
    Barrera,
    Escenario,
    EscenarioBarrera,
    MatrizRiesgo,
    PalabraGuia,
    PoliticaEstado,
    ResultadoRiesgo,
    Nodo,
    Unidad,
    Site,
)
from app.services.audit import registrar


def ahora() -> datetime:
    return datetime.now(UTC)


def hoy() -> date:
    return ahora().date()


def cargar_config(db: Session, empresa_id: int) -> ConfigMotor:
    """Matriz y política por empresa; si no existen filas, se usan los valores por defecto."""
    filas = db.scalars(select(MatrizRiesgo).where(MatrizRiesgo.empresa_id == empresa_id)).all()
    matriz = c.matriz_defecto()
    for f in filas:
        matriz[(c.FRECUENCIAS.index(f.frecuencia), f.severidad)] = f.nivel
    mult = dict(c.MULTIPLICADORES_DEFECTO)
    for p in db.scalars(select(PoliticaEstado).where(PoliticaEstado.empresa_id == empresa_id)):
        mult[p.estado] = p.multiplicador_frr
    return ConfigMotor(matriz=matriz, multiplicadores=mult)


def empresa_de(esc: Escenario) -> int:
    return esc.palabra_guia.nodo.unidad.site.empresa_id


def entradas(esc: Escenario, override: Mapping[int, str] | None = None) -> list[BarreraEntrada]:
    override = override or {}
    return [
        BarreraEntrada(
            tag=v.barrera.tag_activo,
            tipo=v.barrera.tipo,
            frr_diseno=v.frr_diseno,
            estado=override.get(v.barrera_id, v.barrera.estado_actual),
            vigencia_desde=v.barrera.vigencia_desde,
            vigencia_hasta=v.barrera.vigencia_hasta,
            lado=v.lado,
        )
        for v in esc.barreras
    ]


def evaluar_db(
    esc: Escenario, config: ConfigMotor, override: Mapping[int, str] | None = None
) -> ResultadoMotor:
    return evaluar_escenario(
        esc.frecuencia_diseno,
        Impactos(esc.imp_economico, esc.imp_personas, esc.imp_ambiente, esc.imp_reputacion),
        entradas(esc, override),
        config,
        hoy(),
    )


def _query_escenarios():  # type: ignore[no-untyped-def]
    return select(Escenario).options(
        selectinload(Escenario.barreras).joinedload(EscenarioBarrera.barrera),
        joinedload(Escenario.palabra_guia)
        .joinedload(PalabraGuia.nodo)
        .joinedload(Nodo.unidad)
        .joinedload(Unidad.site),
    )


def ultimos_resultados(db: Session, ids: Iterable[int] | None = None) -> dict[int, ResultadoRiesgo]:
    sub = select(func.max(ResultadoRiesgo.id)).group_by(ResultadoRiesgo.escenario_id)
    q = select(ResultadoRiesgo).where(ResultadoRiesgo.id.in_(sub))
    if ids is not None:
        q = q.where(ResultadoRiesgo.escenario_id.in_(list(ids)))
    return {r.escenario_id: r for r in db.scalars(q)}


@dataclass
class ResumenRecalculo:
    escenarios: int
    con_brecha: int
    motivo: str


def _fila(esc: Escenario, r: ResultadoMotor, motivo: str) -> ResultadoRiesgo:
    return ResultadoRiesgo(
        escenario_id=esc.id,
        ts=ahora(),
        severidad=r.severidad,
        riesgo_inherente=r.riesgo_inherente,
        frr_diseno_total=r.frr_diseno_total,
        frecuencia_diseno_resid=r.frecuencia_diseno_resid,
        riesgo_diseno=r.riesgo_diseno,
        frecuencia_actual=r.frecuencia_actual,
        frr_actual_total=r.frr_actual_total,
        riesgo_actual=r.riesgo_actual,
        puntaje_diseno=r.puntaje_diseno,
        puntaje_actual=r.puntaje_actual,
        brecha=r.brecha,
        escenario_version=esc.version,
        motivo=motivo[:200],
        version_motor=r.version_motor,
    )


def recalcular(
    db: Session,
    escenario_ids: Iterable[int] | None,
    motivo: str,
    usuario: str = "sistema",
    auditar: bool = True,
) -> ResumenRecalculo:
    """Recalcula (y persiste como historial) los escenarios indicados, o todos si es None.

    Disparadores: cambio de estado de barrera, alta/vencimiento de temporal, nueva versión
    de escenario y recálculo masivo manual (todos llaman a esta función).
    """
    q = _query_escenarios().where(Escenario.activo.is_(True))
    if escenario_ids is not None:
        q = q.where(Escenario.id.in_(list(escenario_ids)))
    escenarios = db.scalars(q).unique().all()
    configs: dict[int, ConfigMotor] = {}
    con_brecha = 0
    for esc in escenarios:
        eid = empresa_de(esc)
        cfg = configs.setdefault(eid, cargar_config(db, eid))
        res = evaluar_db(esc, cfg)
        db.add(_fila(esc, res, motivo))
        if res.brecha > 0:
            con_brecha += 1
        _sincronizar_acciones(db, esc, res)
    if auditar:
        registrar(
            db, usuario, "RECALCULO", "escenario",
            despues={"motivo": motivo, "escenarios": len(escenarios), "con_brecha": con_brecha},
        )
    db.flush()
    return ResumenRecalculo(len(escenarios), con_brecha, motivo)


def _sincronizar_acciones(db: Session, esc: Escenario, res: ResultadoMotor) -> None:
    """Acciones automáticas: se abre una si hay brecha y se cierra cuando desaparece."""
    abierta = db.scalars(
        select(Accion).where(
            Accion.escenario_id == esc.id, Accion.origen == "AUTO", Accion.estado == "ABIERTA"
        )
    ).first()
    if res.brecha > 0 and abierta is None:
        degradadas = [d.tag for d in res.barreras if d.frr_efectivo < d.frr_diseno and d.cuenta_en_diseno]
        db.add(
            Accion(
                escenario_id=esc.id,
                descripcion="Restablecer barreras afectadas o definir medida compensatoria (MOC): "
                + (", ".join(degradadas) or "revisar escenario"),
                origen="AUTO",
            )
        )
    elif res.brecha <= 0 and abierta is not None:
        abierta.estado = "CERRADA"
        abierta.closed_at = ahora()


def escenarios_de_barrera(db: Session, barrera_id: int) -> list[int]:
    return list(
        db.scalars(select(EscenarioBarrera.escenario_id).where(EscenarioBarrera.barrera_id == barrera_id))
    )


def simular_cambio_estado(db: Session, barrera: Barrera, nuevo_estado: str) -> list[dict[str, object]]:
    """Impacto de cambiar el estado de ``barrera`` sin persistir nada (dry-run)."""
    ids = escenarios_de_barrera(db, barrera.id)
    if not ids:
        return []
    escenarios = db.scalars(_query_escenarios().where(Escenario.id.in_(ids))).unique().all()
    previos = ultimos_resultados(db, ids)
    configs: dict[int, ConfigMotor] = {}
    salida: list[dict[str, object]] = []
    for esc in escenarios:
        eid = empresa_de(esc)
        cfg = configs.setdefault(eid, cargar_config(db, eid))
        despues = evaluar_db(esc, cfg, {barrera.id: nuevo_estado})
        antes = previos.get(esc.id)
        salida.append(
            {
                "escenario_id": esc.id,
                "causa": esc.causa,
                "antes": _snap_db(antes) if antes else None,
                "despues": _snap_motor(despues),
            }
        )
    salida.sort(key=lambda x: -int(x["despues"]["brecha"]))  # type: ignore[index]
    return salida


def _snap_db(r: ResultadoRiesgo) -> dict[str, object]:
    return {
        "riesgo_diseno": r.riesgo_diseno,
        "riesgo_actual": r.riesgo_actual,
        "frecuencia_actual": r.frecuencia_actual,
        "frr_actual_total": r.frr_actual_total,
        "brecha": r.brecha,
    }


def _snap_motor(r: ResultadoMotor) -> dict[str, object]:
    return {
        "riesgo_diseno": r.riesgo_diseno,
        "riesgo_actual": r.riesgo_actual,
        "frecuencia_actual": r.frecuencia_actual,
        "frr_actual_total": r.frr_actual_total,
        "brecha": r.brecha,
    }


def snap_db(r: ResultadoRiesgo) -> dict[str, object]:
    return _snap_db(r)


def barrera_ids_temporales(db: Session) -> list[int]:
    return list(db.scalars(select(Barrera.id).where(Barrera.tipo == "TEMPORAL")))


def recalcular_por_temporales(db: Session, usuario: str = "sistema") -> ResumenRecalculo:
    """Chequeo periódico de alta/vencimiento de temporales: recalcula solo los escenarios
    vinculados a temporales cuyo resultado vigente difiere del que daría hoy el motor."""
    ids = set(
        db.scalars(
            select(EscenarioBarrera.escenario_id)
            .join(Barrera)
            .where(Barrera.tipo == "TEMPORAL")
        )
    )
    if not ids:
        return ResumenRecalculo(0, 0, "temporales")
    escenarios = db.scalars(_query_escenarios().where(Escenario.id.in_(ids))).unique().all()
    previos = ultimos_resultados(db, ids)
    cambiados: list[int] = []
    configs: dict[int, ConfigMotor] = {}
    for esc in escenarios:
        eid = empresa_de(esc)
        cfg = configs.setdefault(eid, cargar_config(db, eid))
        res = evaluar_db(esc, cfg)
        prev = previos.get(esc.id)
        if prev is None or prev.frr_actual_total != res.frr_actual_total:
            cambiados.append(esc.id)
    if not cambiados:
        return ResumenRecalculo(0, 0, "temporales")
    return recalcular(db, cambiados, "Vencimiento/alta de barrera temporal", usuario)
