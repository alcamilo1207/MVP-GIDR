import React, { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { IconBtn } from '../components/IconBtn'

export type NivelRiesgo = 'Extremo' | 'Alto' | 'Medio' | 'Bajo'

export type CategoriaRiesgo =
  | 'Disponibilidad operacional'
  | 'Incidentes y Seguridad de Procesos'
  | 'Pérdida de función'
  | 'Integridad mecánica'
  | 'Cumplimiento ambiental / regulatorio'
  | 'Confiabilidad de activos'

export type EstadoRiesgo =
  | 'En ejecución'
  | 'En planeación'
  | 'Pendiente por materiales'
  | 'En revisión'
  | 'Mitigado / Cerrado'

export type EstadoAccion = 'Abierta' | 'Finalizada'

export type NivelAccion = 'Nivel Causa' | 'Nivel Barrera'

export interface AccionMitigacion {
  id: string // e.g. ACT-001
  riesgo_id: string // FK
  titulo: string
  nivel: NivelAccion
  responsable: string
  estado: EstadoAccion
  avance: number // 0 - 100
  fecha_vencimiento: string
  fecha_creacion: string
}

export interface RiesgoItem {
  id: string // e.g. RSK-001
  escenario_id: string // ID del escenario consistente con Escenarios PHA (1.1, 1.2, ...)
  escenario_nodo: string // e.g. "1.1 · Horno H-101"
  titulo: string
  origen: 'Causa' | 'Barrera'
  tag_asociado: string
  categoria: CategoriaRiesgo
  nivel_riesgo: NivelRiesgo
  avance: number // 0 - 100
  estado: EstadoRiesgo
  fecha_creacion: string
  descripcion_detalle?: string
}

// Catálogo de Escenarios PHA de la planta GIDR consistente con 1.1, 1.2...
export const CATALOGO_ESCENARIOS = [
  { id: '1.1', ref: '1.1', nodo: 'Horno H-101', desv: 'Más temperatura', causa: 'Falla del controlador TIC-101 con salida alta' },
  { id: '1.2', ref: '1.2', nodo: 'Horno H-101', desv: 'Menos flujo', causa: 'Falla de la bomba de carga P-101A' },
  { id: '1.3', ref: '1.3', nodo: 'Columna T-101', desv: 'Más presión', causa: 'Pérdida de condensación de cabeza (falla aeroenfriadores)' },
  { id: '1.4', ref: '1.4', nodo: 'Columna T-101', desv: 'Más nivel', causa: 'Falla del transmisor de nivel LT-101 en el fondo' },
  { id: '1.5', ref: '1.5', nodo: 'Desalador D-101', desv: 'Más presión', causa: 'Bloqueo de la salida del desalador' },
  { id: '1.6', ref: '1.6', nodo: 'Desalador D-101', desv: 'Otro que (contaminación)', causa: 'Ingreso de agua en exceso en el crudo' },
  { id: '1.7', ref: '1.7', nodo: 'Reactor R-201', desv: 'Más temperatura', causa: 'Pérdida de quench de hidrógeno por falla de lazo' },
  { id: '1.8', ref: '1.8', nodo: 'Reactor R-201', desv: 'Más presión', causa: 'Cierre de la válvula de salida del reactor' },
  { id: '1.9', ref: '1.9', nodo: 'Compresor K-201', desv: 'Menos flujo', causa: 'Disparo del compresor de reciclo por falla eléctrica' },
  { id: '1.10', ref: '1.10', nodo: 'Compresor K-201', desv: 'Más temperatura', causa: 'Falla del aeroenfriador de descarga' },
  { id: '1.11', ref: '1.11', nodo: 'Separador V-202', desv: 'Más nivel', causa: 'Falla del lazo de nivel LIC-202' },
  { id: '1.12', ref: '1.12', nodo: 'Separador V-202', desv: 'Menos nivel', causa: 'Pérdida del sello de líquido en V-202' },
]

const CATEGORIAS: CategoriaRiesgo[] = [
  'Disponibilidad operacional',
  'Incidentes y Seguridad de Procesos',
  'Pérdida de función',
  'Integridad mecánica',
  'Cumplimiento ambiental / regulatorio',
  'Confiabilidad de activos',
]

const ESTADOS_RIESGO: EstadoRiesgo[] = [
  'En ejecución',
  'En planeación',
  'Pendiente por materiales',
  'En revisión',
  'Mitigado / Cerrado',
]

const RESPONSABLES_SUGERIDOS = [
  'Carlos Mendoza',
  'Laura Gómez',
  'Javier Morales',
  'Sofía Ramírez',
  'Andrés Castro',
  'Valentina Herrera',
  'Diego Pardo',
  'Elena Restrepo',
  'Camila Silva',
  'Martín Rojas',
]

// Datos semilla realistas asociados a Escenarios PHA reales (1.1, 1.2, ...)
const RIESGOS_SEMILLA: RiesgoItem[] = [
  {
    id: 'RSK-001',
    escenario_id: '1.2',
    escenario_nodo: '1.2 · Horno H-101',
    titulo: 'Pérdida de flujo de crudo por serpentín radiante y sobrecalentamiento de tubos',
    origen: 'Causa',
    tag_asociado: 'FIC-H101',
    categoria: 'Incidentes y Seguridad de Procesos',
    nivel_riesgo: 'Alto',
    avance: 65,
    estado: 'En ejecución',
    fecha_creacion: '2026-10-12',
    descripcion_detalle: 'Riesgo de cokificación severa o rotura de tubo por reducción involuntaria de alimentación.',
  },
  {
    id: 'RSK-002',
    escenario_id: '1.2',
    escenario_nodo: '1.2 · Horno H-101',
    titulo: 'Degradación en lazo de control básico de flujo de carga FIC-H101',
    origen: 'Barrera',
    tag_asociado: 'FIC-H101',
    categoria: 'Pérdida de función',
    nivel_riesgo: 'Alto',
    avance: 40,
    estado: 'Pendiente por materiales',
    fecha_creacion: '2026-10-15',
    descripcion_detalle: 'Válvula de control FV-101 presenta histéresis del 14% y empaque con fuga menor reportada en CMMS.',
  },
  {
    id: 'RSK-003',
    escenario_id: '1.1',
    escenario_nodo: '1.1 · Horno H-101',
    titulo: 'Disparo no disponible de lazo SIS de muy alta temperatura en piel de tubos TSHH',
    origen: 'Barrera',
    tag_asociado: 'SIS-H101-TSHH',
    categoria: 'Incidentes y Seguridad de Procesos',
    nivel_riesgo: 'Extremo',
    avance: 80,
    estado: 'En ejecución',
    fecha_creacion: '2026-10-18',
    descripcion_detalle: 'Verificación de canal 2 de votación 2oo3 en transmisor de temperatura de piel de tubos.',
  },
  {
    id: 'RSK-004',
    escenario_id: '1.1',
    escenario_nodo: '1.1 · Horno H-101',
    titulo: 'Falla o apagado intempestivo de quemadores con acumulación de gas en caja de fuego',
    origen: 'Causa',
    tag_asociado: 'SIS-H101-BMS',
    categoria: 'Incidentes y Seguridad de Procesos',
    nivel_riesgo: 'Alto',
    avance: 50,
    estado: 'En planeación',
    fecha_creacion: '2026-10-20',
    descripcion_detalle: 'Riesgo de explosión en caja de fuego por reencendido no controlado ante pérdida de llama.',
  },
  {
    id: 'RSK-005',
    escenario_id: '1.3',
    escenario_nodo: '1.3 · Columna T-101',
    titulo: 'Sobrepresión de columna atmosférica por falla de reflujo de tope o agua de enfriamiento',
    origen: 'Causa',
    tag_asociado: 'PSV-101',
    categoria: 'Integridad mecánica',
    nivel_riesgo: 'Alto',
    avance: 90,
    estado: 'En revisión',
    fecha_creacion: '2026-10-22',
    descripcion_detalle: 'Alivio de vapores hacia cabezal de antorcha con demanda sobre la capacidad de PSV-101.',
  },
  {
    id: 'RSK-006',
    escenario_id: '1.3',
    escenario_nodo: '1.3 · Columna T-101',
    titulo: 'Inoperatividad o bloqueo de válvula de alivio PSV-101 en cabezal de domo',
    origen: 'Barrera',
    tag_asociado: 'PSV-101',
    categoria: 'Pérdida de función',
    nivel_riesgo: 'Extremo',
    avance: 75,
    estado: 'En ejecución',
    fecha_creacion: '2026-10-25',
    descripcion_detalle: 'Revisión de sello car-seal abierto y prueba de banco con certificado vencido.',
  },
  {
    id: 'RSK-007',
    escenario_id: '1.6',
    escenario_nodo: '1.6 · Desalador D-101',
    titulo: 'Arrastre masivo de agua y sales a columna T-101 por falla electrostática',
    origen: 'Causa',
    tag_asociado: 'AL-D101-PAH',
    categoria: 'Disponibilidad operacional',
    nivel_riesgo: 'Medio',
    avance: 30,
    estado: 'En planeación',
    fecha_creacion: '2026-10-28',
    descripcion_detalle: 'Trip de transformadores electrostáticos por emulsión pesada generando corrosión acelerada en tope de T-101.',
  },
  {
    id: 'RSK-008',
    escenario_id: '1.7',
    escenario_nodo: '1.7 · Reactor R-201',
    titulo: 'Exotermia descontrolada (runaway) en lecho catalítico por pérdida de gas de quench',
    origen: 'Causa',
    tag_asociado: 'ESD-100',
    categoria: 'Incidentes y Seguridad de Procesos',
    nivel_riesgo: 'Extremo',
    avance: 60,
    estado: 'En ejecución',
    fecha_creacion: '2026-10-29',
    descripcion_detalle: 'Riesgo de daño metalúrgico irreversible del reactor de Cr-Mo y sobrepresión catastrófica.',
  },
  {
    id: 'RSK-009',
    escenario_id: '1.9',
    escenario_nodo: '1.9 · Compresor K-201',
    titulo: 'Fuga de gas de reciclo con alta concentración de H2S en sellos de compresor',
    origen: 'Causa',
    tag_asociado: 'GD-H101',
    categoria: 'Cumplimiento ambiental / regulatorio',
    nivel_riesgo: 'Alto',
    avance: 85,
    estado: 'Mitigado / Cerrado',
    fecha_creacion: '2026-11-01',
    descripcion_detalle: 'Pérdida de contención en sellos secos del compresor de reciclo K-201 hacia caseta de máquinas.',
  },
  {
    id: 'RSK-010',
    escenario_id: '1.12',
    escenario_nodo: '1.12 · Separador V-202',
    titulo: 'Paso directo de gas a baja presión (gas blowby) por falla de control de nivel en V-202',
    origen: 'Causa',
    tag_asociado: 'LSHH-T101',
    categoria: 'Integridad mecánica',
    nivel_riesgo: 'Alto',
    avance: 45,
    estado: 'Pendiente por materiales',
    fecha_creacion: '2026-11-03',
    descripcion_detalle: 'Sobrepresión inmediata en el despojador de baja presión aguas abajo por apertura completa de LV-202.',
  },
]

const ACCIONES_SEMILLA: AccionMitigacion[] = [
  // RSK-001 (Pérdida de flujo crudo - Escenario 1.2)
  {
    id: 'ACT-001',
    riesgo_id: 'RSK-001',
    titulo: 'Instalar transmisor redundante de flujo FT-101B en línea de carga a serpentines',
    nivel: 'Nivel Causa',
    responsable: 'Carlos Mendoza',
    estado: 'Abierta',
    avance: 50,
    fecha_vencimiento: '2026-12-15',
    fecha_creacion: '2026-10-12',
  },
  {
    id: 'ACT-002',
    riesgo_id: 'RSK-001',
    titulo: 'Actualizar procedimiento operativo estándar POE-CDU-04 para respuesta ante corte de carga',
    nivel: 'Nivel Causa',
    responsable: 'Laura Gómez',
    estado: 'Finalizada',
    avance: 100,
    fecha_vencimiento: '2026-11-05',
    fecha_creacion: '2026-10-12',
  },
  {
    id: 'ACT-003',
    riesgo_id: 'RSK-001',
    titulo: 'Calibrar y auditar lazo de respuesta de alarma de bajo flujo FAL-101',
    nivel: 'Nivel Barrera',
    responsable: 'Javier Morales',
    estado: 'Abierta',
    avance: 45,
    fecha_vencimiento: '2026-11-28',
    fecha_creacion: '2026-10-14',
  },

  // RSK-002 (Degradación FIC-H101 - Escenario 1.2)
  {
    id: 'ACT-004',
    riesgo_id: 'RSK-002',
    titulo: 'Reemplazo del posicionador inteligente Fisher FIELDVUE DVC6200 de la válvula FV-101',
    nivel: 'Nivel Barrera',
    responsable: 'Javier Morales',
    estado: 'Abierta',
    avance: 20,
    fecha_vencimiento: '2026-11-25',
    fecha_creacion: '2026-10-15',
  },
  {
    id: 'ACT-005',
    riesgo_id: 'RSK-002',
    titulo: 'Acondicionamiento y rectificación de vástago y empaquetadura grafitada de FV-101',
    nivel: 'Nivel Barrera',
    responsable: 'Andrés Castro',
    estado: 'Abierta',
    avance: 60,
    fecha_vencimiento: '2026-12-05',
    fecha_creacion: '2026-10-16',
  },

  // RSK-003 (Disparo SIS-H101-TSHH - Escenario 1.1)
  {
    id: 'ACT-006',
    riesgo_id: 'RSK-003',
    titulo: 'Prueba de carrera completa (Full Stroke Test) de válvulas de corte rápido XV-101A/B de gas',
    nivel: 'Nivel Barrera',
    responsable: 'Javier Morales',
    estado: 'Finalizada',
    avance: 100,
    fecha_vencimiento: '2026-10-30',
    fecha_creacion: '2026-10-18',
  },
  {
    id: 'ACT-007',
    riesgo_id: 'RSK-003',
    titulo: 'Inspección termográfica infrarroja por ventanillas de observación del horno H-101',
    nivel: 'Nivel Causa',
    responsable: 'Diego Pardo',
    estado: 'Abierta',
    avance: 60,
    fecha_vencimiento: '2026-11-20',
    fecha_creacion: '2026-10-19',
  },

  // RSK-004 (BMS quemadores - Escenario 1.1)
  {
    id: 'ACT-008',
    riesgo_id: 'RSK-004',
    titulo: 'Limpieza y alineación de escáneres ópticos ultravioleta/infrarrojo de detección de llama',
    nivel: 'Nivel Barrera',
    responsable: 'Valentina Herrera',
    estado: 'Abierta',
    avance: 50,
    fecha_vencimiento: '2026-11-22',
    fecha_creacion: '2026-10-20',
  },

  // RSK-005 (Sobrepresión T-101 - Escenario 1.3)
  {
    id: 'ACT-009',
    riesgo_id: 'RSK-005',
    titulo: 'Inspección de serpentines y ventiladores de aeroenfriadores de condensación de tope E-102',
    nivel: 'Nivel Causa',
    responsable: 'Andrés Castro',
    estado: 'Finalizada',
    avance: 100,
    fecha_vencimiento: '2026-11-02',
    fecha_creacion: '2026-10-22',
  },
  {
    id: 'ACT-010',
    riesgo_id: 'RSK-005',
    titulo: 'Verificar disparo por alta presión de lazo interlock PAH-T101 en sistema DCS',
    nivel: 'Nivel Barrera',
    responsable: 'Javier Morales',
    estado: 'Abierta',
    avance: 80,
    fecha_vencimiento: '2026-11-18',
    fecha_creacion: '2026-10-23',
  },

  // RSK-006 (PSV-101 - Escenario 1.3)
  {
    id: 'ACT-011',
    riesgo_id: 'RSK-006',
    titulo: 'Recertificación y prueba de presión de disparo (Pop Test) en banco de calibración para PSV-101',
    nivel: 'Nivel Barrera',
    responsable: 'Andrés Castro',
    estado: 'Abierta',
    avance: 75,
    fecha_vencimiento: '2026-12-10',
    fecha_creacion: '2026-10-25',
  },

  // RSK-007 (Desalador D-101 - Escenario 1.6)
  {
    id: 'ACT-012',
    riesgo_id: 'RSK-007',
    titulo: 'Optimizar dosificación de agente desemulsionante y monitoreo continuo de agua libre',
    nivel: 'Nivel Causa',
    responsable: 'Sofía Ramírez',
    estado: 'Abierta',
    avance: 30,
    fecha_vencimiento: '2026-11-30',
    fecha_creacion: '2026-10-28',
  },

  // RSK-008 (Runaway R-201 - Escenario 1.7)
  {
    id: 'ACT-013',
    riesgo_id: 'RSK-008',
    titulo: 'Implementar prueba de activación de válvula de despresurización de emergencia (Depressuring Valve)',
    nivel: 'Nivel Barrera',
    responsable: 'Elena Restrepo',
    estado: 'Abierta',
    avance: 60,
    fecha_vencimiento: '2026-12-01',
    fecha_creacion: '2026-10-29',
  },

  // RSK-009 (Fuga K-201 - Escenario 1.9)
  {
    id: 'ACT-014',
    riesgo_id: 'RSK-009',
    titulo: 'Sustitución de sellos primarios de gas seco y verificación de presión de gas de barrera N2',
    nivel: 'Nivel Causa',
    responsable: 'Andrés Castro',
    estado: 'Finalizada',
    avance: 100,
    fecha_vencimiento: '2026-11-04',
    fecha_creacion: '2026-11-01',
  },
  {
    id: 'ACT-015',
    riesgo_id: 'RSK-009',
    titulo: 'Calibración de cabezales detectores electroquímicos de H2S en periferia de caseta K-201',
    nivel: 'Nivel Barrera',
    responsable: 'Valentina Herrera',
    estado: 'Finalizada',
    avance: 100,
    fecha_vencimiento: '2026-11-06',
    fecha_creacion: '2026-11-01',
  },

  // RSK-010 (Gas blowby V-202 - Escenario 1.12)
  {
    id: 'ACT-016',
    riesgo_id: 'RSK-010',
    titulo: 'Prueba funcional de lazo SIS-V202-LSLL con corte de emergencia de válvula SDV-202',
    nivel: 'Nivel Barrera',
    responsable: 'Javier Morales',
    estado: 'Abierta',
    avance: 45,
    fecha_vencimiento: '2026-12-20',
    fecha_creacion: '2026-11-03',
  },
]

const STORAGE_KEY_RIESGOS = 'gidr_gestion_riesgos_items_v4'
const STORAGE_KEY_ACCIONES = 'gidr_gestion_riesgos_acciones_v4'

export const GestionRiesgos: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams()

  const tagParam = searchParams.get('tag')
  const riesgoIdParam = searchParams.get('riesgo_id')
  const escenarioIdParam = searchParams.get('escenario_id') || null

  // Estado de Riesgos
  const [riesgos, setRiesgos] = useState<RiesgoItem[]>(() => {
    try {
      const guardado = localStorage.getItem(STORAGE_KEY_RIESGOS)
      if (guardado) return JSON.parse(guardado)
    } catch (e) {
      console.error('Error cargando riesgos desde localStorage', e)
    }
    return RIESGOS_SEMILLA
  })

  // Estado de Acciones
  const [acciones, setAcciones] = useState<AccionMitigacion[]>(() => {
    try {
      const guardado = localStorage.getItem(STORAGE_KEY_ACCIONES)
      if (guardado) return JSON.parse(guardado)
      const guardadoV2 = localStorage.getItem('gidr_gestion_riesgos_acciones_v2')
      if (guardadoV2) return JSON.parse(guardadoV2)
    } catch (e) {
      console.error('Error cargando acciones desde localStorage', e)
    }
    return ACCIONES_SEMILLA
  })

  // Persistir en localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_RIESGOS, JSON.stringify(riesgos))
    } catch (e) {
      console.error(e)
    }
  }, [riesgos])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_ACCIONES, JSON.stringify(acciones))
    } catch (e) {
      console.error(e)
    }
  }, [acciones])

  // Selección activa de Riesgo
  const [riesgoSeleccionadoId, setRiesgoSeleccionadoId] = useState<string>(() => {
    if (riesgoIdParam) return riesgoIdParam
    return RIESGOS_SEMILLA[0]?.id || ''
  })

  // Filtros
  const [filtroEscenario, setFiltroEscenario] = useState<string>(() => {
    return escenarioIdParam || 'todos'
  })
  const [filtroCategoria, setFiltroCategoria] = useState<string>('todos')
  const [filtroNivel, setFiltroNivel] = useState<string>('todos')
  const [filtroEstado, setFiltroEstado] = useState<string>('todos')
  const [filtroOrigen, setFiltroOrigen] = useState<string>('todos')
  const [busqueda, setBusqueda] = useState<string>('')

  // Modales
  const [modalNuevoRiesgo, setModalNuevoRiesgo] = useState(false)
  const [modalNuevaAccion, setModalNuevaAccion] = useState(false)
  const [notificacionFeedback, setNotificacionFeedback] = useState<string | null>(null)

  // Formulario nuevo riesgo
  const [nuevoRiesgo, setNuevoRiesgo] = useState<Partial<RiesgoItem>>({
    escenario_id: '1.1',
    escenario_nodo: '1.1 · Horno H-101',
    titulo: '',
    origen: 'Barrera',
    tag_asociado: '',
    categoria: 'Pérdida de función',
    nivel_riesgo: 'Alto',
    avance: 0,
    estado: 'En planeación',
    fecha_creacion: new Date().toISOString().split('T')[0],
  })

  // Formulario nueva acción
  const [nuevaAccion, setNuevaAccion] = useState<Partial<AccionMitigacion>>({
    titulo: '',
    nivel: 'Nivel Barrera',
    responsable: RESPONSABLES_SUGERIDOS[0],
    estado: 'Abierta',
    avance: 0,
    fecha_vencimiento: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().split('T')[0],
  })

  // Sincronizar parámetro ?escenario_id=... desde Escenarios PHA (e.g. 1.1, 1.2)
  useEffect(() => {
    if (escenarioIdParam) {
      setFiltroEscenario(escenarioIdParam)
      const coincidentes = riesgos.filter((r) => r.escenario_id === escenarioIdParam)
      if (coincidentes.length > 0) {
        setRiesgoSeleccionadoId(coincidentes[0].id)
      } else {
        // Si aún no hay un riesgo registrado para este escenario, preparar nuevoRiesgo
        const escObj = CATALOGO_ESCENARIOS.find((e) => e.id === escenarioIdParam)
        if (escObj) {
          setNuevoRiesgo((prev) => ({
            ...prev,
            escenario_id: escObj.id,
            escenario_nodo: `${escObj.id} · ${escObj.nodo}`,
            titulo: `Riesgo operacional en ${escObj.nodo}: ${escObj.desv}`,
          }))
        }
      }
    }
  }, [escenarioIdParam, riesgos])

  // Si llega el parámetro ?tag=... desde Escenarios PHA
  useEffect(() => {
    if (tagParam) {
      setBusqueda(tagParam)
      const coincidencia = riesgos.find(
        (r) => r.tag_asociado.toLowerCase() === tagParam.toLowerCase()
      )
      if (coincidencia) {
        setRiesgoSeleccionadoId(coincidencia.id)
      }
    }
  }, [tagParam, riesgos])

  // Mostrar mensaje temporal
  const mostrarMensaje = (msg: string) => {
    setNotificacionFeedback(msg)
    setTimeout(() => setNotificacionFeedback(null), 3500)
  }

  // Lista de riesgos filtrada
  const riesgosFiltrados = useMemo(() => {
    return riesgos.filter((r) => {
      if (filtroEscenario !== 'todos' && String(r.escenario_id) !== filtroEscenario) {
        return false
      }
      if (filtroCategoria !== 'todos' && r.categoria !== filtroCategoria) {
        return false
      }
      if (filtroNivel !== 'todos' && r.nivel_riesgo !== filtroNivel) {
        return false
      }
      if (filtroEstado !== 'todos' && r.estado !== filtroEstado) {
        return false
      }
      if (filtroOrigen !== 'todos' && r.origen !== filtroOrigen) {
        return false
      }
      if (busqueda.trim()) {
        const q = busqueda.toLowerCase().trim()
        const match =
          r.id.toLowerCase().includes(q) ||
          r.titulo.toLowerCase().includes(q) ||
          r.escenario_nodo.toLowerCase().includes(q) ||
          r.tag_asociado.toLowerCase().includes(q) ||
          r.categoria.toLowerCase().includes(q)
        if (!match) return false
      }
      return true
    })
  }, [riesgos, filtroEscenario, filtroCategoria, filtroNivel, filtroEstado, filtroOrigen, busqueda])

  // Riesgo activo seleccionado
  const riesgoActivo = useMemo(() => {
    return (
      riesgos.find((r) => r.id === riesgoSeleccionadoId) ??
      riesgosFiltrados[0] ??
      riesgos[0] ??
      null
    )
  }, [riesgos, riesgoSeleccionadoId, riesgosFiltrados])

  // Acciones pertenecientes al riesgo activo
  const accionesDelRiesgo = useMemo(() => {
    if (!riesgoActivo) return []
    return acciones.filter((a) => a.riesgo_id === riesgoActivo.id)
  }, [acciones, riesgoActivo])

  // Mapa de avances calculados automáticamente a partir de las acciones
  const avancePorRiesgo = useMemo(() => {
    const map = new Map<string, number>()
    for (const r of riesgos) {
      const hijas = acciones.filter((a) => a.riesgo_id === r.id)
      if (hijas.length === 0) {
        map.set(r.id, 0)
      } else {
        const promedio = Math.round(
          hijas.reduce((sum, a) => sum + (a.avance || 0), 0) / hijas.length
        )
        map.set(r.id, promedio)
      }
    }
    return map
  }, [riesgos, acciones])

  // Sincronizar automáticamente el avance y estado de los riesgos según el avance de sus acciones
  useEffect(() => {
    setRiesgos((prev) => {
      let modificado = false
      const actualizados = prev.map((r) => {
        const hijas = acciones.filter((a) => a.riesgo_id === r.id)
        const calc =
          hijas.length > 0
            ? Math.round(hijas.reduce((sum, a) => sum + (a.avance || 0), 0) / hijas.length)
            : 0
        const nuevoEstado: EstadoRiesgo =
          calc === 100 && r.estado !== 'Mitigado / Cerrado' ? 'Mitigado / Cerrado' : r.estado
        if (r.avance !== calc || (calc === 100 && r.estado !== 'Mitigado / Cerrado')) {
          modificado = true
          return { ...r, avance: calc, estado: nuevoEstado }
        }
        return r
      })
      return modificado ? actualizados : prev
    })
  }, [acciones])

  // Actualizar un campo de un riesgo inline
  const actualizarRiesgo = (id: string, campo: keyof RiesgoItem, valor: any) => {
    setRiesgos((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [campo]: valor } : r))
    )
  }

  // Actualizar un campo de una acción inline
  const actualizarAccion = (id: string, campo: keyof AccionMitigacion, valor: any) => {
    setAcciones((prev) =>
      prev.map((a) => {
        if (a.id === id) {
          const mod = { ...a, [campo]: valor }
          if (campo === 'estado' && valor === 'Finalizada') {
            mod.avance = 100
          }
          return mod
        }
        return a
      })
    )
  }

  // Crear nuevo riesgo
  const handleCrearRiesgo = (e: React.FormEvent) => {
    e.preventDefault()
    if (!nuevoRiesgo.titulo?.trim()) {
      alert('Por favor ingrese un título para el riesgo.')
      return
    }

    const maxNum = riesgos.reduce((max, r) => {
      const match = r.id.match(/RSK-(\d+)/)
      return match ? Math.max(max, parseInt(match[1], 10)) : max
    }, 0)
    const nuevoId = `RSK-${String(maxNum + 1).padStart(3, '0')}`

    const escObj = CATALOGO_ESCENARIOS.find((c) => c.id === nuevoRiesgo.escenario_id)
    const escNodo = escObj ? `${escObj.id} · ${escObj.nodo}` : (nuevoRiesgo.escenario_nodo || '1.1 · Horno H-101')

    const item: RiesgoItem = {
      id: nuevoId,
      escenario_id: nuevoRiesgo.escenario_id || '1.1',
      escenario_nodo: escNodo,
      titulo: nuevoRiesgo.titulo.trim(),
      origen: nuevoRiesgo.origen || 'Barrera',
      tag_asociado: nuevoRiesgo.tag_asociado?.trim().toUpperCase() || 'N/A',
      categoria: nuevoRiesgo.categoria || 'Disponibilidad operacional',
      nivel_riesgo: nuevoRiesgo.nivel_riesgo || 'Medio',
      avance: Number(nuevoRiesgo.avance) || 0,
      estado: nuevoRiesgo.estado || 'En planeación',
      fecha_creacion: nuevoRiesgo.fecha_creacion || new Date().toISOString().split('T')[0],
      descripcion_detalle: nuevoRiesgo.descripcion_detalle || '',
    }

    setRiesgos([item, ...riesgos])
    setRiesgoSeleccionadoId(nuevoId)
    setModalNuevoRiesgo(false)
    setNuevoRiesgo({
      escenario_id: '1.1',
      escenario_nodo: '1.1 · Horno H-101',
      titulo: '',
      origen: 'Barrera',
      tag_asociado: '',
      categoria: 'Pérdida de función',
      nivel_riesgo: 'Alto',
      avance: 0,
      estado: 'En planeación',
      fecha_creacion: new Date().toISOString().split('T')[0],
    })
    mostrarMensaje(`Riesgo ${nuevoId} asociado a ${escNodo} creado exitosamente.`)
  }

  // Crear nueva acción para el riesgo seleccionado
  const handleCrearAccion = (e: React.FormEvent) => {
    e.preventDefault()
    if (!riesgoActivo) {
      alert('Debe haber un riesgo seleccionado.')
      return
    }
    if (!nuevaAccion.titulo?.trim()) {
      alert('Por favor ingrese un título para la acción.')
      return
    }

    const maxNum = acciones.reduce((max, a) => {
      const match = a.id.match(/ACT-(\d+)/)
      return match ? Math.max(max, parseInt(match[1], 10)) : max
    }, 0)
    const nuevoId = `ACT-${String(maxNum + 1).padStart(3, '0')}`

    const item: AccionMitigacion = {
      id: nuevoId,
      riesgo_id: riesgoActivo.id,
      titulo: nuevaAccion.titulo.trim(),
      nivel: nuevaAccion.nivel || 'Nivel Barrera',
      responsable: nuevaAccion.responsable || RESPONSABLES_SUGERIDOS[0],
      estado: nuevaAccion.estado || 'Abierta',
      avance: nuevaAccion.estado === 'Finalizada' ? 100 : Number(nuevaAccion.avance) || 0,
      fecha_vencimiento:
        nuevaAccion.fecha_vencimiento ||
        new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().split('T')[0],
      fecha_creacion: new Date().toISOString().split('T')[0],
    }

    const nextAcciones = [item, ...acciones]
    setAcciones(nextAcciones)
    setModalNuevaAccion(false)
    setNuevaAccion({
      titulo: '',
      nivel: 'Nivel Barrera',
      responsable: RESPONSABLES_SUGERIDOS[0],
      estado: 'Abierta',
      avance: 0,
      fecha_vencimiento: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().split('T')[0],
    })

    mostrarMensaje(`Acción ${nuevoId} agregada a ${riesgoActivo.id}.`)
  }

  // Eliminar riesgo
  const handleEliminarRiesgo = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    if (!window.confirm(`¿Está seguro de eliminar el riesgo ${id} y todas sus acciones asociadas?`)) {
      return
    }
    setRiesgos((prev) => prev.filter((r) => r.id !== id))
    setAcciones((prev) => prev.filter((a) => a.riesgo_id !== id))
    mostrarMensaje(`Riesgo ${id} eliminado.`)
  }

  // Eliminar acción
  const handleEliminarAccion = (id: string) => {
    if (!window.confirm(`¿Eliminar la acción ${id}?`)) return
    setAcciones((prev) => prev.filter((a) => a.id !== id))
    mostrarMensaje(`Acción ${id} eliminada.`)
  }

  // Restablecer datos semilla
  const handleRestablecerSemilla = () => {
    if (
      !window.confirm(
        '¿Desea restablecer todos los riesgos y acciones a los datos originales asociados a escenarios?'
      )
    ) {
      return
    }
    setRiesgos(RIESGOS_SEMILLA)
    setAcciones(ACCIONES_SEMILLA)
    localStorage.removeItem(STORAGE_KEY_RIESGOS)
    localStorage.removeItem(STORAGE_KEY_ACCIONES)
    mostrarMensaje('Datos de Gestión de Riesgos restablecidos con éxito.')
  }

  // Exportar a CSV
  const exportarCSV = () => {
    const encabezados = [
      'Escenario_Nodo',
      'ID_Riesgo',
      'Titulo_Riesgo',
      'Origen',
      'Tag_Asociado',
      'Categoria',
      'Nivel_Riesgo',
      'Avance_Pct',
      'Estado',
      'Fecha_Creacion',
      'Total_Acciones',
    ]

    const filas = riesgosFiltrados.map((r) => {
      const nAcciones = acciones.filter((a) => a.riesgo_id === r.id).length
      return [
        `"${r.escenario_nodo.replace(/"/g, '""')}"`,
        r.id,
        `"${r.titulo.replace(/"/g, '""')}"`,
        r.origen,
        r.tag_asociado,
        `"${r.categoria}"`,
        r.nivel_riesgo,
        r.avance,
        `"${r.estado}"`,
        r.fecha_creacion,
        nAcciones,
      ].join(',')
    })

    const csvContent = '\uFEFF' + [encabezados.join(','), ...filas].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `Gestion_Riesgos_GIDR_${new Date().toISOString().split('T')[0]}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  // Estilos visuales de nivel de riesgo
  const badgeNivel = (nivel: NivelRiesgo) => {
    switch (nivel) {
      case 'Extremo':
        return 'bg-purple-100 text-purple-900 border-purple-300 dark:bg-purple-950/70 dark:text-purple-300 dark:border-purple-800'
      case 'Alto':
        return 'bg-rose-100 text-rose-900 border-rose-300 dark:bg-rose-950/70 dark:text-rose-300 dark:border-rose-800'
      case 'Medio':
        return 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/70 dark:text-amber-300 dark:border-amber-800'
      case 'Bajo':
      default:
        return 'bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950/70 dark:text-emerald-300 dark:border-emerald-800'
    }
  }

  const badgeEstadoRiesgo = (estado: EstadoRiesgo) => {
    switch (estado) {
      case 'En ejecución':
        return 'bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800'
      case 'En planeación':
        return 'bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
      case 'Pendiente por materiales':
        return 'bg-amber-50 text-amber-900 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800'
      case 'En revisión':
        return 'bg-purple-50 text-purple-800 border-purple-200 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800'
      case 'Mitigado / Cerrado':
        return 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
    }
  }

  // Métricas rápidas
  const totalRiesgos = riesgos.length
  const riesgosAltosExtremos = riesgos.filter(
    (r) => r.nivel_riesgo === 'Alto' || r.nivel_riesgo === 'Extremo'
  ).length
  const riesgosEnEjecucion = riesgos.filter((r) => r.estado === 'En ejecución').length
  const promedioAvance = Math.round(
    riesgos.reduce((acc, r) => acc + (r.avance || 0), 0) / (totalRiesgos || 1)
  )

  return (
    <div className="space-y-4 pb-12">
      {/* Toast de notificación */}
      {notificacionFeedback && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white shadow-xl dark:bg-slate-100 dark:text-slate-900 animate-bounce">
          <span>✓</span>
          <span>{notificacionFeedback}</span>
        </div>
      )}

      {/* Cabecera Principal */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-2.5">
        <div>
          <div className="flex items-center gap-2">
            <svg
              className="w-5 h-5 text-[#1e4e79] dark:text-sky-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            <h1 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
              Gestión de Riesgos
            </h1>
            <span className="px-2 py-0.5 text-[11px] font-semibold rounded bg-sky-100 text-sky-800 dark:bg-sky-950/80 dark:text-sky-300 border border-sky-200 dark:border-sky-800">
              Escenarios PHA
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Matriz de riesgos operacionales y mitigaciones asociadas a escenarios y barreras.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Link
            to="/escenarios"
            className="px-2.5 py-1 text-xs font-semibold rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-2xs inline-flex items-center gap-1.5"
            title="Regresar a la matriz PHA de Escenarios"
          >
            <span>←</span>
            <span>Ver Escenarios PHA</span>
          </Link>
        </div>
      </div>

      {/* KPI Cards / Indicadores Rápidos */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Total Riesgos Registrados
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-2xl font-black text-slate-900 dark:text-slate-100">
              {totalRiesgos}
            </span>
            <span className="text-xs font-mono text-slate-500">
              {riesgos.filter((r) => r.origen === 'Barrera').length} barreras /{' '}
              {riesgos.filter((r) => r.origen === 'Causa').length} causas
            </span>
          </div>
        </div>

        <div className="p-3 rounded-lg border border-rose-200 dark:border-rose-950/60 bg-rose-50/40 dark:bg-rose-950/20 shadow-2xs">
          <div className="text-[11px] font-bold uppercase tracking-wider text-rose-800 dark:text-rose-400">
            Riesgos Altos / Extremos
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-2xl font-black text-rose-700 dark:text-rose-300">
              {riesgosAltosExtremos}
            </span>
            <span className="text-xs font-bold text-rose-600 dark:text-rose-400">
              {Math.round((riesgosAltosExtremos / (totalRiesgos || 1)) * 100)}% del total
            </span>
          </div>
        </div>

        <div className="p-3 rounded-lg border border-blue-200 dark:border-blue-950/60 bg-blue-50/40 dark:bg-blue-950/20 shadow-2xs">
          <div className="text-[11px] font-bold uppercase tracking-wider text-blue-800 dark:text-blue-400">
            En Ejecución Activa
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-2xl font-black text-blue-700 dark:text-blue-300">
              {riesgosEnEjecucion}
            </span>
            <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
              {acciones.filter((a) => a.estado === 'Abierta').length} acciones abiertas
            </span>
          </div>
        </div>

        <div className="p-3 rounded-lg border border-emerald-200 dark:border-emerald-950/60 bg-emerald-50/40 dark:bg-emerald-950/20 shadow-2xs">
          <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-400">
            Avance Global de Mitigación
          </div>
          <div className="mt-1 flex items-center justify-between gap-2">
            <span className="text-2xl font-black text-emerald-700 dark:text-emerald-300">
              {promedioAvance}%
            </span>
            <div className="flex-1 max-w-[100px] h-2.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                style={{ width: `${promedioAvance}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ============================================================== */}
      {/* PRIMERA DIVISIÓN VERTICAL: TABLA DE RIESGOS                   */}
      {/* ============================================================== */}
      <div className="border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm rounded-sm overflow-hidden flex flex-col">
        {/* Cinta de opciones estilo Nodos / Escenarios */}
        <div className="bg-white dark:bg-slate-900 border-b border-slate-300 dark:border-slate-700 px-2.5 py-1.5 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-1">
            <IconBtn
              titulo="Nuevo riesgo"
              onClick={() => setModalNuevoRiesgo(true)}
              path="M12 5v14M5 12h14"
              cuadro
            />
            <IconBtn
              titulo={riesgoActivo ? `Eliminar riesgo seleccionado (${riesgoActivo.id})` : 'Eliminar riesgo seleccionado'}
              onClick={() => riesgoActivo && handleEliminarRiesgo(riesgoActivo.id)}
              disabled={!riesgoActivo}
              path="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"
            />
            <span className="mx-1 h-4 w-px bg-slate-300 dark:bg-slate-700" />
            <IconBtn
              titulo="Exportar a CSV"
              onClick={exportarCSV}
              path="M12 4v11M7 11l5 5 5-5M5 20h14"
            />
            <IconBtn
              titulo="Imprimir"
              onClick={() => window.print()}
              path="M7 9V4h10v5M7 17H5v-6h14v6h-2M7 14h10v6H7z"
            />
            <IconBtn
              titulo="Restablecer datos originales"
              onClick={handleRestablecerSemilla}
              path="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
            <span className="mx-1 h-4 w-px bg-slate-300 dark:bg-slate-700" />
            <span className="font-bold text-slate-800 dark:text-slate-100 mr-1">
              Riesgos
            </span>
            <span className="px-1.5 py-0.2 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono text-[11px] font-bold">
              {riesgosFiltrados.length}
            </span>

            {/* Badge de filtro activo por Escenario */}
            {escenarioIdParam && (
              <span className="ml-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#1e4e79] text-white dark:bg-sky-600 text-[11px] font-semibold">
                <span>Escenario: {escenarioIdParam}</span>
                <button
                  type="button"
                  onClick={() => {
                    setSearchParams({})
                    setFiltroEscenario('todos')
                  }}
                  className="hover:text-red-300 font-bold ml-0.5"
                  title="Quitar filtro de escenario"
                >
                  ✕
                </button>
              </span>
            )}

            {/* Badge de filtro activo por Tag */}
            {tagParam && (
              <span className="ml-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-100 text-sky-900 dark:bg-sky-900/70 dark:text-sky-200 text-[11px] font-semibold">
                <span>Tag: {tagParam}</span>
                <button
                  type="button"
                  onClick={() => {
                    setSearchParams({})
                    setBusqueda('')
                  }}
                  className="hover:text-red-600 font-bold ml-0.5"
                  title="Quitar filtro de tag"
                >
                  ✕
                </button>
              </span>
            )}
          </div>

          {/* Búsqueda y Filtros en la cinta de opciones */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <div className="relative">
              <input
                type="text"
                placeholder="Buscar..."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                className="w-36 sm:w-48 pl-7 pr-5 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500 text-xs"
              />
              <svg
                className="absolute left-2 top-2 w-3.5 h-3.5 text-slate-400 pointer-events-none"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              {busqueda && (
                <button
                  type="button"
                  onClick={() => setBusqueda('')}
                  className="absolute right-1.5 top-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Filtro Escenario */}
            <select
              value={filtroEscenario}
              onChange={(e) => setFiltroEscenario(e.target.value)}
              className="py-1 px-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none text-xs max-w-[150px] truncate"
            >
              <option value="todos">Escenario: Todos</option>
              {CATALOGO_ESCENARIOS.map((esc) => (
                <option key={esc.id} value={esc.id}>
                  {esc.id} · {esc.nodo} ({esc.desv})
                </option>
              ))}
            </select>

            {/* Filtro Origen */}
            <select
              value={filtroOrigen}
              onChange={(e) => setFiltroOrigen(e.target.value)}
              className="py-1 px-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none text-xs"
            >
              <option value="todos">Origen: Todos</option>
              <option value="Barrera">Barreras</option>
              <option value="Causa">Causas</option>
            </select>

            {/* Filtro Nivel */}
            <select
              value={filtroNivel}
              onChange={(e) => setFiltroNivel(e.target.value)}
              className="py-1 px-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none text-xs"
            >
              <option value="todos">Nivel: Todos</option>
              <option value="Extremo">Extremo</option>
              <option value="Alto">Alto</option>
              <option value="Medio">Medio</option>
              <option value="Bajo">Bajo</option>
            </select>

            {/* Filtro Estado */}
            <select
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value)}
              className="py-1 px-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none text-xs"
            >
              <option value="todos">Estado: Todos</option>
              {ESTADOS_RIESGO.map((est) => (
                <option key={est} value={est}>
                  {est}
                </option>
              ))}
            </select>

            {/* Filtro Categoría */}
            <select
              value={filtroCategoria}
              onChange={(e) => setFiltroCategoria(e.target.value)}
              className="py-1 px-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none text-xs max-w-[130px] truncate"
            >
              <option value="todos">Categoría: Todas</option>
              {CATEGORIAS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Contenedor con scroll para la Tabla 1 */}
        <div className="overflow-x-auto max-h-[380px] overflow-y-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-[#f0f4f8] dark:bg-slate-800/90 text-slate-700 dark:text-slate-200 sticky top-0 z-10 font-bold border-b border-slate-300 dark:border-slate-700">
              <tr>
                <th className="p-2 w-[160px] min-w-[150px] border-r border-slate-300 dark:border-slate-700">
                  Escenario / Nodo
                </th>
                <th className="p-2 w-[75px] min-w-[70px] border-r border-slate-300 dark:border-slate-700">
                  ID
                </th>
                <th className="p-2 min-w-[280px] border-r border-slate-300 dark:border-slate-700">
                  Título de riesgo
                </th>
                <th className="p-2 w-[115px] min-w-[105px] border-r border-slate-300 dark:border-slate-700">
                  Origen / Tag
                </th>
                <th className="p-2 w-[170px] min-w-[150px] border-r border-slate-300 dark:border-slate-700">
                  Categoría
                </th>
                <th className="p-2 w-[90px] min-w-[85px] text-center border-r border-slate-300 dark:border-slate-700">
                  Nivel
                </th>
                <th className="p-2 w-[110px] min-w-[100px] text-center border-r border-slate-300 dark:border-slate-700">
                  Avance
                </th>
                <th className="p-2 w-[140px] min-w-[130px] border-r border-slate-300 dark:border-slate-700">
                  Estado
                </th>
                <th className="p-2 w-[95px] min-w-[90px] text-center border-r border-slate-300 dark:border-slate-700">
                  Creado
                </th>
                <th className="p-2 w-[75px] min-w-[70px] text-center border-r border-slate-300 dark:border-slate-700">
                  Acciones
                </th>
                <th className="p-2 w-[45px] text-center"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {riesgosFiltrados.map((riesgo) => {
                const esSeleccionado = riesgo.id === riesgoActivo?.id
                const nAcciones = acciones.filter((a) => a.riesgo_id === riesgo.id).length
                const nFinalizadas = acciones.filter(
                  (a) => a.riesgo_id === riesgo.id && a.estado === 'Finalizada'
                ).length

                return (
                  <tr
                    key={riesgo.id}
                    onClick={() => setRiesgoSeleccionadoId(riesgo.id)}
                    className={`cursor-pointer transition-colors ${
                      esSeleccionado
                        ? 'bg-sky-50/80 dark:bg-sky-950/40 border-l-4 border-l-[#1e4e79] dark:border-l-sky-500 shadow-2xs'
                        : 'hover:bg-slate-50/90 dark:hover:bg-slate-800/40 bg-white dark:bg-slate-900'
                    }`}
                  >
                    {/* 1. ESCENARIO / NODO (Reemplaza a unidad/nodo como columna 1) */}
                    <td className="p-2 border-r border-slate-200 dark:border-slate-800">
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1.5">
                          <Link
                            to="/escenarios"
                            title={`Ir a la matriz PHA para el escenario ${riesgo.escenario_id}`}
                            className="font-mono text-xs font-bold text-sky-700 dark:text-sky-400 hover:text-sky-900 dark:hover:text-sky-300 hover:underline flex items-center gap-1"
                          >
                            <span className="bg-sky-100 dark:bg-sky-950/80 px-1.5 py-0.5 rounded text-[11px] font-bold">
                              {riesgo.escenario_id}
                            </span>
                            <span className="text-[10px] opacity-65">↗</span>
                          </Link>
                        </div>
                        <span className="text-[11px] font-medium text-slate-700 dark:text-slate-300 truncate">
                          {riesgo.escenario_nodo.includes('·')
                            ? riesgo.escenario_nodo.split('·').slice(1).join('·').trim()
                            : riesgo.escenario_nodo}
                        </span>
                      </div>
                    </td>

                    {/* 2. ID Riesgo */}
                    <td className="p-2 font-mono font-bold text-sky-700 dark:text-sky-400 border-r border-slate-200 dark:border-slate-800">
                      <div className="flex items-center gap-1">
                        {esSeleccionado && <span className="text-blue-600 dark:text-sky-400">▶</span>}
                        <span>{riesgo.id}</span>
                      </div>
                    </td>

                    {/* 3. Título de Riesgo (Editable) */}
                    <td className="p-2 border-r border-slate-200 dark:border-slate-800">
                      <textarea
                        rows={2}
                        value={riesgo.titulo}
                        onChange={(e) => actualizarRiesgo(riesgo.id, 'titulo', e.target.value)}
                        className="w-full bg-transparent text-xs font-semibold text-slate-900 dark:text-slate-100 resize-none focus:outline-none focus:bg-white dark:focus:bg-slate-800 px-1 py-0.5 rounded leading-snug"
                      />
                    </td>

                    {/* 4. Origen & Tag */}
                    <td className="p-2 border-r border-slate-200 dark:border-slate-800 text-xs">
                      <div className="flex flex-col gap-0.5">
                        <span
                          className={`text-[10px] font-bold uppercase tracking-wider w-max px-1 rounded ${
                            riesgo.origen === 'Barrera'
                              ? 'bg-amber-100 text-amber-900 dark:bg-amber-950/70 dark:text-amber-300'
                              : 'bg-indigo-100 text-indigo-900 dark:bg-indigo-950/70 dark:text-indigo-300'
                          }`}
                        >
                          {riesgo.origen}
                        </span>
                        <input
                          value={riesgo.tag_asociado}
                          onChange={(e) =>
                            actualizarRiesgo(riesgo.id, 'tag_asociado', e.target.value)
                          }
                          className="font-mono text-[11px] font-bold text-slate-700 dark:text-slate-300 bg-transparent focus:bg-white dark:focus:bg-slate-800 px-1 py-0.5 rounded focus:outline-none w-full"
                        />
                      </div>
                    </td>

                    {/* 5. Categoría */}
                    <td className="p-2 border-r border-slate-200 dark:border-slate-800">
                      <select
                        value={riesgo.categoria}
                        onChange={(e) =>
                          actualizarRiesgo(riesgo.id, 'categoria', e.target.value as CategoriaRiesgo)
                        }
                        className="w-full bg-transparent text-[11.5px] text-slate-700 dark:text-slate-300 focus:outline-none cursor-pointer focus:bg-white dark:focus:bg-slate-800 rounded p-1"
                      >
                        {CATEGORIAS.map((cat) => (
                          <option
                            key={cat}
                            value={cat}
                            className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                          >
                            {cat}
                          </option>
                        ))}
                      </select>
                    </td>

                    {/* 6. Nivel de Riesgo Actual */}
                    <td className="p-2 text-center border-r border-slate-200 dark:border-slate-800">
                      <select
                        value={riesgo.nivel_riesgo}
                        onChange={(e) =>
                          actualizarRiesgo(riesgo.id, 'nivel_riesgo', e.target.value as NivelRiesgo)
                        }
                        className={`text-[11px] font-bold px-2 py-1 rounded border cursor-pointer focus:outline-none ${badgeNivel(
                          riesgo.nivel_riesgo
                        )}`}
                      >
                        <option
                          value="Extremo"
                          className="bg-white dark:bg-slate-900 text-purple-900 dark:text-purple-300 font-bold"
                        >
                          Extremo
                        </option>
                        <option
                          value="Alto"
                          className="bg-white dark:bg-slate-900 text-rose-900 dark:text-rose-300 font-bold"
                        >
                          Alto
                        </option>
                        <option
                          value="Medio"
                          className="bg-white dark:bg-slate-900 text-amber-900 dark:text-amber-300 font-bold"
                        >
                          Medio
                        </option>
                        <option
                          value="Bajo"
                          className="bg-white dark:bg-slate-900 text-emerald-900 dark:text-emerald-300 font-bold"
                        >
                          Bajo
                        </option>
                      </select>
                    </td>

                    {/* 7. % Avance (Calculado automáticamente del avance de las acciones, no editable) */}
                    <td
                      className="p-2 text-center border-r border-slate-200 dark:border-slate-800"
                      title="Calculado automáticamente del avance de las acciones asociadas"
                    >
                      {(() => {
                        const avanceRiesgo = avancePorRiesgo.get(riesgo.id) ?? riesgo.avance ?? 0
                        return (
                          <div className="flex flex-col items-center justify-center">
                            <span className="font-mono font-bold text-xs text-slate-800 dark:text-slate-100">
                              {avanceRiesgo}%
                            </span>
                            <div className="w-full max-w-[85px] h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden mt-1">
                              <div
                                className={`h-full rounded-full transition-all duration-300 ${
                                  avanceRiesgo >= 100
                                    ? 'bg-emerald-500'
                                    : avanceRiesgo >= 50
                                    ? 'bg-blue-500'
                                    : 'bg-amber-500'
                                }`}
                                style={{ width: `${avanceRiesgo}%` }}
                              />
                            </div>
                          </div>
                        )
                      })()}
                    </td>

                    {/* 8. Estado */}
                    <td className="p-2 border-r border-slate-200 dark:border-slate-800">
                      <select
                        value={riesgo.estado}
                        onChange={(e) =>
                          actualizarRiesgo(riesgo.id, 'estado', e.target.value as EstadoRiesgo)
                        }
                        className={`text-[11px] font-semibold px-2 py-1 rounded border cursor-pointer focus:outline-none w-full ${badgeEstadoRiesgo(
                          riesgo.estado
                        )}`}
                      >
                        {ESTADOS_RIESGO.map((est) => (
                          <option
                            key={est}
                            value={est}
                            className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200"
                          >
                            {est}
                          </option>
                        ))}
                      </select>
                    </td>

                    {/* 9. Fecha de Creación */}
                    <td className="p-2 text-center text-[11px] font-mono text-slate-500 dark:text-slate-400 border-r border-slate-200 dark:border-slate-800">
                      <input
                        type="date"
                        value={riesgo.fecha_creacion}
                        onChange={(e) =>
                          actualizarRiesgo(riesgo.id, 'fecha_creacion', e.target.value)
                        }
                        className="bg-transparent text-[11px] font-mono text-slate-600 dark:text-slate-400 focus:outline-none"
                      />
                    </td>

                    {/* 10. Acciones badge */}
                    <td className="p-2 text-center border-r border-slate-200 dark:border-slate-800">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[11px] font-bold font-mono ${
                          nAcciones > 0
                            ? 'bg-sky-100 text-sky-800 dark:bg-sky-950/80 dark:text-sky-300'
                            : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'
                        }`}
                        title={`${nFinalizadas} de ${nAcciones} finalizadas`}
                      >
                        {nFinalizadas}/{nAcciones}
                      </span>
                    </td>

                    {/* 11. Opciones */}
                    <td className="p-2 text-center">
                      <button
                        type="button"
                        onClick={(e) => handleEliminarRiesgo(riesgo.id, e)}
                        className="text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 p-1 rounded transition-colors inline-flex items-center justify-center"
                        title="Eliminar este riesgo"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                )
              })}

              {riesgosFiltrados.length === 0 && (
                <tr>
                  <td colSpan={11} className="p-8 text-center text-slate-400 text-xs">
                    No se encontraron riesgos que coincidan con los filtros seleccionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ============================================================== */}
      {/* SEGUNDA DIVISIÓN VERTICAL: TABLA DE ACCIONES                   */}
      {/* ============================================================== */}
      <div className="border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm rounded-sm overflow-hidden flex flex-col">
        {/* Cinta de opciones de Acciones */}
        <div className="bg-white dark:bg-slate-900 border-b border-slate-300 dark:border-slate-700 px-2.5 py-1.5 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-1">
            <IconBtn
              titulo="Nueva acción"
              onClick={() => setModalNuevaAccion(true)}
              disabled={!riesgoActivo}
              path="M12 5v14M5 12h14"
              cuadro
            />
            <span className="mx-1 h-4 w-px bg-slate-300 dark:bg-slate-700" />
            <span className="font-bold text-slate-800 dark:text-slate-100 mr-1">
              Acciones
            </span>
            {riesgoActivo ? (
              <>
                <span className="px-1.5 py-0.5 rounded text-[11px] font-mono font-bold bg-[#1e4e79] text-white dark:bg-sky-600">
                  {riesgoActivo.id}
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[400px]">
                  · {riesgoActivo.titulo}
                </span>
              </>
            ) : (
              <span className="text-[11px] text-slate-400 italic">
                (Selecciona un riesgo en la tabla superior)
              </span>
            )}
          </div>

          {/* Estadísticas de acciones */}
          {riesgoActivo && (
            <div className="flex items-center gap-2 text-[11px] font-medium text-slate-600 dark:text-slate-400">
              <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                Total: <strong className="text-slate-900 dark:text-slate-100">{accionesDelRiesgo.length}</strong>
              </span>
              <span className="px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-900">
                Abiertas: <strong>{accionesDelRiesgo.filter((a) => a.estado === 'Abierta').length}</strong>
              </span>
              <span className="px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900">
                Finalizadas: <strong>{accionesDelRiesgo.filter((a) => a.estado === 'Finalizada').length}</strong>
              </span>
            </div>
          )}
        </div>

        {/* Lista de sugerencias para autocompletar nombres de responsables */}
        <datalist id="lista-responsables">
          {RESPONSABLES_SUGERIDOS.map((resp) => (
            <option key={resp} value={resp} />
          ))}
        </datalist>

        {/* Contenedor con scroll para la Tabla 2 */}
        <div className="overflow-x-auto max-h-[350px] overflow-y-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-[#f0f4f8] dark:bg-slate-800/90 text-slate-700 dark:text-slate-200 sticky top-0 z-10 font-bold border-b border-slate-300 dark:border-slate-700">
              <tr>
                <th className="p-2 w-[80px] min-w-[75px] border-r border-slate-300 dark:border-slate-700">
                  Riesgo
                </th>
                <th className="p-2 w-[80px] min-w-[75px] border-r border-slate-300 dark:border-slate-700">
                  ID
                </th>
                <th className="p-2 min-w-[320px] border-r border-slate-300 dark:border-slate-700">
                  Título de acción
                </th>
                <th className="p-2 w-[220px] min-w-[190px] border-r border-slate-300 dark:border-slate-700">
                  Responsable
                </th>
                <th className="p-2 w-[105px] min-w-[95px] text-center border-r border-slate-300 dark:border-slate-700">
                  Estado
                </th>
                <th className="p-2 w-[110px] min-w-[100px] text-center border-r border-slate-300 dark:border-slate-700">
                  Avance
                </th>
                <th className="p-2 w-[115px] min-w-[105px] text-center border-r border-slate-300 dark:border-slate-700">
                  Vence
                </th>
                <th className="p-2 w-[45px] text-center"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {accionesDelRiesgo.map((accion) => {
                const esFinalizada = accion.estado === 'Finalizada'

                return (
                  <tr
                    key={accion.id}
                    className={`transition-colors ${
                      esFinalizada
                        ? 'bg-emerald-50/20 dark:bg-emerald-950/10'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/40 bg-white dark:bg-slate-900'
                    }`}
                  >
                    {/* 1. ID Riesgo */}
                    <td className="p-2 font-mono text-slate-500 dark:text-slate-400 border-r border-slate-200 dark:border-slate-800">
                      {accion.riesgo_id}
                    </td>

                    {/* 2. ID Acción */}
                    <td className="p-2 font-mono font-bold text-[#1e4e79] dark:text-sky-400 border-r border-slate-200 dark:border-slate-800">
                      {accion.id}
                    </td>

                    {/* 3. Título de Acción (Editable) */}
                    <td className="p-2 border-r border-slate-200 dark:border-slate-800">
                      <textarea
                        rows={2}
                        value={accion.titulo}
                        onChange={(e) => actualizarAccion(accion.id, 'titulo', e.target.value)}
                        className="w-full bg-transparent text-xs text-slate-800 dark:text-slate-200 font-medium resize-none focus:outline-none focus:bg-white dark:focus:bg-slate-800 px-1 py-0.5 rounded leading-snug"
                      />
                    </td>

                    {/* 4. Responsable (Persona asignada - Editable) */}
                    <td className="p-2 border-r border-slate-200 dark:border-slate-800">
                      <input
                        type="text"
                        list="lista-responsables"
                        value={accion.responsable}
                        onChange={(e) => actualizarAccion(accion.id, 'responsable', e.target.value)}
                        placeholder="Nombre de la persona..."
                        className="w-full bg-transparent text-xs text-slate-800 dark:text-slate-200 font-medium focus:outline-none focus:bg-white dark:focus:bg-slate-800 rounded px-1.5 py-1 border border-transparent hover:border-slate-300 dark:hover:border-slate-700 focus:border-sky-500 transition-colors"
                      />
                    </td>

                    {/* 6. Estado (Abierta / Finalizada) */}
                    <td className="p-2 text-center border-r border-slate-200 dark:border-slate-800">
                      <select
                        value={accion.estado}
                        onChange={(e) =>
                          actualizarAccion(accion.id, 'estado', e.target.value as EstadoAccion)
                        }
                        className={`text-[11px] font-bold px-2.5 py-1 rounded border cursor-pointer focus:outline-none ${
                          accion.estado === 'Finalizada'
                            ? 'bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950/80 dark:text-emerald-300 dark:border-emerald-800'
                            : 'bg-blue-100 text-blue-900 border-blue-300 dark:bg-blue-950/80 dark:text-blue-300 dark:border-blue-800'
                        }`}
                      >
                        <option value="Abierta" className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200">
                          Abierta
                        </option>
                        <option value="Finalizada" className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200">
                          Finalizada
                        </option>
                      </select>
                    </td>

                    {/* 7. % Avance */}
                    <td className="p-2 text-center border-r border-slate-200 dark:border-slate-800">
                      <div className="flex items-center gap-1.5 justify-center">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={accion.avance}
                          onChange={(e) =>
                            actualizarAccion(
                              accion.id,
                              'avance',
                              Math.max(0, Math.min(100, Number(e.target.value) || 0))
                            )
                          }
                          className="w-12 text-center font-bold text-xs bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded py-0.5 px-1 focus:outline-none"
                        />
                        <span className="text-[11px] font-bold text-slate-500">%</span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden mt-1">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            accion.avance >= 100
                              ? 'bg-emerald-500'
                              : accion.avance >= 50
                              ? 'bg-blue-500'
                              : 'bg-amber-500'
                          }`}
                          style={{ width: `${accion.avance}%` }}
                        />
                      </div>
                    </td>

                    {/* 8. Fecha de Vencimiento */}
                    <td className="p-2 text-center text-xs border-r border-slate-200 dark:border-slate-800">
                      <input
                        type="date"
                        value={accion.fecha_vencimiento}
                        onChange={(e) =>
                          actualizarAccion(accion.id, 'fecha_vencimiento', e.target.value)
                        }
                        className="bg-transparent text-[11px] font-mono text-slate-700 dark:text-slate-300 focus:outline-none cursor-pointer"
                      />
                    </td>

                    {/* 9. Opciones */}
                    <td className="p-2 text-center">
                      <button
                        type="button"
                        onClick={() => handleEliminarAccion(accion.id)}
                        className="text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 p-1 rounded transition-colors inline-flex items-center justify-center"
                        title="Eliminar esta acción"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                )
              })}

              {accionesDelRiesgo.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-slate-400 text-xs">
                    {riesgoActivo
                      ? `No hay acciones registradas para el riesgo ${riesgoActivo.id}. Haz clic en el icono "+ " de la barra para registrar la primera.`
                      : 'Selecciona un riesgo en la tabla superior.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ============================================================== */}
      {/* MODAL: NUEVO RIESGO                                            */}
      {/* ============================================================== */}
      {modalNuevoRiesgo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-2xs p-4">
          <div className="w-full max-w-xl rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <svg
                  className="w-4 h-4 text-[#1e4e79] dark:text-sky-400"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
                <span>Nuevo Riesgo</span>
              </h3>
              <button
                type="button"
                onClick={() => setModalNuevoRiesgo(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCrearRiesgo} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Escenario PHA Asociado (Nodo)
                  </label>
                  <select
                    value={nuevoRiesgo.escenario_id}
                    onChange={(e) => {
                      const id = e.target.value
                      const escObj = CATALOGO_ESCENARIOS.find((c) => c.id === id)
                      setNuevoRiesgo({
                        ...nuevoRiesgo,
                        escenario_id: id,
                        escenario_nodo: escObj ? `${escObj.id} · ${escObj.nodo}` : `${id} · Horno H-101`,
                        titulo: nuevoRiesgo.titulo || (escObj ? `Riesgo operacional en ${escObj.nodo}: ${escObj.desv}` : ''),
                      })
                    }}
                    className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2 text-slate-900 dark:text-slate-100 focus:outline-none"
                  >
                    {CATALOGO_ESCENARIOS.map((esc) => (
                      <option key={esc.id} value={esc.id}>
                        {esc.id} · {esc.nodo} ({esc.desv})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Origen del Riesgo
                  </label>
                  <select
                    value={nuevoRiesgo.origen}
                    onChange={(e) =>
                      setNuevoRiesgo({
                        ...nuevoRiesgo,
                        origen: e.target.value as 'Causa' | 'Barrera',
                      })
                    }
                    className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2 text-slate-900 dark:text-slate-100 focus:outline-none"
                  >
                    <option value="Barrera">Barrera / Salvaguarda (Degradación)</option>
                    <option value="Causa">Causa Raíz / Desviación de Proceso</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Título de Riesgo (Evento + Causa + Consecuencia)
                </label>
                <textarea
                  rows={2}
                  required
                  placeholder="Descripción clara: e.g. Sobrecalentamiento de serpentín por pérdida de flujo en Horno H-101..."
                  value={nuevoRiesgo.titulo}
                  onChange={(e) => setNuevoRiesgo({ ...nuevoRiesgo, titulo: e.target.value })}
                  className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Tag del Activo / Salvaguarda Asociada
                  </label>
                  <input
                    type="text"
                    value={nuevoRiesgo.tag_asociado}
                    onChange={(e) =>
                      setNuevoRiesgo({ ...nuevoRiesgo, tag_asociado: e.target.value })
                    }
                    placeholder="e.g. SIS-H101-TSHH o FIC-H101"
                    className="w-full font-mono rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2 text-slate-900 dark:text-slate-100 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Categoría
                  </label>
                  <select
                    value={nuevoRiesgo.categoria}
                    onChange={(e) =>
                      setNuevoRiesgo({
                        ...nuevoRiesgo,
                        categoria: e.target.value as CategoriaRiesgo,
                      })
                    }
                    className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2 text-slate-900 dark:text-slate-100 focus:outline-none"
                  >
                    {CATEGORIAS.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Nivel de Riesgo
                  </label>
                  <select
                    value={nuevoRiesgo.nivel_riesgo}
                    onChange={(e) =>
                      setNuevoRiesgo({
                        ...nuevoRiesgo,
                        nivel_riesgo: e.target.value as NivelRiesgo,
                      })
                    }
                    className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2 text-slate-900 dark:text-slate-100 focus:outline-none font-bold"
                  >
                    <option value="Extremo">Extremo</option>
                    <option value="Alto">Alto</option>
                    <option value="Medio">Medio</option>
                    <option value="Bajo">Bajo</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Estado
                  </label>
                  <select
                    value={nuevoRiesgo.estado}
                    onChange={(e) =>
                      setNuevoRiesgo({
                        ...nuevoRiesgo,
                        estado: e.target.value as EstadoRiesgo,
                      })
                    }
                    className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2 text-slate-900 dark:text-slate-100 focus:outline-none"
                  >
                    {ESTADOS_RIESGO.map((est) => (
                      <option key={est} value={est}>
                        {est}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    % Avance
                  </label>
                  <div className="w-full rounded border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 p-2 text-slate-500 dark:text-slate-400 font-mono text-xs">
                    0% (calculado de acciones)
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setModalNuevoRiesgo(false)}
                  className="px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded bg-[#1e4e79] hover:bg-[#163a5c] text-white font-bold"
                >
                  Guardar Riesgo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL: NUEVA ACCIÓN                                            */}
      {/* ============================================================== */}
      {modalNuevaAccion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-2xs p-4">
          <div className="w-full max-w-lg rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <svg
                  className="w-4 h-4 text-amber-500"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <span>Nueva Acción ({riesgoActivo?.id})</span>
              </h3>
              <button
                type="button"
                onClick={() => setModalNuevaAccion(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCrearAccion} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Título de la Acción
                </label>
                <textarea
                  rows={2}
                  required
                  placeholder="Detalle de la acción técnica, inspección, prueba o cambio operativo..."
                  value={nuevaAccion.titulo}
                  onChange={(e) => setNuevaAccion({ ...nuevaAccion, titulo: e.target.value })}
                  className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Responsable (Persona asignada)
                </label>
                <input
                  type="text"
                  list="lista-responsables"
                  required
                  placeholder="Escribe o selecciona el nombre de la persona..."
                  value={nuevaAccion.responsable}
                  onChange={(e) =>
                    setNuevaAccion({ ...nuevaAccion, responsable: e.target.value })
                  }
                  className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Estado
                  </label>
                  <select
                    value={nuevaAccion.estado}
                    onChange={(e) =>
                      setNuevaAccion({
                        ...nuevaAccion,
                        estado: e.target.value as EstadoAccion,
                      })
                    }
                    className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2 text-slate-900 dark:text-slate-100 focus:outline-none font-bold"
                  >
                    <option value="Abierta">Abierta</option>
                    <option value="Finalizada">Finalizada</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    % Avance
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={nuevaAccion.avance}
                    onChange={(e) =>
                      setNuevaAccion({ ...nuevaAccion, avance: Number(e.target.value) || 0 })
                    }
                    className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2 text-slate-900 dark:text-slate-100 focus:outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Fecha Vencimiento
                  </label>
                  <input
                    type="date"
                    required
                    value={nuevaAccion.fecha_vencimiento}
                    onChange={(e) =>
                      setNuevaAccion({ ...nuevaAccion, fecha_vencimiento: e.target.value })
                    }
                    className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2 text-slate-900 dark:text-slate-100 focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setModalNuevaAccion(false)}
                  className="px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded bg-emerald-700 hover:bg-emerald-800 text-white font-bold"
                >
                  Agregar Acción
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
