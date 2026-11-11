import React, { useState, useEffect } from 'react'
import type { Nivel } from '../lib/types'
import {
  ConfigMatrizRiesgo,
  obtenerConfigMatriz,
  guardarConfigMatriz,
  restablecerConfigMatriz,
  obtenerNivelPorPuntaje,
  obtenerColorTextoContraste,
  obtenerEstiloCeldaRiesgo,
  NIVELES_CRITICIDAD_INFO,
} from '../lib/configMatriz'

export const Configuracion: React.FC = () => {
  const [config, setConfig] = useState<ConfigMatrizRiesgo>(obtenerConfigMatriz())
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)
  const [pestañaActiva, setPestañaActiva] = useState<'matriz' | 'severidad' | 'frecuencia' | 'umbrales'>('matriz')

  // Cargar configuración inicial
  useEffect(() => {
    setConfig(obtenerConfigMatriz())
  }, [])

  const mostrarAlerta = (texto: string, tipo: 'ok' | 'error' = 'ok') => {
    setMensaje({ tipo, texto })
    setTimeout(() => setMensaje(null), 4000)
  }

  const handleGuardar = () => {
    // Validar que los códigos no estén vacíos
    for (const s of config.severidades) {
      if (!s.codigo.trim() || !s.etiqueta.trim()) {
        mostrarAlerta('Todos los niveles de severidad deben tener código y nombre.', 'error')
        return
      }
    }
    for (const f of config.frecuencias) {
      if (!f.codigo.trim() || !f.etiqueta.trim()) {
        mostrarAlerta('Todos los niveles de frecuencia deben tener código y nombre.', 'error')
        return
      }
    }
    // Validar rangos numéricos
    for (const u of config.umbrales) {
      if (u.min > u.max || u.min < 1 || u.max > 25) {
        mostrarAlerta(`El rango numérico de ${u.nivel} (${u.min} a ${u.max}) es inválido. Debe estar entre 1 y 25.`, 'error')
        return
      }
    }

    guardarConfigMatriz(config)
    mostrarAlerta('¡Configuración de la Matriz de Riesgo guardada exitosamente! Se ha sincronizado con el Dashboard y Escenarios.')
  }

  const handleRestablecer = () => {
    if (window.confirm('¿Deseas restablecer las escalas de severidad, frecuencia y rangos de criticidad a los valores estándar por defecto?')) {
      const reset = restablecerConfigMatriz()
      setConfig(reset)
      mostrarAlerta('Parámetros de matriz de riesgo restablecidos a los valores por defecto.')
    }
  }

  // Modificar severidad
  const actualizarSeveridad = (index: number, campo: string, valor: string) => {
    const copia = [...config.severidades]
    copia[index] = { ...copia[index], [campo]: valor }
    setConfig({ ...config, severidades: copia })
  }

  // Modificar frecuencia
  const actualizarFrecuencia = (index: number, campo: string, valor: string | number) => {
    const copia = [...config.frecuencias]
    copia[index] = { ...copia[index], [campo]: valor }
    setConfig({ ...config, frecuencias: copia })
  }

  // Modificar umbrales
  const actualizarUmbral = (
    index: number,
    campo: 'min' | 'max' | 'etiqueta' | 'colorHex',
    valor: string | number
  ) => {
    const copia = [...config.umbrales]
    copia[index] = { ...copia[index], [campo]: valor }
    setConfig({ ...config, umbrales: copia })
  }

  // Alternar celda personalizada en la matriz interactiva
  const alternarCeldaManual = (frecCod: string, sevNum: number) => {
    const clave = `${frecCod}-${sevNum}`
    const nivelesCiclo: Nivel[] = ['Bajo', 'Medio', 'Alto', 'Extremo']
    const fObj = config.frecuencias.find((f) => f.codigo === frecCod)
    const peso = fObj ? fObj.peso : 1
    const puntajeDefecto = peso * sevNum
    const nivelCalculado = obtenerNivelPorPuntaje(puntajeDefecto, config)
    const actual = config.celdasPersonalizadas?.[clave] || nivelCalculado

    const siguienteIndex = (nivelesCiclo.indexOf(actual) + 1) % nivelesCiclo.length
    const siguienteNivel = nivelesCiclo[siguienteIndex]

    const nuevoMapa = { ...(config.celdasPersonalizadas || {}) }
    if (siguienteNivel === nivelCalculado) {
      delete nuevoMapa[clave]
    } else {
      nuevoMapa[clave] = siguienteNivel
    }

    setConfig({ ...config, celdasPersonalizadas: nuevoMapa })
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Encabezado Principal */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-3 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-sky-100 dark:bg-sky-950/70 text-sky-800 dark:text-sky-300 text-lg">
              ⚙️
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Configuración y Parámetros del Sistema
            </h1>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Ajuste de las escalas de severidad y frecuencia de la matriz 5×5, rangos numéricos de criticidad y criterios de evaluación.
          </p>
        </div>

        {/* Acciones principales */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleRestablecer}
            className="px-3 py-1.5 text-xs font-semibold rounded-md border border-slate-300 dark:border-slate-700 bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors shadow-2xs"
          >
            Restablecer Valores
          </button>
          <button
            type="button"
            onClick={handleGuardar}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold rounded-md bg-[#1e4e79] hover:bg-[#163a5c] dark:bg-sky-600 dark:hover:bg-sky-500 text-white shadow-xs transition-colors"
          >
            <span>Guardar Ajustes</span>
            <span className="text-xs">✓</span>
          </button>
        </div>
      </div>

      {/* Banner de retroalimentación */}
      {mensaje && (
        <div
          className={`p-3 rounded-lg text-xs font-medium flex items-center justify-between border animate-fadeIn ${
            mensaje.tipo === 'ok'
              ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-200 border-emerald-300 dark:border-emerald-800'
              : 'bg-rose-50 dark:bg-rose-950/50 text-rose-800 dark:text-rose-200 border-rose-300 dark:border-rose-800'
          }`}
        >
          <span>{mensaje.texto}</span>
          <button
            type="button"
            onClick={() => setMensaje(null)}
            className="text-xs opacity-70 hover:opacity-100"
          >
            ✕
          </button>
        </div>
      )}

      {/* Selector de pestañas */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 text-xs font-semibold gap-1">
        <button
          type="button"
          onClick={() => setPestañaActiva('matriz')}
          className={`px-4 py-2.5 border-b-2 transition-colors flex items-center gap-1.5 ${
            pestañaActiva === 'matriz'
              ? 'border-[#1e4e79] dark:border-sky-500 text-[#1e4e79] dark:text-sky-400 font-bold'
              : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <span>Matriz de Riesgo 5×5 (Previsualización)</span>
        </button>
        <button
          type="button"
          onClick={() => setPestañaActiva('severidad')}
          className={`px-4 py-2.5 border-b-2 transition-colors flex items-center gap-1.5 ${
            pestañaActiva === 'severidad'
              ? 'border-[#1e4e79] dark:border-sky-500 text-[#1e4e79] dark:text-sky-400 font-bold'
              : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <span>Escala de Severidad (1 a 5)</span>
        </button>
        <button
          type="button"
          onClick={() => setPestañaActiva('frecuencia')}
          className={`px-4 py-2.5 border-b-2 transition-colors flex items-center gap-1.5 ${
            pestañaActiva === 'frecuencia'
              ? 'border-[#1e4e79] dark:border-sky-500 text-[#1e4e79] dark:text-sky-400 font-bold'
              : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <span>Escala de Frecuencia (A a E)</span>
        </button>
        <button
          type="button"
          onClick={() => setPestañaActiva('umbrales')}
          className={`px-4 py-2.5 border-b-2 transition-colors flex items-center gap-1.5 ${
            pestañaActiva === 'umbrales'
              ? 'border-[#1e4e79] dark:border-sky-500 text-[#1e4e79] dark:text-sky-400 font-bold'
              : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <span>Rangos de Criticidad (Bajo, Medio, Alto, Extremo)</span>
        </button>
      </div>

      {/* Contenido de la pestaña 1: Matriz de Riesgo 5×5 Interactiva */}
      {pestañaActiva === 'matriz' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 card card-pad">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Matriz de Riesgo 5×5 Dinámica
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Calculada con el producto: <span className="font-semibold text-slate-700 dark:text-slate-300">Puntaje = Peso Frecuencia (1-5) × Severidad (1-5)</span>.
                  Haz clic en cualquier celda para alternar su criticidad individualmente.
                </p>
              </div>

              {/* Leyenda de criticidad */}
              <div className="flex items-center gap-1.5 text-[11px] font-semibold">
                {config.umbrales.map((u) => (
                  <span
                    key={u.nivel}
                    className="px-2 py-0.5 rounded shadow-2xs"
                    style={{
                      backgroundColor: `${u.colorHex}25`,
                      color: u.colorHex,
                      border: `1px solid ${u.colorHex}50`,
                    }}
                  >
                    {u.nivel} ({u.min}-{u.max} pts)
                  </span>
                ))}
              </div>
            </div>

            {/* Tabla Matriz 5x5 */}
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-slate-300 dark:border-slate-700 table-fixed select-none text-xs">
                <thead>
                  <tr className="bg-slate-100 dark:bg-slate-800/90 text-[11px] text-slate-700 dark:text-slate-200 font-bold">
                    <th className="w-36 border border-slate-300 dark:border-slate-700 px-3 py-2 text-left uppercase">
                      Severidad \ Frecuencia
                    </th>
                    {config.frecuencias.map((f) => (
                      <th
                        key={f.codigo}
                        className="border border-slate-300 dark:border-slate-700 px-2 py-2 text-center"
                      >
                        <div className="font-extrabold text-sm text-[#1e4e79] dark:text-sky-400">
                          {f.codigo}
                        </div>
                        <div className="text-[10.5px] font-medium text-slate-600 dark:text-slate-300">
                          {f.etiqueta}
                        </div>
                        <div className="text-[9.5px] font-mono text-slate-400">
                          (Peso {f.peso})
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {config.severidades.map((s) => (
                    <tr key={s.num}>
                      <th className="bg-slate-100 dark:bg-slate-800/90 border border-slate-300 dark:border-slate-700 px-3 py-2 text-right align-middle">
                        <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                          {s.codigo} · {s.etiqueta}
                        </div>
                        <div className="text-[10px] text-slate-500 font-normal truncate max-w-[140px]" title={s.criterioEconomico}>
                          {s.criterioEconomico || `Nivel ${s.num}`}
                        </div>
                      </th>
                      {config.frecuencias.map((f) => {
                        const puntaje = f.peso * s.num
                        const clave = `${f.codigo}-${s.num}`
                        const nivelManual = config.celdasPersonalizadas?.[clave]
                        const nivel = nivelManual || obtenerNivelPorPuntaje(puntaje, config)
                        const estiloCelda = obtenerEstiloCeldaRiesgo(nivel, config)

                        return (
                          <td
                            key={`${f.codigo}-${s.num}`}
                            onClick={() => alternarCeldaManual(f.codigo, s.num)}
                            style={estiloCelda}
                            title={`Celda ${f.codigo}${s.codigo} · Puntaje ${puntaje} pts (${nivel})${nivelManual ? ' [Modo manual activado]' : ''}. Clic para alternar nivel.`}
                            className="border border-slate-400/50 dark:border-slate-700 h-16 p-1.5 align-middle text-center cursor-pointer hover:scale-[1.02] hover:z-10 transition-all shadow-2xs"
                          >
                            <div className="flex flex-col items-center justify-center h-full">
                              <span className="text-[11px] font-extrabold tracking-tight">
                                {f.codigo}{s.codigo}
                              </span>
                              <span className="text-[10px] font-semibold opacity-90">
                                {nivel}
                              </span>
                              <span className="text-[9px] font-mono opacity-70">
                                {puntaje} pts {nivelManual && '✎'}
                              </span>
                            </div>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-3 text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
              <span>Tip: Las celdas con el símbolo <strong>✎</strong> tienen un nivel personalizado asignado manualmente.</span>
              {Object.keys(config.celdasPersonalizadas || {}).length > 0 && (
                <button
                  type="button"
                  onClick={() => setConfig({ ...config, celdasPersonalizadas: {} })}
                  className="text-xs text-sky-600 dark:text-sky-400 hover:underline"
                >
                  Limpiar personalizaciones manuales
                </button>
              )}
            </div>
          </div>

          {/* Resumen de configuración de matriz */}
          <div className="lg:col-span-4 space-y-4">
            <div className="card card-pad">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-2">
                Resumen de Rangos de Criticidad
              </h3>
              <div className="space-y-2 text-xs">
                {config.umbrales.map((u) => (
                  <div
                    key={u.nivel}
                    className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/40"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="w-3.5 h-3.5 rounded-full"
                        style={{ backgroundColor: u.colorHex }}
                      />
                      <div>
                        <div className="font-bold text-slate-800 dark:text-slate-200">
                          {u.nivel}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {u.etiqueta}
                        </div>
                      </div>
                    </div>
                    <div className="font-mono font-bold text-xs text-slate-900 dark:text-slate-100">
                      {u.min} — {u.max} pts
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="card card-pad bg-sky-50/50 dark:bg-sky-950/20 border-sky-200 dark:border-sky-900/40 text-xs text-slate-700 dark:text-slate-300">
              <h4 className="font-bold text-sky-900 dark:text-sky-300 mb-1 flex items-center gap-1.5">
                <span>ℹ️</span>
                <span>Fórmula Estándar de la Matriz</span>
              </h4>
              <p className="leading-relaxed">
                El puntaje de riesgo para cada celda resulta de multiplicar el <strong>Peso de la Frecuencia</strong> (1 para la más baja a 5 para la más alta) por el <strong>Nivel de Severidad</strong> (1 a 5).
              </p>
              <p className="mt-2 leading-relaxed text-[11px] text-slate-500 dark:text-slate-400">
                Al guardar, todas las matrices independientes por tipo de riesgo (Personas, Económico, Ambiental, Reputación) en el <strong>Dashboard</strong> y en la matriz de <strong>Escenarios PHA</strong> se actualizarán con estos mismos umbrales.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Contenido de la pestaña 2: Escala de Severidad */}
      {pestañaActiva === 'severidad' && (
        <div className="card card-pad space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Escala de Severidad / Impactos (5 Niveles)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Ajusta los códigos (ej. 1 a 5, o S1 a S5), los nombres descriptivos y los criterios por dimensión de impacto.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-[#f0f4f8] dark:bg-slate-800/90 text-slate-700 dark:text-slate-200 sticky top-0 z-10 font-bold border-b border-slate-300 dark:border-slate-700">
                <tr>
                  <th className="p-2.5 w-[75px] min-w-[70px] border-r border-slate-300 dark:border-slate-700 text-center">
                    Nivel
                  </th>
                  <th className="p-2.5 w-[100px] min-w-[90px] border-r border-slate-300 dark:border-slate-700">
                    Código
                  </th>
                  <th className="p-2.5 w-[160px] min-w-[140px] border-r border-slate-300 dark:border-slate-700">
                    Nombre / Etiqueta
                  </th>
                  <th className="p-2.5 min-w-[180px] border-r border-slate-300 dark:border-slate-700">
                    Criterio Económico
                  </th>
                  <th className="p-2.5 min-w-[200px] border-r border-slate-300 dark:border-slate-700">
                    Criterio Personas (Seguridad)
                  </th>
                  <th className="p-2.5 min-w-[180px] border-r border-slate-300 dark:border-slate-700">
                    Criterio Ambiental
                  </th>
                  <th className="p-2.5 min-w-[170px]">
                    Criterio Reputación
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {config.severidades.map((s, idx) => (
                  <tr key={s.num} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="p-2.5 text-center font-bold text-slate-700 dark:text-slate-300 border-r border-slate-200 dark:border-slate-800">
                      Nivel {s.num}
                    </td>
                    <td className="p-2 border-r border-slate-200 dark:border-slate-800">
                      <input
                        type="text"
                        value={s.codigo}
                        onChange={(e) => actualizarSeveridad(idx, 'codigo', e.target.value)}
                        className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-xs font-bold text-slate-800 dark:text-slate-200 focus:outline-none focus:border-sky-500"
                        placeholder="Ej. 1 o S1"
                      />
                    </td>
                    <td className="p-2 border-r border-slate-200 dark:border-slate-800">
                      <input
                        type="text"
                        value={s.etiqueta}
                        onChange={(e) => actualizarSeveridad(idx, 'etiqueta', e.target.value)}
                        className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:border-sky-500"
                        placeholder="Ej. Catastrófico"
                      />
                    </td>
                    <td className="p-2 border-r border-slate-200 dark:border-slate-800">
                      <textarea
                        rows={2}
                        value={s.criterioEconomico || ''}
                        onChange={(e) => actualizarSeveridad(idx, 'criterioEconomico', e.target.value)}
                        className="w-full bg-transparent text-xs text-slate-700 dark:text-slate-300 resize-none focus:outline-none focus:bg-white dark:focus:bg-slate-900 rounded p-1"
                        placeholder="Impacto monetario estimado"
                      />
                    </td>
                    <td className="p-2 border-r border-slate-200 dark:border-slate-800">
                      <textarea
                        rows={2}
                        value={s.criterioPersonas || ''}
                        onChange={(e) => actualizarSeveridad(idx, 'criterioPersonas', e.target.value)}
                        className="w-full bg-transparent text-xs text-slate-700 dark:text-slate-300 resize-none focus:outline-none focus:bg-white dark:focus:bg-slate-900 rounded p-1"
                        placeholder="Impacto en salud y personas"
                      />
                    </td>
                    <td className="p-2 border-r border-slate-200 dark:border-slate-800">
                      <textarea
                        rows={2}
                        value={s.criterioAmbiental || ''}
                        onChange={(e) => actualizarSeveridad(idx, 'criterioAmbiental', e.target.value)}
                        className="w-full bg-transparent text-xs text-slate-700 dark:text-slate-300 resize-none focus:outline-none focus:bg-white dark:focus:bg-slate-900 rounded p-1"
                        placeholder="Impacto ambiental"
                      />
                    </td>
                    <td className="p-2">
                      <textarea
                        rows={2}
                        value={s.criterioReputacion || ''}
                        onChange={(e) => actualizarSeveridad(idx, 'criterioReputacion', e.target.value)}
                        className="w-full bg-transparent text-xs text-slate-700 dark:text-slate-300 resize-none focus:outline-none focus:bg-white dark:focus:bg-slate-900 rounded p-1"
                        placeholder="Impacto en reputación e imagen"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Contenido de la pestaña 3: Escala de Frecuencia */}
      {pestañaActiva === 'frecuencia' && (
        <div className="card card-pad space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Escala de Frecuencia de Ocurrencia (5 Niveles)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Ajusta las siglas (ej. A, B, C, D, E o F1 a F5), nombres descriptivos, rangos de ocurrencia y el peso numérico de cada categoría.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-[#f0f4f8] dark:bg-slate-800/90 text-slate-700 dark:text-slate-200 sticky top-0 z-10 font-bold border-b border-slate-300 dark:border-slate-700">
                <tr>
                  <th className="p-2.5 w-[75px] min-w-[70px] border-r border-slate-300 dark:border-slate-700 text-center">
                    Nivel
                  </th>
                  <th className="p-2.5 w-[110px] min-w-[100px] border-r border-slate-300 dark:border-slate-700">
                    Código / Sigla
                  </th>
                  <th className="p-2.5 w-[180px] min-w-[160px] border-r border-slate-300 dark:border-slate-700">
                    Nombre / Etiqueta
                  </th>
                  <th className="p-2.5 min-w-[240px] border-r border-slate-300 dark:border-slate-700">
                    Rango de Ocurrencia / Frecuencia Estimada
                  </th>
                  <th className="p-2.5 w-[130px] min-w-[120px] text-center">
                    Peso Multiplicador
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {config.frecuencias.map((f, idx) => (
                  <tr key={f.idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="p-2.5 text-center font-bold text-slate-700 dark:text-slate-300 border-r border-slate-200 dark:border-slate-800">
                      Posición {idx + 1}
                    </td>
                    <td className="p-2 border-r border-slate-200 dark:border-slate-800">
                      <input
                        type="text"
                        value={f.codigo}
                        onChange={(e) => actualizarFrecuencia(idx, 'codigo', e.target.value)}
                        className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-xs font-bold text-[#1e4e79] dark:text-sky-400 focus:outline-none focus:border-sky-500"
                        placeholder="Ej. A o F1"
                      />
                    </td>
                    <td className="p-2 border-r border-slate-200 dark:border-slate-800">
                      <input
                        type="text"
                        value={f.etiqueta}
                        onChange={(e) => actualizarFrecuencia(idx, 'etiqueta', e.target.value)}
                        className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:border-sky-500"
                        placeholder="Ej. Frecuente"
                      />
                    </td>
                    <td className="p-2 border-r border-slate-200 dark:border-slate-800">
                      <input
                        type="text"
                        value={f.rango}
                        onChange={(e) => actualizarFrecuencia(idx, 'rango', e.target.value)}
                        className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1 text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:border-sky-500"
                        placeholder="Ej. > 1 vez/año"
                      />
                    </td>
                    <td className="p-2 text-center">
                      <input
                        type="number"
                        min={1}
                        max={10}
                        value={f.peso}
                        onChange={(e) => actualizarFrecuencia(idx, 'peso', Number(e.target.value) || 1)}
                        className="w-20 text-center bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-xs font-mono font-bold text-slate-800 dark:text-slate-200 focus:outline-none focus:border-sky-500"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Contenido de la pestaña 4: Rangos de Criticidad */}
      {pestañaActiva === 'umbrales' && (
        <div className="card card-pad space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Rangos Numéricos de Criticidad (Bajo, Medio, Alto, Extremo)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Configura los límites numéricos de puntaje (Puntaje = Frecuencia × Severidad, de 1 a 25) para cada nivel de riesgo.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {config.umbrales.map((u, idx) => {
              const info = NIVELES_CRITICIDAD_INFO[u.nivel]
              return (
                <div
                  key={u.nivel}
                  className="p-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800/80 shadow-2xs space-y-3"
                  style={{ borderTop: `4px solid ${u.colorHex}` }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={u.colorHex}
                        onChange={(e) => actualizarUmbral(idx, 'colorHex', e.target.value)}
                        className="w-7 h-7 p-0.5 rounded border border-slate-300 dark:border-slate-700 cursor-pointer bg-transparent"
                        title={`Cambiar color para el nivel ${u.nivel}`}
                      />
                      <span
                        className="px-2.5 py-0.5 rounded text-xs font-bold shadow-2xs"
                        style={{
                          backgroundColor: u.colorHex,
                          color: obtenerColorTextoContraste(u.colorHex),
                        }}
                      >
                        {u.nivel}
                      </span>
                    </div>
                    <span className="text-[11px] font-mono text-slate-400">
                      Rango [{u.min} — {u.max}]
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                        Color Hexadecimal
                      </label>
                      <input
                        type="text"
                        value={u.colorHex}
                        onChange={(e) => actualizarUmbral(idx, 'colorHex', e.target.value)}
                        className="w-full font-mono text-xs bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-sky-500"
                        placeholder="#10b981"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                        Criterio
                      </label>
                      <input
                        type="text"
                        value={u.etiqueta}
                        onChange={(e) => actualizarUmbral(idx, 'etiqueta', e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-sky-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100 dark:border-slate-700">
                    <div>
                      <label className="block text-[10.5px] font-semibold text-slate-500 dark:text-slate-400 mb-0.5">
                        Puntaje Mínimo
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={25}
                        value={u.min}
                        onChange={(e) => actualizarUmbral(idx, 'min', Number(e.target.value) || 1)}
                        className="w-full text-center font-mono font-bold text-xs bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded py-1 focus:outline-none focus:border-sky-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[10.5px] font-semibold text-slate-500 dark:text-slate-400 mb-0.5">
                        Puntaje Máximo
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={25}
                        value={u.max}
                        onChange={(e) => actualizarUmbral(idx, 'max', Number(e.target.value) || 25)}
                        className="w-full text-center font-mono font-bold text-xs bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded py-1 focus:outline-none focus:border-sky-500"
                      />
                    </div>
                  </div>

                  <div className="text-[10.5px] text-slate-400 dark:text-slate-500 leading-tight">
                    Acción sugerida: {info?.accion || 'Seguimiento operacional estándar.'}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
