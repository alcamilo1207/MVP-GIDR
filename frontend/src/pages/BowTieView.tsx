import React, { useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ReactFlow,
  Background,
  Controls,
  MarkerType,
  Handle,
  Position,
  type Node,
  type Edge,
} from '@xyflow/react'
import { api } from '../lib/api'
import type { BowTie, Estado } from '../lib/types'
import { ESTADO_CLASES, ESTADO_ETIQUETA, NIVEL_CLASES, fmtBrecha, fmtFrr } from '../lib/format'

// Nodos personalizados para React Flow
const CustomCausaNode = ({ data }: { data: { label: string; sub: string } }) => (
  <div className="px-4 py-3 shadow-md rounded-lg bg-indigo-50 border-2 border-indigo-400 dark:bg-slate-900 dark:border-indigo-500 w-56 text-left">
    <div className="text-[10px] uppercase font-bold tracking-wider text-indigo-700 dark:text-indigo-400">Causa Raíz</div>
    <div className="font-semibold text-xs text-slate-800 dark:text-slate-100 mt-0.5 line-clamp-3">{data.label}</div>
    <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">{data.sub}</div>
    <Handle type="source" position={Position.Right} className="w-2.5 h-2.5 !bg-indigo-500" />
  </div>
)

const CustomEventoNode = ({ data }: { data: { label: string; riesgoActual: string; brecha: number } }) => (
  <div className="px-5 py-4 shadow-xl rounded-xl bg-slate-900 border-2 border-amber-500 text-white w-64 text-center ring-4 ring-amber-500/20">
    <Handle type="target" position={Position.Left} className="w-2.5 h-2.5 !bg-amber-400" />
    <div className="text-[10px] uppercase font-extrabold tracking-widest text-amber-400">Evento Tope (Pérdida de Contención)</div>
    <div className="font-bold text-sm mt-1 leading-snug">{data.label}</div>
    <div className="mt-3 flex items-center justify-center gap-2">
      <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 border border-slate-700">
        Riesgo: <strong>{data.riesgoActual}</strong>
      </span>
      {data.brecha > 0 && (
        <span className="text-[10px] px-2 py-0.5 rounded bg-red-600 text-white font-black animate-pulse">
          Brecha +{data.brecha}
        </span>
      )}
    </div>
    <Handle type="source" position={Position.Right} className="w-2.5 h-2.5 !bg-amber-400" />
  </div>
)

const CustomBarreraNode = ({ data }: { data: { tag: string; desc: string; estado: Estado; frrDiseno: number; frrEfectivo: number; tipo: string } }) => {
  const esDegradada = data.estado !== 'DISPONIBLE'
  return (
    <div
      className={`px-3 py-2.5 shadow-md rounded-lg border-2 w-52 text-left bg-white dark:bg-slate-900 transition-all ${
        esDegradada ? 'border-red-500 ring-2 ring-red-500/20' : 'border-emerald-500'
      }`}
    >
      <Handle type="target" position={Position.Left} className="w-2 h-2 !bg-slate-400" />
      <div className="flex items-center justify-between gap-1">
        <span className="font-mono text-xs font-bold text-slate-800 dark:text-slate-100">{data.tag}</span>
        <span className={`chip text-[9px] ${ESTADO_CLASES[data.estado as keyof typeof ESTADO_CLASES]}`}>
          {ESTADO_ETIQUETA[data.estado as keyof typeof ESTADO_ETIQUETA]}
        </span>
      </div>
      <div className="text-[11px] text-slate-600 dark:text-slate-300 mt-1 line-clamp-2 leading-tight">
        {data.desc}
      </div>
      <div className="mt-2 pt-1.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[10px] text-slate-500 font-mono">
        <span>FRR: {fmtFrr(data.frrDiseno)}</span>
        <span>➔ Efectivo: <strong className={esDegradada ? 'text-red-600' : 'text-emerald-600'}>{fmtFrr(data.frrEfectivo)}</strong></span>
      </div>
      <Handle type="source" position={Position.Right} className="w-2 h-2 !bg-slate-400" />
    </div>
  )
}

const CustomConsecuenciaNode = ({ data }: { data: { label: string; cat: string; nivel: number } }) => (
  <div className="px-4 py-3 shadow-md rounded-lg bg-rose-50 border-2 border-rose-400 dark:bg-slate-900 dark:border-rose-500 w-56 text-left">
    <Handle type="target" position={Position.Left} className="w-2.5 h-2.5 !bg-rose-500" />
    <div className="flex justify-between items-center">
      <span className="text-[10px] uppercase font-bold tracking-wider text-rose-700 dark:text-rose-400">Impacto {data.cat}</span>
      <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-rose-200 dark:bg-rose-900 text-rose-800 dark:text-rose-200">
        Nivel {data.nivel}/5
      </span>
    </div>
    <div className="font-medium text-xs text-slate-800 dark:text-slate-100 mt-1 line-clamp-3">{data.label}</div>
  </div>
)

const nodeTypes = {
  causaNode: CustomCausaNode,
  eventoNode: CustomEventoNode,
  barreraNode: CustomBarreraNode,
  consecuenciaNode: CustomConsecuenciaNode,
}

export const BowTieView: React.FC = () => {
  const { id } = useParams<{ id: string }>()

  const { data: bt, isLoading } = useQuery<BowTie>({
    queryKey: ['bowtie', id],
    queryFn: () => api.get<BowTie>(`/bowtie/${id}`),
  })

  // Generación de Nodos y Conexiones para React Flow
  const { nodes, edges } = useMemo(() => {
    if (!bt) return { nodes: [], edges: [] }

    const nodesList: Node[] = []
    const edgesList: Edge[] = []

    // 1. Nodo Causa Raíz (X = 50, Y = 200)
    nodesList.push({
      id: 'causa',
      type: 'causaNode',
      position: { x: 50, y: 180 },
      data: { label: bt.causa, sub: bt.ruta },
    })

    // 2. Nodo Evento Tope Central (X = 650, Y = 180)
    nodesList.push({
      id: 'evento',
      type: 'eventoNode',
      position: { x: 620, y: 170 },
      data: {
        label: bt.evento_tope,
        riesgoActual: bt.resultado?.riesgo_actual || 'Bajo',
        brecha: bt.resultado?.brecha || 0,
      },
    })

    // 3. Barreras Preventivas (Columna intermedia izquierda X = 350)
    const totalPrev = bt.preventivas.length || 1
    bt.preventivas.forEach((b, idx) => {
      const yPos = 50 + idx * 110 - ((totalPrev - 1) * 110) / 2 + 130
      const bId = `prev-${b.barrera_id}`
      nodesList.push({
        id: bId,
        type: 'barreraNode',
        position: { x: 340, y: yPos },
        data: {
          tag: b.tag_activo,
          desc: b.descripcion,
          estado: b.estado_actual,
          frrDiseno: b.frr_diseno,
          frrEfectivo: b.frr_efectivo,
          tipo: b.tipo,
        },
      })
      // Causa -> Barrera Preventiva
      edgesList.push({
        id: `e-causa-${bId}`,
        source: 'causa',
        target: bId,
        animated: b.estado_actual !== 'DISPONIBLE',
        style: { stroke: b.estado_actual !== 'DISPONIBLE' ? '#dc2626' : '#10b981', strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed },
      })
      // Barrera Preventiva -> Evento Tope
      edgesList.push({
        id: `e-${bId}-evento`,
        source: bId,
        target: 'evento',
        animated: b.estado_actual !== 'DISPONIBLE',
        style: { stroke: b.estado_actual !== 'DISPONIBLE' ? '#dc2626' : '#10b981', strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed },
      })
    })

    if (bt.preventivas.length === 0) {
      edgesList.push({
        id: 'e-causa-evento',
        source: 'causa',
        target: 'evento',
        style: { stroke: '#dc2626', strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed },
      })
    }

    // 4. Barreras Mitigativas (Columna intermedia derecha X = 950)
    const totalMit = bt.mitigativas.length || 1
    bt.mitigativas.forEach((b, idx) => {
      const yPos = 50 + idx * 110 - ((totalMit - 1) * 110) / 2 + 130
      const bId = `mit-${b.barrera_id}`
      nodesList.push({
        id: bId,
        type: 'barreraNode',
        position: { x: 940, y: yPos },
        data: {
          tag: b.tag_activo,
          desc: b.descripcion,
          estado: b.estado_actual,
          frrDiseno: b.frr_diseno,
          frrEfectivo: b.frr_efectivo,
          tipo: b.tipo,
        },
      })
      // Evento Tope -> Barrera Mitigativa
      edgesList.push({
        id: `e-evento-${bId}`,
        source: 'evento',
        target: bId,
        animated: b.estado_actual !== 'DISPONIBLE',
        style: { stroke: b.estado_actual !== 'DISPONIBLE' ? '#dc2626' : '#10b981', strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed },
      })
    })

    // 5. Nodos Consecuencias (Extremo derecho X = 1250)
    const totalCons = bt.consecuencias.length || 1
    bt.consecuencias.forEach((c, idx) => {
      const yPos = 50 + idx * 110 - ((totalCons - 1) * 110) / 2 + 130
      const cId = `cons-${idx}`
      nodesList.push({
        id: cId,
        type: 'consecuenciaNode',
        position: { x: 1220, y: yPos },
        data: { label: c.texto, cat: c.categoria, nivel: c.nivel },
      })

      if (bt.mitigativas.length > 0) {
        bt.mitigativas.forEach((b) => {
          edgesList.push({
            id: `e-mit-${b.barrera_id}-${cId}`,
            source: `mit-${b.barrera_id}`,
            target: cId,
            style: { stroke: '#94a3b8', strokeWidth: 1.5 },
            markerEnd: { type: MarkerType.ArrowClosed },
          })
        })
      } else {
        edgesList.push({
          id: `e-evento-${cId}`,
          source: 'evento',
          target: cId,
          style: { stroke: '#dc2626', strokeWidth: 2 },
          markerEnd: { type: MarkerType.ArrowClosed },
        })
      }
    })

    return { nodes: nodesList, edges: edgesList }
  }, [bt])

  if (isLoading || !bt) {
    return <div className="p-8 text-center text-slate-500">Cargando diagrama BowTie...</div>
  }

  const res = bt.resultado

  return (
    <div className="space-y-4 flex flex-col h-[calc(100vh-140px)]">
      {/* Barra superior de contexto */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <Link to="/escenarios" className="text-xs text-brand-600 hover:underline">
              ← Volver a Escenarios
            </Link>
            <span className="text-slate-300 dark:text-slate-700">|</span>
            <span className="text-xs text-slate-500 font-mono">Escenario #{bt.escenario_id}</span>
          </div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-white mt-1">
            BowTie Dinámico: {bt.causa}
          </h1>
          <div className="text-xs text-slate-500">{bt.ruta}</div>
        </div>

        {/* Resumen del cálculo actual */}
        {res && (
          <div className="flex items-center gap-3 bg-white dark:bg-slate-900 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm text-xs">
            <div>
              <span className="text-slate-400 block text-[10px]">DISEÑO</span>
              <span className={`chip ${NIVEL_CLASES[res.riesgo_diseno]}`}>
                {res.riesgo_diseno} ({res.frecuencia_diseno_resid})
              </span>
            </div>
            <div className="text-slate-400 font-black">➔</div>
            <div>
              <span className="text-slate-400 block text-[10px]">ACTUAL</span>
              <span className={`chip ${NIVEL_CLASES[res.riesgo_actual]}`}>
                {res.riesgo_actual} ({res.frecuencia_actual})
              </span>
            </div>
            <div className="pl-2 border-l border-slate-200 dark:border-slate-700">
              <span className="text-slate-400 block text-[10px]">BRECHA</span>
              <span
                className={`font-black text-sm ${
                  res.brecha > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600'
                }`}
              >
                {fmtBrecha(res.brecha)}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Contenedor del Diagrama React Flow */}
      <div className="flex-1 w-full bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden relative shadow-inner">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.2}
          maxZoom={1.5}
        >
          <Background color="#94a3b8" gap={16} size={1} />
          <Controls />
        </ReactFlow>

        {/* Leyenda flotante */}
        <div className="absolute bottom-3 left-3 bg-white/90 dark:bg-slate-900/90 backdrop-blur border border-slate-200 dark:border-slate-800 p-2.5 rounded-lg text-[10px] space-y-1 shadow-md">
          <div className="font-bold text-slate-700 dark:text-slate-300">Leyenda BowTie:</div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <span>Barrera Disponible (100% FRR crédito)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
            <span>Barrera Degradada/Fuera de Servicio (Brecha)</span>
          </div>
        </div>
      </div>
    </div>
  )
}
