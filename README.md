# GIDR · Módulo 4: HUB de Integración de Riesgo Dinámico (MVP)

> **AVISO IMPORTANTE:** Esta plataforma es una herramienta de software orientada exclusivamente al apoyo en la toma de decisiones operacionales y de integridad de activos. **No sustituye** bajo ninguna circunstancia a los Sistemas Instrumentados de Seguridad (SIS), a las acciones de parada de emergencia de planta ni al juicio profesional de ingeniería de procesos. Todos los datos incluidos en el seed corresponden a escenarios de simulación industrial ficticios.

---

## 1. Objetivo y Arquitectura de la Solución

El **Módulo 4 de GIDR (Gestión Integral Dinámica de Riesgos)** actúa como un HUB de convergencia industrial:
1. **Estudios de Diseño:** Ingesta estudios HAZOP semicuantitativos (escenarios de causa-consecuencia con barreras valoradas por Factor de Reducción de Riesgo - FRR).
2. **Operación en Tiempo Real:** Captura el estado operacional y de mantenimiento (CMMS / SAP PM / Rondas) de las barreras físicas e instrumentadas.
3. **Motor Dinámico de Riesgo:** Recalcula en milisegundos el riesgo actual de cada escenario frente al riesgo de diseño original y cuantifica la **brecha de riesgo**.
4. **Visualización y Trazabilidad:** Proporciona un Tablero de Control 5x5 dinámico, diagramas BowTie interactivos por escenario y un panel de indicadores tipo **API RP 754**.

```
[ HAZOP (Excel/CSV) ] ─────────┐
                               ▼
[ CMMS / SAP PM / Rondas ] ──> [ GIDR Motor ] ──> [ Riesgo Dinámico & Brechas ]
                               ▲                        │
[ MOC (Barreras Temporales) ] ─┘                        ├─► Tablero 5x5 Calor
                                                        ├─► BowTie Interactivo
                                                        └─► Indicadores API 754
```

---

## 2. Puesta en Marcha (Un Solo Comando)

### Requisitos
- Docker y Docker Compose (v2 o superior)

### Ejecución
```bash
docker compose up --build
```

Una vez levantado:
- **Frontend Web:** [http://localhost:3000](http://localhost:3000) (o [http://localhost:5173](http://localhost:5173) en entorno de desarrollo local)
- **API Backend & Swagger UI:** [http://localhost:8000/docs](http://localhost:8000/docs)
- **Base de Datos:** PostgreSQL 16 + TimescaleDB en puerto 5432.

### Credenciales del MVP
| Usuario | Contraseña | Rol | Alcance |
| :--- | :--- | :--- | :--- |
| `admin` | `admin123` | Administrador | Ingesta, simulación viva, gestión MOC y recálculos |
| `lector` | `lector123` | Lector | Visualización de tableros, escenarios y BowTies |

*(El sistema carga automáticamente el seed de demostración con 25 escenarios, 32 barreras y 2 barreras temporales)*.

---

## 3. Guion de Demostración para Clientes Industriales (10 Minutos)

Este guion está verificado y garantiza un recorrido interactivo de alto impacto:

1. **Estado Inicial (Diseño Alineado):**
   - Inicia sesión con `admin`.
   - Observa en el **Dashboard** que la disponibilidad de barreras está en el 100%, los escenarios en brecha son 0 y en la Matriz 5x5 los valores actuales coinciden exactamente con los de diseño `(actual = diseño)`.
2. **Carga Operacional de CMMS (Aparición de Brechas):**
   - Dirígete a **Integraciones**.
   - Descarga el archivo de prueba haciendo clic en **"📥 Descargar CSV de Prueba (Demo)"**.
   - Selecciónalo y haz clic en **"Cargar Estados CMMS"**.
   - Observa la respuesta inmediata: 6 órdenes de trabajo procesadas y 1 tag de válvula no mapeado (`XV-999`) reportado con total transparencia.
3. **Impacto en el Tablero de Control:**
   - Vuelve al **Dashboard**: La disponibilidad cae, aparecen 8+ escenarios en brecha y el mapa de calor 5x5 resalta en rojo las celdas que han escalado a riesgo **Alto** y **Extremo**.
   - En la lista de **Escenarios Críticos (Top Brecha)**, observa cómo el Escenario #24 (Pérdida de sello de líquido en el separador V-202) escaló a brecha +2.
4. **Inspección Visual del BowTie:**
   - Haz clic en el Escenario #24 para abrir su **BowTie**.
   - Observa visualmente el diagrama: a la izquierda la causa raíz, en el centro el evento tope con alerta pulsante y a la derecha las consecuencias.
   - La barrera instrumentada `SIS-V202-LSLL` se muestra destacada en color rojo al estar degradada/fuera de servicio en CMMS, con su FRR efectivo reducido a 1 (sin crédito).
5. **Mitigación mediante Gestión del Cambio (MOC):**
   - Ve a **Barreras** y haz clic en **"+ Medida Compensatoria (MOC)"**.
   - Registra una barrera temporal (e.g., `TMP-OP-777`, descripción: *"Ronda presencial de operador cada 30 min"*, MOC: `MOC-2026-DEMO`, Escenario a Proteger: `24`, FRR: `100`).
   - Al guardar, el motor recalcula automáticamente: regresa al Dashboard o al BowTie y comprueba cómo la brecha del Escenario #24 vuelve a cerrarse a **0**.
6. **Simulador de Eventos en Vivo (Pieza Central):**
   - En la tabla de **Barreras**, busca `PSV-101` y haz clic en **"⚡ Simular Evento"**.
   - Selecciona `FUERA_DE_SERVICIO` y prueba primero el botón **"🔍 Calcular Impacto (Dry-Run)"**: el sistema previsualiza cuántos escenarios se verían afectados sin persistir cambios.
   - Aplica el cambio y observa la propagación en cascada.
7. **Trazabilidad e Indicadores API 754:**
   - En **API 754**, visualiza el tiempo acumulado en indisponibilidad (Tier 3) y el porcentaje de cumplimiento de barreras (Tier 4).
   - En **Auditoría**, revisa la bitácora inmutable donde cada cambio tiene registrado el usuario, fecha, motivo y estado antes/después.

---

## 4. Supuestos y Reglas del Motor de Riesgo

El motor matemático está desacoplado como un módulo Python puro (`app/domain/engine/core.py`), con tests unitarios automatizados y cobertura > 90%.
- **Severidad:** Máximo de las 4 dimensiones de impacto (1 a 5).
- **Frecuencias:** A (más frecuente) a E (improbable).
- **Multiplicadores por Estado:** DISPONIBLE (1.0), DEGRADADO (0.1), EN_MANTENIMIENTO (0.0), FUERA_DE_SERVICIO (0.0), INEXISTENTE (0.0).
- **Crédito de FRR:** Cada década de $\text{FRR}_{\text{efectivo}}$ ($\left\lfloor \log_{10}(\text{FRR}) \right\rfloor$) desplaza la frecuencia una categoría hacia E.

Para el detalle formal de las ecuaciones y algoritmos, consulta [`docs/supuestos.md`](file:///Users/camilo/Documents/Projects/GIDR/MVP-GIDR/docs/supuestos.md).

---

## 5. Ejecución de Tests y Calidad

Para ejecutar la suite completa de pruebas en el entorno de desarrollo:

```bash
# Backend (Pruebas unitarias del motor e integración de la API con cobertura)
cd backend
.venv/bin/pytest -q --cov=app --cov-report=term-missing

# Verificación de linters y tipado estático
.venv/bin/ruff check app tests alembic
.venv/bin/mypy app

# Frontend (Validación TypeScript y ESLint)
cd ../frontend
npm run lint
npm run build
```

---

## 6. Puntos de Extensión y Fuera de Alcance del MVP

El MVP se diseñó con interfaces desacopladas para permitir la integración futura con sistemas corporativos sin refactorizar el núcleo:
- **Autenticación Corporativa / SSO:** La capa `app.security` define el contrato `ProveedorAuth`, listo para sustituir el proveedor local de JWT por Keycloak u OpenID Connect validando tokens mediante JWKS.
- **Conectores de Datos Industriales:** La clase abstracta `BaseConnector` en `app.connectors.base` estandariza cualquier fuente hacia el evento canónico `EventoEstado`. Se incluyen stubs documentados para:
  - `SAP_PM`: Órdenes de trabajo de mantenimiento correctivo/preventivo vía BAPI/OData.
  - `RONDAS`: Hallazgos de inspección en campo por tabletas operativas.
  - `IOW`: Ventanas operativas de integridad provenientes del historiador OSIsoft PI.
  - `LMS`: Control de vigencia en certificaciones de operadores para alarmas críticas.
- **Historial de Series de Tiempo:** La tabla `estado_barrera_hist` se crea como un hypertable en PostgreSQL cuando la extensión **TimescaleDB** está activa, contando con fallback transparente a tabla estándar indexada si no se encuentra presente.
