import React, { useState, useMemo, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import type { ResumenDashboard, Sitio, Unidad, Escenario, Pagina, Nivel } from '../lib/types'
import { NIVEL_CLASES } from '../lib/format'
import {
  ConfigMatrizRiesgo,
  obtenerConfigMatriz,
  obtenerNivelCelda,
  obtenerEstilosResaltado,
  EVENTO_CONFIG_CAMBIADA,
} from '../lib/configMatriz'

export type TipoRiesgoDimension = 'personas' | 'economico' | 'ambiente' | 'reputacion' | 'global'

interface DimensionConfig {
  id: TipoRiesgoDimension
  nombre: string
  nombreCorto: string
  subtitulo: string
  icono: string
  severidadKey?: 'imp_personas' | 'imp_economico' | 'imp_ambiente' | 'imp_reputacion'
}

const DIMENSIONES_RIESGO: DimensionConfig[] = [
  {
    id: 'global',
    nombre: 'Riesgo Global Consolidado',
    nombreCorto: 'Global',
    subtitulo: 'Máximo impacto entre las cuatro dimensiones (HAZOP/LOPA)',
    icono: '🌐',
  },
  {
    id: 'personas',
    nombre: 'Personas (Seguridad y Salud)',
    nombreCorto: 'Personas',
    subtitulo: 'Impacto en operadores, personal técnico y contratistas',
    icono: '👥',
    severidadKey: 'imp_personas',
  },
  {
    id: 'economico',
    nombre: 'Económico (Pérdidas y Daños)',
    nombreCorto: 'Económico',
    subtitulo: 'Daño a equipos, reemplazos y pérdida de producción',
    icono: '💰',
    severidadKey: 'imp_economico',
  },
  {
    id: 'ambiente',
    nombre: 'Ambiental (Emisiones y Derrames)',
    nombreCorto: 'Ambiental',
    subtitulo: 'Afectación al suelo, agua superficial o atmósfera',
    icono: '🌿',
    severidadKey: 'imp_ambiente',
  },
  {
    id: 'reputacion',
    nombre: 'Reputación (Imagen y Regulatorio)',
    nombreCorto: 'Reputación',
    subtitulo: 'Sanciones legales, multas y atención mediática',
    icono: '🏛️',
    severidadKey: 'imp_reputacion',
  },
]

function nivelScore(n: string | undefined): number {
  switch (n) {
    case 'Extremo':
      return 4
    case 'Alto':
      return 3
    case 'Medio':
      return 2
    case 'Bajo':
      return 1
    default:
      return 0
  }
}

export const Dashboard: React.FC = () => {
  const [siteId, setSiteId] = useState<number | undefined>(undefined)
  const [unidadId, setUnidadId] = useState<number | undefined>(undefined)
  const [dimensionActiva, setDimensionActiva] = useState<TipoRiesgoDimension>('global')
  const [configMatriz, setConfigMatriz] = useState<ConfigMatrizRiesgo>(obtenerConfigMatriz())
  const [celdaFiltro, setCeldaFiltro] = useState<{ frec: string; sev: number } | null>(null)
  const [modoCuadricula, setModoCuadricula] = useState(false)

  // Sincronizar cambios guardados en la página de Configuración
  useEffect(() => {
    const handler = () => {
      setConfigMatriz(obtenerConfigMatriz())
    }
    window.addEventListener(EVENTO_CONFIG_CAMBIADA, handler)
    window.addEventListener('storage', handler)
    return () => {
      window.removeEventListener(EVENTO_CONFIG_CAMBIADA, handler)
      window.removeEventListener('storage', handler)
    }
  }, [])

  const { data: sitios } = useQuery({
    queryKey: ['sitios'],
    queryFn: () => api.get<{ items: Sitio[] }>('/sites').then((r) => r.items),
  })

  const { data: unidades } = useQuery({
    queryKey: ['unidades', siteId],
    queryFn: () => api.get<{ items: Unidad[] }>('/unidades', { site_id: siteId }).then((r) => r.items),
  })

  const { data: resumen, isLoading } = useQuery<ResumenDashboard>({
    queryKey: ['dashboard', siteId, unidadId],
    queryFn: () => api.get<ResumenDashboard>('/dashboard/resumen', { site_id: siteId, unidad_id: unidadId }),
    refetchInterval: 10000,
  })

  // Consulta de escenarios para calcular las matrices independientes por dimensión
  const { data: escenariosData } = useQuery({
    queryKey: ['escenarios-codigos'],
    queryFn: () =>
      api.get<Pagina<Escenario>>('/escenarios', {
        page: 1,
        size: 200,
        orden: 'id',
      }),
  })

  // Mapeo jerárquico consistente con Escenarios PHA (1.1, 1.2.1.1...)
  const codigoEscenarioMap = useMemo(() => {
    const map = new Map<number, { numDesv: string; numCons: string; numCausa: string }>()
    if (!escenariosData?.items) return map

    const mapDesv = new Map<string, { consecuenciasMap: Map<string, Escenario[]> }>()
    for (const esc of escenariosData.items) {
      const desvKey = `${esc.nodo_id}::${esc.palabra_guia_id}`
      if (!mapDesv.has(desvKey)) {
        mapDesv.set(desvKey, { consecuenciasMap: new Map() })
      }
      const g = mapDesv.get(desvKey)!
      const consKey = `${esc.nodo_id}::${esc.palabra_guia_id}::${esc.consecuencia?.trim() || ''}`
      if (!g.consecuenciasMap.has(consKey)) {
        g.consecuenciasMap.set(consKey, [])
      }
      g.consecuenciasMap.get(consKey)!.push(esc)
    }

    let dIdx = 0
    for (const d of mapDesv.values()) {
      const numDesv = `1.${dIdx + 1}`
      let cIdx = 0
      for (const causas of d.consecuenciasMap.values()) {
        const numCons = `${numDesv}.${cIdx + 1}`
        causas.forEach((c, kIdx) => {
          const numCausa = `${numCons}.${kIdx + 1}`
          map.set(c.id, { numDesv, numCons, numCausa })
        })
        cIdx++
      }
      dIdx++
    }
    return map
  }, [escenariosData])

  // Procesamiento y cálculo de matrices de riesgo por cada dimensión independiente
  const matricesPorDimension = useMemo(() => {
    const escenarios = escenariosData?.items || []

    const resultado: Record<
      TipoRiesgoDimension,
      {
        celdas: Record<string, { actual: number; diseno: number; nivel: Nivel; escenarios: Escenario[] }>
        escenariosEvaluados: Array<{
          id: number
          causa: string
          unidad: string
          nodo: string
          frecAct: string
          frecDis: string
          sev: number
          riesgoActual: Nivel
          riesgoDiseno: Nivel
          brecha: number
          codigo?: { numDesv: string; numCons: string; numCausa: string }
        }>
        totalCriticos: number
      }
    > = {
      personas: { celdas: {}, escenariosEvaluados: [], totalCriticos: 0 },
      economico: { celdas: {}, escenariosEvaluados: [], totalCriticos: 0 },
      ambiente: { celdas: {}, escenariosEvaluados: [], totalCriticos: 0 },
      reputacion: { celdas: {}, escenariosEvaluados: [], totalCriticos: 0 },
      global: { celdas: {}, escenariosEvaluados: [], totalCriticos: 0 },
    }

    // Inicializar celdas para cada dimensión
    DIMENSIONES_RIESGO.forEach((dim) => {
      configMatriz.severidades.forEach((s) => {
        configMatriz.frecuencias.forEach((f) => {
          const clave = `${f.codigo}-${s.num}`
          const nivel = obtenerNivelCelda(f.codigo, s.num, configMatriz)
          resultado[dim.id].celdas[clave] = {
            actual: 0,
            diseno: 0,
            nivel,
            escenarios: [],
          }
        })
      })
    })

    // Evaluar cada escenario en cada dimensión
    for (const esc of escenarios) {
      const frecDis = esc.resultado?.frecuencia_diseno_resid || esc.frecuencia_diseno || 'E'
      const frecAct = esc.resultado?.frecuencia_actual || esc.frecuencia_diseno || 'E'
      const cod = codigoEscenarioMap.get(esc.id)

      DIMENSIONES_RIESGO.forEach((dim) => {
        let sev = 1
        if (dim.id === 'global') {
          sev = Math.max(esc.imp_personas || 1, esc.imp_economico || 1, esc.imp_ambiente || 1, esc.imp_reputacion || 1)
        } else if (dim.severidadKey) {
          sev = esc[dim.severidadKey] || 1
        }

        const riesgoDiseno =
          (dim.id !== 'global' && esc.riesgo_diseno_imp?.[dim.id]) ||
          obtenerNivelCelda(frecDis, sev, configMatriz)

        const riesgoActual =
          (dim.id !== 'global' && esc.riesgo_actual_imp?.[dim.id]) ||
          obtenerNivelCelda(frecAct, sev, configMatriz)

        const brecha = Math.max(0, nivelScore(riesgoActual) - nivelScore(riesgoDiseno))

        const claveActual = `${frecAct}-${sev}`
        const claveDiseno = `${frecDis}-${sev}`

        if (resultado[dim.id].celdas[claveActual]) {
          resultado[dim.id].celdas[claveActual].actual += 1
          resultado[dim.id].celdas[claveActual].escenarios.push(esc)
        }
        if (resultado[dim.id].celdas[claveDiseno]) {
          resultado[dim.id].celdas[claveDiseno].diseno += 1
        }

        resultado[dim.id].escenariosEvaluados.push({
          id: esc.id,
          causa: esc.causa,
          unidad: esc.unidad,
          nodo: esc.nodo,
          frecAct,
          frecDis,
          sev,
          riesgoActual,
          riesgoDiseno,
          brecha,
          codigo: cod,
        })

        if (riesgoActual === 'Extremo' || riesgoActual === 'Alto' || brecha > 0) {
          resultado[dim.id].totalCriticos += 1
        }
      })
    }

    // Ordenar escenarios evaluados para cada dimensión: Extremo primero, luego Alto, luego Medio, luego por brecha
    DIMENSIONES_RIESGO.forEach((dim) => {
      resultado[dim.id].escenariosEvaluados.sort((a, b) => {
        const scoreA = nivelScore(a.riesgoActual) * 10 + a.brecha * 2 + a.sev
        const scoreB = nivelScore(b.riesgoActual) * 10 + b.brecha * 2 + b.sev
        return scoreB - scoreA
      })
    })

    return resultado
  }, [escenariosData, configMatriz, codigoEscenarioMap])

  if (isLoading || !resumen) {
    return <div className="p-8 text-center text-slate-500">Cargando tablero de control...</div>
  }

  const matrizActiva = matricesPorDimension[dimensionActiva]
  const infoDimActiva = DIMENSIONES_RIESGO.find((d) => d.id === dimensionActiva)!

  // Lista de escenarios filtrados según celda seleccionada o todos los críticos de la dimensión
  const escenariosCriticosFiltrados = celdaFiltro
    ? matrizActiva.escenariosEvaluados.filter(
        (e) => e.frecAct === celdaFiltro.frec && e.sev === celdaFiltro.sev
      )
    : matrizActiva.escenariosEvaluados.filter(
        (e) => e.riesgoActual === 'Extremo' || e.riesgoActual === 'Alto' || e.brecha > 0
      )

  // Función para renderizar una tabla 5x5 de una dimensión dada
  const renderMatrizTabla = (dimId: TipoRiesgoDimension, compacta = false) => {
    const dataDim = matricesPorDimension[dimId]
    return (
      <div className="overflow-x-auto">
        <table className="w-full border-collapse border border-slate-300 dark:border-slate-700 table-fixed select-none text-xs">
          <thead>
            <tr className="bg-slate-100 dark:bg-slate-800/90 text-[11px] text-slate-700 dark:text-slate-200">
              <th className={`${compacta ? 'w-24' : 'w-32'} border border-slate-300 dark:border-slate-700 px-2 py-1.5 text-left font-bold uppercase`}>
                Sev. \ Frec.
              </th>
              {configMatriz.frecuencias.map((f) => (
                <th
                  key={f.codigo}
                  className="border border-slate-300 dark:border-slate-700 px-1.5 py-1 text-center"
                >
                  <div className="font-extrabold text-xs text-slate-900 dark:text-slate-100">
                    {f.codigo}
                  </div>
                  {!compacta && (
                    <div className="text-[10px] font-normal text-slate-500 dark:text-slate-400 truncate">
                      {f.etiqueta}
                    </div>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {configMatriz.severidades.map((sev) => (
              <tr key={sev.num}>
                <th className="bg-slate-100 dark:bg-slate-800/90 border border-slate-300 dark:border-slate-700 px-2 py-1 text-right align-middle">
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-100">
                    {sev.codigo}
                  </div>
                  {!compacta && (
                    <div className="text-[10px] font-normal text-slate-500 dark:text-slate-400 truncate max-w-[110px]" title={sev.etiqueta}>
                      {sev.etiqueta}
                    </div>
                  )}
                </th>
                {configMatriz.frecuencias.map((frec) => {
                  const clave = `${frec.codigo}-${sev.num}`
                  const celda = dataDim.celdas[clave] || { actual: 0, diseno: 0, nivel: 'Bajo' as Nivel, escenarios: [] }
                  const tieneActivos = celda.actual > 0
                  const haCambiado = celda.actual !== celda.diseno
                  const esCeldaSeleccionada =
                    celdaFiltro?.frec === frec.codigo && celdaFiltro?.sev === sev.num

                  // Estilos de fondo según nivel de criticidad
                  let bgNivel = 'bg-emerald-200/90 dark:bg-emerald-950/70 text-emerald-950 dark:text-emerald-100'
                  if (celda.nivel === 'Extremo') {
                    bgNivel = 'bg-red-500 dark:bg-red-950/80 text-white'
                  } else if (celda.nivel === 'Alto') {
                    bgNivel = 'bg-orange-400 dark:bg-orange-950/75 text-orange-950 dark:text-orange-100'
                  } else if (celda.nivel === 'Medio') {
                    bgNivel = 'bg-amber-300 dark:bg-amber-950/70 text-amber-950 dark:text-amber-100'
                  }

                  return (
                    <td
                      key={clave}
                      onClick={() => {
                        if (esCeldaSeleccionada) {
                          setCeldaFiltro(null)
                        } else {
                          setCeldaFiltro({ frec: frec.codigo, sev: sev.num })
                        }
                      }}
                      title={`Celda ${frec.codigo}${sev.codigo} (${celda.nivel}): ${celda.actual} actual(es), ${celda.diseno} de diseño. Haz clic para filtrar escenarios.`}
                      className={`border border-slate-400/50 dark:border-slate-700 ${
                        compacta ? 'h-12' : 'h-16'
                      } p-0 align-top transition-all cursor-pointer ${bgNivel} ${
                        tieneActivos
                          ? 'opacity-100 ring-1 ring-inset ring-slate-900/20 dark:ring-white/20 shadow-xs'
                          : 'opacity-30 saturate-50 hover:opacity-60'
                      } ${
                        esCeldaSeleccionada
                          ? 'ring-3 ring-sky-600 dark:ring-sky-400 z-20 scale-[1.03] shadow-md'
                          : ''
                      } ${haCambiado ? 'ring-2 ring-inset ring-red-600 dark:ring-red-400 animate-pulse' : ''}`}
                    >
                      <div className="h-full w-full px-1.5 py-1 flex flex-col justify-between">
                        <div className="flex justify-between items-start">
                          <span className="text-[9.5px] font-mono font-bold opacity-80">
                            {frec.codigo}{sev.codigo}
                          </span>
                          {haCambiado && (
                            <span className="text-[8.5px] font-extrabold px-1 rounded bg-red-700 text-white">
                              {celda.actual > celda.diseno
                                ? `+${celda.actual - celda.diseno}`
                                : `${celda.actual - celda.diseno}`}
                            </span>
                          )}
                        </div>
                        <div className="text-center font-black pb-0.5">
                          <span className={`${compacta ? 'text-base' : 'text-lg'} leading-none`}>
                            {celda.actual}
                          </span>
                          <span className="text-[10px] font-semibold opacity-75 ml-1">
                            ({celda.diseno})
                          </span>
                        </div>
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header & Filtros */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Tablero de Riesgo Dinámico</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Integración de HAZOP semicuantitativo, matrices independientes por tipo de riesgo y salvaguardas operacionales.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <select
            className="input text-xs w-44"
            value={siteId || ''}
            onChange={(e) => {
              const val = e.target.value ? Number(e.target.value) : undefined
              setSiteId(val)
              setUnidadId(undefined)
            }}
          >
            <option value="">Todos los Sitios</option>
            {sitios?.map((s) => (
              <option key={s.id} value={s.id}>{s.nombre}</option>
            ))}
          </select>

          <select
            className="input text-xs w-48"
            value={unidadId || ''}
            onChange={(e) => setUnidadId(e.target.value ? Number(e.target.value) : undefined)}
          >
            <option value="">Todas las Unidades</option>
            {unidades?.map((u) => (
              <option key={u.id} value={u.id}>{u.nombre}</option>
            ))}
          </select>

          <Link
            to="/configuracion"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 shadow-2xs transition-colors"
            title="Ir a Configuración de la Matriz de Riesgo"
          >
            <span>⚙️</span>
            <span>Ajustar Escalas</span>
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Disponibilidad de Barreras */}
        <div className="card card-pad flex flex-col justify-between">
          <div className="text-xs font-semibold uppercase text-slate-500 tracking-wider">Disponibilidad de Barreras</div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className={`text-3xl font-extrabold ${resumen.pct_barreras_disponibles < 90 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-900 dark:text-white'}`}>
              {resumen.pct_barreras_disponibles}%
            </span>
            <span className="text-xs text-slate-500">
              ({resumen.barreras_disponibles} de {resumen.barreras_total} operativas)
            </span>
          </div>
          <div className="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full mt-3 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${resumen.pct_barreras_disponibles < 90 ? 'bg-amber-500' : 'bg-emerald-500'}`}
              style={{ width: `${resumen.pct_barreras_disponibles}%` }}
            />
          </div>
        </div>

        {/* Escenarios en Brecha */}
        <div className="card card-pad flex flex-col justify-between">
          <div className="text-xs font-semibold uppercase text-slate-500 tracking-wider">Escenarios en Brecha</div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className={`text-3xl font-extrabold ${resumen.escenarios_en_brecha > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
              {resumen.escenarios_en_brecha}
            </span>
            <span className="text-xs text-slate-500">
              de {resumen.escenarios_total} escenarios analizados
            </span>
          </div>
          <div className="text-xs text-slate-500 mt-3 flex justify-between">
            <span>Riesgo Alto/Extremo actual:</span>
            <span className="font-bold text-slate-700 dark:text-slate-300">{resumen.escenarios_alto_extremo_actual}</span>
          </div>
        </div>

        {/* Desviación Dinámica vs Diseño */}
        <div className="card card-pad flex flex-col justify-between">
          <div className="text-xs font-semibold uppercase text-slate-500 tracking-wider">Degradación vs Diseño</div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className={`text-3xl font-extrabold ${resumen.escenarios_alto_extremo_actual > resumen.escenarios_alto_extremo_diseno ? 'text-orange-600 dark:text-orange-400' : 'text-slate-900 dark:text-white'}`}>
              +{Math.max(0, resumen.escenarios_alto_extremo_actual - resumen.escenarios_alto_extremo_diseno)}
            </span>
            <span className="text-xs text-slate-500">
              escenarios degradados
            </span>
          </div>
          <div className="text-xs text-slate-500 mt-3 flex justify-between">
            <span>Diseño: {resumen.escenarios_alto_extremo_diseno}</span>
            <span>→</span>
            <span className="font-bold text-red-600">Actual: {resumen.escenarios_alto_extremo_actual}</span>
          </div>
        </div>

        {/* Estado Operacional de Salvaguardas */}
        <div className="card card-pad flex flex-col justify-between">
          <div className="text-xs font-semibold uppercase text-slate-500 tracking-wider">Estado de Salvaguardas</div>
          <div className="grid grid-cols-2 gap-1.5 mt-2 text-xs">
            <div className="flex justify-between items-center pr-2 border-r border-slate-200 dark:border-slate-800">
              <span className="text-slate-500">Degradadas:</span>
              <span className="font-bold text-amber-600">{resumen.barreras_por_estado['DEGRADADO'] || 0}</span>
            </div>
            <div className="flex justify-between items-center pl-2">
              <span className="text-slate-500">En Mant.:</span>
              <span className="font-bold text-sky-600">{resumen.barreras_por_estado['EN_MANTENIMIENTO'] || 0}</span>
            </div>
            <div className="flex justify-between items-center pr-2 border-r border-slate-200 dark:border-slate-800 mt-1">
              <span className="text-slate-500">Fuera Servicio:</span>
              <span className="font-bold text-red-600">{resumen.barreras_por_estado['FUERA_DE_SERVICIO'] || 0}</span>
            </div>
            <div className="flex justify-between items-center pl-2 mt-1">
              <span className="text-slate-500">Inexistentes:</span>
              <span className="font-bold text-slate-600">{resumen.barreras_por_estado['INEXISTENTE'] || 0}</span>
            </div>
          </div>
          <div className="mt-2 text-right">
            <Link to="/barreras" className="text-xs text-brand-600 hover:underline">Ver gestión de barreras →</Link>
          </div>
        </div>
      </div>

      {/* Selector de Matrices Independientes por Tipo de Riesgo */}
      <div className="card p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Tipo de Riesgo:
            </span>
            {/* Tabs de Dimensiones */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {DIMENSIONES_RIESGO.map((dim) => {
                const esActiva = dimensionActiva === dim.id
                const nCriticos = matricesPorDimension[dim.id]?.totalCriticos || 0

                return (
                  <button
                    key={dim.id}
                    type="button"
                    onClick={() => {
                      setDimensionActiva(dim.id)
                      setCeldaFiltro(null)
                    }}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      esActiva
                        ? 'bg-[#1e4e79] text-white shadow-xs dark:bg-sky-600'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200'
                    }`}
                  >
                    <span>{dim.icono}</span>
                    <span>{dim.nombreCorto}</span>
                    {nCriticos > 0 && (
                      <span
                        className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                          esActiva
                            ? 'bg-white/20 text-white'
                            : 'bg-red-100 text-red-800 dark:bg-red-950/80 dark:text-red-300'
                        }`}
                      >
                        {nCriticos}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Toggle modo 4 matrices vs modo detallado */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setModoCuadricula(!modoCuadricula)}
              className="px-2.5 py-1 text-xs rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium transition-colors"
            >
              {modoCuadricula ? '👁️ Ver Matriz Detallada' : '⊞ Ver 4 Matrices en Cuadrícula'}
            </button>
          </div>
        </div>
      </div>

      {/* Modo 4 Matrices Simultáneas en Cuadrícula */}
      {modoCuadricula ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {(['personas', 'economico', 'ambiente', 'reputacion'] as TipoRiesgoDimension[]).map((dimId) => {
              const dInfo = DIMENSIONES_RIESGO.find((d) => d.id === dimId)!
              const dMat = matricesPorDimension[dimId]
              const criticosTop = dMat.escenariosEvaluados
                .filter((e) => e.riesgoActual === 'Extremo' || e.riesgoActual === 'Alto' || e.brecha > 0)
                .slice(0, 3)

              return (
                <div key={dimId} className="card card-pad space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{dInfo.icono}</span>
                      <div>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                          Matriz de Riesgo: {dInfo.nombre}
                        </h3>
                        <p className="text-[11px] text-slate-500">{dInfo.subtitulo}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setDimensionActiva(dimId)
                        setModoCuadricula(false)
                      }}
                      className="text-xs text-brand-600 hover:underline font-semibold"
                    >
                      Ampliar vista →
                    </button>
                  </div>

                  {renderMatrizTabla(dimId, true)}

                  {/* Resumen de escenarios críticos destacados para esta dimensión */}
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                    <div className="text-[11px] font-bold uppercase text-slate-500 mb-2 flex justify-between">
                      <span>Top Escenarios Críticos ({dMat.totalCriticos})</span>
                      <span className="text-[10px] font-normal text-slate-400">Resaltados por nivel de riesgo</span>
                    </div>

                    <div className="space-y-1.5">
                      {criticosTop.map((esc) => {
                        const estilos = obtenerEstilosResaltado(esc.riesgoActual)
                        return (
                          <Link
                            key={esc.id}
                            to={`/escenarios?escenario_id=${esc.id}`}
                            className={`block p-2 rounded-md border text-xs transition-all ${estilos.card}`}
                          >
                            <div className="flex items-center justify-between gap-1">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="px-1 py-0.2 rounded bg-sky-100 dark:bg-sky-950 font-mono text-[10.5px] font-bold shrink-0">
                                  {esc.codigo?.numCausa ?? `Esc. ${esc.id}`}
                                </span>
                                <span className="font-semibold truncate text-slate-900 dark:text-white">
                                  {esc.causa}
                                </span>
                              </div>
                              <span className={`chip text-[10px] shrink-0 ${estilos.badge}`}>
                                {esc.riesgoActual}
                              </span>
                            </div>
                          </Link>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        /* Modo Vista Detallada: Matriz Seleccionada 5x5 + Lista de Escenarios Críticos */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Matriz 5x5 de la Dimensión Seleccionada */}
          <div className="lg:col-span-7 card card-pad">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xl">{infoDimActiva.icono}</span>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">
                    Matriz de Riesgo: {infoDimActiva.nombre}
                  </h2>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Cada celda muestra: <span className="font-semibold text-slate-800 dark:text-slate-200">Actual</span> <span className="text-[10px] text-slate-500">(Diseño)</span>. Clic en una celda para filtrar la lista.
                </p>
              </div>

              {/* Leyenda de colores de criticidad */}
              <div className="flex items-center gap-1.5 text-[10.5px] font-semibold">
                <span className="px-1.5 py-0.5 rounded bg-emerald-300 dark:bg-emerald-700 text-emerald-950 dark:text-white">Bajo</span>
                <span className="px-1.5 py-0.5 rounded bg-yellow-300 dark:bg-yellow-600 text-yellow-950 dark:text-white">Medio</span>
                <span className="px-1.5 py-0.5 rounded bg-orange-400 dark:bg-orange-600 text-orange-950 dark:text-white">Alto</span>
                <span className="px-1.5 py-0.5 rounded bg-red-500 dark:bg-red-700 text-white">Extremo</span>
              </div>
            </div>

            {/* Renderizado de la tabla 5x5 */}
            {renderMatrizTabla(dimensionActiva, false)}

            {celdaFiltro && (
              <div className="mt-3 p-2 rounded-md bg-sky-50 dark:bg-sky-950/60 border border-sky-300 dark:border-sky-800 flex items-center justify-between text-xs">
                <span className="text-sky-900 dark:text-sky-200">
                  Filtrando escenarios en la celda <strong>{celdaFiltro.frec}{celdaFiltro.sev}</strong> ({escenariosCriticosFiltrados.length} encontrados).
                </span>
                <button
                  type="button"
                  onClick={() => setCeldaFiltro(null)}
                  className="text-sky-700 dark:text-sky-300 hover:underline font-bold text-xs"
                >
                  Quitar filtro de celda ✕
                </button>
              </div>
            )}
          </div>

          {/* Listado de Escenarios Críticos (Resaltados en el color de su criticidad en la matriz) */}
          <div className="lg:col-span-5 card card-pad flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <span>Escenarios Críticos ({infoDimActiva.nombreCorto})</span>
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    Resaltados con el color correspondiente a su nivel de riesgo en la matriz.
                  </p>
                </div>
                <Link to="/escenarios?solo_brecha=true" className="text-xs text-brand-600 hover:underline font-semibold shrink-0">
                  Ver todos en PHA →
                </Link>
              </div>

              {escenariosCriticosFiltrados.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-sm">
                  <span className="text-2xl block mb-2">🛡️</span>
                  No hay escenarios en brecha o en riesgo Alto/Extremo para la dimensión de {infoDimActiva.nombreCorto}.
                </div>
              ) : (
                <div className="space-y-2.5 max-h-[460px] overflow-y-auto pr-1">
                  {escenariosCriticosFiltrados.map((p) => {
                    // Resaltar con el color correspondiente de su criticidad en esta matriz
                    const estilos = obtenerEstilosResaltado(p.riesgoActual)

                    return (
                      <Link
                        key={p.id}
                        to={`/escenarios?escenario_id=${p.id}`}
                        className={`block p-3 rounded-lg border transition-all ${estilos.card}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="px-1.5 py-0.5 rounded bg-sky-100 dark:bg-sky-950/80 text-sky-800 dark:text-sky-300 font-mono text-[11px] font-bold shrink-0">
                              {p.codigo?.numCausa ?? `Esc. ${p.id}`}
                            </span>
                            <span className="font-semibold text-xs text-slate-900 dark:text-white truncate">
                              {p.causa}
                            </span>
                          </div>

                          {/* Badge de criticidad con su color correspondiente */}
                          <div className="flex items-center gap-1 shrink-0">
                            <span className={`chip text-[10px] ${estilos.badge}`}>
                              {p.riesgoActual}
                            </span>
                            {p.brecha > 0 && (
                              <span className="chip bg-red-100 text-red-800 dark:bg-red-950/80 dark:text-red-300 text-[10px] font-bold">
                                +{p.brecha}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-[11px] text-slate-500 mt-2">
                          <span className="truncate">
                            {p.codigo ? `Desv. ${p.codigo.numDesv} · ` : ''}{p.unidad} · {p.nodo}
                          </span>
                          <div className="flex items-center gap-1.5 font-medium shrink-0">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] ${NIVEL_CLASES[p.riesgoDiseno]}`}>
                              Diseño: {p.riesgoDiseno}
                            </span>
                            <span>→</span>
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${NIVEL_CLASES[p.riesgoActual]}`}>
                              Actual: {p.riesgoActual}
                            </span>
                          </div>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 mt-3 text-xs text-slate-500 flex items-center justify-between">
              <span>Haz clic en un escenario para dirigir al inicio de la fila en Escenarios PHA.</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
