"""Errores consistentes y tipados: {"error": {"codigo", "mensaje", "detalle"}}."""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError
from starlette.exceptions import HTTPException as StarletteHTTPException


class CuerpoError(BaseModel):
    codigo: str
    mensaje: str
    detalle: Any | None = None


class RespuestaError(BaseModel):
    error: CuerpoError


class ErrorApi(Exception):
    def __init__(self, status: int, codigo: str, mensaje: str, detalle: Any | None = None):
        self.status, self.codigo, self.mensaje, self.detalle = status, codigo, mensaje, detalle


def _resp(status: int, codigo: str, mensaje: str, detalle: Any | None = None) -> JSONResponse:
    cuerpo = RespuestaError(error=CuerpoError(codigo=codigo, mensaje=mensaje, detalle=detalle))
    return JSONResponse(status_code=status, content=cuerpo.model_dump(mode="json"))


def instalar_manejadores(app: FastAPI) -> None:
    @app.exception_handler(ErrorApi)
    async def _api(_: Request, exc: ErrorApi) -> JSONResponse:
        return _resp(exc.status, exc.codigo, exc.mensaje, exc.detalle)

    @app.exception_handler(RequestValidationError)
    async def _val(_: Request, exc: RequestValidationError) -> JSONResponse:
        det = [{"campo": ".".join(str(x) for x in e["loc"][1:]), "mensaje": e["msg"]} for e in exc.errors()]
        return _resp(422, "VALIDACION", "Datos de entrada inválidos", det)

    @app.exception_handler(StarletteHTTPException)
    async def _http(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        return _resp(exc.status_code, f"HTTP_{exc.status_code}", str(exc.detail))

    @app.exception_handler(IntegrityError)
    async def _int(_: Request, exc: IntegrityError) -> JSONResponse:
        return _resp(409, "CONFLICTO", "Violación de integridad (duplicado o referencia inválida)")


def no_encontrado(entidad: str, id_: Any) -> ErrorApi:
    return ErrorApi(404, "NO_ENCONTRADO", f"{entidad} {id_} no existe")
