import React, { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { Conector, Importacion, Ingesta } from '../lib/types'
import { ESTADO_CLASES, ESTADO_ETIQUETA } from '../lib/format'

export const Integraciones: React.FC = () => {
  const queryClient = useQueryClient()
  const [archivoHazop, setArchivoHazop] = useState<File | null>(null)
  const [archivoCmms, setArchivoCmms] = useState<File | null>(null)

  const [resHazop, setResHazop] = useState<Importacion | null>(null)
  const [resCmms, setResCmms] = useState<Ingesta | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const { data: conectores } = useQuery<Conector[]>({
    queryKey: ['conectores'],
    queryFn: () => api.get<Conector[]>('/integraciones/conectores'),
  })

  // Mutación para Importar HAZOP
  const mutacionHazop = useMutation({
    mutationFn: async () => {
      if (!archivoHazop) return
      setErrorMsg(null)
      const form = new FormData()
      form.append('archivo', archivoHazop)
      return api.post<Importacion>('/integraciones/hazop/importar', form)
    },
    onSuccess: (data) => {
      if (data) {
        setResHazop(data)
        queryClient.invalidateQueries()
      }
    },
    onError: (err: Error) => setErrorMsg(err.message || 'Error importando HAZOP'),
  })

  // Mutación para Cargar CSV CMMS
  const mutacionCmms = useMutation({
    mutationFn: async () => {
      if (!archivoCmms) return
      setErrorMsg(null)
      const form = new FormData()
      form.append('archivo', archivoCmms)
      return api.post<Ingesta>('/integraciones/cmms/csv', form)
    },
    onSuccess: (data) => {
      if (data) {
        setResCmms(data)
        queryClient.invalidateQueries()
      }
    },
    onError: (err: Error) => setErrorMsg(err.message || 'Error cargando CSV CMMS'),
  })

  return (
    <div className="space-y-6">
      <div className="pb-2 border-b border-slate-200 dark:border-slate-800">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          HUB de Integración e Ingesta de Datos
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Conexión con estudios HAZOP semicuantitativos y órdenes de trabajo operacionales de CMMS / SAP PM.
        </p>
      </div>

      {errorMsg && (
        <div className="p-3 bg-red-50 border border-red-200 dark:bg-red-950/40 dark:border-red-900/60 rounded-lg text-xs text-red-700 dark:text-red-300">
          {errorMsg}
        </div>
      )}

      {/* Grid de 2 Ingestas: HAZOP y CMMS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 1. Ingesta HAZOP */}
        <div className="card card-pad flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">1. Estudio HAZOP (Diseño)</h2>
                <p className="text-xs text-slate-500">Carga la taxonomía completa, causas, consecuencias y barreras FRR.</p>
              </div>
              <span className="chip bg-blue-100 text-blue-800 text-[10px] font-bold">Excel / CSV</span>
            </div>

            <div className="p-4 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-lg text-center bg-slate-50 dark:bg-slate-800/30">
              <input
                type="file"
                accept=".xlsx,.csv"
                onChange={(e) => setArchivoHazop(e.target.files?.[0] || null)}
                className="text-xs file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100 dark:file:bg-slate-700 dark:file:text-white"
              />
              <div className="text-[11px] text-slate-400 mt-2">
                Idempotente: no duplica escenarios y valida campos por fila.
              </div>
            </div>

            <div className="flex items-center justify-between gap-2">
              <button
                onClick={() => api.descargar('/integraciones/hazop/plantilla?formato=xlsx', 'plantilla_hazop.xlsx')}
                className="btn-secondary text-xs px-2.5 py-1.5"
              >
                📥 Descargar Plantilla XLSX
              </button>
              <button
                disabled={!archivoHazop || mutacionHazop.isPending}
                onClick={() => mutacionHazop.mutate()}
                className="btn-primary text-xs px-4 py-1.5"
              >
                {mutacionHazop.isPending ? 'Importando...' : 'Importar HAZOP'}
              </button>
            </div>

            {/* Resultado Ingesta HAZOP */}
            {resHazop && (
              <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-lg border border-slate-200 dark:border-slate-700 text-xs space-y-1.5">
                <div className="font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  ✓ Ingesta completada con éxito
                </div>
                <div className="grid grid-cols-2 gap-1 text-[11px] text-slate-600 dark:text-slate-300">
                  <span>Filas aceptadas: <strong>{resHazop.filas_aceptadas}</strong></span>
                  <span>Escenarios nuevos: <strong>{resHazop.escenarios_creados}</strong></span>
                  <span>Barreras registradas: <strong>{resHazop.barreras_creadas}</strong></span>
                  <span>Vínculos creados: <strong>{resHazop.vinculos_creados}</strong></span>
                </div>
                {resHazop.errores.length > 0 && (
                  <div className="mt-2 text-red-600 text-[10px]">
                    {resHazop.errores.length} fila(s) con observaciones de validación.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 2. Ingesta CMMS (Simulador de Mantenimiento) */}
        <div className="card card-pad flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">2. Conector CMMS / Mantenimiento</h2>
                <p className="text-xs text-slate-500">Actualiza estados de barreras desde órdenes de trabajo (OT).</p>
              </div>
              <span className="chip bg-amber-100 text-amber-800 text-[10px] font-bold">CSV Eventos</span>
            </div>

            <div className="p-4 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-lg text-center bg-slate-50 dark:bg-slate-800/30">
              <input
                type="file"
                accept=".csv"
                onChange={(e) => setArchivoCmms(e.target.files?.[0] || null)}
                className="text-xs file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-amber-50 file:text-amber-800 hover:file:bg-amber-100 dark:file:bg-slate-700 dark:file:text-white"
              />
              <div className="text-[11px] text-slate-400 mt-2">
                Simula la sincronización periódica desde SAP PM / Maximo.
              </div>
            </div>

            <div className="flex items-center justify-between gap-2">
              <button
                onClick={() => api.descargar('/integraciones/cmms/ejemplo', 'cmms_ejemplo.csv')}
                className="btn-secondary text-xs px-2.5 py-1.5"
              >
                📥 Descargar CSV de Prueba (Demo)
              </button>
              <button
                disabled={!archivoCmms || mutacionCmms.isPending}
                onClick={() => mutacionCmms.mutate()}
                className="btn-primary text-xs px-4 py-1.5 bg-amber-600 hover:bg-amber-700"
              >
                {mutacionCmms.isPending ? 'Procesando...' : 'Cargar Estados CMMS'}
              </button>
            </div>

            {/* Resultado Ingesta CMMS */}
            {resCmms && (
              <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-lg border border-slate-200 dark:border-slate-700 text-xs space-y-2">
                <div className="font-bold text-slate-900 dark:text-white flex items-center justify-between">
                  <span>Resultado de la Ingesta Operacional:</span>
                  <span className="chip bg-slate-200 dark:bg-slate-700 text-[10px]">
                    {resCmms.aceptados} procesados
                  </span>
                </div>

                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                  {resCmms.cambios_estado.map((c, i) => (
                    <div key={i} className="flex justify-between items-center text-[11px] p-1.5 rounded bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
                      <span className="font-mono font-bold">{c.tag_activo}</span>
                      <div className="flex items-center gap-1.5">
                        <span className={`chip text-[9px] ${ESTADO_CLASES[c.antes]}`}>{ESTADO_ETIQUETA[c.antes]}</span>
                        <span>➔</span>
                        <span className={`chip text-[9px] ${ESTADO_CLASES[c.despues]}`}>{ESTADO_ETIQUETA[c.despues]}</span>
                      </div>
                      <span className="text-slate-400 text-[10px]">{c.escenarios_afectados} esc. recalculados</span>
                    </div>
                  ))}
                </div>

                {resCmms.no_mapeados.length > 0 && (
                  <div className="text-[10px] text-amber-700 dark:text-amber-400 font-medium">
                    ⚠️ TAGs no mapeados en HAZOP: {resCmms.no_mapeados.join(', ')}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Catálogo de Conectores (Arquitectura BaseConnector) */}
      <div className="card card-pad">
        <h2 className="text-sm font-bold text-slate-900 dark:text-white mb-2">
          Arquitectura de Conectores Industriales (BaseConnector)
        </h2>
        <p className="text-xs text-slate-500 mb-4">
          Conectores desacoplados mediante interfaz abstracta para ingesta continua sin modificar el núcleo de cálculo.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {conectores?.map((c) => (
            <div
              key={c.nombre}
              className={`p-3 rounded-lg border text-xs flex flex-col justify-between ${
                c.implementado
                  ? 'border-emerald-400 bg-emerald-50/40 dark:bg-emerald-950/20 dark:border-emerald-800'
                  : 'border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/60'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono font-bold text-slate-900 dark:text-white">{c.nombre}</span>
                  {c.implementado ? (
                    <span className="chip bg-emerald-100 text-emerald-800 text-[9px]">Activo</span>
                  ) : (
                    <span className="chip bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-400 text-[9px]">Stub</span>
                  )}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">{c.descripcion}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
