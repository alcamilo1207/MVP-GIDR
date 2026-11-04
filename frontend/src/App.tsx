import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from './context/AuthContext'
import { TemaProvider } from './context/TemaContext'
import { Layout } from './components/Layout'
import { Login } from './pages/Login'
import { Dashboard } from './pages/Dashboard'
import { Escenarios } from './pages/Escenarios'
import { Lopa } from './pages/Lopa'
import { Nodos } from './pages/Nodos'
import { BowTieView } from './pages/BowTieView'
import { Barreras } from './pages/Barreras'
import { Integraciones } from './pages/Integraciones'
import { Indicadores } from './pages/Indicadores'
import { AuditoriaView } from './pages/AuditoriaView'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5000,
      retry: 1,
    },
  },
})

const RutaProtegida: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { usuario, cargando } = useAuth()
  if (cargando) {
    return <div className="min-h-screen flex items-center justify-center text-slate-500">Iniciando GIDR...</div>
  }
  if (!usuario) {
    return <Navigate to="/login" replace />
  }
  return <>{children}</>
}

export const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <TemaProvider>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route
                path="/"
                element={
                  <RutaProtegida>
                    <Layout />
                  </RutaProtegida>
                }
              >
                <Route index element={<Dashboard />} />
                <Route path="nodos" element={<Nodos />} />
                <Route path="escenarios" element={<Escenarios />} />
                <Route path="lopa" element={<Lopa />} />
                <Route path="bowtie/:id" element={<BowTieView />} />
                <Route path="barreras" element={<Barreras />} />
                <Route path="integraciones" element={<Integraciones />} />
                <Route path="indicadores" element={<Indicadores />} />
                <Route path="auditoria" element={<AuditoriaView />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </TemaProvider>
    </QueryClientProvider>
  )
}
