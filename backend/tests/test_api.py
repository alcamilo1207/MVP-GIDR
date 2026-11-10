"""Pruebas de integración de la API: recorren el guion de demo de punta a punta."""

from __future__ import annotations

import io

from app.connectors.cmms_sim import csv_ejemplo
from app.services import importer


def _resumen(client, h):
    r = client.get("/dashboard/resumen", headers=h)
    assert r.status_code == 200, r.text
    return r.json()


def _subir_cmms(client, h):
    return client.post("/integraciones/cmms/csv", headers=h,
                       files={"archivo": ("cmms.csv", csv_ejemplo().encode(), "text/csv")})


def test_auth_requerida_y_roles(client, admin, lector):
    assert client.get("/dashboard/resumen").status_code == 401
    r = client.post("/auth/login", json={"username": "admin", "password": "mal"})
    assert r.status_code == 401 and r.json()["error"]["codigo"] == "CREDENCIALES_INVALIDAS"
    assert client.get("/escenarios", headers=lector).status_code == 200
    r = client.post("/recalcular", headers=lector)
    assert r.status_code == 403 and r.json()["error"]["codigo"] == "PROHIBIDO"
    assert _subir_cmms(client, lector).status_code == 403


def test_seed_riesgo_actual_igual_a_diseno(client, admin):
    r = _resumen(client, admin)
    assert r["escenarios_total"] == 25
    assert r["escenarios_en_brecha"] == 0
    assert r["pct_barreras_disponibles"] == 100.0
    assert all(c["diseno"] == c["actual"] for c in r["mapa_calor"])
    esc = client.get("/escenarios?size=100", headers=admin).json()
    assert esc["total"] == 25
    assert all(e["resultado"]["brecha"] == 0 for e in esc["items"])


def test_guion_demo_completo(client, admin):
    # 2) cargar CMMS
    r = _subir_cmms(client, admin)
    assert r.status_code == 200, r.text
    ing = r.json()
    assert ing["aceptados"] == 6 and ing["no_mapeados"] == ["XV-999"]
    assert len(ing["cambios_estado"]) == 6 and ing["escenarios_recalculados"] > 5
    # 3) escenarios en brecha y mapa de calor cambia
    res = _resumen(client, admin)
    assert res["escenarios_en_brecha"] >= 8
    assert res["pct_barreras_disponibles"] < 100
    assert any(c["diseno"] != c["actual"] for c in res["mapa_calor"])
    top = res["priorizados"][0]
    assert top["brecha"] == 2
    # idempotencia de la ingesta
    again = _subir_cmms(client, admin).json()
    assert again["aceptados"] == 0 and again["duplicados"] == 6
    # 4) BowTie con barrera fuera de servicio
    bt = client.get(f"/bowtie/{top['escenario_id']}", headers=admin).json()
    estados = [b["estado_actual"] for b in bt["preventivas"] + bt["mitigativas"]]
    assert "FUERA_DE_SERVICIO" in estados
    assert bt["resultado"]["brecha"] == 2
    # 5) barrera temporal con MOC cierra la brecha
    r = client.post("/barreras", headers=admin, json={
        "tag_activo": "TMP-DEMO-1", "descripcion": "Operador dedicado + lazo temporal", "tipo": "TEMPORAL",
        "vigencia_desde": "2000-01-01", "vigencia_hasta": "2999-12-31", "moc_ref": "MOC-DEMO-01",
        "vinculos": [{"escenario_id": top["escenario_id"], "frr_diseno": 100}]})
    assert r.status_code == 201, r.text
    det = client.get(f"/escenarios/{top['escenario_id']}/resultado", headers=admin).json()
    assert det["resultado"]["brecha"] == 0
    assert det["resultado"]["motivo"].startswith("Alta de barrera temporal")
    assert len(det["historial"]) >= 3
    # 6) historial y auditoría
    barr = client.get("/barreras?estado=FUERA_DE_SERVICIO", headers=admin).json()
    assert barr["total"] == 2
    h = client.get(f"/barreras/{barr['items'][0]['id']}/historial", headers=admin).json()
    assert len(h) == 2 and h[0]["estado"] == "FUERA_DE_SERVICIO"
    aud = client.get("/auditoria?accion=CAMBIO_ESTADO_BARRERA", headers=admin).json()
    assert aud["total"] == 6
    assert client.get("/auditoria?accion=CREAR_BARRERA_TEMPORAL", headers=admin).json()["total"] == 1


def test_simular_evento_dry_run_y_aplicar(client, admin):
    b = client.get("/barreras?q=SIS-V202-LSLL", headers=admin).json()["items"][0]
    sim = client.post(f"/barreras/{b['id']}/estado", headers=admin,
                      json={"estado": "FUERA_DE_SERVICIO", "aplicar": False}).json()
    assert sim["aplicado"] is False and len(sim["impacto"]) == b["n_escenarios"] == 2
    assert max(i["despues"]["brecha"] for i in sim["impacto"]) == 2
    assert client.get(f"/barreras/{b['id']}", headers=admin).json()["estado_actual"] == "DISPONIBLE"
    ap = client.post(f"/barreras/{b['id']}/estado", headers=admin,
                     json={"estado": "FUERA_DE_SERVICIO"}).json()
    assert ap["aplicado"] is True
    det = client.get(f"/barreras/{b['id']}", headers=admin).json()
    assert det["estado_actual"] == "FUERA_DE_SERVICIO"
    assert max(d["brecha"] for d in det["dependientes"]) == 2
    # revertir
    client.post(f"/barreras/{b['id']}/estado", headers=admin, json={"estado": "DISPONIBLE"})
    assert _resumen(client, admin)["escenarios_en_brecha"] == 0


def test_cmms_json_y_tag_no_mapeado(client, admin):
    r = client.post("/integraciones/cmms/estado-barreras", headers=admin, json={"eventos": [
        {"tag_activo": "PSV-101", "estado": "mantenimiento", "fuente": "TEST"},
        {"tag_activo": "NO-EXISTE", "estado": "DEGRADADO"},
        {"tag_activo": "PSV-103", "estado": "volando"}]})
    j = r.json()
    assert r.status_code == 200 and j["no_mapeados"] == ["NO-EXISTE"]
    assert j["aceptados"] == 1 and len(j["errores"]) == 1
    assert j["cambios_estado"][0]["despues"] == "EN_MANTENIMIENTO"


def test_evento_antiguo_no_pisa_estado_actual(client, admin):
    ev = lambda estado, fecha: {"tag_activo": "PSV-103", "estado": estado, "fecha": fecha}  # noqa: E731
    client.post("/integraciones/cmms/estado-barreras", headers=admin, json={"eventos": [
        ev("FUERA_DE_SERVICIO", "2026-12-10T10:00:00Z")]})
    client.post("/integraciones/cmms/estado-barreras", headers=admin, json={"eventos": [
        ev("DEGRADADO", "2026-12-09T10:00:00Z")]})  # más viejo: solo historial
    b = client.get("/barreras?q=PSV-103", headers=admin).json()["items"][0]
    assert b["estado_actual"] == "FUERA_DE_SERVICIO"


def test_importador_idempotente_y_errores_por_fila(client, admin):
    plantilla = importer.plantilla_csv().encode()
    r1 = client.post("/integraciones/hazop/importar", headers=admin,
                     files={"archivo": ("p.csv", plantilla, "text/csv")}).json()
    assert r1["filas_aceptadas"] == 2 and r1["escenarios_creados"] == 1 and r1["barreras_creadas"] == 2
    r2 = client.post("/integraciones/hazop/importar", headers=admin,
                     files={"archivo": ("p.csv", plantilla, "text/csv")}).json()
    assert r2["escenarios_creados"] == 0 and r2["barreras_creadas"] == 0 and r2["vinculos_creados"] == 0
    assert r2["escenarios_sin_cambios"] == 1 and r2["escenarios_recalculados"] == 0
    # fila con errores
    malo = plantilla.decode().splitlines()
    malo.append(",".join(["E", "S", "U", "N", "PG", "causa", "Z", "cons", "9", "1", "1", "1", "", "", "", "", "", "", "", ""]))
    r3 = client.post("/integraciones/hazop/importar", headers=admin,
                     files={"archivo": ("p.csv", "\n".join(malo).encode(), "text/csv")}).json()
    campos = {e["campo"] for e in r3["errores"]}
    assert {"frecuencia_diseno", "imp_economico"} <= campos and r3["errores"][0]["fila"] == 4
    assert r3["filas_aceptadas"] == 2
    # cambio de un campo de entrada => nueva versión
    cambiado = plantilla.decode().replace(",B,Sobrecalentamiento de tubos,4,", ",C,Sobrecalentamiento de tubos,4,")
    r4 = client.post("/integraciones/hazop/importar", headers=admin,
                     files={"archivo": ("p.csv", cambiado.encode(), "text/csv")}).json()
    assert r4["escenarios_actualizados"] == 1 and r4["escenarios_recalculados"] == 1


def test_importar_xlsx_y_formato_invalido(client, admin):
    r = client.post("/integraciones/hazop/importar", headers=admin,
                    files={"archivo": ("p.xlsx", importer.plantilla_xlsx(), "application/octet-stream")})
    assert r.status_code == 200 and r.json()["filas_aceptadas"] == 2
    r = client.post("/integraciones/hazop/importar", headers=admin, files={"archivo": ("x.pdf", b"abc", "application/pdf")})
    assert r.status_code == 415 and r.json()["error"]["codigo"] == "FORMATO_NO_SOPORTADO"
    r = client.post("/integraciones/hazop/importar", headers=admin,
                    files={"archivo": ("x.csv", b"a,b\n1,2\n", "text/csv")})
    assert r.status_code == 422 and r.json()["error"]["codigo"] == "COLUMNAS_FALTANTES"
    assert client.get("/integraciones/hazop/plantilla?formato=csv", headers=admin).status_code == 200
    assert len(client.get("/integraciones/hazop/plantilla", headers=admin).content) > 1000
    assert "tag_activo" in client.get("/integraciones/cmms/ejemplo", headers=admin).text
    assert any(c["nombre"] == "SAP_PM" for c in client.get("/integraciones/conectores", headers=admin).json())


def test_stub_conector_no_implementado():
    import pytest

    from app.connectors import REGISTRO

    for nombre in ("RONDAS", "IOW", "LMS", "SAP_PM"):
        with pytest.raises(NotImplementedError):
            REGISTRO[nombre]().normalizar([])


def test_escenarios_filtros_paginacion_y_crud(client, admin):
    sites = client.get("/sites", headers=admin).json()["items"]
    uni = client.get(f"/unidades?site_id={sites[0]['id']}", headers=admin).json()["items"]
    assert len(sites) == 1 and len(uni) == 2
    pag = client.get(f"/escenarios?unidad_id={uni[0]['id']}&size=5&page=2", headers=admin).json()
    assert pag["size"] == 5 and len(pag["items"]) == 5 and pag["total"] > 10
    d = client.get("/escenarios/1", headers=admin).json()
    assert d["resultado"]["riesgo_inherente"] and len(d["barreras"]) == 3
    # alta + nueva versión
    pg = client.get("/palabras-guia?size=1", headers=admin).json()["items"][0]
    body = {"palabra_guia_id": pg["id"], "causa": "Causa nueva", "frecuencia_diseno": "A", "consecuencia": "X",
            "imp_economico": 5, "imp_personas": 1, "imp_ambiente": 1, "imp_reputacion": 1}
    nuevo = client.post("/escenarios", headers=admin, json=body)
    assert nuevo.status_code == 201 and nuevo.json()["resultado"]["riesgo_actual"] == "Extremo"
    eid = nuevo.json()["id"]
    up = client.put(f"/escenarios/{eid}", headers=admin, json={"imp_economico": 2}).json()
    assert up["version"] == 2 and up["resultado"]["riesgo_actual"] == "Alto"
    assert client.post("/escenarios", headers=admin, json={**body, "imp_economico": 9}).status_code == 422
    assert client.post("/escenarios", headers=admin, json={**body, "riesgo_actual": "Bajo"}).status_code == 422
    assert client.post("/escenarios", headers=admin, json=body).status_code == 409  # duplicado
    # vincular / desvincular barrera
    b = client.get("/barreras?q=PSV-101", headers=admin).json()["items"][0]
    v = client.post(f"/escenarios/{eid}/barreras", headers=admin, json={"barrera_id": b["id"], "frr_diseno": 100})
    assert v.status_code == 201 and v.json()["resultado"]["frr_actual_total"] == 100
    assert client.post(f"/escenarios/{eid}/barreras", headers=admin, json={"barrera_id": b["id"], "frr_diseno": 100}).status_code == 409
    assert client.delete(f"/escenarios/{eid}/barreras/{b['id']}", headers=admin).status_code == 204
    assert client.delete(f"/escenarios/{eid}", headers=admin).status_code == 204
    assert client.get(f"/escenarios/{eid}", headers=admin).status_code == 404


def test_jerarquia_crud_y_barrera_crud(client, admin):
    e = client.post("/empresas", headers=admin, json={"nombre": "Otra"})
    assert e.status_code == 201
    assert client.post("/empresas", headers=admin, json={"nombre": "Otra"}).status_code == 409
    eid = e.json()["id"]
    assert client.put(f"/empresas/{eid}", headers=admin, json={"nombre": "Otra2"}).json()["nombre"] == "Otra2"
    assert client.get(f"/empresas/{eid}", headers=admin).status_code == 200
    assert client.delete(f"/empresas/{eid}", headers=admin).status_code == 204
    assert client.get(f"/empresas/{eid}", headers=admin).status_code == 404
    bad = client.post("/barreras", headers=admin, json={"tag_activo": "T", "descripcion": "d", "tipo": "TEMPORAL"})
    assert bad.status_code == 422
    ok = client.post("/barreras", headers=admin, json={"tag_activo": "NUEVA-1", "descripcion": "d"})
    bid = ok.json()["id"]
    assert client.post("/barreras", headers=admin, json={"tag_activo": "NUEVA-1", "descripcion": "d"}).status_code == 409
    assert client.put(f"/barreras/{bid}", headers=admin, json={"descripcion": "nueva"}).json()["descripcion"] == "nueva"
    assert client.delete(f"/barreras/{bid}", headers=admin).status_code == 204
    assert client.get("/barreras/99999", headers=admin).status_code == 404


def test_indicadores_api754_y_acciones(client, admin):
    ini = client.get("/indicadores/api754", headers=admin).json()
    assert "validar con API RP 754" in ini["aviso"]
    assert ini["tier3"]["escenarios_con_brecha"] == 0 and ini["tier4"]["acciones_abiertas"] == 0
    assert ini["tier4"]["temporales_activas"] == 1 and len(ini["tier4"]["temporales_proximas_a_vencer"]) == 1
    _subir_cmms(client, admin)
    j = client.get("/indicadores/api754", headers=admin).json()
    assert j["tier3"]["barreras_fuera_de_servicio"] == 2 and j["tier3"]["barreras_degradadas"] == 2
    assert j["tier3"]["tiempo_acumulado_horas"] > 10 and j["tier3"]["escenarios_con_brecha"] >= 8
    assert j["tier4"]["acciones_abiertas"] == j["tier3"]["escenarios_con_brecha"]
    acc = client.get("/acciones?estado=ABIERTA&size=1", headers=admin).json()["items"][0]
    assert client.post(f"/acciones/{acc['id']}/cerrar", headers=admin).json()["estado"] == "CERRADA"
    m = client.post("/acciones", headers=admin, json={"descripcion": "Revisar", "escenario_id": 1})
    assert m.status_code == 201 and m.json()["origen"] == "MANUAL"


def test_recalculo_masivo_config_y_temporales(client, admin, db):
    r = client.post("/recalcular", headers=admin).json()
    assert r["escenarios"] == 25 and r["version_motor"] == "1.0.0"
    assert client.post("/recalcular", headers=admin, json={"escenario_ids": [1, 2]}).json()["escenarios"] == 2
    cfg = client.get("/configuracion", headers=admin).json()
    assert len(cfg["matriz"]) == 25 and cfg["politica_estado"]["DEGRADADO"] == 0.1
    up = client.put("/configuracion/politica/DEGRADADO", headers=admin, json={"multiplicador_frr": 0.5}).json()
    assert up["politica_estado"]["DEGRADADO"] == 0.5
    assert client.put("/configuracion/matriz", headers=admin,
                      json=[{"frecuencia": "A", "severidad": 5, "nivel": "Alto"}]).status_code == 200
    from app.services import recalc

    assert recalc.recalcular_por_temporales(db).escenarios == 0  # nada cambió respecto al resultado vigente
    assert client.get("/health").json()["estado"] == "ok"
    assert client.get("/escenarios/9999/resultado", headers=admin).status_code == 404
    assert client.get("/ruta-inexistente", headers=admin).json()["error"]["codigo"] == "HTTP_404"


def test_password_helpers():
    from app.security import hash_password, verificar_password

    h = hash_password("x")
    assert verificar_password("x", h) and not verificar_password("y", h) and not verificar_password("x", "basura")


def test_xlsx_roundtrip_lectura():
    filas = importer.leer_tabla(importer.plantilla_xlsx(), "a.xlsx")
    assert filas[0]["palabra_guia"] == "Más temperatura" and filas[1]["tipo"] == "TEMPORAL"
    assert io.BytesIO(importer.plantilla_xlsx()).getbuffer().nbytes > 0


def test_gemelo_digital_vinculos_y_telemetria_ws(client, admin):
    vinculos = client.get("/integraciones/gemelo/vinculos", headers=admin).json()
    assert len(vinculos) >= 5
    primer_tag = vinculos[0]["tag_gemelo"]

    # Enviar telemetría por REST al Gemelo Digital
    res = client.post(
        "/integraciones/gemelo/telemetria",
        headers=admin,
        json={"lecturas": [{"tag_gemelo": primer_tag, "valor": 95.0, "estado_manual": "DEGRADADO", "factor_degradacion": 70}]},
    )
    assert res.status_code == 200
    assert res.json()["barreras_actualizadas"] == 1

    # Probar canales WebSocket (/ws/eventos y /ws/gemelo)
    with client.websocket_connect("/ws/eventos") as ws_ev:
        saludo = ws_ev.receive_json()
        assert saludo["tipo"] == "CONEXION_ESTABLECIDA"

    with client.websocket_connect("/ws/gemelo") as ws_gd:
        ws_gd.send_json({"lecturas": [{"tag_gemelo": primer_tag, "valor": 0.0, "estado_manual": "DISPONIBLE"}]})
        resp = ws_gd.receive_json()
        assert resp["barreras_actualizadas"] == 1

