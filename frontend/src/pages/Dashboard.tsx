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
  const frecs: Array<{ cod: string; etq: string }> = [
    { cod: 'A', etq: 'Frecuente' },
    { cod: 'B', etq: 'Probable' },
    { cod: 'C', etq: 'Ocasional' },
    { cod: 'D', etq: 'Raro' },
    { cod: 'E', etq: 'Improbable' },
  ]
  const sevs: Array<{ num: number; etq: string }> = [
    { num: 5, etq: 'Catastrófico' },
    { num: 4, etq: 'Mayor' },
    { num: 3, etq: 'Moderado' },
    { num: 2, etq: 'Menor' },
    { num: 1, etq: 'Leve' },
  ]

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
            <table className="w-full border-collapse border border-slate-300 dark:border-slate-700 table-fixed select-none">
              <thead>
                <tr className="bg-slate-100 dark:bg-slate-800/90 text-[11px] text-slate-600 dark:text-slate-300">
                  <th className="w-32 border border-slate-300 dark:border-slate-700 px-2.5 py-2 text-left font-bold uppercase tracking-wider">
                    Sev. \ Frec.
                  </th>
                  {frecs.map((f) => (
                    <th
                      key={f.cod}
                      className="border border-slate-300 dark:border-slate-700 px-2 py-1.5 text-center"
                    >
                      <div className="font-bold text-xs text-slate-800 dark:text-slate-100">
                        {f.cod}
                      </div>
                      <div className="text-[10px] font-normal text-slate-500 dark:text-slate-400">
                        {f.etq}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sevs.map((sev) => (
                  <tr key={sev.num}>
                    <th className="bg-slate-100 dark:bg-slate-800/90 border border-slate-300 dark:border-slate-700 px-2.5 py-2 text-right align-middle">
                      <div className="text-xs font-bold text-slate-800 dark:text-slate-100">
                        Nivel {sev.num}
                      </div>
                      <div className="text-[10px] font-normal text-slate-500 dark:text-slate-400">
                        {sev.etq}
                      </div>
                    </th>
                    {frecs.map((frec) => {
                      const celda = celdaPor(frec.cod, sev.num)
                      if (!celda) {
                        return (
                          <td
                            key={`${frec.cod}-${sev.num}`}
                            className="border border-slate-300 dark:border-slate-700 h-16"
                          />
                        )
                      }
                      const tieneActivos = celda.actual > 0
                      const haCambiado = celda.actual !== celda.diseno
                      return (
                        <td
                          key={`${frec.cod}-${sev.num}`}
                          className={`border border-slate-400/60 dark:border-slate-700 h-16 p-0 align-top transition-all ${
                            NIVEL_CELDA[celda.nivel]
                          } ${
                            tieneActivos
                              ? 'opacity-100 ring-1 ring-inset ring-slate-900/25 dark:ring-white/25 shadow-sm z-10'
                              : 'opacity-20 saturate-50 hover:opacity-40'
                          } ${haCambiado ? 'ring-2 ring-inset ring-red-600 dark:ring-red-400 animate-pulse' : ''}`}
                        >
                          <div className="h-full w-full px-2 py-1.5 flex flex-col justify-between">
                            <div className="flex justify-between items-start">
                              <span className="text-[10px] font-bold tracking-tight opacity-85">
                                {frec.cod}
                                {sev.num}
                              </span>
                              {haCambiado && (
                                <span className="text-[9px] font-extrabold px-1 py-0.2 rounded bg-red-700 text-white shadow-sm">
                                  {celda.actual > celda.diseno
                                    ? `+${celda.actual - celda.diseno}`
                                    : `${celda.actual - celda.diseno}`}
                                </span>
                              )}
                            </div>
                            <div className="text-center font-black pb-0.5">
                              <span className="text-xl leading-none">
                                {celda.actual}
                              </span>
                              <span className="text-[11px] font-semibold opacity-75 ml-1">
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
                    to={`/escenarios?escenario_id=${p.escenario_id}&enfocar=recomendacion`}
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
            <span>Haz clic en un escenario para ver su Recomendación PHA.</span>
          </div>
        </div>
      </div>
    </div>
  )
}
