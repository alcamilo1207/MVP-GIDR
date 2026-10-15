from __future__ import annotations

from typing import Any

from fastapi import APIRouter, File, Query, UploadFile
from fastapi.responses import Response

from app.connectors import REGISTRO
from app.connectors.base import ResultadoNormalizacion
from app.connectors.cmms_sim import CmmsSimuladoConnector, csv_ejemplo
from app.errors import ErrorApi
from app.schemas import (
    CambioEstadoIngesta,
    ErrorFilaOut,
    EventosCmmsIn,
    ImportacionOut,
    IngestaOut,
)
from app.security import Admin, DbSession, Usuario_
from app.services import cmms, importer

router = APIRouter(prefix="/integraciones", tags=["Integraciones"])
MAX_BYTES = 10 * 1024 * 1024


async def _leer(archivo: UploadFile) -> bytes:
    contenido = await archivo.read()
    if len(contenido) > MAX_BYTES:
        raise ErrorApi(413, "ARCHIVO_GRANDE", "El archivo supera 10 MB")
    if not contenido:
        raise ErrorApi(400, "ARCHIVO_VACIO", "El archivo está vacío")
    return contenido


@router.post("/hazop/importar", response_model=ImportacionOut)
async def importar_hazop(db: DbSession, p: Admin, archivo: UploadFile = File(...)) -> Any:
    """Importa HAZOP semicuantitativo (.xlsx/.csv). Idempotente; errores reportados por fila."""
    contenido = await _leer(archivo)
    filas = importer.leer_tabla(contenido, archivo.filename or "")
    faltantes = [e for e, k, o in importer.COLUMNAS if o and filas and k not in filas[0]]
    if faltantes:
        raise ErrorApi(422, "COLUMNAS_FALTANTES", "Faltan columnas obligatorias", faltantes)
    res = importer.importar_hazop(db, filas, p.username)
    db.commit()
    return ImportacionOut(
        filas_totales=res.filas_totales, filas_aceptadas=res.filas_aceptadas,
        errores=[ErrorFilaOut(fila=e.fila, campo=e.campo, mensaje=e.mensaje) for e in res.errores],
        escenarios_creados=res.escenarios_creados, escenarios_actualizados=res.escenarios_actualizados,
        escenarios_sin_cambios=res.escenarios_sin_cambios, barreras_creadas=res.barreras_creadas,
        vinculos_creados=res.vinculos_creados, escenarios_recalculados=res.escenarios_recalculados)


@router.get("/hazop/plantilla")
def plantilla(_: Usuario_, formato: str = Query("xlsx", pattern="^(xlsx|csv)$")) -> Response:
    if formato == "csv":
        return Response(importer.plantilla_csv(), media_type="text/csv; charset=utf-8",
                        headers={"Content-Disposition": 'attachment; filename="plantilla_hazop.csv"'})
    return Response(
        importer.plantilla_xlsx(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="plantilla_hazop.xlsx"'})


def _ingestar(db: DbSession, norm: ResultadoNormalizacion, usuario: str) -> IngestaOut:
    res = cmms.aplicar_eventos(db, norm.eventos, usuario)
    db.commit()
    errores = [ErrorFilaOut(fila=e.fila, campo=None, mensaje=e.mensaje) for e in norm.errores]
    return IngestaOut(
        recibidos=res.recibidos + len(norm.errores), aceptados=res.aceptados, duplicados=res.duplicados,
        cambios_estado=[CambioEstadoIngesta(**c.__dict__) for c in res.cambios_estado],
        no_mapeados=res.no_mapeados, errores=errores, escenarios_recalculados=res.escenarios_recalculados)


@router.post("/cmms/estado-barreras", response_model=IngestaOut)
def cmms_estado_barreras(datos: EventosCmmsIn, db: DbSession, p: Admin) -> IngestaOut:
    """Conector CMMS simulado (push JSON). Normaliza a evento canónico, actualiza
    ``barrera.estado_actual``, inserta en ``estado_barrera_hist`` y recalcula."""
    norm = CmmsSimuladoConnector().normalizar([e.model_dump() for e in datos.eventos])
    return _ingestar(db, norm, p.username)


@router.post("/cmms/csv", response_model=IngestaOut)
async def cmms_csv(db: DbSession, p: Admin, archivo: UploadFile = File(...)) -> IngestaOut:
    """Carga CSV (tag_activo, estado, fuente, fecha, detalle) del CMMS simulado."""
    contenido = await _leer(archivo)
    try:
        norm = CmmsSimuladoConnector().normalizar_csv(contenido)
    except UnicodeDecodeError as exc:
        raise ErrorApi(400, "ARCHIVO_ILEGIBLE", "El CSV debe estar codificado en UTF-8") from exc
    return _ingestar(db, norm, p.username)


@router.get("/cmms/ejemplo")
def cmms_ejemplo(_: Usuario_) -> Response:
    """CSV de ejemplo (fechas relativas a hoy) que produce brechas visibles en el seed."""
    return Response(csv_ejemplo(), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": 'attachment; filename="cmms_ejemplo.csv"'})


@router.get("/conectores")
def conectores(_: Usuario_) -> list[dict[str, Any]]:
    return [{"nombre": n, "descripcion": c.descripcion, "implementado": n == "CMMS_SIMULADO"}
            for n, c in REGISTRO.items()]
