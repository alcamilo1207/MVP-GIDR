import type { Estado, Nivel } from './types'

export const NIVELES: Nivel[] = ['Bajo', 'Medio', 'Alto', 'Extremo']

export const NIVEL_CLASES: Record<Nivel, string> = {
  Bajo: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300',
  Medio: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300',
  Alto: 'bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300',
  Extremo: 'bg-red-100 text-red-800 dark:bg-red-900/60 dark:text-red-300',
}
export const NIVEL_CELDA: Record<Nivel, string> = {
  Bajo: 'bg-emerald-200/80 dark:bg-emerald-900/60',
  Medio: 'bg-yellow-200/80 dark:bg-yellow-800/50',
  Alto: 'bg-orange-300/80 dark:bg-orange-800/60',
  Extremo: 'bg-red-400/80 dark:bg-red-800/70',
}
export const NIVEL_HEX: Record<Nivel, string> = { Bajo: '#10b981', Medio: '#eab308', Alto: '#f97316', Extremo: '#dc2626' }

export const ESTADOS: Estado[] = ['DISPONIBLE', 'DEGRADADO', 'EN_MANTENIMIENTO', 'FUERA_DE_SERVICIO', 'INEXISTENTE']
export const ESTADO_ETIQUETA: Record<Estado, string> = {
  DISPONIBLE: 'Disponible',
  DEGRADADO: 'Degradado',
  EN_MANTENIMIENTO: 'En mantenimiento',
  FUERA_DE_SERVICIO: 'Fuera de servicio',
  INEXISTENTE: 'Inexistente',
}
export const ESTADO_CLASES: Record<Estado, string> = {
  DISPONIBLE: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300',
  DEGRADADO: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300',
  EN_MANTENIMIENTO: 'bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-300',
  FUERA_DE_SERVICIO: 'bg-red-100 text-red-800 dark:bg-red-900/60 dark:text-red-300',
  INEXISTENTE: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300',
}
export const ESTADO_HEX: Record<Estado, string> = {
  DISPONIBLE: '#10b981', DEGRADADO: '#f59e0b', EN_MANTENIMIENTO: '#0ea5e9', FUERA_DE_SERVICIO: '#dc2626', INEXISTENTE: '#94a3b8',
}

export function fmtFecha(iso: string | null | undefined, conHora = true): string {
  if (!iso) return '—'
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso)
  return d.toLocaleString('es-ES', conHora
    ? { dateStyle: 'short', timeStyle: 'short' }
    : { dateStyle: 'medium' })
}

export function fmtFrr(n: number): string {
  return n >= 1000 ? `${(n / 1000).toLocaleString('es-ES')}k` : n.toLocaleString('es-ES', { maximumFractionDigits: 1 })
}

export function fmtBrecha(b: number | null | undefined): string {
  if (b === null || b === undefined) return '—'
  return b > 0 ? `+${b}` : String(b)
}

export function fmtHoras(h: number): string {
  if (h < 48) return `${h.toLocaleString('es-ES', { maximumFractionDigits: 1 })} h`
  return `${(h / 24).toLocaleString('es-ES', { maximumFractionDigits: 1 })} d`
}
