"""Stubs documentados de conectores futuros (fuera del alcance del MVP)."""

from __future__ import annotations

from typing import Any

from app.connectors.base import BaseConnector, ResultadoNormalizacion


class _Stub(BaseConnector):
    def normalizar(self, payload: Any) -> ResultadoNormalizacion:
        raise NotImplementedError(f"Conector {self.nombre} no implementado en el MVP")


class RondasConnector(_Stub):
    """Rondas de operador (inspecciones de campo).

    Extensión: mapear hallazgos de ronda (p. ej. "válvula con fuga", "alarma inhibida") a
    EventoEstado(estado=DEGRADADO) con ``detalle`` = {ronda_id, operador, observación}.
    Modo sugerido: push por API o polling del sistema de rondas.
    """

    nombre = "RONDAS"
    descripcion = "Stub: rondas de operador"


class IowConnector(_Stub):
    """IOW (Integrity Operating Windows).

    Extensión: excursiones de variables fuera de la ventana operativa segura generan
    eventos de DEGRADADO sobre barreras asociadas (p. ej. protección de corrosión).
    Fuente típica: historiador de procesos (PI) vía tabla intermedia, no incluido.
    """

    nombre = "IOW"
    descripcion = "Stub: ventanas operativas de integridad"


class LmsConnector(_Stub):
    """LMS (gestión de capacitación/competencias).

    Extensión: la competencia vencida del operador responsable de una 'alarma con respuesta
    del operador' degrada esa barrera (DEGRADADO) hasta renovar la certificación.
    """

    nombre = "LMS"
    descripcion = "Stub: competencias de personal"


class SapPmConnector(_Stub):
    """SAP PM (mantenimiento real).

    Extensión: órdenes de trabajo/avisos -> EN_MANTENIMIENTO / FUERA_DE_SERVICIO usando el
    tag funcional como ``tag_activo``. Reemplaza al CMMS simulado sin cambiar el núcleo
    (BAPI/OData -> EventoEstado -> aplicar_eventos).
    """

    nombre = "SAP_PM"
    descripcion = "Stub: SAP PM"
