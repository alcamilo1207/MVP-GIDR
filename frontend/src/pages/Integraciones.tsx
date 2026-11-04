import React, { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import type {
  Barrera,
  Conector,
  Importacion,
  Ingesta,
  Pagina,
  SistemaFuenteGemelo,
  TipoEvaluacionGemelo,
  VinculoGemelo,
} from '../lib/types'
import { ESTADO_CLASES, ESTADO_ETIQUETA } from '../lib/format'

const FUENTE_BADGE: Record<string, string> = {
  SIS: 'bg-rose-100 text-rose-800 border border-rose-300',
  DCS_SCADA: 'bg-sky-100 text-sky-800 border border-sky-300',
  HISTORIADOR_IOW: 'bg-amber-100 text-amber-900 border border-amber-300',
  CMMS: 'bg-purple-100 text-purple-800 border border-purple-300',
  GEMELO_DIGITAL: 'bg-emerald-100 text-emerald-800 border border-emerald-300',
}

const FUENTE_ETIQUETA: Record<string, string> = {
  SIS: 'SIS',
  DCS_SCADA: 'DCS_SCADA',
  HISTORIADOR_IOW: 'HISTORIADOR_IOW',
  CMMS: 'CMMS',
  GEMELO_DIGITAL: 'DATOS_TELEMETRÍA',
}

const REGLA_ETIQUETA: Record<string, string> = {
  ESTADO_DISCRETO: 'Discreto (0=OK, 1=Bypass, 2=Mant, 3=Degr)',
  UMBRAL_IOW: 'Ventana IOW (Umbral Alerta / Crítico)',
  SALUD_DEGRADACION: 'Índice Degradación Continua (0–100%)',
}

export const Integraciones: React.FC = () => {
  const queryClient = useQueryClient()
  const { usuario } = useAuth()
  const esAdmin = usuario?.rol === 'admin'

  const [archivoHazop, setArchivoHazop] = useState<File | null>(null)
  const [archivoCmms, setArchivoCmms] = useState<File | null>(null)
  const [resHazop, setResHazop] = useState<Importacion | null>(null)
  const [resCmms, setResCmms] = useState<Ingesta | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Estados de vista de Datos de Telemetría
  const [mostrarGuiaApi, setMostrarGuiaApi] = useState(false)
  const [mostrarFormVinculo, setMostrarFormVinculo] = useState(false)
  const [filtroFuente, setFiltroFuente] = useState<string>('')

  // Formulario nuevo vínculo
  const [nuevoBarreraId, setNuevoBarreraId] = useState<number>(0)
  const [nuevoFuente, setNuevoFuente] =
    useState<SistemaFuenteGemelo>('GEMELO_DIGITAL')
  const [nuevoTagGemelo, setNuevoTagGemelo] = useState('')
  const [nuevoDescripcion, setNuevoDescripcion] = useState('')
  const [nuevoTipoEval, setNuevoTipoEval] =
    useState<TipoEvaluacionGemelo>('SALUD_DEGRADACION')
  const [nuevoUnidad, setNuevoUnidad] = useState('%')
  const [nuevoUmbralAlerta, setNuevoUmbralAlerta] = useState<number>(80)
  const [nuevoUmbralCritico, setNuevoUmbralCritico] = useState<number>(110)

  const { data: conectores } = useQuery<Conector[]>({
    queryKey: ['conectores'],
    queryFn: () => api.get<Conector[]>('/integraciones/conectores'),
  })

  const { data: vinculos, isLoading: cargandoVinculos } = useQuery<
    VinculoGemelo[]
  >({
    queryKey: ['vinculos-gemelo'],
    queryFn: () => api.get<VinculoGemelo[]>('/integraciones/gemelo/vinculos'),
  })

  const { data: barrerasData } = useQuery<Pagina<Barrera>>({
    queryKey: ['barreras-lista-gd'],
    queryFn: () => api.get<Pagina<Barrera>>('/barreras', { size: 200 }),
  })

  const mutacionCrearVinculo = useMutation({
    mutationFn: () =>
      api.post<VinculoGemelo>('/integraciones/gemelo/vinculos', {
        barrera_id: nuevoBarreraId || barrerasData?.items[0]?.id,
        sistema_fuente: nuevoFuente,
        tag_gemelo: nuevoTagGemelo,
        descripcion:
          nuevoDescripcion || 'Señal vinculada a Datos de Telemetría de Planta',
        tipo_evaluacion: nuevoTipoEval,
        unidad_ing: nuevoUnidad,
        umbral_alerta:
          nuevoTipoEval === 'UMBRAL_IOW' ? nuevoUmbralAlerta : null,
        umbral_critico:
          nuevoTipoEval === 'UMBRAL_IOW' ? nuevoUmbralCritico : null,
        activo: true,
      }),
    onSuccess: () => {
      setMostrarFormVinculo(false)
      setNuevoTagGemelo('')
      setNuevoDescripcion('')
      queryClient.invalidateQueries({ queryKey: ['vinculos-gemelo'] })
    },
    onError: (err: Error) => setErrorMsg(err.message),
  })

  const mutacionEliminarVinculo = useMutation({
    mutationFn: (id: number) => api.del(`/integraciones/gemelo/vinculos/${id}`),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['vinculos-gemelo'] }),
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
    onError: (err: Error) =>
      setErrorMsg(err.message || 'Error importando HAZOP'),
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
    onError: (err: Error) =>
      setErrorMsg(err.message || 'Error cargando CSV CMMS'),
  })

  const vinculosFiltrados = (vinculos ?? []).filter((v) =>
    filtroFuente ? v.sistema_fuente === filtroFuente : true
  )

  return (
    <div className="space-y-6">
      <div className="pb-2 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            HUB de Integración y Datos de Telemetría en Tiempo Real
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Vínculos dinámicos entre señales de planta / Datos de Telemetría (DCS, SIS, Historiador IOW, CMMS) y las barreras de los Escenarios PHA.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setMostrarGuiaApi((v) => !v)}
            className="btn-secondary text-xs"
          >
            {mostrarGuiaApi
              ? 'Ocultar Contrato API de Telemetría'
              : '🔌 Cómo conectar tus Datos de Telemetría Externos'}
          </button>
          {esAdmin && (
            <button
              type="button"
              onClick={() => setMostrarFormVinculo((v) => !v)}
              className="btn-secondary text-xs"
            >
              + Nuevo Vínculo Tag ↔ Barrera
            </button>
          )}
        </div>
      </div>

      {errorMsg && (
        <div className="p-3 bg-red-50 border border-red-200 dark:bg-red-950/40 dark:border-red-900/60 rounded-lg text-xs text-red-700 dark:text-red-300 flex items-center justify-between">
          <span>{errorMsg}</span>
          <button
            onClick={() => setErrorMsg(null)}
            className="font-bold ml-4"
          >
            ✕
          </button>
        </div>
      )}

      {/* Guía técnica desplegable para conectar Datos de Telemetría externos */}
      {mostrarGuiaApi && (
        <div className="card card-pad bg-slate-900 text-slate-100 border-slate-700 space-y-3 text-xs">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-emerald-400">
              🔌 Contrato de Conexión en Tiempo Real para Datos de Telemetría (Python / MATLAB / Simulink / OPC-UA)
            </h3>
            <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-700 text-[11px]">
              WebSocket & REST Activos
            </span>
          </div>
          <p className="text-slate-300">
            Tus fuentes externas de Datos de Telemetría de la planta pueden inyectar lecturas continuas o eventos discretos hacia GIDR por **WebSocket (`ws://localhost:8000/ws/gemelo`)** o por **HTTP REST (`POST /api/integraciones/gemelo/telemetria`)**. GIDR traduce cada lectura según la regla del vínculo, actualiza el `FRR_a` y empuja los nuevos riesgos en vivo a todas las pantallas abiertas.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-slate-950 p-3 rounded border border-slate-800 font-mono text-[11px] overflow-x-auto">
              <div className="text-sky-400 font-sans font-semibold mb-1">
                Opción A — Streaming continuo por WebSocket (Python):
              </div>
              <pre>{`import asyncio, json, websockets

async def enviar_telemetria():
    uri = "ws://localhost:8000/ws/gemelo"
    async with websockets.connect(uri) as ws:
        await ws.send(json.dumps({
            "lecturas": [
                {"tag_gemelo": "GD.HIST.PSV-101.EXCURSION_IOW", "valor": 96.5},
                {"tag_gemelo": "GD.SIS.SDV-101.MOS_BYPASS", "valor": 1}
            ]
        }))
        resp = await ws.recv()
        print("Riesgo recalculado:", resp)

asyncio.run(enviar_telemetria())`}</pre>
            </div>
            <div className="bg-slate-950 p-3 rounded border border-slate-800 font-mono text-[11px] overflow-x-auto">
              <div className="text-amber-400 font-sans font-semibold mb-1">
                Opción B — Envío por REST API (POST /api/integraciones/gemelo/telemetria):
              </div>
              <pre>{`POST http://localhost:8000/integraciones/gemelo/telemetria
Authorization: Bearer <TOKEN_ADMIN>
Content-Type: application/json

{
  "lecturas": [
    {
      "tag_gemelo": "GD.DCS.PV-101.DEGRADACION_LAZO",
      "valor": 65.0
    }
  ]
}`}</pre>
            </div>
          </div>
        </div>
      )}

      {/* Formulario para crear un nuevo vínculo dinámico */}
      {mostrarFormVinculo && esAdmin && (
        <div className="card card-pad bg-sky-50/50 border-sky-200 space-y-3">
          <h3 className="text-sm font-bold text-slate-900">
            Crear Nuevo Vínculo Dinámico (Señal de Planta / Datos de Telemetría ↔ Barrera PHA)
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
            <div>
              <label className="label">Barrera PHA Objetivo</label>
              <select
                className="input text-xs"
                value={nuevoBarreraId || barrerasData?.items[0]?.id || ''}
                onChange={(e) => setNuevoBarreraId(Number(e.target.value))}
              >
                {barrerasData?.items.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.tag_activo} — {b.descripcion.slice(0, 45)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Sistema Fuente en Planta</label>
              <select
                className="input text-xs"
                value={nuevoFuente}
                onChange={(e) =>
                  setNuevoFuente(e.target.value as SistemaFuenteGemelo)
                }
              >
                <option value="GEMELO_DIGITAL">Datos de Telemetría (Modelo / Planta)</option>
                <option value="DCS_SCADA">DCS / SCADA (Lazos y Alarmas)</option>
                <option value="SIS">SIS (Bypass MOS / Diagnóstico)</option>
                <option value="HISTORIADOR_IOW">Historiador (Ventanas IOW)</option>
                <option value="CMMS">CMMS / SAP PM (Órdenes Mant.)</option>
              </select>
            </div>
            <div>
              <label className="label">Tag de Datos de Telemetría / Planta</label>
              <input
                className="input text-xs font-mono"
                placeholder="Ej. GD.U100.V101.PT101D.PV"
                value={nuevoTagGemelo}
                onChange={(e) => setNuevoTagGemelo(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Regla de Traducción al Estado</label>
              <select
                className="input text-xs"
                value={nuevoTipoEval}
                onChange={(e) =>
                  setNuevoTipoEval(e.target.value as TipoEvaluacionGemelo)
                }
              >
                <option value="SALUD_DEGRADACION">
                  Degradación Continua (0–100%)
                </option>
                <option value="UMBRAL_IOW">
                  Umbral de Variable Proceso (IOW)
                </option>
                <option value="ESTADO_DISCRETO">
                  Estado Discreto (0=OK, 1=Bypass, 2=Mant)
                </option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs items-end">
            <div className="md:col-span-2">
              <label className="label">Descripción de la Señal</label>
              <input
                className="input text-xs"
                placeholder="Ej. Presión en cabezal de entrada a separador V-101"
                value={nuevoDescripcion}
                onChange={(e) => setNuevoDescripcion(e.target.value)}
              />
            </div>
            {nuevoTipoEval === 'UMBRAL_IOW' ? (
              <>
                <div>
                  <label className="label">Umbral Alerta (Inicia Degradación)</label>
                  <input
                    type="number"
                    className="input text-xs"
                    value={nuevoUmbralAlerta}
                    onChange={(e) =>
                      setNuevoUmbralAlerta(Number(e.target.value))
                    }
                  />
                </div>
                <div>
                  <label className="label">Umbral Crítico (Falla / 100%)</label>
                  <input
                    type="number"
                    className="input text-xs"
                    value={nuevoUmbralCritico}
                    onChange={(e) =>
                      setNuevoUmbralCritico(Number(e.target.value))
                    }
                  />
                </div>
              </>
            ) : (
              <div>
                <label className="label">Unidad de Ingeniería</label>
                <input
                  className="input text-xs"
                  value={nuevoUnidad}
                  onChange={(e) => setNuevoUnidad(e.target.value)}
                />
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setMostrarFormVinculo(false)}
              className="btn-secondary text-xs"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={!nuevoTagGemelo.trim() || mutacionCrearVinculo.isPending}
              onClick={() => mutacionCrearVinculo.mutate()}
              className="btn-primary text-xs"
            >
              Guardar Vínculo Dinámico
            </button>
          </div>
        </div>
      )}

      {/* PANEL PRINCIPAL: MATRIZ DE VÍNCULOS DINÁMICOS DE DATOS DE TELEMETRÍA */}
      <div className="card overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span>⚡ Vínculos Dinámicos Planta / Datos de Telemetría ↔ Barreras PHA</span>
              <span className="chip bg-emerald-100 text-emerald-800 text-[11px]">
                {vinculos?.length ?? 0} tags vinculados
              </span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Monitoreo en tiempo real de señales provenientes de tus fuentes externas de Datos de Telemetría para actualizar el FRR actual y el riesgo en Escenarios PHA y BowTie.
            </p>
          </div>
        </div>

        {/* Barra de filtro por sistema fuente */}
        <div className="px-4 py-2 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500 font-medium">Filtrar sistema:</span>
            {(['', 'SIS', 'DCS_SCADA', 'HISTORIADOR_IOW', 'CMMS', 'GEMELO_DIGITAL'] as const).map(
              (f) => (
                <button
                  key={f || 'TODOS'}
                  type="button"
                  onClick={() => setFiltroFuente(f)}
                  className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors ${
                    filtroFuente === f
                      ? 'bg-[#1e4e79] text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {f ? (FUENTE_ETIQUETA[f] ?? f) : 'Todos'}
                </button>
              )
            )}
          </div>
        </div>

        {/* Tabla de vínculos dinámicos */}
        <div className="overflow-x-auto max-h-[520px]">
          <table className="w-full border-collapse text-xs">
            <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 sticky top-0 z-10">
              <tr>
                <th className="border-b border-slate-300 px-3 py-2 text-left">
                  Sistema
                </th>
                <th className="border-b border-slate-300 px-3 py-2 text-left">
                  Tag de Datos de Telemetría / Planta
                </th>
                <th className="border-b border-slate-300 px-3 py-2 text-left">
                  Barrera PHA Vinculada
                </th>
                <th className="border-b border-slate-300 px-3 py-2 text-left">
                  Regla de Evaluación
                </th>
                <th className="border-b border-slate-300 px-3 py-2 text-center">
                  Última Lectura Telemetría
                </th>
                <th className="border-b border-slate-300 px-3 py-2 text-center">
                  Estado Barrera Resultante
                </th>
                {esAdmin && (
                  <th className="border-b border-slate-300 px-3 py-2 text-center w-20">
                    Acciones
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {cargandoVinculos && (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-slate-400">
                    Cargando vínculos de Datos de Telemetría...
                  </td>
                </tr>
              )}
              {vinculosFiltrados.map((v) => (
                <tr
                  key={v.id}
                  className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                >
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        FUENTE_BADGE[v.sistema_fuente] ??
                        'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {FUENTE_ETIQUETA[v.sistema_fuente] ?? v.sistema_fuente}
                    </span>
                  </td>

                  <td className="px-3 py-2.5">
                    <div className="font-mono font-bold text-slate-900 dark:text-white text-[11.5px]">
                      {v.tag_gemelo}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {v.descripcion.replace(/Gemelo Digital/gi, 'Datos de Telemetría')}
                    </div>
                  </td>

                  <td className="px-3 py-2.5">
                    <div className="font-mono font-bold text-[#1e4e79] dark:text-sky-400">
                      {v.barrera_tag}
                    </div>
                    <div className="text-[11px] text-slate-500 truncate max-w-[210px]">
                      {v.barrera_descripcion} (FRR<sub>d</sub>: {v.barrera_frr_diseno})
                    </div>
                  </td>

                  <td className="px-3 py-2.5">
                    <div className="font-medium text-slate-800 dark:text-slate-200">
                      {REGLA_ETIQUETA[v.tipo_evaluacion] ?? v.tipo_evaluacion}
                    </div>
                    {v.tipo_evaluacion === 'UMBRAL_IOW' && (
                      <div className="text-[10.5px] text-slate-500">
                        Alerta: <b>{v.umbral_alerta}</b> · Crítico:{' '}
                        <b>{v.umbral_critico}</b> {v.unidad_ing}
                      </div>
                    )}
                  </td>

                  <td className="px-3 py-2.5 text-center font-mono">
                    <span className="font-bold text-slate-900 dark:text-white">
                      {v.ultimo_valor !== null ? v.ultimo_valor : '—'}
                    </span>{' '}
                    <span className="text-[10px] text-slate-500">
                      {v.unidad_ing}
                    </span>
                  </td>

                  <td className="px-3 py-2.5 text-center whitespace-nowrap">
                    <span className={`chip ${ESTADO_CLASES[v.barrera_estado]}`}>
                      {ESTADO_ETIQUETA[v.barrera_estado] ?? v.barrera_estado}
                    </span>
                    {v.barrera_estado === 'DEGRADADO' && (
                      <div className="text-[10.5px] font-mono font-semibold text-amber-800 mt-0.5">
                        Degradación: {v.barrera_factor_degradacion}%
                      </div>
                    )}
                  </td>

                  {esAdmin && (
                    <td className="px-3 py-2.5 text-center">
                      <button
                        type="button"
                        title="Eliminar vínculo"
                        onClick={() => mutacionEliminarVinculo.mutate(v.id)}
                        className="text-slate-400 hover:text-rose-600 px-1.5 py-0.5 rounded hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                      >
                        🗑️
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Grid de 2 Ingestas por Lotes: HAZOP y CMMS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 1. Ingesta HAZOP */}
        <div className="card card-pad flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  1. Estudio HAZOP (Diseño por Lotes)
                </h2>
                <p className="text-xs text-slate-500">
                  Carga la taxonomía completa, causas, consecuencias y barreras FRR desde Excel o CSV.
                </p>
              </div>
              <span className="chip bg-blue-100 text-blue-800 text-[10px] font-bold">
                Excel / CSV
              </span>
            </div>

            <div className="p-4 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-lg text-center bg-slate-50 dark:bg-slate-800/30">
              <input
                type="file"
                accept=".xlsx,.csv"
                onChange={(e) => setArchivoHazop(e.target.files?.[0] || null)}
                className="text-xs file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100 dark:file:bg-slate-700 dark:file:text-white"
              />
            </div>

            <div className="flex items-center justify-between gap-2">
              <button
                onClick={() =>
                  api.descargar(
                    '/integraciones/hazop/plantilla?formato=xlsx',
                    'plantilla_hazop.xlsx'
                  )
                }
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

            {resHazop && (
              <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-lg border border-slate-200 dark:border-slate-700 text-xs space-y-1.5">
                <div className="font-bold text-emerald-600 dark:text-emerald-400">
                  ✓ Ingesta completada ({resHazop.filas_aceptadas}/
                  {resHazop.filas_totales} filas)
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 2. Ingesta Eventos CMMS */}
        <div className="card card-pad flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  2. Eventos CMMS / SAP PM (Carga CSV)
                </h2>
                <p className="text-xs text-slate-500">
                  Actualiza estados operacionales de barreras por lote desde órdenes de trabajo.
                </p>
              </div>
              <span className="chip bg-purple-100 text-purple-800 text-[10px] font-bold">
                CSV / REST
              </span>
            </div>

            <div className="p-4 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-lg text-center bg-slate-50 dark:bg-slate-800/30">
              <input
                type="file"
                accept=".csv"
                onChange={(e) => setArchivoCmms(e.target.files?.[0] || null)}
                className="text-xs file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100 dark:file:bg-slate-700 dark:file:text-white"
              />
            </div>

            <div className="flex items-center justify-between gap-2">
              <button
                onClick={() =>
                  api.descargar(
                    '/integraciones/cmms/ejemplo',
                    'cmms_ejemplo.csv'
                  )
                }
                className="btn-secondary text-xs px-2.5 py-1.5"
              >
                📥 Descargar CSV de Ejemplo
              </button>
              <button
                disabled={!archivoCmms || mutacionCmms.isPending}
                onClick={() => mutacionCmms.mutate()}
                className="btn-primary text-xs px-4 py-1.5"
              >
                {mutacionCmms.isPending ? 'Procesando...' : 'Ingestar CSV CMMS'}
              </button>
            </div>

            {resCmms && (
              <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-lg border border-slate-200 dark:border-slate-700 text-xs space-y-1.5">
                <div className="font-bold text-emerald-600 dark:text-emerald-400">
                  ✓ {resCmms.aceptados} eventos aplicados ·{' '}
                  {resCmms.escenarios_recalculados} escenarios recalculados
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Estado de Conectores Registrados */}
      <div className="card card-pad">
        <h2 className="text-sm font-bold text-slate-900 dark:text-white mb-3">
          Conectores de Planta Registrados en el Motor
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {conectores?.map((c) => (
            <div
              key={c.nombre}
              className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 flex items-start justify-between gap-2 bg-slate-50/50 dark:bg-slate-800/30"
            >
              <div>
                <div className="font-mono font-bold text-xs text-slate-900 dark:text-white">
                  {FUENTE_ETIQUETA[c.nombre] ?? c.nombre}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  {c.descripcion.replace(/Gemelo Digital/gi, 'Datos de Telemetría')}
                </div>
              </div>
              <span
                className={`chip text-[10px] shrink-0 ${
                  c.implementado
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-slate-200 text-slate-600'
                }`}
              >
                {c.implementado ? 'Activo' : 'Stub'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
