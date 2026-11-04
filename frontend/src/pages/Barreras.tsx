import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { Barrera, Historial, Pagina } from '../lib/types'
import { ESTADOS, ESTADO_CLASES, ESTADO_ETIQUETA, fmtFecha } from '../lib/format'

export const Barreras: React.FC = () => {
  const queryClient = useQueryClient()
  const [estadoFiltro, setEstadoFiltro] = useState<string>('')
  const [tipoFiltro, setTipoFiltro] = useState<string>('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)

  // Estados del modal de Historial
  const [barreraHistorial, setBarreraHistorial] = useState<Barrera | null>(null)

  // Estados del modal de Alta de Barrera Temporal
  const [abrirModalTemporal, setAbrirModalTemporal] = useState(false)
  const [tagTemporal, setTagTemporal] = useState('')
  const [descTemporal, setDescTemporal] = useState('')
  const [mocTemporal, setMocTemporal] = useState('MOC-2026-DEMO')
  const [hastaTemporal, setHastaTemporal] = useState('2026-12-31')
  const [escenarioIdTemporal, setEscenarioIdTemporal] = useState<number>(24) // Escenario 24 es el de mayor brecha en la demo
  const [frrTemporal, setFrrTemporal] = useState<number>(100)

  const { data: resp, isLoading } = useQuery<Pagina<Barrera>>({
    queryKey: ['barreras', estadoFiltro, tipoFiltro, q, page],
    queryFn: () =>
      api.get<Pagina<Barrera>>('/barreras', {
        estado: estadoFiltro || undefined,
        tipo: tipoFiltro || undefined,
        q: q || undefined,
        page,
        size: 15,
      }),
  })

  const { data: histData, isLoading: cargandoHist } = useQuery<Historial[]>({
    queryKey: ['historial', barreraHistorial?.id],
    queryFn: () => api.get<Historial[]>(`/barreras/${barreraHistorial?.id}/historial`),
    enabled: !!barreraHistorial,
  })

  // Mutación para Crear Barrera Temporal (medida compensatoria)
  const mutacionCrearTemporal = useMutation({
    mutationFn: () =>
      api.post('/barreras', {
        tag_activo: tagTemporal,
        descripcion: descTemporal,
        tipo: 'TEMPORAL',
        vigencia_desde: new Date().toISOString().slice(0, 10),
        vigencia_hasta: hastaTemporal,
        moc_ref: mocTemporal,
        vinculos: [{ escenario_id: escenarioIdTemporal, frr_diseno: frrTemporal, lado: 'PREVENTIVA' }],
      }),
    onSuccess: () => {
      setAbrirModalTemporal(false)
      queryClient.invalidateQueries({ queryKey: ['barreras'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['escenarios'] })
    },
  })

  return (
    <div className="space-y-6">
      {/* Header y Filtros */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Inventario y Salud de Barreras</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Supervisa el estado operacional en tiempo real y gestiona barreras temporales con control MOC.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            placeholder="Buscar por TAG o descripción..."
            className="input text-xs w-52"
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setPage(1)
            }}
          />

          <select
            className="input text-xs w-44"
            value={estadoFiltro}
            onChange={(e) => {
              setEstadoFiltro(e.target.value)
              setPage(1)
            }}
          >
            <option value="">Todos los Estados</option>
            {ESTADOS.map((est) => (
              <option key={est} value={est}>{ESTADO_ETIQUETA[est]}</option>
            ))}
          </select>

          <select
            className="input text-xs w-36"
            value={tipoFiltro}
            onChange={(e) => {
              setTipoFiltro(e.target.value)
              setPage(1)
            }}
          >
            <option value="">Cualquier Tipo</option>
            <option value="EXISTENTE">Existentes</option>
            <option value="TEMPORAL">Temporales (MOC)</option>
          </select>

          <button
            onClick={() => {
              setTagTemporal(`TMP-OP-${Math.floor(100 + Math.random() * 900)}`)
              setDescTemporal('Ronda presencial de operador dedicada cada 30 min (Compensatoria)')
              setAbrirModalTemporal(true)
            }}
            className="btn-primary text-xs px-3 py-1.5"
          >
            + Medida Compensatoria (MOC)
          </button>
        </div>
      </div>

      {/* Tabla de Barreras */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>TAG Activo (CMMS)</th>
                <th>Descripción / Tipo</th>
                <th className="text-center">Estado Operacional</th>
                <th>Última Actualización</th>
                <th className="text-center">Escenarios Dependientes</th>
                <th className="text-center">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-slate-400">
                    Cargando barreras...
                  </td>
                </tr>
              ) : resp?.items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-slate-400">
                    No se encontraron barreras con los filtros especificados.
                  </td>
                </tr>
              ) : (
                resp?.items.map((b) => (
                  <tr key={b.id}>
                    <td>
                      <div className="font-mono text-xs font-bold text-slate-900 dark:text-slate-100">{b.tag_activo}</div>
                      {b.tipo === 'TEMPORAL' && (
                        <span className="chip bg-purple-100 text-purple-800 dark:bg-purple-950/70 dark:text-purple-300 text-[10px] mt-0.5">
                          Temporal · {b.moc_ref}
                        </span>
                      )}
                    </td>
                    <td className="max-w-sm text-xs text-slate-700 dark:text-slate-300">
                      {b.descripcion}
                      {b.vigencia_hasta && (
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          Vigencia hasta: {fmtFecha(b.vigencia_hasta, false)}
                        </div>
                      )}
                    </td>
                    <td className="text-center">
                      <span className={`chip ${ESTADO_CLASES[b.estado_actual]}`}>
                        {ESTADO_ETIQUETA[b.estado_actual]}
                      </span>
                    </td>
                    <td className="text-xs text-slate-500 whitespace-nowrap">
                      {fmtFecha(b.estado_actualizado)}
                    </td>
                    <td className="text-center font-bold text-xs">
                      <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800">
                        {b.n_escenarios} escenario(s)
                      </span>
                    </td>
                    <td className="text-center whitespace-nowrap">
                      <button
                        onClick={() => setBarreraHistorial(b)}
                        className="btn-secondary text-xs px-2.5 py-1"
                        title="Ver historial de cambios en TimescaleDB"
                      >
                        🕒 Historial
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: HISTORIAL DE BARRERA */}
      {barreraHistorial && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-xl w-full p-6 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex justify-between items-start pb-3 border-b border-slate-200 dark:border-slate-800">
              <div>
                <span className="text-xs font-bold text-slate-500 uppercase">Línea de Tiempo (TimescaleDB)</span>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  {barreraHistorial.tag_activo}
                </h3>
              </div>
              <button onClick={() => setBarreraHistorial(null)} className="text-slate-400 hover:text-slate-600 font-bold">
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {cargandoHist ? (
                <div className="p-8 text-center text-slate-400">Cargando eventos...</div>
              ) : histData?.length === 0 ? (
                <div className="p-8 text-center text-slate-400">Sin historial registrado</div>
              ) : (
                histData?.map((h, idx) => (
                  <div key={idx} className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 text-xs bg-slate-50 dark:bg-slate-800/40">
                    <div className="flex items-center justify-between">
                      <span className={`chip ${ESTADO_CLASES[h.estado]}`}>{ESTADO_ETIQUETA[h.estado]}</span>
                      <span className="text-slate-400 text-[11px]">{fmtFecha(h.ts)}</span>
                    </div>
                    <div className="mt-2 text-slate-600 dark:text-slate-300">
                      Fuente: <strong className="font-mono text-slate-800 dark:text-slate-200">{h.fuente}</strong>
                    </div>
                    {h.detalle && (
                      <pre className="mt-1 p-1.5 rounded bg-slate-100 dark:bg-slate-900 text-[10px] text-slate-600 dark:text-slate-400 overflow-x-auto">
                        {JSON.stringify(h.detalle, null, 2)}
                      </pre>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal 3: CREAR BARRERA TEMPORAL (MOC) */}
      {abrirModalTemporal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-lg w-full p-6 space-y-4">
            <div className="flex justify-between items-start pb-2 border-b border-slate-200 dark:border-slate-800">
              <div>
                <span className="text-xs font-bold text-purple-600 uppercase">Gestión del Cambio (MOC)</span>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Instalar Barrera Compensatoria Temporal
                </h3>
              </div>
              <button onClick={() => setAbrirModalTemporal(false)} className="text-slate-400 hover:text-slate-600 font-bold">
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="label">TAG Activo</label>
                <input
                  type="text"
                  className="input"
                  value={tagTemporal}
                  onChange={(e) => setTagTemporal(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="label">Descripción de la Medida</label>
                <input
                  type="text"
                  className="input"
                  value={descTemporal}
                  onChange={(e) => setDescTemporal(e.target.value)}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label">Referencia MOC</label>
                  <input
                    type="text"
                    className="input font-mono"
                    value={mocTemporal}
                    onChange={(e) => setMocTemporal(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="label">Vigencia Hasta</label>
                  <input
                    type="date"
                    className="input"
                    value={hastaTemporal}
                    onChange={(e) => setHastaTemporal(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label">Escenario a Proteger (ID)</label>
                  <input
                    type="number"
                    className="input font-mono"
                    value={escenarioIdTemporal}
                    onChange={(e) => setEscenarioIdTemporal(Number(e.target.value))}
                    required
                  />
                </div>
                <div>
                  <label className="label">FRR de Diseño Aportado</label>
                  <input
                    type="number"
                    className="input font-mono"
                    value={frrTemporal}
                    onChange={(e) => setFrrTemporal(Number(e.target.value))}
                    required
                  />
                </div>
              </div>
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <button onClick={() => setAbrirModalTemporal(false)} className="btn-secondary text-xs">
                Cancelar
              </button>
              <button
                onClick={() => mutacionCrearTemporal.mutate()}
                disabled={mutacionCrearTemporal.isPending}
                className="btn-primary text-xs"
              >
                {mutacionCrearTemporal.isPending ? 'Guardando...' : 'Habilitar Barrera Temporal'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
