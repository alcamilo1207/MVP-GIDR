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
import type { BowTie, BowTieDesviacion, Estado, BarreraEscenario } from '../lib/types'
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
  const { id, desviacionId } = useParams<{ id?: string; desviacionId?: string }>()
  const esDesviacion = Boolean(desviacionId)
  const targetId = desviacionId || id
  const { usuario } = useAuth()
  const esAdmin = usuario?.rol === 'admin'
  const queryClient = useQueryClient()

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])

  // Modal / Inspector de bloque seleccionado
  const [bloqueSeleccionado, setBloqueSeleccionado] = useState<BloqueSeleccionado | null>(null)

  // Nodo marcado para eliminar (doble clic)
  const [nodoAEliminar, setNodoAEliminar] = useState<{ id: string; label: string } | null>(null)

  // Tipo de bloque a añadir desde el panel de selección inferior izquierdo
  const [tipoBloqueAñadir, setTipoBloqueAñadir] = useState<string>('threat')

  // Consulta de datos completos del BowTie (por Desviación o Escenario)
  const { data: bt, isLoading } = useQuery<BowTie>({
    queryKey: ['bowtie', esDesviacion ? `desv-${targetId}` : targetId],
    queryFn: async () => {
      if (esDesviacion) {
        const desv = await api.get<BowTieDesviacion>(`/bowtie/desviacion/${targetId}`)
        return {
          escenario_id: desv.causas[0]?.escenario_id || 0,
          peligro: desv.peligro,
          evento_tope: desv.evento_tope,
          recomendacion: desv.causas[0]?.recomendacion,
          causa: desv.causas[0]?.causa || '',
          frecuencia_diseno: desv.causas[0]?.frecuencia_diseno || 'C',
          consecuencia: desv.consecuencias[0]?.consecuencia || '',
          ruta: desv.ruta,
          imp_economico: desv.consecuencias[0]?.imp_economico || 3,
          imp_personas: desv.consecuencias[0]?.imp_personas || 3,
          imp_ambiente: desv.consecuencias[0]?.imp_ambiente || 3,
          imp_reputacion: desv.consecuencias[0]?.imp_reputacion || 3,
          preventivas: desv.causas[0]?.barreras_preventivas || [],
          mitigativas: desv.consecuencias[0]?.barreras_mitigativas || [],
          consecuencias: [],
          factores_escalamiento: [],
          resultado: desv.causas[0]?.resultado || null,
          layout: desv.layout,
          desviacion: desv,
        }
      }
      return api.get<BowTie>(`/bowtie/${targetId}`)
    },
  })

  // Mutación para guardar el diagrama completo
  const mutacionGuardar = useMutation<BowTie | BowTieDesviacion, Error, Record<string, unknown>>({
    mutationFn: (payload: Record<string, unknown>) => {
      const desvId = bt?.desviacion?.desviacion_id || (esDesviacion ? targetId : null)
      return desvId
        ? api.put<BowTieDesviacion>(`/bowtie/desviacion/${desvId}`, payload)
        : api.put<BowTie>(`/bowtie/${targetId}`, payload)
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['bowtie', esDesviacion ? `desv-${targetId}` : targetId], (prev: any) => {
        if (esDesviacion) {
          return { ...prev, desviacion: data, layout: (data as any)?.layout || prev?.layout }
        }
        return data
      })
      queryClient.invalidateQueries({ queryKey: ['bowtie'] })
      queryClient.invalidateQueries({ queryKey: ['escenarios-pha'] })
      queryClient.invalidateQueries({ queryKey: ['barreras'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      alert('✓ Diagrama BowTie guardado y riesgo recalculado con éxito.')
    },
    onError: (err: Error) => {
      alert(`Error guardando BowTie: ${err.message}`)
    },
  })

  // Construcción del grafo de 8 bloques unificado para la Desviación completa
  useEffect(() => {
    if (!bt) return

    const desv = bt.desviacion
    const layout = (desv?.layout || bt.layout || {}) as Record<string, { x: number; y: number }>
    const nodeList: Node[] = []
    const edgeList: Edge[] = []

    const causas =
      desv && desv.causas.length > 0
        ? desv.causas
        : [
            {
              escenario_id: bt.escenario_id,
              causa: bt.causa,
              frecuencia_diseno: bt.frecuencia_diseno,
              frecuencia_actual: bt.resultado?.frecuencia_actual || bt.frecuencia_diseno,
              recomendacion: bt.recomendacion,
              riesgo_diseno: bt.resultado?.riesgo_diseno || 'Bajo',
              riesgo_actual: bt.resultado?.riesgo_actual || 'Bajo',
              brecha: bt.resultado?.brecha || 0,
              barreras_preventivas: bt.preventivas,
              factores_escalamiento: bt.factores_escalamiento || [],
              resultado: bt.resultado,
            },
          ]

    const consecuencias =
      desv && desv.consecuencias.length > 0
        ? desv.consecuencias
        : [
            {
              consecuencia: bt.consecuencia,
              severidad_max: Math.max(
                bt.imp_personas,
                bt.imp_ambiente,
                bt.imp_economico,
                bt.imp_reputacion
              ),
              imp_economico: bt.imp_economico,
              imp_personas: bt.imp_personas,
              imp_ambiente: bt.imp_ambiente,
              imp_reputacion: bt.imp_reputacion,
              escenario_ids: [bt.escenario_id],
              barreras_mitigativas: bt.mitigativas,
              factores_escalamiento: bt.factores_escalamiento || [],
            },
          ]

    const nCausas = Math.max(1, causas.length)
    const nCons = Math.max(1, consecuencias.length)
    const maxRamas = Math.max(nCausas, nCons)
    const espaciadoY = 240
    const centerY = Math.max(220, (maxRamas * espaciadoY) / 2)

    // 1. Peligro (Hazard) - Posición superior central
    const peligroLabel = desv ? desv.peligro : bt.peligro
    nodeList.push({
      id: 'hazard',
      type: 'hazardNode',
      position: layout['hazard'] || { x: 570, y: Math.max(20, centerY - 190) },
      data: {
        label: peligroLabel,
        onEdit: () => esAdmin && setBloqueSeleccionado({ tipo: 'hazard', valor: peligroLabel }),
      },
    })

    // 2. Evento Tope (Top Event) - Centro neurálgico
    const eventoLabel = desv ? desv.evento_tope : bt.evento_tope
    const riesgoGlobal = desv ? desv.riesgo_actual_global : bt.resultado?.riesgo_actual || 'Bajo'
    const brechaGlobal = desv ? desv.brecha_maxima : bt.resultado?.brecha || 0
    nodeList.push({
      id: 'topEvent',
      type: 'topEventNode',
      position: layout['topEvent'] || { x: 550, y: centerY },
      data: {
        label: eventoLabel,
        riesgoActual: riesgoGlobal,
        brecha: brechaGlobal,
        onEdit: () => esAdmin && setBloqueSeleccionado({ tipo: 'topEvent', valor: eventoLabel }),
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

    // 3 y 4. Ala Izquierda: Amenazas (Causas) y Barreras Preventivas
    causas.forEach((c, cIdx) => {
      const yCausa = 100 + cIdx * espaciadoY
      const threatId = `threat-${c.escenario_id}`
      nodeList.push({
        id: threatId,
        type: 'threatNode',
        position: layout[threatId] || { x: 50, y: yCausa },
        data: {
          label: c.causa,
          frecuencia: c.frecuencia_diseno,
          onEdit: () =>
            esAdmin &&
            setBloqueSeleccionado({
              tipo: 'threat',
              causa: c.causa,
              frecuencia: c.frecuencia_diseno,
              escenarioId: c.escenario_id,
            }),
        },
      })

      let prevId = threatId
      c.barreras_preventivas.forEach((b, bIdx) => {
        const bId = `prev-${c.escenario_id}-${b.tag_activo}`
        nodeList.push({
          id: bId,
          type: 'preventiveBarrierNode',
          position: layout[bId] || { x: 250 + bIdx * 135, y: yCausa },
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
                escenarioId: c.escenario_id,
              }),
          },
        })

        edgeList.push({
          id: `e-${prevId}-${bId}`,
          source: prevId,
          target: bId,
          animated: b.estado_actual !== 'DISPONIBLE',
          style: {
            stroke: b.estado_actual !== 'DISPONIBLE' ? '#dc2626' : '#10b981',
            strokeWidth: 2,
          },
          markerEnd: { type: MarkerType.ArrowClosed },
        })
        prevId = bId

        // Factores de escalamiento vinculados a esta barrera preventiva
        const fes = c.factores_escalamiento.filter((f) => f.barrera_tag === b.tag_activo)
        fes.forEach((fe, fIdx) => {
          const feId = `fe-${c.escenario_id}-${b.tag_activo}-${fIdx}`
          nodeList.push({
            id: feId,
            type: 'escalationFactorNode',
            position: layout[feId] || { x: 250 + bIdx * 135, y: yCausa + 115 },
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
          edgeList.push({
            id: `e-${feId}-${bId}`,
            source: feId,
            sourceHandle: 'top',
            target: bId,
            targetHandle: 'escalation',
            style: { stroke: '#eab308', strokeDasharray: '4 4', strokeWidth: 2 },
            markerEnd: { type: MarkerType.ArrowClosed },
          })
        })
      })

      // Conectar la última barrera de esta causa al Evento Tope
      edgeList.push({
        id: `e-${prevId}-topEvent`,
        source: prevId,
        target: 'topEvent',
        targetHandle: 'left',
        style: {
          stroke: c.barreras_preventivas.length > 0 ? '#10b981' : '#f97316',
          strokeWidth: 2.5,
          strokeDasharray: c.barreras_preventivas.length === 0 ? '5 5' : undefined,
        },
        markerEnd: { type: MarkerType.ArrowClosed },
      })
    })

    // 5 y 6. Ala Derecha: Barreras Mitigativas y Consecuencias
    consecuencias.forEach((cons, consIdx) => {
      const yCons = 100 + consIdx * espaciadoY
      let prevId = 'topEvent'

      cons.barreras_mitigativas.forEach((b, mIdx) => {
        const bId = `mit-${consIdx}-${b.tag_activo}`
        nodeList.push({
          id: bId,
          type: 'recoveryBarrierNode',
          position: layout[bId] || { x: 860 + mIdx * 135, y: yCons },
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
          id: `e-${prevId}-${bId}`,
          source: prevId,
          sourceHandle: prevId === 'topEvent' ? 'right' : undefined,
          target: bId,
          animated: b.estado_actual !== 'DISPONIBLE',
          style: {
            stroke: b.estado_actual !== 'DISPONIBLE' ? '#dc2626' : '#10b981',
            strokeWidth: 2,
          },
          markerEnd: { type: MarkerType.ArrowClosed },
        })
        prevId = bId

        // Factores de escalamiento vinculados a esta barrera mitigativa
        const fes = cons.factores_escalamiento.filter((f) => f.barrera_tag === b.tag_activo)
        fes.forEach((fe, fIdx) => {
          const feId = `fe-mit-${consIdx}-${b.tag_activo}-${fIdx}`
          nodeList.push({
            id: feId,
            type: 'escalationFactorNode',
            position: layout[feId] || { x: 860 + mIdx * 135, y: yCons + 115 },
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
          edgeList.push({
            id: `e-${feId}-${bId}`,
            source: feId,
            sourceHandle: 'top',
            target: bId,
            targetHandle: 'escalation',
            style: { stroke: '#eab308', strokeDasharray: '4 4', strokeWidth: 2 },
            markerEnd: { type: MarkerType.ArrowClosed },
          })
        })
      })

      // Consecuencia final de esta rama
      const consNodeId = `cons-${consIdx}`
      const numBarrerasMit = cons.barreras_mitigativas.length
      const xCons =
        layout[consNodeId]?.x ||
        (860 + numBarrerasMit * 135 + (numBarrerasMit > 0 ? 30 : 0))
      nodeList.push({
        id: consNodeId,
        type: 'consequenceNode',
        position: layout[consNodeId] || { x: xCons, y: yCons },
        data: {
          label: cons.consecuencia,
          impPersonas: cons.imp_personas,
          impAmbiente: cons.imp_ambiente,
          impEconomico: cons.imp_economico,
          impReputacion: cons.imp_reputacion,
          onEdit: () =>
            esAdmin &&
            setBloqueSeleccionado({
              tipo: 'consequence',
              consecuencia: cons.consecuencia,
              impPersonas: cons.imp_personas,
              impAmbiente: cons.imp_ambiente,
              impEconomico: cons.imp_economico,
              impReputacion: cons.imp_reputacion,
            }),
        },
      })

      edgeList.push({
        id: `e-${prevId}-${consNodeId}`,
        source: prevId,
        sourceHandle: prevId === 'topEvent' ? 'right' : undefined,
        target: consNodeId,
        style: { stroke: '#f43f5e', strokeWidth: 2.5 },
        markerEnd: { type: MarkerType.ArrowClosed },
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
      if (src.startsWith('threat')) {
        return tgt.startsWith('prev-') || tgt === 'topEvent'
      }

      // Regla 3: Barrera Preventiva conecta a otra Barrera Preventiva o a Evento Tope
      if (src.startsWith('prev-')) {
        return tgt.startsWith('prev-') || tgt === 'topEvent'
      }

      // Regla 4: Evento Tope conecta a Barrera Reactiva o Consecuencia
      if (src === 'topEvent') {
        return tgt.startsWith('mit-') || tgt.startsWith('cons-') || tgt === 'consequence'
      }

      // Regla 5: Barrera Reactiva conecta a otra Barrera Reactiva o Consecuencia
      if (src.startsWith('mit-')) {
        return tgt.startsWith('mit-') || tgt.startsWith('cons-') || tgt === 'consequence'
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

    if (bt.desviacion) {
      mutacionGuardar.mutate({
        peligro: bt.desviacion.peligro,
        evento_tope: bt.desviacion.evento_tope,
        layout: layoutMap,
      })
      return
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
          factor_degradacion: p.factor_degradacion ?? 90,
          vigencia_desde: p.vigencia_desde,
          vigencia_hasta: p.vigencia_hasta,
          moc_ref: p.moc_ref,
        })),
        ...bt.mitigativas.map((m) => ({
          tag_activo: m.tag_activo,
          descripcion: m.descripcion,
          tipo: m.tipo,
          lado: 'MITIGATIVA',
          frr_diseno: m.frr_diseno,
          estado_actual: m.estado_actual,
          factor_degradacion: m.factor_degradacion ?? 90,
          vigencia_desde: m.vigencia_desde,
          vigencia_hasta: m.vigencia_hasta,
          moc_ref: m.moc_ref,
        })),
      ],
      factores_escalamiento: (bt.factores_escalamiento || []).map((fe) => ({
        id: fe.id,
        barrera_tag: fe.barrera_tag,
        descripcion: fe.descripcion,
        categoria: fe.categoria,
        controles: (fe.controles || []).map((c) => ({
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
  // 4b. ELIMINAR BLOQUE (doble clic → confirmación)
  // ==========================================
  const handleEliminarNodo = useCallback(
    (nodeId: string) => {
      if (!bt || !esAdmin) return

      // Bloques estructurales no eliminables
      const noEliminables = ['hazard', 'topEvent']
      if (noEliminables.includes(nodeId)) return

      let nuevasPreventivas = bt.preventivas
      let nuevasMitigativas = bt.mitigativas
      let nuevosFactores = bt.factores_escalamiento || []

      if (nodeId.startsWith('prev-')) {
        const tag = nodeId.replace('prev-', '')
        nuevasPreventivas = bt.preventivas.filter((b) => b.tag_activo !== tag)
        // Eliminar factores vinculados a esta barrera
        nuevosFactores = nuevosFactores.filter((fe) => fe.barrera_tag !== tag)
      } else if (nodeId.startsWith('mit-')) {
        const tag = nodeId.replace('mit-', '')
        nuevasMitigativas = bt.mitigativas.filter((b) => b.tag_activo !== tag)
        nuevosFactores = nuevosFactores.filter((fe) => fe.barrera_tag !== tag)
      } else if (nodeId.startsWith('fe-')) {
        const feIdx = nodeId.replace('fe-', '')
        nuevosFactores = nuevosFactores.filter(
          (fe, idx) => String(fe.id ?? idx) !== feIdx
        )
      } else if (nodeId.startsWith('ctrl-')) {
        const ctrlIdStr = nodeId.replace('ctrl-', '')
        nuevosFactores = nuevosFactores.map((fe) => ({
          ...fe,
          controles: (fe.controles || []).filter(
            (c, cIdx) => String(c.id ?? cIdx) !== ctrlIdStr
          ),
        }))
      } else if (nodeId === 'threat') {
        // Threat: vaciar causa
        bt.causa = 'Sin amenaza definida'
        bt.frecuencia_diseno = 'E'
      } else if (nodeId === 'consequence') {
        // Consecuencia: no se elimina, sólo se resetea
        bt.consecuencia = 'Sin consecuencia definida'
        bt.imp_personas = 1
        bt.imp_ambiente = 1
        bt.imp_economico = 1
        bt.imp_reputacion = 1
      }

      bt.preventivas = nuevasPreventivas
      bt.mitigativas = nuevasMitigativas
      bt.factores_escalamiento = nuevosFactores

      setNodoAEliminar(null)
      handleGuardarBowTie()
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bt, esAdmin, nodes]
  )

  // ==========================================
  // 4c. ACCIONES PARA AÑADIR / CONFIGURAR BLOQUES
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
  const desv = bt.desviacion

  const riesgoDiseno = desv ? desv.riesgo_diseno_global : res?.riesgo_diseno || 'Bajo'
  const riesgoActual = desv ? desv.riesgo_actual_global : res?.riesgo_actual || 'Bajo'
  const brechaMax = desv ? desv.brecha_maxima : res?.brecha || 0

  return (
    <div className="space-y-4 flex flex-col h-[calc(100vh-140px)]">
      {/* Barra superior de contexto y acciones */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <Link
              to={`/escenarios?palabra_guia_id=${desv?.desviacion_id || bt.escenario_id}&desviacion_id=${desv?.desviacion_id || bt.escenario_id}`}
              className="px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-brand-700 dark:text-brand-300 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-1.5 transition-colors shadow-xs"
            >
              <span>←</span>
              <span>
                Regresar a Hoja PHA ({desv ? `Desviación: ${desv.palabra_guia}` : `Escenario #${bt.escenario_id}`})
              </span>
            </Link>
            <span className="text-slate-300 dark:text-slate-700">|</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-500/10 text-amber-800 dark:text-amber-300">
              BowTie Unificado por Desviación
            </span>
          </div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-white mt-1">
            BowTie: {desv ? `${desv.palabra_guia} (${desv.nodo})` : bt.causa}
          </h1>
          <div className="text-xs text-slate-500">
            {desv ? desv.ruta : bt.ruta}
            {desv && (
              <span className="ml-2 font-medium text-slate-600 dark:text-slate-400">
                · {desv.causas.length} Amenaza(s) · {desv.consecuencias.length} Consecuencia(s)
              </span>
            )}
          </div>
        </div>

        {/* Resumen del cálculo actual y Botones de Edición */}
        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center gap-3 bg-white dark:bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm text-xs">
            <div>
              <span className="text-slate-400 block text-[9px]">DISEÑO</span>
              <span className={`chip text-[10px] ${NIVEL_CLASES[riesgoDiseno]}`}>
                {riesgoDiseno}
              </span>
            </div>
            <div className="text-slate-400 font-black">➔</div>
            <div>
              <span className="text-slate-400 block text-[9px]">ACTUAL</span>
              <span className={`chip text-[10px] ${NIVEL_CLASES[riesgoActual]}`}>
                {riesgoActual}
              </span>
            </div>
            <div className="pl-2 border-l border-slate-200 dark:border-slate-700">
              <span className="text-slate-400 block text-[9px]">BRECHA MÁX.</span>
              <span
                className={`font-black text-xs ${
                  brechaMax > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600'
                }`}
              >
                {fmtBrecha(brechaMax)}
              </span>
            </div>
          </div>

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
                  {bloqueSeleccionado.barrera.estado_actual === 'DEGRADADO' && (
                    <div>
                      <label className="label">Factor de Degradación (1-100%)</label>
                      <input
                        type="number"
                        min="1"
                        max="100"
                        className="input"
                        value={bloqueSeleccionado.barrera.factor_degradacion ?? 90}
                        onChange={(e) =>
                          setBloqueSeleccionado({
                            ...bloqueSeleccionado,
                            barrera: {
                              ...bloqueSeleccionado.barrera,
                              factor_degradacion: Math.max(
                                1,
                                Math.min(100, Number(e.target.value) || 1)
                              ),
                            },
                          })
                        }
                      />
                    </div>
                  )}
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
            <div className="pt-2 flex justify-between gap-2 border-t border-slate-100 dark:border-slate-800">
              {/* Botón eliminar — solo para bloques eliminables (no hazard ni topEvent ni bloques nuevos) */}
              {!['hazard', 'topEvent', 'nuevaBarrera', 'nuevoFactor'].includes(bloqueSeleccionado.tipo) ? (
                <button
                  type="button"
                  onClick={() => {
                    const s = bloqueSeleccionado
                    let nodeId = ''
                    let label = ''
                    if (s.tipo === 'threat') { nodeId = 'threat'; label = 'Amenaza' }
                    else if (s.tipo === 'consequence') { nodeId = 'consequence'; label = 'Consecuencia' }
                    else if (s.tipo === 'barrier') {
                      nodeId = `${s.lado === 'PREVENTIVA' ? 'prev' : 'mit'}-${s.barrera.tag_activo}`
                      label = `Barrera ${s.lado === 'PREVENTIVA' ? 'Preventiva' : 'Reactiva'}: ${s.barrera.tag_activo}`
                    }
                    else if (s.tipo === 'escalationFactor') {
                      nodeId = `fe-${s.factor.id}`
                      label = `Factor de Escalamiento`
                    }
                    else if (s.tipo === 'escalationControl') {
                      nodeId = `ctrl-${s.control.id}`
                      label = `Control de Factor (EF Barrier)`
                    }
                    if (nodeId) {
                      setBloqueSeleccionado(null)
                      setNodoAEliminar({ id: nodeId, label })
                    }
                  }}
                  className="text-xs px-3 py-1.5 rounded-lg font-semibold border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors flex items-center gap-1"
                >
                  🗑 Eliminar bloque
                </button>
              ) : (
                <span />
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
        </div>
      )}

      {/* ========================================================
          6. MODAL DE CONFIRMACIÓN DE ELIMINACIÓN
          ======================================================== */}
      {nodoAEliminar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl border-2 border-red-500/50 max-w-sm w-full p-5 space-y-4">
            {/* Encabezado */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-950 flex items-center justify-center shrink-0">
                <span className="text-red-600 text-lg font-black">⚠</span>
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Eliminar Bloque
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Esta acción se guardará en la base de datos.
                </p>
              </div>
            </div>

            {/* Detalle del bloque a eliminar */}
            <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2.5 text-xs">
              <span className="text-slate-600 dark:text-slate-300">Bloque seleccionado: </span>
              <span className="font-bold text-red-700 dark:text-red-300">{nodoAEliminar.label}</span>
            </div>

            {/* Advertencias contextuales */}
            {(nodoAEliminar.id.startsWith('prev-') || nodoAEliminar.id.startsWith('mit-')) && (
              <p className="text-[10px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded px-2.5 py-1.5">
                ⚠ Los factores de escalamiento vinculados a esta barrera también serán eliminados.
              </p>
            )}
            {nodoAEliminar.id === 'threat' && (
              <p className="text-[10px] text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded px-2.5 py-1.5">
                ℹ La Amenaza será reemplazada por un valor por defecto (el bloque no se elimina del diagrama).
              </p>
            )}
            {nodoAEliminar.id === 'consequence' && (
              <p className="text-[10px] text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded px-2.5 py-1.5">
                ℹ La Consecuencia será reseteada a valores mínimos (el bloque no se elimina del diagrama).
              </p>
            )}

            {/* Botones */}
            <div className="flex justify-end gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={() => setNodoAEliminar(null)}
                className="btn-secondary text-xs px-4 py-1.5"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleEliminarNodo(nodoAEliminar.id)}
                className="text-xs px-4 py-1.5 rounded-lg font-semibold bg-red-600 hover:bg-red-700 text-white transition-colors"
              >
                🗑 Confirmar Eliminación
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
