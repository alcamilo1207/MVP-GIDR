from __future__ import annotations

import random
from typing import Any

from fastapi import APIRouter, File, Query, UploadFile
from fastapi.responses import Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.connectors import REGISTRO
from app.connectors.base import EventoEstado, ResultadoNormalizacion
from app.connectors.cmms_sim import CmmsSimuladoConnector, csv_ejemplo
from app.errors import ErrorApi, no_encontrado
from app.models import Barrera, EscenarioBarrera, VinculoGemelo
from app.schemas import (
    CambioEstadoIngesta,
    ErrorFilaOut,
    EventosCmmsIn,
    ImportacionOut,
    IngestaOut,
    LecturaTelemetriaIn,
    ResultadoTelemetriaOut,
    TelemetriaBatchIn,
    VinculoGemeloIn,
    VinculoGemeloOut,
)
from app.security import Admin, DbSession, Usuario_
from app.services import cmms, importer, recalc
from app.services.realtime import evaluar_lectura_vinculo, gestor_ws

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
    implementados = {"CMMS_SIMULADO", "GEMELO_DIGITAL", "DCS_SCADA", "SIS_PLANTA", "HISTORIADOR_IOW"}
    return [{"nombre": n, "descripcion": c.descripcion, "implementado": n in implementados}
            for n, c in REGISTRO.items()]


def _inferir_config_vinculo(b: Barrera) -> dict[str, Any]:
    tag_up = b.tag_activo.upper()
    if any(p in tag_up for p in ("SDV", "SIS", "ESD", "PAHH", "TAHH", "LAHH", "PT-101D")):
        return {
            "sistema_fuente": "SIS",
            "tag_gemelo": f"GD.SIS.{b.tag_activo}.MOS_BYPASS",
            "descripcion": f"Estado de inhibición (MOS/Bypass) y diagnóstico SIS para {b.tag_activo}",
            "tipo_evaluacion": "ESTADO_DISCRETO",
            "unidad_ing": "estado (0=OK,1=Bypass)",
            "umbral_alerta": None,
            "umbral_critico": None,
            "ultimo_valor": 0.0 if b.estado_actual == "DISPONIBLE" else 1.0,
        }
    if any(p in tag_up for p in ("PSV", "RD", "BDV", "TI", "PI", "FI")):
        return {
            "sistema_fuente": "HISTORIADOR_IOW",
            "tag_gemelo": f"GD.HIST.{b.tag_activo}.EXCURSION_IOW",
            "descripcion": f"Variable de proceso / Ventana Operativa de Integridad (IOW) para {b.tag_activo}",
            "tipo_evaluacion": "UMBRAL_IOW",
            "unidad_ing": "psig / %IOW",
            "umbral_alerta": 80.0,
            "umbral_critico": 110.0,
            "ultimo_valor": 65.0 if b.estado_actual == "DISPONIBLE" else 95.0,
        }
    if any(p in tag_up for p in ("PV", "FCV", "TCV", "LCV", "LAH", "TAH", "PAH")):
        return {
            "sistema_fuente": "DCS_SCADA",
            "tag_gemelo": f"GD.DCS.{b.tag_activo}.DEGRADACION_LAZO",
            "descripcion": f"Salud de lazo de control / alarma DCS ({b.tag_activo}) por Datos de Telemetría",
            "tipo_evaluacion": "SALUD_DEGRADACION",
            "unidad_ing": "% degradación",
            "umbral_alerta": 15.0,
            "umbral_critico": 100.0,
            "ultimo_valor": 0.0 if b.estado_actual == "DISPONIBLE" else float(b.factor_degradacion),
        }
    return {
        "sistema_fuente": "GEMELO_DIGITAL",
        "tag_gemelo": f"GD.PLANTA.{b.tag_activo}.SALUD",
        "descripcion": f"Índice de degradación operativa de Datos de Telemetría para {b.tag_activo}",
        "tipo_evaluacion": "SALUD_DEGRADACION",
        "unidad_ing": "% degradación",
        "umbral_alerta": 10.0,
        "umbral_critico": 100.0,
        "ultimo_valor": 0.0 if b.estado_actual == "DISPONIBLE" else float(b.factor_degradacion),
    }


def _sembrar_vinculos_por_defecto(db: Session) -> int:
    barreras = db.scalars(select(Barrera).order_by(Barrera.id)).all()
    existentes_barrera_ids = set(db.scalars(select(VinculoGemelo.barrera_id)).all())
    existentes_tags = set(db.scalars(select(VinculoGemelo.tag_gemelo)).all())
    creados = 0
    ahora = recalc.ahora()
    for b in barreras:
        if b.id in existentes_barrera_ids:
            continue
        cfg = _inferir_config_vinculo(b)
        tag_g = cfg["tag_gemelo"]
        if tag_g in existentes_tags:
            tag_g = f"{tag_g}.{b.id}"
        v = VinculoGemelo(
            barrera_id=b.id,
            sistema_fuente=cfg["sistema_fuente"],
            tag_gemelo=tag_g,
            descripcion=cfg["descripcion"],
            tipo_evaluacion=cfg["tipo_evaluacion"],
            unidad_ing=cfg["unidad_ing"],
            umbral_alerta=cfg["umbral_alerta"],
            umbral_critico=cfg["umbral_critico"],
            ultimo_valor=cfg["ultimo_valor"],
            ultimo_estado_evaluado=b.estado_actual,
            ultima_actualizacion=ahora,
            activo=True,
        )
        db.add(v)
        existentes_tags.add(tag_g)
        creados += 1
    if creados:
        db.commit()
    return creados


def _a_vinculo_out(db: Session, v: VinculoGemelo) -> VinculoGemeloOut:
    b = v.barrera
    frr_max = db.scalar(
        select(func.max(EscenarioBarrera.frr_diseno)).where(EscenarioBarrera.barrera_id == b.id)
    )
    return VinculoGemeloOut(
        id=v.id,
        barrera_id=b.id,
        barrera_tag=b.tag_activo,
        barrera_descripcion=b.descripcion,
        barrera_estado=b.estado_actual,
        barrera_factor_degradacion=b.factor_degradacion,
        barrera_frr_diseno=float(frr_max or 10.0),
        sistema_fuente=v.sistema_fuente,
        tag_gemelo=v.tag_gemelo,
        descripcion=v.descripcion,
        tipo_evaluacion=v.tipo_evaluacion,
        unidad_ing=v.unidad_ing,
        umbral_alerta=v.umbral_alerta,
        umbral_critico=v.umbral_critico,
        ultimo_valor=v.ultimo_valor,
        ultimo_estado_evaluado=v.ultimo_estado_evaluado,
        ultima_actualizacion=v.ultima_actualizacion,
        activo=v.activo,
    )


@router.get("/gemelo/vinculos", response_model=list[VinculoGemeloOut])
def listar_vinculos_gemelo(db: DbSession, _: Usuario_) -> list[VinculoGemeloOut]:
    total = db.scalar(select(func.count(VinculoGemelo.id))) or 0
    if total == 0:
        _sembrar_vinculos_por_defecto(db)
    vinculos = db.scalars(select(VinculoGemelo).order_by(VinculoGemelo.id)).all()
    return [_a_vinculo_out(db, v) for v in vinculos]


@router.post("/gemelo/inicializar", response_model=list[VinculoGemeloOut])
def inicializar_vinculos_gemelo(db: DbSession, _: Admin) -> list[VinculoGemeloOut]:
    _sembrar_vinculos_por_defecto(db)
    vinculos = db.scalars(select(VinculoGemelo).order_by(VinculoGemelo.id)).all()
    return [_a_vinculo_out(db, v) for v in vinculos]


@router.post("/gemelo/vinculos", response_model=VinculoGemeloOut, status_code=201)
def crear_vinculo_gemelo(datos: VinculoGemeloIn, db: DbSession, _: Admin) -> VinculoGemeloOut:
    b = db.get(Barrera, datos.barrera_id)
    if b is None:
        raise no_encontrado("Barrera", datos.barrera_id)
    dup = db.scalars(
        select(VinculoGemelo).where(VinculoGemelo.tag_gemelo == datos.tag_gemelo.strip())
    ).first()
    if dup is not None:
        raise ErrorApi(409, "TAG_DUPLICADO", f"El tag {datos.tag_gemelo} ya está vinculado")
    v = VinculoGemelo(
        barrera_id=datos.barrera_id,
        sistema_fuente=datos.sistema_fuente,
        tag_gemelo=datos.tag_gemelo.strip(),
        descripcion=datos.descripcion.strip(),
        tipo_evaluacion=datos.tipo_evaluacion,
        unidad_ing=datos.unidad_ing,
        umbral_alerta=datos.umbral_alerta,
        umbral_critico=datos.umbral_critico,
        ultimo_valor=0.0,
        ultimo_estado_evaluado=b.estado_actual,
        ultima_actualizacion=recalc.ahora(),
        activo=datos.activo,
    )
    db.add(v)
    db.commit()
    db.refresh(v)
    return _a_vinculo_out(db, v)


@router.delete("/gemelo/vinculos/{id_}", status_code=204)
def eliminar_vinculo_gemelo(id_: int, db: DbSession, _: Admin) -> None:
    v = db.get(VinculoGemelo, id_)
    if v is None:
        raise no_encontrado("VinculoGemelo", id_)
    db.delete(v)
    db.commit()


def procesar_lecturas_gemelo(
    db: Session, lecturas: list[LecturaTelemetriaIn], usuario: str = "gemelo_digital"
) -> ResultadoTelemetriaOut:
    ahora = recalc.ahora()
    eventos: list[EventoEstado] = []
    eventos_emitidos: list[dict[str, Any]] = []

    for lec in lecturas:
        vinculo: VinculoGemelo | None = None
        barrera: Barrera | None = None

        if lec.tag_gemelo:
            vinculo = db.scalars(
                select(VinculoGemelo).where(VinculoGemelo.tag_gemelo == lec.tag_gemelo.strip())
            ).first()
            if vinculo:
                barrera = vinculo.barrera

        if barrera is None and lec.barrera_tag:
            barrera = db.scalars(
                select(Barrera).where(Barrera.tag_activo == lec.barrera_tag.strip())
            ).first()
            if barrera and vinculo is None:
                vinculo = db.scalars(
                    select(VinculoGemelo).where(VinculoGemelo.barrera_id == barrera.id)
                ).first()

        if barrera is None:
            continue

        tipo_eval = vinculo.tipo_evaluacion if vinculo else "SALUD_DEGRADACION"
        u_alerta = vinculo.umbral_alerta if vinculo else None
        u_crit = vinculo.umbral_critico if vinculo else None
        fuente = lec.fuente or (vinculo.sistema_fuente if vinculo else "GEMELO_DIGITAL")

        nuevo_estado, nuevo_deg = evaluar_lectura_vinculo(
            tipo_evaluacion=tipo_eval,
            valor=lec.valor,
            umbral_alerta=u_alerta,
            umbral_critico=u_crit,
            estado_manual=lec.estado_manual,
            degradacion_manual=lec.factor_degradacion,
        )

        if vinculo is not None:
            if lec.valor is not None:
                vinculo.ultimo_valor = float(lec.valor)
            vinculo.ultimo_estado_evaluado = nuevo_estado
            vinculo.ultima_actualizacion = ahora

        detalle_ev = {
            "tag_gemelo": vinculo.tag_gemelo if vinculo else lec.tag_gemelo,
            "valor": lec.valor,
            "factor_degradacion": nuevo_deg,
            "tipo_evaluacion": tipo_eval,
        }
        eventos.append(
            EventoEstado(
                tag_activo=barrera.tag_activo,
                estado=nuevo_estado,
                fuente=fuente,
                fecha=ahora,
                detalle=detalle_ev,
                factor_degradacion=nuevo_deg,
            )
        )
        cambio_real = (barrera.estado_actual != nuevo_estado) or (
            barrera.factor_degradacion != nuevo_deg
        )
        eventos_emitidos.append(
            {
                "barrera_tag": barrera.tag_activo,
                "tag_gemelo": vinculo.tag_gemelo if vinculo else lec.tag_gemelo,
                "fuente": fuente,
                "valor": lec.valor,
                "estado_anterior": barrera.estado_actual,
                "estado": nuevo_estado,
                "factor_degradacion": nuevo_deg,
                "cambio": cambio_real,
            }
        )

    res_ingesta = cmms.aplicar_eventos(db, eventos, usuario=usuario)
    db.commit()

    # Difundir telemetría en vivo a todas las pantallas conectadas por WebSocket
    gestor_ws.difundir(
        {
            "tipo": "TELEMETRIA_GEMELO",
            "ts": ahora.isoformat(),
            "eventos": eventos_emitidos,
            "escenarios_recalculados": res_ingesta.escenarios_recalculados,
        }
    )

    return ResultadoTelemetriaOut(
        procesadas=len(lecturas),
        barreras_actualizadas=len(eventos_emitidos),
        escenarios_recalculados=res_ingesta.escenarios_recalculados,
        eventos_emitidos=eventos_emitidos,
    )


@router.post("/gemelo/telemetria", response_model=ResultadoTelemetriaOut)
def recibir_telemetria_gemelo(
    datos: TelemetriaBatchIn, db: DbSession, p: Admin
) -> ResultadoTelemetriaOut:
    """Endpoint de ingesta en tiempo real para el Gemelo Digital de Planta (DCS/SIS/Historiador/CMMS)."""
    return procesar_lecturas_gemelo(db, datos.lecturas, usuario=p.username)


@router.post("/gemelo/simular-paso", response_model=ResultadoTelemetriaOut)
def simular_paso_gemelo(
    db: DbSession,
    p: Admin,
    modo: str = Query("Perturbacion", pattern="^(Perturbacion|Normal)$"),
) -> ResultadoTelemetriaOut:
    """Genera un paso de operación simulada del Gemelo Digital o restaura la planta a estado normal."""
    total = db.scalar(select(func.count(VinculoGemelo.id))) or 0
    if total == 0:
        _sembrar_vinculos_por_defecto(db)
    vinculos = db.scalars(select(VinculoGemelo).where(VinculoGemelo.activo.is_(True))).all()
    if not vinculos:
        return ResultadoTelemetriaOut(
            procesadas=0, barreras_actualizadas=0, escenarios_recalculados=0, eventos_emitidos=[]
        )

    lecturas: list[LecturaTelemetriaIn] = []
    if modo == "Normal":
        for v in vinculos:
            val_normal = 0.0
            if v.tipo_evaluacion == "UMBRAL_IOW":
                val_normal = round((v.umbral_alerta or 80.0) * 0.75, 1)
            lecturas.append(
                LecturaTelemetriaIn(
                    tag_gemelo=v.tag_gemelo,
                    valor=val_normal,
                    estado_manual="DISPONIBLE",
                    factor_degradacion=10,
                    fuente=v.sistema_fuente,
                )
            )
    else:
        muestra = random.sample(vinculos, k=min(3, len(vinculos)))
        for v in muestra:
            if v.tipo_evaluacion == "ESTADO_DISCRETO":
                val = float(random.choice([0, 1, 2, 3]))
                lecturas.append(
                    LecturaTelemetriaIn(
                        tag_gemelo=v.tag_gemelo, valor=val, fuente=v.sistema_fuente
                    )
                )
            elif v.tipo_evaluacion == "UMBRAL_IOW":
                alerta = v.umbral_alerta or 80.0
                crit = v.umbral_critico or 110.0
                val = round(random.uniform(alerta * 0.85, crit * 1.05), 1)
                lecturas.append(
                    LecturaTelemetriaIn(
                        tag_gemelo=v.tag_gemelo, valor=val, fuente=v.sistema_fuente
                    )
                )
            else:
                deg = float(random.choice([0, 25, 45, 65, 85, 100]))
                lecturas.append(
                    LecturaTelemetriaIn(
                        tag_gemelo=v.tag_gemelo, valor=deg, fuente=v.sistema_fuente
                    )
                )

    return procesar_lecturas_gemelo(db, lecturas, usuario=p.username)

