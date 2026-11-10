import { BarreraHorno, EstadoSimulacionHorno } from '../engine/furnaceModel'

export interface RespuestaPuenteGidr {
  ts: string
  procesadas: number
  barreras_actualizadas: number
  escenarios_recalculados: number
  eventos_emitidos: {
    barrera_tag: string
    tag_gemelo: string
    fuente: string
    valor: number | null
    estado: string
    factor_degradacion: number
  }[]
}

export function resolverUrlWsGidr(): string {
  const guardada = localStorage.getItem('gidr_ws_url')
  if (guardada && guardada.trim()) {
    let g = guardada.trim()
    if (!g.startsWith('ws://') && !g.startsWith('wss://')) {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      g = `${proto}//${g.replace(/^(http|https):\/\//, '')}`
    }
    return g
  }

  const envWs = (import.meta as unknown as { env?: { VITE_GIDR_WS_URL?: string } }).env?.VITE_GIDR_WS_URL
  if (envWs && envWs.trim()) {
    let w = envWs.trim()
    if (!w.startsWith('ws://') && !w.startsWith('wss://')) {
      const proto = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      w = `${proto}//${w.replace(/^(http|https):\/\//, '')}`
    }
    return w
  }

  const envApi = (import.meta as unknown as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL
  if (envApi && envApi.trim()) {
    let raw = envApi.trim().replace(/\/+$/, '')
    let wsHost = raw.replace(/^http:\/\//, 'ws://').replace(/^https:\/\//, 'wss://')
    if (!wsHost.startsWith('ws://') && !wsHost.startsWith('wss://')) {
      const proto = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      wsHost = `${proto}//${wsHost}`
    }
    return `${wsHost}/ws/gemelo`
  }

  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return `${proto}//${window.location.hostname}:8000/ws/gemelo`
  }
  return `${proto}//gidr-backend.onrender.com/ws/gemelo`
}

export function guardarUrlWsGidr(url: string) {
  if (!url || !url.trim()) localStorage.removeItem('gidr_ws_url')
  else localStorage.setItem('gidr_ws_url', url.trim())
}

export class PuenteGidr {
  private ws: WebSocket | null = null
  private onEstadoConexion: (conectado: boolean) => void
  private onRespuesta: (resp: RespuestaPuenteGidr) => void
  private timerReconexion: number | null = null
  public urlActual: string = ''

  constructor(
    onEstadoConexion: (conectado: boolean) => void,
    onRespuesta: (resp: RespuestaPuenteGidr) => void
  ) {
    this.onEstadoConexion = onEstadoConexion
    this.onRespuesta = onRespuesta
  }

  conectar(urlOverride?: string) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return

    const url = urlOverride || resolverUrlWsGidr()
    this.urlActual = url

    try {
      this.ws = new WebSocket(url)

      this.ws.onopen = () => {
        this.onEstadoConexion(true)
      }

      this.ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data)
          this.onRespuesta({
            ts: new Date().toLocaleTimeString(),
            procesadas: data.procesadas ?? 0,
            barreras_actualizadas: data.barreras_actualizadas ?? 0,
            escenarios_recalculados: data.escenarios_recalculados ?? 0,
            eventos_emitidos: data.eventos_emitidos ?? [],
          })
        } catch {
          // Ignorar
        }
      }

      this.ws.onerror = () => {
        // En caso de fallo
      }

      this.ws.onclose = () => {
        this.onEstadoConexion(false)
        this.timerReconexion = window.setTimeout(() => this.conectar(), 3000)
      }
    } catch {
      this.onEstadoConexion(false)
    }
  }

  desconectar() {
    if (this.timerReconexion) window.clearTimeout(this.timerReconexion)
    if (this.ws) this.ws.close()
  }

  /**
   * Envía el estado completo de las 7 barreras y telemetría del Horno H-101 hacia GIDR
   * por el canal WebSocket /ws/gemelo.
   */
  enviarEstadoHorno(estado: EstadoSimulacionHorno) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return

    const lecturas = Object.values(estado.barreras).map((b: BarreraHorno) => {
      let valorTelemetria = b.factorDegradacion
      if (b.tag === 'AL-H101-TAH') valorTelemetria = estado.tempSalida
      if (b.tag === 'SIS-H101-TSHH') valorTelemetria = estado.tempPielTubos
      if (b.tag === 'FSLL-H101' || b.tag === 'FIC-H101')
        valorTelemetria = estado.flujoCarga
      if (b.tag === 'AL-H101-PSL')
        valorTelemetria = estado.presionGasCombustible
      if (b.tag === 'SIS-H101-BMS')
        valorTelemetria = estado.llamaEncendida ? 0 : 1
      if (b.tag === 'GD-H101') valorTelemetria = estado.gasHidrocarburoLel

      return {
        barrera_tag: b.tag,
        valor: valorTelemetria,
        estado_manual: b.estado,
        factor_degradacion: b.factorDegradacion,
        fuente: b.sistema,
      }
    })

    this.ws.send(JSON.stringify({ lecturas }))
  }
}
