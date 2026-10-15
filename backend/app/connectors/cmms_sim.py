"""Conector CMMS simulado: JSON (endpoint) y CSV (tag_activo, estado, fuente, fecha, detalle)."""

from __future__ import annotations

import csv
import io
import json
import re
import unicodedata
from datetime import UTC, datetime, timedelta
from typing import Any

from app.connectors.base import (
    BaseConnector,
    ErrorNormalizacion,
    EventoEstado,
    ResultadoNormalizacion,
)
from app.domain.engine.constants import ESTADOS_BARRERA

ALIAS_ESTADO = {
    "OK": "DISPONIBLE", "OPERATIVO": "DISPONIBLE", "EN_SERVICIO": "DISPONIBLE",
    "DEGRADED": "DEGRADADO", "BYPASS": "DEGRADADO",
    "MANTENIMIENTO": "EN_MANTENIMIENTO", "IN_MAINTENANCE": "EN_MANTENIMIENTO", "OT_ABIERTA": "EN_MANTENIMIENTO",
    "OUT_OF_SERVICE": "FUERA_DE_SERVICIO", "FALLA": "FUERA_DE_SERVICIO", "FUERA_SERVICIO": "FUERA_DE_SERVICIO",
    "NO_EXISTE": "INEXISTENTE", "RETIRADO": "INEXISTENTE",
}


def normalizar_estado(valor: str) -> str | None:
    s = unicodedata.normalize("NFKD", valor).encode("ascii", "ignore").decode().upper().strip()
    s = re.sub(r"[^A-Z0-9]+", "_", s).strip("_")
    s = ALIAS_ESTADO.get(s, s)
    return s if s in ESTADOS_BARRERA else None


def _fecha(valor: Any) -> datetime:
    if valor in (None, ""):
        return datetime.now(UTC)
    if isinstance(valor, datetime):
        dt = valor
    else:
        txt = str(valor).strip().replace("Z", "+00:00")
        try:
            dt = datetime.fromisoformat(txt)
        except ValueError:
            dt = datetime.strptime(txt[:10], "%d/%m/%Y")
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


class CmmsSimuladoConnector(BaseConnector):
    nombre = "CMMS_SIMULADO"
    descripcion = "CMMS simulado: eventos de estado de barreras vía API JSON o CSV."

    def normalizar(self, payload: Any) -> ResultadoNormalizacion:
        """``payload``: lista de dicts con tag_activo, estado, fuente?, fecha?, detalle?."""
        res = ResultadoNormalizacion()
        for i, item in enumerate(payload, start=1):
            try:
                tag = str(item.get("tag_activo", "")).strip()
                if not tag:
                    raise ValueError("tag_activo es obligatorio")
                estado = normalizar_estado(str(item.get("estado", "")))
                if estado is None:
                    raise ValueError(f"estado no reconocido: {item.get('estado')!r}")
                detalle = item.get("detalle") or {}
                if isinstance(detalle, str):
                    try:
                        detalle = json.loads(detalle)
                        if not isinstance(detalle, dict):
                            detalle = {"texto": detalle}
                    except json.JSONDecodeError:
                        detalle = {"texto": detalle}
                res.eventos.append(
                    EventoEstado(
                        tag_activo=tag,
                        estado=estado,
                        fuente=str(item.get("fuente") or self.nombre),
                        fecha=_fecha(item.get("fecha")),
                        detalle=detalle,
                    )
                )
            except (ValueError, TypeError) as exc:
                res.errores.append(ErrorNormalizacion(i, str(exc)))
        return res

    def normalizar_csv(self, contenido: bytes) -> ResultadoNormalizacion:
        texto = contenido.decode("utf-8-sig")
        try:
            dialecto = csv.Sniffer().sniff(texto[:2048], delimiters=",;\t")
        except csv.Error:
            dialecto = csv.excel
        filas = [
            {(k or "").strip().lower(): (v or "").strip() for k, v in fila.items()}
            for fila in csv.DictReader(io.StringIO(texto), dialect=dialecto)
        ]
        return self.normalizar(filas)


def csv_ejemplo(ahora: datetime | None = None) -> str:
    """CSV de ejemplo con fechas relativas a 'ahora' (6 cambios de estado + 1 tag no mapeado)."""
    ahora = ahora or datetime.now(UTC)

    def f(horas: float) -> str:
        return (ahora - timedelta(hours=horas)).strftime("%Y-%m-%dT%H:%M:%SZ")

    filas = [
        ("PSV-101", "EN_MANTENIMIENTO", "SAP_PM_SIM", f(30), '{"ot": "OT-100231", "nota": "Calibración y prueba de banco de PSV"}'),
        ("SIS-R201-TSHH", "FUERA_DE_SERVICIO", "SAP_PM_SIM", f(20), '{"ot": "OT-100245", "nota": "Falla de transmisor TT-201B, lazo en bypass"}'),
        ("AL-H101-TAH", "DEGRADADO", "SAP_PM_SIM", f(12), '{"ot": "OT-100250", "nota": "Alarma intermitente, respuesta de operador limitada"}'),
        ("LSHH-T101", "DEGRADADO", "SAP_PM_SIM", f(8), '{"ot": "OT-100258", "nota": "Deriva en medición de nivel"}'),
        ("SIS-V202-LSLL", "FUERA_DE_SERVICIO", "SAP_PM_SIM", f(5), '{"ot": "OT-100263", "nota": "Válvula XV-202 no cierra en prueba parcial"}'),
        ("SIS-K201-VIB", "EN_MANTENIMIENTO", "SAP_PM_SIM", f(2), '{"ot": "OT-100270", "nota": "Reemplazo de sondas de vibración"}'),
        ("XV-999", "FUERA_DE_SERVICIO", "SAP_PM_SIM", f(1), '{"nota": "Tag no existe en el HAZOP (ejemplo de no mapeado)"}'),
    ]
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(["tag_activo", "estado", "fuente", "fecha", "detalle"])
    w.writerows(filas)
    return out.getvalue()
