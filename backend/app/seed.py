"""Seed de demo (DATOS FICTICIOS). Reproducible e idempotente.

Uso:  python -m app.seed            # carga si la base está vacía
      python -m app.seed --reset    # borra todo y vuelve a cargar
      python -m app.seed --export   # además escribe data/demo/*.{xlsx,csv}
"""

from __future__ import annotations

import sys
from datetime import date, timedelta
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.models import Base, Empresa, Usuario
from app.security import hash_password
from app.services import importer, recalc

EMPRESA = "PETROQUÍMICA DEMO S.A. (FICTICIA)"
SITE = "Refinería Demo (ficticia)"
CDU = "Destilación atmosférica CDU-100"
HDT = "Hidrotratamiento HDT-200"

# Barreras: tag -> descripción
BARRERAS: dict[str, str] = {
    "PSV-101": "Válvula de alivio de presión de la columna T-101",
    "PSV-103": "Válvula de alivio del desalador D-101",
    "PSV-201": "Válvula de alivio del reactor R-201",
    "SIS-H101-TSHH": "Lazo SIS: disparo del horno por muy alta temperatura de piel de tubos",
    "SIS-H101-BMS": "Lazo SIS: sistema de gestión de quemadores, corte de gas por pérdida de llama",
    "AL-H101-PSL": "Alarma de baja presión de gas combustible con respuesta del operador",
    "AL-H101-TAH": "Alarma de alta temperatura de salida del horno con respuesta del operador",
    "FIC-H101": "Lazo de control de flujo de carga al horno (capa de control básico)",
    "FSLL-H101": "Interruptor de muy bajo flujo por paso del horno (SIS)",
    "AL-T101-LAH": "Alarma de alto nivel de fondo de T-101 con respuesta del operador",
    "LSHH-T101": "Lazo SIS: muy alto nivel de fondo de T-101, paro de carga",
    "PAH-T101": "Alarma de alta presión de columna T-101 con respuesta del operador",
    "GD-H101": "Detección de gas hidrocarburo en zona del horno H-101",
    "GD-T101": "Detección de gas hidrocarburo en zona de la columna T-101",
    "AL-D101-PAH": "Alarma de alta presión del desalador con respuesta del operador",
    "INSP-D101": "Programa de inspección de espesores en intercambiadores de precalentamiento",
    "SIS-R201-TSHH": "Lazo SIS: disparo y depresurización del reactor por muy alta temperatura de lecho",
    "SIS-R201-PSHH": "Lazo SIS: disparo del reactor por muy alta presión",
    "AL-R201-TAH": "Alarma de alta temperatura de lecho con respuesta del operador",
    "QV-R201": "Sistema de enfriamiento (quench) de hidrógeno del lecho",
    "SIS-K201-VIB": "Lazo SIS: paro del compresor de reciclo por muy alta vibración",
    "AL-K201-FAL": "Alarma de bajo flujo de gas de reciclo con respuesta del operador",
    "TSV-K201": "Interruptor de alta temperatura de descarga del compresor K-201",
    "DG-K201": "Detección de gas hidrógeno en caseta del compresor K-201",
    "SIS-V202-LSLL": "Lazo SIS: cierre de válvula de salida por muy bajo nivel en V-202",
    "SIS-V202-LSHH": "Lazo SIS: muy alto nivel en V-202, paro de compresor",
    "AL-V202-LAL": "Alarma de bajo nivel del separador V-202 con respuesta del operador",
    "LAH-V202": "Alarma de alto nivel del separador V-202 con respuesta del operador",
    "FW-100": "Sistema de agua contraincendios y monitores fijos",
    "ESD-100": "Válvulas de aislamiento de emergencia de la unidad CDU-100",
    "ESD-200": "Válvulas de aislamiento de emergencia de la unidad HDT-200",
}

P, M = "PREVENTIVA", "MITIGATIVA"
# (unidad, nodo, palabra guía, causa, frec, consecuencia, (eco, pers, amb, rep), [(tag, FRR, lado)])
ESCENARIOS: list[tuple[str, str, str, str, str, str, tuple[int, int, int, int], list[tuple[str, int, str]]]] = [
    (CDU, "Horno H-101", "Más temperatura", "Falla del controlador TIC-101 con salida alta", "B",
     "Sobrecalentamiento de tubos, ruptura e incendio en el horno", (4, 5, 3, 4),
     [("AL-H101-TAH", 10, P), ("SIS-H101-TSHH", 100, P), ("GD-H101", 10, M)]),
    (CDU, "Horno H-101", "Más temperatura", "Taponamiento parcial (coque) en un paso de carga", "A",
     "Punto caliente en tubos, falla por fluencia y fuga de hidrocarburo", (3, 4, 3, 3),
     [("FSLL-H101", 100, P), ("AL-H101-TAH", 10, P)]),
    (CDU, "Horno H-101", "Menos flujo", "Falla de la bomba de carga P-101A", "B",
     "Paro del horno y pérdida de producción", (3, 1, 1, 2),
     [("FIC-H101", 10, P), ("FSLL-H101", 100, P)]),
    (CDU, "Horno H-101", "Menos flujo", "Cierre inadvertido de válvula de carga", "C",
     "Sobrecalentamiento del serpentín y daño del horno", (3, 3, 2, 3),
     [("FSLL-H101", 100, P), ("SIS-H101-TSHH", 100, P)]),
    (CDU, "Horno H-101", "Menos flujo", "Pérdida de presión de gas combustible", "B",
     "Apagado de llama y acumulación de gas en caja de fuego: explosión", (4, 5, 3, 5),
     [("AL-H101-PSL", 10, P), ("SIS-H101-BMS", 1000, P), ("GD-H101", 10, M)]),
    (CDU, "Columna T-101", "Más presión", "Pérdida de condensación de cabeza (falla de aeroenfriadores)", "B",
     "Sobrepresión de columna y descarga a antorcha", (3, 3, 3, 3),
     [("PSV-101", 100, P), ("PAH-T101", 10, P)]),
    (CDU, "Columna T-101", "Más presión", "Cierre de válvula de salida de cabeza", "C",
     "Sobrepresión con liberación de hidrocarburo e incendio", (4, 4, 4, 4),
     [("PSV-101", 100, P), ("PAH-T101", 10, P)]),
    (CDU, "Columna T-101", "Más presión", "Incendio externo en la zona de la columna", "C",
     "Sobrepresión por fuego externo y falla mecánica", (5, 5, 4, 5),
     [("PSV-101", 100, P), ("FW-100", 10, M)]),
    (CDU, "Columna T-101", "Más nivel", "Falla del transmisor de nivel LT-101 en el fondo", "B",
     "Arrastre de líquido a cabeza y daño de equipos", (3, 2, 2, 3),
     [("AL-T101-LAH", 10, P), ("LSHH-T101", 100, P)]),
    (CDU, "Columna T-101", "Más nivel", "Pérdida de bombas de fondo", "C",
     "Inundación de columna y fuga por el tope", (3, 3, 3, 3),
     [("AL-T101-LAH", 10, P), ("LSHH-T101", 100, P), ("ESD-100", 10, M)]),
    (CDU, "Desalador D-101", "Más presión", "Bloqueo de la salida del desalador", "C",
     "Sobrepresión del desalador y fuga de crudo", (3, 3, 4, 3),
     [("PSV-103", 100, P), ("AL-D101-PAH", 10, P)]),
    (CDU, "Desalador D-101", "Más presión", "Expansión térmica con líquido atrapado en intercambiador", "D",
     "Fuga por empaque y derrame menor", (2, 2, 3, 2), [("PSV-103", 100, P)]),
    (CDU, "Desalador D-101", "Otro que (contaminación)", "Ingreso de agua en exceso en el crudo", "B",
     "Vaporización súbita en horno y columna, sobrepresión", (4, 4, 3, 4),
     [("AL-D101-PAH", 10, P), ("LSHH-T101", 100, P)]),
    (CDU, "Desalador D-101", "Otro que (contaminación)", "Corrosión por cloruros en intercambiadores", "B",
     "Perforación y fuga de hidrocarburo", (3, 3, 3, 3), [("INSP-D101", 10, P)]),
    (HDT, "Reactor R-201", "Más temperatura", "Pérdida de quench de hidrógeno por falla de lazo de control", "B",
     "Excursión de temperatura, falla de contención e incendio mayor", (5, 5, 5, 5),
     [("QV-R201", 10, P), ("AL-R201-TAH", 10, P), ("SIS-R201-TSHH", 100, P)]),
    (HDT, "Reactor R-201", "Más temperatura", "Mala distribución de flujo en el lecho (canalización)", "C",
     "Puntos calientes y daño del catalizador", (3, 2, 2, 4),
     [("AL-R201-TAH", 10, P), ("QV-R201", 10, P)]),
    (HDT, "Reactor R-201", "Más presión", "Cierre de la válvula de salida del reactor", "B",
     "Sobrepresión del reactor con liberación de hidrógeno e hidrocarburo: explosión", (5, 5, 4, 5),
     [("PSV-201", 100, P), ("SIS-R201-PSHH", 100, P)]),
    (HDT, "Reactor R-201", "Más presión", "Falla de la válvula de control de purga de presión", "C",
     "Sobrepresión del reactor y apertura de PSV a antorcha", (3, 2, 3, 3),
     [("PSV-201", 100, P), ("SIS-R201-PSHH", 100, P)]),
    (HDT, "Compresor K-201", "Menos flujo", "Disparo del compresor de reciclo por falla eléctrica", "B",
     "Pérdida de hidrógeno de reciclo y sobrecalentamiento del lecho", (3, 2, 2, 3),
     [("AL-K201-FAL", 10, P), ("SIS-R201-TSHH", 100, P)]),
    (HDT, "Compresor K-201", "Menos flujo", "Fuga en el sello del compresor", "B",
     "Liberación de hidrógeno e incendio de chorro", (4, 4, 3, 4),
     [("AL-K201-FAL", 10, P), ("DG-K201", 10, M), ("ESD-200", 10, M)]),
    (HDT, "Compresor K-201", "Más temperatura", "Falla del aeroenfriador de descarga", "B",
     "Alta temperatura de descarga y daño mecánico", (3, 1, 1, 2),
     [("TSV-K201", 100, P), ("SIS-K201-VIB", 10, P)]),
    (HDT, "Compresor K-201", "Más temperatura", "Contaminación del aceite lubricante / falla de cojinete", "C",
     "Falla de cojinete, vibración alta y daño del rotor", (3, 2, 1, 3),
     [("SIS-K201-VIB", 100, P), ("TSV-K201", 10, P)]),
    (HDT, "Separador V-202", "Más nivel", "Falla del lazo de nivel LIC-202 (válvula cerrada)", "B",
     "Arrastre de líquido al compresor de reciclo, daño mayor", (4, 2, 2, 4),
     [("LAH-V202", 10, P), ("SIS-V202-LSHH", 100, P)]),
    (HDT, "Separador V-202", "Menos nivel", "Pérdida del sello de líquido en V-202 (LIC abre al 100 %)", "B",
     "Paso de gas de alta presión al sistema de baja: sobrepresión y explosión aguas abajo", (5, 5, 4, 5),
     [("AL-V202-LAL", 10, P), ("SIS-V202-LSLL", 100, P)]),
    (HDT, "Separador V-202", "Menos nivel", "Falla del transmisor LT-202 con lectura alta falsa", "C",
     "Gas arrastrado a la línea de líquido y pérdida de contención aguas abajo", (3, 3, 3, 3),
     [("SIS-V202-LSLL", 100, P), ("AL-V202-LAL", 10, P)]),
]


def filas_hazop(hoy: date | None = None) -> list[dict[str, str]]:
    """Filas en formato de importación (claves canónicas) — la misma vía que un archivo real."""
    hoy = hoy or recalc.hoy()
    temporales = [  # (tag, desc, desde, hasta, moc, [(causa_idx, frr)])
        ("TMP-R201-OP", "Operador dedicado con monitoreo manual de temperatura de lecho (temporal)",
         hoy - timedelta(days=9), hoy + timedelta(days=5), "MOC-2026-021", [15]),
        ("TMP-R201-QNCH", "Inyección portátil de nitrógeno de enfriamiento al lecho (temporal, vencida)",
         hoy - timedelta(days=40), hoy - timedelta(days=10), "MOC-2026-009", [14]),
    ]
    filas: list[dict[str, str]] = []
    for i, (uni, nodo, pg, causa, frec, cons, imps, bars) in enumerate(ESCENARIOS):
        base = {
            "empresa": EMPRESA, "site": SITE, "unidad": uni, "nodo": nodo, "palabra_guia": pg,
            "causa": causa, "frecuencia_diseno": frec, "consecuencia": cons,
            "imp_economico": str(imps[0]), "imp_personas": str(imps[1]),
            "imp_ambiente": str(imps[2]), "imp_reputacion": str(imps[3]),
        }
        for tag, frr, lado in bars:
            filas.append({**base, "barrera_tag": tag, "barrera_descripcion": BARRERAS[tag],
                          "frr_diseno": str(frr), "tipo": "EXISTENTE", "lado": lado})
        for tag, desc, d, h, moc, idxs in temporales:
            if i in idxs:
                filas.append({**base, "barrera_tag": tag, "barrera_descripcion": desc, "frr_diseno": "10",
                              "tipo": "TEMPORAL", "lado": P, "vigencia_desde": d.isoformat(),
                              "vigencia_hasta": h.isoformat(), "moc_ref": moc})
    return filas


def sembrar(db: Session, reset: bool = False) -> str:
    if reset:
        for t in reversed(Base.metadata.sorted_tables):
            db.execute(t.delete())
        db.commit()
    for username, pw, rol in (("admin", "admin123", "admin"), ("lector", "lector123", "lector")):
        if db.scalars(select(Usuario).where(Usuario.username == username)).first() is None:
            db.add(Usuario(username=username, password_hash=hash_password(pw), rol=rol))
    db.commit()
    if db.scalars(select(Empresa)).first() is not None:
        return "La base ya tiene datos; seed omitido (use --reset para recargar)."
    res = importer.importar_hazop(db, filas_hazop(), usuario="seed", fuente="SEED",
                                 ts_base=recalc.ahora() - timedelta(days=30))
    db.commit()
    if res.errores:
        raise RuntimeError(f"Errores en seed: {res.errores}")
    return (f"Seed OK: {res.escenarios_creados} escenarios, {res.barreras_creadas} barreras, "
            f"{res.vinculos_creados} vínculos.")


def exportar_archivos(destino: Path) -> None:
    import csv

    from app.connectors.cmms_sim import csv_ejemplo

    destino.mkdir(parents=True, exist_ok=True)
    filas = filas_hazop()
    claves = [k for _, k, _ in importer.COLUMNAS]
    with (destino / "hazop_demo.csv").open("w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow([e for e, _, _ in importer.COLUMNAS])
        for f in filas:
            w.writerow([f.get(k, "") for k in claves])
    (destino / "plantilla_hazop.xlsx").write_bytes(importer.plantilla_xlsx())
    (destino / "cmms_ejemplo.csv").write_text(csv_ejemplo(), encoding="utf-8")


def main() -> None:
    with SessionLocal() as db:
        print(sembrar(db, reset="--reset" in sys.argv))  # noqa: T201
    if "--export" in sys.argv:
        exportar_archivos(Path("../data/demo"))
        print("Archivos de demo exportados a data/demo")  # noqa: T201


if __name__ == "__main__":
    main()
