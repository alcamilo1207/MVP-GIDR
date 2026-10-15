import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { Auditoria, Pagina } from '../lib/types'
import { fmtFecha } from '../lib/format'

export const AuditoriaView: React.FC = () => {
  const [accionFiltro, setAccionFiltro] = useState('')
  const [entidadFiltro] = useState('')
  const [page, setPage] = useState(1)

  const { data: resp, isLoading } = useQuery<Pagina<Auditoria>>({
    queryKey: ['auditoria', accionFiltro, entidadFiltro, page],
    queryFn: () =>
      api.get<Pagina<Auditoria>>('/auditoria', {
        accion: accionFiltro || undefined,
        entidad: entidadFiltro || undefined,
        page,
        size: 20,
      }),
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Bitácora de Auditoría y Trazabilidad
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Registro inmutable de eventos: quién, qué, cuándo, antes y después de cada cambio operacional.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            className="input text-xs w-48"
            value={accionFiltro}
            onChange={(e) => {
              setAccionFiltro(e.target.value)
              setPage(1)
            }}
          >
            <option value="">Todas las Acciones</option>
            <option value="CAMBIO_ESTADO_BARRERA">Cambio Estado Barrera</option>
            <option value="INGESTA_CMMS">Ingesta CMMS</option>
            <option value="IMPORTAR_HAZOP">Importar HAZOP</option>
            <option value="CREAR_BARRERA_TEMPORAL">Crear Barrera Temporal</option>
            <option value="RECALCULO">Recálculo de Riesgo</option>
          </select>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th className="w-16">ID</th>
                <th>Fecha / Hora</th>
                <th>Usuario</th>
                <th>Acción Realizada</th>
                <th>Entidad Afectada</th>
                <th>Detalle (Antes / Después)</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-slate-400">
                    Cargando bitácora de auditoría...
                  </td>
                </tr>
              ) : resp?.items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-slate-400">
                    No se registran eventos de auditoría con los criterios seleccionados.
                  </td>
                </tr>
              ) : (
                resp?.items.map((a) => (
                  <tr key={a.id} className="text-xs">
                    <td className="font-mono text-slate-400 font-bold">#{a.id}</td>
                    <td className="whitespace-nowrap font-medium text-slate-700 dark:text-slate-300">
                      {fmtFecha(a.ts)}
                    </td>
                    <td>
                      <span className="chip bg-slate-100 dark:bg-slate-800 font-mono text-[11px]">
                        {a.usuario}
                      </span>
                    </td>
                    <td>
                      <span className="font-semibold text-brand-700 dark:text-brand-400">
                        {a.accion}
                      </span>
                    </td>
                    <td>
                      <span className="text-slate-500">
                        {a.entidad} {a.entidad_id ? `(#${a.entidad_id})` : ''}
                      </span>
                    </td>
                    <td className="max-w-md">
                      <div className="space-y-1">
                        {a.antes && (
                          <div className="text-[10px] text-slate-500">
                            <span className="font-semibold text-slate-400">Antes:</span>{' '}
                            <code className="text-slate-600 dark:text-slate-300 font-mono">
                              {JSON.stringify(a.antes)}
                            </code>
                          </div>
                        )}
                        {a.despues && (
                          <div className="text-[10px]">
                            <span className="font-semibold text-emerald-600 dark:text-emerald-400">Después:</span>{' '}
                            <code className="text-slate-700 dark:text-slate-200 font-mono">
                              {JSON.stringify(a.despues)}
                            </code>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {resp && resp.total > resp.size && (
          <div className="p-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
            <div>Total: {resp.total} registros</div>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(p - 1, 1))}
                className="btn-secondary text-xs px-2 py-1"
              >
                Anterior
              </button>
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
