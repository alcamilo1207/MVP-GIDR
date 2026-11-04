export type EstadoBarreraGD =
  | 'DISPONIBLE'
  | 'DEGRADADO'
  | 'EN_MANTENIMIENTO'
  | 'FUERA_DE_SERVICIO'
  | 'INEXISTENTE'

export interface BarreraHorno {
  tag: string
  nombreCorto: string
  descripcion: string
  sistema: 'DCS_SCADA' | 'SIS' | 'HISTORIADOR_IOW' | 'CMMS' | 'GEMELO_DIGITAL'
  lado: 'PREVENTIVA' | 'REACTIVA'
  frrDiseno: number
  estado: EstadoBarreraGD
  factorDegradacion: number // 1..100
  alarmaActiva: boolean
  mensajeAlarma: string | null
  posicionPID: { x: number; y: number }
}

export interface EstadoProcesoHorno {
  /** Temperatura de entrada de crudo (°C) */
  tempEntrada: number
  /** Temperatura de salida de crudo del horno (°C) — Normal: 365 °C */
  tempSalida: number
  /** Temperatura máxima de piel de tubos TMT (°C) — Normal: 480 °C, Alerta: 540 °C, Crítico: 610 °C */
  tempPielTubos: number
  /** Caudal de carga de crudo por el serpentín (m³/h) — Normal: 120 m³/h */
  flujoCarga: number
  /** Presión de gas combustible a quemadores (psig) — Normal: 45 psig */
  presionGasCombustible: number
  /** Apertura de válvula de control térmico TIC-101 (%) — Normal: 52% */
  aperturaTic101: number
  /** Apertura de válvula de control de flujo de carga FIC-H101 (%) — Normal: 75% */
  aperturaFic101: number
  /** Porcentaje de taponamiento por coque en el serpentín (0–100%) */
  coqueSerpentinPct: number
  /** Estado de la bomba de carga P-101A */
  bombaP101Activa: boolean
  /** Estado de la llama en caja de fuego */
  llamaEncendida: boolean
  /** Concentración de gas hidrocarburo en caja/entorno del horno (% LEL) */
  gasHidrocarburoLel: number
  /** Disparo de emergencia del horno ejecutado por SIS */
  disparoSisEjecutado: boolean
  /** Identificador del escenario de evento activo */
  escenarioActivoId: string
  /** Descripción del evento en curso */
  eventoDescripcion: string
}

// Re-export sin espacio en nombre de propiedad
export interface EstadoSimulacionHorno {
  tempEntrada: number
  tempSalida: number
  tempPielTubos: number
  flujoCarga: number
  presionGasCombustible: number
  aperturaTic101: number
  aperturaFic101: number
  coquePct: number
  bombaP101Activa: boolean
  llamaEncendida: boolean
  gasHidrocarburoLel: number
  disparoSisEjecutado: boolean
  escenarioActivoId: string
  eventoDescripcion: string
  barreras: Record<string, BarreraHorno>
}

export const BARRERAS_INICIALES_HORNO: Record<string, BarreraHorno> = {
  'FIC-H101': {
    tag: 'FIC-H101',
    nombreCorto: 'Control Flujo Carga',
    descripcion: 'Lazo de control básico de flujo de carga al horno (DCS)',
    sistema: 'DCS_SCADA',
    lado: 'PREVENTIVA',
    frrDiseno: 10,
    estado: 'DISPONIBLE',
    factorDegradacion: 10,
    alarmaActiva: false,
    mensajeAlarma: null,
    posicionPID: { x: 235, y: 235 },
  },
  'FSLL-H101': {
    tag: 'FSLL-H101',
    nombreCorto: 'SIS Bajo Flujo Paso',
    descripcion: 'Interruptor SIS de muy bajo flujo por paso del horno',
    sistema: 'SIS',
    lado: 'PREVENTIVA',
    frrDiseno: 100,
    estado: 'DISPONIBLE',
    factorDegradacion: 10,
    alarmaActiva: false,
    mensajeAlarma: null,
    posicionPID: { x: 345, y: 175 },
  },
  'AL-H101-TAH': {
    tag: 'AL-H101-TAH',
    nombreCorto: 'Alarma Alta Temp.',
    descripcion: 'Alarma de alta temperatura de salida del horno (TIC-101)',
    sistema: 'DCS_SCADA',
    lado: 'PREVENTIVA',
    frrDiseno: 10,
    estado: 'DISPONIBLE',
    factorDegradacion: 10,
    alarmaActiva: false,
    mensajeAlarma: null,
    posicionPID: { x: 755, y: 120 },
  },
  'SIS-H101-TSHH': {
    tag: 'SIS-H101-TSHH',
    nombreCorto: 'SIS Temp. Piel Tubos',
    descripcion: 'Lazo SIS: disparo del horno por muy alta temperatura de piel de tubos',
    sistema: 'SIS',
    lado: 'PREVENTIVA',
    frrDiseno: 100,
    estado: 'DISPONIBLE',
    factorDegradacion: 10,
    alarmaActiva: false,
    mensajeAlarma: null,
    posicionPID: { x: 605, y: 185 },
  },
  'AL-H101-PSL': {
    tag: 'AL-H101-PSL',
    nombreCorto: 'Alarma Baja P. Gas',
    descripcion: 'Alarma de baja presión de gas combustible con respuesta del operador',
    sistema: 'DCS_SCADA',
    lado: 'PREVENTIVA',
    frrDiseno: 10,
    estado: 'DISPONIBLE',
    factorDegradacion: 10,
    alarmaActiva: false,
    mensajeAlarma: null,
    posicionPID: { x: 255, y: 445 },
  },
  'SIS-H101-BMS': {
    tag: 'SIS-H101-BMS',
    nombreCorto: 'SIS Gestión Quemadores',
    descripcion: 'Lazo SIS (BMS): corte de gas combustible por pérdida de llama',
    sistema: 'SIS',
    lado: 'PREVENTIVA',
    frrDiseno: 1000,
    estado: 'DISPONIBLE',
    factorDegradacion: 10,
    alarmaActiva: false,
    mensajeAlarma: null,
    posicionPID: { x: 410, y: 445 },
  },
  'GD-H101': {
    tag: 'GD-H101',
    nombreCorto: 'Detector Gas F&G',
    descripcion: 'Detección de gas hidrocarburo (Fire & Gas) en zona del horno H-101',
    sistema: 'SIS',
    lado: 'REACTIVA',
    frrDiseno: 10,
    estado: 'DISPONIBLE',
    factorDegradacion: 10,
    alarmaActiva: false,
    mensajeAlarma: null,
    posicionPID: { x: 735, y: 365 },
  },
}

export function estadoInicialHorno(): EstadoSimulacionHorno {
  const copiaBarreras: Record<string, BarreraHorno> = {}
  for (const [k, v] of Object.entries(BARRERAS_INICIALES_HORNO)) {
    copiaBarreras[k] = { ...v }
  }
  return {
    tempEntrada: 245,
    tempSalida: 365,
    tempPielTubos: 480,
    flujoCarga: 120,
    presionGasCombustible: 45,
    aperturaTic101: 52,
    aperturaFic101: 75,
    coquePct: 5,
    bombaP101Activa: true,
    llamaEncendida: true,
    gasHidrocarburoLel: 0,
    disparoSisEjecutado: false,
    escenarioActivoId: 'NORMAL',
    eventoDescripcion: 'Operación normal estacionaria en Horno H-101 (CDU-100)',
    barreras: copiaBarreras,
  }
}

export function calcFrrEfectivo(b: BarreraHorno): number {
  if (b.estado === 'DISPONIBLE') return b.frrDiseno
  if (b.estado === 'DEGRADADO') {
    const d = Math.max(1, Math.min(100, b.factorDegradacion))
    return Number(Math.max(1.0, b.frrDiseno * ((100 - d) / 100)).toFixed(1))
  }
  return 1.0
}

/**
 * Avanza un paso de simulación física (dt = 0.5 s) del Horno H-101.
 */
export function avanzarFisicaHorno(actual: EstadoSimulacionHorno): EstadoSimulacionHorno {
  const s = {
    ...actual,
    barreras: { ...actual.barreras },
  }

  // 1. Dinámica hidráulica de carga de crudo
  const factorCoque = 1 - Math.min(0.65, (s.coquePct / 100) * 0.65)
  const caudalObjetivo = s.bombaP101Activa
    ? 160 * (s.aperturaFic101 / 100) * factorCoque
    : 0.0
  const ruidoFlujo = s.bombaP101Activa ? (Math.random() - 0.5) * 0.8 : 0.0
  s.flujoCarga = Number(
    Math.max(0, s.flujoCarga + 0.35 * (caudalObjetivo - s.flujoCarga) + ruidoFlujo).toFixed(1)
  )

  // 1.1 Dinámica de temperatura de entrada (alimentación desde el tren de precalentamiento)
  const tempAmbiente = 25.0
  const hayFlujoCarga = s.bombaP101Activa && s.flujoCarga >= 10.0
  // Si hay flujo de crudo fresco, entra a 245 °C desde el tren de intercambio; si se corta la bomba, se enfría al ambiente
  const tempEntradaObj = hayFlujoCarga ? 245.0 : tempAmbiente
  s.tempEntrada = Number(
    (s.tempEntrada + 0.06 * (tempEntradaObj - s.tempEntrada)).toFixed(1)
  )

  // 2. Dinámica de combustión y llama
  if (s.presionGasCombustible < 12 || s.aperturaTic101 <= 1) {
    s.llamaEncendida = false
  }

  // Si la llama está apagada pero sigue entrando gas combustible sin corte del BMS -> acumulación de gas (% LEL)
  const bms = { ...s.barreras['SIS-H101-BMS'] }
  if (!s.llamaEncendida && s.presionGasCombustible >= 8 && s.aperturaTic101 > 10) {
    if (bms.estado === 'DISPONIBLE') {
      // BMS corta el gas automáticamente
      s.aperturaTic101 = 0
      s.disparoSisEjecutado = true
      s.gasHidrocarburoLel = Math.max(0, Number((s.gasHidrocarburoLel - 3).toFixed(1)))
    } else {
      // BMS en Bypass / Degradado -> acumulación peligrosa de gas en caja de fuego
      s.gasHidrocarburoLel = Math.min(
        100,
        Number((s.gasHidrocarburoLel + 6.5).toFixed(1))
      )
    }
  } else if (s.tempPielTubos > 615) {
    // Fuga por fluencia térmica en tubos
    s.gasHidrocarburoLel = Math.min(
      100,
      Number((s.gasHidrocarburoLel + 5.0).toFixed(1))
    )
  } else {
    s.gasHidrocarburoLel = Math.max(
      0,
      Number((s.gasHidrocarburoLel - 4.0).toFixed(1))
    )
  }

  // 3. Balance térmico en fluido (tempSalida) y piel de tubos (tempPielTubos)
  const potenciaLlama = s.llamaEncendida
    ? (s.aperturaTic101 / 52) * (s.presionGasCombustible / 45)
    : 0.0

  let tempSalidaObj: number
  let tempPielObj: number

  if (s.llamaEncendida) {
    // HORNO ENCENDIDO: Transferencia de calor de llama hacia crudo y tubos
    const flujoEfectivo = Math.max(15, s.flujoCarga)
    const deltaTempObjetivo = 120 * potenciaLlama * Math.pow(120 / flujoEfectivo, 0.55)
    tempSalidaObj = s.tempEntrada + deltaTempObjetivo

    const aislamientoCoque = 1 + 1.65 * (s.coquePct / 100)
    const penalizacionBajoFlujo = Math.pow(120 / flujoEfectivo, 0.45)
    const deltaPiel = 110 * potenciaLlama * aislamientoCoque * penalizacionBajoFlujo
    tempPielObj = s.tempSalida + deltaPiel
  } else {
    // HORNO APAGADO (Sin llama):
    if (hayFlujoCarga) {
      // Caso 1: Flujo de crudo continuo. El crudo baña el serpentín a la temperatura de entrada (245 °C).
      // Al no haber calor radiante entrante (q = 0), el gradiente térmico a través de la pared del tubo desaparece (deltaPiel = 0).
      // TMT y temperatura de salida se equilibran con el crudo entrante.
      tempSalidaObj = s.tempEntrada
      tempPielObj = s.tempSalida
    } else {
      // Caso 2: Sin flujo de crudo y sin llama (parada total / enfriamiento estático hacia el ambiente).
      // El crudo estancado, los tubos y el refractario disipan calor hacia el aire ambiente (25 °C).
      tempSalidaObj = tempAmbiente
      tempPielObj = tempAmbiente
    }
  }

  const ruidoTemp = s.llamaEncendida ? (Math.random() - 0.5) * 0.6 : (Math.random() - 0.5) * 0.15
  const inerciaFluido = s.llamaEncendida ? 0.25 : (hayFlujoCarga ? 0.18 : 0.08)
  const inerciaPiel = s.llamaEncendida ? 0.30 : (hayFlujoCarga ? 0.22 : 0.08)

  s.tempSalida = Number(
    (s.tempSalida + inerciaFluido * (tempSalidaObj - s.tempSalida) + ruidoTemp).toFixed(1)
  )

  s.tempPielTubos = Number(
    (s.tempPielTubos + inerciaPiel * (tempPielObj - s.tempPielTubos) + ruidoTemp).toFixed(1)
  )

  // 4. Evaluar alarmas visuales sobre cada barrera según las variables físicas actuales
  const tah = { ...s.barreras['AL-H101-TAH'] }
  tah.alarmaActiva = s.tempSalida > 395 || tah.estado !== 'DISPONIBLE'
  tah.mensajeAlarma =
    s.tempSalida > 395
      ? `ALARMA TAH: ${s.tempSalida}°C (>395°C)`
      : tah.estado !== 'DISPONIBLE'
        ? `Barrera ${tah.estado}`
        : null
  s.barreras['AL-H101-TAH'] = tah

  const tshh = { ...s.barreras['SIS-H101-TSHH'] }
  tshh.alarmaActiva = s.tempPielTubos > 545 || tshh.estado !== 'DISPONIBLE'
  tshh.mensajeAlarma =
    s.tempPielTubos > 585
      ? `CRÍTICO TSHH: Piel ${s.tempPielTubos}°C`
      : s.tempPielTubos > 545
        ? `EXCURSIÓN IOW TMT: ${s.tempPielTubos}°C`
        : tshh.estado !== 'DISPONIBLE'
          ? `SIS ${tshh.estado}`
          : null
  s.barreras['SIS-H101-TSHH'] = tshh

  const fsll = { ...s.barreras['FSLL-H101'] }
  fsll.alarmaActiva = s.flujoCarga < 75 || fsll.estado !== 'DISPONIBLE'
  fsll.mensajeAlarma =
    s.flujoCarga < 75
      ? `BAJO FLUJO FSLL: ${s.flujoCarga} m³/h`
      : fsll.estado !== 'DISPONIBLE'
        ? `SIS ${fsll.estado}`
        : null
  s.barreras['FSLL-H101'] = fsll

  const fic = { ...s.barreras['FIC-H101'] }
  fic.alarmaActiva = !s.bombaP101Activa || s.flujoCarga < 85 || fic.estado !== 'DISPONIBLE'
  fic.mensajeAlarma = !s.bombaP101Activa
    ? 'FALLA BOMBA P-101A'
    : fic.estado !== 'DISPONIBLE'
      ? `Lazo ${fic.estado}`
      : null
  s.barreras['FIC-H101'] = fic

  const psl = { ...s.barreras['AL-H101-PSL'] }
  psl.alarmaActiva = s.presionGasCombustible < 25 || psl.estado !== 'DISPONIBLE'
  psl.mensajeAlarma =
    s.presionGasCombustible < 25
      ? `BAJA PRESIÓN GAS: ${s.presionGasCombustible} psig`
      : psl.estado !== 'DISPONIBLE'
        ? `Alarma ${psl.estado}`
        : null
  s.barreras['AL-H101-PSL'] = psl

  bms.alarmaActiva = !s.llamaEncendida || bms.estado !== 'DISPONIBLE'
  bms.mensajeAlarma = !s.llamaEncendida
    ? '¡PÉRDIDA DE LLAMA EN QUEMADORES!'
    : bms.estado !== 'DISPONIBLE'
      ? `BMS ${bms.estado}`
      : null
  s.barreras['SIS-H101-BMS'] = bms

  const gd = { ...s.barreras['GD-H101'] }
  gd.alarmaActiva = s.gasHidrocarburoLel > 10 || gd.estado !== 'DISPONIBLE'
  gd.mensajeAlarma =
    s.gasHidrocarburoLel > 10
      ? `¡GAS DETECTADO: ${s.gasHidrocarburoLel}% LEL!`
      : gd.estado !== 'DISPONIBLE'
        ? `Detector ${gd.estado}`
        : null
  s.barreras['GD-H101'] = gd

  return s
}

export interface EscenarioEventoPreset {
  id: string
  titulo: string
  subtituloHazop: string
  colorBoton: string
  aplicar: (base: EstadoSimulacionHorno) => EstadoSimulacionHorno
}

export const ESCENARIOS_EVENTO_HORNO: EscenarioEventoPreset[] = [
  {
    id: 'ESC_1_TIC101_ALTA_TEMP',
    titulo: '🔥 1. Falla Controlador TIC-101 + Bypass SIS-TSHH',
    subtituloHazop:
      'Más temperatura → Sobrecalentamiento de tubos, ruptura e incendio en el horno',
    colorBoton: 'border-rose-500/70 bg-rose-950/60 hover:bg-rose-900/70 text-rose-100',
    aplicar: () => {
      const s = estadoInicialHorno()
      s.escenarioActivoId = 'ESC_1_TIC101_ALTA_TEMP'
      s.eventoDescripcion =
        'Falla de controlador TIC-101 con salida al 98% + Bypass de mantenimiento en SIS-H101-TSHH y degradación en alarma AL-H101-TAH'
      s.aperturaTic101 = 98
      s.presionGasCombustible = 54
      s.barreras['SIS-H101-TSHH'] = {
        ...s.barreras['SIS-H101-TSHH'],
        estado: 'FUERA_DE_SERVICIO',
        factorDegradacion: 100,
      }
      s.barreras['AL-H101-TAH'] = {
        ...s.barreras['AL-H101-TAH'],
        estado: 'DEGRADADO',
        factorDegradacion: 75,
      }
      return s
    },
  },
  {
    id: 'ESC_2_COQUE_SERPENTIN',
    titulo: '🧱 2. Taponamiento por Coque en Paso de Carga',
    subtituloHazop:
      'Más temperatura → Punto caliente en tubos, fluencia térmica y fuga de hidrocarburo',
    colorBoton: 'border-amber-500/70 bg-amber-950/60 hover:bg-amber-900/70 text-amber-100',
    aplicar: () => {
      const s = estadoInicialHorno()
      s.escenarioActivoId = 'ESC_2_COQUE_SERPENTIN'
      s.eventoDescripcion =
        'Taponamiento parcial por coque (78%) en serpentín + Sensor de bajo flujo FSLL-H101 degradado al 80%'
      s.coquePct = 78
      s.aperturaTic101 = 68
      s.barreras['FSLL-H101'] = {
        ...s.barreras['FSLL-H101'],
        estado: 'DEGRADADO',
        factorDegradacion: 80,
      }
      s.barreras['AL-H101-TAH'] = {
        ...s.barreras['AL-H101-TAH'],
        estado: 'DEGRADADO',
        factorDegradacion: 60,
      }
      return s
    },
  },
  {
    id: 'ESC_3_FALLA_BOMBA_P101A',
    titulo: '⚙️ 3. Disparo de Bomba de Carga P-101A + FIC en Manual',
    subtituloHazop:
      'Menos flujo → Caída brusca de caudal al serpentín y riesgo de daño térmico',
    colorBoton: 'border-orange-500/70 bg-orange-950/60 hover:bg-orange-900/70 text-orange-100',
    aplicar: () => {
      const s = estadoInicialHorno()
      s.escenarioActivoId = 'ESC_3_FALLA_BOMBA_P101A'
      s.eventoDescripcion =
        'Paro por falla mecánica en Bomba P-101A + Lazo FIC-H101 en modo Manual (Fuera de servicio) y FSLL-H101 en mantenimiento'
      s.bombaP101Activa = false
      s.aperturaFic101 = 22
      s.barreras['FIC-H101'] = {
        ...s.barreras['FIC-H101'],
        estado: 'FUERA_DE_SERVICIO',
        factorDegradacion: 100,
      }
      s.barreras['FSLL-H101'] = {
        ...s.barreras['FSLL-H101'],
        estado: 'EN_MANTENIMIENTO',
        factorDegradacion: 90,
      }
      return s
    },
  },
  {
    id: 'ESC_4_APAGADO_LLAMA_BMS',
    titulo: '💥 4. Pérdida de Llama + Falla en BMS (Riesgo Explosión)',
    subtituloHazop:
      'Menos flujo gas → Apagado de llama y acumulación de gas en caja de fuego: explosión',
    colorBoton: 'border-purple-500/70 bg-purple-950/60 hover:bg-purple-900/70 text-purple-100',
    aplicar: () => {
      const s = estadoInicialHorno()
      s.escenarioActivoId = 'ESC_4_APAGADO_LLAMA_BMS'
      s.eventoDescripcion =
        'Caída de presión de gas combustible apaga quemadores + SIS-H101-BMS inhibido (Bypass) permite acumulación de gas explosivo'
      s.presionGasCombustible = 9
      s.llamaEncendida = false
      s.aperturaTic101 = 65
      s.gasHidrocarburoLel = 38
      s.barreras['AL-H101-PSL'] = {
        ...s.barreras['AL-H101-PSL'],
        estado: 'FUERA_DE_SERVICIO',
        factorDegradacion: 100,
      }
      s.barreras['SIS-H101-BMS'] = {
        ...s.barreras['SIS-H101-BMS'],
        estado: 'FUERA_DE_SERVICIO',
        factorDegradacion: 100,
      }
      s.barreras['GD-H101'] = {
        ...s.barreras['GD-H101'],
        estado: 'DEGRADADO',
        factorDegradacion: 70,
      }
      return s
    },
  },
]
