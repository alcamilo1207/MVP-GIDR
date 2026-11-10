export function resolverBaseApi(): string {
  if (typeof window !== 'undefined') {
    const custom = localStorage.getItem('gidr_api_url')
    if (custom && custom.trim()) {
      let c = custom.trim().replace(/\/+$/, '')
      if (!c.startsWith('http://') && !c.startsWith('https://')) c = `https://${c}`
      return c
    }
  }

  let raw = (import.meta as unknown as { env?: { VITE_API_URL?: string; DEV?: boolean } }).env?.VITE_API_URL
  if (raw && raw.trim()) {
    raw = raw.trim().replace(/\/+$/, '')
    if (!raw.startsWith('http://') && !raw.startsWith('https://')) {
      return `https://${raw}`
    }
    return raw
  }

  const isDev = Boolean((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV)
  if (isDev) return 'http://localhost:8000'

  if (typeof window !== 'undefined' && window.location.hostname.includes('onrender.com')) {
    const backendHost = window.location.hostname
      .replace('gidr-frontend', 'gidr-backend')
      .replace('gidr', 'gidr-backend')
    return `https://${backendHost}`
  }

  return '/api'
}

export function guardarBaseApi(url: string) {
  if (!url || !url.trim()) localStorage.removeItem('gidr_api_url')
  else {
    let u = url.trim().replace(/\/+$/, '')
    if (!u.startsWith('http://') && !u.startsWith('https://')) u = `https://${u}`
    localStorage.setItem('gidr_api_url', u)
  }
}

export function resolverUrlWs(ruta: string = '/ws/eventos'): string {
  const rutaLimpia = ruta.startsWith('/') ? ruta : `/${ruta}`

  if (typeof window !== 'undefined') {
    const customWs = localStorage.getItem('gidr_ws_url')
    if (customWs && customWs.trim()) {
      let c = customWs.trim().replace(/\/+$/, '')
      if (!c.startsWith('ws://') && !c.startsWith('wss://')) {
        const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
        c = `${proto}//${c.replace(/^(http|https):\/\//, '')}`
      }
      return `${c}${rutaLimpia}`
    }
  }

  const envWsUrl = (import.meta as unknown as { env?: { VITE_WS_URL?: string } }).env?.VITE_WS_URL
  if (envWsUrl && envWsUrl.trim()) {
    let w = envWsUrl.trim().replace(/\/+$/, '')
    if (!w.startsWith('ws://') && !w.startsWith('wss://')) {
      const proto = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      w = `${proto}//${w.replace(/^(http|https):\/\//, '')}`
    }
    if (w.endsWith(rutaLimpia)) return w
    return `${w}${rutaLimpia}`
  }

  // Derivar de resolverBaseApi()
  const baseHttp = resolverBaseApi()
  if (baseHttp.startsWith('/')) {
    const proto = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = typeof window !== 'undefined' ? window.location.host : 'localhost:8000'
    return `${proto}//${host}${rutaLimpia}`
  }

  let wsUrl = baseHttp
    .replace(/^http:\/\//i, 'ws://')
    .replace(/^https:\/\//i, 'wss://')

  if (!wsUrl.startsWith('ws://') && !wsUrl.startsWith('wss://')) {
    const proto = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    wsUrl = `${proto}//${wsUrl}`
  }

  return `${wsUrl.replace(/\/+$/, '')}${rutaLimpia}`
}

export const BASE = resolverBaseApi()
const KEY = 'gidr_token'

export const tokenStore = {
  get: () => localStorage.getItem(KEY),
  set: (t: string) => localStorage.setItem(KEY, t),
  clear: () => localStorage.removeItem(KEY),
}

export class ApiError extends Error {
  status: number
  codigo: string
  detalle: unknown
  constructor(status: number, codigo: string, mensaje: string, detalle?: unknown) {
    super(mensaje)
    this.status = status
    this.codigo = codigo
    this.detalle = detalle
  }
}

type Params = Record<string, string | number | boolean | undefined | null>

function qs(params?: Params): string {
  if (!params) return ''
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '' && v !== false) p.set(k, String(v))
  }
  const s = p.toString()
  return s ? `?${s}` : ''
}

async function request<T>(method: string, path: string, body?: unknown, params?: Params): Promise<T> {
  const headers: Record<string, string> = {}
  const token = tokenStore.get()
  if (token) headers.Authorization = `Bearer ${token}`
  let payload: BodyInit | undefined
  if (body instanceof FormData) payload = body
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }
  const base = resolverBaseApi()
  const res = await fetch(`${base}${path}${qs(params)}`, { method, headers, body: payload })
  if (res.status === 204) return undefined as T
  const texto = await res.text()
  let data: unknown
  if (texto) {
    try {
      data = JSON.parse(texto)
    } catch {
      throw new ApiError(
        res.status,
        'RESPUESTA_NO_JSON',
        `El backend respondió en formato no-JSON (${res.status} ${res.statusText}). Verifica que el backend esté activo en ${BASE}.`
      )
    }
  }
  if (!res.ok) {
    const e = (data as { error?: { codigo?: string; mensaje?: string; detalle?: unknown } } | undefined)?.error
    if (res.status === 401 && path !== '/auth/login') {
      tokenStore.clear()
      window.dispatchEvent(new Event('gidr:sesion-expirada'))
    }
    throw new ApiError(res.status, e?.codigo ?? 'ERROR', e?.mensaje ?? `Error ${res.status}`, e?.detalle)
  }
  return data as T
}

export const api = {
  get: <T>(path: string, params?: Params) => request<T>('GET', path, undefined, params),
  post: <T>(path: string, body?: unknown, params?: Params) => request<T>('POST', path, body, params),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),
  /** Descarga un archivo autenticado y lo guarda en disco. */
  async descargar(path: string, nombre: string, params?: Params) {
    const token = tokenStore.get()
    const res = await fetch(`${BASE}${path}${qs(params)}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
    if (!res.ok) throw new ApiError(res.status, 'DESCARGA', 'No se pudo descargar el archivo')
    const url = URL.createObjectURL(await res.blob())
    const a = document.createElement('a')
    a.href = url
    a.download = nombre
    a.click()
    URL.revokeObjectURL(url)
  },
}
