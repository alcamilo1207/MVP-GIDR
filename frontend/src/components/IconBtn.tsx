import React from 'react'

interface IconBtnProps {
  titulo: string
  onClick: () => void
  path: string
  disabled?: boolean
  cuadro?: boolean
}

/** Botón de icono minimalista usado en las barras de herramientas de las hojas de trabajo. */
export const IconBtn: React.FC<IconBtnProps> = ({ titulo, onClick, path, disabled, cuadro }) => (
  <button
    type="button"
    title={titulo}
    aria-label={titulo}
    onClick={onClick}
    disabled={disabled}
    className="p-1.5 rounded-md text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
  >
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {cuadro && <rect x="3" y="3" width="18" height="18" rx="3" />}
      <path d={path} />
    </svg>
  </button>
)
