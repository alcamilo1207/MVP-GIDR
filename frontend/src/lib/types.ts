export type Nivel = 'Bajo' | 'Medio' | 'Alto' | 'Extremo'
export type Estado = 'DISPONIBLE' | 'DEGRADADO' | 'EN_MANTENIMIENTO' | 'FUERA_DE_SERVICIO' | 'INEXISTENTE'
export type Rol = 'admin' | 'lector'

export interface Pagina<T> { items: T[]; total: number; page: number; size: number }

export interface Resultado {
  ts: string; severidad: number; riesgo_inherente: Nivel; riesgo_diseno: Nivel
  frecuencia_diseno_resid: string; frr_diseno_total: number; frecuencia_actual: string
  frr_actual_total: number; riesgo_actual: Nivel; puntaje_diseno: number; puntaje_actual: number
  brecha: number; escenario_version: number; motivo: string | null; version_motor: string
}

export interface RiesgosPorImpacto {
  economico: Nivel
  personas: Nivel
  ambiente: Nivel
  reputacion: Nivel
}

export interface Escenario {
  id: number; empresa: string; site_id: number; site: string; unidad_id: number; unidad: string
  nodo_id: number; nodo: string; palabra_guia_id: number; palabra_guia: string; causa: string
  peligro?: string | null; evento_tope?: string | null
  frecuencia_diseno: string; consecuencia: string; imp_economico: number; imp_personas: number
  imp_ambiente: number; imp_reputacion: number; version: number; n_barreras: number
  resultado: Resultado | null
  barreras?: BarreraEscenario[]
  factores_escalamiento?: FactorEscalamiento[]
  riesgo_diseno_imp?: RiesgosPorImpacto | null
  riesgo_actual_imp?: RiesgosPorImpacto | null
}

export interface BarreraEscenario {
  barrera_id: number; tag_activo: string; descripcion: string; tipo: 'EXISTENTE' | 'TEMPORAL'
  estado_actual: Estado; factor_degradacion?: number; lado: 'PREVENTIVA' | 'MITIGATIVA'; frr_diseno: number; frr_efectivo: number
  cuenta_en_diseno: boolean; vigente: boolean; vigencia_desde: string | null
  vigencia_hasta: string | null; moc_ref: string | null
}

export interface EscenarioDetalle extends Escenario { barreras: BarreraEscenario[]; historial: Resultado[] }

export interface Barrera {
  id: number; empresa_id: number; tag_activo: string; descripcion: string; tipo: 'EXISTENTE' | 'TEMPORAL'
  vigencia_desde: string | null; vigencia_hasta: string | null; moc_ref: string | null
  estado_actual: Estado; factor_degradacion?: number; estado_actualizado: string | null; n_escenarios: number
}
export interface Dependiente {
  escenario_id: number; causa: string; unidad: string; nodo: string; lado: string; frr_diseno: number
  riesgo_diseno: Nivel | null; riesgo_actual: Nivel | null; brecha: number | null
}
export interface BarreraDetalle extends Barrera { dependientes: Dependiente[] }
export interface Historial { ts: string; estado: Estado; fuente: string; detalle: Record<string, unknown> | null }

export interface Snap { riesgo_diseno: Nivel; riesgo_actual: Nivel; frecuencia_actual: string; frr_actual_total: number; brecha: number }
export interface Impacto { escenario_id: number; causa: string; antes: Snap | null; despues: Snap }
export interface CambioEstadoOut {
  aplicado: boolean; barrera_id: number; tag_activo: string; estado_anterior: Estado; estado_nuevo: Estado; impacto: Impacto[]
}

export interface CeldaMapa { frecuencia: string; severidad: number; nivel: Nivel; diseno: number; actual: number }
export interface Priorizado {
  escenario_id: number; causa: string; unidad: string; nodo: string; riesgo_diseno: Nivel
  riesgo_actual: Nivel; brecha: number; puntaje_actual: number
}
export interface ResumenDashboard {
  barreras_total: number; barreras_disponibles: number; pct_barreras_disponibles: number
  barreras_por_estado: Record<string, number>; escenarios_total: number; escenarios_en_brecha: number
  escenarios_alto_extremo_actual: number; escenarios_alto_extremo_diseno: number
  mapa_calor: CeldaMapa[]; priorizados: Priorizado[]
}

export interface ControlFactor {
  id?: number
  factor_escalamiento_id?: number
  descripcion: string
  tag_activo: string | null
  estado_actual: Estado
}

export interface FactorEscalamiento {
  id?: number
  escenario_id?: number
  escenario_barrera_id?: number
  barrera_tag: string
  descripcion: string
  categoria: string | null
  controles: ControlFactor[]
}

export interface BowTie {
  escenario_id: number
  peligro: string
  evento_tope: string
  causa: string
  frecuencia_diseno: string
  consecuencia: string
  ruta: string
  imp_economico: number
  imp_personas: number
  imp_ambiente: number
  imp_reputacion: number
  preventivas: BarreraEscenario[]
  mitigativas: BarreraEscenario[]
  consecuencias: { categoria: string; nivel: number; texto: string }[]
  factores_escalamiento: FactorEscalamiento[]
  resultado: Resultado | null
  layout?: Record<string, { x: number; y: number }> | null
}

export interface Api754 {
  aviso: string
  tier3: {
    barreras_fuera_de_servicio: number; barreras_degradadas: number; barreras_en_mantenimiento: number
    tiempo_acumulado_horas: number; escenarios_con_brecha: number
    tiempo_por_barrera: { tag_activo: string; horas: number; estado_actual: Estado }[]
  }
  tier4: {
    pct_barreras_disponibles: number; acciones_abiertas: number; temporales_activas: number
    dias_alerta_vencimiento: number
    temporales_proximas_a_vencer: { barrera_id: number; tag_activo: string; vigencia_hasta: string | null; dias_restantes: number | null; moc_ref: string | null }[]
  }
}

export interface Accion {
  id: number; escenario_id: number | null; barrera_id: number | null; descripcion: string
  estado: 'ABIERTA' | 'CERRADA'; origen: string; responsable: string | null; created_at: string; closed_at: string | null
}
export interface Auditoria {
  id: number; ts: string; usuario: string; accion: string; entidad: string; entidad_id: string | null
  antes: Record<string, unknown> | null; despues: Record<string, unknown> | null
}
export interface ErrorFila { fila: number; campo: string | null; mensaje: string }
export interface Importacion {
  filas_totales: number; filas_aceptadas: number; errores: ErrorFila[]; escenarios_creados: number
  escenarios_actualizados: number; escenarios_sin_cambios: number; barreras_creadas: number
  vinculos_creados: number; escenarios_recalculados: number
}
export interface Ingesta {
  recibidos: number; aceptados: number; duplicados: number; no_mapeados: string[]; errores: ErrorFila[]
  escenarios_recalculados: number
  cambios_estado: { tag_activo: string; antes: Estado; despues: Estado; escenarios_afectados: number }[]
}
export interface Sitio { id: number; nombre: string; empresa_id: number }
export interface Unidad { id: number; nombre: string; site_id: number }
export interface Conector { nombre: string; descripcion: string; implementado: boolean }

export type SistemaFuenteGemelo = 'DCS_SCADA' | 'SIS' | 'HISTORIADOR_IOW' | 'CMMS' | 'GEMELO_DIGITAL'
export type TipoEvaluacionGemelo = 'ESTADO_DISCRETO' | 'SALUD_DEGRADACION' | 'UMBRAL_IOW'

export interface VinculoGemelo {
  id: number
  barrera_id: number
  barrera_tag: string
  barrera_descripcion: string
  barrera_estado: Estado
  barrera_factor_degradacion: number
  barrera_frr_diseno: number
  sistema_fuente: SistemaFuenteGemelo
  tag_gemelo: string
  descripcion: string
  tipo_evaluacion: TipoEvaluacionGemelo
  unidad_ing: string | null
  umbral_alerta: number | null
  umbral_critico: number | null
  ultimo_valor: number | null
  ultimo_estado_evaluado: Estado | null
  ultima_actualizacion: string | null
  activo: boolean
}

export interface ResultadoTelemetria {
  procesadas: number
  barreras_actualizadas: number
  escenarios_recalculados: number
  eventos_emitidos: {
    barrera_tag: string
    tag_gemelo: string
    fuente: string
    valor: number | null
    estado: Estado
    factor_degradacion: number
  }[]
}

