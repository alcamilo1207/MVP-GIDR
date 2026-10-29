import React, { useCallback, useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ReactFlow,
  Background,
  Controls,
  MarkerType,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
  addEdge,
  type Connection,
  type Edge,
  type Node,
} from '@xyflow/react'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import type { BowTie, Estado } from '../lib/types'
import { ESTADOS, ESTADO_CLASES, ESTADO_ETIQUETA, NIVEL_CLASES, fmtBrecha, fmtFrr } from '../lib/format'

// ==========================================
// 1. COMPONENTES VISUALES PARA LOS 8 BLOQUES
// ==========================================

// Bloque 1: Peligro (Hazard) - Rayas de advertencia amarillas y negras
const HazardNode = ({ data }: { data: { label: string; onEdit?: () => void } }) => (
  <div
    onClick={data.onEdit}
    className="w-56 cursor-pointer shadow-lg rounded-md overflow-hidden border-2 border-amber-500 bg-white dark:bg-slate-900 group transition-transform hover:scale-105"
  >
    <div className="h-4 bg-[repeating-linear-gradient(45deg,#eab308,#eab308_10px,#000_10px,#000_20px)] border-b border-amber-600" />
    <div className="p-3 text-center">
      <div className="text-[10px] uppercase font-black tracking-widest text-amber-700 dark:text-amber-400">
        Peligro (Hazard)
      </div>
      <div className="font-bold text-xs text-slate-800 dark:text-slate-100 mt-1 line-clamp-3">
        {data.label}
      </div>
    </div>
    <div className="h-2 bg-[repeating-linear-gradient(45deg,#eab308,#eab308_10px,#000_10px,#000_20px)] border-t border-amber-600" />
    <Handle type="source" position={Position.Bottom} className="w-2.5 h-2.5 !bg-amber-500" />
  </div>
)

// Bloque 2: Evento Tope (Top Event) - Centro circular rojo / foco de pérdida de contención
const TopEventNode = ({
  data,
}: {
  data: { label: string; riesgoActual: string; brecha: number; onEdit?: () => void }
}) => (
  <div
    onClick={data.onEdit}
    className="w-64 p-4 cursor-pointer shadow-2xl rounded-2xl bg-gradient-to-br from-red-600 to-rose-900 text-white border-4 border-amber-400 text-center ring-4 ring-red-500/30 group transition-transform hover:scale-105"
  >
    <Handle type="target" position={Position.Top} className="w-3 h-3 !bg-amber-300" id="top" />
    <Handle type="target" position={Position.Left} className="w-3 h-3 !bg-amber-300" id="left" />
    <div className="text-[10px] uppercase font-black tracking-widest text-amber-300">
      Evento Tope (Top Event)
    </div>
    <div className="font-extrabold text-sm mt-1 leading-snug">{data.label}</div>
    <div className="mt-3 flex items-center justify-center gap-2">
      <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-900/80 border border-amber-400/40 font-bold">
        Riesgo: {data.riesgoActual}
      </span>
      {data.brecha > 0 && (
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-400 text-slate-950 font-black animate-pulse">
          Brecha +{data.brecha}
        </span>
      )}
    </div>
    <Handle type="source" position={Position.Right} className="w-3 h-3 !bg-amber-300" id="right" />
  </div>
)

// Bloque 3: Amenaza (Threat / Causa Raíz) - Tarjeta azul izquierda
const ThreatNode = ({
  data,
}: {
  data: { label: string; frecuencia: string; onEdit?: () => void }
}) => (
  <div
    onClick={data.onEdit}
    className="w-56 cursor-pointer shadow-md rounded-lg overflow-hidden border-2 border-blue-600 bg-white dark:bg-slate-900 group transition-transform hover:scale-105"
  >
    <div className="bg-gradient-to-r from-blue-700 to-blue-600 px-3 py-1.5 flex justify-between items-center text-white">
      <span className="text-[10px] font-black uppercase tracking-wider">Amenaza (Threat)</span>
      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-blue-900/60 font-bold">
        Frec: {data.frecuencia}
      </span>
    </div>
    <div className="p-3 text-left">
      <div className="font-semibold text-xs text-slate-800 dark:text-slate-100 line-clamp-3">
        {data.label}
      </div>
    </div>
    <Handle type="source" position={Position.Right} className="w-2.5 h-2.5 !bg-blue-600" />
  </div>
)

// Bloque 4: Barrera Preventiva (Preventive Barrier)
const PreventiveBarrierNode = ({
  data,
}: {
  data: {
    tag: string
    desc: string
    estado: Estado
    frrDiseno: number
    frrEfectivo: number
    onEdit?: () => void
  }
}) => {
  const esDegradada = data.estado !== 'DISPONIBLE'
  return (
    <div
      onClick={data.onEdit}
      className={`w-48 cursor-pointer shadow-md rounded-lg border-2 bg-white dark:bg-slate-900 p-2.5 transition-transform hover:scale-105 text-left ${
        esDegradada ? 'border-red-500 ring-2 ring-red-500/20' : 'border-emerald-500'
      }`}
    >
      <Handle type="target" position={Position.Left} className="w-2.5 h-2.5 !bg-slate-400" />
      <div className="flex items-center justify-between gap-1">
        <span className="font-mono text-xs font-bold text-slate-800 dark:text-slate-100">
          {data.tag}
        </span>
        <span className={`chip text-[9px] ${ESTADO_CLASES[data.estado]}`}>
          {ESTADO_ETIQUETA[data.estado]}
        </span>
      </div>
      <div className="text-[11px] text-slate-600 dark:text-slate-300 mt-1 line-clamp-2 leading-tight">
        {data.desc}
      </div>
      <div className="mt-2 pt-1 border-t border-slate-100 dark:border-slate-800 flex justify-between text-[10px] font-mono text-slate-500">
        <span>FRR: {fmtFrr(data.frrDiseno)}</span>
        <span>
          Efec:{' '}
          <strong className={esDegradada ? 'text-red-600' : 'text-emerald-600'}>
            {fmtFrr(data.frrEfectivo)}
          </strong>
        </span>
      </div>
      <Handle type="source" position={Position.Right} className="w-2.5 h-2.5 !bg-slate-400" />
      {/* Handle inferior para factor de escalamiento */}
      <Handle
        type="target"
        position={Position.Bottom}
        className="w-2 h-2 !bg-amber-500"
        id="escalation"
      />
    </div>
  )
}

// Bloque 5: Barrera Reactiva / Recuperación (Recovery Barrier)
const RecoveryBarrierNode = ({
  data,
}: {
  data: {
    tag: string
    desc: string
    estado: Estado
    frrDiseno: number
    frrEfectivo: number
    onEdit?: () => void
  }
}) => {
  const esDegradada = data.estado !== 'DISPONIBLE'
  return (
    <div
      onClick={data.onEdit}
      className={`w-48 cursor-pointer shadow-md rounded-lg border-2 bg-white dark:bg-slate-900 p-2.5 transition-transform hover:scale-105 text-left ${
        esDegradada ? 'border-red-500 ring-2 ring-red-500/20' : 'border-emerald-500'
      }`}
    >
      <Handle type="target" position={Position.Left} className="w-2.5 h-2.5 !bg-slate-400" />
      <div className="flex items-center justify-between gap-1">
        <span className="font-mono text-xs font-bold text-slate-800 dark:text-slate-100">
          {data.tag}
        </span>
        <span className={`chip text-[9px] ${ESTADO_CLASES[data.estado]}`}>
          {ESTADO_ETIQUETA[data.estado]}
        </span>
      </div>
      <div className="text-[11px] text-slate-600 dark:text-slate-300 mt-1 line-clamp-2 leading-tight">
        {data.desc}
      </div>
      <div className="mt-2 pt-1 border-t border-slate-100 dark:border-slate-800 flex justify-between text-[10px] font-mono text-slate-500">
        <span>FRR: {fmtFrr(data.frrDiseno)}</span>
        <span>
          Efec:{' '}
          <strong className={esDegradada ? 'text-red-600' : 'text-emerald-600'}>
            {fmtFrr(data.frrEfectivo)}
          </strong>
        </span>
      </div>
      <Handle type="source" position={Position.Right} className="w-2.5 h-2.5 !bg-slate-400" />
      {/* Handle inferior para factor de escalamiento */}
      <Handle
        type="target"
        position={Position.Bottom}
        className="w-2 h-2 !bg-amber-500"
        id="escalation"
      />
    </div>
  )
}

// Bloque 6: Consecuencia (Consequence) - Tarjeta roja derecha con matriz de 4 impactos
const ConsequenceNode = ({
  data,
}: {
  data: {
    label: string
    impPersonas: number
    impAmbiente: number
    impEconomico: number
    impReputacion: number
    onEdit?: () => void
  }
}) => (
  <div
    onClick={data.onEdit}
    className="w-60 cursor-pointer shadow-md rounded-lg overflow-hidden border-2 border-rose-500 bg-white dark:bg-slate-900 group transition-transform hover:scale-105 text-left"
  >
    <div className="bg-gradient-to-r from-rose-700 to-rose-600 px-3 py-1.5 flex justify-between items-center text-white">
      <span className="text-[10px] font-black uppercase tracking-wider">Consecuencia</span>
      <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-rose-950 font-bold">
        Severidad {Math.max(data.impPersonas, data.impAmbiente, data.impEconomico, data.impReputacion)}/5
      </span>
    </div>
    <div className="p-2.5">
      <div className="font-semibold text-xs text-slate-800 dark:text-slate-100 line-clamp-2">
        {data.label}
      </div>
      <div className="mt-2 grid grid-cols-4 gap-1 text-center font-mono text-[9px]">
        <div className="p-1 rounded bg-slate-100 dark:bg-slate-800">
          <span className="text-slate-400 block text-[8px]">PER</span>
          <strong>{data.impPersonas}</strong>
        </div>
        <div className="p-1 rounded bg-slate-100 dark:bg-slate-800">
          <span className="text-slate-400 block text-[8px]">AMB</span>
          <strong>{data.impAmbiente}</strong>
        </div>
        <div className="p-1 rounded bg-slate-100 dark:bg-slate-800">
          <span className="text-slate-400 block text-[8px]">ECO</span>
          <strong>{data.impEconomico}</strong>
        </div>
        <div className="p-1 rounded bg-slate-100 dark:bg-slate-800">
          <span className="text-slate-400 block text-[8px]">REP</span>
          <strong>{data.impReputacion}</strong>
        </div>
      </div>
    </div>
    <Handle type="target" position={Position.Left} className="w-2.5 h-2.5 !bg-rose-500" />
  </div>
)

// Bloque 7: Factor de Escalamiento (Escalation Factor) - Tarjeta amarilla inferior
const EscalationFactorNode = ({
  data,
}: {
  data: { label: string; categoria?: string; onEdit?: () => void }
}) => (
  <div
    onClick={data.onEdit}
    className="w-48 cursor-pointer shadow-md rounded-lg overflow-hidden border-2 border-yellow-500 bg-white dark:bg-slate-900 group transition-transform hover:scale-105 text-left"
  >
    <div className="bg-yellow-400 text-yellow-950 px-2 py-1 flex justify-between items-center font-bold text-[9px] uppercase tracking-wider">
      <span>Factor Escalamiento</span>
    </div>
    <div className="p-2 text-xs font-medium text-slate-800 dark:text-slate-200 line-clamp-2">
      {data.label}
    </div>
    <Handle type="source" position={Position.Top} className="w-2.5 h-2.5 !bg-yellow-500" />
    <Handle type="source" position={Position.Right} className="w-2.5 h-2.5 !bg-yellow-500" />
  </div>
)

// Bloque 8: Control de Factor de Escalamiento (EF Barrier)
const EscalationControlNode = ({
  data,
}: {
  data: { label: string; tag?: string; estado: Estado; onEdit?: () => void }
}) => (
  <div
    onClick={data.onEdit}
    className="w-44 cursor-pointer shadow-sm rounded border-2 border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-2 text-left group transition-transform hover:scale-105"
  >
    <Handle type="target" position={Position.Left} className="w-2 h-2 !bg-slate-400" />
    <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">
      Control EF Barrier
    </div>
    <div className="text-[11px] font-semibold text-slate-800 dark:text-slate-100 line-clamp-2 mt-0.5">
      {data.label}
    </div>
    {data.tag && <div className="text-[9px] font-mono text-brand-600 mt-1">{data.tag}</div>}
    <Handle type="source" position={Position.Top} className="w-2 h-2 !bg-slate-400" />
  </div>
)

const nodeTypes = {
  hazardNode: HazardNode,
  topEventNode: TopEventNode,
  threatNode: ThreatNode,
  preventiveBarrierNode: PreventiveBarrierNode,
  recoveryBarrierNode: RecoveryBarrierNode,
  consequenceNode: ConsequenceNode,
  escalationFactorNode: EscalationFactorNode,
  escalationControlNode: EscalationControlNode,
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BloqueSeleccionado = any

// ==========================================
// 2. VISTA PRINCIPAL BOWTIE INTERACTIVO
// ==========================================

export const BowTieView: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const { usuario } = useAuth()
  const esAdmin = usuario?.rol === 'admin'
  const queryClient = useQueryClient()

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])

  // Modal / Inspector de bloque seleccionado
  const [bloqueSeleccionado, setBloqueSeleccionado] = useState<BloqueSeleccionado | null>(null)

  // Consulta de datos completos del BowTie
  const { data: bt, isLoading } = useQuery<BowTie>({
    queryKey: ['bowtie', id],
    queryFn: () => api.get<BowTie>(`/bowtie/${id}`),
  })

  // Mutación para guardar el diagrama completo en PostgreSQL
  const mutacionGuardar = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.put<BowTie>(`/bowtie/${id}`, payload),
    onSuccess: (data) => {
      queryClient.setQueryData(['bowtie', id], data)
      queryClient.invalidateQueries({ queryKey: ['escenarios'] })
      queryClient.invalidateQueries({ queryKey: ['barreras'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      alert('✓ Diagrama BowTie guardado y riesgo recalculado con éxito.')
    },
    onError: (err: Error) => {
      alert(`Error guardando BowTie: ${err.message}`)
    },
  })

  // Construcción del grafo de 8 bloques a partir de los datos
  useEffect(() => {
    if (!bt) return

    const layout = bt.layout || {}
    const nodeList: Node[] = []
    const edgeList: Edge[] = []

    // 1. Peligro (Hazard) - Posición superior central
    nodeList.push({
      id: 'hazard',
      type: 'hazardNode',
      position: layout['hazard'] || { x: 570, y: 30 },
      data: {
        label: bt.peligro,
        onEdit: () => esAdmin && setBloqueSeleccionado({ tipo: 'hazard', valor: bt.peligro }),
      },
    })

    // 2. Evento Tope (Top Event) - Centro neurálgico
    nodeList.push({
      id: 'topEvent',
      type: 'topEventNode',
      position: layout['topEvent'] || { x: 550, y: 220 },
      data: {
        label: bt.evento_tope,
        riesgoActual: bt.resultado?.riesgo_actual || 'Bajo',
        brecha: bt.resultado?.brecha || 0,
        onEdit: () => esAdmin && setBloqueSeleccionado({ tipo: 'topEvent', valor: bt.evento_tope }),
      },
    })

    // Conexión Peligro -> Evento Tope
    edgeList.push({
      id: 'e-hazard-topEvent',
      source: 'hazard',
      target: 'topEvent',
      targetHandle: 'top',
      style: { stroke: '#eab308', strokeWidth: 3 },
      markerEnd: { type: MarkerType.ArrowClosed },
    })

    // 3. Amenaza (Threat / Causa) - Extremo izquierdo
    nodeList.push({
      id: 'threat',
      type: 'threatNode',
      position: layout['threat'] || { x: 50, y: 230 },
      data: {
        label: bt.causa,
        frecuencia: bt.frecuencia_diseno,
        onEdit: () =>
          esAdmin &&
          setBloqueSeleccionado({
            tipo: 'threat',
            causa: bt.causa,
            frecuencia: bt.frecuencia_diseno,
          }),
      },
    })

    // 4. Barreras Preventivas (Lado izquierdo)
    let ultimoNodoPrev = 'threat'
    bt.preventivas.forEach((b, idx) => {
      const bId = `prev-${b.tag_activo}`
      const posDefecto = { x: 260 + idx * 140, y: 230 }
      nodeList.push({
        id: bId,
        type: 'preventiveBarrierNode',
        position: layout[bId] || posDefecto,
        data: {
          tag: b.tag_activo,
          desc: b.descripcion,
          estado: b.estado_actual,
          frrDiseno: b.frr_diseno,
          frrEfectivo: b.frr_efectivo,
          onEdit: () =>
            esAdmin &&
            setBloqueSeleccionado({
              tipo: 'barrier',
              lado: 'PREVENTIVA',
              barrera: b,
            }),
        },
      })

      edgeList.push({
        id: `e-${ultimoNodoPrev}-${bId}`,
        source: ultimoNodoPrev,
        target: bId,
        animated: b.estado_actual !== 'DISPONIBLE',
        style: {
          stroke: b.estado_actual !== 'DISPONIBLE' ? '#dc2626' : '#10b981',
          strokeWidth: 2,
        },
        markerEnd: { type: MarkerType.ArrowClosed },
      })
      ultimoNodoPrev = bId
    })

    // Conectar última barrera preventiva al Evento Tope
    edgeList.push({
      id: `e-${ultimoNodoPrev}-topEvent`,
      source: ultimoNodoPrev,
      target: 'topEvent',
      targetHandle: 'left',
      style: { stroke: '#10b981', strokeWidth: 2.5 },
      markerEnd: { type: MarkerType.ArrowClosed },
    })

    // 5. Barreras Reactivas (Lado derecho)
    let primerNodoMit = 'topEvent'
    bt.mitigativas.forEach((b, idx) => {
      const bId = `mit-${b.tag_activo}`
      const posDefecto = { x: 860 + idx * 140, y: 230 }
      nodeList.push({
        id: bId,
        type: 'recoveryBarrierNode',
        position: layout[bId] || posDefecto,
        data: {
          tag: b.tag_activo,
          desc: b.descripcion,
          estado: b.estado_actual,
          frrDiseno: b.frr_diseno,
          frrEfectivo: b.frr_efectivo,
          onEdit: () =>
            esAdmin &&
            setBloqueSeleccionado({
              tipo: 'barrier',
              lado: 'MITIGATIVA',
              barrera: b,
            }),
        },
      })

      edgeList.push({
        id: `e-${primerNodoMit}-${bId}`,
        source: primerNodoMit,
        sourceHandle: primerNodoMit === 'topEvent' ? 'right' : undefined,
        target: bId,
        animated: b.estado_actual !== 'DISPONIBLE',
        style: {
          stroke: b.estado_actual !== 'DISPONIBLE' ? '#dc2626' : '#10b981',
          strokeWidth: 2,
        },
        markerEnd: { type: MarkerType.ArrowClosed },
      })
      primerNodoMit = bId
    })

    // 6. Consecuencia - Extremo derecho
    const posConsDefecto = { x: 1160, y: 220 }
    nodeList.push({
      id: 'consequence',
      type: 'consequenceNode',
      position: layout['consequence'] || posConsDefecto,
      data: {
        label: bt.consecuencia,
        impPersonas: bt.imp_personas,
        impAmbiente: bt.imp_ambiente,
        impEconomico: bt.imp_economico,
        impReputacion: bt.imp_reputacion,
        onEdit: () =>
          esAdmin &&
          setBloqueSeleccionado({
            tipo: 'consequence',
            consecuencia: bt.consecuencia,
            impPersonas: bt.imp_personas,
            impAmbiente: bt.imp_ambiente,
            impEconomico: bt.imp_economico,
            impReputacion: bt.imp_reputacion,
          }),
      },
    })

    edgeList.push({
      id: `e-${primerNodoMit}-consequence`,
      source: primerNodoMit,
      sourceHandle: primerNodoMit === 'topEvent' ? 'right' : undefined,
      target: 'consequence',
      style: { stroke: '#f43f5e', strokeWidth: 2.5 },
      markerEnd: { type: MarkerType.ArrowClosed },
    })

    // 7 y 8. Factores de Escalamiento y Controles
    bt.factores_escalamiento?.forEach((fe, idx) => {
      const feId = `fe-${fe.id || idx}`
      const bTargetId =
        bt.preventivas.find((p) => p.tag_activo === fe.barrera_tag)
          ? `prev-${fe.barrera_tag}`
          : `mit-${fe.barrera_tag}`

      nodeList.push({
        id: feId,
        type: 'escalationFactorNode',
        position: layout[feId] || { x: 260 + idx * 200, y: 410 },
        data: {
          label: fe.descripcion,
          categoria: fe.categoria,
          onEdit: () =>
            esAdmin &&
            setBloqueSeleccionado({
              tipo: 'escalationFactor',
              factor: fe,
            }),
        },
      })

      // Conexión hacia la barrera que compromete
      edgeList.push({
        id: `e-${feId}-${bTargetId}`,
        source: feId,
        target: bTargetId,
        targetHandle: 'escalation',
        style: { stroke: '#eab308', strokeDasharray: '4 4', strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed },
      })

      // Controles del factor de escalamiento
      fe.controles?.forEach((ctrl, cIdx) => {
        const ctrlId = `ctrl-${ctrl.id || `${idx}-${cIdx}`}`
        nodeList.push({
          id: ctrlId,
          type: 'escalationControlNode',
          position: layout[ctrlId] || { x: 380 + idx * 200, y: 415 },
          data: {
            label: ctrl.descripcion,
            tag: ctrl.tag_activo,
            estado: ctrl.estado_actual,
            onEdit: () =>
              esAdmin &&
              setBloqueSeleccionado({
                tipo: 'escalationControl',
                control: ctrl,
                factorId: fe.id,
              }),
          },
        })

        edgeList.push({
          id: `e-${feId}-${ctrlId}`,
          source: feId,
          target: ctrlId,
          style: { stroke: '#94a3b8', strokeWidth: 1.5 },
        })
      })
    })

    setNodes(nodeList)
    setEdges(edgeList)
  }, [bt, esAdmin, setNodes, setEdges])

  // ==========================================
  // 3. REGLAS DE CONEXIÓN LÓGICA E INTERACTIVA
  // ==========================================
  const isValidConnection = useCallback(
    (connection: Edge | Connection) => {
      const src = connection.source
      const tgt = connection.target
      if (!src || !tgt || src === tgt) return false

      // Regla 1: Peligro solo conecta a Evento Tope
      if (src === 'hazard' && tgt === 'topEvent') return true
      if (src === 'hazard' && tgt !== 'topEvent') return false

      // Regla 2: Amenaza solo conecta a Barrera Preventiva o Evento Tope
      if (src === 'threat') {
        return tgt.startsWith('prev-') || tgt === 'topEvent'
      }

      // Regla 3: Barrera Preventiva conecta a otra Barrera Preventiva o a Evento Tope
      if (src.startsWith('prev-')) {
        return tgt.startsWith('prev-') || tgt === 'topEvent'
      }

      // Regla 4: Evento Tope conecta a Barrera Reactiva o Consecuencia
      if (src === 'topEvent') {
        return tgt.startsWith('mit-') || tgt === 'consequence'
      }

      // Regla 5: Barrera Reactiva conecta a otra Barrera Reactiva o Consecuencia
      if (src.startsWith('mit-')) {
        return tgt.startsWith('mit-') || tgt === 'consequence'
      }

      // Regla 6: Factor de Escalamiento conecta a Barrera (preventiva/reactiva) o a Control
      if (src.startsWith('fe-')) {
        return (
          tgt.startsWith('prev-') ||
          tgt.startsWith('mit-') ||
          tgt.startsWith('ctrl-')
        )
      }

      return false
    },
    []
  )

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  )

  // Guardar estado actual del layout y los bloques en la base de datos
  const handleGuardarBowTie = () => {
    if (!bt) return

    // Capturar posiciones actuales de los nodos
    const layoutMap: Record<string, { x: number; y: number }> = {}
    nodes.forEach((n) => {
      layoutMap[n.id] = { x: Math.round(n.position.x), y: Math.round(n.position.y) }
    })

    const payload = {
      peligro: bt.peligro,
      evento_tope: bt.evento_tope,
      causa: bt.causa,
      frecuencia_diseno: bt.frecuencia_diseno,
      consecuencia: bt.consecuencia,
      imp_economico: bt.imp_economico,
      imp_personas: bt.imp_personas,
      imp_ambiente: bt.imp_ambiente,
      imp_reputacion: bt.imp_reputacion,
      barreras: [
        ...bt.preventivas.map((p) => ({
          tag_activo: p.tag_activo,
          descripcion: p.descripcion,
          tipo: p.tipo,
          lado: 'PREVENTIVA',
          frr_diseno: p.frr_diseno,
          estado_actual: p.estado_actual,
        })),
        ...bt.mitigativas.map((m) => ({
          tag_activo: m.tag_activo,
          descripcion: m.descripcion,
          tipo: m.tipo,
          lado: 'MITIGATIVA',
          frr_diseno: m.frr_diseno,
          estado_actual: m.estado_actual,
        })),
      ],
      factores_escalamiento: (bt.factores_escalamiento || []).map((fe) => ({
        id: fe.id,
        barrera_tag: fe.barrera_tag,
        descripcion: fe.descripcion,
        categoria: fe.categoria,
        controles: fe.controles.map((c) => ({
          id: c.id,
          descripcion: c.descripcion,
          tag_activo: c.tag_activo,
          estado_actual: c.estado_actual,
        })),
      })),
      layout: layoutMap,
    }

    mutacionGuardar.mutate(payload)
  }

  // ==========================================
  // 4. ACCIONES PARA AÑADIR NUEVOS BLOQUES
  // ==========================================
  const handleAgregarBarrera = (lado: 'PREVENTIVA' | 'MITIGATIVA') => {
    if (!bt) return
    const tag = prompt(`Ingrese el TAG de la nueva barrera ${lado}:`, `${lado === 'PREVENTIVA' ? 'SIS-NEW' : 'PSV-NEW'}`)
    if (!tag) return
    const desc = prompt('Descripción de la barrera:', 'Lazo instrumentado de seguridad') || 'Barrera sin descripción'
    const frr = Number(prompt('Factor de Reducción de Riesgo (FRR diseño, ej. 10, 100):', '100')) || 100

    const nuevaBarrera = {
      tag_activo: tag,
      descripcion: desc,
      tipo: 'EXISTENTE' as const,
      lado,
      frr_diseno: frr,
      estado_actual: 'DISPONIBLE' as const,
    }

    const payload = {
      peligro: bt.peligro,
      evento_tope: bt.evento_tope,
      causa: bt.causa,
      frecuencia_diseno: bt.frecuencia_diseno,
      consecuencia: bt.consecuencia,
      imp_economico: bt.imp_economico,
      imp_personas: bt.imp_personas,
      imp_ambiente: bt.imp_ambiente,
      imp_reputacion: bt.imp_reputacion,
      barreras: [
        ...bt.preventivas.map((p) => ({
          tag_activo: p.tag_activo,
          descripcion: p.descripcion,
          tipo: p.tipo,
          lado: 'PREVENTIVA',
          frr_diseno: p.frr_diseno,
          estado_actual: p.estado_actual,
        })),
        ...bt.mitigativas.map((m) => ({
          tag_activo: m.tag_activo,
          descripcion: m.descripcion,
          tipo: m.tipo,
          lado: 'MITIGATIVA',
          frr_diseno: m.frr_diseno,
          estado_actual: m.estado_actual,
        })),
        nuevaBarrera,
      ],
      factores_escalamiento: (bt.factores_escalamiento || []).map((fe) => ({
        id: fe.id,
        barrera_tag: fe.barrera_tag,
        descripcion: fe.descripcion,
        categoria: fe.categoria,
        controles: fe.controles,
      })),
    }

    mutacionGuardar.mutate(payload)
  }

  const handleAgregarFactorEscalamiento = () => {
    if (!bt) return
    const barrerasTags = [...bt.preventivas, ...bt.mitigativas].map((b) => b.tag_activo)
    if (barrerasTags.length === 0) {
      alert('Debe existir al menos una barrera para vincular un factor de escalamiento.')
      return
    }
    const tag = prompt(`¿A qué barrera afecta este factor? (${barrerasTags.join(', ')}):`, barrerasTags[0])
    if (!tag || !barrerasTags.includes(tag)) return
    const desc = prompt('Descripción del Factor de Escalamiento (ej. Falla de aire de instrumentos, congelamiento):', 'Falla de aire comprimido')
    if (!desc) return

    const nuevoFactor = {
      barrera_tag: tag,
      descripcion: desc,
      categoria: 'OPERACIONAL',
      controles: [
        {
          descripcion: 'Control/Redundancia de suministro',
          tag_activo: 'CTRL-01',
          estado_actual: 'DISPONIBLE' as const,
        },
      ],
    }

    const payload = {
      peligro: bt.peligro,
      evento_tope: bt.evento_tope,
      causa: bt.causa,
      frecuencia_diseno: bt.frecuencia_diseno,
      consecuencia: bt.consecuencia,
      imp_economico: bt.imp_economico,
      imp_personas: bt.imp_personas,
      imp_ambiente: bt.imp_ambiente,
      imp_reputacion: bt.imp_reputacion,
      barreras: [
        ...bt.preventivas.map((p) => ({
          tag_activo: p.tag_activo,
          descripcion: p.descripcion,
          tipo: p.tipo,
          lado: 'PREVENTIVA',
          frr_diseno: p.frr_diseno,
          estado_actual: p.estado_actual,
        })),
        ...bt.mitigativas.map((m) => ({
          tag_activo: m.tag_activo,
          descripcion: m.descripcion,
          tipo: m.tipo,
          lado: 'MITIGATIVA',
          frr_diseno: m.frr_diseno,
          estado_actual: m.estado_actual,
        })),
      ],
      factores_escalamiento: [
        ...(bt.factores_escalamiento || []).map((fe) => ({
          id: fe.id,
          barrera_tag: fe.barrera_tag,
          descripcion: fe.descripcion,
          categoria: fe.categoria,
          controles: fe.controles,
        })),
        nuevoFactor,
      ],
    }

    mutacionGuardar.mutate(payload)
  }

  if (isLoading || !bt) {
    return <div className="p-8 text-center text-slate-500">Cargando BowTie interactivo...</div>
  }

  const res = bt.resultado

  return (
    <div className="space-y-4 flex flex-col h-[calc(100vh-140px)]">
      {/* Barra superior de contexto y acciones */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <Link to="/escenarios" className="text-xs text-brand-600 hover:underline">
              ← Volver a Escenarios
            </Link>
            <span className="text-slate-300 dark:text-slate-700">|</span>
            <span className="text-xs text-slate-500 font-mono">Escenario #{bt.escenario_id}</span>
            <span className="text-slate-300 dark:text-slate-700">|</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-500/10 text-amber-800 dark:text-amber-300">
              Metodología BowTie 8 Bloques
            </span>
          </div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-white mt-1">
            BowTie Dinámico e Interactivo: {bt.causa}
          </h1>
          <div className="text-xs text-slate-500">{bt.ruta}</div>
        </div>

        {/* Resumen del cálculo actual y Botones de Edición */}
        <div className="flex items-center gap-3">
          {res && (
            <div className="hidden md:flex items-center gap-3 bg-white dark:bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm text-xs">
              <div>
                <span className="text-slate-400 block text-[9px]">DISEÑO</span>
                <span className={`chip text-[10px] ${NIVEL_CLASES[res.riesgo_diseno]}`}>
                  {res.riesgo_diseno}
                </span>
              </div>
              <div className="text-slate-400 font-black">➔</div>
              <div>
                <span className="text-slate-400 block text-[9px]">ACTUAL</span>
                <span className={`chip text-[10px] ${NIVEL_CLASES[res.riesgo_actual]}`}>
                  {res.riesgo_actual}
                </span>
              </div>
              <div className="pl-2 border-l border-slate-200 dark:border-slate-700">
                <span className="text-slate-400 block text-[9px]">BRECHA</span>
                <span
                  className={`font-black text-xs ${
                    res.brecha > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600'
                  }`}
                >
                  {fmtBrecha(res.brecha)}
                </span>
              </div>
            </div>
          )}

          {esAdmin && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleAgregarBarrera('PREVENTIVA')}
                className="btn-secondary text-xs px-2.5 py-1"
                title="Añadir Barrera Preventiva"
              >
                + Barrera Prev.
              </button>
              <button
                onClick={() => handleAgregarBarrera('MITIGATIVA')}
                className="btn-secondary text-xs px-2.5 py-1"
                title="Añadir Barrera Reactiva"
              >
                + Barrera React.
              </button>
              <button
                onClick={handleAgregarFactorEscalamiento}
                className="btn-secondary text-xs px-2.5 py-1 bg-yellow-50 dark:bg-yellow-950/40 text-yellow-800 dark:text-yellow-200"
                title="Añadir Factor de Escalamiento"
              >
                + Factor Escalada
              </button>
              <button
                onClick={handleGuardarBowTie}
                disabled={mutacionGuardar.isPending}
                className="btn-primary text-xs px-3.5 py-1 shadow"
              >
                {mutacionGuardar.isPending ? 'Guardando...' : '💾 Guardar BowTie'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Canvas Interactivo React Flow */}
      <div className="flex-1 w-full bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden relative shadow-inner">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={esAdmin ? onNodesChange : undefined}
          onEdgesChange={esAdmin ? onEdgesChange : undefined}
          onConnect={esAdmin ? onConnect : undefined}
          isValidConnection={isValidConnection}
          nodesDraggable={esAdmin}
          nodesConnectable={esAdmin}
          fitView
          fitViewOptions={{ padding: 0.15 }}
          minZoom={0.2}
          maxZoom={1.5}
        >
          <Background color="#94a3b8" gap={18} size={1} />
          <Controls />
        </ReactFlow>

        {/* Barra Informativa de Roles */}
        <div className="absolute top-3 left-3 bg-white/95 dark:bg-slate-900/95 backdrop-blur border border-slate-200 dark:border-slate-800 px-3 py-1.5 rounded-lg text-xs shadow-sm flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${esAdmin ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`}
          />
          <span className="text-slate-600 dark:text-slate-300">
            {esAdmin
              ? 'Modo Edición Habilitado (Haz clic en un bloque para editar sus atributos o arrastra para conectar)'
              : 'Modo Solo Lectura (Inicia sesión como administrador para editar este BowTie)'}
          </span>
        </div>

        {/* Leyenda Metodológica de los 8 Bloques */}
        <div className="absolute bottom-3 left-3 bg-white/90 dark:bg-slate-900/90 backdrop-blur border border-slate-200 dark:border-slate-800 p-2.5 rounded-lg text-[10px] space-y-1 shadow-md max-w-sm hidden md:block">
          <div className="font-bold text-slate-700 dark:text-slate-300">
            Bloques Metodología BowTie:
          </div>
          <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-slate-600 dark:text-slate-400">
            <div>1. Peligro (Hazard)</div>
            <div>2. Evento Tope (Top Event)</div>
            <div>3. Amenaza (Threat)</div>
            <div>4. Barrera Preventiva</div>
            <div>5. Barrera Reactiva</div>
            <div>6. Consecuencia</div>
            <div>7. Factor Escalamiento</div>
            <div>8. Control Factor (EF)</div>
          </div>
        </div>
      </div>

      {/* ========================================================
          5. DRAWER / MODAL DE EDICIÓN DE ATRIBUTOS DEL BLOQUE
          ======================================================== */}
      {bloqueSeleccionado && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-md w-full p-5 space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                Editar Atributos: {bloqueSeleccionado.tipo}
              </h3>
              <button
                onClick={() => setBloqueSeleccionado(null)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            {/* Formulario según el tipo de bloque */}
            <div className="space-y-3 text-xs">
              {/* Editar Peligro */}
              {bloqueSeleccionado.tipo === 'hazard' && (
                <div>
                  <label className="label">Descripción del Peligro (Hazard)</label>
                  <textarea
                    className="input h-20"
                    value={bloqueSeleccionado.valor}
                    onChange={(e) =>
                      setBloqueSeleccionado({ ...bloqueSeleccionado, valor: e.target.value })
                    }
                  />
                </div>
              )}

              {/* Editar Evento Tope */}
              {bloqueSeleccionado.tipo === 'topEvent' && (
                <div>
                  <label className="label">Descripción del Evento Tope (Pérdida de Contención)</label>
                  <textarea
                    className="input h-20"
                    value={bloqueSeleccionado.valor}
                    onChange={(e) =>
                      setBloqueSeleccionado({ ...bloqueSeleccionado, valor: e.target.value })
                    }
                  />
                </div>
              )}

              {/* Editar Amenaza */}
              {bloqueSeleccionado.tipo === 'threat' && (
                <>
                  <div>
                    <label className="label">Causa Raíz / Amenaza</label>
                    <textarea
                      className="input h-20"
                      value={bloqueSeleccionado.causa}
                      onChange={(e) =>
                        setBloqueSeleccionado({ ...bloqueSeleccionado, causa: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <label className="label">Frecuencia de Diseño</label>
                    <select
                      className="input"
                      value={bloqueSeleccionado.frecuencia}
                      onChange={(e) =>
                        setBloqueSeleccionado({
                          ...bloqueSeleccionado,
                          frecuencia: e.target.value,
                        })
                      }
                    >
                      <option value="A">A - Muy Frecuente</option>
                      <option value="B">B - Probable</option>
                      <option value="C">C - Ocasional</option>
                      <option value="D">D - Raro</option>
                      <option value="E">E - Improbable</option>
                    </select>
                  </div>
                </>
              )}

              {/* Editar Barrera (Preventiva o Reactiva) */}
              {bloqueSeleccionado.tipo === 'barrier' && (
                <>
                  <div>
                    <label className="label">TAG Activo (CMMS)</label>
                    <input
                      type="text"
                      className="input font-mono"
                      value={bloqueSeleccionado.barrera.tag_activo}
                      onChange={(e) =>
                        setBloqueSeleccionado({
                          ...bloqueSeleccionado,
                          barrera: {
                            ...bloqueSeleccionado.barrera,
                            tag_activo: e.target.value,
                          },
                        })
                      }
                    />
                  </div>
                  <div>
                    <label className="label">Descripción de la Barrera</label>
                    <input
                      type="text"
                      className="input"
                      value={bloqueSeleccionado.barrera.descripcion}
                      onChange={(e) =>
                        setBloqueSeleccionado({
                          ...bloqueSeleccionado,
                          barrera: {
                            ...bloqueSeleccionado.barrera,
                            descripcion: e.target.value,
                          },
                        })
                      }
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="label">FRR de Diseño</label>
                      <input
                        type="number"
                        className="input font-mono"
                        value={bloqueSeleccionado.barrera.frr_diseno}
                        onChange={(e) =>
                          setBloqueSeleccionado({
                            ...bloqueSeleccionado,
                            barrera: {
                              ...bloqueSeleccionado.barrera,
                              frr_diseno: Number(e.target.value),
                            },
                          })
                        }
                      />
                    </div>
                    <div>
                      <label className="label">Estado Operacional</label>
                      <select
                        className="input"
                        value={bloqueSeleccionado.barrera.estado_actual}
                        onChange={(e) =>
                          setBloqueSeleccionado({
                            ...bloqueSeleccionado,
                            barrera: {
                              ...bloqueSeleccionado.barrera,
                              estado_actual: e.target.value,
                            },
                          })
                        }
                      >
                        {ESTADOS.map((est) => (
                          <option key={est} value={est}>
                            {ESTADO_ETIQUETA[est]}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </>
              )}

              {/* Editar Consecuencia e Impactos */}
              {bloqueSeleccionado.tipo === 'consequence' && (
                <>
                  <div>
                    <label className="label">Descripción de la Consecuencia</label>
                    <textarea
                      className="input h-16"
                      value={bloqueSeleccionado.consecuencia}
                      onChange={(e) =>
                        setBloqueSeleccionado({
                          ...bloqueSeleccionado,
                          consecuencia: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="label">Impacto Personas (1-5)</label>
                      <input
                        type="number"
                        min="1"
                        max="5"
                        className="input"
                        value={bloqueSeleccionado.impPersonas}
                        onChange={(e) =>
                          setBloqueSeleccionado({
                            ...bloqueSeleccionado,
                            impPersonas: Number(e.target.value),
                          })
                        }
                      />
                    </div>
                    <div>
                      <label className="label">Impacto Ambiente (1-5)</label>
                      <input
                        type="number"
                        min="1"
                        max="5"
                        className="input"
                        value={bloqueSeleccionado.impAmbiente}
                        onChange={(e) =>
                          setBloqueSeleccionado({
                            ...bloqueSeleccionado,
                            impAmbiente: Number(e.target.value),
                          })
                        }
                      />
                    </div>
                    <div>
                      <label className="label">Impacto Económico (1-5)</label>
                      <input
                        type="number"
                        min="1"
                        max="5"
                        className="input"
                        value={bloqueSeleccionado.impEconomico}
                        onChange={(e) =>
                          setBloqueSeleccionado({
                            ...bloqueSeleccionado,
                            impEconomico: Number(e.target.value),
                          })
                        }
                      />
                    </div>
                    <div>
                      <label className="label">Impacto Reputación (1-5)</label>
                      <input
                        type="number"
                        min="1"
                        max="5"
                        className="input"
                        value={bloqueSeleccionado.impReputacion}
                        onChange={(e) =>
                          setBloqueSeleccionado({
                            ...bloqueSeleccionado,
                            impReputacion: Number(e.target.value),
                          })
                        }
                      />
                    </div>
                  </div>
                </>
              )}

              {/* Editar Factor de Escalamiento */}
              {bloqueSeleccionado.tipo === 'escalationFactor' && (
                <div>
                  <label className="label">Descripción del Factor de Escalamiento</label>
                  <textarea
                    className="input h-20"
                    value={bloqueSeleccionado.factor.descripcion}
                    onChange={(e) =>
                      setBloqueSeleccionado({
                        ...bloqueSeleccionado,
                        factor: {
                          ...bloqueSeleccionado.factor,
                          descripcion: e.target.value,
                        },
                      })
                    }
                  />
                </div>
              )}

              {/* Editar Control de Factor */}
              {bloqueSeleccionado.tipo === 'escalationControl' && (
                <>
                  <div>
                    <label className="label">Descripción del Control (EF Barrier)</label>
                    <input
                      type="text"
                      className="input"
                      value={bloqueSeleccionado.control.descripcion}
                      onChange={(e) =>
                        setBloqueSeleccionado({
                          ...bloqueSeleccionado,
                          control: {
                            ...bloqueSeleccionado.control,
                            descripcion: e.target.value,
                          },
                        })
                      }
                    />
                  </div>
                  <div>
                    <label className="label">TAG Activo del Control</label>
                    <input
                      type="text"
                      className="input font-mono"
                      value={bloqueSeleccionado.control.tag_activo || ''}
                      onChange={(e) =>
                        setBloqueSeleccionado({
                          ...bloqueSeleccionado,
                          control: {
                            ...bloqueSeleccionado.control,
                            tag_activo: e.target.value,
                          },
                        })
                      }
                    />
                  </div>
                </>
              )}
            </div>

            {/* Botones de acción del Modal */}
            <div className="pt-2 flex justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={() => setBloqueSeleccionado(null)}
                className="btn-secondary text-xs"
              >
                Cerrar
              </button>
              <button
                onClick={() => {
                  // Aplicar cambios en memoria y guardar en el backend
                  const s = bloqueSeleccionado
                  if (s.tipo === 'hazard') bt.peligro = s.valor
                  if (s.tipo === 'topEvent') bt.evento_tope = s.valor
                  if (s.tipo === 'threat') {
                    bt.causa = s.causa
                    bt.frecuencia_diseno = s.frecuencia
                  }
                  if (s.tipo === 'consequence') {
                    bt.consecuencia = s.consecuencia
                    bt.imp_personas = s.impPersonas
                    bt.imp_ambiente = s.impAmbiente
                    bt.imp_economico = s.impEconomico
                    bt.imp_reputacion = s.impReputacion
                  }
                  if (s.tipo === 'barrier') {
                    const list =
                      s.lado === 'PREVENTIVA' ? bt.preventivas : bt.mitigativas
                    const target = list.find(
                      (x) => x.tag_activo === s.barrera.tag_activo
                    )
                    if (target) {
                      target.descripcion = s.barrera.descripcion
                      target.frr_diseno = s.barrera.frr_diseno
                      target.estado_actual = s.barrera.estado_actual
                    }
                  }
                  if (s.tipo === 'escalationFactor') {
                    const fe = bt.factores_escalamiento?.find(
                      (x) => x.id === s.factor.id
                    )
                    if (fe) fe.descripcion = s.factor.descripcion
                  }
                  if (s.tipo === 'escalationControl') {
                    bt.factores_escalamiento?.forEach((fe) => {
                      const c = fe.controles?.find((x) => x.id === s.control.id)
                      if (c) {
                        c.descripcion = s.control.descripcion
                        c.tag_activo = s.control.tag_activo
                      }
                    })
                  }
                  handleGuardarBowTie()
                  setBloqueSeleccionado(null)
                }}
                className="btn-primary text-xs"
              >
                Aplicar y Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
