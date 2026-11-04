import React, { useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'

export interface IplItem {
  id: string
  descripcion: string
  tipo: string
  tag: string
  pfd: number
  isSafeguard: 'Yes' | 'No'
}

export interface EnablingEvent {
  descripcion: string
  probabilidad: number
}

export interface ConditionalModifier {
  descripcion: string
  probabilidad: number
}

export interface CausaLopa {
  id: string
  numCausa: string
  causa: string
  frecuencia: number
  enablingEvent: EnablingEvent
  ipls: IplItem[]
  recomendacion: string
  comentario: string
}

export interface ConsecuenciaLopa {
  id: string
  numCons: string
  consecuencia: string
  severidad: number
  conditionalModifier: ConditionalModifier
  tmel: number
  causas: CausaLopa[]
}

export interface DesviacionLopa {
  id: string
  numDesv: string
  desviacion: string
  nodo: string
  consecuencias: ConsecuenciaLopa[]
}

const DATOS_INICIALES_LOPA: DesviacionLopa[] = [
  {
    id: 'desv-1',
    numDesv: '1.1',
    desviacion: 'High Pressure',
    nodo: '1. (HP Gas) Production Header through High Pressure Separator (V-101) to Gas Export Pipeline',
    consecuencias: [
      {
        id: 'cons-1',
        numCons: '1.1.1',
        consecuencia:
          'Potential overpressure of V-101. Potential loss of mechanical integrity. Potential rupture of High Pressure Separator resulting in large release of hydrocarbons and potential fire or explosion.',
        severidad: 4,
        conditionalModifier: {
          descripcion: 'Probability of ignition and personnel presence in separator bay',
          probabilidad: 1.0,
        },
        tmel: 1e-4,
        causas: [
          {
            id: 'causa-1',
            numCausa: '1.1.1.1',
            causa: 'Production header pressure operates above 1200 psig.',
            frecuencia: 0.1,
            enablingEvent: {
              descripcion: 'Header online during normal production',
              probabilidad: 1.0,
            },
            ipls: [
              {
                id: 'ipl-1',
                descripcion: 'Relief Valve on High Pressure Separator',
                tipo: 'Relief Valve',
                tag: 'PSV-101',
                pfd: 0.01,
                isSafeguard: 'Yes',
              },
              {
                id: 'ipl-2',
                descripcion: 'High Pressure Separator (V-101) High-High Pressure Closes Inlet Valve',
                tipo: 'SIF (Safety Instrumented Function)',
                tag: 'UZC-101A',
                pfd: 0.1,
                isSafeguard: 'Yes',
              },
            ],
            recomendacion: 'Ensure proof test interval for PSV-101 and UZC-101A conforms to annual SIL verification.',
            comentario: 'Credit claimed for independent mechanical relief and SIF loop.',
          },
          {
            id: 'causa-2',
            numCausa: '1.1.1.2',
            causa: 'External fire in the vicinity of HP Separator V-101.',
            frecuencia: 0.01,
            enablingEvent: {
              descripcion: 'Hydrocarbon inventory present in V-101',
              probabilidad: 1.0,
            },
            ipls: [
              {
                id: 'ipl-3',
                descripcion: 'Relief Valve sized for fire case per API 521',
                tipo: 'Relief Valve',
                tag: 'PSV-101',
                pfd: 0.01,
                isSafeguard: 'Yes',
              },
              {
                id: 'ipl-4',
                descripcion: 'Deluge water spray system activation on fire detection',
                tipo: 'Fire & Gas Mitigation',
                tag: 'FW-101',
                pfd: 0.1,
                isSafeguard: 'No',
              },
            ],
            recomendacion: 'Perform quarterly inspection on deluge nozzles coverage around V-101 vessel.',
            comentario: 'Fire relief credit restricted to PSV-101 per corporate guidelines.',
          },
        ],
      },
    ],
  },
  {
    id: 'desv-2',
    numDesv: '2.1',
    desviacion: 'Más Temperatura',
    nodo: '2. Horno H-101 · Serpentín de Carga (Destilación Atmosférica CDU-100)',
    consecuencias: [
      {
        id: 'cons-2',
        numCons: '2.1.1',
        consecuencia:
          'Sobrecalentamiento excesivo de tubos de radiación, pérdida de espesor por termofluencia y ruptura con liberación de crudo en caja de fuego e incendio mayor.',
        severidad: 5,
        conditionalModifier: {
          descripcion: 'Ignición inmediata en caja de fuego (fuente de ignición permanente)',
          probabilidad: 1.0,
        },
        tmel: 1e-5,
        causas: [
          {
            id: 'causa-3',
            numCausa: '2.1.1.1',
            causa: 'Falla no detectada del lazo controlador TIC-101 con salida saturada en alta (100% combustible).',
            frecuencia: 0.2,
            enablingEvent: {
              descripcion: 'Horno operando a carga máxima de diseño',
              probabilidad: 1.0,
            },
            ipls: [
              {
                id: 'ipl-5',
                descripcion: 'Alarma de alta temperatura de salida con intervención y corte manual del operador (DCS)',
                tipo: 'Operator Action (BPCS Alarm)',
                tag: 'AL-H101-TAH',
                pfd: 0.1,
                isSafeguard: 'Yes',
              },
              {
                id: 'ipl-6',
                descripcion: 'Lazo SIS: Disparo del horno por muy alta temperatura de piel de tubos (TMT)',
                tipo: 'SIF (SIL 2)',
                tag: 'SIS-H101-TSHH',
                pfd: 0.01,
                isSafeguard: 'Yes',
              },
              {
                id: 'ipl-7',
                descripcion: 'Detector de hidrocarburos / fuego en zona perimetral del horno H-101',
                tipo: 'Mitigative (F&G)',
                tag: 'GD-H101',
                pfd: 0.1,
                isSafeguard: 'No',
              },
            ],
            recomendacion: 'Mantener tiempo de respuesta del operador < 10 min documentado en POE de sala de control.',
            comentario: 'Crédito de alarma humana condicionado a procedimiento estandarizado y entrenamiento vigente.',
          },
        ],
      },
    ],
  },
]

function formatearCientifico(num: number): string {
  if (num === 0) return '0'
  if (num >= 0.01 && num <= 100) {
    return Number(num.toFixed(4)).toString()
  }
  return num.toExponential(1).toUpperCase()
}

function IconBtn({
  titulo,
  onClick,
  path,
  disabled,
  cuadro,
}: {
  titulo: string
  onClick: () => void
  path: string
  disabled?: boolean
  cuadro?: boolean
}) {
  return (
    <button
      type="button"
      title={titulo}
      aria-label={titulo}
      onClick={onClick}
      disabled={disabled}
      className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
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
}

const AUTO_H = { fieldSizing: "content" } as React.CSSProperties

export function Lopa() {
  const { usuario } = useAuth()
  const esAdmin = usuario?.rol === 'admin'

  const [datos, setDatos] = useState<DesviacionLopa[]>(DATOS_INICIALES_LOPA)
  const [nodoFiltro, setNodoFiltro] = useState<string>('')
  const [q, setQ] = useState('')
  const [mensajeGuardado, setMensajeGuardado] = useState<string | null>(null)
  const [celdaSeleccionada, setCeldaSeleccionada] = useState<string | null>(null)
  const [filaSel, setFilaSel] = useState<{
    desvId: string
    consId: string
    causaId: string
  } | null>(null)

  const nodosDisponibles = useMemo(() => {
    return Array.from(new Set(datos.map((d) => d.nodo)))
  }, [datos])

  const datosFiltrados = useMemo(() => {
    return datos
      .filter((d) => (nodoFiltro ? d.nodo === nodoFiltro : true))
      .filter((d) => {
        if (!q.trim()) return true
        const text = `${d.desviacion} ${d.nodo} ${d.consecuencias.map((c) => `${c.consecuencia} ${c.causas.map((cs) => `${cs.causa} ${cs.ipls.map((i) => `${i.tag} ${i.descripcion}`).join(' ')}`).join(' ')}`).join(' ')}`.toLowerCase()
        return text.includes(q.toLowerCase())
      })
  }, [datos, nodoFiltro, q])

  // Recalcular métricas cuantitativas LOPA para una causa
  const calcularMetricasCausa = (
    causa: CausaLopa,
    cmProb: number,
    tmel: number
  ) => {
    const freq = Number(causa.frecuencia) || 0
    const eeProb = Number(causa.enablingEvent?.probabilidad) || 1
    const cm = Number(cmProb) || 1

    let pfdTotal = 1.0
    let conteoIpls = 0

    for (const ipl of causa.ipls) {
      if (ipl.isSafeguard === 'Yes') {
        const pfd = Number(ipl.pfd) || 1.0
        pfdTotal *= pfd
        conteoIpls += 1
      }
    }

    const mel = freq * eeProb * cm * pfdTotal
    const ratio = tmel > 0 ? mel / tmel : 0
    const rrf = ratio > 1.0 ? ratio : 1.0

    return {
      mel,
      ratio,
      rrf,
      conteoIpls,
      cumpleTmel: ratio <= 1.0,
    }
  }

  // Modificar campo de una desviación
  const updateDesviacion = (
    desvId: string,
    callback: (d: DesviacionLopa) => DesviacionLopa
  ) => {
    setDatos((prev) => prev.map((d) => (d.id === desvId ? callback(d) : d)))
  }

  // Modificar campo de una consecuencia
  const updateConsecuencia = (
    desvId: string,
    consId: string,
    callback: (c: ConsecuenciaLopa) => ConsecuenciaLopa
  ) => {
    setDatos((prev) =>
      prev.map((d) => {
        if (d.id !== desvId) return d
        return {
          ...d,
          consecuencias: d.consecuencias.map((c) =>
            c.id === consId ? callback(c) : c
          ),
        }
      })
    )
  }

  // Modificar campo de una causa
  const updateCausa = (
    desvId: string,
    consId: string,
    causaId: string,
    callback: (cs: CausaLopa) => CausaLopa
  ) => {
    setDatos((prev) =>
      prev.map((d) => {
        if (d.id !== desvId) return d
        return {
          ...d,
          consecuencias: d.consecuencias.map((c) => {
            if (c.id !== consId) return c
            return {
              ...c,
              causas: c.causas.map((cs) =>
                cs.id === causaId ? callback(cs) : cs
              ),
            }
          }),
        }
      })
    )
  }

  // Modificar una IPL
  const updateIpl = (
    desvId: string,
    consId: string,
    causaId: string,
    iplId: string,
    callback: (ipl: IplItem) => IplItem
  ) => {
    updateCausa(desvId, consId, causaId, (cs) => ({
      ...cs,
      ipls: cs.ipls.map((item) => (item.id === iplId ? callback(item) : item)),
    }))
  }

  // Agregar una IPL a una causa
  const agregarIpl = (desvId: string, consId: string, causaId: string) => {
    const nuevoId = `ipl-${Date.now()}`
    updateCausa(desvId, consId, causaId, (cs) => ({
      ...cs,
      ipls: [
        ...cs.ipls,
        {
          id: nuevoId,
          descripcion: 'Nueva capa de protección independiente (IPL)',
          tipo: 'SIF (Safety Instrumented Function)',
          tag: 'SIF-NEW',
          pfd: 0.1,
          isSafeguard: 'Yes',
        },
      ],
    }))
  }

  // Eliminar una IPL
  const eliminarIpl = (
    desvId: string,
    consId: string,
    causaId: string,
    iplId: string
  ) => {
    updateCausa(desvId, consId, causaId, (cs) => ({
      ...cs,
      ipls: cs.ipls.filter((item) => item.id !== iplId),
    }))
  }

  // --- Selección de fila y acciones de la barra de herramientas ---
  const renumerar = (lista: DesviacionLopa[]): DesviacionLopa[] =>
    lista.map((d, i) => {
      const numDesv = `${i + 1}.1`
      return {
        ...d,
        numDesv,
        consecuencias: d.consecuencias.map((c, j) => {
          const numCons = `${numDesv}.${j + 1}`
          return {
            ...c,
            numCons,
            causas: c.causas.map((cs, k) => ({ ...cs, numCausa: `${numCons}.${k + 1}` })),
          }
        }),
      }
    })

  const nuevaCausa = (): CausaLopa => ({
    id: `causa-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    numCausa: '',
    causa: 'Nueva causa iniciadora',
    frecuencia: 0.1,
    enablingEvent: { descripcion: 'None', probabilidad: 1 },
    ipls: [
      {
        id: `ipl-${Date.now()}`,
        descripcion: 'Nueva capa de protección independiente (IPL)',
        tipo: 'SIF (Safety Instrumented Function)',
        tag: 'SIF-NEW',
        pfd: 0.1,
        isSafeguard: 'Yes',
      },
    ],
    recomendacion: '',
    comentario: '',
  })

  const agregarFila = () => {
    setDatos((prev) => {
      const destino = filaSel ?? {
        desvId: prev[0]?.id,
        consId: prev[0]?.consecuencias[0]?.id,
        causaId: '',
      }
      return renumerar(
        prev.map((d) =>
          d.id !== destino.desvId
            ? d
            : {
                ...d,
                consecuencias: d.consecuencias.map((c) =>
                  c.id !== destino.consId ? c : { ...c, causas: [...c.causas, nuevaCausa()] }
                ),
              }
        )
      )
    })
  }

  const duplicarFila = () => {
    if (!filaSel) return
    setDatos((prev) =>
      renumerar(
        prev.map((d) =>
          d.id !== filaSel.desvId
            ? d
            : {
                ...d,
                consecuencias: d.consecuencias.map((c) => {
                  if (c.id !== filaSel.consId) return c
                  const idx = c.causas.findIndex((cs) => cs.id === filaSel.causaId)
                  if (idx < 0) return c
                  const origen = c.causas[idx]
                  const sufijo = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
                  const copia: CausaLopa = {
                    ...origen,
                    id: `causa-${sufijo}`,
                    enablingEvent: { ...origen.enablingEvent },
                    ipls: origen.ipls.map((ipl, n) => ({ ...ipl, id: `ipl-${sufijo}-${n}` })),
                  }
                  const causas = [...c.causas]
                  causas.splice(idx + 1, 0, copia)
                  return { ...c, causas }
                }),
              }
        )
      )
    )
  }

  const eliminarFila = () => {
    if (!filaSel) return
    setDatos((prev) =>
      renumerar(
        prev
          .map((d) =>
            d.id !== filaSel.desvId
              ? d
              : {
                  ...d,
                  consecuencias: d.consecuencias
                    .map((c) =>
                      c.id !== filaSel.consId
                        ? c
                        : { ...c, causas: c.causas.filter((cs) => cs.id !== filaSel.causaId) }
                    )
                    .filter((c) => c.causas.length > 0),
                }
          )
          .filter((d) => d.consecuencias.length > 0)
      )
    )
    setFilaSel(null)
  }

  const moverFila = (delta: -1 | 1) => {
    if (!filaSel) return
    setDatos((prev) =>
      renumerar(
        prev.map((d) =>
          d.id !== filaSel.desvId
            ? d
            : {
                ...d,
                consecuencias: d.consecuencias.map((c) => {
                  if (c.id !== filaSel.consId) return c
                  const idx = c.causas.findIndex((cs) => cs.id === filaSel.causaId)
                  const dest = idx + delta
                  if (idx < 0 || dest < 0 || dest >= c.causas.length) return c
                  const causas = [...c.causas]
                  ;[causas[idx], causas[dest]] = [causas[dest], causas[idx]]
                  return { ...c, causas }
                }),
              }
        )
      )
    )
  }

  const handleGuardar = () => {
    setMensajeGuardado('✓ Hoja de trabajo LOPA guardada satisfactoriamente en memoria local.')
    setTimeout(() => setMensajeGuardado(null), 4000)
  }

  const exportarCsv = () => {
    const filas: string[][] = [
      [
        'Nodo',
        'Desviacion',
        'Consecuencia',
        'Severidad (S)',
        'CM-S Descripcion',
        'CM-S Prob',
        'TMEL',
        'Causa',
        'Frecuencia',
        'EE Descripcion',
        'EE Prob',
        'IPL Descripcion',
        'IPL Tipo',
        'IPL Tag',
        'IPL PFD',
        'Es Salvaguarda',
        'MEL',
        'LOPA Ratio',
        'RRF Requerido',
        'Recomendacion',
        'Comentario',
      ],
    ]

    for (const d of datos) {
      for (const c of d.consecuencias) {
        for (const cs of c.causas) {
          const metricas = calcularMetricasCausa(
            cs,
            c.conditionalModifier.probabilidad,
            c.tmel
          )
          const iplsList = cs.ipls.length > 0 ? cs.ipls : [null]

          for (const ipl of iplsList) {
            filas.push([
              `"${d.nodo.replace(/"/g, '""')}"`,
              `"${d.numDesv} ${d.desviacion.replace(/"/g, '""')}"`,
              `"${c.numCons} ${c.consecuencia.replace(/"/g, '""')}"`,
              String(c.severidad),
              `"${c.conditionalModifier.descripcion.replace(/"/g, '""')}"`,
              String(c.conditionalModifier.probabilidad),
              String(c.tmel),
              `"${cs.numCausa} ${cs.causa.replace(/"/g, '""')}"`,
              String(cs.frecuencia),
              `"${cs.enablingEvent.descripcion.replace(/"/g, '""')}"`,
              String(cs.enablingEvent.probabilidad),
              ipl ? `"${ipl.descripcion.replace(/"/g, '""')}"` : '""',
              ipl ? `"${ipl.tipo.replace(/"/g, '""')}"` : '""',
              ipl ? `"${ipl.tag.replace(/"/g, '""')}"` : '""',
              ipl ? String(ipl.pfd) : '""',
              ipl ? `"${ipl.isSafeguard}"` : '""',
              formatearCientifico(metricas.mel),
              formatearCientifico(metricas.ratio),
              formatearCientifico(metricas.rrf),
              `"${cs.recomendacion.replace(/"/g, '""')}"`,
              `"${cs.comentario.replace(/"/g, '""')}"`,
            ])
          }
        }
      }
    }

    const csvContent =
      'data:text/csv;charset=utf-8,\uFEFF' +
      filas.map((e) => e.join(',')).join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', 'LOPA_Worksheet_GIDR.csv')
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="space-y-2">
      {/* Cabecera compacta */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
            LOPA — Hoja de Trabajo (Análisis de Capas de Protección)
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Haz clic sobre cualquier celda para editar directamente. Cada causa puede tener múltiples capas de protección independientes (IPL).
          </p>
        </div>
      </div>

      {mensajeGuardado && (
        <div className="bg-emerald-50 border border-emerald-300 text-emerald-900 px-3 py-1.5 rounded text-xs font-medium flex items-center justify-between">
          <span>{mensajeGuardado}</span>
          <button
            type="button"
            onClick={() => setMensajeGuardado(null)}
            className="text-emerald-700 hover:text-emerald-950 font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Contenedor principal: barra de herramientas integrada a la tabla */}
      <div className="border border-slate-400 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm rounded-sm overflow-hidden">
        <div className="bg-white dark:bg-slate-900 border-b border-slate-300 dark:border-slate-700 px-2.5 py-1.5 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-1 text-slate-600 dark:text-slate-300">
            <IconBtn titulo="Agregar fila" onClick={agregarFila} disabled={!esAdmin} path="M12 5v14M5 12h14" cuadro />
            <IconBtn titulo="Duplicar fila seleccionada" onClick={duplicarFila} disabled={!esAdmin || !filaSel} path="M9 9h10v10H9zM5 15V5h10" />
            <IconBtn titulo="Eliminar fila seleccionada" onClick={eliminarFila} disabled={!esAdmin || !filaSel} path="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
            <span className="mx-1.5 h-4 w-px bg-slate-300" />
            <IconBtn titulo="Mover fila arriba" onClick={() => moverFila(-1)} disabled={!esAdmin || !filaSel} path="M6 15l6-6 6 6" />
            <IconBtn titulo="Mover fila abajo" onClick={() => moverFila(1)} disabled={!esAdmin || !filaSel} path="M6 9l6 6 6-6" />
            <span className="mx-1.5 h-4 w-px bg-slate-300" />
            <IconBtn titulo="Exportar a CSV" onClick={exportarCsv} path="M12 4v11M7 11l5 5 5-5M5 20h14" />
            <IconBtn titulo="Imprimir" onClick={() => window.print()} path="M7 9V4h10v5M7 17H5v-6h14v6h-2M7 14h10v6H7z" />
            {esAdmin && (
              <button
                type="button"
                onClick={handleGuardar}
                title="Guardar hoja LOPA"
                className="ml-1 px-2.5 py-1 rounded-md font-semibold flex items-center gap-1.5 bg-[#1e4e79] text-white hover:bg-[#163a5c] transition-colors"
              >
                💾 Guardar
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <select
              className="bg-white border border-slate-300 rounded-sm px-2 py-1 text-xs text-slate-700 focus:outline-none focus:border-[#1e4e79]"
              value={nodoFiltro}
              onChange={(e) => setNodoFiltro(e.target.value)}
            >
              <option value="">Todos los nodos ({nodosDisponibles.length})</option>
              {nodosDisponibles.map((nodo) => (
                <option key={nodo} value={nodo}>
                  {nodo}
                </option>
              ))}
            </select>
            <input
              className="bg-white border border-slate-300 rounded-sm px-2.5 py-1 text-xs text-slate-800 w-52 focus:outline-none focus:border-[#1e4e79]"
              placeholder="Search Worksheet..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </div>
        <div className="overflow-x-auto max-h-[calc(100vh-205px)] select-none">
          <table className="table-fixed min-w-[3455px] w-full border-collapse text-[11.5px] leading-relaxed text-slate-800 dark:text-slate-200">
            {/* Colgroup rígido para garantizar alineación exacta de las 20 columnas */}
            <colgroup>
              <col style={{ width: '170px' }} /> {/* 1. Deviation */}
              <col style={{ width: '360px' }} /> {/* 2. Consequence */}
              <col style={{ width: '55px' }} />  {/* 3. S */}
              <col style={{ width: '240px' }} /> {/* 4. CM-S Description */}
              <col style={{ width: '70px' }} />  {/* 5. CM-S Prob */}
              <col style={{ width: '105px' }} /> {/* 6. TMEL Safety */}
              <col style={{ width: '280px' }} /> {/* 7. Cause */}
              <col style={{ width: '90px' }} />  {/* 8. Frequency */}
              <col style={{ width: '190px' }} /> {/* 9. EE Desc */}
              <col style={{ width: '70px' }} />  {/* 10. EE Prob */}
              <col style={{ width: '320px' }} /> {/* 11. IPL Description */}
              <col style={{ width: '190px' }} /> {/* 12. Type */}
              <col style={{ width: '115px' }} /> {/* 13. Tag */}
              <col style={{ width: '80px' }} />  {/* 14. PFD */}
              <col style={{ width: '85px' }} />  {/* 15. Safeguard */}
              <col style={{ width: '105px' }} /> {/* 16. MEL Safety */}
              <col style={{ width: '110px' }} /> {/* 17. LOPA Ratio */}
              <col style={{ width: '100px' }} /> {/* 18. RRF Safety */}
              <col style={{ width: '260px' }} /> {/* 19. LOPA Recommendations */}
              <col style={{ width: '260px' }} /> {/* 20. LOPA Comment */}
            </colgroup>

            {/* Cabecera idéntica a la hoja exportada */}
            <thead className="sticky top-0 z-20 bg-[#f1f3f6] dark:bg-slate-900 border-b border-slate-300 dark:border-slate-800 font-bold text-slate-800 dark:text-slate-100">
              {/* Nivel 1 */}
              <tr>
                <th
                  rowSpan={3}
                  className="border border-slate-300 dark:border-slate-800 px-2 py-2 text-center bg-[#ebedf0] dark:bg-slate-850"
                >
                  Desviación
                </th>
                <th
                  colSpan={19}
                  className="border border-slate-300 dark:border-slate-800 px-2 py-1.5 text-center bg-[#e2e6ec] dark:bg-slate-800 uppercase tracking-wider text-[11px]"
                >
                  Consecuencias y Análisis de Capas de Protección (LOPA)
                </th>
              </tr>

              {/* Nivel 2 */}
              <tr className="text-[11px]">
                <th
                  rowSpan={2}
                  className="border border-slate-300 dark:border-slate-800 px-2.5 py-1.5 text-center bg-[#ebedf0] dark:bg-slate-850"
                >
                  Consecuencia
                </th>
                <th
                  rowSpan={2}
                  title="Safety Severity (1 a 5)"
                  className="border border-slate-300 dark:border-slate-800 px-1 py-1.5 text-center bg-[#ebedf0] dark:bg-slate-850"
                >
                  S
                </th>
                <th
                  colSpan={2}
                  title="Conditional Modifiers - Safety"
                  className="border border-slate-300 dark:border-slate-800 px-1.5 py-1.5 text-center bg-[#ebedf0] dark:bg-slate-850"
                >
                  CM-S
                </th>
                <th
                  rowSpan={2}
                  title="Tolerable Mitigated Event Likelihood (Safety)"
                  className="border border-slate-300 dark:border-slate-800 px-1.5 py-1.5 text-center bg-[#ebedf0] dark:bg-slate-850"
                >
                  TMEL Seguridad
                </th>
                <th
                  colSpan={9}
                  className="border border-slate-300 dark:border-slate-800 px-1.5 py-1.5 text-center bg-[#ebedf0] dark:bg-slate-850"
                >
                  Causas y Capas de Protección (IPL)
                </th>
                <th
                  rowSpan={2}
                  title="Mitigated Event Likelihood (Safety) = Freq × EE_Prob × CM_Prob × Product(PFD_IPLs)"
                  className="border border-slate-300 dark:border-slate-800 px-1.5 py-1.5 text-center bg-[#ebedf0] dark:bg-slate-850"
                >
                  MEL Seguridad
                </th>
                <th
                  rowSpan={2}
                  title="LOPA Ratio Safety = MEL / TMEL. (<= 1.0 Cumple criterio; > 1.0 Requiere mitigación adicional)"
                  className="border border-slate-300 dark:border-slate-800 px-1.5 py-1.5 text-center bg-[#ebedf0] dark:bg-slate-850"
                >
                  Ratio LOPA
                </th>
                <th
                  rowSpan={2}
                  title="Risk Reduction Factor (RRF) requerido para alcanzar el TMEL"
                  className="border border-slate-300 dark:border-slate-800 px-1.5 py-1.5 text-center bg-[#ebedf0] dark:bg-slate-850"
                >
                  RRF Seguridad
                </th>
                <th
                  rowSpan={2}
                  className="border border-slate-300 dark:border-slate-800 px-2 py-1.5 text-center bg-[#ebedf0] dark:bg-slate-850"
                >
                  Recomendaciones LOPA
                </th>
                <th
                  rowSpan={2}
                  className="border border-slate-300 dark:border-slate-800 px-2 py-1.5 text-center bg-[#ebedf0] dark:bg-slate-850"
                >
                  Comentarios LOPA
                </th>
              </tr>

              {/* Nivel 3 */}
              <tr className="text-[10.5px]">
                {/* CM-S (2 cols) */}
                <th className="border border-slate-300 dark:border-slate-800 px-1.5 py-1 text-center bg-[#f5f6f8] dark:bg-slate-800">
                  Descripción
                </th>
                <th className="border border-slate-300 dark:border-slate-800 px-1 py-1 text-center bg-[#f5f6f8] dark:bg-slate-800">
                  Prob.
                </th>

                {/* Causes & Enabling Events (4 cols) */}
                <th className="border border-slate-300 dark:border-slate-800 px-2 py-1 text-center bg-[#f5f6f8] dark:bg-slate-800">
                  Causa
                </th>
                <th
                  title="Frecuencia iniciadora anual (por año)"
                  className="border border-slate-300 dark:border-slate-800 px-1 py-1 text-center bg-[#f5f6f8] dark:bg-slate-800"
                >
                  Frecuencia
                </th>
                <th className="border border-slate-300 dark:border-slate-800 px-1.5 py-1 text-center bg-[#f5f6f8] dark:bg-slate-800">
                  Evento Hab. (Desc.)
                </th>
                <th className="border border-slate-300 dark:border-slate-800 px-1 py-1 text-center bg-[#f5f6f8] dark:bg-slate-800">
                  Prob. EH
                </th>

                {/* IPLs (5 cols) */}
                <th className="border border-slate-300 dark:border-slate-800 px-2 py-1 text-center bg-[#f5f6f8] dark:bg-slate-800">
                  Descripción IPL
                </th>
                <th className="border border-slate-300 dark:border-slate-800 px-1.5 py-1 text-center bg-[#f5f6f8] dark:bg-slate-800">
                  Tipo
                </th>
                <th className="border border-slate-300 dark:border-slate-800 px-1.5 py-1 text-center bg-[#f5f6f8] dark:bg-slate-800">
                  Tag
                </th>
                <th
                  title="Probability of Failure on Demand"
                  className="border border-slate-300 dark:border-slate-800 px-1 py-1 text-center bg-[#f5f6f8] dark:bg-slate-800"
                >
                  PFD
                </th>
                <th
                  title="Is Safeguard / Credited IPL?"
                  className="border border-slate-300 dark:border-slate-800 px-1 py-1 text-center bg-[#f5f6f8] dark:bg-slate-800"
                >
                  Salvaguarda
                </th>
              </tr>
            </thead>

            <tbody>
              {datosFiltrados.map((desv) => {
                // Calcular total de filas que ocupará esta desviación
                const totalFilasDesv = desv.consecuencias.reduce((sumC, c) => {
                  return (
                    sumC +
                    c.causas.reduce((sumCs, cs) => {
                      return sumCs + Math.max(1, cs.ipls.length)
                    }, 0)
                  )
                }, 0)

                let filaDesvRenderizada = false

                return (
                  <React.Fragment key={desv.id}>
                    {/* Fila divisoria de Nodo */}
                    <tr className="bg-slate-200/80 dark:bg-slate-800/80 font-bold text-slate-800 dark:text-slate-100 text-[11px]">
                      <td colSpan={20} className="px-3 py-1.5 border-y border-slate-300 dark:border-slate-700">
                        <span className="text-brand-700 dark:text-sky-400 font-mono mr-2">● NODO:</span>
                        {desv.nodo}
                      </td>
                    </tr>

                    {desv.consecuencias.map((cons) => {
                      const totalFilasCons = cons.causas.reduce((sumCs, cs) => {
                        return sumCs + Math.max(1, cs.ipls.length)
                      }, 0)

                      let filaConsRenderizada = false

                      return (
                        <React.Fragment key={cons.id}>
                          {cons.causas.map((causa) => {
                            const filasCausa = Math.max(1, causa.ipls.length)
                            const metricas = calcularMetricasCausa(
                              causa,
                              cons.conditionalModifier.probabilidad,
                              cons.tmel
                            )
                            const iplsLista =
                              causa.ipls.length > 0 ? causa.ipls : [null]

                            return iplsLista.map((ipl, iplIdx) => {
                              const esPrimeraFilaDesv = !filaDesvRenderizada
                              if (esPrimeraFilaDesv) filaDesvRenderizada = true

                              const esPrimeraFilaCons = !filaConsRenderizada
                              if (esPrimeraFilaCons) filaConsRenderizada = true

                              const esPrimeraFilaCausa = iplIdx === 0

                              return (
                                <tr
                                  key={`${causa.id}-ipl-${iplIdx}`}
                                  onClick={() =>
                                    setFilaSel({ desvId: desv.id, consId: cons.id, causaId: causa.id })
                                  }
                                  className={`align-top transition-colors ${
                                    filaSel?.causaId === causa.id
                                      ? 'bg-sky-50/40 dark:bg-sky-950/20'
                                      : 'bg-white dark:bg-slate-900/40 hover:bg-slate-50/70 dark:hover:bg-slate-800/30'
                                  }`}
                                >
                                  {/* 1. DEVIATION (rowSpan sobre toda la desviación) */}
                                  {esPrimeraFilaDesv && (
                                    <td
                                      rowSpan={totalFilasDesv}
                                      onClick={() => setCeldaSeleccionada(`desv-${desv.id}`)}
                                      className={`border border-slate-300 dark:border-slate-800 outline-none focus-within:ring-2 focus-within:ring-inset focus-within:ring-[#1e4e79] focus-within:bg-[#eef5fc] dark:focus-within:bg-slate-800 p-2 align-top bg-white dark:bg-slate-900 whitespace-normal break-words ${
                                        celdaSeleccionada === `desv-${desv.id}`
                                          ? 'ring-2 ring-inset ring-[#1e4e79]'
                                          : ''
                                      }`}
                                    >
                                      <div className="font-bold text-slate-900 dark:text-white flex items-start gap-1">
                                        <span className="font-mono text-slate-500 text-[10.5px] mt-0.5 shrink-0">
                                          {desv.numDesv}
                                        </span>
                                        <textarea
                                          disabled={!esAdmin}
                                          rows={1} style={AUTO_H}
                                          value={desv.desviacion}
                                          onChange={(e) =>
                                            updateDesviacion(desv.id, (act) => ({
                                              ...act,
                                              desviacion: e.target.value,
                                            }))
                                          }
                                          className="w-full bg-transparent font-bold focus:outline-none focus:bg-white dark:focus:bg-slate-800 px-0.5 rounded resize-none whitespace-normal break-words leading-snug"
                                        />
                                      </div>
                                    </td>
                                  )}

                                  {/* 2. CONSEQUENCE (rowSpan sobre la consecuencia) */}
                                  {esPrimeraFilaCons && (
                                    <td
                                      rowSpan={totalFilasCons}
                                      onClick={() => setCeldaSeleccionada(`cons-${cons.id}`)}
                                      className={`border border-slate-300 dark:border-slate-800 outline-none focus-within:ring-2 focus-within:ring-inset focus-within:ring-[#1e4e79] focus-within:bg-[#eef5fc] dark:focus-within:bg-slate-800 p-2 align-top whitespace-normal break-words ${
                                        celdaSeleccionada === `cons-${cons.id}`
                                          ? 'ring-2 ring-inset ring-[#1e4e79]'
                                          : ''
                                      }`}
                                    >
                                      <div className="flex items-start gap-1">
                                        <span className="font-mono text-slate-500 font-bold shrink-0 text-[10.5px] mt-0.5">
                                          {cons.numCons}
                                        </span>
                                        <textarea
                                          disabled={!esAdmin}
                                          rows={1} style={AUTO_H}
                                          value={cons.consecuencia}
                                          onChange={(e) =>
                                            updateConsecuencia(desv.id, cons.id, (act) => ({
                                              ...act,
                                              consecuencia: e.target.value,
                                            }))
                                          }
                                          className="w-full bg-transparent resize-y focus:outline-none focus:bg-white dark:focus:bg-slate-800 p-1 rounded leading-relaxed text-[11px] whitespace-normal break-words"
                                        />
                                      </div>
                                    </td>
                                  )}

                                  {/* 3. SAFETY SEVERITY (S: 1 a 5) */}
                                  {esPrimeraFilaCons && (
                                    <td
                                      rowSpan={totalFilasCons}
                                      className="border border-slate-300 dark:border-slate-800 outline-none focus-within:ring-2 focus-within:ring-inset focus-within:ring-[#1e4e79] focus-within:bg-[#eef5fc] dark:focus-within:bg-slate-800 p-1 text-center align-top"
                                    >
                                      <select
                                        disabled={!esAdmin}
                                        value={cons.severidad}
                                        onChange={(e) => {
                                          const sev = Number(e.target.value) || 1
                                          const tmelCalculado = Math.pow(10, -sev)
                                          updateConsecuencia(desv.id, cons.id, (act) => ({
                                            ...act,
                                            severidad: sev,
                                            tmel: tmelCalculado,
                                          }))
                                        }}
                                        className="w-full text-center font-bold font-mono bg-transparent cursor-pointer focus:outline-none py-1"
                                      >
                                        {[1, 2, 3, 4, 5].map((s) => (
                                          <option key={s} value={s}>
                                            {s}
                                          </option>
                                        ))}
                                      </select>
                                    </td>
                                  )}

                                  {/* 4. CONDITIONAL MODIFIERS (CM-S Descripcion & Probabilidad) */}
                                  {esPrimeraFilaCons && (
                                    <>
                                      <td
                                        rowSpan={totalFilasCons}
                                        className="border border-slate-300 dark:border-slate-800 outline-none focus-within:ring-2 focus-within:ring-inset focus-within:ring-[#1e4e79] focus-within:bg-[#eef5fc] dark:focus-within:bg-slate-800 p-1.5 align-top text-[10.5px] whitespace-normal break-words"
                                      >
                                        <textarea
                                          disabled={!esAdmin}
                                          rows={1} style={AUTO_H}
                                          value={cons.conditionalModifier.descripcion}
                                          onChange={(e) =>
                                            updateConsecuencia(desv.id, cons.id, (act) => ({
                                              ...act,
                                              conditionalModifier: {
                                                ...act.conditionalModifier,
                                                descripcion: e.target.value,
                                              },
                                            }))
                                          }
                                          placeholder="Descripción del modificador..."
                                          className="w-full bg-transparent resize-y focus:outline-none focus:bg-white dark:focus:bg-slate-800 p-1 rounded whitespace-normal break-words leading-snug"
                                        />
                                      </td>
                                      <td
                                        rowSpan={totalFilasCons}
                                        className="border border-slate-300 dark:border-slate-800 outline-none focus-within:ring-2 focus-within:ring-inset focus-within:ring-[#1e4e79] focus-within:bg-[#eef5fc] dark:focus-within:bg-slate-800 p-1 text-center align-top font-mono"
                                      >
                                        <input
                                          disabled={!esAdmin}
                                          type="number"
                                          step="0.01"
                                          min={0}
                                          max={1}
                                          value={cons.conditionalModifier.probabilidad}
                                          onChange={(e) =>
                                            updateConsecuencia(desv.id, cons.id, (act) => ({
                                              ...act,
                                              conditionalModifier: {
                                                ...act.conditionalModifier,
                                                probabilidad: Number(e.target.value) || 1,
                                              },
                                            }))
                                          }
                                          className="w-full text-center bg-transparent focus:outline-none font-bold py-1"
                                        />
                                      </td>
                                    </>
                                  )}

                                  {/* 5. TMEL SAFETY */}
                                  {esPrimeraFilaCons && (
                                    <td
                                      rowSpan={totalFilasCons}
                                      className="border border-slate-300 dark:border-slate-800 outline-none focus-within:ring-2 focus-within:ring-inset focus-within:ring-[#1e4e79] focus-within:bg-[#eef5fc] dark:focus-within:bg-slate-800 p-2 text-center align-top font-mono font-bold bg-slate-50/50 dark:bg-slate-900/50 text-slate-800 dark:text-slate-200"
                                    >
                                      {formatearCientifico(cons.tmel)}
                                      <div className="text-[9px] font-normal text-slate-400 mt-1">
                                        /año
                                      </div>
                                    </td>
                                  )}

                                  {/* 6. CAUSE (rowSpan por cada causa) */}
                                  {esPrimeraFilaCausa && (
                                    <>
                                      <td
                                        rowSpan={filasCausa}
                                        className="border border-slate-300 dark:border-slate-800 outline-none focus-within:ring-2 focus-within:ring-inset focus-within:ring-[#1e4e79] focus-within:bg-[#eef5fc] dark:focus-within:bg-slate-800 p-1.5 align-top whitespace-normal break-words"
                                      >
                                        <div className="flex items-start gap-1">
                                          <span className="font-mono text-slate-500 font-bold shrink-0 text-[10px] mt-0.5">
                                            {causa.numCausa}
                                          </span>
                                          <textarea
                                            disabled={!esAdmin}
                                            rows={1} style={AUTO_H}
                                            value={causa.causa}
                                            onChange={(e) =>
                                              updateCausa(desv.id, cons.id, causa.id, (act) => ({
                                                ...act,
                                                causa: e.target.value,
                                              }))
                                            }
                                            className="w-full bg-transparent resize-y focus:outline-none focus:bg-white dark:focus:bg-slate-800 p-1 rounded leading-relaxed whitespace-normal break-words text-[11px]"
                                          />
                                        </div>
                                      </td>

                                      {/* Frecuencia iniciadora */}
                                      <td
                                        rowSpan={filasCausa}
                                        className="border border-slate-300 dark:border-slate-800 outline-none focus-within:ring-2 focus-within:ring-inset focus-within:ring-[#1e4e79] focus-within:bg-[#eef5fc] dark:focus-within:bg-slate-800 p-1 text-center align-top font-mono"
                                      >
                                        <input
                                          disabled={!esAdmin}
                                          type="number"
                                          step="any"
                                          min={0}
                                          value={causa.frecuencia}
                                          onChange={(e) =>
                                            updateCausa(desv.id, cons.id, causa.id, (act) => ({
                                              ...act,
                                              frecuencia: Number(e.target.value) || 0,
                                            }))
                                          }
                                          className="w-full text-center bg-transparent font-bold focus:outline-none py-1"
                                        />
                                        <div className="text-[9px] text-slate-400">/año</div>
                                      </td>

                                      {/* Enabling Event: Descripcion & Prob */}
                                      <td
                                        rowSpan={filasCausa}
                                        className="border border-slate-300 dark:border-slate-800 outline-none focus-within:ring-2 focus-within:ring-inset focus-within:ring-[#1e4e79] focus-within:bg-[#eef5fc] dark:focus-within:bg-slate-800 p-1 text-[10.5px] align-top whitespace-normal break-words"
                                      >
                                        <textarea
                                          disabled={!esAdmin}
                                          rows={1} style={AUTO_H}
                                          value={causa.enablingEvent.descripcion}
                                          onChange={(e) =>
                                            updateCausa(desv.id, cons.id, causa.id, (act) => ({
                                              ...act,
                                              enablingEvent: {
                                                ...act.enablingEvent,
                                                descripcion: e.target.value,
                                              },
                                            }))
                                          }
                                          placeholder="Evento habilitante..."
                                          className="w-full bg-transparent resize-y focus:outline-none p-1 rounded whitespace-normal break-words leading-snug"
                                        />
                                      </td>
                                      <td
                                        rowSpan={filasCausa}
                                        className="border border-slate-300 dark:border-slate-800 outline-none focus-within:ring-2 focus-within:ring-inset focus-within:ring-[#1e4e79] focus-within:bg-[#eef5fc] dark:focus-within:bg-slate-800 p-1 text-center align-top font-mono"
                                      >
                                        <input
                                          disabled={!esAdmin}
                                          type="number"
                                          step="0.01"
                                          min={0}
                                          max={1}
                                          value={causa.enablingEvent.probabilidad}
                                          onChange={(e) =>
                                            updateCausa(desv.id, cons.id, causa.id, (act) => ({
                                              ...act,
                                              enablingEvent: {
                                                ...act.enablingEvent,
                                                probabilidad: Number(e.target.value) || 1,
                                              },
                                            }))
                                          }
                                          className="w-full text-center bg-transparent font-bold focus:outline-none py-1"
                                        />
                                      </td>
                                    </>
                                  )}

                                  {/* 7. COLUMNAS DE IPL (1 fila por IPL) */}
                                  {ipl ? (
                                    <>
                                      {/* IPL Descripcion */}
                                      <td className="border border-slate-300 dark:border-slate-800 outline-none focus-within:ring-2 focus-within:ring-inset focus-within:ring-[#1e4e79] focus-within:bg-[#eef5fc] dark:focus-within:bg-slate-800 p-1.5 align-top whitespace-normal break-words">
                                        <div className="flex items-start justify-between gap-1">
                                          <textarea
                                            disabled={!esAdmin}
                                            rows={1} style={AUTO_H}
                                            value={ipl.descripcion}
                                            onChange={(e) =>
                                              updateIpl(desv.id, cons.id, causa.id, ipl.id, (act) => ({
                                                ...act,
                                                descripcion: e.target.value,
                                              }))
                                            }
                                            className="w-full bg-transparent focus:outline-none focus:bg-white dark:focus:bg-slate-800 px-1 py-0.5 rounded text-[11px] resize-y whitespace-normal break-words leading-relaxed"
                                          />
                                          {esAdmin && (
                                            <button
                                              type="button"
                                              onClick={() =>
                                                eliminarIpl(desv.id, cons.id, causa.id, ipl.id)
                                              }
                                              className="text-slate-300 hover:text-red-500 text-[11px] px-1 font-bold shrink-0 mt-0.5"
                                              title="Eliminar esta IPL"
                                            >
                                              ✕
                                            </button>
                                          )}
                                        </div>
                                      </td>

                                      {/* IPL Type */}
                                      <td className="border border-slate-300 dark:border-slate-800 outline-none focus-within:ring-2 focus-within:ring-inset focus-within:ring-[#1e4e79] focus-within:bg-[#eef5fc] dark:focus-within:bg-slate-800 p-1.5 align-top text-[10.5px] whitespace-normal break-words">
                                        <select
                                          disabled={!esAdmin}
                                          value={ipl.tipo}
                                          onChange={(e) =>
                                            updateIpl(desv.id, cons.id, causa.id, ipl.id, (act) => ({
                                              ...act,
                                              tipo: e.target.value,
                                            }))
                                          }
                                          className="w-full bg-transparent cursor-pointer focus:outline-none whitespace-normal break-words"
                                        >
                                          <option value="Relief Valve">Relief Valve (PSV)</option>
                                          <option value="SIF (Safety Instrumented Function)">
                                            SIF (Safety Instrumented Function)
                                          </option>
                                          <option value="BPCS Loop">BPCS Loop (Control Básico)</option>
                                          <option value="Operator Action (BPCS Alarm)">
                                            Operator Action (Alarma)
                                          </option>
                                          <option value="Check Valve">Check Valve (Retención)</option>
                                          <option value="Fire & Gas Mitigation">
                                            Fire & Gas Mitigation
                                          </option>
                                        </select>
                                      </td>

                                      {/* Tag de instrumento */}
                                      <td className="border border-slate-300 dark:border-slate-800 outline-none focus-within:ring-2 focus-within:ring-inset focus-within:ring-[#1e4e79] focus-within:bg-[#eef5fc] dark:focus-within:bg-slate-800 p-1.5 align-top text-center font-mono font-bold text-sky-700 dark:text-sky-400">
                                        <input
                                          disabled={!esAdmin}
                                          value={ipl.tag}
                                          onChange={(e) =>
                                            updateIpl(desv.id, cons.id, causa.id, ipl.id, (act) => ({
                                              ...act,
                                              tag: e.target.value,
                                            }))
                                          }
                                          className="w-full text-center bg-transparent focus:outline-none"
                                        />
                                      </td>

                                      {/* PFD */}
                                      <td className="border border-slate-300 dark:border-slate-800 outline-none focus-within:ring-2 focus-within:ring-inset focus-within:ring-[#1e4e79] focus-within:bg-[#eef5fc] dark:focus-within:bg-slate-800 p-1.5 text-center align-top font-mono font-bold">
                                        <input
                                          disabled={!esAdmin}
                                          type="number"
                                          step="0.001"
                                          min={0}
                                          max={1}
                                          value={ipl.pfd}
                                          onChange={(e) =>
                                            updateIpl(desv.id, cons.id, causa.id, ipl.id, (act) => ({
                                              ...act,
                                              pfd: Number(e.target.value) || 0.1,
                                            }))
                                          }
                                          className="w-full text-center bg-transparent focus:outline-none"
                                        />
                                      </td>

                                      {/* Is Safeguard / Credited */}
                                      <td className="border border-slate-300 dark:border-slate-800 outline-none focus-within:ring-2 focus-within:ring-inset focus-within:ring-[#1e4e79] focus-within:bg-[#eef5fc] dark:focus-within:bg-slate-800 p-1.5 text-center align-top font-semibold">
                                        <select
                                          disabled={!esAdmin}
                                          value={ipl.isSafeguard}
                                          onChange={(e) =>
                                            updateIpl(desv.id, cons.id, causa.id, ipl.id, (act) => ({
                                              ...act,
                                              isSafeguard: e.target.value as 'Yes' | 'No',
                                            }))
                                          }
                                          className={`w-full text-center rounded px-1.5 py-0.5 cursor-pointer focus:outline-none font-bold ${
                                            ipl.isSafeguard === 'Yes'
                                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300'
                                              : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                                          }`}
                                        >
                                          <option value="Yes">Sí</option>
                                          <option value="No">No</option>
                                        </select>
                                      </td>
                                    </>
                                  ) : (
                                    <>
                                      <td
                                        colSpan={5}
                                        className="border border-slate-300 dark:border-slate-800 outline-none focus-within:ring-2 focus-within:ring-inset focus-within:ring-[#1e4e79] focus-within:bg-[#eef5fc] dark:focus-within:bg-slate-800 p-3 text-center text-slate-400 italic"
                                      >
                                        Sin capas de protección independientes (IPLs) registradas.
                                      </td>
                                    </>
                                  )}

                                  {/* 8. RESULTADOS LOPA (rowSpan por cada Causa) */}
                                  {esPrimeraFilaCausa && (
                                    <>
                                      {/* MEL Safety */}
                                      <td
                                        rowSpan={filasCausa}
                                        className="border border-slate-300 dark:border-slate-800 outline-none focus-within:ring-2 focus-within:ring-inset focus-within:ring-[#1e4e79] focus-within:bg-[#eef5fc] dark:focus-within:bg-slate-800 p-2 text-center align-top font-mono font-bold"
                                      >
                                        <div
                                          className={`px-1.5 py-1 rounded ${
                                            metricas.cumpleTmel
                                              ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                                              : 'bg-red-50 text-red-800 dark:bg-red-950/60 dark:text-red-300 font-extrabold'
                                          }`}
                                        >
                                          {formatearCientifico(metricas.mel)}
                                        </div>
                                      </td>

                                      {/* LOPA Ratio Safety */}
                                      <td
                                        rowSpan={filasCausa}
                                        className="border border-slate-300 dark:border-slate-800 outline-none focus-within:ring-2 focus-within:ring-inset focus-within:ring-[#1e4e79] focus-within:bg-[#eef5fc] dark:focus-within:bg-slate-800 p-2 text-center align-top font-mono font-extrabold"
                                      >
                                        <div
                                          className={`px-1.5 py-1 rounded ${
                                            metricas.cumpleTmel
                                              ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200'
                                              : metricas.ratio <= 10
                                              ? 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200'
                                              : 'bg-red-600 text-white font-black animate-pulse'
                                          }`}
                                        >
                                          {formatearCientifico(metricas.ratio)}
                                        </div>
                                        <div className="text-[9px] font-normal text-slate-500 mt-1">
                                          {metricas.cumpleTmel ? '✓ Aceptable' : '▲ Brecha'}
                                        </div>
                                      </td>

                                      {/* RRF Safety */}
                                      <td
                                        rowSpan={filasCausa}
                                        className="border border-slate-300 dark:border-slate-800 outline-none focus-within:ring-2 focus-within:ring-inset focus-within:ring-[#1e4e79] focus-within:bg-[#eef5fc] dark:focus-within:bg-slate-800 p-2 text-center align-top font-mono font-bold"
                                      >
                                        <div className="text-slate-900 dark:text-slate-100">
                                          {formatearCientifico(metricas.rrf)}
                                        </div>
                                        {metricas.rrf > 1.0 && (
                                          <span className="chip text-[9px] bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300 mt-1">
                                            {metricas.rrf > 1000
                                              ? 'SIL 3'
                                              : metricas.rrf > 100
                                              ? 'SIL 2'
                                              : 'SIL 1'}
                                          </span>
                                        )}
                                      </td>

                                      {/* LOPA Recommendation */}
                                      <td
                                        rowSpan={filasCausa}
                                        className="border border-slate-300 dark:border-slate-800 outline-none focus-within:ring-2 focus-within:ring-inset focus-within:ring-[#1e4e79] focus-within:bg-[#eef5fc] dark:focus-within:bg-slate-800 p-2 align-top text-[10.5px] whitespace-normal break-words"
                                      >
                                        <textarea
                                          disabled={!esAdmin}
                                          rows={1} style={AUTO_H}
                                          value={causa.recomendacion}
                                          onChange={(e) =>
                                            updateCausa(desv.id, cons.id, causa.id, (act) => ({
                                              ...act,
                                              recomendacion: e.target.value,
                                            }))
                                          }
                                          placeholder="Recomendación técnica..."
                                          className="w-full bg-transparent resize-y focus:outline-none p-1 rounded whitespace-normal break-words leading-relaxed"
                                        />
                                        {esAdmin && (
                                          <div className="mt-1.5 pt-1.5 border-t border-slate-200 dark:border-slate-800 text-right">
                                            <button
                                              type="button"
                                              onClick={() =>
                                                agregarIpl(desv.id, cons.id, causa.id)
                                              }
                                              className="text-[10px] text-brand-600 dark:text-sky-400 hover:underline font-bold"
                                            >
                                              + Agregar IPL
                                            </button>
                                          </div>
                                        )}
                                      </td>

                                      {/* LOPA Comment */}
                                      <td
                                        rowSpan={filasCausa}
                                        className="border border-slate-300 dark:border-slate-800 outline-none focus-within:ring-2 focus-within:ring-inset focus-within:ring-[#1e4e79] focus-within:bg-[#eef5fc] dark:focus-within:bg-slate-800 p-2 align-top text-[10.5px] whitespace-normal break-words"
                                      >
                                        <textarea
                                          disabled={!esAdmin}
                                          rows={1} style={AUTO_H}
                                          value={causa.comentario}
                                          onChange={(e) =>
                                            updateCausa(desv.id, cons.id, causa.id, (act) => ({
                                              ...act,
                                              comentario: e.target.value,
                                            }))
                                          }
                                          placeholder="Comentario de sesión LOPA..."
                                          className="w-full bg-transparent resize-y focus:outline-none text-slate-500 dark:text-slate-400 p-1 rounded whitespace-normal break-words leading-relaxed"
                                        />
                                      </td>
                                    </>
                                  )}
                                </tr>
                              )
                            })
                          })}
                        </React.Fragment>
                      )
                    })}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
