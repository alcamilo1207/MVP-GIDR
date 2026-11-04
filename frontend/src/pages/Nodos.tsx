import React, { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { IconBtn } from '../components/IconBtn'
import type { Pagina, Unidad } from '../lib/types'

/** Nodo tal como lo expone el backend (`/nodos`). */
interface NodoApi {
  id: number
  unidad_id: number
  nombre: string
  descripcion: string | null
  condiciones_diseno: string | null
  condiciones_operacion: string | null
  color: string | null
  sesion: string | null
  planos: string[] | null
  comentarios: string | null
}

interface NodoEditable {
  id: number
  unidad_id: number
  nombre: string
  intencion: string
  condicionesDiseno: string
  condicionesOperacion: string
  color: string
  sesion: string
  planos: string[]
  comentarios: string
  modificado: boolean
}

const AUTO_H = { fieldSizing: 'content' } as React.CSSProperties
const CELDA =
  'border border-slate-300 dark:border-slate-700 outline-none focus-within:ring-2 focus-within:ring-inset focus-within:ring-[#1e4e79] focus-within:bg-[#eef5fc] dark:focus-within:bg-slate-800'
const CAMPO =
  'w-full bg-transparent resize-none focus:outline-none px-1 py-0.5 rounded-xs leading-snug whitespace-normal break-words'

const aEditable = (n: NodoApi): NodoEditable => ({
  id: n.id,
  unidad_id: n.unidad_id,
  nombre: n.nombre,
  intencion: n.descripcion ?? '',
  condicionesDiseno: n.condiciones_diseno ?? '',
  condicionesOperacion: n.condiciones_operacion ?? '',
  color: n.color ?? '',
  sesion: n.sesion ?? '',
  planos: n.planos ?? [],
  comentarios: n.comentarios ?? '',
  modificado: false,
})

const aPayload = (n: Omit<NodoEditable, 'id' | 'modificado'>) => ({
  unidad_id: n.unidad_id,
  nombre: n.nombre.trim(),
  descripcion: n.intencion.trim() || null,
  condiciones_diseno: n.condicionesDiseno.trim() || null,
  condiciones_operacion: n.condicionesOperacion.trim() || null,
  color: n.color.trim() || null,
  sesion: n.sesion.trim() || null,
  planos: n.planos.map((p) => p.trim()).filter(Boolean),
  comentarios: n.comentarios.trim() || null,
})

export function Nodos() {
  const { usuario } = useAuth()
  const esAdmin = usuario?.rol === 'admin'
  const qc = useQueryClient()

  const [unidadId, setUnidadId] = useState<number | ''>('')
  const [q, setQ] = useState('')
  const [seleccion, setSeleccion] = useState<number | null>(null)
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)
  const [borradores, setBorradores] = useState<Record<number, NodoEditable>>({})
  const [ocupado, setOcupado] = useState(false)
  const [modal, setModal] = useState(false)
  const [nuevaUnidadId, setNuevaUnidadId] = useState<number | ''>('')
  const [nuevoNombre, setNuevoNombre] = useState('')

  const unidades = useQuery({
    queryKey: ['unidades'],
    queryFn: () => api.get<Pagina<Unidad>>('/unidades', { size: 100 }),
  })

  const nodos = useQuery({
    queryKey: ['nodos-hoja'],
    queryFn: () => api.get<Pagina<NodoApi>>('/nodos', { size: 500 }),
  })

  useEffect(() => {
    if (!nodos.data?.items) return
    setBorradores((prev) => {
      const next: Record<number, NodoEditable> = {}
      for (const n of nodos.data.items) {
        next[n.id] = prev[n.id]?.modificado ? prev[n.id] : aEditable(n)
      }
      return next
    })
  }, [nodos.data])

  const nombreUnidad = (id: number) =>
    unidades.data?.items.find((u) => u.id === id)?.nombre ?? ''

  const lista = useMemo(
    () => (nodos.data?.items ?? []).map((n) => borradores[n.id] ?? aEditable(n)),
    [nodos.data, borradores]
  )

  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase()
    return lista.filter((n) => {
      if (unidadId !== '' && n.unidad_id !== unidadId) return false
      if (!t) return true
      return [n.nombre, n.intencion, n.condicionesDiseno, n.condicionesOperacion, n.sesion, n.comentarios,
        ...n.planos, nombreUnidad(n.unidad_id)]
        .join(' ')
        .toLowerCase()
        .includes(t)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lista, q, unidadId, unidades.data])

  const modificados = useMemo(() => lista.filter((n) => n.modificado), [lista])

  const avisar = (tipo: 'ok' | 'error', texto: string) => {
    setMensaje({ tipo, texto })
    if (tipo === 'ok') setTimeout(() => setMensaje(null), 3500)
  }

  const refrescar = async () => {
    await qc.invalidateQueries({ queryKey: ['nodos-hoja'] })
    await qc.invalidateQueries({ queryKey: ['nodos-pha'] })
    await qc.invalidateQueries({ queryKey: ['escenarios-pha'] })
    await qc.invalidateQueries({ queryKey: ['dashboard'] })
  }

  const actualizar = (id: number, cambios: Partial<NodoEditable>) =>
    setBorradores((prev) => (prev[id] ? { ...prev, [id]: { ...prev[id], ...cambios, modificado: true } } : prev))

  const actualizarPlano = (id: number, idx: number, texto: string) => {
    const n = borradores[id]
    if (!n) return
    actualizar(id, { planos: n.planos.map((p, i) => (i === idx ? texto : p)) })
  }

  const agregarPlano = (id: number) => {
    const n = borradores[id]
    if (n) actualizar(id, { planos: [...n.planos, ''] })
  }

  const quitarPlano = (id: number, idx: number) => {
    const n = borradores[id]
    if (n) actualizar(id, { planos: n.planos.filter((_, i) => i !== idx) })
  }

  const ejecutar = async (fn: () => Promise<void>) => {
    setOcupado(true)
    try {
      await fn()
    } catch (e) {
      avisar('error', (e as Error).message || 'La operación falló')
    } finally {
      setOcupado(false)
    }
  }

  const abrirModal = () => {
    const base = seleccion ? borradores[seleccion] : undefined
    setNuevaUnidadId(
      unidadId !== '' ? unidadId : (base?.unidad_id ?? unidades.data?.items[0]?.id ?? '')
    )
    setNuevoNombre('')
    setModal(true)
  }

  const crearNodo = () =>
    ejecutar(async () => {
      if (nuevaUnidadId === '' || !nuevoNombre.trim()) return
      const creado = await api.post<NodoApi>('/nodos', {
        unidad_id: Number(nuevaUnidadId),
        nombre: nuevoNombre.trim(),
      })
      setModal(false)
      await refrescar()
      setSeleccion(creado.id)
      avisar('ok', `Nodo "${creado.nombre}" creado.`)
    })

  const duplicar = () =>
    ejecutar(async () => {
      const n = seleccion ? borradores[seleccion] : undefined
      if (!n) return
      const sufijo = ` (copia ${Date.now().toString().slice(-3)})`
      const nombre = `${n.nombre.slice(0, 200 - sufijo.length)}${sufijo}`
      const creado = await api.post<NodoApi>('/nodos', aPayload({ ...n, nombre }))
      await refrescar()
      setSeleccion(creado.id)
      avisar('ok', 'Nodo duplicado.')
    })

  const eliminar = () =>
    ejecutar(async () => {
      const n = seleccion ? borradores[seleccion] : undefined
      if (!n) return
      const ok = window.confirm(
        `¿Eliminar el nodo "${n.nombre}"?\n\nSe eliminarán también sus desviaciones y escenarios PHA asociados.`
      )
      if (!ok) return
      await api.del(`/nodos/${n.id}`)
      setSeleccion(null)
      await refrescar()
      avisar('ok', 'Nodo eliminado.')
    })

  const guardar = () =>
    ejecutar(async () => {
      for (const n of modificados) {
        await api.put(`/nodos/${n.id}`, aPayload(n))
      }
      setBorradores((prev) => {
        const next = { ...prev }
        for (const n of modificados) if (next[n.id]) next[n.id] = { ...next[n.id], modificado: false }
        return next
      })
      await refrescar()
      avisar('ok', `Se guardaron ${modificados.length} nodo(s).`)
    })

  const exportarCsv = () => {
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`
    const lineas = [
      ['N°', 'Unidad', 'Descripción', 'Intención', 'Condiciones de Diseño', 'Condiciones de Operación',
        'Color', 'Sesión', 'Planos', 'Comentarios'].map(esc).join(','),
    ]
    lista.forEach((n, i) =>
      lineas.push(
        [String(i + 1), nombreUnidad(n.unidad_id), n.nombre, n.intencion, n.condicionesDiseno,
          n.condicionesOperacion, n.color, n.sesion, n.planos.join(' | '), n.comentarios]
          .map(esc)
          .join(',')
      )
    )
    const blob = new Blob(['\uFEFF' + lineas.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'Nodos_GIDR.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const campo = (valor: string, onChange: (v: string) => void, extra = '', max?: number) => (
    <textarea
      disabled={!esAdmin}
      rows={1}
      style={AUTO_H}
      maxLength={max}
      value={valor}
      onChange={(e) => onChange(e.target.value)}
      className={`${CAMPO} ${extra}`}
    />
  )

  const th =
    'border border-slate-300 dark:border-slate-700 px-2 py-1.5 text-center bg-[#ebedf0] dark:bg-slate-800'

  return (
    <div className="space-y-2">
      <div>
        <h1 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
          Nodos — Hoja de Trabajo (Definición de Nodos de Estudio)
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Los nodos se leen y se guardan en el backend; son los mismos que usa la hoja de Escenarios PHA. Haz clic sobre cualquier celda para editar.
        </p>
      </div>

      {mensaje && (
        <div
          className={`px-3 py-1.5 rounded text-xs font-medium flex items-center justify-between border ${
            mensaje.tipo === 'ok'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
              : 'bg-red-50 border-red-300 text-red-800'
          }`}
        >
          <span>{mensaje.tipo === 'ok' ? '✓ ' : '⚠ '}{mensaje.texto}</span>
          <button type="button" onClick={() => setMensaje(null)} className="font-bold">
            ✕
          </button>
        </div>
      )}

      <div className="border border-slate-400 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm rounded-sm overflow-hidden">
        <div className="bg-white dark:bg-slate-900 border-b border-slate-300 dark:border-slate-700 px-2.5 py-1.5 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-1">
            <IconBtn titulo="Agregar nodo" onClick={abrirModal} disabled={!esAdmin || ocupado} path="M12 5v14M5 12h14" cuadro />
            <IconBtn titulo="Duplicar nodo seleccionado" onClick={duplicar} disabled={!esAdmin || !seleccion || ocupado} path="M9 9h10v10H9zM5 15V5h10" />
            <IconBtn titulo="Eliminar nodo seleccionado" onClick={eliminar} disabled={!esAdmin || !seleccion || ocupado} path="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
            <span className="mx-1.5 h-4 w-px bg-slate-300" />
            <IconBtn titulo="Exportar a CSV" onClick={exportarCsv} path="M12 4v11M7 11l5 5 5-5M5 20h14" />
            <IconBtn titulo="Imprimir" onClick={() => window.print()} path="M7 9V4h10v5M7 17H5v-6h14v6h-2M7 14h10v6H7z" />
            {esAdmin && (
              <button
                type="button"
                onClick={guardar}
                disabled={modificados.length === 0 || ocupado}
                title="Guardar cambios en el backend"
                className={`ml-1 px-2.5 py-1 rounded-md font-semibold flex items-center gap-1.5 transition-colors ${
                  modificados.length > 0
                    ? 'bg-[#1e4e79] text-white hover:bg-[#163a5c]'
                    : 'bg-slate-100 text-slate-400 border border-slate-200'
                }`}
              >
                💾 Guardar
                {modificados.length > 0 && (
                  <span className="bg-amber-400 text-slate-950 px-1.5 rounded-full text-[10px] font-bold">
                    {modificados.length}
                  </span>
                )}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <select
              className="bg-white border border-slate-300 rounded-sm px-2 py-1 text-xs text-slate-700 focus:outline-none focus:border-[#1e4e79]"
              value={unidadId}
              onChange={(e) => setUnidadId(e.target.value ? Number(e.target.value) : '')}
            >
              <option value="">Todas las unidades ({unidades.data?.total ?? 0})</option>
              {unidades.data?.items.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nombre}
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

        <div className="overflow-x-auto max-h-[calc(100vh-205px)]">
          <table className="table-fixed w-full min-w-[1850px] border-collapse text-[12px] leading-snug text-slate-800 dark:text-slate-200">
            <colgroup>
              <col style={{ width: '300px' }} />
              <col style={{ width: '300px' }} />
              <col style={{ width: '250px' }} />
              <col style={{ width: '270px' }} />
              <col style={{ width: '110px' }} />
              <col style={{ width: '110px' }} />
              <col style={{ width: '210px' }} />
              <col style={{ width: '300px' }} />
            </colgroup>
            <thead className="sticky top-0 z-20 font-bold text-slate-800 dark:text-slate-100">
              <tr>
                <th className={th}>Descripción</th>
                <th className={th}>Intención</th>
                <th className={th}>Condiciones de Diseño</th>
                <th className={th}>Condiciones de Operación</th>
                <th className={th}>Color</th>
                <th className={th}>Sesión</th>
                <th className={th}>Plano</th>
                <th className={th}>Comentarios</th>
              </tr>
            </thead>
            <tbody>
              {nodos.isLoading && (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-400 text-sm">
                    Cargando nodos...
                  </td>
                </tr>
              )}
              {visibles.map((n) => {
                const numero = lista.findIndex((x) => x.id === n.id) + 1
                const span = Math.max(1, n.planos.length)
                const filasPlano: (string | null)[] = n.planos.length > 0 ? n.planos : [null]
                const activa = seleccion === n.id
                return (
                  <React.Fragment key={n.id}>
                    {filasPlano.map((plano, i) => (
                      <tr
                        key={`${n.id}-${i}`}
                        onClick={() => setSeleccion(n.id)}
                        className={`align-top ${activa ? 'bg-sky-50/40 dark:bg-sky-950/20' : 'bg-white dark:bg-slate-900/40'}`}
                      >
                        {i === 0 && (
                          <>
                            <td rowSpan={span} className={`${CELDA} p-1.5`}>
                              <div className="flex items-start gap-1">
                                <span className="font-mono text-slate-500 font-semibold shrink-0 mt-0.5">{numero}</span>
                                {campo(n.nombre, (v) => actualizar(n.id, { nombre: v }), '', 200)}
                              </div>
                              <div className="mt-1 pl-4 text-[10px] text-slate-400 truncate">
                                Unidad: {nombreUnidad(n.unidad_id)}
                              </div>
                            </td>
                            <td rowSpan={span} className={`${CELDA} p-1.5`}>
                              {campo(n.intencion, (v) => actualizar(n.id, { intencion: v }))}
                            </td>
                            <td rowSpan={span} className={`${CELDA} p-1.5`}>
                              {campo(n.condicionesDiseno, (v) => actualizar(n.id, { condicionesDiseno: v }))}
                            </td>
                            <td rowSpan={span} className={`${CELDA} p-1.5`}>
                              {campo(n.condicionesOperacion, (v) => actualizar(n.id, { condicionesOperacion: v }))}
                            </td>
                            <td rowSpan={span} className={`${CELDA} p-1.5`}>
                              {campo(n.color, (v) => actualizar(n.id, { color: v }), '', 40)}
                            </td>
                            <td rowSpan={span} className={`${CELDA} p-1.5`}>
                              {campo(n.sesion, (v) => actualizar(n.id, { sesion: v }), '', 80)}
                            </td>
                          </>
                        )}

                        <td className={`${CELDA} p-1.5`}>
                          {plano !== null ? (
                            <div className="flex items-start justify-between gap-1">
                              {campo(plano, (v) => actualizarPlano(n.id, i, v))}
                              {esAdmin && (
                                <button
                                  type="button"
                                  title="Quitar plano"
                                  onClick={() => quitarPlano(n.id, i)}
                                  className="shrink-0 px-1 text-[11px] font-bold text-slate-300 hover:text-red-500"
                                >
                                  ✕
                                </button>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-300 italic">Sin planos</span>
                          )}
                          {esAdmin && i === filasPlano.length - 1 && (
                            <div className="mt-1 text-right">
                              <button
                                type="button"
                                onClick={() => agregarPlano(n.id)}
                                className="text-[10px] font-bold text-[#1e4e79] hover:underline"
                              >
                                + Agregar plano
                              </button>
                            </div>
                          )}
                        </td>

                        {i === 0 && (
                          <td rowSpan={span} className={`${CELDA} p-1.5`}>
                            {campo(n.comentarios, (v) => actualizar(n.id, { comentarios: v }), 'text-slate-500')}
                          </td>
                        )}
                      </tr>
                    ))}
                  </React.Fragment>
                )
              })}
              {!nodos.isLoading && visibles.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-400 text-sm">
                    No se encontraron nodos para los filtros seleccionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <h3 className="text-sm font-bold text-slate-900">Nuevo nodo</h3>
              <button type="button" onClick={() => setModal(false)} className="font-bold text-slate-400 hover:text-slate-600">
                ✕
              </button>
            </div>
            <div className="space-y-3 text-xs">
              <div>
                <label className="mb-1 block font-medium text-slate-600">Unidad</label>
                <select
                  className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs"
                  value={nuevaUnidadId}
                  onChange={(e) => setNuevaUnidadId(e.target.value ? Number(e.target.value) : '')}
                >
                  {unidades.data?.items.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block font-medium text-slate-600">Descripción del nodo</label>
                <textarea
                  rows={3}
                  maxLength={200}
                  className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs"
                  placeholder="Ej. Horno H-101 y sistema de gas combustible"
                  value={nuevoNombre}
                  onChange={(e) => setNuevoNombre(e.target.value)}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setModal(false)} className="rounded border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50">
                Cancelar
              </button>
              <button
                type="button"
                disabled={nuevaUnidadId === '' || !nuevoNombre.trim() || ocupado}
                onClick={crearNodo}
                className="rounded bg-[#1e4e79] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#163a5c] disabled:opacity-50"
              >
                Crear nodo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
