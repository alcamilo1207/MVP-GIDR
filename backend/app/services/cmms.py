"""Núcleo de aplicación de eventos de estado de barreras (independiente del conector)."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.connectors.base import EventoEstado
from app.models import Barrera, EstadoBarreraHist
from app.services import recalc
from app.services.audit import registrar


@dataclass
class CambioEstado:
    tag_activo: str
    antes: str
    despues: str
    escenarios_afectados: int


@dataclass
class ResultadoIngesta:
    recibidos: int = 0
    aceptados: int = 0
    duplicados: int = 0
    cambios_estado: list[CambioEstado] = field(default_factory=list)
    no_mapeados: list[str] = field(default_factory=list)
    errores: list[dict[str, Any]] = field(default_factory=list)
    escenarios_recalculados: int = 0


def _utc(dt: datetime) -> datetime:
    from datetime import UTC

    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


def aplicar_eventos(
    db: Session, eventos: list[EventoEstado], usuario: str = "sistema"
) -> ResultadoIngesta:
    """Registra en historial, actualiza ``barrera.estado_actual`` (solo si el evento es más
    reciente que el último conocido) y recalcula únicamente los escenarios vinculados."""
    res = ResultadoIngesta(recibidos=len(eventos))
    afectados: set[int] = set()
    no_map: dict[str, None] = {}
    for ev in sorted(eventos, key=lambda e: _utc(e.fecha)):
        barrera = db.scalars(select(Barrera).where(Barrera.tag_activo == ev.tag_activo)).first()
        if barrera is None:
            no_map.setdefault(ev.tag_activo)
            continue
        ts = _utc(ev.fecha)
        dup = db.scalars(
            select(EstadoBarreraHist.id).where(
                EstadoBarreraHist.barrera_id == barrera.id,
                EstadoBarreraHist.ts == ts,
                EstadoBarreraHist.estado == ev.estado,
            )
        ).first()
        if dup is not None:
            res.duplicados += 1
            continue
        db.add(EstadoBarreraHist(barrera_id=barrera.id, ts=ts, estado=ev.estado, fuente=ev.fuente, detalle=ev.detalle))
        res.aceptados += 1
        ultimo = barrera.estado_actualizado
        if ultimo is None or ts >= _utc(ultimo):
            anterior = barrera.estado_actual
            barrera.estado_actual = ev.estado
            barrera.estado_actualizado = ts
            if anterior != ev.estado:
                ids = recalc.escenarios_de_barrera(db, barrera.id)
                afectados.update(ids)
                res.cambios_estado.append(CambioEstado(barrera.tag_activo, anterior, ev.estado, len(ids)))
                registrar(
                    db, usuario, "CAMBIO_ESTADO_BARRERA", "barrera", barrera.id,
                    antes={"estado": anterior}, despues={"estado": ev.estado, "fuente": ev.fuente, "detalle": ev.detalle},
                )
        db.flush()
    res.no_mapeados = list(no_map)
    if afectados:
        rr = recalc.recalcular(db, afectados, "Cambio de estado de barrera", usuario)
        res.escenarios_recalculados = rr.escenarios
    registrar(
        db, usuario, "INGESTA_CMMS", "barrera",
        despues={"recibidos": res.recibidos, "aceptados": res.aceptados, "no_mapeados": res.no_mapeados,
                 "escenarios_recalculados": res.escenarios_recalculados},
    )
    return res
