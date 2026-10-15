"""Motor de riesgo (módulo puro)."""

from app.domain.engine.constants import VERSION_MOTOR
from app.domain.engine.core import (
    BarreraEntrada,
    ConfigMotor,
    DetalleBarrera,
    Impactos,
    ResultadoMotor,
    evaluar_escenario,
)

__all__ = [
    "VERSION_MOTOR",
    "BarreraEntrada",
    "ConfigMotor",
    "DetalleBarrera",
    "Impactos",
    "ResultadoMotor",
    "evaluar_escenario",
]
