import type { Nivel } from './types'

export interface EscalaSeveridad {
  num: number // 1 a 5
  codigo: string // "1", "2", "3", "4", "5" o personalizable ("S1", "I", etc.)
  etiqueta: string // "Leve", "Menor", "Moderado", "Mayor", "Catastrófico"
  criterioEconomico?: string
  criterioPersonas?: string
  criterioAmbiental?: string
  criterioReputacion?: string
}

export interface EscalaFrecuencia {
  idx: number // 0 (A) a 4 (E)
  codigo: string // "A", "B", "C", "D", "E" o personalizable ("F1", etc.)
  etiqueta: string // "Frecuente", "Probable", "Ocasional", "Raro", "Improbable"
  rango: string // e.g. "> 1 evento/año", "10⁻¹ a 1 /año"
  peso: number // 5 (A) a 1 (E)
}

export interface UmbralCriticidad {
  nivel: Nivel
  min: number
  max: number
  etiqueta: string
  colorHex: string
}

export interface ConfigMatrizRiesgo {
  version: number
  severidades: EscalaSeveridad[]
  frecuencias: EscalaFrecuencia[]
  umbrales: UmbralCriticidad[]
  /** Celdas con nivel forzado manualmente (clave: `${frecCod}-${sevNum}`) */
  celdasPersonalizadas?: Record<string, Nivel>
}

export const SEVERIDADES_DEFECTO: EscalaSeveridad[] = [
  {
    num: 5,
    codigo: '5',
    etiqueta: 'Catastrófico',
    criterioEconomico: '> $10M USD',
    criterioPersonas: 'Múltiples fatalidades o incapacidad permanente severa',
    criterioAmbiental: 'Contaminación masiva fuera del sitio / Reserva natural',
    criterioReputacion: 'Impacto internacional, revocación de licencias',
  },
  {
    num: 4,
    codigo: '4',
    etiqueta: 'Mayor',
    criterioEconomico: '$1M - $10M USD',
    criterioPersonas: 'Una fatalidad o lesión grave incapacitante',
    criterioAmbiental: 'Impacto severo fuera del sitio remediable',
    criterioReputacion: 'Cobertura nacional negativa prolongada',
  },
  {
    num: 3,
    codigo: '3',
    etiqueta: 'Moderado',
    criterioEconomico: '$100k - $1M USD',
    criterioPersonas: 'Lesión con tiempo perdido (LTI) / Hospitalización',
    criterioAmbiental: 'Contaminación dentro de batería de límites',
    criterioReputacion: 'Atención mediática local / Quejas comunitarias',
  },
  {
    num: 2,
    codigo: '2',
    etiqueta: 'Menor',
    criterioEconomico: '$10k - $100k USD',
    criterioPersonas: 'Tratamiento médico / Trabajo restringido (RWC)',
    criterioAmbiental: 'Derrame menor contenido inmediatamente',
    criterioReputacion: 'Queja de autoridades locales sin sanción',
  },
  {
    num: 1,
    codigo: '1',
    etiqueta: 'Leve',
    criterioEconomico: '< $10k USD',
    criterioPersonas: 'Primeros auxilios (FAC) sin tiempo perdido',
    criterioAmbiental: 'Fuga mínima sin afectación externa',
    criterioReputacion: 'Sin impacto público relevante',
  },
]

export const FRECUENCIAS_DEFECTO: EscalaFrecuencia[] = [
  { idx: 0, codigo: 'A', etiqueta: 'Frecuente', rango: '> 1 vez/año', peso: 5 },
  { idx: 1, codigo: 'B', etiqueta: 'Probable', rango: '1 vez en 1 - 10 años', peso: 4 },
  { idx: 2, codigo: 'C', etiqueta: 'Ocasional', rango: '1 vez en 10 - 100 años', peso: 3 },
  { idx: 3, codigo: 'D', etiqueta: 'Raro', rango: '1 vez en 100 - 1,000 años', peso: 2 },
  { idx: 4, codigo: 'E', etiqueta: 'Improbable', rango: '< 1 vez en 1,000 años', peso: 1 },
]

export const UMBRALES_DEFECTO: UmbralCriticidad[] = [
  { nivel: 'Bajo', min: 1, max: 4, etiqueta: 'Riesgo Aceptable', colorHex: '#10b981' },
  { nivel: 'Medio', min: 5, max: 9, etiqueta: 'Riesgo Tolerable con Control', colorHex: '#eab308' },
  { nivel: 'Alto', min: 10, max: 14, etiqueta: 'Riesgo Importante (Mitigar)', colorHex: '#f97316' },
  { nivel: 'Extremo', min: 15, max: 25, etiqueta: 'Riesgo Inaceptable / Parada', colorHex: '#dc2626' },
]

export const NIVELES_CRITICIDAD_INFO: Record<Nivel, { descripcion: string; accion: string }> = {
  Bajo: {
    descripcion: 'Riesgo residual aceptable bajo condiciones de operación normales.',
    accion: 'Operación continua bajo procedimientos estándar y mantenimiento preventivo.',
  },
  Medio: {
    descripcion: 'Riesgo tolerable. Requiere supervisión y mantenimiento de barreras activas.',
    accion: 'Monitoreo periódico e inspección programada de salvaguardas operacionales.',
  },
  Alto: {
    descripcion: 'Riesgo significativo en brecha. Requiere acciones correctivas a corto plazo.',
    accion: 'Priorizar intervención correctiva, MOC y revisión de ingeniería urgente.',
  },
  Extremo: {
    descripcion: 'Riesgo intolerable. Potencial de pérdida catastrófica o fatalidades.',
    accion: 'Parada segura, aislamiento de energía o mitigación inmediata mandatoria.',
  },
}

export const CONFIG_MATRIZ_DEFECTO: ConfigMatrizRiesgo = {
  version: 1,
  severidades: SEVERIDADES_DEFECTO,
  frecuencias: FRECUENCIAS_DEFECTO,
  umbrales: UMBRALES_DEFECTO,
  celdasPersonalizadas: {},
}

const STORAGE_KEY = 'gidr_config_matriz_riesgo_v1'
export const EVENTO_CONFIG_CAMBIADA = 'gidr-config-matriz-cambiada'

export function obtenerConfigMatriz(): ConfigMatrizRiesgo {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return CONFIG_MATRIZ_DEFECTO
    const parseado = JSON.parse(raw) as ConfigMatrizRiesgo
    if (
      Array.isArray(parseado.severidades) &&
      Array.isArray(parseado.frecuencias) &&
      Array.isArray(parseado.umbrales)
    ) {
      return parseado
    }
  } catch (e) {
    console.error('Error al cargar configuración de matriz:', e)
  }
  return CONFIG_MATRIZ_DEFECTO
}

export function guardarConfigMatriz(cfg: ConfigMatrizRiesgo): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg))
    window.dispatchEvent(new CustomEvent(EVENTO_CONFIG_CAMBIADA, { detail: cfg }))
  } catch (e) {
    console.error('Error al guardar configuración de matriz:', e)
  }
}

export function restablecerConfigMatriz(): ConfigMatrizRiesgo {
  try {
    localStorage.removeItem(STORAGE_KEY)
    window.dispatchEvent(new CustomEvent(EVENTO_CONFIG_CAMBIADA, { detail: CONFIG_MATRIZ_DEFECTO }))
  } catch (e) {
    console.error('Error al restablecer configuración de matriz:', e)
  }
  return CONFIG_MATRIZ_DEFECTO
}

/**
 * Calcula el puntaje numérico de una celda: peso de frecuencia (1-5) * número de severidad (1-5).
 */
export function calcularPuntaje(
  frecuenciaCod: string,
  severidadNum: number,
  cfg: ConfigMatrizRiesgo = obtenerConfigMatriz()
): number {
  const f = cfg.frecuencias.find((item) => item.codigo === frecuenciaCod)
  const peso = f ? f.peso : 1
  return Math.max(1, Math.min(25, peso * severidadNum))
}

/**
 * Determina el nivel de criticidad (Bajo, Medio, Alto, Extremo) de acuerdo a los umbrales configurados.
 */
export function obtenerNivelPorPuntaje(
  puntaje: number,
  cfg: ConfigMatrizRiesgo = obtenerConfigMatriz()
): Nivel {
  for (const u of cfg.umbrales) {
    if (puntaje >= u.min && puntaje <= u.max) {
      return u.nivel
    }
  }
  if (puntaje >= 15) return 'Extremo'
  if (puntaje >= 10) return 'Alto'
  if (puntaje >= 5) return 'Medio'
  return 'Bajo'
}

/**
 * Obtiene el nivel de una celda específica (Frecuencia, Severidad) respetando personalizaciones.
 */
export function obtenerNivelCelda(
  frecuenciaCod: string,
  severidadNum: number,
  cfg: ConfigMatrizRiesgo = obtenerConfigMatriz()
): Nivel {
  const clave = `${frecuenciaCod}-${severidadNum}`
  if (cfg.celdasPersonalizadas && cfg.celdasPersonalizadas[clave]) {
    return cfg.celdasPersonalizadas[clave]
  }
  const puntaje = calcularPuntaje(frecuenciaCod, severidadNum, cfg)
  return obtenerNivelPorPuntaje(puntaje, cfg)
}

/**
 * Retorna las clases de color Tailwind completas para resaltar un escenario según su nivel de riesgo.
 */
export function obtenerEstilosResaltado(nivel: Nivel | string) {
  switch (nivel) {
    case 'Extremo':
      return {
        badge: 'bg-red-600 text-white dark:bg-red-700 shadow-xs font-bold',
        card: 'border-l-4 border-l-red-600 border-red-300 dark:border-red-900/60 bg-red-50/80 dark:bg-red-950/40 hover:border-red-500 shadow-xs ring-1 ring-inset ring-red-500/30',
        text: 'text-red-700 dark:text-red-300 font-bold',
        dot: 'bg-red-500 animate-pulse',
      }
    case 'Alto':
      return {
        badge: 'bg-orange-500 text-white dark:bg-orange-600 shadow-xs font-bold',
        card: 'border-l-4 border-l-orange-500 border-orange-300 dark:border-orange-900/60 bg-orange-50/80 dark:bg-orange-950/40 hover:border-orange-500 shadow-xs ring-1 ring-inset ring-orange-500/30',
        text: 'text-orange-700 dark:text-orange-300 font-bold',
        dot: 'bg-orange-500',
      }
    case 'Medio':
      return {
        badge: 'bg-amber-400 text-amber-950 dark:bg-amber-500 dark:text-slate-950 shadow-xs font-bold',
        card: 'border-l-4 border-l-amber-400 border-amber-300 dark:border-amber-900/50 bg-amber-50/70 dark:bg-amber-950/30 hover:border-amber-400 ring-1 ring-inset ring-amber-400/20',
        text: 'text-amber-800 dark:text-amber-300 font-semibold',
        dot: 'bg-amber-400',
      }
    case 'Bajo':
    default:
      return {
        badge: 'bg-emerald-600 text-white dark:bg-emerald-700 shadow-xs font-bold',
        card: 'border-l-4 border-l-emerald-500 border-slate-200 dark:border-slate-800 bg-emerald-50/40 dark:bg-emerald-950/20 hover:border-emerald-400',
        text: 'text-emerald-700 dark:text-emerald-300 font-semibold',
        dot: 'bg-emerald-500',
      }
  }
}
