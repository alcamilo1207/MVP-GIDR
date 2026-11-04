"""Gestor de conexiones WebSocket en tiempo real y motor de evaluación de vínculos del Gemelo Digital."""

from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime
from typing import Any

from fastapi import WebSocket

log = logging.getLogger("gidr.realtime")


class GestorTiempoReal:
    """Administra suscriptores WebSocket (pantallas del frontend) y difunde eventos en vivo."""

    def __init__(self) -> None:
        self._clientes: set[WebSocket] = set()
        self._loop: asyncio.AbstractEventLoop | None = None
        self.ultimo_evento: dict[str, Any] | None = None

    async def conectar(self, ws: WebSocket) -> None:
        await ws.accept()
        self._loop = asyncio.get_running_loop()
        self._clientes.add(ws)
        await ws.send_json(
            {
                "tipo": "CONEXION_ESTABLECIDA",
                "ts": datetime.now(UTC).isoformat(),
                "clientes_activos": len(self._clientes),
                "ultimo_evento": self.ultimo_evento,
            }
        )

    def desconectar(self, ws: WebSocket) -> None:
        self._clientes.discard(ws)

    @property
    def clientes_activos(self) -> int:
        return len(self._clientes)

    async def difundir_async(self, payload: dict[str, Any]) -> None:
        self.ultimo_evento = payload
        if not self._clientes:
            return
        desconectados: list[WebSocket] = []
        for ws in list(self._clientes):
            try:
                await ws.send_json(payload)
            except Exception:  # noqa: BLE001
                desconectados.append(ws)
        for ws in desconectados:
            self._clientes.discard(ws)

    def difundir(self, payload: dict[str, Any]) -> None:
        """Envía un evento desde código síncrono o asíncrono sin bloquear si no hay clientes."""
        self.ultimo_evento = payload
        if not self._clientes:
            return
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(self.difundir_async(payload))
            return
        except RuntimeError:
            pass
        if self._loop and self._loop.is_running():
            asyncio.run_coroutine_threadsafe(self.difundir_async(payload), self._loop)


gestor_ws = GestorTiempoReal()


def evaluar_lectura_vinculo(
    tipo_evaluacion: str,
    valor: float | None,
    umbral_alerta: float | None = None,
    umbral_critico: float | None = None,
    estado_manual: str | None = None,
    degradacion_manual: int | None = None,
) -> tuple[str, int]:
    """Traduce una lectura cruda del Gemelo Digital (DCS, SIS, Historiador, CMMS)
    en ``(estado_barrera, factor_degradacion 1..100)``.
    """
    if estado_manual:
        deg = max(1, min(100, degradacion_manual if degradacion_manual is not None else 90))
        return estado_manual, deg

    v = float(valor if valor is not None else 0.0)

    if tipo_evaluacion == "ESTADO_DISCRETO":
        # 0 = DISPONIBLE, 1 = FUERA_DE_SERVICIO (Bypass SIS / Falla), 2 = EN_MANTENIMIENTO (OT CMMS), 3 = DEGRADADO (DCS Manual)
        codigo = int(round(v))
        if codigo <= 0:
            return "DISPONIBLE", 90
        if codigo == 1:
            return "FUERA_DE_SERVICIO", 100
        if codigo == 2:
            return "EN_MANTENIMIENTO", 90
        deg = max(1, min(100, degradacion_manual if degradacion_manual is not None else 75))
        return "DEGRADADO", deg

    if tipo_evaluacion == "UMBRAL_IOW":
        u_alerta = umbral_alerta if umbral_alerta is not None else 80.0
        u_crit = umbral_critico if umbral_critico is not None else 100.0
        if u_crit <= u_alerta:
            u_crit = u_alerta + 1.0
        if v < u_alerta:
            return "DISPONIBLE", 10
        if v >= u_crit:
            return "FUERA_DE_SERVICIO", 100
        # Escala proporcional de degradación entre umbral_alerta (15%) y umbral_critico (95%)
        frac = (v - u_alerta) / (u_crit - u_alerta)
        deg = int(round(15 + frac * 80))
        return "DEGRADADO", max(1, min(99, deg))

    # Por defecto: SALUD_DEGRADACION (v = % de degradación 0..100 emitido por el Gemelo Digital)
    if v <= 0:
        return "DISPONIBLE", 10
    if v >= 100:
        return "FUERA_DE_SERVICIO", 100
    deg = int(round(v))
    return "DEGRADADO", max(1, min(99, deg))
