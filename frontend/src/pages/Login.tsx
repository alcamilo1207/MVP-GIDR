import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import type { Rol } from '../lib/types'

interface LoginResponse {
  access_token: string
  token_type: string
  username: string
  rol: Rol
}

export const Login: React.FC = () => {
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('admin123')
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)
  const { iniciarSesion } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setCargando(true)
    try {
      const res = await api.post<LoginResponse>('/auth/login', { username, password })
      iniciarSesion(res.access_token, { username: res.username, rol: res.rol })
      navigate('/')
    } catch (err) {
      const errorObj = err as Error
      setError(errorObj.message || 'Error al iniciar sesión')
    } finally {
      setCargando(false)
    }
  }

  const usarCuenta = (u: string, p: string) => {
    setUsername(u)
    setPassword(p)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-950 px-4">
      <div className="max-w-md w-full bg-white dark:bg-slate-900 rounded-xl shadow-lg border border-slate-200 dark:border-slate-800 p-8">
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-brand-600 text-white rounded-lg mx-auto flex items-center justify-center font-black text-xl mb-3 shadow">
            G4
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">GIDR Módulo 4</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Gestión Integral Dinámica de Riesgos · HUB de Integración
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 dark:bg-red-950/40 dark:border-red-900/60 rounded-md text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Usuario</label>
            <input
              type="text"
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="label">Contraseña</label>
            <input
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button
            type="submit"
            disabled={cargando}
            className="w-full btn-primary py-2.5 text-base font-semibold shadow-sm mt-2"
          >
            {cargando ? 'Ingresando...' : 'Iniciar Sesión'}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
          <p className="font-semibold text-slate-700 dark:text-slate-300 mb-2">Cuentas de demostración:</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => usarCuenta('admin', 'admin123')}
              className="p-2 border rounded border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-left transition-colors"
            >
              <div className="font-semibold text-slate-800 dark:text-slate-200">admin</div>
              <div className="text-[11px] text-slate-500">Clave: admin123 (Total)</div>
            </button>
            <button
              type="button"
              onClick={() => usarCuenta('lector', 'lector123')}
              className="p-2 border rounded border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-left transition-colors"
            >
              <div className="font-semibold text-slate-800 dark:text-slate-200">lector</div>
              <div className="text-[11px] text-slate-500">Clave: lector123 (Solo lectura)</div>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
