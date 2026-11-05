"""Importador de HAZOP semicuantitativo (Excel/CSV). Valida por fila e idempotente.

Una fila = un par (escenario, barrera). Un escenario sin barreras usa la fila con
los campos de barrera vacíos. Reimportar el mismo archivo no duplica ni crea
versiones nuevas; si cambia un campo de entrada del escenario, ``version`` se incrementa
y el escenario se recalcula.
"""

from __future__ import annotations

import csv
import io
import re
import unicodedata
from dataclasses import dataclass, field
from datetime import UTC, date, datetime
from typing import Any

import pandas as pd
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.domain.engine import constants as c
from app.errors import ErrorApi
from app.models import (
    Barrera,
    Empresa,
    Escenario,
    EscenarioBarrera,
    EstadoBarreraHist,
    MatrizRiesgo,
    Nodo,
    PalabraGuia,
    PoliticaEstado,
    Site,
    Unidad,
)
from app.services import recalc
from app.services.audit import registrar

#: Columnas de la plantilla (encabezado visible, clave canónica, obligatoria)
COLUMNAS: list[tuple[str, str, bool]] = [
    ("Empresa", "empresa", True),
    ("Site", "site", True),
    ("Unidad", "unidad", True),
    ("Nodo", "nodo", True),
    ("Palabra guía", "palabra_guia", True),
    ("Causa", "causa", True),
    ("Frecuencia diseño", "frecuencia_diseno", True),
    ("Consecuencia", "consecuencia", True),
    ("Imp. económico", "imp_economico", True),
    ("Imp. personas", "imp_personas", True),
    ("Imp. ambiente", "imp_ambiente", True),
    ("Imp. reputación", "imp_reputacion", True),
    ("Barrera tag", "barrera_tag", False),
    ("Barrera descripción", "barrera_descripcion", False),
    ("FRR diseño", "frr_diseno", False),
    ("Tipo", "tipo", False),
    ("Lado", "lado", False),
    ("Vigencia desde", "vigencia_desde", False),
    ("Vigencia hasta", "vigencia_hasta", False),
    ("MOC", "moc_ref", False),
    ("Recomendación PHA", "recomendacion", False),
]
ALIAS = {"moc": "moc_ref", "tag": "barrera_tag", "barrera": "barrera_tag", "frr": "frr_diseno", "recomendacion_pha": "recomendacion"}
CLAVES = {k for _, k, _ in COLUMNAS}


def normalizar_encabezado(txt: str) -> str:
    s = unicodedata.normalize("NFKD", str(txt)).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"[^a-z0-9]+", "_", s).strip("_")
    s = s.replace("impacto_", "imp_")
    return ALIAS.get(s, s)


@dataclass
class ErrorFila:
    fila: int
    campo: str | None
    mensaje: str


@dataclass
class ResultadoImportacion:
    filas_totales: int = 0
    filas_aceptadas: int = 0
    errores: list[ErrorFila] = field(default_factory=list)
    escenarios_creados: int = 0
    escenarios_actualizados: int = 0
    escenarios_sin_cambios: int = 0
    barreras_creadas: int = 0
    vinculos_creados: int = 0
    escenarios_recalculados: int = 0


def leer_tabla(contenido: bytes, nombre_archivo: str) -> list[dict[str, str]]:
    """Lee CSV (delimitador , ; o tab) o XLSX y devuelve filas con claves canónicas."""
    nombre = nombre_archivo.lower()
    try:
        if nombre.endswith((".xlsx", ".xlsm")):
            df = pd.read_excel(io.BytesIO(contenido), dtype=str, keep_default_na=False, engine="openpyxl")
            filas = df.to_dict("records")
        elif nombre.endswith((".csv", ".txt")):
            texto = contenido.decode("utf-8-sig")
            try:
                dialecto = csv.Sniffer().sniff(texto[:4096], delimiters=",;\t")
            except csv.Error:
                dialecto = csv.excel
            filas = list(csv.DictReader(io.StringIO(texto), dialect=dialecto))
        else:
            raise ErrorApi(415, "FORMATO_NO_SOPORTADO", "Use un archivo .xlsx o .csv")
    except ErrorApi:
        raise
    except Exception as exc:
        raise ErrorApi(400, "ARCHIVO_ILEGIBLE", f"No se pudo leer el archivo: {exc}") from exc
    return [
        {normalizar_encabezado(str(k)): ("" if v is None else str(v).strip()) for k, v in f.items() if k}
        for f in filas
    ]


def _fecha(valor: str) -> date | None:
    if not valor:
        return None
    v = valor.strip()[:10]
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y"):
        try:
            return datetime.strptime(v, fmt).date()
        except ValueError:
            continue
    raise ValueError(f"fecha inválida: {valor!r} (use AAAA-MM-DD)")


@dataclass
class FilaValida:
    empresa: str
    site: str
    unidad: str
    nodo: str
    palabra_guia: str
    causa: str
    frecuencia: str
    consecuencia: str
    impactos: tuple[int, int, int, int]
    tag: str | None
    descripcion: str | None
    frr: float | None
    tipo: str
    lado: str
    desde: date | None
    hasta: date | None
    moc: str | None
    recomendacion: str | None = None


def validar_fila(i: int, f: dict[str, str]) -> tuple[FilaValida | None, list[ErrorFila]]:
    errs: list[ErrorFila] = []

    def err(campo: str, msg: str) -> None:
        errs.append(ErrorFila(i, campo, msg))

    for etiqueta, clave, obligatoria in COLUMNAS:
        if obligatoria and not f.get(clave):
            err(clave, f"'{etiqueta}' es obligatorio")
    frec = f.get("frecuencia_diseno", "").upper()
    if frec and frec not in c.FRECUENCIAS:
        err("frecuencia_diseno", "Debe ser A, B, C, D o E")
    imps: list[int] = []
    for clave in ("imp_economico", "imp_personas", "imp_ambiente", "imp_reputacion"):
        v = f.get(clave, "")
        if not v:
            continue
        try:
            n = int(float(v))
            if not 1 <= n <= 5:
                raise ValueError
            imps.append(n)
        except ValueError:
            err(clave, "Debe ser un entero entre 1 y 5")
    tag = f.get("barrera_tag") or None
    frr: float | None = None
    tipo = (f.get("tipo") or "EXISTENTE").upper()
    lado = (f.get("lado") or "PREVENTIVA").upper()
    desde = hasta = None
    if tipo not in c.TIPOS_BARRERA:
        err("tipo", "Debe ser EXISTENTE o TEMPORAL")
    if lado not in ("PREVENTIVA", "MITIGATIVA"):
        err("lado", "Debe ser PREVENTIVA o MITIGATIVA")
    if tag:
        try:
            frr = float(f.get("frr_diseno", "").replace(",", "."))
            if frr < 1:
                raise ValueError
        except ValueError:
            err("frr_diseno", "FRR debe ser numérico ≥ 1 (10, 100, 1000...)")
        if not f.get("barrera_descripcion"):
            err("barrera_descripcion", "Descripción de barrera obligatoria cuando hay tag")
        try:
            desde, hasta = _fecha(f.get("vigencia_desde", "")), _fecha(f.get("vigencia_hasta", ""))
        except ValueError as exc:
            err("vigencia", str(exc))
        if tipo == "TEMPORAL" and hasta is None:
            err("vigencia_hasta", "Las barreras TEMPORALES requieren vigencia hasta (y MOC)")
        if tipo == "TEMPORAL" and not f.get("moc_ref"):
            err("moc_ref", "Las barreras TEMPORALES requieren referencia MOC")
    if errs:
        return None, errs
    return (
        FilaValida(
            f["empresa"], f["site"], f["unidad"], f["nodo"], f["palabra_guia"], f["causa"], frec,
            f["consecuencia"], (imps[0], imps[1], imps[2], imps[3]), tag,
            f.get("barrera_descripcion") or None, frr, tipo, lado, desde, hasta,
            f.get("moc_ref") or None, f.get("recomendacion") or None,
        ),
        [],
    )


def _get_or_create(db: Session, modelo: Any, filtros: dict[str, Any], extra: dict[str, Any] | None = None) -> Any:
    obj = db.scalars(select(modelo).filter_by(**filtros)).first()
    if obj is None:
        obj = modelo(**filtros, **(extra or {}))
        db.add(obj)
        db.flush()
    return obj


def asegurar_config_empresa(db: Session, empresa_id: int) -> None:
    """Crea matriz 5x5 y política de estados por defecto (editables) para la empresa."""
    if db.scalars(select(MatrizRiesgo.id).where(MatrizRiesgo.empresa_id == empresa_id)).first() is None:
        for (f, s), nivel in c.matriz_defecto().items():
            db.add(MatrizRiesgo(empresa_id=empresa_id, frecuencia=c.FRECUENCIAS[f], severidad=s, nivel=nivel))
    if db.scalars(select(PoliticaEstado.id).where(PoliticaEstado.empresa_id == empresa_id)).first() is None:
        for estado, m in c.MULTIPLICADORES_DEFECTO.items():
            db.add(PoliticaEstado(empresa_id=empresa_id, estado=estado, multiplicador_frr=m))


def importar_hazop(
    db: Session,
    filas: list[dict[str, str]],
    usuario: str = "sistema",
    fuente: str = "IMPORT_HAZOP",
    ts_base: datetime | None = None,
) -> ResultadoImportacion:
    res = ResultadoImportacion(filas_totales=len(filas))
    tocados: set[int] = set()
    vistos_nuevos: set[int] = set()
    contados: set[int] = set()
    for idx, fila in enumerate(filas, start=2):  # fila 1 = encabezado
        v, errs = validar_fila(idx, fila)
        if v is None:
            res.errores.extend(errs)
            continue
        res.filas_aceptadas += 1
        emp = _get_or_create(db, Empresa, {"nombre": v.empresa})
        asegurar_config_empresa(db, emp.id)
        site = _get_or_create(db, Site, {"empresa_id": emp.id, "nombre": v.site})
        uni = _get_or_create(db, Unidad, {"site_id": site.id, "nombre": v.unidad})
        nodo = _get_or_create(db, Nodo, {"unidad_id": uni.id, "nombre": v.nodo})
        pg = _get_or_create(db, PalabraGuia, {"nodo_id": nodo.id, "nombre": v.palabra_guia})
        datos = dict(
            frecuencia_diseno=v.frecuencia, consecuencia=v.consecuencia,
            imp_economico=v.impactos[0], imp_personas=v.impactos[1],
            imp_ambiente=v.impactos[2], imp_reputacion=v.impactos[3],
        )
        if v.recomendacion:
            datos["recomendacion"] = v.recomendacion
        esc = db.scalars(select(Escenario).filter_by(palabra_guia_id=pg.id, causa=v.causa)).first()
        if esc is None:
            esc = Escenario(palabra_guia_id=pg.id, causa=v.causa, **datos)
            db.add(esc)
            db.flush()
            res.escenarios_creados += 1
            vistos_nuevos.add(esc.id)
            contados.add(esc.id)
            tocados.add(esc.id)
        elif esc.id not in contados:
            contados.add(esc.id)
            if any(getattr(esc, k) != val for k, val in datos.items()):
                for k, val in datos.items():
                    setattr(esc, k, val)
                esc.version += 1
                res.escenarios_actualizados += 1
                tocados.add(esc.id)
            else:
                res.escenarios_sin_cambios += 1
        if v.tag and v.frr is not None and v.descripcion:
            bar = db.scalars(select(Barrera).filter_by(empresa_id=emp.id, tag_activo=v.tag)).first()
            if bar is None:
                bar = Barrera(
                    empresa_id=emp.id, tag_activo=v.tag, descripcion=v.descripcion, tipo=v.tipo,
                    vigencia_desde=v.desde, vigencia_hasta=v.hasta, moc_ref=v.moc,
                    estado_actual="DISPONIBLE", estado_actualizado=ts_base or recalc.ahora(),
                )
                db.add(bar)
                db.flush()
                db.add(EstadoBarreraHist(
                    barrera_id=bar.id, ts=ts_base or recalc.ahora(), estado="DISPONIBLE", fuente=fuente,
                    detalle={"nota": "Alta por importación HAZOP"},
                ))
                res.barreras_creadas += 1
            else:
                cambios = {"descripcion": v.descripcion, "tipo": v.tipo, "vigencia_desde": v.desde,
                           "vigencia_hasta": v.hasta, "moc_ref": v.moc}
                if any(getattr(bar, k) != val for k, val in cambios.items()):
                    for k, val in cambios.items():
                        setattr(bar, k, val)
                    tocados.update(recalc.escenarios_de_barrera(db, bar.id))
            vin = db.scalars(select(EscenarioBarrera).filter_by(escenario_id=esc.id, barrera_id=bar.id)).first()
            if vin is None:
                db.add(EscenarioBarrera(escenario_id=esc.id, barrera_id=bar.id, frr_diseno=v.frr, lado=v.lado))
                res.vinculos_creados += 1
                tocados.add(esc.id)
            elif vin.frr_diseno != v.frr or vin.lado != v.lado:
                vin.frr_diseno, vin.lado = v.frr, v.lado
                tocados.add(esc.id)
        db.flush()
    if tocados:
        db.expire_all()
        rr = recalc.recalcular(db, tocados, f"Importación HAZOP ({fuente})", usuario, auditar=False)
        res.escenarios_recalculados = rr.escenarios
    registrar(db, usuario, "IMPORTAR_HAZOP", "escenario", despues={
        "filas": res.filas_totales, "aceptadas": res.filas_aceptadas, "errores": len(res.errores),
        "escenarios_creados": res.escenarios_creados, "escenarios_actualizados": res.escenarios_actualizados,
        "barreras_creadas": res.barreras_creadas,
    })
    return res


def plantilla_filas_ejemplo() -> list[list[str]]:
    hoy = datetime.now(UTC).date().isoformat()
    return [
        ["EMPRESA EJEMPLO (FICTICIA)", "Refinería Demo", "Destilación", "Horno H-101", "Más temperatura",
         "Falla del controlador TIC-101", "B", "Sobrecalentamiento de tubos", "4", "5", "3", "4",
         "SIS-H101-TSHH", "Lazo SIS de disparo por alta temperatura", "100", "EXISTENTE", "PREVENTIVA", "", "", ""],
        ["EMPRESA EJEMPLO (FICTICIA)", "Refinería Demo", "Destilación", "Horno H-101", "Más temperatura",
         "Falla del controlador TIC-101", "B", "Sobrecalentamiento de tubos", "4", "5", "3", "4",
         "TMP-001", "Operador dedicado (medida temporal)", "10", "TEMPORAL", "PREVENTIVA", hoy, "2099-12-31", "MOC-0001"],
    ]


def plantilla_xlsx() -> bytes:
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill

    wb = Workbook()
    ws = wb.active
    ws.title = "HAZOP"
    ws.append([e for e, _, _ in COLUMNAS])
    for cell in ws[1]:
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill("solid", fgColor="1F3A5F")
    for fila in plantilla_filas_ejemplo():
        ws.append(fila)
    for col in ws.columns:
        ws.column_dimensions[col[0].column_letter].width = 22
    ayuda = wb.create_sheet("Instrucciones")
    for linea in [
        "Plantilla HAZOP semicuantitativo GIDR (datos de ejemplo ficticios).",
        "Una fila por par escenario-barrera; repita los datos del escenario para cada barrera.",
        "Frecuencia diseño: A (más frecuente) a E (más rara). Impactos: enteros 1 a 5.",
        "FRR diseño: factor numérico (10, 100, 1000...). Tipo: EXISTENTE o TEMPORAL.",
        "Barreras TEMPORALES: requieren Vigencia hasta y MOC. Lado: PREVENTIVA o MITIGATIVA.",
        "Los campos calculados (riesgos, frecuencia actual, brecha) NO se capturan.",
        "La importación es idempotente: reimportar no duplica registros.",
    ]:
        ayuda.append([linea])
    ayuda.column_dimensions["A"].width = 100
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def plantilla_csv() -> str:
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow([e for e, _, _ in COLUMNAS])
    w.writerows(plantilla_filas_ejemplo())
    return out.getvalue()
