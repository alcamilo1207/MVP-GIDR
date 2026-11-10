"""Genera HTML de reportes de una página para acciones GIDR (se convierten a PDF con Chrome headless)."""
import html
from pathlib import Path

OUT = Path(__file__).parent / "html"
OUT.mkdir(exist_ok=True)

ACCIONES = [
    {
        "id": "ACT-006", "archivo": "ACT-006_Full_Stroke_Test_XV101",
        "titulo": "Prueba de carrera completa (Full Stroke Test) de válvulas de corte rápido XV-101A/B de gas",
        "riesgo_id": "RSK-003", "riesgo": "Disparo no disponible de lazo SIS de muy alta temperatura en piel de tubos TSHH",
        "escenario": "1.1 · Horno H-101", "tag": "SIS-H101-TSHH", "nivel_riesgo": "Extremo",
        "nivel_accion": "Nivel Barrera", "responsable": "Javier Morales",
        "creacion": "2026-10-18", "vencimiento": "2026-10-30",
        "obs": "Prueba ejecutada con éxito. Tiempo de cierre < 1.8 s conforme a requerimiento SIL 2.",
        "soportes": [("Reporte_FST_XV101_Gas.pdf", "PDF", "468.8 KB", "2026-10-30"),
                     ("Foto_Inspeccion_Valvula_XV101.jpg", "Imagen", "605.5 KB", "2026-10-30")],
    },
    {
        "id": "ACT-002", "archivo": "ACT-002_Actualizacion_POE_CDU_04",
        "titulo": "Actualizar procedimiento operativo estándar POE-CDU-04 para respuesta ante corte de carga",
        "riesgo_id": "RSK-001", "riesgo": "Pérdida de flujo de crudo por serpentín radiante y sobrecalentamiento de tubos",
        "escenario": "1.2 · Horno H-101", "tag": "FIC-H101", "nivel_riesgo": "Alto",
        "nivel_accion": "Nivel Causa", "responsable": "Laura Gómez",
        "creacion": "2026-10-12", "vencimiento": "2026-11-05",
        "obs": "Procedimiento divulgado a todo el personal de consola y campo con registro de asistencia.",
        "soportes": [("POE-CDU-04_CorteCarga_Firmado.pdf", "PDF", "337.1 KB", "2026-11-05")],
    },
    {
        "id": "ACT-014", "archivo": "ACT-014_Sustitucion_Sellos_K201",
        "titulo": "Sustitución de sellos primarios de gas seco y verificación de presión de gas de barrera N2",
        "riesgo_id": "RSK-009", "riesgo": "Fuga de gas de reciclo con alta concentración de H2S en sellos de compresor",
        "escenario": "1.9 · Compresor K-201", "tag": "GD-H101", "nivel_riesgo": "Alto",
        "nivel_accion": "Nivel Causa", "responsable": "Andrés Castro",
        "creacion": "2026-11-01", "vencimiento": "2026-11-04",
        "obs": "Sellos mecánicos cambiados por John Crane Tipo 28AT con prueba de estanqueidad conforme.",
        "soportes": [("Reporte_Cambio_Sellos_K201.pdf", "PDF", "410.2 KB", "2026-11-04")],
    },
    {
        "id": "ACT-015", "archivo": "ACT-015_Calibracion_Detectores_H2S",
        "titulo": "Calibración de cabezales detectores electroquímicos de H2S en periferia de caseta K-201",
        "riesgo_id": "RSK-009", "riesgo": "Fuga de gas de reciclo con alta concentración de H2S en sellos de compresor",
        "escenario": "1.9 · Compresor K-201", "tag": "GD-H101", "nivel_riesgo": "Alto",
        "nivel_accion": "Nivel Barrera", "responsable": "Valentina Herrera",
        "creacion": "2026-11-01", "vencimiento": "2026-11-06",
        "obs": "4 detectores calibrados con gas patrón 25 PPM H2S / Balance N2 con curva de respuesta ok.",
        "soportes": [("Certificado_Calibracion_H2S_K201.pdf", "PDF", "283.2 KB", "2026-11-06"),
                     ("Foto_Detector_H2S_Calibrado.png", "Imagen", "371.1 KB", "2026-11-06")],
    },
]

COLOR_NIVEL = {"Extremo": "#b91c1c", "Alto": "#ea580c", "Medio": "#ca8a04", "Bajo": "#15803d"}

CSS = """
@page { size: A4; margin: 0; }
* { box-sizing: border-box; }
body { font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif; color: #1e293b; margin: 0; font-size: 11.5px; }
.page { width: 210mm; height: 297mm; padding: 16mm 16mm 12mm; position: relative; overflow: hidden; }
.header { background: #1e4e79; color: #fff; padding: 12px 16px; border-radius: 4px; display: flex; justify-content: space-between; align-items: center; }
.header h1 { margin: 0; font-size: 17px; letter-spacing: .3px; }
.header .sub { font-size: 10.5px; opacity: .85; margin-top: 2px; }
.badge { background: #fff; color: #1e4e79; font-weight: 700; padding: 5px 12px; border-radius: 3px; font-size: 14px; font-family: Menlo, monospace; }
h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .6px; color: #1e4e79; border-bottom: 1.5px solid #1e4e79; padding-bottom: 3px; margin: 18px 0 8px; }
.titulo { font-size: 15px; font-weight: 700; line-height: 1.35; margin: 16px 0 4px; }
table { width: 100%; border-collapse: collapse; }
td, th { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; vertical-align: top; }
th { background: #f0f4f8; width: 24%; font-weight: 600; color: #334155; }
.thead th { width: auto; }
.pill { display: inline-block; padding: 2px 10px; border-radius: 10px; font-weight: 700; font-size: 10.5px; color: #fff; }
.ok { background: #15803d; }
.bar { height: 10px; background: #e2e8f0; border-radius: 5px; overflow: hidden; }
.bar > div { height: 100%; width: 100%; background: #15803d; }
.obs { border: 1px solid #cbd5e1; background: #f8fafc; padding: 10px 12px; border-radius: 3px; line-height: 1.5; min-height: 54px; }
.firmas { position: absolute; left: 16mm; right: 16mm; bottom: 26mm; display: flex; gap: 24px; }
.firma { flex: 1; text-align: center; font-size: 10.5px; color: #475569; }
.firma .linea { border-top: 1px solid #334155; margin-top: 38px; padding-top: 4px; }
.footer { position: absolute; left: 16mm; right: 16mm; bottom: 10mm; font-size: 9.5px; color: #64748b; display: flex; justify-content: space-between; border-top: 1px solid #e2e8f0; padding-top: 5px; }
"""


def esc(s):
    return html.escape(str(s))


def render(a):
    cn = COLOR_NIVEL.get(a["nivel_riesgo"], "#475569")
    filas = "".join(
        f"<tr><td>{esc(n)}</td><td>{esc(t)}</td><td>{esc(s)}</td><td>{esc(f)}</td></tr>"
        for n, t, s, f in a["soportes"]
    )
    return f"""<!doctype html><html lang="es"><head><meta charset="utf-8"><title>{esc(a['id'])}</title>
<style>{CSS}</style></head><body><div class="page">
<div class="header"><div><h1>Reporte de Cierre de Acción</h1>
<div class="sub">GIDR · Gestión de Riesgos · Acción de mitigación</div></div>
<div class="badge">{esc(a['id'])}</div></div>

<div class="titulo">{esc(a['titulo'])}</div>

<h2>Información general</h2>
<table>
<tr><th>ID de acción</th><td>{esc(a['id'])}</td><th>Nivel de acción</th><td>{esc(a['nivel_accion'])}</td></tr>
<tr><th>Responsable</th><td>{esc(a['responsable'])}</td><th>Estado</th><td><span class="pill ok">Finalizada</span></td></tr>
<tr><th>Fecha de creación</th><td>{esc(a['creacion'])}</td><th>Fecha de vencimiento</th><td>{esc(a['vencimiento'])}</td></tr>
<tr><th>Avance</th><td colspan="3"><div style="display:flex;align-items:center;gap:10px"><div class="bar" style="flex:1"><div></div></div><b>100%</b></div></td></tr>
</table>

<h2>Riesgo asociado</h2>
<table>
<tr><th>ID de riesgo</th><td>{esc(a['riesgo_id'])}</td><th>Nivel de riesgo</th><td><span class="pill" style="background:{cn}">{esc(a['nivel_riesgo'])}</span></td></tr>
<tr><th>Escenario PHA</th><td>{esc(a['escenario'])}</td><th>Tag asociado</th><td style="font-family:Menlo,monospace">{esc(a['tag'])}</td></tr>
<tr><th>Descripción del riesgo</th><td colspan="3">{esc(a['riesgo'])}</td></tr>
</table>

<h2>Observaciones</h2>
<div class="obs">{esc(a['obs'])}</div>

<h2>Archivos de soporte ({len(a['soportes'])})</h2>
<table class="thead"><tr><th>Archivo</th><th style="width:70px">Tipo</th><th style="width:80px">Tamaño</th><th style="width:90px">Fecha</th></tr>{filas}</table>
<p style="margin:8px 0 0;color:#15803d;font-weight:600">✓ Soporte documental verificado para el cierre de la acción.</p>

<div class="firmas">
<div class="firma"><div class="linea">Responsable de la acción<br><b>{esc(a['responsable'])}</b></div></div>
<div class="firma"><div class="linea">Revisión / Aprobación<br>&nbsp;</div></div>
</div>
<div class="footer"><span>GIDR · MVP Gestión Integral de Riesgos</span><span>Reporte {esc(a['id'])} · Generado el 2026-11-10</span></div>
</div></body></html>"""


for a in ACCIONES:
    (OUT / f"{a['archivo']}.html").write_text(render(a), encoding="utf-8")
    print(a["archivo"])
