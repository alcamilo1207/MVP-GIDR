import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import type { Escenario, Pagina, Unidad } from '../lib/types'
import { ESTADOS, ESTADO_ETIQUETA } from '../lib/format'

const FRECUENCIAS = ['A', 'B', 'C', 'D', 'E'] as const

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
  consecuencia: string
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
    consecuencia: e.consecuencia,
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

  const idxPrevAct = reducirIndice(idxBase, prodPrevActual)
  const frecActualCausa = ORDEN_FREC[idxPrevAct]
  const idxActFinal = reducirIndice(idxPrevAct, prodMitActual)

  const severidadMax = Math.max(
    d.imp_economico,
    d.imp_personas,
    d.imp_ambiente,
    d.imp_reputacion
  )

  return {
    frecuencia_actual: frecActualCausa,
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
  const { usuario } = useAuth()
  const esAdmin = usuario?.rol === 'admin'
  const qc = useQueryClient()

  const [unidadId, setUnidadId] = useState<number | undefined>()
  const [q, setQ] = useState('')
  const [mostrarEsquema, setMostrarEsquema] = useState(false)
  const [borradores, setBorradores] = useState<Record<number, EscenarioEditable>>({})
  const [guardandoIds, setGuardandoIds] = useState<Record<number, boolean>>({})
  const [mensajeGuardado, setMensajeGuardado] = useState<string | null>(null)
  const [seleccion, setSeleccion] = useState<SeleccionCelda | null>(null)

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
                `${ca.numCausa} ${ca.causa}`, ca.frecuencia_diseno,
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
      ? 'ring-2 ring-inset ring-[#1e4e79] bg-[#eef5fc]'
      : 'hover:bg-slate-50/80'

  return (
    <div className="space-y-2">
      {/* Cabecera compacta */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold text-slate-900 tracking-tight">
            Escenarios PHA — Hoja de Trabajo (HAZOP / LOPA Worksheet)
          </h1>
          <p className="text-xs text-slate-500">
            Haz clic sobre cualquier celda para editar directamente. Una desviación puede agrupar múltiples consecuencias, causas y salvaguardas.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMostrarEsquema((v) => !v)}
            className="px-2.5 py-1 text-xs font-medium rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
          >
            {mostrarEsquema ? 'Ocultar fórmulas' : '∑ Fórmulas de cálculo'}
          </button>
          {seleccionActiva && (
            <Link
              to={`/bowtie/${seleccionActiva.escenarioId}`}
              className="px-2.5 py-1 text-xs font-medium rounded border border-sky-300 bg-sky-50 text-sky-800 hover:bg-sky-100"
            >
              Ver en BowTie (#{seleccionActiva.escenarioId}) →
            </Link>
          )}
        </div>
      </div>

      {/* Panel desplegable de fórmulas */}
      {mostrarEsquema && (
        <div className="bg-slate-50 border border-slate-300 rounded p-3 text-xs text-slate-700 grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <div className="font-semibold text-slate-900">1. FRR Actual de Barrera</div>
            <div className="text-[11px] text-slate-600 mt-0.5">
              Disponible: <code>FRR_d</code> | Degradado (<code>D = 1..100%</code>):{' '}
              <code>max(1, FRR_d × (100 - D)/100)</code> | Mant./Fuera serv./Inexist.:{' '}
              <code>1.0</code>
            </div>
          </div>
          <div>
            <div className="font-semibold text-slate-900">2. Frecuencia Actual (F_a)</div>
            <div className="text-[11px] text-slate-600 mt-0.5">
              <code>idx(F_a) = max(0, idx(F_d) - ⌊log10(∏ FRR_act_prev × ∏ FRR_act_temp)⌋)</code>
            </div>
          </div>
          <div>
            <div className="font-semibold text-slate-900">3. Riesgo de Diseño (RD)</div>
            <div className="text-[11px] text-slate-600 mt-0.5">
              Matriz 5×5 evaluada con <code>F_d</code> reducida por barreras preventivas y reactivas de diseño.
            </div>
          </div>
          <div>
            <div className="font-semibold text-slate-900">4. Riesgo Actual por Impacto (E, P, A, R)</div>
            <div className="text-[11px] text-slate-600 mt-0.5">
              Matriz 5×5 evaluada con <code>F_a</code> reducida por barreras reactivas actuales para cada severidad <code>1–5</code>.
            </div>
          </div>
        </div>
      )}

      {mensajeGuardado && (
        <div className="bg-emerald-50 border border-emerald-300 text-emerald-900 px-3 py-1.5 rounded text-xs font-medium flex items-center justify-between">
          <span>✓ {mensajeGuardado}</span>
          <button
            type="button"
            onClick={() => setMensajeGuardado(null)}
            className="text-emerald-700 hover:text-emerald-950 font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Contenedor principal estilo PHA-Pro Worksheet */}
      <div className="border border-slate-400 bg-white shadow-sm rounded-sm overflow-hidden">
        {/* Barra de herramientas superior tipo PHA-Pro (como en la imagen) */}
        <div className="bg-white border-b border-slate-300 px-2.5 py-1.5 flex flex-wrap items-center justify-between gap-2 text-xs">
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
                <span className="mx-1.5 h-4 w-px bg-slate-300" />
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
                <span className="mx-1.5 h-4 w-px bg-slate-300" />

                {/* Menú de elementos adicionales (consecuencia, causa, salvaguardas) */}
                <div className="relative">
                  <IconBtn
                    titulo="Agregar consecuencia, causa o salvaguarda"
                    onClick={() => setMenuMas((v) => !v)}
                    disabled={!seleccionActiva}
                    path="M5 12h.01M12 12h.01M19 12h.01"
                  />
                  {menuMas && seleccionActiva && (
                    <div className="absolute left-0 top-full z-30 mt-1 w-52 rounded-md border border-slate-200 bg-white py-1 shadow-lg">
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
                          className="block w-full px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-100"
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
                      : 'bg-slate-100 text-slate-400 border border-slate-200'
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
              <span className="text-slate-600 font-medium px-2">
                Modo solo lectura (inicia sesión como Admin para editar celdas)
              </span>
            )}
          </div>

          {/* Buscador y filtro de unidad a la derecha (como Search Worksheet...) */}
          <div className="flex items-center gap-2">
            <select
              className="bg-white border border-slate-300 rounded-sm px-2 py-1 text-xs text-slate-700 focus:outline-none focus:border-[#1e4e79]"
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
              className="bg-white border border-slate-300 rounded-sm px-2.5 py-1 text-xs text-slate-800 w-52 focus:outline-none focus:border-[#1e4e79]"
              placeholder="Search Worksheet..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </div>

        {/* Tabla estilo hoja de cálculo PHA-Pro con celdas combinadas (rowSpan) */}
        <div className="overflow-x-auto max-h-[calc(100vh-205px)]">
          <table className="w-full min-w-[1680px] border-collapse text-[12px] leading-snug text-slate-800 select-none">
            <thead className="sticky top-0 z-20 bg-[#f1f3f6] text-slate-800 font-bold">
              {/* Nivel 1 de Cabecera */}
              <tr>
                <th
                  rowSpan={3}
                  className="border border-slate-300 px-2.5 py-1.5 text-center w-[165px] min-w-[155px] bg-[#ebedf0]"
                >
                  Desviación /
                  <br />
                  <span className="font-normal text-[11px] text-slate-600">
                    Peligro Asociado
                  </span>
                </th>
                <th
                  colSpan={19}
                  className="border border-slate-300 px-2 py-1 text-center bg-[#e4e7ec] tracking-wide"
                >
                  Consecuencias
                </th>
              </tr>

              {/* Nivel 2 de Cabecera */}
              <tr>
                <th
                  rowSpan={2}
                  className="border border-slate-300 px-2.5 py-1.5 text-center w-[210px] min-w-[190px] bg-[#ebedf0]"
                >
                  Consecuencia
                </th>
                <th
                  colSpan={10}
                  className="border border-slate-300 px-2 py-1 text-center bg-[#ebedf0]"
                >
                  Causas
                </th>
                <th
                  colSpan={4}
                  title="Severidad / Impactos: Económico (E), Personas (P), Ambiental (A), Reputación (R) [1-5]"
                  className="border border-slate-300 px-1 py-1 text-center bg-[#ebedf0]"
                >
                  Impactos (S)
                </th>
                <th
                  rowSpan={2}
                  title="Frecuencia de ocurrencia actual calculada por causa"
                  className="border border-slate-300 px-1.5 py-1 text-center w-[52px] min-w-[52px] bg-[#ebedf0]"
                >
                  F<sub>act</sub>
                </th>
                <th
                  rowSpan={2}
                  title="Riesgo de Diseño calculado"
                  className="border border-slate-300 px-1.5 py-1 text-center w-[68px] min-w-[68px] bg-[#ebedf0]"
                >
                  Riesgo
                  <br />
                  Diseño
                </th>
                <th
                  colSpan={4}
                  title="Riesgo Actual calculado para cada dimensión de impacto (Económico, Personas, Ambiental, Reputación)"
                  className="border border-slate-300 px-1 py-1 text-center bg-[#ebedf0]"
                >
                  Riesgo Actual (RR)
                </th>
              </tr>

              {/* Nivel 3 de Cabecera */}
              <tr className="text-[11px]">
                <th className="border border-slate-300 px-2 py-1 text-center w-[180px] min-w-[165px] bg-[#f5f6f8]">
                  Causa
                </th>
                <th
                  title="Frecuencia de ocurrencia de diseño (A-E)"
                  className="border border-slate-300 px-1.5 py-1 text-center w-[68px] min-w-[68px] bg-[#f5f6f8]"
                >
                  F<sub>dis</sub>
                </th>
                <th className="border border-slate-300 px-2 py-1 text-center w-[210px] min-w-[185px] bg-[#f5f6f8]">
                  Salvaguarda / Barrera
                </th>
                <th className="border border-slate-300 px-2 py-1 text-center w-[125px] min-w-[125px] bg-[#f5f6f8]">
                  Tipo
                </th>
                <th className="border border-slate-300 px-1.5 py-1 text-center w-[100px] min-w-[95px] bg-[#f5f6f8]">
                  Tag
                </th>
                <th
                  title="Factor de Reducción de Riesgo (FRR) de diseño"
                  className="border border-slate-300 px-1.5 py-1 text-center w-[64px] min-w-[64px] bg-[#f5f6f8]"
                >
                  FRR<sub>d</sub>
                </th>
                <th className="border border-slate-300 px-2 py-1 text-center w-[165px] min-w-[165px] bg-[#f5f6f8]">
                  Estado Actual
                </th>
                <th
                  title="Factor de degradación (1-100%) cuando la barrera está Degradada"
                  className="border border-slate-300 px-1.5 py-1 text-center w-[64px] min-w-[64px] bg-[#f5f6f8]"
                >
                  Degr.%
                </th>
                <th
                  title="FRR actual calculado a partir del estado de la barrera"
                  className="border border-slate-300 px-1.5 py-1 text-center w-[60px] min-w-[60px] bg-[#f5f6f8]"
                >
                  FRR<sub>a</sub>
                </th>
                <th className="border border-slate-300 px-2 py-1 text-center w-[195px] min-w-[175px] bg-[#f5f6f8]">
                  Factor Escalamiento / Control
                </th>
                {/* Impactos 1-5 */}
                <th
                  title="Impacto Económico (1-5)"
                  className="border border-slate-300 px-1.5 py-1 text-center w-[60px] min-w-[60px] bg-[#f5f6f8]"
                >
                  E
                </th>
                <th
                  title="Impacto en Personas (1-5)"
                  className="border border-slate-300 px-1.5 py-1 text-center w-[60px] min-w-[60px] bg-[#f5f6f8]"
                >
                  P
                </th>
                <th
                  title="Impacto Ambiental (1-5)"
                  className="border border-slate-300 px-1.5 py-1 text-center w-[60px] min-w-[60px] bg-[#f5f6f8]"
                >
                  A
                </th>
                <th
                  title="Impacto en Reputación (1-5)"
                  className="border border-slate-300 px-1.5 py-1 text-center w-[60px] min-w-[60px] bg-[#f5f6f8]"
                >
                  R
                </th>
                {/* Riesgo Actual por Impacto */}
                <th
                  title="Riesgo Actual Económico"
                  className="border border-slate-300 px-1 py-1 text-center w-[46px] min-w-[46px] bg-[#f5f6f8]"
                >
                  E
                </th>
                <th
                  title="Riesgo Actual Personas"
                  className="border border-slate-300 px-1 py-1 text-center w-[46px] min-w-[46px] bg-[#f5f6f8]"
                >
                  P
                </th>
                <th
                  title="Riesgo Actual Ambiental"
                  className="border border-slate-300 px-1 py-1 text-center w-[46px] min-w-[46px] bg-[#f5f6f8]"
                >
                  A
                </th>
                <th
                  title="Riesgo Actual Reputación"
                  className="border border-slate-300 px-1 py-1 text-center w-[46px] min-w-[46px] bg-[#f5f6f8]"
                >
                  R
                </th>
              </tr>
            </thead>

            <tbody>
              {jerarquia.flatMap((grupoDesv) =>
                grupoDesv.consecuencias.flatMap((grupoCons, consIdx) =>
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

                      return (
                        <tr
                          key={`${causaEsc.id}-b-${bIdx}`}
                          className="align-top bg-white"
                        >
                          {/* 1. DESVIACIÓN Y PELIGRO ASOCIADO (rowSpan por toda la Desviación) */}
                          {esPrimeraFilaDesviacion && (
                            <td
                              rowSpan={grupoDesv.filasDesviacion}
                              onClick={() =>
                                seleccionar(`desv-${grupoDesv.desviacionKey}`, null)
                              }
                              className={`border border-slate-300 p-1.5 align-top transition-colors ${celdaActivaClass(
                                `desv-${grupoDesv.desviacionKey}`
                              )}`}
                            >
                              <div className="flex items-baseline gap-1 font-semibold text-slate-900">
                                <span className="text-slate-500 shrink-0">
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
                                  className="w-full bg-transparent font-semibold text-slate-900 focus:outline-none focus:bg-white px-0.5 rounded-xs"
                                />
                              </div>

                              <div className="mt-2 pt-1.5 border-t border-dashed border-slate-200">
                                <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-800">
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
                                  className="w-full bg-transparent text-[11px] text-slate-700 resize-none focus:outline-none focus:bg-white mt-0.5"
                                />
                              </div>

                              <div className="mt-1 text-[10px] text-slate-400 truncate">
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
                              className={`border border-slate-300 p-1.5 align-top transition-colors ${celdaActivaClass(
                                `cons-${grupoCons.consecuenciaKey}`
                              )}`}
                            >
                              <div className="flex items-start gap-1">
                                <span className="text-slate-500 font-medium shrink-0">
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
                                  className="w-full bg-transparent text-slate-800 resize-none focus:outline-none focus:bg-white"
                                />
                              </div>
                            </td>
                          )}

                          {/* 3. CAUSA Y FRECUENCIA DE DISEÑO (rowSpan por cada Causa) */}
                          {esPrimeraFilaCausa && (
                            <>
                              <td
                                rowSpan={causaEsc.filasBarrera}
                                onClick={() =>
                                  seleccionar(`causa-${causaEsc.id}`, null)
                                }
                                className={`border border-slate-300 p-1.5 align-top transition-colors ${celdaActivaClass(
                                  `causa-${causaEsc.id}`
                                )}`}
                              >
                                <div className="flex items-start gap-1">
                                  <span className="text-slate-500 font-medium shrink-0">
                                    {causaEsc.numCausa}
                                  </span>
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
                                    className="w-full bg-transparent text-slate-800 resize-none focus:outline-none focus:bg-white"
                                  />
                                </div>
                              </td>

                              {/* Frecuencia de Diseño (A-E) */}
                              <td
                                rowSpan={causaEsc.filasBarrera}
                                onClick={() =>
                                  seleccionar(`fdis-${causaEsc.id}`, null)
                                }
                                className={`border border-slate-300 px-1.5 py-1 text-center align-top w-[68px] min-w-[68px] transition-colors ${celdaActivaClass(
                                  `fdis-${causaEsc.id}`
                                )}`}
                              >
                                <div className="relative flex items-center justify-between">
                                  <select
                                    disabled={!esAdmin}
                                    value={causaEsc.frecuencia_diseno}
                                    onChange={(e) =>
                                      actualizarEscenario(causaEsc.id, (act) => ({
                                        ...act,
                                        frecuencia_diseno: e.target.value,
                                      }))
                                    }
                                    className="w-full appearance-none bg-transparent pr-3.5 text-center font-bold text-slate-800 focus:outline-none cursor-pointer"
                                  >
                                    {FRECUENCIAS.map((f) => (
                                      <option key={f} value={f}>
                                        {f}
                                      </option>
                                    ))}
                                  </select>
                                  <span className="pointer-events-none absolute right-0.5 text-[10px] text-slate-500">
                                    ▾
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
                                className={`border border-slate-300 p-1.5 align-top transition-colors ${celdaActivaClass(
                                  `bar-desc-${causaEsc.id}-${bIdx}`
                                )}`}
                              >
                                <div className="flex items-start gap-1">
                                  <span className="text-slate-500 font-medium shrink-0">
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
                                    className="w-full bg-transparent text-slate-800 resize-none focus:outline-none focus:bg-white"
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
                                className={`border border-slate-300 px-1.5 py-1 align-top w-[125px] min-w-[125px] transition-colors ${
                                  seleccionActiva?.celdaId ===
                                  `bar-rol-${causaEsc.id}-${bIdx}`
                                    ? 'bg-[#1e4e79] text-white'
                                    : 'hover:bg-slate-50'
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
                                    className="w-full appearance-none bg-transparent pr-4 text-[11.5px] font-medium focus:outline-none cursor-pointer"
                                  >
                                    <option className="text-slate-900" value="PREVENTIVA">
                                      Preventiva
                                    </option>
                                    <option className="text-slate-900" value="REACTIVA">
                                      Reactiva
                                    </option>
                                    <option className="text-slate-900" value="TEMPORAL">
                                      Temporal
                                    </option>
                                  </select>
                                  <span className="pointer-events-none absolute right-0.5 text-[10px] opacity-70">
                                    ▾
                                  </span>
                                </div>
                              </td>

                              {/* Tag del activo */}
                              <td
                                onClick={() =>
                                  seleccionar(
                                    `bar-tag-${causaEsc.id}-${bIdx}`,
                                    bIdx
                                  )
                                }
                                className={`border border-slate-300 p-1 align-top transition-colors ${celdaActivaClass(
                                  `bar-tag-${causaEsc.id}-${bIdx}`
                                )}`}
                              >
                                <input
                                  disabled={!esAdmin}
                                  value={barrera.tag_activo}
                                  onChange={(e) =>
                                    actualizarEscenario(causaEsc.id, (act) => ({
                                      ...act,
                                      barreras: act.barreras.map((item, idx) =>
                                        idx === bIdx
                                          ? {
                                              ...item,
                                              tag_activo: e.target.value,
                                            }
                                          : item
                                      ),
                                    }))
                                  }
                                  className="w-full bg-transparent font-mono text-[11px] text-slate-700 focus:outline-none focus:bg-white"
                                />
                              </td>

                              {/* FRR de Diseño */}
                              <td
                                onClick={() =>
                                  seleccionar(
                                    `bar-frrd-${causaEsc.id}-${bIdx}`,
                                    bIdx
                                  )
                                }
                                className={`border border-slate-300 p-1 text-center align-top transition-colors ${celdaActivaClass(
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
                                  className="w-full bg-transparent text-center font-mono text-slate-800 focus:outline-none focus:bg-white"
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
                                className={`border border-slate-300 px-1.5 py-1 align-top w-[165px] min-w-[165px] transition-colors ${celdaActivaClass(
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
                                        ? 'text-emerald-800'
                                        : barrera.estado_actual === 'DEGRADADO'
                                          ? 'text-amber-800 font-semibold'
                                          : 'text-rose-800 font-semibold'
                                    }`}
                                  >
                                    {ESTADOS.map((est) => (
                                      <option key={est} value={est}>
                                        {ESTADO_ETIQUETA[est]}
                                      </option>
                                    ))}
                                  </select>
                                  <span className="pointer-events-none absolute right-0.5 text-[10px] text-slate-500">
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
                                className={`border border-slate-300 p-1 text-center align-top transition-colors ${celdaActivaClass(
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
                                    className="w-full bg-amber-50 border border-amber-300 rounded-xs text-center font-mono text-[11px] font-bold text-amber-900 focus:outline-none"
                                  />
                                ) : (
                                  <span className="text-slate-300">—</span>
                                )}
                              </td>

                              {/* FRR Actual Calculado */}
                              <td className="border border-slate-300 p-1 text-center align-top bg-slate-50/70 font-mono font-semibold text-slate-700">
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
                                className={`border border-slate-300 p-1 align-top transition-colors ${celdaActivaClass(
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
                                  className="w-full bg-transparent text-[11px] text-slate-800 placeholder:text-slate-300 focus:outline-none focus:bg-white"
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
                                  className="w-full bg-transparent text-[11px] text-teal-800 placeholder:text-slate-300 border-t border-dotted border-slate-200 mt-0.5 pt-0.5 focus:outline-none focus:bg-white"
                                />
                              </td>
                            </>
                          ) : (
                            <td
                              colSpan={8}
                              onClick={() =>
                                seleccionar(`bar-empty-${causaEsc.id}`, null)
                              }
                              className={`border border-slate-300 p-2 text-center italic text-slate-400 ${celdaActivaClass(
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
                                  className={`border border-slate-300 px-1.5 py-1 text-center align-top w-[60px] min-w-[60px] transition-colors ${celdaActivaClass(
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
                                      className="w-full appearance-none bg-transparent pr-3.5 text-center font-bold text-slate-800 focus:outline-none cursor-pointer"
                                    >
                                      {[1, 2, 3, 4, 5].map((n) => (
                                        <option key={n} value={n}>
                                          {n}
                                        </option>
                                      ))}
                                    </select>
                                    <span className="pointer-events-none absolute right-0.5 text-[10px] text-slate-500">
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
                              {/* Frecuencia de ocurrencia actual calculada */}
                              <td
                                rowSpan={causaEsc.filasBarrera}
                                className="border border-slate-300 p-1 text-center align-top bg-slate-50 font-mono font-bold text-slate-900"
                              >
                                {calc.frecuencia_actual}
                              </td>

                              {/* Riesgo de Diseño global */}
                              <td
                                rowSpan={causaEsc.filasBarrera}
                                className={`border border-slate-300 p-1 text-center align-top text-[11px] ${colorCeldaRiesgo(
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
                                  title={`Riesgo Actual (${k}): ${niv}`}
                                  className={`border border-slate-300 p-1 text-center align-top text-[11px] ${colorCeldaRiesgo(
                                    niv
                                  )}`}
                                >
                                  {niv[0]}
                                </td>
                              ))}
                            </>
                          )}
                        </tr>
                      )
                    })
                  })
                )
              )}

              {jerarquia.length === 0 && (
                <tr>
                  <td
                    colSpan={20}
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
          <div className="w-full max-w-md space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <h3 className="text-sm font-bold text-slate-900">Nueva desviación</h3>
              <button
                type="button"
                onClick={() => setModalDesv(false)}
                className="font-bold text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>
            <div className="space-y-3 text-xs">
              <div>
                <label className="mb-1 block font-medium text-slate-600">Nodo asociado</label>
                <select
                  className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs"
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
                <label className="mb-1 block font-medium text-slate-600">
                  Desviación (palabra guía)
                </label>
                <input
                  className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs"
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
                className="rounded border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
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
