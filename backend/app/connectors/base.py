"""Interfaz abstracta de conectores de datos de operación (``BaseConnector``).

Un conector convierte el payload nativo de un sistema fuente en una lista de
``EventoEstado`` canónicos. El núcleo (``services/cmms.py::aplicar_eventos``) solo conoce
el evento canónico: añadir Rondas, IOW, LMS o SAP PM no requiere tocar el núcleo.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, ClassVar


@dataclass
class EventoEstado:
    """Evento canónico de estado de barrera."""

    tag_activo: str
    estado: str
    fuente: str
    fecha: datetime
    detalle: dict[str, Any] = field(default_factory=dict)


@dataclass
class ErrorNormalizacion:
    fila: int
    mensaje: str


@dataclass
class ResultadoNormalizacion:
    eventos: list[EventoEstado] = field(default_factory=list)
    errores: list[ErrorNormalizacion] = field(default_factory=list)


class BaseConnector(ABC):
    """Contrato de un conector.

    Para implementar uno nuevo: heredar, definir ``nombre`` y ``normalizar`` y registrarlo en
    ``app.connectors.REGISTRO``. El modo de captura (push por API, carga de archivo o polling
    programado) lo decide cada conector; todos terminan en ``aplicar_eventos``.
    """

    nombre: ClassVar[str]
    descripcion: ClassVar[str] = ""

    @abstractmethod
    def normalizar(self, payload: Any) -> ResultadoNormalizacion:
        """Convierte el payload nativo en eventos canónicos (sin tocar la base de datos)."""
