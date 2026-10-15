import React from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import { api } from '../lib/api'
import type { Api754 } from '../lib/types'
import { fmtHoras, fmtFecha } from '../lib/format'

export const Indicadores: React.FC = () => {
  const { data: apiData, isLoading } = useQuery<Api754>({
    queryKey: ['api754'],
    queryFn: () => api.get<Api754>('/indicadores/api754'),
    refetchInterval: 10000,
  })

  if (isLoading || !apiData) {
    return <div className="p-8 text-center text-slate-500">Cargando indicadores de seguridad de procesos...</div>
  }

  const { tier3, tier4 } = apiData

  // Preparar datos para el gráfico de barras de tiempo acumulado
  const chartData = tier3.tiempo_por_barrera.map((b) => ({
    tag: b.tag_activo,
    horas: b.horas,
    estado: b.estado_actual,
  }))

  return (
    <div className="space-y-6">
      {/* Header y Alerta Normativa */}
      <div className="space-y-2 pb-2 border-b border-slate-200 dark:border-slate-800">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          Indicadores de Desempeño de Seguridad de Procesos (API RP 754)
        </h1>
        <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-800 dark:text-amber-300 flex items-center gap-2">
          <span className="font-bold uppercase text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20">Nota Técnica</span>
          <span>{apiData.aviso}</span>
        </div>
      </div>

      {/* TIER 3: Desafíos a los Sistemas de Seguridad (Near Misses & Demandas) */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded bg-amber-600 text-white text-xs font-black uppercase">Tier 3</span>
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            Desafíos a los Sistemas de Seguridad y Pérdida de Integridad de Barreras
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="card card-pad">
            <div className="text-xs font-semibold uppercase text-slate-500">Barreras Fuera de Servicio</div>
            <div className="text-3xl font-extrabold text-red-600 mt-2">{tier3.barreras_fuera_de_servicio}</div>
            <p className="text-[11px] text-slate-400 mt-1">Crédito FRR anulado por falla o bloqueo</p>
          </div>

          <div className="card card-pad">
            <div className="text-xs font-semibold uppercase text-slate-500">Barreras Degradadas</div>
            <div className="text-3xl font-extrabold text-amber-600 mt-2">{tier3.barreras_degradadas}</div>
            <p className="text-[11px] text-slate-400 mt-1">Multiplicador FRR reducido a 0.1 (10% eficacia)</p>
          </div>

          <div className="card card-pad">
            <div className="text-xs font-semibold uppercase text-slate-500">En Mantenimiento</div>
            <div className="text-3xl font-extrabold text-sky-600 mt-2">{tier3.barreras_en_mantenimiento}</div>
            <p className="text-[11px] text-slate-400 mt-1">Intervención programada / prueba de banco</p>
          </div>

          <div className="card card-pad">
            <div className="text-xs font-semibold uppercase text-slate-500">Tiempo Acumulado Indisponible</div>
            <div className="text-3xl font-extrabold text-slate-900 dark:text-white mt-2">
              {fmtHoras(tier3.tiempo_acumulado_horas)}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">Suma acumulada de horas en falla operacional</p>
          </div>
        </div>

        {/* Gráfico de horas acumuladas por barrera */}
        <div className="card card-pad">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-3">
            Top Barreras con Mayor Tiempo en Estado No Operativo
          </h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
                <XAxis dataKey="tag" tick={{ fontSize: 11 }} />
                <YAxis unit=" h" tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(val: unknown) => [`${val} horas`, 'Tiempo acumulado']}
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#fff', fontSize: '12px' }}
                />
                <Bar dataKey="horas" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.estado === 'FUERA_DE_SERVICIO' ? '#dc2626' : '#f59e0b'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* TIER 4: Disciplina Operacional y Monitoreo Proactivo */}
      <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded bg-blue-600 text-white text-xs font-black uppercase">Tier 4</span>
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            Monitoreo Proactivo y Gestión del Cambio (MOC)
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="card card-pad">
            <div className="text-xs font-semibold uppercase text-slate-500">% Barreras Disponibles</div>
            <div className="text-3xl font-extrabold text-emerald-600 mt-2">{tier4.pct_barreras_disponibles}%</div>
            <p className="text-[11px] text-slate-400 mt-1">Meta corporativa: ≥ 95.0%</p>
          </div>

          <div className="card card-pad">
            <div className="text-xs font-semibold uppercase text-slate-500">Acciones de Mitigación Abiertas</div>
            <div className="text-3xl font-extrabold text-orange-600 mt-2">{tier4.acciones_abiertas}</div>
            <p className="text-[11px] text-slate-400 mt-1">Recomendaciones abiertas ante brechas de riesgo</p>
          </div>

          <div className="card card-pad">
            <div className="text-xs font-semibold uppercase text-slate-500">Barreras Temporales Activas</div>
            <div className="text-3xl font-extrabold text-purple-600 mt-2">{tier4.temporales_activas}</div>
            <p className="text-[11px] text-slate-400 mt-1">Bajo procedimiento formal MOC</p>
          </div>
        </div>

        {/* Tabla de Barreras Temporales próximas a vencer */}
        <div className="card card-pad">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-2">
            Vigilancia de Barreras Temporales (Alerta de Vencimiento: {tier4.dias_alerta_vencimiento} días)
          </h3>

          {tier4.temporales_proximas_a_vencer.length === 0 ? (
            <div className="py-6 text-center text-slate-400 text-xs">
              No hay barreras temporales próximas a vencer en la ventana de alerta.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>TAG Barrera</th>
                    <th>Referencia MOC</th>
                    <th>Vencimiento</th>
                    <th className="text-center">Días Restantes</th>
                    <th className="text-center">Estado Alerta</th>
                  </tr>
                </thead>
                <tbody>
                  {tier4.temporales_proximas_a_vencer.map((t) => (
                    <tr key={t.barrera_id}>
                      <td className="font-mono font-bold text-xs">{t.tag_activo}</td>
                      <td className="font-mono text-xs text-purple-600">{t.moc_ref || '—'}</td>
                      <td className="text-xs text-slate-600 dark:text-slate-300">
                        {fmtFecha(t.vigencia_hasta, false)}
                      </td>
                      <td className="text-center font-bold text-xs">
                        {t.dias_restantes !== null ? `${t.dias_restantes} días` : '—'}
                      </td>
                      <td className="text-center">
                        <span className="chip bg-red-100 text-red-800 dark:bg-red-950/70 dark:text-red-300 text-[10px] font-bold">
                          ⚠️ Próxima a Vencer
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
