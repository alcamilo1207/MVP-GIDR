import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import type { Escenario, Pagina, Unidad } from '../lib/types'
import { ESTADOS, ESTADO_ETIQUETA } from '../lib/format'

export const FRECUENCIAS = ['A', 'B', 'C', 'D', 'E'] as const

/** Valores cuantitativos semicuantitativos estándar (CCPS / LOPA / IEC 61511) */
export const FREC_CUANTITATIVA: Record<
  string,
  { cuant: string; desc: string; rango: string }
> = {
  A: { cuant: '> 10⁻¹', desc: 'Frecuente (> 1 evento/10 años)', rango: '> 10⁻¹ año⁻¹' },
  B: { cuant: '10⁻²', desc: 'Probable (1 evento/10 - 100 años)', rango: '10⁻² - 10⁻¹ año⁻¹' },
  C: { cuant: '10⁻³', desc: 'Ocasional (1 evento/100 - 1,000 años)', rango: '10⁻³ - 10⁻² año⁻¹' },
  D: { cuant: '10⁻⁴', desc: 'Raro (1 evento/1,000 - 10,000 años)', rango: '10⁻⁴ - 10⁻³ año⁻¹' },
  E: { cuant: '< 10⁻⁴', desc: 'Improbable (< 1 evento/10,000 años)', rango: '< 10⁻⁴ año⁻¹' },
}

/**
 * Convierte un valor numérico de frecuencia (año⁻¹) a su categoría en letra (A-E)
 * según el estándar semicuantitativo CCPS / LOPA / IEC 61511:
 *   >= 0.1         -> A (ej. 0.3, 0.98, 1.0)
 *   0.01 a 0.1     -> B (ej. 0.05, 0.02)
 *   0.001 a 0.01   -> C (ej. 0.001, 0.005)
 *   0.0001 a 0.001 -> D (ej. 0.0002, 0.0005)
 *   < 0.0001      -> E (ej. 0.00001)
 */
export function frecuenciaNumeroALetra(val: number): 'A' | 'B' | 'C' | 'D' | 'E' {
  if (isNaN(val) || val <= 0) return 'C'
  if (val >= 0.1) return 'A'
  if (val >= 0.01) return 'B'
  if (val >= 0.001) return 'C'
  if (val >= 0.0001) return 'D'
  return 'E'
}

export function frecuenciaLetraANumero(letra: string): number {
  switch (letra?.toUpperCase()) {
    case 'A': return 0.1
    case 'B': return 0.01
    case 'C': return 0.001
    case 'D': return 0.0001
    case 'E': return 0.00001
    default: return 0.001
  }
}

export function formatearFrecuenciaCuantitativa(n: number): string {
  if (isNaN(n) || n <= 0) return '0'
  if (n >= 1) return Number(n.toFixed(2)).toString()
  if (n >= 0.01) return Number(n.toFixed(3)).toString()
  if (n >= 0.0001) return Number(n.toFixed(4)).toString()
  return n.toExponential(1).replace('+', '')
}

// --- Motor de cálculo reactivo en cliente (espejo de backend/app/domain/engine/core.py) ---
const ORDEN_FREC = ['E', 'D', 'C', 'B', 'A'] as const
const MATRIZ_DEFECTO: Record<string, string[]> = {
  E: ['Bajo', 'Bajo', 'Bajo', 'Medio', 'Medio'],
  D: ['Bajo', 'Bajo', 'Medio', 'Medio', 'Alto'],
  C: ['Bajo', 'Medio', 'Medio', 'Alto', 'Extremo'],
  B: ['Medio', 'Medio', 'Alto', 'Extremo', 'Extremo'],
  A: ['Medio', 'Alto', 'Extremo', 'Extremo', 'Extremo'],
}

const MULT_ESTADO: Record<string, number> = {
  DISPONIBLE: 1.0,
  DEGRADADO: 0.1,
  EN_MANTENIMIENTO: 0.0,
  FUERA_DE_SERVICIO: 0.0,
  INEXISTENTE: 0.0,
}

function calcFrrActual(
  frrDiseno: number,
  estado: string,
  factorDegradacion: number
): number {
  if (estado === 'DEGRADADO') {
    const deg = Math.max(1, Math.min(100, factorDegradacion || 90))
    const factorRestante = (100 - deg) / 100.0
    return Number(Math.max(1.0, frrDiseno * factorRestante).toFixed(2))
  }
  const m = MULT_ESTADO[estado] ?? 0.0
  return m <= 0 ? 1.0 : Number(Math.max(1.0, frrDiseno * m).toFixed(2))
}

function reducirIndice(idxInicial: number, frrTotal: number): number {
  if (frrTotal <= 1.0) return idxInicial
  const saltos = Math.floor(Math.log10(frrTotal) + 1e-9)
  return Math.max(0, idxInicial - saltos)
}

function nivelMatriz(idxFrec: number, impacto: number): string {
  const f = ORDEN_FREC[Math.max(0, Math.min(4, idxFrec))]
  const col = Math.max(0, Math.min(4, impacto - 1))
  return MATRIZ_DEFECTO[f][col]
}

// Colores sólidos estilo PHA-Pro / LOPA RR cell
function colorCeldaRiesgo(nivel: string): string {
  switch (nivel) {
    case 'Extremo':
      return 'bg-[#b91c1c] text-white font-bold'
    case 'Alto':
      return 'bg-[#ea580c] text-white font-bold'
    case 'Medio':
      return 'bg-[#facc15] text-slate-900 font-bold'
    default:
      return 'bg-[#22c55e] text-slate-900 font-bold'
  }
}

function codigoRiesgo(nivel: string): string {
  switch (nivel) {
    case 'Extremo':
      return '4 (Ext)'
    case 'Alto':
      return '3 (Alto)'
    case 'Medio':
      return '2 (Med)'
    default:
      return '1 (Bajo)'
  }
}

type RolBarrera = 'PREVENTIVA' | 'REACTIVA' | 'TEMPORAL'

interface BarreraEditable {
  uid: string
  tag_activo: string
  descripcion: string
  rol: RolBarrera
  frr_diseno: number
  estado_actual: string
  factor_degradacion: number
  factor_escalamiento: string
  control_escalamiento: string
  vigencia_desde?: string | null
  vigencia_hasta?: string | null
  moc_ref?: string | null
}

interface EscenarioEditable {
  id: number
  nodo_id: number
  nodo: string
  palabra_guia_id: number
  palabra_guia: string
  peligro: string
  evento_tope: string
  causa: string
  frecuencia_diseno: string
  frecuencia_diseno_num?: string
  consecuencia: string
  recomendacion: string
  rec_prioridad?: string
  rec_responsable?: string
  rec_estado?: string
  rec_comentarios?: string
  /** Clave estable de grupo de consecuencia dentro de una desviación */
  consecuenciaGroupKey: string
  imp_economico: number
  imp_personas: number
  imp_ambiente: number
  imp_reputacion: number
  barreras: BarreraEditable[]
  modificado: boolean
}

function crearBorrador(e: Escenario): EscenarioEditable {
  const mapaFactores = new Map<string, { factor: string; control: string }>()
  for (const fe of e.factores_escalamiento ?? []) {
    const ctrl = fe.controles?.[0]?.descripcion ?? ''
    mapaFactores.set(fe.barrera_tag, {
      factor: fe.descripcion ?? '',
      control: ctrl,
    })
  }

  const barreras: BarreraEditable[] = (e.barreras ?? []).map((b, idx) => {
    const fc = mapaFactores.get(b.tag_activo)
    const rol: RolBarrera =
      b.tipo === 'TEMPORAL'
        ? 'TEMPORAL'
        : b.lado === 'MITIGATIVA'
          ? 'REACTIVA'
          : 'PREVENTIVA'
    return {
      uid: `${e.id}-${b.tag_activo}-${idx}`,
      tag_activo: b.tag_activo,
      descripcion: b.descripcion,
      rol,
      frr_diseno: b.frr_diseno,
      estado_actual: b.estado_actual,
      factor_degradacion: b.factor_degradacion ?? 90,
      factor_escalamiento: fc?.factor ?? '',
      control_escalamiento: fc?.control ?? '',
      vigencia_desde: b.vigencia_desde,
      vigencia_hasta: b.vigencia_hasta,
      moc_ref: b.moc_ref,
    }
  })

  return {
    id: e.id,
    nodo_id: e.nodo_id,
    nodo: e.nodo,
    palabra_guia_id: e.palabra_guia_id,
    palabra_guia: e.palabra_guia,
    peligro:
      e.peligro ||
      `Peligro inherente en ${e.nodo}: Presencia de fluidos y energía de proceso`,
    evento_tope:
      e.evento_tope || `${e.palabra_guia} en ${e.nodo} (Pérdida de contención)`,
    causa: e.causa,
    frecuencia_diseno: e.frecuencia_diseno,
    frecuencia_diseno_num:
      typeof window !== 'undefined'
        ? localStorage.getItem(`gidr_frec_num_${e.id}`) ||
          frecuenciaLetraANumero(e.frecuencia_diseno).toString()
        : frecuenciaLetraANumero(e.frecuencia_diseno).toString(),
    consecuencia: e.consecuencia,
    recomendacion: e.recomendacion || '',
    rec_prioridad: e.rec_prioridad || 'Medium',
    rec_responsable: e.rec_responsable || '',
    rec_estado: e.rec_estado || 'Proposed',
    rec_comentarios: e.rec_comentarios || '',
    consecuenciaGroupKey: `${e.nodo_id}::${e.palabra_guia_id}::${e.consecuencia.trim()}`,
    imp_economico: e.imp_economico,
    imp_personas: e.imp_personas,
    imp_ambiente: e.imp_ambiente,
    imp_reputacion: e.imp_reputacion,
    barreras,
    modificado: false,
  }
}

function evaluarBorrador(d: EscenarioEditable) {
  const numDis =
    d.frecuencia_diseno_num !== undefined &&
    d.frecuencia_diseno_num !== '' &&
    !isNaN(Number(d.frecuencia_diseno_num))
      ? Number(d.frecuencia_diseno_num)
      : frecuenciaLetraANumero(d.frecuencia_diseno)

  const idxBase = Math.max(0, ORDEN_FREC.indexOf(d.frecuencia_diseno as typeof ORDEN_FREC[number]))

  let prodPrevDiseno = 1.0
  let prodMitDiseno = 1.0
  let prodPrevActual = 1.0
  let prodMitActual = 1.0

  for (const b of d.barreras) {
    const frrDis = Math.max(1.0, Number(b.frr_diseno) || 1.0)
    const frrAct = calcFrrActual(frrDis, b.estado_actual, b.factor_degradacion)

    if (b.rol === 'PREVENTIVA') {
      prodPrevDiseno *= frrDis
      prodPrevActual *= frrAct
    } else if (b.rol === 'REACTIVA') {
      prodMitDiseno *= frrDis
      prodMitActual *= frrAct
    } else if (b.rol === 'TEMPORAL') {
      prodPrevActual *= frrAct
    }
  }

  const idxPrevDis = reducirIndice(idxBase, prodPrevDiseno)
  const idxDisFinal = reducirIndice(idxPrevDis, prodMitDiseno)

  // Cálculo cuantitativo dinámico de frecuencia actual
  const frecActNum = numDis / Math.max(1.0, prodPrevActual)
  const frecActualLetra = frecuenciaNumeroALetra(frecActNum)
  const frecActualDisplay = formatearFrecuenciaCuantitativa(frecActNum)

  const idxPrevAct = Math.max(0, ORDEN_FREC.indexOf(frecActualLetra))
  const idxActFinal = reducirIndice(idxPrevAct, prodMitActual)

  const severidadMax = Math.max(
    d.imp_economico,
    d.imp_personas,
    d.imp_ambiente,
    d.imp_reputacion
  )

  return {
    frecuencia_actual: frecActualLetra,
    frecuencia_actual_num: frecActNum,
    frecuencia_actual_display: frecActualDisplay,
    riesgo_diseno_global: nivelMatriz(idxDisFinal, severidadMax),
    riesgo_actual_global: nivelMatriz(idxActFinal, severidadMax),
    riesgo_diseno_imp: {
      economico: nivelMatriz(idxDisFinal, d.imp_economico),
      personas: nivelMatriz(idxDisFinal, d.imp_personas),
      ambiente: nivelMatriz(idxDisFinal, d.imp_ambiente),
      reputacion: nivelMatriz(idxDisFinal, d.imp_reputacion),
    },
    riesgo_actual_imp: {
      economico: nivelMatriz(idxActFinal, d.imp_economico),
      personas: nivelMatriz(idxActFinal, d.imp_personas),
      ambiente: nivelMatriz(idxActFinal, d.imp_ambiente),
      reputacion: nivelMatriz(idxActFinal, d.imp_reputacion),
    },
  }
}

interface SeleccionCelda {
  celdaId: string
  escenarioId: number
  barreraIdx: number | null
  desviacionKey: string
  consecuenciaKey: string
}

function IconBtn({
  titulo,
  onClick,
  path,
  disabled,
  cuadro,
}: {
  titulo: string
  onClick: () => void
  path: string
  disabled?: boolean
  cuadro?: boolean
}) {
  return (
    <button
      type="button"
      title={titulo}
      aria-label={titulo}
      onClick={onClick}
      disabled={disabled}
      className="p-1.5 rounded-md text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {cuadro && <rect x="3" y="3" width="18" height="18" rx="3" />}
        <path d={path} />
      </svg>
    </button>
  )
}

export function Escenarios() {
  const navigate = useNavigate()
  const { usuario } = useAuth()
  const esAdmin = usuario?.rol === 'admin'
  const qc = useQueryClient()
  const [searchParams] = useSearchParams()
  const escenarioIdParam = searchParams.get('escenario_id')
    ? Number(searchParams.get('escenario_id'))
    : null
  const palabraGuiaIdParam = searchParams.get('palabra_guia_id') || searchParams.get('desviacion_id')
    ? Number(searchParams.get('palabra_guia_id') || searchParams.get('desviacion_id'))
    : null

  const [unidadId, setUnidadId] = useState<number | undefined>()
  const [q, setQ] = useState('')
  const [mostrarEsquema, setMostrarEsquema] = useState(false)
  const [borradores, setBorradores] = useState<Record<number, EscenarioEditable>>({})
  const [guardandoIds, setGuardandoIds] = useState<Record<number, boolean>>({})
  const [mensajeGuardado, setMensajeGuardado] = useState<string | null>(null)
  const [seleccion, setSeleccion] = useState<SeleccionCelda | null>(null)
  const [escenarioEnfocado, setEscenarioEnfocado] = useState<number | null>(escenarioIdParam)

  const unidades = useQuery({
    queryKey: ['unidades'],
    queryFn: () => api.get<Pagina<Unidad>>('/unidades', { size: 100 }),
  })

  const qs = useQuery({
    queryKey: ['escenarios-pha', unidadId, q],
    queryFn: () =>
      api.get<Pagina<Escenario>>('/escenarios', {
        unidad_id: unidadId,
        q: q || undefined,
        orden: 'id',
        page: 1,
        size: 200,
      }),
  })

  useEffect(() => {
    if (!qs.data?.items) return
    setBorradores((prev) => {
      const next: Record<number, EscenarioEditable> = {}
      for (const item of qs.data.items) {
        if (prev[item.id]?.modificado) {
          next[item.id] = prev[item.id]
        } else {
          next[item.id] = crearBorrador(item)
        }
      }
      return next
    })
  }, [qs.data])

  // Desplazamiento y enfoque automático hacia el escenario (inicio de la fila) cuando viene de la URL
  useEffect(() => {
    if (!escenarioIdParam) return
    setEscenarioEnfocado(escenarioIdParam)

    if (qs.data?.items?.length) {
      const escEncontrado = qs.data.items.find((e) => e.id === escenarioIdParam)
      if (escEncontrado) {
        setSeleccion({
          celdaId: `causa-${escEncontrado.id}`,
          escenarioId: escEncontrado.id,
          barreraIdx: (escEncontrado.barreras?.length ?? 0) > 0 ? 0 : null,
          desviacionKey: `${escEncontrado.nodo_id}::${escEncontrado.palabra_guia_id}`,
          consecuenciaKey: `${escEncontrado.nodo_id}::${escEncontrado.palabra_guia_id}::${escEncontrado.consecuencia.trim()}`,
        })
      }
    }

    const timer = setTimeout(() => {
      // 1. Centrar verticalmente en la fila o causa del escenario (inicio de la fila)
      const el =
        document.getElementById(`fila-escenario-${escenarioIdParam}`) ||
        document.getElementById(`causa-${escenarioIdParam}`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
      // 2. Desplazar el contenedor horizontalmente a la izquierda (inicio de la fila)
      const container = document.getElementById('tabla-escenarios-container')
      if (container) {
        container.scrollTo({ left: 0, behavior: 'smooth' })
      }
    }, 350)
    return () => clearTimeout(timer)
  }, [escenarioIdParam, qs.data])

  // Desplazamiento y selección hacia la desviación cuando viene desde el BowTie
  useEffect(() => {
    if (!palabraGuiaIdParam || !qs.data?.items?.length) return
    const primerEsc = qs.data.items.find((e) => e.palabra_guia_id === palabraGuiaIdParam)
    if (primerEsc) {
      setSeleccion({
        celdaId: `causa-${primerEsc.id}`,
        escenarioId: primerEsc.id,
        barreraIdx: (primerEsc.barreras?.length ?? 0) > 0 ? 0 : null,
        desviacionKey: `${primerEsc.nodo_id}::${primerEsc.palabra_guia_id}`,
        consecuenciaKey: `${primerEsc.nodo_id}::${primerEsc.palabra_guia_id}::${primerEsc.consecuencia.trim()}`,
      })
      const timer = setTimeout(() => {
        const el = document.getElementById(`causa-${primerEsc.id}`) || document.getElementById(`fdis-${primerEsc.id}`)
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
      }, 400)
      return () => clearTimeout(timer)
    }
  }, [palabraGuiaIdParam, qs.data])

  const listaEscenarios = useMemo(() => {
    if (!qs.data?.items) return []
    return qs.data.items.map((item) => borradores[item.id] ?? crearBorrador(item))
  }, [qs.data, borradores])

  // Agrupación jerárquica de 4 niveles:
  // Nivel 1: Desviación (1.1, 1.2...) -> Nivel 2: Consecuencia (1.1.1, 1.1.2...) -> Nivel 3: Causa (1.1.1.1...) -> Nivel 4: Barreras (1, 2, 3...)
  const jerarquia = useMemo(() => {
    const mapDesv = new Map<
      string,
      {
        desviacionKey: string
        nodo_id: number
        nodo: string
        palabra_guia_id: number
        palabra_guia: string
        peligro: string
        escenarioIds: number[]
        consecuenciasMap: Map<
          string,
          {
            consecuenciaKey: string
            consecuencia: string
            imp_economico: number
            imp_personas: number
            imp_ambiente: number
            imp_reputacion: number
            causas: EscenarioEditable[]
          }
        >
      }
    >()

    for (const esc of listaEscenarios) {
      const desvKey = `${esc.nodo_id}::${esc.palabra_guia_id}`
      if (!mapDesv.has(desvKey)) {
        mapDesv.set(desvKey, {
          desviacionKey: desvKey,
          nodo_id: esc.nodo_id,
          nodo: esc.nodo,
          palabra_guia_id: esc.palabra_guia_id,
          palabra_guia: esc.palabra_guia,
          peligro: esc.peligro,
          escenarioIds: [],
          consecuenciasMap: new Map(),
        })
      }
      const grupoDesv = mapDesv.get(desvKey)!
      grupoDesv.escenarioIds.push(esc.id)

      const consKey = esc.consecuenciaGroupKey
      if (!grupoDesv.consecuenciasMap.has(consKey)) {
        grupoDesv.consecuenciasMap.set(consKey, {
          consecuenciaKey: consKey,
          consecuencia: esc.consecuencia,
          imp_economico: esc.imp_economico,
          imp_personas: esc.imp_personas,
          imp_ambiente: esc.imp_ambiente,
          imp_reputacion: esc.imp_reputacion,
          causas: [],
        })
      }
      grupoDesv.consecuenciasMap.get(consKey)!.causas.push(esc)
    }

    return Array.from(mapDesv.values()).map((d, dIdx) => {
      const numDesv = `1.${dIdx + 1}`
      const consecuencias = Array.from(d.consecuenciasMap.values()).map(
        (c, cIdx) => {
          const numCons = `${numDesv}.${cIdx + 1}`
          const causas = c.causas.map((causaEsc, kIdx) => {
            const numCausa = `${numCons}.${kIdx + 1}`
            const filasBarrera = Math.max(1, causaEsc.barreras.length)
            return {
              ...causaEsc,
              numCausa,
              filasBarrera,
            }
          })
          const filasConsecuencia = causas.reduce(
            (acc, ca) => acc + ca.filasBarrera,
            0
          )
          return {
            ...c,
            numCons,
            causas,
            filasConsecuencia,
          }
        }
      )
      const filasDesviacion = consecuencias.reduce(
        (acc, co) => acc + co.filasConsecuencia,
        0
      )
      return {
        ...d,
        numDesv,
        consecuencias,
        filasDesviacion,
      }
    })
  }, [listaEscenarios])

  // Seleccionar por defecto el primer escenario si no hay selección activa
  const seleccionActiva = useMemo(() => {
    if (seleccion && borradores[seleccion.escenarioId]) {
      return seleccion
    }
    const primero = jerarquia[0]?.consecuencias[0]?.causas[0]
    if (!primero) return null
    return {
      celdaId: `causa-${primero.id}`,
      escenarioId: primero.id,
      barreraIdx: primero.barreras.length > 0 ? 0 : null,
      desviacionKey: `${primero.nodo_id}::${primero.palabra_guia_id}`,
      consecuenciaKey: primero.consecuenciaGroupKey,
    }
  }, [seleccion, borradores, jerarquia])

  // Desviación correspondiente a la celda actualmente seleccionada
  const desviacionSeleccionada = useMemo(() => {
    if (!seleccionActiva) return jerarquia[0] ?? null
    return (
      jerarquia.find((d) => d.desviacionKey === seleccionActiva.desviacionKey) ??
      jerarquia[0] ??
      null
    )
  }, [seleccionActiva, jerarquia])

  // Actualizar un único escenario
  const actualizarEscenario = (
    id: number,
    updater: (actual: EscenarioEditable) => EscenarioEditable
  ) => {
    setBorradores((prev) => {
      const base = prev[id]
      if (!base) return prev
      return {
        ...prev,
        [id]: { ...updater(base), modificado: true },
      }
    })
  }

  // Actualizar todos los escenarios que comparten la misma Desviación (palabra_guia / peligro)
  const actualizarGrupoDesviacion = (
    escenarioIds: number[],
    updater: (actual: EscenarioEditable) => EscenarioEditable
  ) => {
    setBorradores((prev) => {
      const next = { ...prev }
      for (const id of escenarioIds) {
        if (next[id]) {
          next[id] = { ...updater(next[id]), modificado: true }
        }
      }
      return next
    })
  }

  // Actualizar todos los escenarios que comparten la misma Consecuencia dentro de una Desviación
  const actualizarGrupoConsecuencia = (
    causas: EscenarioEditable[],
    updater: (actual: EscenarioEditable) => EscenarioEditable
  ) => {
    setBorradores((prev) => {
      const next = { ...prev }
      for (const c of causas) {
        if (next[c.id]) {
          next[c.id] = { ...updater(next[c.id]), modificado: true }
        }
      }
      return next
    })
  }

  // Guardar escenario individual vía PUT /bowtie/{id}
  const guardarEscenarioApi = async (esc: EscenarioEditable) => {
    const barrerasPayload = esc.barreras.map((b, i) => ({
      tag_activo: b.tag_activo.trim() || `BAR-${esc.id}-${i + 1}`,
      descripcion: b.descripcion.trim() || 'Barrera definida en hoja PHA',
      tipo: b.rol === 'TEMPORAL' ? 'TEMPORAL' : 'EXISTENTE',
      lado: b.rol === 'REACTIVA' ? 'MITIGATIVA' : 'PREVENTIVA',
      frr_diseno: Math.max(1, Number(b.frr_diseno) || 10),
      estado_actual: b.estado_actual,
      factor_degradacion: Math.max(
        1,
        Math.min(100, Number(b.factor_degradacion) || 90)
      ),
      vigencia_desde: b.vigencia_desde ?? null,
      vigencia_hasta: b.vigencia_hasta ?? null,
      moc_ref: b.moc_ref ?? null,
    }))

    const factoresPayload = esc.barreras
      .map((b, i) => ({
        barrera_tag: b.tag_activo.trim() || `BAR-${esc.id}-${i + 1}`,
        descripcion: b.factor_escalamiento.trim(),
        control: b.control_escalamiento.trim(),
      }))
      .filter((f) => f.descripcion.length > 0)
      .map((f) => ({
        barrera_tag: f.barrera_tag,
        descripcion: f.descripcion,
        categoria: 'Operacional',
        controles: f.control
          ? [
              {
                descripcion: f.control,
                tag_activo: `CTRL-${f.barrera_tag.slice(0, 12)}`,
                estado_actual: 'DISPONIBLE',
              },
            ]
          : [],
      }))

    await api.put(`/bowtie/${esc.id}`, {
      palabra_guia: esc.palabra_guia,
      causa: esc.causa,
      peligro: esc.peligro,
      evento_tope: esc.evento_tope,
      frecuencia_diseno: esc.frecuencia_diseno,
      consecuencia: esc.consecuencia,
      recomendacion: esc.recomendacion,
      rec_prioridad: esc.rec_prioridad,
      rec_responsable: esc.rec_responsable,
      rec_estado: esc.rec_estado,
      rec_comentarios: esc.rec_comentarios,
      imp_economico: Number(esc.imp_economico),
      imp_personas: Number(esc.imp_personas),
      imp_ambiente: Number(esc.imp_ambiente),
      imp_reputacion: Number(esc.imp_reputacion),
      barreras: barrerasPayload,
      factores_escalamiento: factoresPayload,
    })
  }

  const escenariosModificados = useMemo(
    () => Object.values(borradores).filter((b) => b.modificado),
    [borradores]
  )

  const guardarTodos = async () => {
    if (escenariosModificados.length === 0) return
    const ids = escenariosModificados.map((e) => e.id)
    const mapLoad: Record<number, boolean> = {}
    ids.forEach((id) => (mapLoad[id] = true))
    setGuardandoIds((p) => ({ ...p, ...mapLoad }))
    try {
      for (const esc of escenariosModificados) {
        await guardarEscenarioApi(esc)
      }
      setBorradores((prev) => {
        const next = { ...prev }
        for (const id of ids) {
          if (next[id]) next[id] = { ...next[id], modificado: false }
        }
        return next
      })
      await qc.invalidateQueries({ queryKey: ['escenarios-pha'] })
      await qc.invalidateQueries({ queryKey: ['bowtie'] })
      await qc.invalidateQueries({ queryKey: ['barreras'] })
      setMensajeGuardado(
        `Se guardaron ${ids.length} escenario(s) PHA y se recalcularon los riesgos.`
      )
      setTimeout(() => setMensajeGuardado(null), 3500)
    } finally {
      setGuardandoIds({})
    }
  }

  // Mutaciones para agregar Desviación, Consecuencia, Causa o Eliminar
  const crearEscenarioMut = useMutation({
    mutationFn: (payload: {
      palabra_guia_id?: number
      nodo_id?: number
      palabra_guia?: string
      peligro: string
      evento_tope: string
      consecuencia: string
      causa: string
      frecuencia_diseno: string
      imp_economico: number
      imp_personas: number
      imp_ambiente: number
      imp_reputacion: number
    }) => api.post<Escenario>('/escenarios', payload),
    onSuccess: (nuevo) => {
      qc.invalidateQueries({ queryKey: ['escenarios-pha'] })
      setMensajeGuardado(`Fila agregada en la hoja PHA (#${nuevo.id}).`)
      setTimeout(() => setMensajeGuardado(null), 3000)
    },
  })

  const eliminarEscenarioMut = useMutation({
    mutationFn: (id: number) => api.del(`/escenarios/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['escenarios-pha'] })
      setMensajeGuardado('Causa / escenario eliminado de la hoja PHA.')
      setTimeout(() => setMensajeGuardado(null), 3000)
    },
  })

  // Acciones de la barra de herramientas superior (estilo PHA-Pro)
  const handleAgregarConsecuencia = () => {
    if (!seleccionActiva) return
    const base = borradores[seleccionActiva.escenarioId]
    if (!base) return
    const grupoDesv = jerarquia.find(
      (d) => d.desviacionKey === `${base.nodo_id}::${base.palabra_guia_id}`
    )
    const numNuevaCons = (grupoDesv?.consecuencias.length ?? 1) + 1
    crearEscenarioMut.mutate({
      palabra_guia_id: base.palabra_guia_id,
      peligro: base.peligro,
      evento_tope: base.evento_tope,
      consecuencia: `Nueva consecuencia (${grupoDesv?.numDesv ?? '1.1'}.${numNuevaCons}) para ${base.palabra_guia}`,
      causa: `Causa iniciadora (${grupoDesv?.numDesv ?? '1.1'}.${numNuevaCons}.1)`,
      frecuencia_diseno: base.frecuencia_diseno,
      imp_economico: base.imp_economico,
      imp_personas: base.imp_personas,
      imp_ambiente: base.imp_ambiente,
      imp_reputacion: base.imp_reputacion,
    })
  }

  const handleAgregarCausa = () => {
    if (!seleccionActiva) return
    const base = borradores[seleccionActiva.escenarioId]
    if (!base) return
    const ts = Date.now().toString().slice(-3)
    crearEscenarioMut.mutate({
      palabra_guia_id: base.palabra_guia_id,
      peligro: base.peligro,
      evento_tope: base.evento_tope,
      consecuencia: base.consecuencia,
      causa: `Nueva causa iniciadora para esta consecuencia (#${ts})`,
      frecuencia_diseno: base.frecuencia_diseno,
      imp_economico: base.imp_economico,
      imp_personas: base.imp_personas,
      imp_ambiente: base.imp_ambiente,
      imp_reputacion: base.imp_reputacion,
    })
  }

  const handleAgregarBarrera = (rol: RolBarrera) => {
    if (!seleccionActiva) return
    const escId = seleccionActiva.escenarioId
    actualizarEscenario(escId, (actual) => {
      const idx = actual.barreras.length + 1
      const prefijo =
        rol === 'PREVENTIVA' ? 'BP' : rol === 'REACTIVA' ? 'BR' : 'BT'
      const hoyStr = new Date().toISOString().slice(0, 10)
      const mesStr = new Date(Date.now() + 30 * 86400000)
        .toISOString()
        .slice(0, 10)
      const nueva: BarreraEditable = {
        uid: `${escId}-${Date.now()}-${idx}`,
        tag_activo: `${prefijo}-${escId}-${idx}`,
        descripcion:
          rol === 'PREVENTIVA'
            ? 'Nueva salvaguarda preventiva'
            : rol === 'REACTIVA'
              ? 'Nueva salvaguarda reactiva'
              : 'Nueva barrera temporal MOC',
        rol,
        frr_diseno: 10,
        estado_actual: 'DISPONIBLE',
        factor_degradacion: 90,
        factor_escalamiento: '',
        control_escalamiento: '',
        vigencia_desde: rol === 'TEMPORAL' ? hoyStr : null,
        vigencia_hasta: rol === 'TEMPORAL' ? mesStr : null,
        moc_ref: rol === 'TEMPORAL' ? 'MOC-PHA-TEMP' : null,
      }
      return {
        ...actual,
        barreras: [...actual.barreras, nueva],
      }
    })
  }

  const handleEliminarSeleccion = () => {
    if (!seleccionActiva) return
    const esc = borradores[seleccionActiva.escenarioId]
    if (!esc) return

    if (
      seleccionActiva.barreraIdx !== null &&
      esc.barreras[seleccionActiva.barreraIdx]
    ) {
      const idxBorrar = seleccionActiva.barreraIdx
      actualizarEscenario(esc.id, (actual) => ({
        ...actual,
        barreras: actual.barreras.filter((_, i) => i !== idxBorrar),
      }))
      setSeleccion((prev) =>
        prev ? { ...prev, barreraIdx: null } : null
      )
    } else {
      if (
        window.confirm(
          `¿Eliminar la causa "${esc.causa}" de la hoja de trabajo PHA?`
        )
      ) {
        eliminarEscenarioMut.mutate(esc.id)
      }
    }
  }

  // --- Panel minimalista: nueva desviación con selección de nodo, duplicar, exportar ---
  const [modalDesv, setModalDesv] = useState(false)
  const [nodoNuevoId, setNodoNuevoId] = useState<number | ''>('')
  const [nombreDesvNueva, setNombreDesvNueva] = useState('')
  const [menuMas, setMenuMas] = useState(false)
  const [duplicando, setDuplicando] = useState(false)

  const nodosQ = useQuery({
    queryKey: ['nodos-pha'],
    queryFn: () =>
      api.get<Pagina<{ id: number; unidad_id: number; nombre: string }>>('/nodos', {
        size: 200,
      }),
  })

  const nombreUnidad = (id: number) =>
    unidades.data?.items.find((u) => u.id === id)?.nombre ?? ''

  const abrirModalDesviacion = () => {
    const base = seleccionActiva ? borradores[seleccionActiva.escenarioId] : listaEscenarios[0]
    setNodoNuevoId(base?.nodo_id ?? nodosQ.data?.items[0]?.id ?? '')
    setNombreDesvNueva('')
    setModalDesv(true)
  }

  const confirmarNuevaDesviacion = () => {
    if (nodoNuevoId === '') return
    crearEscenarioMut.mutate({
      nodo_id: Number(nodoNuevoId),
      palabra_guia: nombreDesvNueva.trim() || `Nueva Desviación ${jerarquia.length + 1}`,
      peligro: 'Peligro asociado de proceso (editar en celda)',
      evento_tope: 'Pérdida de control del parámetro de proceso',
      consecuencia: 'Consecuencia potencial asociada a la desviación',
      causa: 'Causa iniciadora potencial',
      frecuencia_diseno: 'C',
      imp_economico: 3,
      imp_personas: 3,
      imp_ambiente: 2,
      imp_reputacion: 2,
    })
    setModalDesv(false)
  }

  const duplicarSeleccion = async () => {
    if (!seleccionActiva) return
    const esc = borradores[seleccionActiva.escenarioId]
    if (!esc) return
    setDuplicando(true)
    try {
      const causaCopia = `${esc.causa} (copia ${Date.now().toString().slice(-4)})`
      const nuevo = await api.post<Escenario>('/escenarios', {
        palabra_guia_id: esc.palabra_guia_id,
        peligro: esc.peligro,
        evento_tope: esc.evento_tope,
        consecuencia: esc.consecuencia,
        causa: causaCopia,
        frecuencia_diseno: esc.frecuencia_diseno,
        imp_economico: esc.imp_economico,
        imp_personas: esc.imp_personas,
        imp_ambiente: esc.imp_ambiente,
        imp_reputacion: esc.imp_reputacion,
      })
      if (esc.barreras.length > 0) {
        await guardarEscenarioApi({ ...esc, id: nuevo.id, causa: causaCopia })
      }
      await qc.invalidateQueries({ queryKey: ['escenarios-pha'] })
      await qc.invalidateQueries({ queryKey: ['barreras'] })
      setMensajeGuardado(`Causa duplicada (#${nuevo.id}).`)
      setTimeout(() => setMensajeGuardado(null), 3000)
    } catch (e) {
      setMensajeGuardado(`No se pudo duplicar: ${(e as Error).message}`)
    } finally {
      setDuplicando(false)
    }
  }

  const exportarCsvPha = () => {
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const filas: string[] = [
      [
        'Nodo', 'Desviacion', 'Consecuencia', 'Causa', 'Fdis', 'Salvaguarda', 'Tipo', 'Tag',
        'FRRd', 'Estado', 'Degr%', 'FRRa', 'E', 'P', 'A', 'R', 'Riesgo Diseno', 'Riesgo Actual',
      ].join(','),
    ]
    for (const d of jerarquia) {
      for (const c of d.consecuencias) {
        for (const ca of c.causas) {
          const calc = evaluarBorrador(ca)
          const bars = ca.barreras.length > 0 ? ca.barreras : [null]
          for (const b of bars) {
            filas.push(
              [
                d.nodo, `${d.numDesv} ${d.palabra_guia}`, `${c.numCons} ${c.consecuencia}`,
                `${ca.numCausa} ${ca.causa}`, `${ca.frecuencia_diseno_num || FREC_CUANTITATIVA[ca.frecuencia_diseno]?.cuant || ca.frecuencia_diseno} (${ca.frecuencia_diseno})`,
                b?.descripcion ?? '', b?.rol ?? '', b?.tag_activo ?? '', b?.frr_diseno ?? '',
                b?.estado_actual ?? '', b?.factor_degradacion ?? '',
                b ? calcFrrActual(b.frr_diseno, b.estado_actual, b.factor_degradacion) : '',
                ca.imp_economico, ca.imp_personas, ca.imp_ambiente, ca.imp_reputacion,
                calc.riesgo_diseno_global, calc.riesgo_actual_global,
              ]
                .map(esc)
                .join(',')
            )
          }
        }
      }
    }
    const blob = new Blob(['\uFEFF' + filas.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'PHA_Worksheet_GIDR.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const celdaActivaClass = (id: string) =>
    seleccionActiva?.celdaId === id
      ? 'ring-2 ring-inset ring-[#1e4e79] dark:ring-sky-500 bg-sky-100/70 dark:bg-slate-800'
      : 'hover:bg-sky-100/40 dark:hover:bg-slate-800/40'

  return (
    <div className="space-y-2">
      {/* Cabecera compacta */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
            Escenarios PHA — Hoja de Trabajo (HAZOP / LOPA Worksheet)
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Haz clic sobre cualquier celda para editar directamente. Una desviación puede agrupar múltiples consecuencias, causas y salvaguardas.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMostrarEsquema((v) => !v)}
            className="px-2.5 py-1 text-xs font-medium rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
          >
            {mostrarEsquema ? 'Ocultar fórmulas' : '∑ Fórmulas de cálculo'}
          </button>
        </div>
      </div>

      {/* Panel desplegable de fórmulas */}
      {mostrarEsquema && (
        <div className="bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded p-3 text-xs text-slate-700 dark:text-slate-300 grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <div className="font-semibold text-slate-900 dark:text-slate-100">1. FRR Actual de Barrera</div>
            <div className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
              Disponible: <code>FRR_d</code> | Degradado (<code>D = 1..100%</code>):{' '}
              <code>max(1, FRR_d × (100 - D)/100)</code> | Mant./Fuera serv./Inexist.:{' '}
              <code>1.0</code>
            </div>
          </div>
          <div>
            <div className="font-semibold text-slate-900 dark:text-slate-100">2. Frecuencia Actual (F_a)</div>
            <div className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
              <code>idx(F_a) = max(0, idx(F_d) - ⌊log10(∏ FRR_act_prev × ∏ FRR_act_temp)⌋)</code>
            </div>
          </div>
          <div>
            <div className="font-semibold text-slate-900 dark:text-slate-100">3. Riesgo de Diseño (RD)</div>
            <div className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
              Matriz 5×5 evaluada con <code>F_d</code> reducida por barreras preventivas y reactivas de diseño.
            </div>
          </div>
          <div>
            <div className="font-semibold text-slate-900 dark:text-slate-100">4. Riesgo Actual por Impacto (E, P, A, R)</div>
            <div className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
              Matriz 5×5 evaluada con <code>F_a</code> reducida por barreras reactivas actuales para cada severidad <code>1–5</code>.
            </div>
          </div>
        </div>
      )}

      {mensajeGuardado && (
        <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 px-3 py-1.5 rounded text-xs font-medium flex items-center justify-between">
          <span>✓ {mensajeGuardado}</span>
          <button
            type="button"
            onClick={() => setMensajeGuardado(null)}
            className="text-emerald-700 dark:text-emerald-300 hover:text-emerald-950 dark:hover:text-white font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Contenedor principal estilo PHA-Pro Worksheet (igual a Nodos) */}
      <div className="border border-slate-400 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm rounded-sm overflow-hidden">
        {/* Barra de herramientas superior tipo PHA-Pro */}
        <div className="bg-white dark:bg-slate-900 border-b border-slate-300 dark:border-slate-700 px-2.5 py-1.5 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-1">
            {esAdmin ? (
              <>
                <IconBtn
                  titulo="Agregar desviación (elegir nodo)"
                  onClick={abrirModalDesviacion}
                  disabled={crearEscenarioMut.isPending}
                  path="M12 5v14M5 12h14"
                  cuadro
                />
                <IconBtn
                  titulo="Duplicar la causa seleccionada"
                  onClick={duplicarSeleccion}
                  disabled={!seleccionActiva || duplicando}
                  path="M9 9h10v10H9zM5 15V5h10"
                />
                <IconBtn
                  titulo={
                    seleccionActiva?.barreraIdx !== null
                      ? 'Eliminar la salvaguarda seleccionada'
                      : 'Eliminar la causa seleccionada'
                  }
                  onClick={handleEliminarSeleccion}
                  disabled={!seleccionActiva}
                  path="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"
                />
                <span className="mx-1.5 h-4 w-px bg-slate-300 dark:bg-slate-700" />
                <IconBtn
                  titulo="Exportar a CSV"
                  onClick={exportarCsvPha}
                  path="M12 4v11M7 11l5 5 5-5M5 20h14"
                />
                <IconBtn
                  titulo="Imprimir"
                  onClick={() => window.print()}
                  path="M7 9V4h10v5M7 17H5v-6h14v6h-2M7 14h10v6H7z"
                />
                <span className="mx-1.5 h-4 w-px bg-slate-300 dark:bg-slate-700" />

                {/* Menú de elementos adicionales (consecuencia, causa, salvaguardas) */}
                <div className="relative">
                  <IconBtn
                    titulo="Agregar consecuencia, causa o salvaguarda"
                    onClick={() => setMenuMas((v) => !v)}
                    disabled={!seleccionActiva}
                    path="M5 12h.01M12 12h.01M19 12h.01"
                  />
                  {menuMas && seleccionActiva && (
                    <div className="absolute left-0 top-full z-30 mt-1 w-52 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 py-1 shadow-lg">
                      {(
                        [
                          ['+ Consecuencia', handleAgregarConsecuencia],
                          ['+ Causa', handleAgregarCausa],
                          ['+ Salvaguarda preventiva', () => handleAgregarBarrera('PREVENTIVA')],
                          ['+ Salvaguarda reactiva', () => handleAgregarBarrera('REACTIVA')],
                          ['+ Barrera temporal (MOC)', () => handleAgregarBarrera('TEMPORAL')],
                        ] as [string, () => void][]
                      ).map(([etq, fn]) => (
                        <button
                          key={etq}
                          type="button"
                          onClick={() => {
                            setMenuMas(false)
                            fn()
                          }}
                          className="block w-full px-3 py-1.5 text-left text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
                        >
                          {etq}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={guardarTodos}
                  disabled={
                    escenariosModificados.length === 0 ||
                    Object.keys(guardandoIds).length > 0
                  }
                  title="Guardar cambios de la hoja"
                  className={`ml-1 px-2.5 py-1 rounded-md font-semibold flex items-center gap-1.5 transition-colors ${
                    escenariosModificados.length > 0
                      ? 'bg-[#1e4e79] text-white hover:bg-[#163a5c]'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-700'
                  }`}
                >
                  💾 Guardar
                  {escenariosModificados.length > 0 && (
                    <span className="bg-amber-400 text-slate-950 px-1.5 rounded-full text-[10px] font-bold">
                      {escenariosModificados.length}
                    </span>
                  )}
                </button>
              </>
            ) : (
              <span className="text-slate-600 dark:text-slate-400 font-medium px-2">
                Modo solo lectura (inicia sesión como Admin para editar celdas)
              </span>
            )}

            {/* Botón único para ir al BowTie de la desviación actualmente seleccionada (minimalista oscuro) */}
            {desviacionSeleccionada && (
              <>
                <span className="mx-1 h-4 w-px bg-slate-300 dark:bg-slate-700" />
                <Link
                  to={`/bowtie/desviacion/${desviacionSeleccionada.palabra_guia_id}`}
                  title={`Ver BowTie interactivo de la Desviación ${desviacionSeleccionada.numDesv} (${desviacionSeleccionada.palabra_guia})`}
                  className="px-3 py-1 rounded text-xs font-semibold bg-slate-900 hover:bg-black text-white hover:text-slate-100 border border-slate-700/80 hover:border-slate-600 flex items-center gap-2 transition-all duration-150 shadow-xs tracking-tight"
                >
                  <span className="text-[11px] opacity-90">🎯</span>
                  <span>
                    Ver BowTie ({desviacionSeleccionada.numDesv} · {desviacionSeleccionada.palabra_guia})
                  </span>
                  <span className="text-slate-400 text-[11px]">→</span>
                </Link>
              </>
            )}
          </div>

          {/* Buscador y filtro de unidad a la derecha (como Search Worksheet...) */}
          <div className="flex items-center gap-2">
            <select
              className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-sm px-2 py-1 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:border-[#1e4e79]"
              value={unidadId ?? ''}
              onChange={(e) =>
                setUnidadId(e.target.value ? Number(e.target.value) : undefined)
              }
            >
              <option value="">Todas las unidades ({qs.data?.total ?? 0})</option>
              {unidades.data?.items.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nombre}
                </option>
              ))}
            </select>
            <input
              className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-sm px-2.5 py-1 text-xs text-slate-800 dark:text-slate-200 w-52 focus:outline-none focus:border-[#1e4e79] placeholder-slate-400"
              placeholder="Search Worksheet..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </div>

        {/* Tabla estilo hoja de cálculo PHA-Pro con celdas combinadas (rowSpan) */}
        <div id="tabla-escenarios-container" className="overflow-x-auto max-h-[calc(100vh-205px)]">
          <table className="w-full min-w-[1940px] border-collapse text-[12px] leading-snug text-slate-800 dark:text-slate-200 select-none">
            <thead className="sticky top-0 z-20 bg-[#f1f3f6] dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-bold">
              {/* Nivel 1 de Cabecera */}
              <tr>
                <th
                  rowSpan={3}
                  className="border border-slate-300 dark:border-slate-700 px-2.5 py-1.5 text-center w-[165px] min-w-[155px] bg-[#ebedf0] dark:bg-slate-800"
                >
                  Desviación /
                  <br />
                  <span className="font-normal text-[11px] text-slate-600 dark:text-slate-400">
                    Peligro Asociado
                  </span>
                </th>
                <th
                  colSpan={21}
                  className="border border-slate-300 dark:border-slate-700 px-2 py-1 text-center bg-[#e4e7ec] dark:bg-slate-800/90 text-slate-900 dark:text-slate-100 tracking-wide"
                >
                  Consecuencias
                </th>
                <th
                  rowSpan={3}
                  className="border border-slate-300 dark:border-slate-700 px-2.5 py-1.5 text-center w-[260px] min-w-[240px] bg-[#ebedf0] dark:bg-slate-800"
                >
                  Recomendaciones PHA
                </th>
                <th
                  rowSpan={3}
                  className="border border-slate-300 dark:border-slate-700 px-2 py-1.5 text-center w-[130px] min-w-[120px] bg-[#ebedf0] dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                >
                  Gestión de
                  <br />
                  Riesgos
                </th>
              </tr>

              {/* Nivel 2 de Cabecera */}
              <tr>
                <th
                  rowSpan={2}
                  className="border border-slate-300 dark:border-slate-700 px-2.5 py-1.5 text-center w-[210px] min-w-[190px] bg-[#ebedf0] dark:bg-slate-800"
                >
                  Consecuencia
                </th>
                <th
                  colSpan={10}
                  className="border border-slate-300 dark:border-slate-700 px-2 py-1 text-center bg-[#ebedf0] dark:bg-slate-800"
                >
                  Causas
                </th>
                <th
                  colSpan={4}
                  title="Severidad / Impactos: Económico (E), Personas (P), Ambiental (A), Reputación (R) [1-5]"
                  className="border border-slate-300 dark:border-slate-700 px-1 py-1 text-center bg-[#ebedf0] dark:bg-slate-800"
                >
                  Impactos (S)
                </th>
                <th
                  rowSpan={2}
                  title="Frecuencia cuantitativa actual calculada (año⁻¹) y categoría (A-E)"
                  className="border border-slate-300 dark:border-slate-700 px-1 py-1 text-center w-[64px] min-w-[60px] bg-[#ebedf0] dark:bg-slate-800"
                >
                  F<sub>act</sub>
                  <div className="text-[9px] font-normal text-slate-500 dark:text-slate-400">
                    año⁻¹
                  </div>
                </th>
                <th
                  rowSpan={2}
                  title="Riesgo de Diseño calculado"
                  className="border border-slate-300 dark:border-slate-700 px-1.5 py-1 text-center w-[68px] min-w-[68px] bg-[#ebedf0] dark:bg-slate-800"
                >
                  Riesgo
                  <br />
                  Diseño
                </th>
                <th
                  colSpan={4}
                  title="Riesgo Actual calculado para cada dimensión de impacto (Económico, Personas, Ambiental, Reputación)"
                  className="border border-slate-300 dark:border-slate-700 px-1 py-1 text-center bg-[#ebedf0] dark:bg-slate-800"
                >
                  Riesgo Actual (RR)
                </th>
              </tr>

              {/* Nivel 3 de Cabecera */}
              <tr className="text-[11px]">
                <th className="border border-slate-300 dark:border-slate-700 px-2 py-1 text-center w-[180px] min-w-[165px] bg-[#f5f6f8] dark:bg-slate-800/80">
                  Causa
                </th>
                <th
                  title="Frecuencia cuantitativa de diseño (año⁻¹) y categoría (A-E)"
                  className="border border-slate-300 dark:border-slate-700 px-1 py-1 text-center w-[74px] min-w-[70px] bg-[#f5f6f8] dark:bg-slate-800/80"
                >
                  F<sub>dis</sub>
                  <div className="text-[9px] font-normal text-slate-500 dark:text-slate-400">
                    año⁻¹
                  </div>
                </th>
                <th className="border border-slate-300 dark:border-slate-700 px-2 py-1 text-center w-[210px] min-w-[185px] bg-[#f5f6f8] dark:bg-slate-800/80">
                  Salvaguarda / Barrera
                </th>
                <th className="border border-slate-300 dark:border-slate-700 px-2 py-1 text-center w-[125px] min-w-[125px] bg-[#f5f6f8] dark:bg-slate-800/80">
                  Tipo
                </th>
                <th className="border border-slate-300 dark:border-slate-700 px-1.5 py-1 text-center w-[100px] min-w-[95px] bg-[#f5f6f8] dark:bg-slate-800/80">
                  Tag
                </th>
                <th
                  title="Factor de Reducción de Riesgo (FRR) de diseño"
                  className="border border-slate-300 dark:border-slate-700 px-1.5 py-1 text-center w-[64px] min-w-[64px] bg-[#f5f6f8] dark:bg-slate-800/80"
                >
                  FRR<sub>d</sub>
                </th>
                <th className="border border-slate-300 dark:border-slate-700 px-2 py-1 text-center w-[165px] min-w-[165px] bg-[#f5f6f8] dark:bg-slate-800/80">
                  Estado Actual
                </th>
                <th
                  title="Factor de degradación (1-100%) cuando la barrera está Degradada"
                  className="border border-slate-300 dark:border-slate-700 px-1.5 py-1 text-center w-[64px] min-w-[64px] bg-[#f5f6f8] dark:bg-slate-800/80"
                >
                  Degr.%
                </th>
                <th
                  title="FRR actual calculado a partir del estado de la barrera"
                  className="border border-slate-300 dark:border-slate-700 px-1.5 py-1 text-center w-[60px] min-w-[60px] bg-[#f5f6f8] dark:bg-slate-800/80"
                >
                  FRR<sub>a</sub>
                </th>
                <th className="border border-slate-300 dark:border-slate-700 px-2 py-1 text-center w-[195px] min-w-[175px] bg-[#f5f6f8] dark:bg-slate-800/80">
                  Factor Escalamiento / Control
                </th>
                {/* Impactos 1-5 */}
                <th
                  title="Impacto Económico (1-5)"
                  className="border border-slate-300 dark:border-slate-700 px-1.5 py-1 text-center w-[60px] min-w-[60px] bg-[#f5f6f8] dark:bg-slate-800/80"
                >
                  E
                </th>
                <th
                  title="Impacto en Personas (1-5)"
                  className="border border-slate-300 dark:border-slate-700 px-1.5 py-1 text-center w-[60px] min-w-[60px] bg-[#f5f6f8] dark:bg-slate-800/80"
                >
                  P
                </th>
                <th
                  title="Impacto Ambiental (1-5)"
                  className="border border-slate-300 dark:border-slate-700 px-1.5 py-1 text-center w-[60px] min-w-[60px] bg-[#f5f6f8] dark:bg-slate-800/80"
                >
                  A
                </th>
                <th
                  title="Impacto en Reputación (1-5)"
                  className="border border-slate-300 dark:border-slate-700 px-1.5 py-1 text-center w-[60px] min-w-[60px] bg-[#f5f6f8] dark:bg-slate-800/80"
                >
                  R
                </th>
                {/* Riesgo Actual por Impacto */}
                <th
                  title="Riesgo Actual Económico"
                  className="border border-slate-300 dark:border-slate-700 px-1 py-1 text-center w-[46px] min-w-[46px] bg-[#f5f6f8] dark:bg-slate-800/80"
                >
                  E
                </th>
                <th
                  title="Riesgo Actual Personas"
                  className="border border-slate-300 dark:border-slate-700 px-1 py-1 text-center w-[46px] min-w-[46px] bg-[#f5f6f8] dark:bg-slate-800/80"
                >
                  P
                </th>
                <th
                  title="Riesgo Actual Ambiental"
                  className="border border-slate-300 dark:border-slate-700 px-1 py-1 text-center w-[46px] min-w-[46px] bg-[#f5f6f8] dark:bg-slate-800/80"
                >
                  A
                </th>
                <th
                  title="Riesgo Actual Reputación"
                  className="border border-slate-300 dark:border-slate-700 px-1 py-1 text-center w-[46px] min-w-[46px] bg-[#f5f6f8] dark:bg-slate-800/80"
                >
                  R
                </th>
              </tr>
            </thead>

            <tbody>
              {jerarquia.flatMap((grupoDesv) => {
                const esDesviacionSeleccionada =
                  seleccionActiva?.desviacionKey === grupoDesv.desviacionKey

                return grupoDesv.consecuencias.flatMap((grupoCons, consIdx) =>
                  grupoCons.causas.flatMap((causaEsc, causaIdx) => {
                    const calc = evaluarBorrador(causaEsc)
                    const barreras =
                      causaEsc.barreras.length > 0
                        ? causaEsc.barreras
                        : [null]

                    return barreras.map((barrera, bIdx) => {
                      const esPrimeraFilaDesviacion =
                        consIdx === 0 && causaIdx === 0 && bIdx === 0
                      const esPrimeraFilaConsecuencia =
                        causaIdx === 0 && bIdx === 0
                      const esPrimeraFilaCausa = bIdx === 0

                      const seleccionar = (
                        celdaId: string,
                        barreraIndex: number | null = barrera ? bIdx : null
                      ) => {
                        setSeleccion({
                          celdaId,
                          escenarioId: causaEsc.id,
                          barreraIdx: barreraIndex,
                          desviacionKey: grupoDesv.desviacionKey,
                          consecuenciaKey: grupoCons.consecuenciaKey,
                        })
                      }

                      const esFilaEnfocada = causaEsc.id === escenarioEnfocado

                      return (
                        <tr
                          key={`${causaEsc.id}-b-${bIdx}`}
                          id={bIdx === 0 ? `fila-escenario-${causaEsc.id}` : undefined}
                          onClick={() => {
                            if (seleccionActiva?.desviacionKey !== grupoDesv.desviacionKey) {
                              setSeleccion({
                                celdaId: `causa-${causaEsc.id}`,
                                escenarioId: causaEsc.id,
                                barreraIdx: barrera ? bIdx : null,
                                desviacionKey: grupoDesv.desviacionKey,
                                consecuenciaKey: grupoCons.consecuenciaKey,
                              })
                            }
                          }}
                          className={`align-top transition-colors ${
                            esFilaEnfocada
                              ? 'bg-amber-100/90 dark:bg-amber-950/70 ring-2 ring-inset ring-amber-500'
                              : esDesviacionSeleccionada
                                ? 'bg-sky-50/70 dark:bg-sky-950/35'
                                : 'bg-white dark:bg-slate-900'
                          }`}
                        >
                          {/* 1. DESVIACIÓN Y PELIGRO ASOCIADO (rowSpan por toda la Desviación) */}
                          {esPrimeraFilaDesviacion && (
                            <td
                              rowSpan={grupoDesv.filasDesviacion}
                              onClick={() =>
                                seleccionar(`desv-${grupoDesv.desviacionKey}`, null)
                              }
                              className={`border border-slate-300 dark:border-slate-700 p-1.5 align-top transition-colors ${
                                esDesviacionSeleccionada
                                  ? 'border-l-4 border-l-[#1e4e79] dark:border-l-sky-500 bg-sky-50/70 dark:bg-sky-950/40'
                                  : ''
                              } ${celdaActivaClass(`desv-${grupoDesv.desviacionKey}`)}`}
                            >
                              <div className="flex items-baseline gap-1 font-semibold text-slate-900 dark:text-slate-100">
                                <span className="text-slate-500 dark:text-slate-400 shrink-0">
                                  {grupoDesv.numDesv}
                                </span>
                                <input
                                  disabled={!esAdmin}
                                  value={grupoDesv.palabra_guia}
                                  onChange={(e) =>
                                    actualizarGrupoDesviacion(
                                      grupoDesv.escenarioIds,
                                      (act) => ({
                                        ...act,
                                        palabra_guia: e.target.value,
                                      })
                                    )
                                  }
                                  className="w-full bg-transparent font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:bg-white dark:focus:bg-slate-800 px-0.5 rounded-xs"
                                />
                              </div>

                              <div className="mt-2 pt-1.5 border-t border-dashed border-slate-200 dark:border-slate-700">
                                <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-800 dark:text-amber-400">
                                  Peligro asociado:
                                </div>
                                <textarea
                                  disabled={!esAdmin}
                                  rows={3}
                                  value={grupoDesv.peligro}
                                  onChange={(e) =>
                                    actualizarGrupoDesviacion(
                                      grupoDesv.escenarioIds,
                                      (act) => ({
                                        ...act,
                                        peligro: e.target.value,
                                      })
                                    )
                                  }
                                  className="w-full bg-transparent text-[11px] text-slate-700 dark:text-slate-300 resize-none focus:outline-none focus:bg-white dark:focus:bg-slate-800 mt-0.5"
                                />
                              </div>

                              <div className="mt-1 text-[10px] text-slate-400 dark:text-slate-500 truncate">
                                Nodo: {grupoDesv.nodo}
                              </div>
                            </td>
                          )}

                          {/* 2. CONSECUENCIA (rowSpan por cada Consecuencia de la Desviación) */}
                          {esPrimeraFilaConsecuencia && (
                            <td
                              rowSpan={grupoCons.filasConsecuencia}
                              onClick={() =>
                                seleccionar(`cons-${grupoCons.consecuenciaKey}`, null)
                              }
                              className={`border border-slate-300 dark:border-slate-700 p-1.5 align-top transition-colors ${
                                esDesviacionSeleccionada ? 'bg-sky-50/50 dark:bg-sky-950/30' : ''
                              } ${celdaActivaClass(
                                `cons-${grupoCons.consecuenciaKey}`
                              )}`}
                            >
                              <div className="flex items-start gap-1">
                                <span className="text-slate-500 dark:text-slate-400 font-medium shrink-0">
                                  {grupoCons.numCons}
                                </span>
                                <textarea
                                  disabled={!esAdmin}
                                  rows={Math.max(
                                    3,
                                    Math.min(8, grupoCons.filasConsecuencia * 2)
                                  )}
                                  value={grupoCons.consecuencia}
                                  onChange={(e) =>
                                    actualizarGrupoConsecuencia(
                                      grupoCons.causas,
                                      (act) => ({
                                        ...act,
                                        consecuencia: e.target.value,
                                      })
                                    )
                                  }
                                  className="w-full bg-transparent text-slate-800 dark:text-slate-200 resize-none focus:outline-none focus:bg-white dark:focus:bg-slate-800"
                                />
                              </div>
                            </td>
                          )}

                          {/* 3. CAUSA Y FRECUENCIA DE DISEÑO (rowSpan por cada Causa) */}
                          {esPrimeraFilaCausa && (
                            <>
                              <td
                                id={`causa-${causaEsc.id}`}
                                rowSpan={causaEsc.filasBarrera}
                                onClick={() =>
                                  seleccionar(`causa-${causaEsc.id}`, null)
                                }
                                className={`border border-slate-300 dark:border-slate-700 p-1.5 align-top transition-colors ${
                                  esFilaEnfocada
                                    ? 'bg-amber-100 dark:bg-amber-950/80 ring-2 ring-inset ring-amber-500'
                                    : esDesviacionSeleccionada ? 'bg-sky-50/40 dark:bg-sky-950/25' : ''
                                } ${celdaActivaClass(
                                  `causa-${causaEsc.id}`
                                )}`}
                              >
                                <div className="flex items-start gap-1">
                                  <span className="text-slate-500 dark:text-slate-400 font-medium shrink-0">
                                    {causaEsc.numCausa}
                                  </span>
                                  {esFilaEnfocada && (
                                    <span className="shrink-0 px-1 py-0.5 rounded text-[10px] font-bold bg-amber-500 text-white shadow-2xs">
                                      ★ Crítico
                                    </span>
                                  )}
                                  <textarea
                                    disabled={!esAdmin}
                                    rows={Math.max(
                                      2,
                                      Math.min(6, causaEsc.filasBarrera * 2)
                                    )}
                                    value={causaEsc.causa}
                                    onChange={(e) =>
                                      actualizarEscenario(causaEsc.id, (act) => ({
                                        ...act,
                                        causa: e.target.value,
                                      }))
                                    }
                                    className="w-full bg-transparent text-slate-800 dark:text-slate-200 resize-none focus:outline-none focus:bg-white dark:focus:bg-slate-800"
                                  />
                                </div>
                              </td>

                              {/* Frecuencia de Diseño Cuantitativa con Letra Debajo */}
                              <td
                                rowSpan={causaEsc.filasBarrera}
                                onClick={() =>
                                  seleccionar(`fdis-${causaEsc.id}`, null)
                                }
                                title={`Frecuencia de diseño: ${causaEsc.frecuencia_diseno_num ?? FREC_CUANTITATIVA[causaEsc.frecuencia_diseno]?.cuant ?? causaEsc.frecuencia_diseno}/año (Categoría ${causaEsc.frecuencia_diseno})`}
                                className={`border border-slate-300 dark:border-slate-700 px-1 py-1 text-center align-top w-[78px] min-w-[74px] transition-colors ${
                                  esFilaEnfocada
                                    ? 'bg-amber-100/70 dark:bg-amber-950/60'
                                    : esDesviacionSeleccionada ? 'bg-sky-50/40 dark:bg-sky-950/25' : ''
                                } ${celdaActivaClass(
                                  `fdis-${causaEsc.id}`
                                )}`}
                              >
                                <div className="flex flex-col items-center justify-center py-0.5">
                                  {esAdmin ? (
                                    <input
                                      type="text"
                                      value={
                                        causaEsc.frecuencia_diseno_num ??
                                        frecuenciaLetraANumero(causaEsc.frecuencia_diseno).toString()
                                      }
                                      placeholder="0.001"
                                      onChange={(e) => {
                                        const valStr = e.target.value
                                        const parsed = parseFloat(valStr)
                                        const letraCalculada =
                                          !isNaN(parsed) && parsed > 0
                                            ? frecuenciaNumeroALetra(parsed)
                                            : (causaEsc.frecuencia_diseno as 'A' | 'B' | 'C' | 'D' | 'E')
                                        try {
                                          localStorage.setItem(
                                            `gidr_frec_num_${causaEsc.id}`,
                                            valStr
                                          )
                                        } catch {
                                          // ignorar cuota
                                        }
                                        actualizarEscenario(causaEsc.id, (act) => ({
                                          ...act,
                                          frecuencia_diseno_num: valStr,
                                          frecuencia_diseno: letraCalculada,
                                        }))
                                      }}
                                      className="w-full text-center font-mono font-bold text-xs text-slate-900 dark:text-slate-100 bg-transparent hover:bg-white dark:hover:bg-slate-800 focus:bg-white dark:focus:bg-slate-800 rounded px-0.5 py-0.5 border border-transparent focus:border-sky-500 focus:outline-none"
                                      title="Editar frecuencia cuantitativa de diseño (ej: 0.001, 0.3, 0.98)"
                                    />
                                  ) : (
                                    <span className="font-mono font-bold text-xs text-slate-900 dark:text-slate-100 leading-tight">
                                      {causaEsc.frecuencia_diseno_num ||
                                        FREC_CUANTITATIVA[causaEsc.frecuencia_diseno]?.cuant ||
                                        causaEsc.frecuencia_diseno}
                                    </span>
                                  )}
                                  <span className="text-[10px] font-extrabold text-[#1e4e79] dark:text-sky-400 uppercase tracking-wider leading-tight mt-0.5">
                                    ({causaEsc.frecuencia_diseno})
                                  </span>
                                </div>
                              </td>
                            </>
                          )}

                          {/* 4. SALVAGUARDA / BARRERA (1 fila por barrera, igual a PHA-Pro) */}
                          {barrera ? (
                            <>
                              {/* Descripción de la Salvaguarda */}
                              <td
                                onClick={() =>
                                  seleccionar(
                                    `bar-desc-${causaEsc.id}-${bIdx}`,
                                    bIdx
                                  )
                                }
                                className={`border border-slate-300 dark:border-slate-700 p-1.5 align-top transition-colors ${
                                  esFilaEnfocada ? 'bg-amber-50/70 dark:bg-amber-950/40' : ''
                                } ${celdaActivaClass(
                                  `bar-desc-${causaEsc.id}-${bIdx}`
                                )}`}
                              >
                                <div className="flex items-start gap-1">
                                  <span className="text-slate-500 dark:text-slate-400 font-medium shrink-0">
                                    {bIdx + 1}
                                  </span>
                                  <textarea
                                    disabled={!esAdmin}
                                    rows={2}
                                    value={barrera.descripcion}
                                    onChange={(e) =>
                                      actualizarEscenario(causaEsc.id, (act) => ({
                                        ...act,
                                        barreras: act.barreras.map((item, idx) =>
                                          idx === bIdx
                                            ? {
                                                ...item,
                                                descripcion: e.target.value,
                                              }
                                            : item
                                        ),
                                      }))
                                    }
                                    className="w-full bg-transparent text-slate-800 dark:text-slate-200 resize-none focus:outline-none focus:bg-white dark:focus:bg-slate-800"
                                  />
                                </div>
                              </td>

                              {/* Tipo / Rol de Barrera (Preventiva, Reactiva, Temporal) */}
                              <td
                                onClick={() =>
                                  seleccionar(
                                    `bar-rol-${causaEsc.id}-${bIdx}`,
                                    bIdx
                                  )
                                }
                                className={`border border-slate-300 dark:border-slate-700 px-1.5 py-1 align-top w-[125px] min-w-[125px] transition-colors ${
                                  seleccionActiva?.celdaId ===
                                  `bar-rol-${causaEsc.id}-${bIdx}`
                                    ? 'bg-[#1e4e79] text-white'
                                    : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                                }`}
                              >
                                <div className="relative flex items-center justify-between">
                                  <select
                                    disabled={!esAdmin}
                                    value={barrera.rol}
                                    onChange={(e) =>
                                      actualizarEscenario(causaEsc.id, (act) => ({
                                        ...act,
                                        barreras: act.barreras.map((item, idx) =>
                                          idx === bIdx
                                            ? {
                                                ...item,
                                                rol: e.target.value as RolBarrera,
                                              }
                                            : item
                                        ),
                                      }))
                                    }
                                    className="w-full appearance-none bg-transparent pr-4 text-[11.5px] font-medium text-slate-800 dark:text-slate-200 focus:outline-none cursor-pointer"
                                  >
                                    <option className="text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-900" value="PREVENTIVA">
                                      Preventiva
                                    </option>
                                    <option className="text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-900" value="REACTIVA">
                                      Reactiva
                                    </option>
                                    <option className="text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-900" value="TEMPORAL">
                                      Temporal
                                    </option>
                                  </select>
                                  <span className="pointer-events-none absolute right-0.5 text-[10px] opacity-70">
                                    ▾
                                  </span>
                                </div>
                              </td>

                              {/* Tag del activo - Vínculo directo a Gestión de Riesgos */}
                              <td
                                onClick={() =>
                                  seleccionar(
                                    `bar-tag-${causaEsc.id}-${bIdx}`,
                                    bIdx
                                  )
                                }
                                title={
                                  barrera.tag_activo
                                    ? `Clic para ir a Gestión de Riesgos del activo ${barrera.tag_activo}`
                                    : undefined
                                }
                                className={`border border-slate-300 dark:border-slate-700 p-1 align-top transition-colors ${
                                  esFilaEnfocada
                                    ? 'bg-amber-50/70 dark:bg-amber-950/40'
                                    : esDesviacionSeleccionada
                                      ? 'bg-sky-50/20 dark:bg-sky-950/15'
                                      : ''
                                } ${celdaActivaClass(`bar-tag-${causaEsc.id}-${bIdx}`)}`}
                              >
                                <div className="flex items-center justify-between gap-1 w-full">
                                  {barrera.tag_activo ? (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        navigate(`/gestion-riesgos?tag=${encodeURIComponent(barrera.tag_activo)}`)
                                      }}
                                      title={`Ir a Gestión de Riesgos: ${barrera.tag_activo}`}
                                      className="font-mono text-[11px] font-bold text-sky-700 dark:text-sky-400 hover:text-sky-900 dark:hover:text-sky-200 hover:underline cursor-pointer truncate text-left w-full flex items-center justify-between group"
                                    >
                                      <span className="truncate">{barrera.tag_activo}</span>
                                      <span className="text-[10px] text-sky-500 opacity-60 group-hover:opacity-100 transition-opacity">↗</span>
                                    </button>
                                  ) : (
                                    <span className="text-[11px] text-slate-400 italic px-1">—</span>
                                  )}
                                  {esAdmin && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        const nuevo = window.prompt(
                                          'Editar Tag del Activo / Salvaguarda:',
                                          barrera.tag_activo || ''
                                        )
                                        if (nuevo !== null) {
                                          actualizarEscenario(causaEsc.id, (act) => ({
                                            ...act,
                                            barreras: act.barreras.map((item, idx) =>
                                              idx === bIdx ? { ...item, tag_activo: nuevo.trim() } : item
                                            ),
                                          }))
                                        }
                                      }}
                                      title="Editar Tag del Activo"
                                      className="text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 opacity-50 hover:opacity-100 shrink-0"
                                    >
                                      ✎
                                    </button>
                                  )}
                                </div>
                              </td>

                              {/* FRR de Diseño */}
                              <td
                                onClick={() =>
                                  seleccionar(
                                    `bar-frrd-${causaEsc.id}-${bIdx}`,
                                    bIdx
                                  )
                                }
                                className={`border border-slate-300 dark:border-slate-700 p-1 text-center align-top transition-colors ${celdaActivaClass(
                                  `bar-frrd-${causaEsc.id}-${bIdx}`
                                )}`}
                              >
                                <input
                                  disabled={!esAdmin}
                                  type="number"
                                  min={1}
                                  step="any"
                                  value={barrera.frr_diseno}
                                  onChange={(e) =>
                                    actualizarEscenario(causaEsc.id, (act) => ({
                                      ...act,
                                      barreras: act.barreras.map((item, idx) =>
                                        idx === bIdx
                                          ? {
                                              ...item,
                                              frr_diseno: Math.max(
                                                1,
                                                Number(e.target.value) || 1
                                              ),
                                            }
                                          : item
                                      ),
                                    }))
                                  }
                                  className="w-full bg-transparent text-center font-mono text-slate-800 dark:text-slate-200 focus:outline-none focus:bg-white dark:focus:bg-slate-800"
                                />
                              </td>

                              {/* Estado Actual de la Barrera */}
                              <td
                                onClick={() =>
                                  seleccionar(
                                    `bar-est-${causaEsc.id}-${bIdx}`,
                                    bIdx
                                  )
                                }
                                className={`border border-slate-300 dark:border-slate-700 px-1.5 py-1 align-top w-[165px] min-w-[165px] transition-colors ${celdaActivaClass(
                                  `bar-est-${causaEsc.id}-${bIdx}`
                                )}`}
                              >
                                <div className="relative flex items-center justify-between">
                                  <select
                                    disabled={!esAdmin}
                                    value={barrera.estado_actual}
                                    onChange={(e) =>
                                      actualizarEscenario(causaEsc.id, (act) => ({
                                        ...act,
                                        barreras: act.barreras.map((item, idx) =>
                                          idx === bIdx
                                            ? {
                                                ...item,
                                                estado_actual: e.target.value,
                                              }
                                            : item
                                        ),
                                      }))
                                    }
                                    className={`w-full appearance-none bg-transparent pr-4 text-[11.5px] font-medium focus:outline-none cursor-pointer ${
                                      barrera.estado_actual === 'DISPONIBLE'
                                        ? 'text-emerald-800 dark:text-emerald-400'
                                        : barrera.estado_actual === 'DEGRADADO'
                                          ? 'text-amber-800 dark:text-amber-400 font-semibold'
                                          : 'text-rose-800 dark:text-rose-400 font-semibold'
                                    }`}
                                  >
                                    {ESTADOS.map((est) => (
                                      <option key={est} value={est} className="text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-900">
                                        {ESTADO_ETIQUETA[est]}
                                      </option>
                                    ))}
                                  </select>
                                  <span className="pointer-events-none absolute right-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                                    ▾
                                  </span>
                                </div>
                              </td>

                              {/* Factor de Degradación (1-100) si Estado == DEGRADADO */}
                              <td
                                onClick={() =>
                                  seleccionar(
                                    `bar-deg-${causaEsc.id}-${bIdx}`,
                                    bIdx
                                  )
                                }
                                className={`border border-slate-300 dark:border-slate-700 p-1 text-center align-top transition-colors ${celdaActivaClass(
                                  `bar-deg-${causaEsc.id}-${bIdx}`
                                )}`}
                              >
                                {barrera.estado_actual === 'DEGRADADO' ? (
                                  <input
                                    disabled={!esAdmin}
                                    type="number"
                                    min={1}
                                    max={100}
                                    value={barrera.factor_degradacion}
                                    onChange={(e) =>
                                      actualizarEscenario(
                                        causaEsc.id,
                                        (act) => ({
                                          ...act,
                                          barreras: act.barreras.map(
                                            (item, idx) =>
                                              idx === bIdx
                                                ? {
                                                    ...item,
                                                    factor_degradacion:
                                                      Math.max(
                                                        1,
                                                        Math.min(
                                                          100,
                                                          Number(
                                                            e.target.value
                                                          ) || 1
                                                        )
                                                      ),
                                                  }
                                                : item
                                          ),
                                        })
                                      )
                                    }
                                    className="w-full bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 rounded-xs text-center font-mono text-[11px] font-bold text-amber-900 dark:text-amber-200 focus:outline-none"
                                  />
                                ) : (
                                  <span className="text-slate-300 dark:text-slate-600">—</span>
                                )}
                              </td>

                              {/* FRR Actual Calculado */}
                              <td
                                onClick={() => seleccionar(`bar-frr-act-${causaEsc.id}-${bIdx}`, bIdx)}
                                className={`border border-slate-300 dark:border-slate-700 p-1 text-center align-top font-mono font-semibold text-slate-700 dark:text-slate-300 cursor-pointer transition-colors ${
                                  esDesviacionSeleccionada
                                    ? 'bg-sky-100/40 dark:bg-sky-900/30'
                                    : 'bg-slate-50/70 dark:bg-slate-800/50'
                                }`}
                              >
                                {calcFrrActual(
                                  barrera.frr_diseno,
                                  barrera.estado_actual,
                                  barrera.factor_degradacion
                                )}
                              </td>

                              {/* Factor de Escalamiento y Control del Factor de Escalamiento */}
                              <td
                                onClick={() =>
                                  seleccionar(
                                    `bar-fe-${causaEsc.id}-${bIdx}`,
                                    bIdx
                                  )
                                }
                                className={`border border-slate-300 dark:border-slate-700 p-1 align-top transition-colors ${celdaActivaClass(
                                  `bar-fe-${causaEsc.id}-${bIdx}`
                                )}`}
                              >
                                <input
                                  disabled={!esAdmin}
                                  placeholder="Factor escalamiento..."
                                  value={barrera.factor_escalamiento}
                                  onChange={(e) =>
                                    actualizarEscenario(causaEsc.id, (act) => ({
                                      ...act,
                                      barreras: act.barreras.map((item, idx) =>
                                        idx === bIdx
                                          ? {
                                              ...item,
                                              factor_escalamiento:
                                                e.target.value,
                                            }
                                          : item
                                      ),
                                    }))
                                  }
                                  className="w-full bg-transparent text-[11px] text-slate-800 dark:text-slate-200 placeholder:text-slate-300 dark:placeholder:text-slate-600 focus:outline-none focus:bg-white dark:focus:bg-slate-800"
                                />
                                <input
                                  disabled={!esAdmin}
                                  placeholder="Control factor esc..."
                                  value={barrera.control_escalamiento}
                                  onChange={(e) =>
                                    actualizarEscenario(causaEsc.id, (act) => ({
                                      ...act,
                                      barreras: act.barreras.map((item, idx) =>
                                        idx === bIdx
                                          ? {
                                              ...item,
                                              control_escalamiento:
                                                e.target.value,
                                            }
                                          : item
                                      ),
                                    }))
                                  }
                                  className="w-full bg-transparent text-[11px] text-teal-800 dark:text-teal-400 placeholder:text-slate-300 dark:placeholder:text-slate-600 border-t border-dotted border-slate-200 dark:border-slate-700 mt-0.5 pt-0.5 focus:outline-none focus:bg-white dark:focus:bg-slate-800"
                                />
                              </td>
                            </>
                          ) : (
                            <td
                              colSpan={8}
                              onClick={() =>
                                seleccionar(`bar-empty-${causaEsc.id}`, null)
                              }
                              className={`border border-slate-300 dark:border-slate-700 p-2 text-center italic text-slate-400 dark:text-slate-500 ${
                                esDesviacionSeleccionada
                                  ? 'bg-sky-50/30 dark:bg-sky-950/20'
                                  : ''
                              } ${celdaActivaClass(
                                `bar-empty-${causaEsc.id}`
                              )}`}
                            >
                              Sin salvaguardas registradas — selecciona esta fila y usa "+ Salvaguarda" en la barra superior
                            </td>
                          )}

                          {/* 5. IMPACTOS (S: E, P, A, R 1-5) — rowSpan por Consecuencia */}
                          {esPrimeraFilaConsecuencia && (
                            <>
                              {(
                                [
                                  ['imp_economico', grupoCons.imp_economico],
                                  ['imp_personas', grupoCons.imp_personas],
                                  ['imp_ambiente', grupoCons.imp_ambiente],
                                  ['imp_reputacion', grupoCons.imp_reputacion],
                                ] as const
                              ).map(([campo, valor]) => (
                                <td
                                  key={campo}
                                  rowSpan={grupoCons.filasConsecuencia}
                                  onClick={() =>
                                    seleccionar(
                                      `${campo}-${grupoCons.consecuenciaKey}`,
                                      null
                                    )
                                  }
                                  className={`border border-slate-300 dark:border-slate-700 px-1.5 py-1 text-center align-top w-[60px] min-w-[60px] transition-colors ${
                                    esDesviacionSeleccionada ? 'bg-sky-50/40 dark:bg-sky-950/25' : ''
                                  } ${celdaActivaClass(
                                    `${campo}-${grupoCons.consecuenciaKey}`
                                  )}`}
                                >
                                  <div className="relative flex items-center justify-between">
                                    <select
                                      disabled={!esAdmin}
                                      value={valor}
                                      onChange={(e) =>
                                        actualizarGrupoConsecuencia(
                                          grupoCons.causas,
                                          (act) => ({
                                            ...act,
                                            [campo]: Number(e.target.value),
                                          })
                                        )
                                      }
                                      className="w-full appearance-none bg-transparent pr-3.5 text-center font-bold text-slate-800 dark:text-slate-200 focus:outline-none cursor-pointer"
                                    >
                                      {[1, 2, 3, 4, 5].map((n) => (
                                        <option key={n} value={n} className="text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-900">
                                          {n}
                                        </option>
                                      ))}
                                    </select>
                                    <span className="pointer-events-none absolute right-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                                      ▾
                                    </span>
                                  </div>
                                </td>
                              ))}
                            </>
                          )}

                          {/* 6. FRECUENCIA ACTUAL, RIESGO DISEÑO Y RIESGO ACTUAL POR IMPACTO (rowSpan por Causa) */}
                          {esPrimeraFilaCausa && (
                            <>
                              {/* Frecuencia de ocurrencia actual calculada (Cuantitativa con Letra Debajo) */}
                              <td
                                rowSpan={causaEsc.filasBarrera}
                                onClick={() => seleccionar(`frec-act-${causaEsc.id}`, null)}
                                title={`Frecuencia actual calculada: ${calc.frecuencia_actual_display}/año (Categoría ${calc.frecuencia_actual})`}
                                className={`border border-slate-300 dark:border-slate-700 px-1 py-1 text-center align-top cursor-pointer transition-colors ${
                                  esFilaEnfocada
                                    ? 'bg-amber-200/80 dark:bg-amber-900/60'
                                    : esDesviacionSeleccionada
                                      ? 'bg-sky-100/60 dark:bg-sky-900/40'
                                      : 'bg-slate-50 dark:bg-slate-800'
                                }`}
                              >
                                <div className="flex flex-col items-center justify-center leading-tight py-0.5">
                                  <span className="font-mono font-bold text-xs text-slate-900 dark:text-slate-100">
                                    {calc.frecuencia_actual_display}
                                  </span>
                                  <span className="text-[10px] font-extrabold text-[#1e4e79] dark:text-sky-400 uppercase tracking-wider">
                                    ({calc.frecuencia_actual})
                                  </span>
                                </div>
                              </td>

                              {/* Riesgo de Diseño global */}
                              <td
                                rowSpan={causaEsc.filasBarrera}
                                onClick={() => seleccionar(`riesgo-dis-${causaEsc.id}`, null)}
                                className={`border border-slate-300 dark:border-slate-700 p-1 text-center align-top text-[11px] cursor-pointer ${colorCeldaRiesgo(
                                  calc.riesgo_diseno_global
                                )}`}
                              >
                                {codigoRiesgo(calc.riesgo_diseno_global)}
                              </td>

                              {/* Riesgo Actual por cada tipo de impacto (E, P, A, R) estilo columna RR */}
                              {(
                                [
                                  ['economico', calc.riesgo_actual_imp.economico],
                                  ['personas', calc.riesgo_actual_imp.personas],
                                  ['ambiente', calc.riesgo_actual_imp.ambiente],
                                  ['reputacion', calc.riesgo_actual_imp.reputacion],
                                ] as const
                              ).map(([k, niv]) => (
                                <td
                                  key={k}
                                  rowSpan={causaEsc.filasBarrera}
                                  onClick={() => seleccionar(`riesgo-act-${k}-${causaEsc.id}`, null)}
                                  title={`Riesgo Actual (${k}): ${niv}`}
                                  className={`border border-slate-300 dark:border-slate-700 p-1 text-center align-top text-[11px] cursor-pointer ${colorCeldaRiesgo(
                                    niv
                                  )}`}
                                >
                                  {niv[0]}
                                </td>
                              ))}

                              {/* 7. RECOMENDACIONES PHA (rowSpan por Causa) - Solo lectura, clic navega a Recomendaciones */}
                              <td
                                id={`recomendacion-${causaEsc.id}`}
                                rowSpan={causaEsc.filasBarrera}
                                onClick={() =>
                                  navigate(`/recomendaciones?escenario_id=${causaEsc.id}`)
                                }
                                title="Clic para ver y editar en la pestaña Recomendaciones ↗"
                                className={`border border-slate-300 dark:border-slate-700 p-2 align-top w-[260px] min-w-[240px] cursor-pointer group transition-all duration-200 hover:bg-blue-50/80 dark:hover:bg-blue-950/40 hover:shadow-xs ${
                                  escenarioEnfocado === causaEsc.id
                                    ? 'bg-amber-50 dark:bg-amber-950/40 ring-2 ring-amber-500 shadow-md'
                                    : esDesviacionSeleccionada
                                      ? 'bg-sky-50/50 dark:bg-sky-950/30'
                                      : 'bg-slate-50/30 dark:bg-slate-900/30'
                                }`}
                              >
                                <div className="flex flex-col h-full gap-1">
                                  {escenarioEnfocado === causaEsc.id && (
                                    <div className="flex items-center justify-between text-[10px] font-bold text-amber-800 dark:text-amber-300 bg-amber-200/90 dark:bg-amber-900/60 px-1.5 py-0.5 rounded animate-pulse mb-1">
                                      <span>★ Escenario Crítico</span>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          setEscenarioEnfocado(null)
                                        }}
                                        className="text-amber-900 dark:text-amber-200 hover:text-black dark:hover:text-white ml-1 text-xs font-bold"
                                        title="Cerrar foco"
                                      >
                                        ✕
                                      </button>
                                    </div>
                                  )}
                                  <p className="text-[11.5px] leading-relaxed text-slate-800 dark:text-slate-200 select-text">
                                    {causaEsc.recomendacion?.trim() || (
                                      <span className="italic text-slate-400 dark:text-slate-500">
                                        Sin recomendación registrada...
                                      </span>
                                    )}
                                  </p>
                                </div>
                              </td>
                            </>
                          )}

                          {/* 8. GESTIÓN DE RIESGOS (rowSpan por Desviación/Escenario) - 1 solo botón fusionado por escenario */}
                          {esPrimeraFilaDesviacion && (
                            <td
                              rowSpan={grupoDesv.filasDesviacion}
                              className={`border border-slate-300 dark:border-slate-700 p-2 text-center align-middle w-[125px] min-w-[115px] transition-colors ${
                                esDesviacionSeleccionada
                                  ? 'bg-sky-50/60 dark:bg-sky-950/35'
                                  : 'bg-white dark:bg-slate-900'
                              }`}
                            >
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  navigate(`/gestion-riesgos?escenario_id=${encodeURIComponent(grupoDesv.numDesv)}`)
                                }}
                                title={`Ir a Gestión de Riesgos para el Escenario ${grupoDesv.numDesv} (${grupoDesv.nodo} - ${grupoDesv.palabra_guia})`}
                                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold rounded-md bg-[#1e4e79] hover:bg-[#163a5c] text-white dark:bg-sky-600 dark:hover:bg-sky-500 shadow-2xs transition-all cursor-pointer group"
                              >
                                <span>Ver GIDR</span>
                                <span className="text-[10px] opacity-75 group-hover:translate-x-0.5 transition-transform">→</span>
                              </button>
                            </td>
                          )}
                        </tr>
                      )
                    })
                  })
                )
              })}

              {jerarquia.length === 0 && (
                <tr>
                  <td
                    colSpan={24}
                    className="p-8 text-center text-slate-400 text-sm"
                  >
                    No se encontraron escenarios PHA para los filtros seleccionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: nueva desviación con selección de nodo */}
      {modalDesv && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md space-y-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Nueva desviación</h3>
              <button
                type="button"
                onClick={() => setModalDesv(false)}
                className="font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                ✕
              </button>
            </div>
            <div className="space-y-3 text-xs">
              <div>
                <label className="mb-1 block font-medium text-slate-600 dark:text-slate-400">Nodo asociado</label>
                <select
                  className="w-full rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-2 py-1.5 text-xs focus:outline-none focus:border-[#1e4e79]"
                  value={nodoNuevoId}
                  onChange={(e) =>
                    setNodoNuevoId(e.target.value ? Number(e.target.value) : '')
                  }
                >
                  {nodosQ.data?.items.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.nombre}
                      {nombreUnidad(n.unidad_id) ? ` — ${nombreUnidad(n.unidad_id)}` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block font-medium text-slate-600 dark:text-slate-400">
                  Desviación (palabra guía)
                </label>
                <input
                  className="w-full rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-2 py-1.5 text-xs focus:outline-none focus:border-[#1e4e79]"
                  placeholder="Ej. Más temperatura"
                  value={nombreDesvNueva}
                  onChange={(e) => setNombreDesvNueva(e.target.value)}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setModalDesv(false)}
                className="rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={nodoNuevoId === '' || crearEscenarioMut.isPending}
                onClick={confirmarNuevaDesviacion}
                className="rounded bg-[#1e4e79] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#163a5c] disabled:opacity-50"
              >
                Crear desviación
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
