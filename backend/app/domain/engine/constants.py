"""Constantes y supuestos configurables del motor de riesgo.

Cada supuesto está documentado aquí y en ``docs/supuestos.md``. Los valores por
defecto pueden ser sustituidos por empresa vía las tablas ``matriz_riesgo`` y
``politica_estado`` (el motor recibe un ``ConfigMotor`` explícito).
"""

from __future__ import annotations

#: Versión del motor; se guarda en cada fila de ``resultado_riesgo``.
VERSION_MOTOR = "1.0.0"

#: SUPUESTO 1: A = más frecuente (índice 0) ... E = más rara (índice 4).
FRECUENCIAS: tuple[str, ...] = ("A", "B", "C", "D", "E")
IDX_MAX_FRECUENCIA = len(FRECUENCIAS) - 1

#: Escala de severidad / impactos (1–5).
SEVERIDAD_MIN, SEVERIDAD_MAX = 1, 5

#: SUPUESTO 3: niveles de riesgo ordenados de menor a mayor. El orden define
#: la "diferencia de niveles" usada para calcular la brecha.
NIVELES: tuple[str, ...] = ("Bajo", "Medio", "Alto", "Extremo")

#: SUPUESTO 3: matriz 5x5 por defecto, puntaje = (5 - idx_frecuencia) * severidad.
#: Tramos (mínimo, máximo, nivel) inclusivos.
UMBRALES_PUNTAJE: tuple[tuple[int, int, str], ...] = (
    (1, 4, "Bajo"),
    (5, 9, "Medio"),
    (10, 14, "Alto"),
    (15, 25, "Extremo"),
)

#: SUPUESTO 4: multiplicador del FRR de diseño según el estado de la barrera.
MULTIPLICADORES_DEFECTO: dict[str, float] = {
    "DISPONIBLE": 1.0,
    "DEGRADADO": 0.1,
    "EN_MANTENIMIENTO": 0.0,
    "FUERA_DE_SERVICIO": 0.0,
    "INEXISTENTE": 0.0,
}

ESTADOS_BARRERA: tuple[str, ...] = tuple(MULTIPLICADORES_DEFECTO)
TIPOS_BARRERA: tuple[str, ...] = ("EXISTENTE", "TEMPORAL")

#: SUPUESTO 5: cada orden de magnitud de FRR desplaza la frecuencia una categoría.
CATEGORIAS_POR_DECADA = 1

#: Tolerancia numérica para floor(log10(x)) (evita log10(1000)=2.9999999999999996).
EPSILON_LOG = 1e-9


def puntaje_a_nivel(puntaje: int) -> str:
    """Convierte un puntaje de la matriz por defecto en nivel de riesgo."""
    for minimo, maximo, nivel in UMBRALES_PUNTAJE:
        if minimo <= puntaje <= maximo:
            return nivel
    raise ValueError(f"Puntaje fuera de rango: {puntaje}")


def matriz_defecto() -> dict[tuple[int, int], str]:
    """Matriz (idx_frecuencia, severidad) -> nivel construida con el puntaje por defecto."""
    return {
        (f, s): puntaje_a_nivel((len(FRECUENCIAS) - f) * s)
        for f in range(len(FRECUENCIAS))
        for s in range(SEVERIDAD_MIN, SEVERIDAD_MAX + 1)
    }
