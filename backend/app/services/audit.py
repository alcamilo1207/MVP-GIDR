"""Auditoría: quién, qué, cuándo, antes/después."""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app.models import EventoAuditoria


def registrar(
    db: Session,
    usuario: str,
    accion: str,
    entidad: str,
    entidad_id: Any = None,
    antes: dict[str, Any] | None = None,
    despues: dict[str, Any] | None = None,
) -> EventoAuditoria:
    ev = EventoAuditoria(
        usuario=usuario,
        accion=accion,
        entidad=entidad,
        entidad_id=None if entidad_id is None else str(entidad_id),
        antes=antes,
        despues=despues,
    )
    db.add(ev)
    return ev
