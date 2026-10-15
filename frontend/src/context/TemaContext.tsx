import React, { createContext, useContext, useEffect, useState } from 'react'

type Tema = 'claro' | 'oscuro'

interface TemaContextType {
  tema: Tema
  alternarTema: () => void
}

const TemaContext = createContext<TemaContextType | undefined>(undefined)

export const TemaProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tema, setTema] = useState<Tema>(() => {
    const guardado = localStorage.getItem('gidr_tema')
    if (guardado === 'claro' || guardado === 'oscuro') return guardado
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'oscuro' : 'claro'
  })

  useEffect(() => {
    const root = document.documentElement
    if (tema === 'oscuro') {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
    localStorage.setItem('gidr_tema', tema)
  }, [tema])

  const alternarTema = () => {
    setTema((t) => (t === 'claro' ? 'oscuro' : 'claro'))
  }

  return (
    <TemaContext.Provider value={{ tema, alternarTema }}>
      {children}
    </TemaContext.Provider>
  )
}

export const useTema = () => {
  const context = useContext(TemaContext)
  if (!context) throw new Error('useTema debe usarse dentro de TemaProvider')
  return context
}
