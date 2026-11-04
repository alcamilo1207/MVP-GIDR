import React, { useEffect, useRef, useState } from 'react'
import {
  avanzarFisicaHorno,
  calcFrrEfectivo,
  ESCENARIOS_EVENTO_HORNO,
  EstadoBarreraGD,
  estadoInicialHorno,
  EstadoSimulacionHorno,
} from './engine/furnaceModel'
import { FurnacePID } from './components/FurnacePID'
import {
  guardarUrlWsGidr,
  PuenteGidr,
  resolverUrlWsGidr,
  RespuestaPuenteGidr,
} from './services/gidrBridge'

const ESTADOS_BARRERA: { valor: EstadoBarreraGD; etiqueta: string }[] = [
  { valor: 'DISPONIBLE', etiqueta: 'Disponible' },
  { valor: 'DEGRADADO', etiqueta: 'Degradado (1-100%)' },
  { valor: 'EN_MANTENIMIENTO', etiqueta: 'En Mantenimiento' },
  { valor: 'FUERA_DE_SERVICIO', etiqueta: 'Fuera de Servicio (Bypass)' },
  { valor: 'INEXISTENTE', etiqueta: 'Inexistente' },
]

export const App: React.FC = () => {
  const [estado, setEstado] = useState<EstadoSimulacionHorno>(() =>
    estadoInicialHorno()
  )
  const [corriendo, setCorriendo] = useState(true)
  const [autoSyncGidr, setAutoSyncGidr] = useState(true)
  const [wsConectado, setWsConectado] = useState(false)
  const [ultimaRespGidr, setUltimaRespGidr] =
    useState<RespuestaPuenteGidr | null>(null)
  const [barreraSeleccionada, setBarreraSeleccionada] =
    useState<string>('SIS-H101-TSHH')
  const [historialTmt, setHistorialTmt] = useState<number[]>([
    480, 480, 480, 480, 480, 480, 480, 480, 480, 480,
  ])

  const [modalUrlAbierto, setModalUrlAbierto] = useState(false)
  const [urlWsPersonalizada, setUrlWsPersonalizada] = useState(() => resolverUrlWsGidr())
  const envMeta = (import.meta as unknown as {
    env?: { VITE_GIDR_APP_URL?: string; DEV?: boolean }
  }).env
  const gidrAppUrl =
    envMeta?.VITE_GIDR_APP_URL ||
    (envMeta?.DEV ? 'http://localhost:3000' : 'https://gidr-frontend.onrender.com')

  const puenteRef = useRef<PuenteGidr | null>(null)
  const estadoRef = useRef<EstadoSimulacionHorno>(estado)
  estadoRef.current = estado

  // Inicializar puente WebSocket hacia GIDR
  useEffect(() => {
    const p = new PuenteGidr(
      (ok) => setWsConectado(ok),
      (resp) => setUltimaRespGidr(resp)
    )
    p.conectar(urlWsPersonalizada)
    puenteRef.current = p
    return () => p.desconectar()
  }, [])

  const reconectarConNuevaUrl = (nuevaUrl: string) => {
    const urlLimpia = nuevaUrl.trim()
    guardarUrlWsGidr(urlLimpia)
    setUrlWsPersonalizada(urlLimpia)
    if (puenteRef.current) {
      puenteRef.current.desconectar()
      puenteRef.current.conectar(urlLimpia)
    }
    setModalUrlAbierto(false)
  }

  // Ciclo físico del Gemelo Digital (cada 600 ms)
  useEffect(() => {
    if (!corriendo) return
    const timer = window.setInterval(() => {
      setEstado((prev) => {
        const sig = avanzarFisicaHorno(prev)
        setHistorialTmt((h) => [...h.slice(-23), sig.tempPielTubos])
        return sig
      })
    }, 600)
    return () => window.clearInterval(timer)
  }, [corriendo])

  // Sincronización periódica y por evento hacia GIDR
  const sincronizarAhora = (est: EstadoSimulacionHorno) => {
    puenteRef.current?.enviarEstadoHorno(est)
  }

  useEffect(() => {
    if (!autoSyncGidr || !wsConectado) return
    const timer = window.setInterval(() => {
      puenteRef.current?.enviarEstadoHorno(estadoRef.current)
    }, 2000)
    return () => window.clearInterval(timer)
  }, [autoSyncGidr, wsConectado])

  const dispararEscenario = (aplicar: (b: EstadoSimulacionHorno) => EstadoSimulacionHorno) => {
    const nuevo = avanzarFisicaHorno(aplicar(estado))
    setEstado(nuevo)
    sincronizarAhora(nuevo)
  }

  const restaurarNormal = () => {
    const normal = estadoInicialHorno()
    setEstado(normal)
    sincronizarAhora(normal)
  }

  const actualizarBarrera = (
    tag: string,
    cambios: Partial<{ estado: EstadoBarreraGD; factorDegradacion: number }>
  ) => {
    setEstado((prev) => {
      const actualB = prev.barreras[tag]
      if (!actualB) return prev
      const siguiente: EstadoSimulacionHorno = {
        ...prev,
        barreras: {
          ...prev.barreras,
          [tag]: {
            ...actualB,
            ...cambios,
          },
        },
      }
      const evaluado = avanzarFisicaHorno(siguiente)
      sincronizarAhora(evaluado)
      return evaluado
    })
  }

  const handleToggleBomba = () => {
    setEstado((prev) => {
      const sig = avanzarFisicaHorno({
        ...prev,
        bombaP101Activa: !prev.bombaP101Activa,
      })
      sincronizarAhora(sig)
      return sig
    })
  }

  const handleToggleLlama = () => {
    setEstado((prev) => {
      const encendiendo = !prev.llamaEncendida
      const siguiente: EstadoSimulacionHorno = {
        ...prev,
        llamaEncendida: encendiendo,
        aperturaTic101: encendiendo
          ? (prev.aperturaTic101 > 5 ? prev.aperturaTic101 : 52)
          : 0,
        presionGasCombustible: encendiendo
          ? (prev.presionGasCombustible >= 15 ? prev.presionGasCombustible : 45)
          : prev.presionGasCombustible,
        disparoSisEjecutado: encendiendo ? false : prev.disparoSisEjecutado,
        gasHidrocarburoLel: encendiendo ? 0 : prev.gasHidrocarburoLel,
        eventoDescripcion: encendiendo
          ? 'Quemadores re-encendidos y lazo térmico rearmado'
          : 'Quemadores apagados manualmente por el operador',
      }
      const sig = avanzarFisicaHorno(siguiente)
      sincronizarAhora(sig)
      return sig
    })
  }

  const alarmasActivas = Object.values(estado.barreras).filter(
    (b) => b.alarmaActiva || b.estado !== 'DISPONIBLE'
  )

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* CABECERA PRINCIPAL DE LA CONSOLA DEL GEMELO DIGITAL */}
      <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-30 px-4 py-2.5">
        <div className="max-w-[1800px] mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-orange-500 to-red-700 text-white font-black flex items-center justify-center shadow">
              GD
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold tracking-tight text-white">
                  Gemelo Digital de Planta — Horno de Crudo H-101
                </h1>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-800 text-sky-300 border border-slate-700">
                  Unidad CDU-100
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Simulador dinámico termohidráulico y de salud de salvaguardas conectado en tiempo real con GIDR.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 text-xs">
            {/* Estado de conexión WebSocket con GIDR */}
            <div
              onClick={() => setModalUrlAbierto(true)}
              title="Clic para configurar la URL WebSocket de GIDR"
              className={`px-3 py-1 rounded-full font-semibold flex items-center gap-2 border cursor-pointer hover:opacity-90 transition-opacity ${
                wsConectado
                  ? 'bg-emerald-950/70 text-emerald-300 border-emerald-700'
                  : 'bg-rose-950/70 text-rose-300 border-rose-700'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  wsConectado ? 'bg-emerald-400 animate-ping' : 'bg-rose-500'
                }`}
              />
              <span>
                {wsConectado
                  ? `Conectado a GIDR (${puenteRef.current?.urlActual || urlWsPersonalizada})`
                  : 'Reconectando a GIDR...'}
              </span>
              <span className="text-[10px] opacity-75 underline ml-0.5">⚙ Configurar</span>
            </div>

            <button
              type="button"
              onClick={() => setCorriendo((v) => !v)}
              className={`px-3 py-1 rounded font-semibold border transition-colors ${
                corriendo
                  ? 'bg-slate-800 text-amber-300 border-slate-700 hover:bg-slate-700'
                  : 'bg-emerald-700 text-white border-emerald-600'
              }`}
            >
              {corriendo ? '⏸ Pausar Física' : '▶ Reanudar Física'}
            </button>

            <button
              type="button"
              onClick={restaurarNormal}
              className="px-3 py-1 rounded font-semibold bg-emerald-700 hover:bg-emerald-600 text-white shadow-xs"
            >
              ↺ Restaurar Horno Normal
            </button>

            <a
              href={`${gidrAppUrl}/escenarios`}
              target="_blank"
              rel="noreferrer"
              className="px-3 py-1 rounded font-semibold bg-sky-700 hover:bg-sky-600 text-white"
            >
              Abrir Hoja PHA en GIDR ↗
            </a>
            <a
              href={`${gidrAppUrl}/bowtie/1`}
              target="_blank"
              rel="noreferrer"
              className="px-3 py-1 rounded font-semibold bg-indigo-700 hover:bg-indigo-600 text-white"
            >
              Abrir BowTie H-101 ↗
            </a>
          </div>
        </div>
      </header>

      {/* CONTENIDO PRINCIPAL */}
      <main className="flex-1 max-w-[1800px] w-full mx-auto p-4 space-y-4">
        {/* 1. BOTONERA DE ESCENARIOS DE FALLA EN TIEMPO REAL (ESCENARIOS HAZOP H-101) */}
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
              ⚡ Inyector de Eventos Operacionales sobre el Horno H-101 (Sincronización Inmediata con GIDR):
            </div>
            <div className="text-xs text-slate-400 font-mono">
              Escenario activo:{' '}
              <span className="text-sky-300 font-bold">
                {estado.escenarioActivoId}
              </span>
              {ultimaRespGidr && (
                <span className="ml-3 text-emerald-400">
                  ✓ Último envío GIDR ({ultimaRespGidr.ts}):{' '}
                  {ultimaRespGidr.escenarios_recalculados} escenarios recalculados
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            {ESCENARIOS_EVENTO_HORNO.map((esc) => (
              <button
                key={esc.id}
                type="button"
                onClick={() => dispararEscenario(esc.aplicar)}
                className={`text-left p-2.5 rounded-lg border transition-all ${
                  estado.escenarioActivoId === esc.id
                    ? 'ring-2 ring-white ' + esc.colorBoton
                    : esc.colorBoton
                }`}
              >
                <div className="text-xs font-bold">{esc.titulo}</div>
                <div className="text-[11px] opacity-80 mt-0.5 leading-snug">
                  {esc.subtituloHazop}
                </div>
              </button>
            ))}
          </div>

          {/* Banner de evento activo y conteo de alarmas */}
          <div
            className={`px-3 py-2 rounded-lg border text-xs flex flex-wrap items-center justify-between gap-2 ${
              alarmasActivas.length > 0
                ? 'bg-rose-950/50 border-rose-700/80 text-rose-200'
                : 'bg-emerald-950/40 border-emerald-800/60 text-emerald-200'
            }`}
          >
            <div>
              <span className="font-bold">Diagnóstico en curso: </span>
              <span>{estado.eventoDescripcion}</span>
            </div>
            <div className="font-mono font-bold">
              {alarmasActivas.length > 0
                ? `🚨 ${alarmasActivas.length} BARRERA(S) / COMPONENTE(S) EN ALARMA`
                : '✓ 0 ALARMAS — TODAS LAS BARRERAS DISPONIBLES'}
            </div>
          </div>
        </section>

        {/* 2. GRILLA PRINCIPAL: SINÓPTICO P&ID ANIMADO + CONTROLES DE PROCESO Y BARRERAS */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          {/* Columna Izquierda (8 cols): Gráfico P&ID con animaciones de alarma + Controles de Proceso */}
          <div className="xl:col-span-8 space-y-4">
            <FurnacePID
              estado={estado}
              barreraSeleccionada={barreraSeleccionada}
              onSelectBarrera={(tag) => setBarreraSeleccionada(tag)}
              onToggleBomba={handleToggleBomba}
              onToggleLlama={handleToggleLlama}
            />

            {/* Panel de Variables Físicas del Horno (Sliders de Operación en Vivo) */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  🎛️ Parámetros Físicos de Operación del Horno H-101 (Manipulación en Tiempo Real)
                </h3>
                <div className="flex flex-wrap items-center gap-2">
                  {/* Botón rápido de Bomba P-101 */}
                  <button
                    type="button"
                    onClick={handleToggleBomba}
                    className={`px-2.5 py-1 rounded text-[11px] font-semibold border flex items-center gap-1.5 transition-colors ${
                      estado.bombaP101Activa
                        ? 'bg-emerald-950/60 border-emerald-600/70 text-emerald-300 hover:bg-emerald-900/60'
                        : 'bg-rose-950/80 border-rose-600/70 text-rose-300 hover:bg-rose-900/80'
                    }`}
                  >
                    <span>{estado.bombaP101Activa ? '🟢 Bomba P-101A (ON)' : '🔴 Bomba P-101A (OFF)'}</span>
                  </button>

                  {/* Botón rápido de Quemador / Rearme */}
                  <button
                    type="button"
                    onClick={handleToggleLlama}
                    className={`px-2.5 py-1 rounded text-[11px] font-semibold border flex items-center gap-1.5 transition-colors ${
                      estado.llamaEncendida
                        ? 'bg-amber-950/60 border-amber-600/70 text-amber-300 hover:bg-amber-900/60'
                        : 'bg-rose-950/90 border-rose-500 text-rose-200 hover:bg-rose-900/90 animate-pulse'
                    }`}
                  >
                    <span>
                      {estado.llamaEncendida
                        ? '🔥 Quemadores ON (Apagar)'
                        : '⚡ Quemadores OFF (Rearmar / Encender)'}
                    </span>
                  </button>

                  <span className="text-[11px] text-slate-400 font-mono ml-2">
                    Tendencia TMT: {historialTmt.slice(-6).join('° → ')}°C
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                {/* Control Apertura TIC-101 */}
                <div className="bg-slate-950/70 p-3 rounded-lg border border-slate-800">
                  <div className="flex justify-between font-semibold mb-1">
                    <span className="text-amber-300">Válvula Gas TIC-101</span>
                    <span className="font-mono">{estado.aperturaTic101}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={estado.aperturaTic101}
                    onChange={(e) => {
                      const val = Number(e.target.value)
                      setEstado((p) => ({
                        ...p,
                        aperturaTic101: val,
                        llamaEncendida: val > 2 ? (p.llamaEncendida || p.presionGasCombustible >= 15) : false,
                        disparoSisEjecutado: val > 2 ? false : p.disparoSisEjecutado,
                      }))
                    }}
                    className="w-full accent-amber-500"
                  />
                  <div className="text-[10.5px] text-slate-400 mt-1">
                    Salida de crudo: <b>{estado.tempSalida}°C</b> (Alarma &gt;395°C)
                  </div>
                </div>

                {/* Control Apertura FIC-H101 */}
                <div className="bg-slate-950/70 p-3 rounded-lg border border-slate-800">
                  <div className="flex justify-between font-semibold mb-1">
                    <span className="text-sky-300">Válvula Carga FIC-H101</span>
                    <span className="font-mono">{estado.aperturaFic101}%</span>
                  </div>
                  <input
                    type="range"
                    min={5}
                    max={100}
                    value={estado.aperturaFic101}
                    onChange={(e) =>
                      setEstado((p) => ({
                        ...p,
                        aperturaFic101: Number(e.target.value),
                      }))
                    }
                    className="w-full accent-sky-500"
                  />
                  <div className="text-[10.5px] text-slate-400 mt-1">
                    Flujo carga: <b>{estado.flujoCarga} m³/h</b> (FSLL &lt;75)
                  </div>
                </div>

                {/* Control Coquización en Tubos */}
                <div className="bg-slate-950/70 p-3 rounded-lg border border-slate-800">
                  <div className="flex justify-between font-semibold mb-1">
                    <span className="text-rose-300">Coque en Tubos</span>
                    <span className="font-mono">{estado.coquePct}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={95}
                    value={estado.coquePct}
                    onChange={(e) =>
                      setEstado((p) => ({
                        ...p,
                        coquePct: Number(e.target.value),
                      }))
                    }
                    className="w-full accent-rose-500"
                  />
                  <div className="text-[10.5px] text-slate-400 mt-1">
                    Temp. Piel TMT: <b>{estado.tempPielTubos}°C</b> (TSHH &gt;545°C)
                  </div>
                </div>

                {/* Control Presión de Gas Combustible */}
                <div className="bg-slate-950/70 p-3 rounded-lg border border-slate-800">
                  <div className="flex justify-between font-semibold mb-1">
                    <span className="text-yellow-300">Presión Gas Comb.</span>
                    <span className="font-mono">
                      {estado.presionGasCombustible} psig
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={70}
                    value={estado.presionGasCombustible}
                    onChange={(e) =>
                      setEstado((p) => ({
                        ...p,
                        presionGasCombustible: Number(e.target.value),
                      }))
                    }
                    className="w-full accent-yellow-400"
                  />
                  <div className="text-[10.5px] text-slate-400 mt-1">
                    Gas en caja (F&G): <b>{estado.gasHidrocarburoLel}% LEL</b>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Columna Derecha (4 cols): Matriz Interactiva de las 7 Barreras del Horno H-101 */}
          <div className="xl:col-span-4 bg-slate-900 border border-slate-800 rounded-xl flex flex-col overflow-hidden">
            <div className="p-3.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-white">
                  🛡️ Estado y Degradación de Barreras (H-101)
                </h2>
                <p className="text-[11px] text-slate-400">
                  Cambia el estado o % de degradación para enviarlo en vivo a GIDR.
                </p>
              </div>
              <label className="flex items-center gap-1.5 text-xs text-emerald-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoSyncGidr}
                  onChange={(e) => setAutoSyncGidr(e.target.checked)}
                  className="accent-emerald-500"
                />
                Auto-Sync
              </label>
            </div>

            <div className="p-3 space-y-2.5 overflow-y-auto max-h-[660px]">
              {Object.values(estado.barreras).map((b) => {
                const esActiva = barreraSeleccionada === b.tag
                const frrEf = calcFrrEfectivo(b)
                return (
                  <div
                    key={b.tag}
                    onClick={() => setBarreraSeleccionada(b.tag)}
                    className={`p-3 rounded-lg border transition-all cursor-pointer ${
                      esActiva
                        ? 'bg-slate-800/90 border-sky-500'
                        : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-2.5 h-2.5 rounded-full ${
                            b.estado === 'DISPONIBLE'
                              ? 'bg-emerald-500'
                              : b.estado === 'DEGRADADO'
                                ? 'bg-amber-500 animate-pulse'
                                : 'bg-rose-500 animate-ping'
                          }`}
                        />
                        <span className="font-mono font-bold text-xs text-white">
                          {b.tag}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                          {b.sistema}
                        </span>
                      </div>

                      <div className="text-xs font-mono">
                        <span className="text-slate-400">
                          FRR<sub>d</sub> {b.frrDiseno} →{' '}
                        </span>
                        <span
                          className={`font-bold ${
                            frrEf < b.frrDiseno
                              ? 'text-amber-400'
                              : 'text-emerald-400'
                          }`}
                        >
                          FRR<sub>a</sub> {frrEf}
                        </span>
                      </div>
                    </div>

                    <div className="text-[11px] text-slate-400 mt-1">
                      {b.descripcion}
                    </div>

                    {/* Selector de Estado y Slider de Factor de Degradación (1-100%) */}
                    <div className="mt-2.5 grid grid-cols-1 gap-2">
                      <select
                        value={b.estado}
                        onChange={(e) =>
                          actualizarBarrera(b.tag, {
                            estado: e.target.value as EstadoBarreraGD,
                          })
                        }
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-sky-500"
                      >
                        {ESTADOS_BARRERA.map((op) => (
                          <option key={op.valor} value={op.valor}>
                            {op.etiqueta}
                          </option>
                        ))}
                      </select>

                      {b.estado === 'DEGRADADO' && (
                        <div className="bg-amber-950/40 border border-amber-700/60 rounded p-2">
                          <div className="flex justify-between text-[11px] text-amber-200 font-semibold mb-1">
                            <span>Factor de Degradación (1–100%)</span>
                            <span className="font-mono font-bold">
                              {b.factorDegradacion}%
                            </span>
                          </div>
                          <input
                            type="range"
                            min={1}
                            max={100}
                            value={b.factorDegradacion}
                            onChange={(e) =>
                              actualizarBarrera(b.tag, {
                                factorDegradacion: Number(e.target.value),
                              })
                            }
                            className="w-full accent-amber-500"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </main>

      {/* MODAL CONFIGURACIÓN CONEXIÓN WEBSOCKET GIDR */}
      {modalUrlAbierto && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-lg w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">⚙️</span>
                <h3 className="font-bold text-base text-white">
                  Configuración de Conexión GIDR (WebSocket)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setModalUrlAbierto(false)}
                className="text-slate-400 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Ingresa la dirección WebSocket del backend de GIDR (puerto <code className="text-sky-300 font-mono">/ws/gemelo</code>).
              En Render, debe usar el protocolo seguro <code className="text-emerald-300 font-mono">wss://</code> (ej: <code className="text-emerald-300 font-mono">wss://gidr-backend.onrender.com/ws/gemelo</code>).
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                URL WebSocket de GIDR:
              </label>
              <input
                type="text"
                value={urlWsPersonalizada}
                onChange={(e) => setUrlWsPersonalizada(e.target.value)}
                placeholder="wss://gidr-backend.onrender.com/ws/gemelo"
                className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-sky-500"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => {
                  guardarUrlWsGidr('')
                  const defecto = resolverUrlWsGidr()
                  setUrlWsPersonalizada(defecto)
                  reconectarConNuevaUrl(defecto)
                }}
                className="text-slate-400 hover:text-slate-200 underline"
              >
                Restablecer valor por defecto
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setModalUrlAbierto(false)}
                  className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => reconectarConNuevaUrl(urlWsPersonalizada)}
                  className="px-4 py-1.5 rounded bg-sky-600 hover:bg-sky-500 font-semibold text-white shadow"
                >
                  Guardar y Reconectar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
