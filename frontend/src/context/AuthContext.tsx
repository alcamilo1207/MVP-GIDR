import React, { createContext, useContext, useEffect, useState } from 'react'
import { api, tokenStore } from '../lib/api'
import type { Rol } from '../lib/types'

interface Usuario {
  username: string
  rol: Rol
}

interface AuthContextType {
  usuario: Usuario | null
  cargando: boolean
  iniciarSesion: (token: string, usuario: Usuario) => void
  cerrarSesion: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    const verificar = async () => {
      const token = tokenStore.get()
      if (!token) {
        setCargando(false)
        return
      }
      try {
        const u = await api.get<Usuario>('/auth/me')
        setUsuario(u)
      } catch {
        tokenStore.clear()
        setUsuario(null)
      } finally {
        setCargando(false)
      }
    }

    verificar()

    const handleExpirada = () => {
      setUsuario(null)
    }
    window.addEventListener('gidr:sesion-expirada', handleExpirada)
    return () => window.removeEventListener('gidr:sesion-expirada', handleExpirada)
  }, [])

  const iniciarSesion = (token: string, u: Usuario) => {
    tokenStore.set(token)
    setUsuario(u)
  }

  const cerrarSesion = () => {
    tokenStore.clear()
    setUsuario(null)
  }

  return (
    <AuthContext.Provider value={{ usuario, cargando, iniciarSesion, cerrarSesion }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth debe ser usado dentro de AuthProvider')
  return context
}
