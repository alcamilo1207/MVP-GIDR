const BASE = '/api'
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
  const res = await fetch(`${BASE}${path}${qs(params)}`, { method, headers, body: payload })
  if (res.status === 204) return undefined as T
  const texto = await res.text()
  const data = texto ? JSON.parse(texto) : undefined
  if (!res.ok) {
    const e = data?.error
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
