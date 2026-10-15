"""Aplicación FastAPI de GIDR Módulo 4 (MVP). Documentación interactiva en /docs."""

from __future__ import annotations

import asyncio
import contextlib
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import analitica, auth, barreras, escenarios, integraciones, jerarquia, sistema
from app.config import get_settings
from app.db import SessionLocal
from app.errors import instalar_manejadores
from app.services import recalc

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
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in get_settings().cors_origenes.split(",")],
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)
instalar_manejadores(app)
for r in (auth.router, jerarquia.router, escenarios.router, barreras.router, integraciones.router,
          analitica.router, sistema.router):
    app.include_router(r)
