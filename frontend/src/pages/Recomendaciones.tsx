import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { Escenario, Pagina, Unidad } from '../lib/types'

interface RecomendacionFila {
  id: number
  nodo_id: number
  nodo: string
  palabra_guia_id: number
  palabra_guia: string
  causa: string
  consecuencia: string
  recomendacion: string
  rec_prioridad: string
  rec_responsable: string
  rec_estado: string
  rec_comentarios: string
  referencia: string
  severidad: number
  likelihood: number
  riesgo_actual_codigo: number
  riesgo_actual_nivel: string
  brecha: number
  modificado: boolean
}

const PRIORIDADES = ['High', 'Medium', 'Low'] as const

const ESTADOS_RECOMENDACION = [
  'Proposed',
  'Pending',
  'Under Review',
  'In Progress',
  'Completed',
  'Implemented',
  'Closed',
  'Removed',
  'Not Applicable',
] as const

const DISCIPLINAS_SUGERIDAS = [
  'Ingeniería de Procesos',
  'Mantenimiento Mecánico',
  'Instrumentación y Control',
  'Operaciones y Producción',
  'Seguridad de Procesos / HSE',
  'Confiabilidad e Inspección',
  'Proyectos de Ingeniería',
]

export const Recomendaciones: React.FC = () => {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const escenarioIdParam = searchParams.get('escenario_id')
    ? Number(searchParams.get('escenario_id'))
    : null
  const [filaEnfocada, setFilaEnfocada] = useState<number | null>(escenarioIdParam)

  const [unidadId, setUnidadId] = useState<number | undefined>()
  const [filtroEstado, setFiltroEstado] = useState<string>('todos')
  const [filtroPrioridad, setFiltroPrioridad] = useState<string>('todos')
  const [busqueda, setBusqueda] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [mensajeGuardado, setMensajeGuardado] = useState<string | null>(null)

  // Diccionario local de edición
  const [borradores, setBorradores] = useState<Record<number, RecomendacionFila>>({})

  const unidades = useQuery({
    queryKey: ['unidades'],
    queryFn: () => api.get<Pagina<Unidad>>('/unidades', { size: 100 }),
  })

  const escenariosQ = useQuery({
    queryKey: ['escenarios-pha', unidadId],
    queryFn: () =>
      api.get<Pagina<Escenario>>('/escenarios', {
        unidad_id: unidadId,
        orden: 'id',
        page: 1,
        size: 500,
      }),
  })

  // Sincronizar borradores al cargar los datos del backend
  useEffect(() => {
    if (!escenariosQ.data?.items) return

    // Generar referencias jerárquicas consistentes (Nodo.Desviacion.Escenario)
    const items = escenariosQ.data.items
    const mapNodoDesv = new Map<string, number>()
    const mapDesvEsc = new Map<string, number>()

    let desvContador = 0
    const filasMap: Record<number, RecomendacionFila> = {}

    items.forEach((esc) => {
      const desvKey = `${esc.nodo_id}::${esc.palabra_guia_id}`
      if (!mapNodoDesv.has(desvKey)) {
        desvContador += 1
        mapNodoDesv.set(desvKey, desvContador)
      }
      const numDesv = mapNodoDesv.get(desvKey)!

      const escKey = `${desvKey}::${esc.id}`
      if (!mapDesvEsc.has(escKey)) {
        const count = (mapDesvEsc.get(desvKey) ?? 0) + 1
        mapDesvEsc.set(desvKey, count)
        mapDesvEsc.set(escKey, count)
      }
      const numCausa = mapDesvEsc.get(escKey)!
      const ref = `1.${numDesv}.${numCausa}`

      const sevMax = Math.max(
        esc.imp_economico || 1,
        esc.imp_personas || 1,
        esc.imp_ambiente || 1,
        esc.imp_reputacion || 1
      )

      // Convertir Frecuencia ('A'..'E') a índice numérico LOPA
      const frecMap: Record<string, number> = { A: 4, B: 3, C: 2, D: 1, E: 0 }
      const lNum = frecMap[esc.frecuencia_diseno] ?? 1

      // Riesgo actual código numérico para la columna RR (0 = Bajo, 1 = Medio, 3 = Alto/Extremo)
      const nivelActual = esc.resultado?.riesgo_actual || 'Bajo'
      let rrCodigo = 0
      if (nivelActual === 'Extremo' || nivelActual === 'Alto') {
        rrCodigo = 3
      } else if (nivelActual === 'Medio') {
        rrCodigo = 1
      } else {
        rrCodigo = 0
      }

      filasMap[esc.id] = {
        id: esc.id,
        nodo_id: esc.nodo_id,
        nodo: esc.nodo,
        palabra_guia_id: esc.palabra_guia_id,
        palabra_guia: esc.palabra_guia,
        causa: esc.causa,
        consecuencia: esc.consecuencia,
        recomendacion:
          esc.recomendacion?.trim() ||
          `Revisar salvaguardas y procedimientos para desviación de ${esc.palabra_guia} (${esc.nodo})`,
        rec_prioridad: esc.rec_prioridad || (rrCodigo >= 3 ? 'High' : 'Medium'),
        rec_responsable: esc.rec_responsable || 'Ingeniería de Procesos',
        rec_estado: esc.rec_estado || 'Proposed',
        rec_comentarios: esc.rec_comentarios || '',
        referencia: ref,
        severidad: sevMax,
        likelihood: lNum,
        riesgo_actual_codigo: rrCodigo,
        riesgo_actual_nivel: nivelActual,
        brecha: esc.resultado?.brecha ?? 0,
        modificado: false,
      }
    })

    setBorradores((prev) => {
      // Preservar ediciones no guardadas
      const next: Record<number, RecomendacionFila> = {}
      for (const [idStr, f] of Object.entries(filasMap)) {
        const id = Number(idStr)
        if (prev[id] && prev[id].modificado) {
          next[id] = { ...f, ...prev[id] }
        } else {
          next[id] = f
        }
      }
      return next
    })
  }, [escenariosQ.data])

  // Desplazamiento y enfoque hacia la recomendación seleccionada desde Escenarios PHA
  useEffect(() => {
    if (escenarioIdParam) {
      setFilaEnfocada(escenarioIdParam)
      const timer = setTimeout(() => {
        const el = document.getElementById(`fila-rec-${escenarioIdParam}`)
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' })
          const textarea = el.querySelector('textarea')
          if (textarea) textarea.focus()
        }
      }, 250)
      return () => clearTimeout(timer)
    }
  }, [escenarioIdParam, borradores])

  // Modificar campo de una recomendación
  const actualizarCampo = (
    id: number,
    campo: keyof Pick<
      RecomendacionFila,
      'recomendacion' | 'rec_prioridad' | 'rec_responsable' | 'rec_estado' | 'rec_comentarios'
    >,
    valor: string
  ) => {
    setBorradores((prev) => {
      const actual = prev[id]
      if (!actual) return prev
      return {
        ...prev,
        [id]: {
          ...actual,
          [campo]: valor,
          modificado: true,
        },
      }
    })
  }

  // Filtrado de filas
  const listaFilas = useMemo(() => {
    let arr = Object.values(borradores)

    if (filtroEstado !== 'todos') {
      arr = arr.filter((f) => f.rec_estado === filtroEstado)
    }

    if (filtroPrioridad !== 'todos') {
      arr = arr.filter((f) => f.rec_prioridad === filtroPrioridad)
    }

    if (busqueda.trim()) {
      const q = busqueda.toLowerCase().trim()
      arr = arr.filter(
        (f) =>
          f.recomendacion.toLowerCase().includes(q) ||
          f.rec_responsable.toLowerCase().includes(q) ||
          f.rec_comentarios.toLowerCase().includes(q) ||
          f.referencia.toLowerCase().includes(q) ||
          f.palabra_guia.toLowerCase().includes(q) ||
          f.nodo.toLowerCase().includes(q)
      )
    }

    // Ordenar por ID para consistencia
    return arr.sort((a, b) => a.id - b.id)
  }, [borradores, filtroEstado, filtroPrioridad, busqueda])

  const filasModificadas = useMemo(
    () => Object.values(borradores).filter((f) => f.modificado),
    [borradores]
  )

  // Guardar cambios masivos en el backend
  const guardarCambios = async () => {
    if (filasModificadas.length === 0) return
    setGuardando(true)
    setMensajeGuardado(null)

    try {
      for (const fila of filasModificadas) {
        // Encontrar escenario original para preservar barreras y factores
        const orig = escenariosQ.data?.items.find((e) => e.id === fila.id)
        if (!orig) continue

        const barrerasPayload = (orig.barreras ?? []).map((b) => ({
          tag_activo: b.tag_activo,
          descripcion: b.descripcion,
          tipo: b.tipo,
          lado: b.lado,
          frr_diseno: b.frr_diseno,
          estado_actual: b.estado_actual,
          factor_degradacion: b.factor_degradacion ?? 90,
          vigencia_desde: b.vigencia_desde ?? null,
          vigencia_hasta: b.vigencia_hasta ?? null,
          moc_ref: b.moc_ref ?? null,
        }))

        const factoresPayload = (orig.factores_escalamiento ?? []).map((f) => ({
          barrera_tag: f.barrera_tag,
          descripcion: f.descripcion,
          categoria: f.categoria || 'Operacional',
          controles: (f.controles ?? []).map((c) => ({
            descripcion: c.descripcion,
            tag_activo: c.tag_activo || null,
            estado_actual: c.estado_actual || 'DISPONIBLE',
          })),
        }))

        await api.put(`/bowtie/${fila.id}`, {
          palabra_guia: orig.palabra_guia,
          causa: orig.causa,
          peligro: orig.peligro,
          evento_tope: orig.evento_tope,
          frecuencia_diseno: orig.frecuencia_diseno,
          consecuencia: orig.consecuencia,
          recomendacion: fila.recomendacion,
          rec_prioridad: fila.rec_prioridad,
          rec_responsable: fila.rec_responsable,
          rec_estado: fila.rec_estado,
          rec_comentarios: fila.rec_comentarios,
          imp_economico: orig.imp_economico,
          imp_personas: orig.imp_personas,
          imp_ambiente: orig.imp_ambiente,
          imp_reputacion: orig.imp_reputacion,
          barreras: barrerasPayload,
          factores_escalamiento: factoresPayload,
        })
      }

      // Marcar todas como no modificadas
      setBorradores((prev) => {
        const next = { ...prev }
        filasModificadas.forEach((f) => {
          if (next[f.id]) {
            next[f.id] = { ...next[f.id], modificado: false }
          }
        })
        return next
      })

      await qc.invalidateQueries({ queryKey: ['escenarios-pha'] })
      setMensajeGuardado(
        `✓ Se guardaron exitosamente los cambios en ${filasModificadas.length} recomendación(es) PHA.`
      )
      setTimeout(() => setMensajeGuardado(null), 5000)
    } catch (err) {
      console.error('Error al guardar recomendaciones:', err)
      alert('Ocurrió un error al guardar los cambios de recomendaciones en el servidor.')
    } finally {
      setGuardando(false)
    }
  }

  // Métricas
  const totalRecs = Object.keys(borradores).length
  const altas = Object.values(borradores).filter((f) => f.rec_prioridad === 'High').length
  const enProgreso = Object.values(borradores).filter(
    (f) => f.rec_estado === 'In Progress' || f.rec_estado === 'Pending'
  ).length
  const cerradas = Object.values(borradores).filter(
    (f) =>
      f.rec_estado === 'Completed' ||
      f.rec_estado === 'Closed' ||
      f.rec_estado === 'Implemented'
  ).length
  const criticos = Object.values(borradores).filter((f) => f.riesgo_actual_codigo >= 3).length

  return (
    <div className="flex flex-col flex-1 p-4 md:p-6 space-y-4 max-w-[1700px] mx-auto w-full">
      {/* Lista de sugerencias para datalist de responsables */}
      <datalist id="disciplinas-sugeridas">
        {DISCIPLINAS_SUGERIDAS.map((d) => (
          <option key={d} value={d} />
        ))}
      </datalist>

      {/* Cabecera y acciones */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl md:text-2xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <span>📋</span> Recomendaciones PHA — Seguimiento de Hallazgos
            </h1>
            <span className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 font-semibold px-2.5 py-0.5 rounded-full">
              PHA-Pro Format
            </span>
          </div>
          <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Matriz editable de recomendaciones vinculada bidireccionalmente a los escenarios HAZOP / LOPA.
          </p>
        </div>

        <div className="flex items-center flex-wrap gap-2">
          <button
            onClick={() => navigate('/escenarios')}
            className="px-3 py-1.5 text-xs font-semibold rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition"
          >
            ← Volver a Escenarios PHA
          </button>

          <button
            onClick={guardarCambios}
            disabled={filasModificadas.length === 0 || guardando}
            className={`px-4 py-1.5 text-xs font-bold rounded-md shadow-sm transition flex items-center gap-1.5 ${
              filasModificadas.length > 0
                ? 'bg-blue-600 hover:bg-blue-700 text-white animate-pulse'
                : 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
            }`}
          >
            <span>💾</span>
            {guardando
              ? 'Guardando cambios...'
              : filasModificadas.length > 0
                ? `Guardar Cambios (${filasModificadas.length})`
                : 'Guardar'}
          </button>
        </div>
      </div>

      {/* Feedback de guardado */}
      {mensajeGuardado && (
        <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 rounded-md text-xs font-medium flex items-center justify-between">
          <span>{mensajeGuardado}</span>
          <button
            onClick={() => setMensajeGuardado(null)}
            className="text-emerald-600 hover:text-emerald-900 font-bold ml-4"
          >
            ✕
          </button>
        </div>
      )}

      {/* Tarjetas métricas rápidas */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700 shadow-xs">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            Total Recomendaciones
          </div>
          <div className="text-xl font-bold text-slate-800 dark:text-slate-100 mt-1">
            {totalRecs}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700 shadow-xs">
          <div className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 uppercase tracking-wider">
            Prioridad Alta (High)
          </div>
          <div className="text-xl font-bold text-rose-600 dark:text-rose-400 mt-1">
            {altas}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700 shadow-xs">
          <div className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
            En Curso / Pendientes
          </div>
          <div className="text-xl font-bold text-amber-600 dark:text-amber-400 mt-1">
            {enProgreso}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700 shadow-xs">
          <div className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
            Cerradas / Listas
          </div>
          <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
            {cerradas}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700 shadow-xs col-span-2 sm:col-span-1">
          <div className="text-[11px] font-semibold text-red-600 dark:text-red-400 uppercase tracking-wider">
            Riesgo Alto (RR ≥ 3)
          </div>
          <div className="text-xl font-bold text-red-600 dark:text-red-400 mt-1">
            {criticos}
          </div>
        </div>
      </div>

      {/* Barra de filtros y búsqueda */}
      <div className="flex flex-wrap items-center gap-3 bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700 shadow-xs text-xs">
        {/* Selector de unidad */}
        <div className="flex items-center gap-2">
          <label className="font-semibold text-slate-600 dark:text-slate-300">Unidad:</label>
          <select
            value={unidadId ?? ''}
            onChange={(e) => setUnidadId(e.target.value ? Number(e.target.value) : undefined)}
            className="border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-900 px-2 py-1 text-slate-700 dark:text-slate-200"
          >
            <option value="">Todas las unidades ({totalRecs})</option>
            {unidades.data?.items.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nombre}
              </option>
            ))}
          </select>
        </div>

        {/* Filtro Prioridad */}
        <div className="flex items-center gap-2">
          <label className="font-semibold text-slate-600 dark:text-slate-300">Prioridad:</label>
          <select
            value={filtroPrioridad}
            onChange={(e) => setFiltroPrioridad(e.target.value)}
            className="border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-900 px-2 py-1 text-slate-700 dark:text-slate-200"
          >
            <option value="todos">Todas las prioridades</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>
        </div>

        {/* Filtro Estado */}
        <div className="flex items-center gap-2">
          <label className="font-semibold text-slate-600 dark:text-slate-300">Estado:</label>
          <select
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value)}
            className="border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-900 px-2 py-1 text-slate-700 dark:text-slate-200"
          >
            <option value="todos">Todos los estados</option>
            {ESTADOS_RECOMENDACION.map((est) => (
              <option key={est} value={est}>
                {est}
              </option>
            ))}
          </select>
        </div>

        {/* Búsqueda */}
        <div className="flex-1 min-w-[220px]">
          <input
            type="text"
            placeholder="Buscar recomendación, responsable, referencia..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="w-full border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-900 px-3 py-1 text-slate-700 dark:text-slate-200 placeholder-slate-400"
          />
        </div>

        {/* Conteo filtrado */}
        <div className="text-slate-500 dark:text-slate-400 ml-auto font-medium">
          Mostrando {listaFilas.length} de {totalRecs}
        </div>
      </div>

      {/* Tabla PHA-Pro de Recomendaciones */}
      <div className="border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 overflow-x-auto shadow-xs">
        <table className="w-full text-xs text-left border-collapse min-w-[1300px]">
          <thead>
            {/* Fila 1 de cabeceras */}
            <tr className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold border-b border-slate-300 dark:border-slate-700">
              <th
                rowSpan={2}
                className="p-2.5 border-r border-slate-300 dark:border-slate-700 text-center w-[40%] min-w-[340px]"
              >
                PHA Recommendation
              </th>
              <th
                rowSpan={2}
                className="p-2.5 border-r border-slate-300 dark:border-slate-700 text-center w-[100px]"
              >
                Priority
              </th>
              <th
                rowSpan={2}
                className="p-2.5 border-r border-slate-300 dark:border-slate-700 text-center w-[160px]"
              >
                Responsible Party
              </th>
              <th
                rowSpan={2}
                className="p-2.5 border-r border-slate-300 dark:border-slate-700 text-center w-[130px]"
              >
                Status
              </th>
              <th
                rowSpan={2}
                className="p-2.5 border-r border-slate-300 dark:border-slate-700 text-center min-w-[180px]"
              >
                Comments
              </th>
              <th
                colSpan={4}
                className="p-2 border-b border-slate-300 dark:border-slate-700 text-center bg-slate-200/70 dark:bg-slate-700/60 font-bold"
              >
                Referenced Locations
              </th>
            </tr>

            {/* Fila 2 de subcabeceras (Referenced Locations) */}
            <tr className="bg-slate-100/90 dark:bg-slate-800/90 text-slate-700 dark:text-slate-200 font-semibold border-b border-slate-300 dark:border-slate-700 text-center">
              <th className="p-2 border-r border-slate-300 dark:border-slate-700 w-[80px]">
                Reference
              </th>
              <th className="p-2 border-r border-slate-300 dark:border-slate-700 w-[45px]" title="Severidad máxima">
                S
              </th>
              <th className="p-2 border-r border-slate-300 dark:border-slate-700 w-[45px]" title="Likelihood / Frecuencia">
                L
              </th>
              <th className="p-2 w-[55px]" title="Risk Ranking (Riesgo Actual)">
                RR
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {listaFilas.length === 0 ? (
              <tr>
                <td colSpan={9} className="p-8 text-center text-slate-400">
                  No se encontraron recomendaciones con los filtros seleccionados.
                </td>
              </tr>
            ) : (
              listaFilas.map((fila, index) => {
                const numeroCorrelativo = index + 1
                const estaModificado = fila.modificado
                const estaEnfocada = filaEnfocada === fila.id

                return (
                  <tr
                    key={fila.id}
                    id={`fila-rec-${fila.id}`}
                    className={`transition-colors ${
                      estaEnfocada
                        ? 'bg-amber-50/90 dark:bg-amber-950/40 ring-2 ring-amber-500 shadow-md'
                        : estaModificado
                          ? 'bg-blue-50/40 dark:bg-blue-950/20'
                          : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    {/* PHA Recommendation: Número + Texto editable */}
                    <td className="p-2 border-r border-slate-200 dark:border-slate-700 align-top">
                      {estaEnfocada && (
                        <div className="flex items-center justify-between text-[10px] font-bold text-amber-800 dark:text-amber-300 bg-amber-200/90 dark:bg-amber-900/60 px-1.5 py-0.5 rounded mb-1.5 animate-pulse">
                          <span>★ Recomendación Seleccionada (Referencia {fila.referencia})</span>
                          <button
                            type="button"
                            onClick={() => setFilaEnfocada(null)}
                            className="text-amber-900 dark:text-amber-200 hover:text-black dark:hover:text-white ml-2 text-xs font-bold"
                            title="Quitar resaltado"
                          >
                            ✕
                          </button>
                        </div>
                      )}
                      <div className="flex items-start gap-2">
                        <span className="font-bold text-slate-500 dark:text-slate-400 select-none pt-1 min-w-[20px] text-right">
                          {numeroCorrelativo}
                        </span>
                        <div className="flex-1">
                          <textarea
                            value={fila.recomendacion}
                            onChange={(e) =>
                              actualizarCampo(fila.id, 'recomendacion', e.target.value)
                            }
                            rows={2}
                            placeholder="Describir acción o recomendación preventiva/correctiva..."
                            className="w-full text-xs p-1.5 rounded border border-transparent hover:border-slate-300 focus:border-blue-500 focus:bg-white dark:focus:bg-slate-900 bg-transparent resize-y text-slate-800 dark:text-slate-100 transition"
                          />
                          <div className="text-[10px] text-slate-400 dark:text-slate-500 px-1 truncate">
                            {fila.nodo} · {fila.palabra_guia}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Priority: Dropdown select */}
                    <td className="p-2 border-r border-slate-200 dark:border-slate-700 align-middle text-center">
                      <select
                        value={fila.rec_prioridad}
                        onChange={(e) =>
                          actualizarCampo(fila.id, 'rec_prioridad', e.target.value)
                        }
                        className={`w-full text-xs p-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-center font-medium ${
                          fila.rec_prioridad === 'High'
                            ? 'text-rose-600 font-bold'
                            : fila.rec_prioridad === 'Medium'
                              ? 'text-amber-600 font-semibold'
                              : 'text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {PRIORIDADES.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                    </td>

                    {/* Responsible Party: Texto editable con datalist de sugerencias */}
                    <td className="p-2 border-r border-slate-200 dark:border-slate-700 align-middle">
                      <input
                        type="text"
                        list="disciplinas-sugeridas"
                        value={fila.rec_responsable}
                        onChange={(e) =>
                          actualizarCampo(fila.id, 'rec_responsable', e.target.value)
                        }
                        placeholder="Responsable / Disciplina..."
                        className="w-full text-xs p-1.5 rounded border border-transparent hover:border-slate-300 focus:border-blue-500 focus:bg-white dark:focus:bg-slate-900 bg-transparent text-slate-800 dark:text-slate-200 transition"
                      />
                    </td>

                    {/* Status: Dropdown select estándar PHA-Pro */}
                    <td className="p-2 border-r border-slate-200 dark:border-slate-700 align-middle text-center">
                      <select
                        value={fila.rec_estado}
                        onChange={(e) =>
                          actualizarCampo(fila.id, 'rec_estado', e.target.value)
                        }
                        className="w-full text-xs p-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200"
                      >
                        {ESTADOS_RECOMENDACION.map((est) => (
                          <option key={est} value={est}>
                            {est}
                          </option>
                        ))}
                      </select>
                    </td>

                    {/* Comments: Texto o notas editables */}
                    <td className="p-2 border-r border-slate-200 dark:border-slate-700 align-middle">
                      <input
                        type="text"
                        value={fila.rec_comentarios}
                        onChange={(e) =>
                          actualizarCampo(fila.id, 'rec_comentarios', e.target.value)
                        }
                        placeholder="Comentarios o notas de seguimiento..."
                        className="w-full text-xs p-1.5 rounded border border-transparent hover:border-slate-300 focus:border-blue-500 focus:bg-white dark:focus:bg-slate-900 bg-transparent text-slate-700 dark:text-slate-300 transition"
                      />
                    </td>

                    {/* Reference: Enlace al escenario en la hoja de trabajo */}
                    <td className="p-2 border-r border-slate-200 dark:border-slate-700 align-middle text-center font-mono font-medium">
                      <Link
                        to={`/escenarios?escenario_id=${fila.id}`}
                        title={`Ir a Escenario ${fila.referencia} en la hoja PHA`}
                        className="text-blue-600 dark:text-blue-400 hover:underline hover:text-blue-800 font-semibold"
                      >
                        {fila.referencia}
                      </Link>
                    </td>

                    {/* S: Severidad */}
                    <td className="p-2 border-r border-slate-200 dark:border-slate-700 align-middle text-center font-mono font-semibold text-slate-700 dark:text-slate-300">
                      {fila.severidad}
                    </td>

                    {/* L: Likelihood */}
                    <td className="p-2 border-r border-slate-200 dark:border-slate-700 align-middle text-center font-mono font-semibold text-slate-700 dark:text-slate-300">
                      {fila.likelihood}
                    </td>

                    {/* RR: Risk Ranking estilizado idéntico al bloque PHA-Pro */}
                    <td
                      className={`p-2 align-middle text-center font-bold text-xs select-none ${
                        fila.riesgo_actual_codigo >= 3
                          ? 'bg-[#ef4444] text-white'
                          : fila.riesgo_actual_codigo === 1
                            ? 'bg-[#eab308] text-slate-900'
                            : 'bg-[#22c55e] text-slate-900 font-black'
                      }`}
                      title={`Riesgo Actual: ${fila.riesgo_actual_nivel} (Código ${fila.riesgo_actual_codigo})`}
                    >
                      {fila.riesgo_actual_codigo}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pie de tabla explicativo */}
      <div className="flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 dark:text-slate-400 pt-2 px-1">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-xs bg-[#22c55e] inline-block"></span> 0 = Bajo
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-xs bg-[#eab308] inline-block"></span> 1 = Medio
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-xs bg-[#ef4444] inline-block"></span> 3 = Alto / Extremo
          </span>
        </div>
        <div className="mt-2 sm:mt-0">
          Haz clic sobre el código de <strong>Reference</strong> para inspeccionar el escenario en la Hoja HAZOP.
        </div>
      </div>
    </div>
  )
}
export default Recomendaciones
