import React from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTema } from '../context/TemaContext'

export const Layout: React.FC = () => {
  const { usuario, cerrarSesion } = useAuth()
  const { tema, alternarTema } = useTema()
  const navigate = useNavigate()

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

      {/* Header / Barra de navegación */}
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link to="/" className="flex items-center gap-2.5 font-bold text-lg text-slate-900 dark:text-white">
              <div className="w-8 h-8 rounded bg-brand-600 text-white flex items-center justify-center font-black tracking-wider text-sm shadow-sm">
                G4
              </div>
              <div>
                <span className="tracking-tight">GIDR</span>
                <span className="text-xs font-normal text-slate-500 dark:text-slate-400 ml-1.5 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800">Módulo 4</span>
              </div>
            </Link>

            <nav className="hidden md:flex items-center space-x-1">
              <NavLink to="/" className={navClass}>Dashboard</NavLink>
              <NavLink to="/escenarios" className={navClass}>Escenarios</NavLink>
              <NavLink to="/barreras" className={navClass}>Barreras</NavLink>
              <NavLink to="/integraciones" className={navClass}>Integraciones</NavLink>
              <NavLink to="/indicadores" className={navClass}>API 754</NavLink>
              <NavLink to="/auditoria" className={navClass}>Auditoría</NavLink>
            </nav>
          </div>

          <div className="flex items-center gap-3">
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
                  <span className="font-medium text-slate-900 dark:text-white leading-tight">{usuario.username}</span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 capitalize">{usuario.rol}</span>
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
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Outlet />
      </main>

      <footer className="border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 py-4 text-center text-xs text-slate-500 dark:text-slate-400">
        GIDR Módulo 4 · HUB de integración de riesgo dinámico (MVP) · Petroquímica Demo S.A.
      </footer>
    </div>
  )
}
