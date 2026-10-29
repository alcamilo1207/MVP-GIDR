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
import type { BowTie, Estado, BarreraEscenario } from '../lib/types'
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
    <Handle type="source" position={Position.Right} className="w-2.5 h-2.5 !bg-yellow-500" />
    <Handle type="source" position={Position.Top} className="w-2.5 h-2.5 !bg-yellow-500" id="top" />
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
    <Handle type="target" position={Position.Left} className="w-2.5 h-2.5 !bg-slate-400" />
    <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">
      Control EF Barrier
    </div>
    <div className="text-[11px] font-semibold text-slate-800 dark:text-slate-100 line-clamp-2 mt-0.5">
      {data.label}
    </div>
    {data.tag && <div className="text-[9px] font-mono text-brand-600 mt-1">{data.tag}</div>}
    <Handle type="source" position={Position.Right} className="w-2.5 h-2.5 !bg-slate-400" id="right" />
    <Handle type="source" position={Position.Top} className="w-2.5 h-2.5 !bg-slate-400" id="top" />
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

  // Modal para confirmar eliminación de bloque al hacer doble clic
  const [nodoAEliminar, setNodoAEliminar] = useState<Node | null>(null)

  // Tipo de bloque a añadir desde el panel de selección inferior izquierdo
  const [tipoBloqueAñadir, setTipoBloqueAñadir] = useState<string>('threat')

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
    const layoutPositions = layout.positions || layout
    const savedEdges: Edge[] | undefined = layout.edges
    const nodeList: Node[] = []
    const edgeList: Edge[] = []

    // 1. Peligro (Hazard) - Posición superior central
    nodeList.push({
      id: 'hazard',
      type: 'hazardNode',
      position: layoutPositions['hazard'] || { x: 570, y: 30 },
      data: {
        label: bt.peligro,
        onEdit: () => esAdmin && setBloqueSeleccionado({ tipo: 'hazard', valor: bt.peligro }),
      },
    })

    // 2. Evento Tope (Top Event) - Centro neurálgico
    nodeList.push({
      id: 'topEvent',
      type: 'topEventNode',
      position: layoutPositions['topEvent'] || { x: 550, y: 220 },
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
      position: layoutPositions['threat'] || { x: 50, y: 230 },
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
        position: layoutPositions[bId] || posDefecto,
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
        position: layoutPositions[bId] || posDefecto,
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
      position: layoutPositions['consequence'] || posConsDefecto,
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

    // 7 y 8. Factores de Escalamiento y Controles (EF Barriers)
    // METODOLOGÍA: Escalation Factor -> Control (si existe) -> Barrera primaria
    bt.factores_escalamiento?.forEach((fe, idx) => {
      const feId = `fe-${fe.id || idx}`
      const bTargetId =
        bt.preventivas.find((p) => p.tag_activo === fe.barrera_tag)
          ? `prev-${fe.barrera_tag}`
          : `mit-${fe.barrera_tag}`

      nodeList.push({
        id: feId,
        type: 'escalationFactorNode',
        position: layoutPositions[feId] || { x: 120 + idx * 240, y: 430 },
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

      const tieneControles = fe.controles && fe.controles.length > 0

      if (tieneControles) {
        // Encadenar: Factor -> Control 1 -> Control 2 -> ... -> Barrera
        let prevNodeId = feId
        fe.controles.forEach((ctrl, cIdx) => {
          const ctrlId = `ctrl-${ctrl.id || `${idx}-${cIdx}`}`
          nodeList.push({
            id: ctrlId,
            type: 'escalationControlNode',
            position: layoutPositions[ctrlId] || { x: 300 + idx * 240 + cIdx * 160, y: 435 },
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

          // Conectar nodo previo (factor o control anterior) con este control
          edgeList.push({
            id: `e-${prevNodeId}-${ctrlId}`,
            source: prevNodeId,
            target: ctrlId,
            style: { stroke: '#94a3b8', strokeWidth: 1.5 },
            markerEnd: { type: MarkerType.ArrowClosed },
          })

          prevNodeId = ctrlId
        })

        // Conectar el último control con la barrera principal
        edgeList.push({
          id: `e-${prevNodeId}-${bTargetId}`,
          source: prevNodeId,
          sourceHandle: 'top',
          target: bTargetId,
          targetHandle: 'escalation',
          style: { stroke: '#eab308', strokeDasharray: '4 4', strokeWidth: 2 },
          markerEnd: { type: MarkerType.ArrowClosed },
        })
      } else {
        // Si no hay control interpuesto, conecta directamente: Factor -> Barrera
        edgeList.push({
          id: `e-${feId}-${bTargetId}`,
          source: feId,
          sourceHandle: 'top',
          target: bTargetId,
          targetHandle: 'escalation',
          style: { stroke: '#eab308', strokeDasharray: '4 4', strokeWidth: 2 },
          markerEnd: { type: MarkerType.ArrowClosed },
        })
      }
    })

    setNodes(nodeList)
    if (savedEdges && Array.isArray(savedEdges) && savedEdges.length > 0) {
      setEdges(savedEdges)
    } else {
      setEdges(edgeList)
    }
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

      // Regla 7: Control de Factor conecta a Barrera (preventiva/reactiva) o a otro Control
      if (src.startsWith('ctrl-')) {
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
    (params: Connection) => {
      const edgeToAdd: Edge = {
        ...params,
        id: `e-${params.source}-${params.target}-${Date.now()}`,
        animated: false,
        style: { stroke: '#10b981', strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed },
      }
      setEdges((eds) => addEdge(edgeToAdd, eds))
    },
    [setEdges]
  )

  // Eliminar conexión haciendo doble clic sobre ella
  const handleEdgeDoubleClick = useCallback(
    (_event: React.MouseEvent, edge: Edge) => {
      if (!esAdmin) return
      const confirmar = window.confirm(
        `¿Desea eliminar esta conexión?\n\nConexión: ${edge.source} ➔ ${edge.target}`
      )
      if (confirmar) {
        setEdges((eds) => eds.filter((e) => e.id !== edge.id))
      }
    },
    [esAdmin, setEdges]
  )

  // Abrir modal de confirmación de eliminación de bloque al hacer doble clic
  const handleNodeDoubleClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (!esAdmin) return
      setBloqueSeleccionado(null)
      setNodoAEliminar(node)
    },
    [esAdmin]
  )

  // Ejecutar eliminación confirmada de un bloque
  const handleEliminarNodo = (nodeId: string) => {
    // 1. Quitar de nodes y edges en el canvas
    setNodes((nds) => nds.filter((n) => n.id !== nodeId))
    setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId))

    // 2. Quitar del objeto de datos en memoria (bt)
    if (bt) {
      if (nodeId.startsWith('prev-')) {
        const tag = nodeId.replace('prev-', '')
        bt.preventivas = bt.preventivas.filter((b) => b.tag_activo !== tag)
      } else if (nodeId.startsWith('mit-')) {
        const tag = nodeId.replace('mit-', '')
        bt.mitigativas = bt.mitigativas.filter((b) => b.tag_activo !== tag)
      } else if (nodeId.startsWith('fe-')) {
        bt.factores_escalamiento = (bt.factores_escalamiento || []).filter(
          (fe, idx) => `fe-${fe.id || idx}` !== nodeId
        )
      } else if (nodeId.startsWith('ctrl-')) {
        bt.factores_escalamiento?.forEach((fe) => {
          fe.controles = (fe.controles || []).filter(
            (c, cIdx) => `ctrl-${c.id || cIdx}` !== nodeId
          )
        })
      }
    }

    setNodoAEliminar(null)
    setBloqueSeleccionado(null)
  }

  // Validación rigurosa de conexiones según la metodología BowTie antes de guardar
  const validarConexionesBowTie = (
    currentNodes: Node[],
    currentEdges: Edge[]
  ): { valido: boolean; error?: string } => {
    // 1. Verificar que ningún bloque esté huérfano (completamente desconectado)
    for (const n of currentNodes) {
      const tieneConexion = currentEdges.some(
        (e) => e.source === n.id || e.target === n.id
      )
      if (!tieneConexion) {
        const nombre = n.data?.tag || n.data?.label || n.id
        return {
          valido: false,
          error: `El bloque "${nombre}" está completamente desconectado sin ninguna conexión.\nTodos los bloques deben estar conectados según la metodología BowTie antes de guardar.`,
        }
      }
    }

    // 2. Peligro -> Evento Tope
    const connPeligro = currentEdges.filter(
      (e) => e.source === 'hazard' && e.target === 'topEvent'
    )
    if (connPeligro.length === 0) {
      return {
        valido: false,
        error: 'El bloque de Peligro (Hazard) debe estar conectado directamente al Evento Tope (Top Event).',
      }
    }

    // 3. Amenaza (Causa) debe tener al menos una salida
    const amenazaOut = currentEdges.filter((e) => e.source === 'threat')
    if (amenazaOut.length === 0) {
      return {
        valido: false,
        error: 'El bloque de Amenaza (Causa) debe tener una conexión de salida hacia las barreras preventivas o hacia el Evento Tope.',
      }
    }

    // 4. Barreras Preventivas: deben tener al menos 1 entrada y 1 salida
    const prevNodes = currentNodes.filter((n) => n.id.startsWith('prev-'))
    for (const p of prevNodes) {
      const tieneEntrada = currentEdges.some((e) => e.target === p.id)
      const tieneSalida = currentEdges.some((e) => e.source === p.id)
      const tag = p.data?.tag || p.id
      if (!tieneEntrada) {
        return {
          valido: false,
          error: `La Barrera Preventiva "${tag}" no tiene conexión de entrada (debe conectarse desde la Amenaza o una barrera previa).`,
        }
      }
      if (!tieneSalida) {
        return {
          valido: false,
          error: `La Barrera Preventiva "${tag}" no tiene conexión de salida (debe conectarse hacia otra barrera o hacia el Evento Tope).`,
        }
      }
    }

    // 5. Evento Tope: debe recibir del lado preventivo y salir hacia el lado reactivo
    const topIn = currentEdges.filter(
      (e) => e.target === 'topEvent' && e.source !== 'hazard'
    )
    if (topIn.length === 0) {
      return {
        valido: false,
        error: 'El Evento Tope no tiene conexión de entrada proveniente de la línea preventiva (Amenaza o Barreras Preventivas).',
      }
    }
    const topOut = currentEdges.filter((e) => e.source === 'topEvent')
    if (topOut.length === 0) {
      return {
        valido: false,
        error: 'El Evento Tope no tiene conexión de salida hacia la línea reactiva (Barreras Reactivas o Consecuencia).',
      }
    }

    // 6. Barreras Reactivas: deben tener al menos 1 entrada y 1 salida
    const mitNodes = currentNodes.filter((n) => n.id.startsWith('mit-'))
    for (const m of mitNodes) {
      const tieneEntrada = currentEdges.some((e) => e.target === m.id)
      const tieneSalida = currentEdges.some((e) => e.source === m.id)
      const tag = m.data?.tag || m.id
      if (!tieneEntrada) {
        return {
          valido: false,
          error: `La Barrera Reactiva "${tag}" no tiene conexión de entrada (debe conectarse desde el Evento Tope o una barrera previa).`,
        }
      }
      if (!tieneSalida) {
        return {
          valido: false,
          error: `La Barrera Reactiva "${tag}" no tiene conexión de salida (debe conectarse hacia otra barrera o hacia la Consecuencia).`,
        }
      }
    }

    // 7. Consecuencia: debe tener conexión de entrada
    const consIn = currentEdges.filter((e) => e.target === 'consequence')
    if (consIn.length === 0) {
      return {
        valido: false,
        error: 'El bloque de Consecuencia no tiene conexión de entrada proveniente del Evento Tope o de una barrera reactiva.',
      }
    }

    // 8. Factores de Escalamiento: deben tener conexión de salida
    const feNodes = currentNodes.filter((n) => n.id.startsWith('fe-'))
    for (const fe of feNodes) {
      const feOut = currentEdges.filter((e) => e.source === fe.id)
      if (feOut.length === 0) {
        const label = fe.data?.label || fe.id
        return {
          valido: false,
          error: `El Factor de Escalamiento "${label}" debe conectarse a un Control de Factor o directamente a la barrera afectada.`,
        }
      }
    }

    // 9. Controles de Factor: deben tener entrada y salida
    const ctrlNodes = currentNodes.filter((n) => n.id.startsWith('ctrl-'))
    for (const ctrl of ctrlNodes) {
      const tieneEntrada = currentEdges.some((e) => e.target === ctrl.id)
      const tieneSalida = currentEdges.some((e) => e.source === ctrl.id)
      const label = ctrl.data?.label || ctrl.id
      if (!tieneEntrada) {
        return {
          valido: false,
          error: `El Control de Factor "${label}" no tiene conexión de entrada proveniente de un factor de escalamiento.`,
        }
      }
      if (!tieneSalida) {
        return {
          valido: false,
          error: `El Control de Factor "${label}" no tiene conexión de salida hacia la barrera o hacia otro control.`,
        }
      }
    }

    return { valido: true }
  }

  // Guardar estado actual del layout y los bloques en la base de datos
  const handleGuardarBowTie = () => {
    if (!bt) return

    // 1. Verificar conexiones de todos los bloques
    const validacion = validarConexionesBowTie(nodes, edges)
    if (!validacion.valido) {
      alert(`⚠️ No se puede guardar el BowTie:\n\n${validacion.error}`)
      return
    }

    // 2. Capturar posiciones actuales de los nodos
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
        ...bt.preventivas
          .filter((p) => nodes.some((n) => n.id === `prev-${p.tag_activo}`))
          .map((p) => ({
            tag_activo: p.tag_activo,
            descripcion: p.descripcion,
            tipo: p.tipo,
            lado: 'PREVENTIVA',
            frr_diseno: p.frr_diseno,
            estado_actual: p.estado_actual,
          })),
        ...bt.mitigativas
          .filter((m) => nodes.some((n) => n.id === `mit-${m.tag_activo}`))
          .map((m) => ({
            tag_activo: m.tag_activo,
            descripcion: m.descripcion,
            tipo: m.tipo,
            lado: 'MITIGATIVA',
            frr_diseno: m.frr_diseno,
            estado_actual: m.estado_actual,
          })),
      ],
      factores_escalamiento: (bt.factores_escalamiento || [])
        .filter((fe, idx) => nodes.some((n) => n.id === `fe-${fe.id || idx}`))
        .map((fe, idx) => ({
          id: fe.id,
          barrera_tag: fe.barrera_tag,
          descripcion: fe.descripcion,
          categoria: fe.categoria,
          controles: (fe.controles || [])
            .filter((c, cIdx) => nodes.some((n) => n.id === `ctrl-${c.id || `${idx}-${cIdx}`}`))
            .map((c) => ({
              id: c.id,
              descripcion: c.descripcion,
              tag_activo: c.tag_activo,
              estado_actual: c.estado_actual,
            })),
        })),
      layout: {
        positions: layoutMap,
        edges: edges.map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          sourceHandle: e.sourceHandle || undefined,
          targetHandle: e.targetHandle || undefined,
          style: e.style || undefined,
          animated: e.animated || false,
          markerEnd: e.markerEnd || undefined,
        })),
      },
    }

    mutacionGuardar.mutate(payload)
  }

  // ==========================================
  // 4. ACCIONES PARA AÑADIR / CONFIGURAR BLOQUES
  // ==========================================
  const abrirModalAgregar = (tipo: string) => {
    if (!bt) return

    if (tipo === 'threat') {
      setBloqueSeleccionado({
        tipo: 'threat',
        causa: bt.causa || 'Falla operacional o pérdida de contención',
        frecuencia: bt.frecuencia_diseno || 'C',
      })
    } else if (tipo === 'prev') {
      setBloqueSeleccionado({
        tipo: 'nuevaBarrera',
        lado: 'PREVENTIVA',
        tag_activo: `SIS-0${bt.preventivas.length + 1}`,
        descripcion: 'Sistema Instrumentado de Seguridad Preventivo',
        frr_diseno: 100,
      })
    } else if (tipo === 'mit') {
      setBloqueSeleccionado({
        tipo: 'nuevaBarrera',
        lado: 'MITIGATIVA',
        tag_activo: `PSV-0${bt.mitigativas.length + 1}`,
        descripcion: 'Válvula de alivio / Sistema de mitigación',
        frr_diseno: 10,
      })
    } else if (tipo === 'consequence') {
      setBloqueSeleccionado({
        tipo: 'consequence',
        consecuencia: bt.consecuencia || 'Impacto a personas e infraestructura',
        impPersonas: bt.imp_personas || 3,
        impAmbiente: bt.imp_ambiente || 2,
        impEconomico: bt.imp_economico || 3,
        impReputacion: bt.imp_reputacion || 2,
      })
    } else if (tipo === 'fe') {
      const todasBarreras = [...bt.preventivas, ...bt.mitigativas].map((b) => b.tag_activo)
      if (todasBarreras.length === 0) {
        alert('Debe existir al menos una barrera en el BowTie para vincular un factor de escalamiento.')
        return
      }
      setBloqueSeleccionado({
        tipo: 'nuevoFactor',
        barrera_tag: todasBarreras[0],
        descripcion: 'Falla en suministro de aire comprimido o energía',
        categoria: 'OPERACIONAL',
        controlesDesc: 'Control de redundancia y suministro de respaldo',
      })
    }
  }

  const handleEjecutarAgregarBloque = () => {
    abrirModalAgregar(tipoBloqueAñadir)
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
                onClick={handleGuardarBowTie}
                disabled={mutacionGuardar.isPending}
                className="btn-primary text-xs px-3.5 py-1.5 shadow flex items-center gap-1.5"
                title="Guardar posiciones y cambios en base de datos"
              >
                <span>💾</span>
                <span>{mutacionGuardar.isPending ? 'Guardando...' : 'Guardar BowTie'}</span>
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
          onNodeDoubleClick={handleNodeDoubleClick}
          onEdgeDoubleClick={handleEdgeDoubleClick}
          edgesFocusable={esAdmin}
          edgesReconnectable={esAdmin}
          deleteKeyCode={esAdmin ? ['Backspace', 'Delete'] : []}
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

        {/* Barra Informativa de Roles y Atajos */}
        <div className="absolute top-3 left-3 bg-white/95 dark:bg-slate-900/95 backdrop-blur border border-slate-200 dark:border-slate-800 px-3 py-1.5 rounded-lg text-xs shadow-sm flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${esAdmin ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`}
          />
          <span className="text-slate-600 dark:text-slate-300">
            {esAdmin
              ? 'Modo Editor: Clic para editar • Doble clic en bloque o conexión para eliminar • Arrastra para conectar'
              : 'Modo Solo Lectura (Inicia sesión como administrador para editar este BowTie)'}
          </span>
        </div>

        {/* Panel de Selección para Agregar Bloques BowTie */}
        <div className="absolute bottom-3 left-3 z-10 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-800 p-3 rounded-xl shadow-xl w-72 text-xs">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-200 dark:border-slate-800">
            <span className="font-bold text-slate-900 dark:text-white uppercase tracking-wider text-[11px] flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-brand-600"></span>
              Agregar Bloques BowTie
            </span>
            {esAdmin ? (
              <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                Admin
              </span>
            ) : (
              <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                Lector
              </span>
            )}
          </div>

          {esAdmin ? (
            <div className="space-y-2.5">
              <div>
                <label htmlFor="select-tipo-bloque" className="text-[10px] text-slate-500 block mb-1">
                  Seleccionar tipo de bloque:
                </label>
                <div className="flex gap-1.5">
                  <select
                    id="select-tipo-bloque"
                    aria-label="Seleccionar tipo de bloque BowTie"
                    value={tipoBloqueAñadir}
                    onChange={(e) => setTipoBloqueAñadir(e.target.value)}
                    className="input text-xs py-1 px-2 flex-1 h-8"
                  >
                    <option value="threat">Amenaza (Threat)</option>
                    <option value="prev">Barrera Preventiva</option>
                    <option value="mit">Barrera Reactiva</option>
                    <option value="consequence">Consecuencia</option>
                    <option value="fe">Factor de Escalamiento</option>
                  </select>
                  <button
                    type="button"
                    onClick={handleEjecutarAgregarBloque}
                    className="btn-primary text-xs px-3 h-8 flex items-center justify-center font-bold"
                    title="Agregar bloque seleccionado"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Botones directos de acceso rápido a los bloques solicitados */}
              <div className="grid grid-cols-2 gap-1.5 pt-1.5 border-t border-slate-100 dark:border-slate-800 text-[10px]">
                <button
                  type="button"
                  onClick={() => abrirModalAgregar('threat')}
                  className="flex items-center gap-1.5 p-1.5 rounded border border-blue-200 dark:border-blue-900 bg-blue-50/60 dark:bg-blue-950/40 text-blue-900 dark:text-blue-200 hover:bg-blue-100 transition-colors text-left"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0"></span>
                  <span className="font-medium truncate">+ Amenaza</span>
                </button>

                <button
                  type="button"
                  onClick={() => abrirModalAgregar('prev')}
                  className="flex items-center gap-1.5 p-1.5 rounded border border-emerald-200 dark:border-emerald-900 bg-emerald-50/60 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 hover:bg-emerald-100 transition-colors text-left"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"></span>
                  <span className="font-medium truncate">+ Barrera Prev.</span>
                </button>

                <button
                  type="button"
                  onClick={() => abrirModalAgregar('mit')}
                  className="flex items-center gap-1.5 p-1.5 rounded border border-teal-200 dark:border-teal-900 bg-teal-50/60 dark:bg-teal-950/40 text-teal-900 dark:text-teal-200 hover:bg-teal-100 transition-colors text-left"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-teal-500 shrink-0"></span>
                  <span className="font-medium truncate">+ Barrera React.</span>
                </button>

                <button
                  type="button"
                  onClick={() => abrirModalAgregar('consequence')}
                  className="flex items-center gap-1.5 p-1.5 rounded border border-rose-200 dark:border-rose-900 bg-rose-50/60 dark:bg-rose-950/40 text-rose-900 dark:text-rose-200 hover:bg-rose-100 transition-colors text-left"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0"></span>
                  <span className="font-medium truncate">+ Consecuencia</span>
                </button>

                <button
                  type="button"
                  onClick={() => abrirModalAgregar('fe')}
                  className="col-span-2 flex items-center gap-1.5 p-1.5 rounded border border-yellow-200 dark:border-yellow-900 bg-yellow-50/60 dark:bg-yellow-950/40 text-yellow-900 dark:text-yellow-200 hover:bg-yellow-100 transition-colors text-left"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 shrink-0"></span>
                  <span className="font-medium truncate">+ Factor de Escalamiento</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="text-[10px] text-slate-500 dark:text-slate-400">
              Inicie sesión como administrador para agregar bloques de Amenaza, Barreras, Consecuencias o Factores de Escalamiento.
            </div>
          )}
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
                {bloqueSeleccionado.tipo === 'nuevaBarrera'
                  ? `Agregar Barrera ${bloqueSeleccionado.lado === 'PREVENTIVA' ? 'Preventiva' : 'Reactiva'}`
                  : bloqueSeleccionado.tipo === 'nuevoFactor'
                  ? 'Agregar Factor de Escalamiento'
                  : `Editar Atributos: ${bloqueSeleccionado.tipo}`}
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
                <div className="space-y-3">
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
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                    <button
                      type="button"
                      className="btn-secondary text-xs w-full py-1.5 text-brand-600 dark:text-brand-400 font-semibold"
                      onClick={() => {
                        const fe = bt.factores_escalamiento?.find(
                          (x) => x.id === bloqueSeleccionado.factor.id
                        )
                        if (fe) {
                          const controles = fe.controles || []
                          const nuevoCtrl = {
                            descripcion: 'Nuevo Control EF (Barrera)',
                            tag_activo: `CTRL-EF-${controles.length + 1}`,
                            estado_actual: 'DISPONIBLE' as const,
                          }
                          fe.controles = [...controles, nuevoCtrl]
                          handleGuardarBowTie()
                          setBloqueSeleccionado(null)
                        }
                      }}
                    >
                      + Interponer Control / Barrera EF
                    </button>
                    <p className="text-[10px] text-slate-500 mt-1 text-center">
                      Inserta un bloque de Control (EF Barrier) entre este Factor y la Barrera principal.
                    </p>
                  </div>
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

              {/* Formulario para Nueva Barrera */}
              {bloqueSeleccionado.tipo === 'nuevaBarrera' && (
                <div className="space-y-3">
                  <div>
                    <label className="label">Lado de la Barrera</label>
                    <select
                      className="input"
                      value={bloqueSeleccionado.lado}
                      onChange={(e) =>
                        setBloqueSeleccionado({
                          ...bloqueSeleccionado,
                          lado: e.target.value as 'PREVENTIVA' | 'MITIGATIVA',
                        })
                      }
                    >
                      <option value="PREVENTIVA">Preventiva (Antes del Evento Tope)</option>
                      <option value="MITIGATIVA">Reactiva / Mitigativa (Después del Evento Tope)</option>
                    </select>
                  </div>
                  <div>
                    <label className="label">TAG Activo</label>
                    <input
                      type="text"
                      className="input font-mono"
                      value={bloqueSeleccionado.tag_activo}
                      onChange={(e) =>
                        setBloqueSeleccionado({
                          ...bloqueSeleccionado,
                          tag_activo: e.target.value.toUpperCase(),
                        })
                      }
                    />
                  </div>
                  <div>
                    <label className="label">Descripción de la Barrera</label>
                    <textarea
                      className="input h-16"
                      value={bloqueSeleccionado.descripcion}
                      onChange={(e) =>
                        setBloqueSeleccionado({
                          ...bloqueSeleccionado,
                          descripcion: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div>
                    <label className="label">Factor de Reducción de Riesgo (FRR Diseño)</label>
                    <select
                      className="input"
                      value={bloqueSeleccionado.frr_diseno}
                      onChange={(e) =>
                        setBloqueSeleccionado({
                          ...bloqueSeleccionado,
                          frr_diseno: Number(e.target.value),
                        })
                      }
                    >
                      <option value={10}>FRR 10 (SIL 1 - RRF 10)</option>
                      <option value={50}>FRR 50 (SIL 1.5 - RRF 50)</option>
                      <option value={100}>FRR 100 (SIL 2 - RRF 100)</option>
                      <option value={1000}>FRR 1000 (SIL 3 - RRF 1000)</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Formulario para Nuevo Factor de Escalamiento */}
              {bloqueSeleccionado.tipo === 'nuevoFactor' && (
                <div className="space-y-3">
                  <div>
                    <label className="label">Barrera Afectada por el Factor</label>
                    <select
                      className="input font-mono"
                      value={bloqueSeleccionado.barrera_tag}
                      onChange={(e) =>
                        setBloqueSeleccionado({
                          ...bloqueSeleccionado,
                          barrera_tag: e.target.value,
                        })
                      }
                    >
                      {[...bt.preventivas, ...bt.mitigativas].map((b) => (
                        <option key={b.tag_activo} value={b.tag_activo}>
                          {b.tag_activo} ({b.lado === 'PREVENTIVA' ? 'Prev.' : 'React.'}) - {b.descripcion.slice(0, 30)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label">Descripción del Factor de Escalamiento</label>
                    <textarea
                      className="input h-16"
                      placeholder="Ej: Falla en suministro de aire comprimido o energía"
                      value={bloqueSeleccionado.descripcion}
                      onChange={(e) =>
                        setBloqueSeleccionado({
                          ...bloqueSeleccionado,
                          descripcion: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div>
                    <label className="label">Categoría</label>
                    <select
                      className="input"
                      value={bloqueSeleccionado.categoria}
                      onChange={(e) =>
                        setBloqueSeleccionado({
                          ...bloqueSeleccionado,
                          categoria: e.target.value,
                        })
                      }
                    >
                      <option value="OPERACIONAL">OPERACIONAL</option>
                      <option value="MECANICO">MECÁNICO / EQUIPO</option>
                      <option value="AMBIENTAL">AMBIENTAL / CLIMÁTICO</option>
                      <option value="HUMANO">FACTOR HUMANO</option>
                    </select>
                  </div>
                  <div>
                    <label className="label">Control del Factor / EF Barrier (Opcional)</label>
                    <input
                      type="text"
                      className="input"
                      placeholder="Ej: Control de redundancia y suministro de respaldo"
                      value={bloqueSeleccionado.controlesDesc}
                      onChange={(e) =>
                        setBloqueSeleccionado({
                          ...bloqueSeleccionado,
                          controlesDesc: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Botones de acción del Modal */}
            <div className="pt-2 flex items-center justify-between gap-2 border-t border-slate-100 dark:border-slate-800">
              {['barrier', 'escalationFactor', 'escalationControl'].includes(bloqueSeleccionado.tipo) && esAdmin ? (
                <button
                  type="button"
                  onClick={() => {
                    let nodeId = ''
                    if (bloqueSeleccionado.tipo === 'barrier') {
                      nodeId = `${bloqueSeleccionado.lado === 'PREVENTIVA' ? 'prev' : 'mit'}-${bloqueSeleccionado.barrera.tag_activo}`
                    } else if (bloqueSeleccionado.tipo === 'escalationFactor') {
                      nodeId = `fe-${bloqueSeleccionado.factor.id}`
                    } else if (bloqueSeleccionado.tipo === 'escalationControl') {
                      nodeId = `ctrl-${bloqueSeleccionado.control.id}`
                    }
                    if (nodeId) handleEliminarNodo(nodeId)
                  }}
                  className="btn-secondary text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
                >
                  🗑️ Eliminar Bloque
                </button>
              ) : (
                <div />
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => setBloqueSeleccionado(null)}
                  className="btn-secondary text-xs"
                >
                  Cerrar
                </button>
                <button
                  onClick={() => {
                    // Aplicar cambios en memoria
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
                    if (s.tipo === 'nuevaBarrera') {
                      const nueva: BarreraEscenario = {
                        barrera_id: 0,
                        tag_activo: s.tag_activo,
                        descripcion: s.descripcion,
                        tipo: 'EXISTENTE',
                        lado: s.lado,
                        frr_diseno: s.frr_diseno,
                        frr_efectivo: s.frr_diseno,
                        estado_actual: 'DISPONIBLE',
                        cuenta_en_diseno: true,
                        vigente: true,
                        vigencia_desde: null,
                        vigencia_hasta: null,
                        moc_ref: null,
                      }
                      if (s.lado === 'PREVENTIVA') {
                        bt.preventivas.push(nueva)
                      } else {
                        bt.mitigativas.push(nueva)
                      }

                      // Agregar nodo a la vista SIN CONEXIONES
                      const bId = `${s.lado === 'PREVENTIVA' ? 'prev' : 'mit'}-${s.tag_activo}`
                      const posNueva = {
                        x: s.lado === 'PREVENTIVA' ? 260 + bt.preventivas.length * 50 : 860 + bt.mitigativas.length * 50,
                        y: 360,
                      }
                      const nuevoNodo: Node = {
                        id: bId,
                        type: s.lado === 'PREVENTIVA' ? 'preventiveBarrierNode' : 'recoveryBarrierNode',
                        position: posNueva,
                        data: {
                          tag: s.tag_activo,
                          desc: s.descripcion,
                          estado: 'DISPONIBLE',
                          frrDiseno: s.frr_diseno,
                          frrEfectivo: s.frr_diseno,
                          onEdit: () =>
                            esAdmin &&
                            setBloqueSeleccionado({
                              tipo: 'barrier',
                              lado: s.lado,
                              barrera: nueva,
                            }),
                        },
                      }
                      setNodes((nds) => [...nds, nuevoNodo])
                      setBloqueSeleccionado(null)
                      alert(`✓ Barrera ${s.lado.toLowerCase()} "${s.tag_activo}" agregada sin conexiones.\n\nConéctala arrastrando una línea desde la Amenaza o barrera anterior, y hacia el Evento Tope o siguiente barrera, luego haz clic en "Guardar BowTie".`)
                      return
                    }
                    if (s.tipo === 'nuevoFactor') {
                      const controles = s.controlesDesc
                        ? [
                            {
                              descripcion: s.controlesDesc,
                              tag_activo: `CTRL-${s.barrera_tag}`,
                              estado_actual: 'DISPONIBLE' as const,
                            },
                          ]
                        : []
                      const nuevo = {
                        barrera_tag: s.barrera_tag,
                        descripcion: s.descripcion,
                        categoria: s.categoria,
                        controles,
                      }
                      if (!bt.factores_escalamiento) bt.factores_escalamiento = []
                      bt.factores_escalamiento.push(nuevo)

                      // Agregar nodo a la vista SIN CONEXIONES
                      const feId = `fe-${Date.now()}`
                      const nuevosNodos: Node[] = [
                        {
                          id: feId,
                          type: 'escalationFactorNode',
                          position: { x: 260, y: 460 },
                          data: {
                            label: s.descripcion,
                            categoria: s.categoria,
                            onEdit: () =>
                              esAdmin &&
                              setBloqueSeleccionado({
                                tipo: 'escalationFactor',
                                factor: nuevo,
                              }),
                          },
                        },
                      ]
                      if (controles.length > 0) {
                        const ctrlId = `ctrl-${Date.now()}`
                        nuevosNodos.push({
                          id: ctrlId,
                          type: 'escalationControlNode',
                          position: { x: 460, y: 460 },
                          data: {
                            label: controles[0].descripcion,
                            tag: controles[0].tag_activo,
                            estado: 'DISPONIBLE',
                            onEdit: () =>
                              esAdmin &&
                              setBloqueSeleccionado({
                                tipo: 'escalationControl',
                                control: controles[0],
                              }),
                          },
                        })
                      }
                      setNodes((nds) => [...nds, ...nuevosNodos])
                      setBloqueSeleccionado(null)
                      alert(`✓ Factor de escalamiento agregado sin conexiones.\n\nConéctalo a su control o barrera y luego haz clic en "Guardar BowTie".`)
                      return
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

                    // Actualizar atributos en los nodos de la vista
                    setNodes((nds) =>
                      nds.map((n) => {
                        if (n.id === 'hazard' && s.tipo === 'hazard') {
                          return { ...n, data: { ...n.data, label: s.valor } }
                        }
                        if (n.id === 'topEvent' && s.tipo === 'topEvent') {
                          return { ...n, data: { ...n.data, label: s.valor } }
                        }
                        if (n.id === 'threat' && s.tipo === 'threat') {
                          return { ...n, data: { ...n.data, label: s.causa, frecuencia: s.frecuencia } }
                        }
                        if (n.id === 'consequence' && s.tipo === 'consequence') {
                          return {
                            ...n,
                            data: {
                              ...n.data,
                              label: s.consecuencia,
                              impPersonas: s.impPersonas,
                              impAmbiente: s.impAmbiente,
                              impEconomico: s.impEconomico,
                              impReputacion: s.impReputacion,
                            },
                          }
                        }
                        if (s.tipo === 'barrier' && (n.id === `prev-${s.barrera?.tag_activo}` || n.id === `mit-${s.barrera?.tag_activo}`)) {
                          return {
                            ...n,
                            data: {
                              ...n.data,
                              desc: s.barrera.descripcion,
                              frrDiseno: s.barrera.frr_diseno,
                              estado: s.barrera.estado_actual,
                            },
                          }
                        }
                        return n
                      })
                    )
                    setBloqueSeleccionado(null)
                  }}
                  className="btn-primary text-xs"
                >
                  Aplicar Cambios
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de confirmación de eliminación de bloque al hacer doble clic */}
      {nodoAEliminar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-red-200 dark:border-red-900 max-w-sm w-full p-5 space-y-4">
            <div className="flex items-center gap-2 text-red-600 dark:text-red-400 font-bold text-sm">
              <span className="text-xl">⚠️</span>
              <h3 className="uppercase tracking-wider">Eliminar Bloque BowTie</h3>
            </div>

            {['hazard', 'topEvent', 'threat', 'consequence'].includes(nodoAEliminar.id) ? (
              <div className="space-y-3 text-xs text-slate-600 dark:text-slate-300">
                <p>
                  El bloque principal <strong>"{String(nodoAEliminar.data?.label || nodoAEliminar.id)}"</strong> es parte del núcleo de la metodología BowTie (Peligro, Evento Tope, Amenaza y Consecuencia) y no puede eliminarse.
                </p>
                <p className="text-[11px] text-slate-400">
                  Puedes modificar su texto o atributos haciendo un solo clic sobre el bloque.
                </p>
                <div className="pt-2 flex justify-end">
                  <button
                    onClick={() => setNodoAEliminar(null)}
                    className="btn-secondary text-xs"
                  >
                    Entendido
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3 text-xs text-slate-600 dark:text-slate-300">
                <p>
                  ¿Deseas eliminar este bloque del diagrama?
                </p>
                <div className="p-2.5 rounded bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-xs">
                  <span className="font-bold text-slate-800 dark:text-slate-100">
                    {String(nodoAEliminar.data?.tag || nodoAEliminar.data?.label || nodoAEliminar.id)}
                  </span>
                  {Boolean(nodoAEliminar.data?.desc) && (
                    <div className="text-[10px] text-slate-500 mt-0.5 line-clamp-2">
                      {String(nodoAEliminar.data?.desc)}
                    </div>
                  )}
                </div>
                <p className="text-[11px] text-amber-600 dark:text-amber-400">
                  ⚡ Se eliminarán también todas las conexiones asociadas a este bloque.
                </p>
                <div className="pt-2 flex justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
                  <button
                    onClick={() => setNodoAEliminar(null)}
                    className="btn-secondary text-xs"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => handleEliminarNodo(nodoAEliminar.id)}
                    className="btn-primary bg-red-600 hover:bg-red-700 text-xs px-3 font-semibold"
                  >
                    🗑️ Sí, Eliminar Bloque
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
