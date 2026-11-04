from __future__ import annotations

from datetime import date, timedelta

import pytest

from app.domain.engine import BarreraEntrada, ConfigMotor, Impactos, core, evaluar_escenario
from app.domain.engine.constants import matriz_defecto, puntaje_a_nivel

HOY = date(2026, 10, 15)
IMP = Impactos(2, 4, 3, 1)  # severidad 4


def barrera(tag="B1", frr=100.0, estado="DISPONIBLE", tipo="EXISTENTE", **kw):
    return BarreraEntrada(tag=tag, tipo=tipo, frr_diseno=frr, estado=estado, **kw)


def evaluar(freq, barreras, imp=IMP, config=None, hoy=HOY):
    return evaluar_escenario(freq, imp, barreras, config or ConfigMotor(), hoy)


def test_disponible_sin_cambios_actual_igual_diseno():
    r = evaluar("B", [barrera("B1", 100), barrera("B2", 10)])
    assert r.riesgo_actual == r.riesgo_diseno
    assert r.brecha == 0
    assert r.frr_actual_total == r.frr_diseno_total == 1000


def test_mantenimiento_genera_brecha_positiva():
    ok = evaluar("B", [barrera("B1", 100), barrera("B2", 10)])
    r = evaluar("B", [barrera("B1", 100, "EN_MANTENIMIENTO"), barrera("B2", 10)])
    assert ok.riesgo_diseno == "Bajo" and r.riesgo_diseno == "Bajo"
    assert r.frr_actual_total == 10
    assert r.frecuencia_actual == "C"
    assert r.riesgo_actual == "Alto"
    assert r.brecha == 2


def test_temporal_vigente_compensa():
    base = [barrera("B1", 100, "FUERA_DE_SERVICIO"), barrera("B2", 10)]
    sin = evaluar("B", base)
    con = evaluar("B", [*base, barrera("T1", 100, tipo="TEMPORAL", vigencia_desde=HOY - timedelta(days=1), vigencia_hasta=HOY + timedelta(days=5))])
    assert sin.brecha == 2
    assert con.brecha == 0
    assert con.frr_actual_total == 1000
    assert con.frr_diseno_total == 1000  # la temporal no cuenta en diseño


def test_frecuencia_satura_en_e():
    r = evaluar("C", [barrera("B1", 1000), barrera("B2", 1000)])
    assert r.frecuencia_diseno_resid == "E"
    assert r.frecuencia_actual == "E"
    # La degradación de una barrera con margen sobrante no produce brecha
    r2 = evaluar("C", [barrera("B1", 1000), barrera("B2", 1000, "DEGRADADO")])
    assert r2.frecuencia_actual == "E" and r2.brecha == 0


def test_temporal_vencida_o_futura_sin_efecto():
    vencida = barrera("T1", 100, tipo="TEMPORAL", vigencia_hasta=HOY - timedelta(days=1))
    futura = barrera("T2", 100, tipo="TEMPORAL", vigencia_desde=HOY + timedelta(days=1), vigencia_hasta=HOY + timedelta(days=9))
    base = [barrera("B1", 100, "EN_MANTENIMIENTO")]
    r = evaluar("B", [*base, vencida, futura])
    assert r.frr_actual_total == 1
    assert all(not d.vigente for d in r.barreras if d.tipo == "TEMPORAL")
    assert r.brecha == evaluar("B", base).brecha


def test_barrera_compartida_afecta_ambos_escenarios():
    estados = {"SHARED": "FUERA_DE_SERVICIO"}

    def esc(freq, extra):
        return evaluar(freq, [barrera("SHARED", 100, estados["SHARED"]), barrera("X", extra)])

    assert esc("B", 10).brecha > 0
    assert esc("C", 10).brecha > 0


def test_degradado_aplica_multiplicador_y_sin_credito_si_menor_a_uno():
    assert core.frr_efectivo(100, "DEGRADADO", ConfigMotor().multiplicadores) == pytest.approx(10)
    assert core.frr_efectivo(10, "DEGRADADO", ConfigMotor().multiplicadores) == 1.0
    assert core.frr_efectivo(10, "INEXISTENTE", ConfigMotor().multiplicadores) == 1.0
    assert core.frr_efectivo(10, "ESTADO_RARO", ConfigMotor().multiplicadores) == 1.0


def test_floor_log10_exacto_en_potencias_de_diez():
    for k in range(0, 6):
        assert core.decadas(10.0**k) == k
    assert core.decadas(999) == 2
    assert core.decadas(0.5) == 0


def test_sin_barreras_riesgo_inherente_igual_diseno():
    r = evaluar("A", [], imp=Impactos(5, 1, 1, 1))
    assert r.riesgo_inherente == r.riesgo_diseno == r.riesgo_actual == "Extremo"
    assert r.puntaje_actual == 25


def test_temporal_degradada_usa_multiplicador():
    t = barrera("T1", 100, "DEGRADADO", tipo="TEMPORAL", vigencia_hasta=HOY)
    r = evaluar("B", [t])
    assert r.frr_actual_total == pytest.approx(10)


def test_brecha_negativa_si_temporal_mejora_el_diseno():
    t = barrera("T1", 1000, tipo="TEMPORAL", vigencia_hasta=HOY + timedelta(days=3))
    r = evaluar("B", [barrera("B1", 10), t])
    assert r.brecha < 0


def test_estrategia_severidad_intercambiable():
    cfg = ConfigMotor(estrategia_severidad=lambda i: i.personas)
    r = evaluar("A", [], imp=Impactos(5, 1, 1, 1), config=cfg)
    assert r.severidad == 1


def test_matriz_defecto_y_validaciones():
    m = matriz_defecto()
    assert m[(0, 5)] == "Extremo" and m[(4, 1)] == "Bajo" and m[(4, 5)] == "Medio"
    assert puntaje_a_nivel(10) == "Alto"
    with pytest.raises(ValueError):
        puntaje_a_nivel(99)
    with pytest.raises(ValueError):
        core.indice_frecuencia("Z")
    with pytest.raises(ValueError):
        core.nivel_matriz(ConfigMotor(), 9, 9)


def test_matriz_personalizada():
    cfg = ConfigMotor(matriz={k: "Bajo" for k in matriz_defecto()})
    assert evaluar("A", [], config=cfg).riesgo_actual == "Bajo"


def test_temporal_sin_limites_es_vigente():
    t = barrera("T1", 100, tipo="TEMPORAL")
    assert core.temporal_vigente(t, HOY)


def test_factor_degradacion_y_riesgo_por_impacto():
    b_deg50 = barrera("B1", 100, "DEGRADADO", factor_degradacion=50)
    r = evaluar("B", [b_deg50], imp=Impactos(economico=5, personas=3, ambiente=2, reputacion=1))
    assert r.frr_actual_total == pytest.approx(50.0)
    assert r.frecuencia_actual == "C"  # B (idx 1) + floor(log10(50))=1 -> C (idx 2)
    assert r.riesgo_actual_economico == "Extremo"  # (5-2)*5 = 15
    assert r.riesgo_actual_personas == "Medio"     # (5-2)*3 = 9
    assert r.riesgo_actual_ambiente == "Medio"     # (5-2)*2 = 6
    assert r.riesgo_actual_reputacion == "Bajo"    # (5-2)*1 = 3
