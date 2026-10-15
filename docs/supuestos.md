# Supuestos y Reglas del Motor de Riesgo (GIDR Módulo 4)

Este documento detalla formalmente cada supuesto matemático y de ingeniería de procesos adoptado para el cálculo de riesgo y brechas en el motor de riesgo de GIDR.

---

### Supuesto 1: Escalas de Frecuencia y Dirección
- **Frecuencias discretas de diseño y residuales:** A, B, C, D, E.
- **Convención:** 
  - `A`: Más frecuente (índice 0)
  - `B`: Probable (índice 1)
  - `C`: Ocasional (índice 2)
  - `D`: Raro (índice 3)
  - `E`: Improbable / Muy raro (índice 4)
- **Saturación:** Cualquier desplazamiento que supere el índice 4 satura en la categoría `E`.

---

### Supuesto 2: Estrategia de Severidad
- Los impactos de entrada se evalúan en 4 dimensiones discretas (1 a 5):
  1. Económico / Pérdida de producción (`imp_economico`)
  2. Personas / Seguridad y Salud ocupacional (`imp_personas`)
  3. Ambiente (`imp_ambiente`)
  4. Reputación / Imagen corporativa (`imp_reputacion`)
- **Estrategia por defecto:**
  $$\text{Severidad} = \max(\text{imp\_economico}, \text{imp\_personas}, \text{imp\_ambiente}, \text{imp\_reputacion})$$
- La interfaz del motor admite funciones de estrategia intercambiables (e.g., priorización exclusiva de personas).

---

### Supuesto 3: Matriz de Riesgo 5×5 y Niveles
- **Puntaje por celda:**
  $$\text{Puntaje} = (5 - \text{índice\_frecuencia}) \times \text{Severidad}$$
  - Rango de puntaje: 1 a 25.
- **Categorización de Niveles de Riesgo por defecto:**
  - **Bajo:** Puntaje 1 – 4 (Verde)
  - **Medio:** Puntaje 5 – 9 (Amarillo)
  - **Alto:** Puntaje 10 – 14 (Naranja)
  - **Extremo:** Puntaje 15 – 25 (Rojo)
- La matriz de riesgo y sus umbrales son editables por empresa en la tabla `matriz_riesgo`.

---

### Supuesto 4: Multiplicadores de Estado Operacional de Barreras
Los estados de mantenimiento provenientes de CMMS o rondas de inspección ajustan el Factor de Reducción de Riesgo (FRR) de diseño según la tabla `politica_estado`:

| Estado Operacional | Multiplicador FRR | Interpretación Operativa |
| :--- | :---: | :--- |
| **DISPONIBLE** | `1.0` | Barrera 100% operativa y certificada en servicio. |
| **DEGRADADO** | `0.1` | Falla incipiente, medición fuera de tolerancia o respuesta parcial. |
| **EN_MANTENIMIENTO**| `0.0` | Equipo deshabilitado para calibración, prueba de banco o reparación. |
| **FUERA_DE_SERVICIO**| `0.0` | Lazo en bypass, válvula trabada o sin disponibilidad. |
| **INEXISTENTE** | `0.0` | Barrera dada de baja o aún no instalada. |

---

### Supuesto 5: Relación entre FRR y Desplazamiento de Frecuencia
- **Principio de Capas de Protección (LOPA / IEC 61511):**
  Cada orden de magnitud (década) de FRR reduce la frecuencia del evento en una categoría hacia la más improbable:
  $$\Delta \text{categorías} = \left\lfloor \log_{10}(\text{FRR}) \right\rfloor$$
- **Cálculo de FRR Efectivo por Barrera:**
  $$\text{FRR}_{\text{efectivo}} = \text{FRR}_{\text{diseño}} \times \text{Multiplicador}(\text{estado})$$
  Si $\text{FRR}_{\text{efectivo}} < 1$, se fija en $1.0$ (sin crédito de reducción, no amplifica el riesgo inicial).
- **Tratamiento de Barreras Temporales (MOC):**
  - Solo aportan crédito si la fecha de evaluación se encuentra dentro de su período de vigencia (`vigencia_desde` $\le \text{hoy} \le$ `vigencia_hasta`) y cuentan con referencia MOC.
  - No forman parte del cálculo del riesgo de diseño; solo aportan al riesgo actual como medidas compensatorias.

---

### Supuesto 6: Definición de Brecha de Riesgo
- La brecha mide la degradación de la seguridad de procesos respecto al estudio de diseño original:
  $$\text{Brecha} = \text{ÍndiceNivel}(\text{Riesgo Actual}) - \text{ÍndiceNivel}(\text{Riesgo Diseño})$$
  donde los índices de nivel son: Bajo = 0, Medio = 1, Alto = 2, Extremo = 3.
- **Interpretación:**
  - $\text{Brecha} = 0$: Operación alineada con el diseño seguro.
  - $\text{Brecha} > 0$: Alerta de brecha operativa. El riesgo actual ha escalado debido a degradación o mantenimiento de barreras.
  - $\text{Brecha} < 0$: Operación reforzada por medidas temporales o sobreprotección.
