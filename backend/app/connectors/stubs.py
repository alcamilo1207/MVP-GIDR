"""Stubs documentados de conectores futuros (fuera del alcance del MVP)."""

from __future__ import annotations

from typing import Any

from app.connectors.base import BaseConnector, EventoEstado, ResultadoNormalizacion
from app.services import recalc


class _Stub(BaseConnector):
    implementado = False

    def normalizar(self, payload: Any) -> ResultadoNormalizacion:
        raise NotImplementedError(f"Conector {self.nombre} no implementado en el MVP")


class GemeloDigitalConnector(BaseConnector):
    """Conector activo para Datos de Telemetría de Planta (telemetría híbrida continua y discreta)."""

    nombre = "GEMELO_DIGITAL"
    descripcion = "Datos de Telemetría de Planta: flujo en tiempo real (WebSocket / REST)"
    implementado = True

    def normalizar(self, payload: Any) -> ResultadoNormalizacion:
        res = ResultadoNormalizacion()
        for item in payload or []:
            res.eventos.append(
                EventoEstado(
                    tag_activo=str(item["tag_activo"]),
                    estado=str(item.get("estado", "DISPONIBLE")),
                    fuente=str(item.get("fuente", self.nombre)),
                    fecha=item.get("fecha") or recalc.ahora(),
                    detalle=item.get("detalle") or {},
                    factor_degradacion=item.get("factor_degradacion"),
                )
            )
        return res


class DcsScadaConnector(GemeloDigitalConnector):
    nombre = "DCS_SCADA"
    descripcion = "DCS / SCADA: modos de control (AUTO/MAN) y alarmas inhibidas"


class SisPlantaConnector(GemeloDigitalConnector):
    nombre = "SIS_PLANTA"
    descripcion = "SIS: llaves de inhibición (MOS / Bypass) y fallas de diagnóstico"


class HistoriadorIowConnector(GemeloDigitalConnector):
    nombre = "HISTORIADOR_IOW"
    descripcion = "Historiador de Procesos: excursiones IOW y degradación progresiva (1-100%)"


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
