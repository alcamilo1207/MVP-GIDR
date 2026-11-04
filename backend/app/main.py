"""Aplicación FastAPI de GIDR Módulo 4 (MVP). Documentación interactiva en /docs."""

from __future__ import annotations

import asyncio
import contextlib
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app.api import analitica, auth, barreras, escenarios, integraciones, jerarquia, sistema
from app.config import get_settings
from app.db import SessionLocal
from app.errors import instalar_manejadores
from app.schemas import LecturaTelemetriaIn
from app.services import recalc
from app.services.realtime import gestor_ws

log = logging.getLogger("gidr")


async def _vigilar_temporales(minutos: int) -> None:
    """Disparador periódico: alta/vencimiento de barreras temporales."""
    while True:
        await asyncio.sleep(minutos * 60)
        try:
            with SessionLocal() as db:
                r = recalc.recalcular_por_temporales(db)
                db.commit()
                if r.escenarios:
                    log.info("Recalculo por temporales: %s escenarios", r.escenarios)
        except Exception:  # noqa: BLE001
            log.exception("Fallo en vigilancia de temporales")


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    s = get_settings()
    tarea = None
    if s.auto_seed:
        from app.seed import sembrar

        with SessionLocal() as db:
            log.info(sembrar(db))
    if s.minutos_chequeo_temporales > 0:
        tarea = asyncio.create_task(_vigilar_temporales(s.minutos_chequeo_temporales))
    yield
    if tarea:
        tarea.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await tarea


app = FastAPI(
    title="GIDR · Módulo 4 — HUB de integración de riesgo",
    version="0.1.0",
    description=(
        "MVP: combina un HAZOP semicuantitativo con el estado de barreras (CMMS) para calcular el riesgo "
        "actual y su brecha frente al riesgo de diseño. **Apoyo a la decisión: no sustituye al sistema "
        "instrumentado de seguridad ni al juicio de ingeniería.** Datos de demo ficticios."
    ),
    lifespan=lifespan,
)

_cors_origenes = [o.strip() for o in get_settings().cors_origenes.split(",") if o.strip()]
_es_asterisco = "*" in _cors_origenes

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if _es_asterisco else _cors_origenes,
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=not _es_asterisco,
)
instalar_manejadores(app)
for r in (auth.router, jerarquia.router, escenarios.router, barreras.router, integraciones.router,
          analitica.router, sistema.router):
    app.include_router(r)


@app.websocket("/ws/eventos")
async def ws_eventos(ws: WebSocket) -> None:
    """Canal WebSocket en tiempo real hacia todas las pantallas del frontend (Escenarios PHA, BowTie, Dashboard)."""
    await gestor_ws.conectar(ws)
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        gestor_ws.desconectar(ws)
    except Exception:  # noqa: BLE001
        gestor_ws.desconectar(ws)


@app.websocket("/ws/gemelo")
async def ws_gemelo(ws: WebSocket) -> None:
    """Canal WebSocket de ingesta directa para un Gemelo Digital externo en tiempo real.
    Acepta mensajes JSON: ``{"lecturas": [{"tag_gemelo": "...", "valor": 95.0}]}``.
    """
    await ws.accept()
    try:
        while True:
            data = await ws.receive_json()
            raw_list = data.get("lecturas", [data] if isinstance(data, dict) else [])
            lecturas = [LecturaTelemetriaIn(**item) for item in raw_list]
            with SessionLocal() as db:
                res = integraciones.procesar_lecturas_gemelo(db, lecturas, usuario="gemelo_ws")
            await ws.send_json(res.model_dump())
    except WebSocketDisconnect:
        pass
    except Exception as exc:  # noqa: BLE001
        log.warning("Conexión WS gemelo cerrada: %s", exc)

