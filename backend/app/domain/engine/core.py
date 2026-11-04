"""Motor de riesgo GIDR (módulo puro, sin dependencias de FastAPI/SQLAlchemy).

Algoritmo (ver ``docs/supuestos.md``):
    1. severidad = estrategia(impactos)  (por defecto, máximo)
    2. riesgo_inherente = matriz(frecuencia_diseno, severidad)
    3. FRR_diseno_total = producto FRR de barreras EXISTENTES
       frecuencia_tras_diseno = min(E, idx + floor(log10(FRR_diseno_total)))
    4-6. FRR efectivo = frr * multiplicador(estado); <1 -> 1 (sin crédito).
         Temporales: solo dentro de vigencia. frecuencia_actual análoga.
    7. riesgo_actual = matriz(frecuencia_actual, severidad)
    8. brecha = nivel(riesgo_actual) - nivel(riesgo_diseno)
"""

from __future__ import annotations

import math
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, field
from datetime import date

from app.domain.engine import constants as c

SeveridadFn = Callable[["Impactos"], int]


@dataclass(frozen=True)
class Impactos:
    economico: int
    personas: int
    ambiente: int
    reputacion: int


def severidad_maxima(imp: Impactos) -> int:
    """Estrategia por defecto: severidad = máximo de los cuatro impactos."""
    return max(imp.economico, imp.personas, imp.ambiente, imp.reputacion)


@dataclass(frozen=True)
class ConfigMotor:
    """Configuración (por empresa) que recibe el motor."""

    matriz: Mapping[tuple[int, int], str] = field(default_factory=c.matriz_defecto)
    multiplicadores: Mapping[str, float] = field(
        default_factory=lambda: dict(c.MULTIPLICADORES_DEFECTO)
    )
    estrategia_severidad: SeveridadFn = severidad_maxima
    version: str = c.VERSION_MOTOR


@dataclass(frozen=True)
class BarreraEntrada:
    tag: str
    tipo: str  # EXISTENTE | TEMPORAL
    frr_diseno: float
    estado: str
    vigencia_desde: date | None = None
    vigencia_hasta: date | None = None
    lado: str = "PREVENTIVA"
    factor_degradacion: int | None = None


@dataclass(frozen=True)
class DetalleBarrera:
    tag: str
    tipo: str
    estado: str
    frr_diseno: float
    frr_efectivo: float
    cuenta_en_diseno: bool
    vigente: bool  # False solo para temporales fuera de vigencia
    factor_degradacion: int = 90


@dataclass(frozen=True)
class ResultadoMotor:
    severidad: int
    riesgo_inherente: str
    frr_diseno_total: float
    frecuencia_diseno_resid: str
    riesgo_diseno: str
    frr_actual_total: float
    frecuencia_actual: str
    riesgo_actual: str
    puntaje_diseno: int
    puntaje_actual: int
    brecha: int
    barreras: tuple[DetalleBarrera, ...]
    version_motor: str
    riesgo_diseno_economico: str = "Bajo"
    riesgo_diseno_personas: str = "Bajo"
    riesgo_diseno_ambiente: str = "Bajo"
    riesgo_diseno_reputacion: str = "Bajo"
    riesgo_actual_economico: str = "Bajo"
    riesgo_actual_personas: str = "Bajo"
    riesgo_actual_ambiente: str = "Bajo"
    riesgo_actual_reputacion: str = "Bajo"


def indice_frecuencia(frecuencia: str) -> int:
    try:
        return c.FRECUENCIAS.index(frecuencia)
    except ValueError as exc:
        raise ValueError(f"Frecuencia inválida: {frecuencia!r}") from exc


def nivel_matriz(config: ConfigMotor, idx_frecuencia: int, severidad: int) -> str:
    try:
        return config.matriz[(idx_frecuencia, severidad)]
    except KeyError as exc:
        raise ValueError(f"Celda de matriz inexistente: {(idx_frecuencia, severidad)}") from exc


def indice_nivel(nivel: str) -> int:
    return c.NIVELES.index(nivel)


def decadas(frr_total: float) -> int:
    """floor(log10(frr_total)) con tolerancia numérica; 0 si frr_total <= 1."""
    if frr_total <= 1:
        return 0
    return math.floor(math.log10(frr_total) + c.EPSILON_LOG)


def frecuencia_tras_frr(idx_diseno: int, frr_total: float) -> int:
    """Desplaza la frecuencia hacia 'E' por cada década de FRR (satura en E)."""
    return min(c.IDX_MAX_FRECUENCIA, idx_diseno + c.CATEGORIAS_POR_DECADA * decadas(frr_total))


def frr_efectivo(
    frr_diseno: float,
    estado: str,
    multiplicadores: Mapping[str, float],
    factor_degradacion: int | None = None,
) -> float:
    """FRR × multiplicador(estado); si DEGRADADO con factor_degradacion (1..100), usa (100 - D)/100."""
    if estado == "DEGRADADO" and factor_degradacion is not None and factor_degradacion != 90:
        mult = max(0.0, min(1.0, (100 - factor_degradacion) / 100.0))
    else:
        mult = multiplicadores.get(estado, 0.0)
    efectivo = frr_diseno * mult
    return efectivo if efectivo >= 1 else 1.0


def temporal_vigente(b: BarreraEntrada, hoy: date) -> bool:
    if b.vigencia_desde is not None and hoy < b.vigencia_desde:
        return False
    return not (b.vigencia_hasta is not None and hoy > b.vigencia_hasta)


def detallar_barrera(
    b: BarreraEntrada, config: ConfigMotor, hoy: date
) -> DetalleBarrera:
    es_temporal = b.tipo == "TEMPORAL"
    vigente = temporal_vigente(b, hoy) if es_temporal else True
    deg = b.factor_degradacion if b.factor_degradacion is not None else 90
    efectivo = (
        frr_efectivo(b.frr_diseno, b.estado, config.multiplicadores, b.factor_degradacion)
        if vigente
        else 1.0
    )
    return DetalleBarrera(
        tag=b.tag,
        tipo=b.tipo,
        estado=b.estado,
        frr_diseno=b.frr_diseno,
        frr_efectivo=efectivo,
        cuenta_en_diseno=not es_temporal,
        vigente=vigente,
        factor_degradacion=deg,
    )


def _producto(valores: Sequence[float]) -> float:
    total = 1.0
    for v in valores:
        total *= v
    return total


def evaluar_escenario(
    frecuencia_diseno: str,
    impactos: Impactos,
    barreras: Sequence[BarreraEntrada],
    config: ConfigMotor,
    hoy: date,
) -> ResultadoMotor:
    """Evalúa un escenario. Es una función pura (determinista dado ``hoy``)."""
    idx = indice_frecuencia(frecuencia_diseno)
    severidad = config.estrategia_severidad(impactos)
    inherente = nivel_matriz(config, idx, severidad)

    detalles = tuple(detallar_barrera(b, config, hoy) for b in barreras)
    frr_diseno_total = _producto([d.frr_diseno for d in detalles if d.cuenta_en_diseno])
    idx_diseno = frecuencia_tras_frr(idx, frr_diseno_total)
    riesgo_diseno = nivel_matriz(config, idx_diseno, severidad)

    frr_actual_total = _producto([d.frr_efectivo for d in detalles])
    idx_actual = frecuencia_tras_frr(idx, frr_actual_total)
    riesgo_actual = nivel_matriz(config, idx_actual, severidad)

    n = len(c.FRECUENCIAS)
    return ResultadoMotor(
        severidad=severidad,
        riesgo_inherente=inherente,
        frr_diseno_total=frr_diseno_total,
        frecuencia_diseno_resid=c.FRECUENCIAS[idx_diseno],
        riesgo_diseno=riesgo_diseno,
        frr_actual_total=frr_actual_total,
        frecuencia_actual=c.FRECUENCIAS[idx_actual],
        riesgo_actual=riesgo_actual,
        puntaje_diseno=(n - idx_diseno) * severidad,
        puntaje_actual=(n - idx_actual) * severidad,
        brecha=indice_nivel(riesgo_actual) - indice_nivel(riesgo_diseno),
        barreras=detalles,
        version_motor=config.version,
        riesgo_diseno_economico=nivel_matriz(config, idx_diseno, impactos.economico),
        riesgo_diseno_personas=nivel_matriz(config, idx_diseno, impactos.personas),
        riesgo_diseno_ambiente=nivel_matriz(config, idx_diseno, impactos.ambiente),
        riesgo_diseno_reputacion=nivel_matriz(config, idx_diseno, impactos.reputacion),
        riesgo_actual_economico=nivel_matriz(config, idx_actual, impactos.economico),
        riesgo_actual_personas=nivel_matriz(config, idx_actual, impactos.personas),
        riesgo_actual_ambiente=nivel_matriz(config, idx_actual, impactos.ambiente),
        riesgo_actual_reputacion=nivel_matriz(config, idx_actual, impactos.reputacion),
    )
