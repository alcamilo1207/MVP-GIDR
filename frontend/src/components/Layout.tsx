import React, { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../context/AuthContext'
import { useTema } from '../context/TemaContext'

interface NotificacionTicker {
  id: string
  hora: string
  fuente: string
  barreraTag: string
  tagGemelo?: string
  estado: 'ACTIVO' | 'DEGRADADO' | 'DESHABILITADO' | 'INFO'
  factorDegradacion?: number
  valor?: number | null
  escenariosRecalculados?: number
  mensajeExtra?: string
}

const NOTIFICACIONES_INICIALES: NotificacionTicker[] = [
  {
    id: 'init-1',
    hora: new Date().toLocaleTimeString('es-CO', { hour12: false }),
    fuente: 'TELEMETRÍA H-101',
    barreraTag: 'HORNO-H101',
    tagGemelo: 'CDU-100 · NODO 1',
    estado: 'INFO',
    mensajeExtra: 'Monitoreo dinámico de barreras activo · 7 lazos instrumentados en línea',
  },
  {
    id: 'init-2',
    hora: new Date().toLocaleTimeString('es-CO', { hour12: false }),
    fuente: 'SIS',
    barreraTag: 'SIS-H101-TSHH',
    tagGemelo: 'H101.TSHH.TRIP',
    estado: 'ACTIVO',
    factorDegradacion: 1,
    mensajeExtra: 'Lazo SIS de alta temp. de piel de tubos armado (FRR 100)',
  },
  {
    id: 'init-3',
    hora: new Date().toLocaleTimeString('es-CO', { hour12: false }),
    fuente: 'SIS',
    barreraTag: 'SIS-H101-BMS',
    tagGemelo: 'H101.BMS.FLAME_OK',
    estado: 'ACTIVO',
    factorDegradacion: 1,
    mensajeExtra: 'Gestión de quemadores BMS permisivo OK (FRR 1000)',
  },
  {
    id: 'init-4',
    hora: new Date().toLocaleTimeString('es-CO', { hour12: false }),
    fuente: 'DCS',
    barreraTag: 'FIC-H101',
    tagGemelo: 'H101.FIC101.OP_ERR',
    estado: 'ACTIVO',
    factorDegradacion: 1,
    mensajeExtra: 'Control de flujo de carga estable (FRR 10)',
  },
]

export const Layout: React.FC = () => {
  const { usuario, cerrarSesion } = useAuth()
  const { tema, alternarTema } = useTema()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [wsConectado, setWsConectado] = useState(false)
  const [notificaciones, setNotificaciones] = useState<NotificacionTicker[]>(NOTIFICACIONES_INICIALES)
  const ultimoEstadoRef = useRef<Record<string, string>>({})

  useEffect(() => {
    let ws: WebSocket | null = null
    let reconectarTimer: number | undefined
    let usarPuertoDirecto = Boolean((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV)
    const envWsUrl = (import.meta as unknown as { env?: { VITE_WS_URL?: string } }).env?.VITE_WS_URL
    const envApiUrl = (import.meta as unknown as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL

    const conectar = () => {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      let url: string
      if (envWsUrl) {
        url = envWsUrl.replace(/\/+$/, '')
        if (!url.endsWith('/ws/eventos')) url = `${url}/ws/eventos`
      } else if (envApiUrl) {
        const wsHost = envApiUrl.replace(/\/+$/, '').replace(/^http/, 'ws')
        url = `${wsHost}/ws/eventos`
      } else if (usarPuertoDirecto) {
        url = `${proto}//${window.location.hostname}:8000/ws/eventos`
      } else {
        url = `${proto}//${window.location.host}/api/ws/eventos`
      }

      ws = new WebSocket(url)

      ws.onopen = () => {
        setWsConectado(true)
      }

      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data)
          if (
            data.tipo === 'ACTUALIZACION_PLANTA' ||
            data.tipo === 'TELEMETRIA_GEMELO'
          ) {
            queryClient.invalidateQueries({ queryKey: ['escenarios-pha'] })
            queryClient.invalidateQueries({ queryKey: ['bowtie'] })
            queryClient.invalidateQueries({ queryKey: ['barreras'] })
            queryClient.invalidateQueries({ queryKey: ['dashboard'] })
            queryClient.invalidateQueries({ queryKey: ['vinculos-gemelo'] })
            queryClient.invalidateQueries({ queryKey: ['api754'] })

            const hora = new Date().toLocaleTimeString('es-CO', { hour12: false })

            if (data.tipo === 'TELEMETRIA_GEMELO' && Array.isArray(data.eventos) && data.eventos.length > 0) {
              const nuevas: NotificacionTicker[] = []

              for (const item of data.eventos) {
                const tag = String(item.barrera_tag ?? '')
                const estado = (item.estado ?? 'ACTIVO') as 'ACTIVO' | 'DEGRADADO' | 'DESHABILITADO'
                const deg = Number(item.factor_degradacion ?? 1)
                const bucketDeg = Math.round(deg / 5) * 5
                const firma = `${estado}:${bucketDeg}`
                const firmaPrevia = ultimoEstadoRef.current[tag]

                const huboCambio =
                  item.cambio === true ||
                  (firmaPrevia !== undefined && firmaPrevia !== firma) ||
                  (firmaPrevia === undefined && estado !== 'ACTIVO')

                ultimoEstadoRef.current[tag] = firma

                if (huboCambio) {
                  nuevas.push({
                    id: `${Date.now()}-${tag}-${Math.random().toString(36).slice(2, 6)}`,
                    hora,
                    fuente: String(item.fuente ?? 'GEMELO'),
                    barreraTag: tag,
                    tagGemelo: item.tag_gemelo ? String(item.tag_gemelo) : undefined,
                    estado,
                    factorDegradacion: deg,
                    valor: typeof item.valor === 'number' ? Number(item.valor.toFixed(1)) : undefined,
                    escenariosRecalculados: Number(data.escenarios_recalculados ?? 0),
                  })
                }
              }

              if (nuevas.length > 0) {
                setNotificaciones((prev) => [...nuevas, ...prev].slice(0, 14))
              }
            } else if (data.tipo === 'ACTUALIZACION_PLANTA' && Array.isArray(data.cambios) && data.cambios.length > 0) {
              const nuevas: NotificacionTicker[] = data.cambios.map(
                (c: { tag_activo: string; antes: string; despues: string; escenarios_afectados: number }) => ({
                  id: `${Date.now()}-${c.tag_activo}-${Math.random().toString(36).slice(2, 6)}`,
                  hora,
                  fuente: 'PLANTA / CMMS',
                  barreraTag: c.tag_activo,
                  estado: (c.despues as 'ACTIVO' | 'DEGRADADO' | 'DESHABILITADO') || 'INFO',
                  escenariosRecalculados: c.escenarios_afectados ?? data.escenarios_recalculados ?? 0,
                  mensajeExtra: `${c.antes} → ${c.despues}`,
                })
              )
              if (nuevas.length > 0) {
                setNotificaciones((prev) => [...nuevas, ...prev].slice(0, 14))
              }
            }
          }
        } catch {
          // Ignorar tramas no-JSON
        }
      }

      ws.onerror = () => {
        usarPuertoDirecto = !usarPuertoDirecto
      }

      ws.onclose = () => {
        setWsConectado(false)
        reconectarTimer = window.setTimeout(conectar, 3000)
      }
    }

    conectar()
    return () => {
      if (reconectarTimer) window.clearTimeout(reconectarTimer)
      if (ws) ws.close()
    }
  }, [queryClient])

  const handleLogout = () => {
    cerrarSesion()
    navigate('/login')
  }

  const navClass = ({ isActive }: { isActive: boolean }) =>
    `inline-flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
      isActive
        ? 'bg-brand-50 text-brand-700 dark:bg-slate-800 dark:text-brand-400'
        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800/60'
    }`

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100">
      {/* Header / Barra de navegación */}
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 sticky top-0 z-30">
        <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link
              to="/"
              className="flex items-center gap-2.5 font-bold text-lg text-slate-900 dark:text-white"
            >
              <div className="w-8 h-8 rounded bg-brand-600 text-white flex items-center justify-center font-black tracking-wider text-sm shadow-sm">
                G4
              </div>
              <div>
                <span className="tracking-tight">GIDR</span>
                <span className="text-xs font-normal text-slate-500 dark:text-slate-400 ml-1.5 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800">
                  Módulo 4
                </span>
              </div>
            </Link>

            <nav className="hidden md:flex items-center space-x-1">
              <NavLink to="/" className={navClass}>
                Dashboard
              </NavLink>
              <NavLink to="/nodos" className={navClass}>
                Nodos
              </NavLink>
              <NavLink to="/escenarios" className={navClass}>
                Escenarios PHA
              </NavLink>
              <NavLink to="/lopa" className={navClass}>
                LOPA
              </NavLink>
              <NavLink to="/barreras" className={navClass}>
                Barreras
              </NavLink>
              <NavLink to="/integraciones" className={navClass}>
                Integraciones
              </NavLink>
              <NavLink to="/indicadores" className={navClass}>
                API 754
              </NavLink>
              <NavLink to="/auditoria" className={navClass}>
                Auditoría
              </NavLink>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            {/* Indicador de Canal WebSocket en Tiempo Real de Telemetría */}
            <Link
              to="/integraciones"
              title={
                wsConectado
                  ? 'Canal WebSocket conectado en tiempo real con el HUB de Datos de Telemetría'
                  : 'Reconectando canal WebSocket...'
              }
              className={`hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors ${
                wsConectado
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800'
                  : 'bg-amber-50 text-amber-800 border-amber-200'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  wsConectado ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
                }`}
              />
              {wsConectado ? 'Telemetría en vivo' : 'Conectando WS...'}
            </Link>

            <button
              onClick={alternarTema}
              className="p-2 rounded-md text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800 text-xs font-semibold"
              title="Cambiar tema"
            >
              {tema === 'claro' ? '🌙 Modo Oscuro' : '☀️ Modo Claro'}
            </button>

            {usuario && (
              <div className="flex items-center gap-3 pl-3 border-l border-slate-200 dark:border-slate-800 text-sm">
                <div className="flex flex-col text-right">
                  <span className="font-medium text-slate-900 dark:text-white leading-tight">
                    {usuario.username}
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 capitalize">
                    {usuario.rol}
                  </span>
                </div>
                <button
                  onClick={handleLogout}
                  className="px-2.5 py-1 text-xs rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors"
                >
                  Salir
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Barra permanente de notificaciones en vivo tipo Stock Market Ticker */}
        <div className="bg-slate-900 dark:bg-slate-950 text-slate-100 border-t border-slate-800 h-9 flex items-center overflow-hidden">
          {/* Etiqueta fija izquierda */}
          <div className="h-full px-3 bg-slate-950 border-r border-slate-800 flex items-center gap-2 shrink-0 z-10 shadow-[6px_0_12px_rgba(0,0,0,0.45)]">
            <span
              className={`w-2 h-2 rounded-full ${
                notificaciones.some((n) => n.estado === 'DESHABILITADO')
                  ? 'bg-red-500 animate-ping'
                  : notificaciones.some((n) => n.estado === 'DEGRADADO')
                  ? 'bg-amber-400 animate-pulse'
                  : 'bg-emerald-400 animate-pulse'
              }`}
            />
            <span className="text-[11px] font-bold tracking-wider uppercase text-slate-200">
              LIVE RISK TICKER
            </span>
            <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] font-mono text-sky-400 border border-slate-700">
              {notificaciones.length}
            </span>
          </div>

          {/* Cinta deslizante de derecha a izquierda (Stock Market Marquee) */}
          <div className="flex-1 overflow-hidden relative h-full flex items-center">
            <div
              className="gidr-ticker-track"
              style={
                {
                  '--ticker-duration': `${Math.max(24, notificaciones.length * 6)}s`,
                } as React.CSSProperties
              }
            >
              {[0, 1].map((copiaIdx) => (
                <div key={copiaIdx} className="inline-flex items-center">
                  {notificaciones.map((n, idx) => {
                    const esCritico = n.estado === 'DESHABILITADO'
                    const esDegradado = n.estado === 'DEGRADADO'
                    const esActivo = n.estado === 'ACTIVO'

                    return (
                      <Link
                        key={`${copiaIdx}-${n.id}`}
                        to="/escenarios"
                        className={`inline-flex items-center gap-2 px-4 py-1 text-xs border-r border-slate-800/90 hover:bg-slate-800/70 transition-colors ${
                          idx === 0 && copiaIdx === 0 ? 'gidr-ticker-item-new' : ''
                        }`}
                      >
                        <span className="font-mono text-[10px] text-slate-400">
                          {n.hora}
                        </span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-slate-800 text-sky-300 border border-slate-700">
                          {n.fuente}
                        </span>
                        <span className="font-mono font-bold text-white tracking-tight">
                          {n.barreraTag}
                        </span>
                        {n.tagGemelo && (
                          <span className="font-mono text-[11px] text-slate-400">
                            ({n.tagGemelo}
                            {typeof n.valor === 'number' ? ` = ${n.valor}` : ''})
                          </span>
                        )}

                        {esCritico && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-mono font-bold text-[11px] bg-red-950/90 text-red-300 border border-red-800/80">
                            ▲ DESHABILITADO · 100% DEGR.
                          </span>
                        )}
                        {esDegradado && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-mono font-bold text-[11px] bg-amber-950/90 text-amber-300 border border-amber-800/80">
                            ▲ DEGRADADO · {n.factorDegradacion ?? 50}%
                          </span>
                        )}
                        {esActivo && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-mono font-bold text-[11px] bg-emerald-950/90 text-emerald-300 border border-emerald-800/80">
                            ▼ ACTIVO · OK
                          </span>
                        )}
                        {n.estado === 'INFO' && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-mono font-semibold text-[11px] bg-sky-950/80 text-sky-300 border border-sky-800/70">
                            ● EN LÍNEA
                          </span>
                        )}

                        {n.mensajeExtra && (
                          <span className="text-slate-300 text-[11px]">
                            {n.mensajeExtra}
                          </span>
                        )}
                        {typeof n.escenariosRecalculados === 'number' &&
                          n.escenariosRecalculados > 0 && (
                            <span className="text-[11px] font-semibold text-amber-300">
                              · ⚡ {n.escenariosRecalculados} esc. recalculado(s)
                            </span>
                          )}
                      </Link>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* Botón derecho para limpiar / reiniciar feed */}
          <div className="h-full px-2.5 bg-slate-950 border-l border-slate-800 flex items-center gap-2 shrink-0 z-10">
            <button
              onClick={() => {
                ultimoEstadoRef.current = {}
                setNotificaciones(NOTIFICACIONES_INICIALES)
              }}
              className="text-[11px] text-slate-400 hover:text-white px-2 py-0.5 rounded hover:bg-slate-800 transition-colors"
              title="Restablecer cinta de notificaciones"
            >
              Limpiar
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-[1800px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-5">
        <Outlet />
      </main>

      <footer className="border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 py-4 text-center text-xs text-slate-500 dark:text-slate-400">
        GIDR Módulo 4 · HUB de integración de riesgo dinámico (MVP) · Petroquímica Demo S.A.
      </footer>
    </div>
  )
}
