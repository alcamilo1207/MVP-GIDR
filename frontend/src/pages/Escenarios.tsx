import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../lib/api'
import type { Escenario, Pagina, Sitio, Unidad } from '../lib/types'
import { NIVEL_CLASES, fmtBrecha } from '../lib/format'

export const Escenarios: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const [siteId, setSiteId] = useState<number | undefined>(undefined)
  const [unidadId, setUnidadId] = useState<number | undefined>(undefined)
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)

  const soloBrecha = searchParams.get('solo_brecha') === 'true'
  const riesgoFiltro = searchParams.get('riesgo') || undefined

  const { data: sitios } = useQuery({
    queryKey: ['sitios'],
    queryFn: () => api.get<{ items: Sitio[] }>('/sites').then((r) => r.items),
  })

  const { data: unidades } = useQuery({
    queryKey: ['unidades', siteId],
    queryFn: () => api.get<{ items: Unidad[] }>('/unidades', { site_id: siteId }).then((r) => r.items),
  })

  const { data: resp, isLoading } = useQuery<Pagina<Escenario>>({
    queryKey: ['escenarios', siteId, unidadId, q, soloBrecha, riesgoFiltro, page],
    queryFn: () =>
      api.get<Pagina<Escenario>>('/escenarios', {
        site_id: siteId,
        unidad_id: unidadId,
        q: q || undefined,
        solo_brecha: soloBrecha ? true : undefined,
        riesgo_actual: riesgoFiltro,
        orden: soloBrecha ? 'brecha' : 'id',
        page,
        size: 15,
      }),
  })

  return (
    <div className="space-y-6">
      {/* Header y Filtros */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Escenarios HAZOP</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Vista integral con los 17 campos de taxonomía, impacto en 4 dimensiones y evaluación del riesgo.
          </p>
        </div>

        {/* Filtros rápidos */}
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            placeholder="Buscar causa o consecuencia..."
            className="input text-xs w-56"
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setPage(1)
            }}
          />

          <select
            className="input text-xs w-40"
            value={siteId || ''}
            onChange={(e) => {
              setSiteId(e.target.value ? Number(e.target.value) : undefined)
              setUnidadId(undefined)
              setPage(1)
            }}
          >
            <option value="">Todos los Sitios</option>
            {sitios?.map((s) => (
              <option key={s.id} value={s.id}>{s.nombre}</option>
            ))}
          </select>

          <select
            className="input text-xs w-44"
            value={unidadId || ''}
            onChange={(e) => {
              setUnidadId(e.target.value ? Number(e.target.value) : undefined)
              setPage(1)
            }}
          >
            <option value="">Todas las Unidades</option>
            {unidades?.map((u) => (
              <option key={u.id} value={u.id}>{u.nombre}</option>
            ))}
          </select>

          <button
            onClick={() => {
              setSearchParams(soloBrecha ? {} : { solo_brecha: 'true' })
              setPage(1)
            }}
            className={`btn text-xs px-2.5 py-1.5 ${
              soloBrecha
                ? 'bg-red-600 text-white'
                : 'border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300'
            }`}
          >
            {soloBrecha ? '✓ Solo Brechas' : 'Filtrar Brechas'}
          </button>
        </div>
      </div>

      {/* Tabla de Escenarios */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th className="w-12">ID</th>
                <th>Ubicación / Nodo</th>
                <th>Palabra Guía / Causa</th>
                <th>Consecuencia</th>
                <th className="text-center" title="Económico, Personas, Ambiente, Reputación (1-5)">
                  Impactos (E-P-A-R)
                </th>
                <th className="text-center">R. Inherente</th>
                <th className="text-center">R. Diseño</th>
                <th className="text-center">R. Actual</th>
                <th className="text-center">Brecha</th>
                <th className="text-center">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={10} className="text-center py-12 text-slate-400">
                    Cargando escenarios...
                  </td>
                </tr>
              ) : resp?.items.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-12 text-slate-400">
                    No se encontraron escenarios con los filtros seleccionados.
                  </td>
                </tr>
              ) : (
                resp?.items.map((e) => {
                  const res = e.resultado
                  return (
                    <tr key={e.id} className="transition-colors">
                      <td className="font-mono text-xs text-slate-500 font-bold">#{e.id}</td>
                      <td>
                        <div className="font-semibold text-xs text-slate-900 dark:text-slate-100">{e.unidad}</div>
                        <div className="text-[11px] text-slate-500">{e.nodo}</div>
                      </td>
                      <td className="max-w-xs">
                        <span className="inline-block text-[10px] font-bold uppercase tracking-wider text-brand-600 dark:text-brand-400">
                          {e.palabra_guia}
                        </span>
                        <div className="text-xs font-medium text-slate-800 dark:text-slate-200 line-clamp-2">
                          {e.causa}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          Frec. Diseño: <span className="font-bold">{e.frecuencia_diseno}</span> · {e.n_barreras} barreras
                        </div>
                      </td>
                      <td className="max-w-xs text-xs text-slate-600 dark:text-slate-300 line-clamp-2">
                        {e.consecuencia}
                      </td>
                      <td className="text-center font-mono text-xs">
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 tracking-wider">
                          {e.imp_economico}-{e.imp_personas}-{e.imp_ambiente}-{e.imp_reputacion}
                        </span>
                      </td>
                      <td className="text-center">
                        {res ? (
                          <span className={`chip ${NIVEL_CLASES[res.riesgo_inherente]}`}>
                            {res.riesgo_inherente}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="text-center">
                        {res ? (
                          <div className="flex flex-col items-center">
                            <span className={`chip ${NIVEL_CLASES[res.riesgo_diseno]}`}>
                              {res.riesgo_diseno}
                            </span>
                            <span className="text-[10px] text-slate-400 mt-0.5">
                              Frec: {res.frecuencia_diseno_resid}
                            </span>
                          </div>
                        ) : '—'}
                      </td>
                      <td className="text-center">
                        {res ? (
                          <div className="flex flex-col items-center">
                            <span className={`chip ${NIVEL_CLASES[res.riesgo_actual]}`}>
                              {res.riesgo_actual}
                            </span>
                            <span className="text-[10px] text-slate-400 mt-0.5">
                              Frec: {res.frecuencia_actual}
                            </span>
                          </div>
                        ) : '—'}
                      </td>
                      <td className="text-center font-bold">
                        {res ? (
                          <span
                            className={`px-2 py-0.5 rounded text-xs ${
                              res.brecha > 0
                                ? 'bg-red-100 text-red-800 dark:bg-red-900/60 dark:text-red-300 font-extrabold'
                                : 'text-slate-500'
                            }`}
                          >
                            {fmtBrecha(res.brecha)}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="text-center">
                        <Link
                          to={`/bowtie/${e.id}`}
                          className="btn-secondary text-xs px-2.5 py-1 whitespace-nowrap"
                        >
                          Ver BowTie ➔
                        </Link>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Paginación */}
        {resp && resp.total > resp.size && (
          <div className="p-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
            <div>
              Mostrando {resp.items.length} de {resp.total} escenarios
            </div>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(p - 1, 1))}
                className="btn-secondary text-xs px-2 py-1"
              >
                Anterior
              </button>
              <span className="font-semibold text-slate-700 dark:text-slate-300">
                Página {resp.page} de {Math.ceil(resp.total / resp.size)}
              </span>
              <button
                disabled={page * resp.size >= resp.total}
                onClick={() => setPage((p) => p + 1)}
                className="btn-secondary text-xs px-2 py-1"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
