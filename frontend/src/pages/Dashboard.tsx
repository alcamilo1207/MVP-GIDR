import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import type { ResumenDashboard, Sitio, Unidad } from '../lib/types'
import { NIVEL_CELDA, NIVEL_CLASES, fmtBrecha } from '../lib/format'

export const Dashboard: React.FC = () => {
  const [siteId, setSiteId] = useState<number | undefined>(undefined)
  const [unidadId, setUnidadId] = useState<number | undefined>(undefined)

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

  if (isLoading || !resumen) {
    return <div className="p-8 text-center text-slate-500">Cargando tablero de control...</div>
  }

  // Agrupar mapa de calor por severidad (5 a 1) y frecuencias (A a E)
  const frecs = ['A', 'B', 'C', 'D', 'E']
  const sevs = [5, 4, 3, 2, 1]

  const celdaPor = (f: string, s: number) =>
    resumen.mapa_calor.find((c) => c.frecuencia === f && c.severidad === s)

  return (
    <div className="space-y-6">
      {/* Header & Filtros */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Tablero de Riesgo Dinámico</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Integración de HAZOP semicuantitativo y estado operacional de barreras en tiempo real.
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
              de {resumen.escenarios_total} escenarios ({Math.round((resumen.escenarios_en_brecha / (resumen.escenarios_total || 1)) * 100)}%)
            </span>
          </div>
          <div className="text-[11px] text-slate-500 mt-2">
            Riesgo actual supera al riesgo proyectado de diseño.
          </div>
        </div>

        {/* Escenarios Alto / Extremo Actual */}
        <div className="card card-pad flex flex-col justify-between">
          <div className="text-xs font-semibold uppercase text-slate-500 tracking-wider">Riesgo Alto / Extremo (Actual)</div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-orange-600 dark:text-orange-400">
              {resumen.escenarios_alto_extremo_actual}
            </span>
            <span className="text-xs text-slate-500">
              (Diseño inicial: {resumen.escenarios_alto_extremo_diseno})
            </span>
          </div>
          <div className="text-[11px] text-slate-500 mt-2">
            {resumen.escenarios_alto_extremo_actual > resumen.escenarios_alto_extremo_diseno ? (
              <span className="text-red-600 font-medium">+{resumen.escenarios_alto_extremo_actual - resumen.escenarios_alto_extremo_diseno} escenarios escalaron a zona crítica</span>
            ) : (
              <span className="text-emerald-600 font-medium">Riesgo crítico dentro de los márgenes previstos</span>
            )}
          </div>
        </div>

        {/* Estado Operacional Barreras */}
        <div className="card card-pad flex flex-col justify-between">
          <div className="text-xs font-semibold uppercase text-slate-500 tracking-wider">Afectación de Barreras</div>
          <div className="mt-2 grid grid-cols-2 gap-1 text-xs">
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

      {/* Grid Principal: Mapa de Calor 5x5 vs Lista Priorizada */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Mapa de Calor */}
        <div className="lg:col-span-7 card card-pad">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Matriz de Riesgo 5×5 (Diseño vs Actual)</h2>
              <p className="text-xs text-slate-500">
                Cada celda muestra: <span className="font-semibold text-slate-800 dark:text-slate-200">Actual</span> <span className="text-[10px] text-slate-500">(Diseño)</span>
              </p>
            </div>
            <div className="flex items-center gap-2 text-[10px]">
              <span className="px-1.5 py-0.5 rounded bg-emerald-200 text-emerald-900 font-medium">Bajo</span>
              <span className="px-1.5 py-0.5 rounded bg-yellow-200 text-yellow-900 font-medium">Medio</span>
              <span className="px-1.5 py-0.5 rounded bg-orange-300 text-orange-900 font-medium">Alto</span>
              <span className="px-1.5 py-0.5 rounded bg-red-400 text-red-950 font-medium">Extremo</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <div className="inline-block min-w-full align-middle">
              <div className="flex">
                {/* Eje Severidad (Vertical) */}
                <div className="flex flex-col justify-between py-6 pr-2 text-xs font-semibold text-slate-400 text-right w-24">
                  <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300">5 - Catastrófico</span>
                  <span className="text-[11px] text-slate-500">4 - Mayor</span>
                  <span className="text-[11px] text-slate-500">3 - Moderado</span>
                  <span className="text-[11px] text-slate-500">2 - Menor</span>
                  <span className="text-[11px] text-slate-500">1 - Leve</span>
                </div>

                {/* Grilla 5x5 */}
                <div className="flex-1">
                  <div className="grid grid-cols-5 gap-1.5">
                    {sevs.map((sev) =>
                      frecs.map((frec) => {
                        const celda = celdaPor(frec, sev)
                        if (!celda) return null
                        const haCambiado = celda.actual !== celda.diseno
                        return (
                          <div
                            key={`${frec}-${sev}`}
                            className={`h-16 rounded-md p-1.5 flex flex-col justify-between transition-all ${
                              NIVEL_CELDA[celda.nivel]
                            } ${haCambiado ? 'ring-2 ring-red-500/80 shadow-md animate-pulse' : ''}`}
                          >
                            <div className="flex justify-between items-start">
                              <span className="text-[10px] font-bold text-slate-800/80 dark:text-slate-200/90">
                                {frec}{sev}
                              </span>
                              {haCambiado && (
                                <span className="text-[9px] font-extrabold px-1 py-0.2 rounded bg-red-600 text-white">
                                  {celda.actual > celda.diseno ? `+${celda.actual - celda.diseno}` : `${celda.actual - celda.diseno}`}
                                </span>
                              )}
                            </div>
                            <div className="text-center font-black">
                              <span className="text-xl text-slate-900 dark:text-slate-900 leading-none">
                                {celda.actual}
                              </span>
                              <span className="text-[11px] font-normal text-slate-700/80 ml-1">
                                ({celda.diseno})
                              </span>
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>

                  {/* Eje Frecuencia (Horizontal) */}
                  <div className="grid grid-cols-5 gap-1.5 mt-2 text-center text-xs text-slate-500">
                    <div><span className="font-bold text-slate-700 dark:text-slate-300">A</span><p className="text-[10px]">Frecuente</p></div>
                    <div><span className="font-bold text-slate-700 dark:text-slate-300">B</span><p className="text-[10px]">Probable</p></div>
                    <div><span className="font-bold text-slate-700 dark:text-slate-300">C</span><p className="text-[10px]">Ocasional</p></div>
                    <div><span className="font-bold text-slate-700 dark:text-slate-300">D</span><p className="text-[10px]">Raro</p></div>
                    <div><span className="font-bold text-slate-700 dark:text-slate-300">E</span><p className="text-[10px]">Improbable</p></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Escenarios Priorizados por Brecha */}
        <div className="lg:col-span-5 card card-pad flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Escenarios Críticos (Top Brecha)</h2>
              <Link to="/escenarios?solo_brecha=true" className="text-xs text-brand-600 hover:underline">
                Ver todos ({resumen.escenarios_en_brecha})
              </Link>
            </div>

            {resumen.priorizados.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-sm">
                <span className="text-2xl block mb-2">🛡️</span>
                No hay escenarios en brecha de riesgo. La planta opera dentro de sus parámetros de diseño.
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
                {resumen.priorizados.map((p) => (
                  <Link
                    key={p.escenario_id}
                    to={`/bowtie/${p.escenario_id}`}
                    className="block p-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-brand-500 dark:hover:border-brand-500 bg-slate-50/50 dark:bg-slate-800/40 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-semibold text-xs text-slate-900 dark:text-white line-clamp-1">
                        #{p.escenario_id} · {p.causa}
                      </div>
                      <span className="chip bg-red-100 text-red-800 dark:bg-red-950/80 dark:text-red-300 text-[10px] font-bold">
                        Brecha {fmtBrecha(p.brecha)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-500 mt-2">
                      <span>{p.unidad} · {p.nodo}</span>
                      <div className="flex items-center gap-1.5 font-medium">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] ${NIVEL_CLASES[p.riesgo_diseno]}`}>
                          Diseño: {p.riesgo_diseno}
                        </span>
                        <span>→</span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] ${NIVEL_CLASES[p.riesgo_actual]}`}>
                          Actual: {p.riesgo_actual}
                        </span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 mt-3 text-xs text-slate-500 flex items-center justify-between">
            <span>Haz clic en un escenario para ver su BowTie interactivo.</span>
          </div>
        </div>
      </div>
    </div>
  )
}
