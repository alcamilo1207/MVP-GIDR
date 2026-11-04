import React from 'react'
import {
  BarreraHorno,
  calcFrrEfectivo,
  EstadoSimulacionHorno,
} from '../engine/furnaceModel'

interface Props {
  estado: EstadoSimulacionHorno
  barreraSeleccionada: string | null
  onSelectBarrera: (tag: string) => void
  onToggleBomba: () => void
  onToggleLlama: () => void
}

// Posiciones exactas estilo P&ID de la imagen de referencia
const POSICIONES_CAJAS: Record<
  string,
  {
    boxX: number
    boxY: number
    puntoX: number
    puntoY: number
  }
> = {
  'FIC-H101': { boxX: 250, boxY: 168, puntoX: 250, puntoY: 275 },
  'FSLL-H101': { boxX: 384, boxY: 168, puntoX: 384, puntoY: 275 },
  'SIS-H101-TSHH': { boxX: 555, boxY: 64, puntoX: 555, puntoY: 160 },
  'AL-H101-TAH': { boxX: 812, boxY: 64, puntoX: 812, puntoY: 175 },
  'AL-H101-PSL': { boxX: 250, boxY: 462, puntoX: 250, puntoY: 395 },
  'SIS-H101-BMS': { boxX: 412, boxY: 462, puntoX: 412, puntoY: 395 },
  'GD-H101': { boxX: 768, boxY: 358, puntoX: 650, puntoY: 358 },
}

export const FurnacePID: React.FC<Props> = ({
  estado,
  barreraSeleccionada,
  onSelectBarrera,
  onToggleBomba,
  onToggleLlama,
}) => {
  const haySobrecalentamiento = estado.tempPielTubos >= 545
  const hayCriticoTubos = estado.tempPielTubos >= 580
  const colorSerpentin = hayCriticoTubos
    ? '#ef4444'
    : haySobrecalentamiento
      ? '#f97316'
      : '#8da2c0'

  const estadoVisualBarrera = (b: BarreraHorno) => {
    const esCritico =
      b.estado === 'FUERA_DE_SERVICIO' ||
      b.estado === 'INEXISTENTE' ||
      (b.alarmaActiva && b.estado !== 'DISPONIBLE')
    const esAdvertencia =
      !esCritico &&
      (b.estado === 'DEGRADADO' ||
        b.estado === 'EN_MANTENIMIENTO' ||
        b.alarmaActiva)
    const colorBorde = esCritico
      ? '#ef4444'
      : esAdvertencia
        ? '#f59e0b'
        : '#10b981'
    const colorTextoEstado = esCritico
      ? '#f87171'
      : esAdvertencia
        ? '#fbbf24'
        : '#34d399'
    return { esCritico, esAdvertencia, colorBorde, colorTextoEstado }
  }

  // Símbolo P&ID de Válvula de Control con Actuador de Diafragma
  const renderValvulaPID = (
    x: number,
    y: number,
    etiqueta: string,
    enAlarma: boolean,
    esCritica: boolean
  ) => {
    const colorValvula = esCritica
      ? '#ef4444'
      : enAlarma
        ? '#f59e0b'
        : '#64748b'
    const colorPunto = esCritica
      ? '#ef4444'
      : enAlarma
        ? '#f59e0b'
        : '#10b981'
    return (
      <g
        transform={`translate(${x}, ${y})`}
        className={
          esCritica
            ? 'alarm-red-strobe'
            : enAlarma
              ? 'alarm-amber-strobe'
              : ''
        }
      >
        {/* Vástago y domo del actuador neumático */}
        <line
          x1={0}
          y1={0}
          x2={0}
          y2={-16}
          stroke={colorValvula}
          strokeWidth={2}
        />
        <path
          d="M -11 -16 A 11 9 0 0 1 11 -16 Z"
          fill="#334155"
          stroke="#94a3b8"
          strokeWidth={1.5}
        />
        {/* Cuerpo corbatín (bowtie) de la válvula */}
        <polygon
          points="-13,-9 0,0 -13,9"
          fill="#334155"
          stroke="#94a3b8"
          strokeWidth={1.8}
        />
        <polygon
          points="13,-9 0,0 13,9"
          fill="#334155"
          stroke="#94a3b8"
          strokeWidth={1.8}
        />
        {/* Punto de conexión de instrumento */}
        <circle r={3.5} fill={colorPunto} />
        {/* Etiqueta inferior de la válvula */}
        <text
          x={0}
          y={22}
          textAnchor="middle"
          fill={esCritica ? '#ef4444' : '#b6c2d2'}
          fontSize="10.5"
          fontFamily="monospace"
          fontWeight={esCritica || enAlarma ? '700' : '500'}
        >
          {etiqueta}
        </text>
      </g>
    )
  }

  // Caja de Instrumento / Barrera estilo P&ID de la imagen
  const renderCajaInstrumento = (b: BarreraHorno, valorTexto: string) => {
    const pos = POSICIONES_CAJAS[b.tag]
    if (!pos) return null
    const { esCritico, esAdvertencia, colorBorde, colorTextoEstado } =
      estadoVisualBarrera(b)
    const seleccionada = barreraSeleccionada === b.tag
    const frrEf = calcFrrEfectivo(b)

    const textoSubestado =
      b.estado === 'DISPONIBLE'
        ? `OK · FRR ${frrEf}`
        : b.estado === 'DEGRADADO'
          ? `DEGR ${b.factorDegradacion}% · FRR ${frrEf}`
          : b.estado === 'EN_MANTENIMIENTO'
            ? `MANT · FRR 1`
            : `BYPASS · FRR 1`

    return (
      <g key={b.tag}>
        {/* Línea punteada de señal de instrumento hacia el punto de proceso */}
        <line
          x1={pos.boxX}
          y1={pos.boxY}
          x2={pos.puntoX}
          y2={pos.puntoY}
          stroke={esCritico ? '#ef4444' : esAdvertencia ? '#f59e0b' : '#475569'}
          strokeWidth={1.6}
          strokeDasharray="4 4"
        />

        {/* Punto sensor sobre la línea/equipo */}
        <circle
          cx={pos.puntoX}
          cy={pos.puntoY}
          r={3.8}
          fill={colorBorde}
          className={
            esCritico
              ? 'alarm-red-strobe'
              : esAdvertencia
                ? 'alarm-amber-strobe'
                : ''
          }
        />

        {/* Contenedor clicable de la placa de barrera */}
        <g
          transform={`translate(${pos.boxX}, ${pos.boxY})`}
          onClick={() => onSelectBarrera(b.tag)}
          className="cursor-pointer"
        >
          {/* Halo de alarma pulsante si la barrera está en falla/degradada o alarma activa */}
          {(esCritico || esAdvertencia) && (
            <rect
              x={-63}
              y={-35}
              width={126}
              height={70}
              rx={11}
              fill="none"
              stroke={colorBorde}
              strokeWidth={2.5}
              className={esCritico ? 'alarm-red-strobe' : 'alarm-amber-strobe'}
            />
          )}

          {/* Marco azul celeste de selección (como SIS-H101-TSHH en la imagen) */}
          {seleccionada && (
            <rect
              x={-63}
              y={-35}
              width={126}
              height={70}
              rx={11}
              fill="none"
              stroke="#38bdf8"
              strokeWidth={2.2}
            />
          )}

          {/* Caja oscura principal del instrumento */}
          <rect
            x={-54}
            y={-27}
            width={108}
            height={54}
            rx={6}
            fill="#0f172a"
            stroke={colorBorde}
            strokeWidth={2}
          />

          {/* Línea divisoria horizontal interna */}
          <line
            x1={-54}
            y1={-8}
            x2={54}
            y2={-8}
            stroke={colorBorde}
            strokeWidth={1}
            strokeOpacity={0.8}
          />

          {/* Tag del instrumento en cabecera */}
          <text
            x={0}
            y={-13.5}
            textAnchor="middle"
            fill="#ffffff"
            fontSize="10.5"
            fontWeight="800"
            fontFamily="monospace"
          >
            {b.tag}
          </text>

          {/* Valor de proceso en vivo */}
          <text
            x={0}
            y={8}
            textAnchor="middle"
            fill="#ffffff"
            fontSize="11.5"
            fontWeight="800"
            fontFamily="monospace"
          >
            {valorTexto}
          </text>

          {/* Estado y FRR en la parte inferior */}
          <text
            x={0}
            y={21}
            textAnchor="middle"
            fill={colorTextoEstado}
            fontSize="9.5"
            fontWeight="800"
            fontFamily="monospace"
          >
            {textoSubestado}
          </text>
        </g>
      </g>
    )
  }

  const ficEst = estadoVisualBarrera(estado.barreras['FIC-H101'])
  const bmsEst = estadoVisualBarrera(estado.barreras['SIS-H101-BMS'])
  const tahEst = estadoVisualBarrera(estado.barreras['AL-H101-TAH'])

  return (
    <div className="bg-white border border-slate-300 rounded-xl overflow-hidden shadow-md">
      {/* Cabecera compacta del diagrama P&ID */}
      <div className="px-4 py-2 bg-slate-900 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="px-2 py-0.5 rounded bg-sky-950 text-sky-300 border border-sky-700 font-mono text-xs font-bold">
            P&ID · HORNO H-101
          </span>
          <h2 className="text-xs sm:text-sm font-bold text-white">
            Esquema de Proceso e Instrumentación (Haz clic en cualquier bloque o equipo)
          </h2>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
            OK / Disponible
          </span>
          <span className="flex items-center gap-1.5 text-amber-400 font-medium">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
            Degradado / Alerta
          </span>
          <span className="flex items-center gap-1.5 text-rose-400 font-medium">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping inline-block" />
            Alarma / Bypass
          </span>
        </div>
      </div>

      {/* Lienzo P&ID sobre fondo blanco limpio exactamente como la imagen de referencia */}
      <div className="bg-white p-2 sm:p-4">
        <svg
          viewBox="0 0 925 515"
          className="w-full h-auto max-h-[520px] select-none"
        >
          {/* ============================================================== */}
          {/* 1. LÍNEAS DE PROCESO (CRUDO, COMBUSTIBLE Y SALIDA A T-101)     */}
          {/* ============================================================== */}

          {/* Línea horizontal de Carga de Crudo (y = 275) */}
          <line
            x1={24}
            y1={275}
            x2={460}
            y2={275}
            stroke={!estado.bombaP101Activa ? '#ef4444' : '#526077'}
            strokeWidth={3.2}
          />
          {/* Animación sutil de flujo sobre la línea de crudo cuando la bomba opera */}
          {estado.bombaP101Activa && (
            <line
              x1={24}
              y1={275}
              x2={460}
              y2={275}
              stroke="#38bdf8"
              strokeWidth={1.8}
              strokeOpacity={0.55}
              className={estado.flujoCarga < 75 ? 'flow-slow' : 'flow-normal'}
            />
          )}
          {/* Flecha de dirección en entrada de crudo */}
          <polygon points="68,270 80,275 68,280" fill="#526077" />
          <text
            x={24}
            y={258}
            fill="#8b9bb4"
            fontSize="11.5"
            fontFamily="monospace"
            fontWeight="600"
          >
            CARGA CRUDO ({estado.tempEntrada}°C)
          </text>

          {/* Línea horizontal de Gas Combustible (y = 395) -> sube al quemador (x = 555) */}
          <polyline
            points="24,395 555,395 555,360"
            fill="none"
            stroke={estado.presionGasCombustible < 20 ? '#ef4444' : '#526077'}
            strokeWidth={3.2}
          />
          {estado.aperturaTic101 > 2 && estado.presionGasCombustible > 5 && (
            <polyline
              points="24,395 555,395 555,360"
              fill="none"
              stroke="#f59e0b"
              strokeWidth={1.6}
              strokeOpacity={0.6}
              className="flow-normal"
            />
          )}
          {/* Flecha de dirección en entrada de gas combustible */}
          <polygon points="68,390 80,395 68,400" fill="#526077" />
          <text
            x={24}
            y={382}
            fill="#8b9bb4"
            fontSize="11.5"
            fontFamily="monospace"
            fontWeight="600"
          >
            GAS COMB. ({estado.presionGasCombustible} psig)
          </text>

          {/* Línea horizontal de Salida a Columna T-101 (y = 175) */}
          <line
            x1={650}
            y1={175}
            x2={900}
            y2={175}
            stroke={estado.tempSalida > 395 ? '#ef4444' : '#526077'}
            strokeWidth={3.2}
          />
          {estado.bombaP101Activa && (
            <line
              x1={650}
              y1={175}
              x2={900}
              y2={175}
              stroke="#f97316"
              strokeWidth={1.8}
              strokeOpacity={0.55}
              className="flow-normal"
            />
          )}
          {/* Flecha final a Columna T-101 */}
          <polygon points="892,170 905,175 892,180" fill="#526077" />
          <text
            x={902}
            y={160}
            textAnchor="end"
            fill="#8b9bb4"
            fontSize="11.5"
            fontFamily="monospace"
            fontWeight="600"
          >
            A COLUMNA T-101 ({estado.tempSalida.toFixed(1)}°C)
          </text>

          {/* ============================================================== */}
          {/* 2. SILUETA DEL HORNO H-101, SERPENTÍN Y QUEMADOR               */}
          {/* ============================================================== */}
          <g>
            {/* Halo exterior de alarma si el horno tiene sobrecalentamiento o gas LEL */}
            {(haySobrecalentamiento || estado.gasHidrocarburoLel > 10) && (
              <polygon
                points="454,152 522,118 588,118 656,152 656,364 454,364"
                fill="none"
                stroke="#ef4444"
                strokeWidth={3}
                strokeDasharray="6 4"
                className="alarm-red-strobe"
              />
            )}

            {/* Cuerpo pentagonal oscuro del Horno H-101 */}
            <polygon
              points="460,155 525,123 585,123 650,155 650,358 460,358"
              fill="#0f172a"
              stroke={
                haySobrecalentamiento || estado.gasHidrocarburoLel > 10
                  ? '#ef4444'
                  : '#64748b'
              }
              strokeWidth={2.5}
            />

            {/* Título H-101 dentro de la cúpula del horno */}
            <text
              x={555}
              y={146}
              textAnchor="middle"
              fill="#ffffff"
              fontSize="13"
              fontWeight="800"
              fontFamily="monospace"
            >
              H-101
            </text>

            {/* Serpentín en zig-zag dentro del horno */}
            <polyline
              points="460,275 618,275 492,242 618,208 492,175 650,175"
              fill="none"
              stroke={colorSerpentin}
              strokeWidth={3.2}
              strokeLinejoin="round"
              className={hayCriticoTubos ? 'alarm-red-strobe' : ''}
            />

            {/* Punto caliente animado en el serpentín cuando hay coque > 30% */}
            {estado.coquePct > 30 && (
              <g transform="translate(555, 225)" className="alarm-red-strobe">
                <circle r={12} fill="#ef4444" fillOpacity={0.35} />
                <circle r={6} fill="#ef4444" stroke="#fef08a" strokeWidth={1.5} />
              </g>
            )}

            {/* Textos de telemetría interna del horno (TMT, Coque, Quemador, LEL) */}
            <text
              x={555}
              y={306}
              textAnchor="middle"
              fill={haySobrecalentamiento ? '#fca5a5' : '#e2e8f0'}
              fontSize="11"
              fontWeight="800"
              fontFamily="monospace"
            >
              TMT: {estado.tempPielTubos.toFixed(1)}°C · Coque: {estado.coquePct}%
            </text>
            <text
              x={555}
              y={323}
              textAnchor="middle"
              fill={
                !estado.llamaEncendida || estado.gasHidrocarburoLel > 10
                  ? '#f87171'
                  : '#94a3b8'
              }
              fontSize="10.5"
              fontFamily="monospace"
            >
              Quemador: {estado.llamaEncendida ? 'ON' : 'OFF'} · LEL:{' '}
              {estado.gasHidrocarburoLel}%
            </text>

            {/* Triángulo del Quemador en la base del horno (clic para encender/apagar / rearmar) */}
            <g
              onClick={onToggleLlama}
              className={`cursor-pointer ${
                !estado.llamaEncendida ? 'alarm-red-strobe' : ''
              }`}
              style={{ cursor: 'pointer' }}
            >
              {/* Hitbox transparente ampliada para facilitar el clic en el quemador */}
              <rect x={495} y={305} width={120} height={60} fill="transparent" />
              <polygon
                points="540,358 555,330 570,358"
                fill={
                  !estado.llamaEncendida
                    ? '#450a0a'
                    : estado.aperturaTic101 > 80
                      ? '#7f1d1d'
                      : '#451a03'
                }
                stroke={
                  !estado.llamaEncendida
                    ? '#ef4444'
                    : estado.aperturaTic101 > 80
                      ? '#ef4444'
                      : '#f97316'
                }
                strokeWidth={2.2}
              />
            </g>
          </g>

          {/* ============================================================== */}
          {/* 3. BOMBA P-101A Y VÁLVULAS DE CONTROL / CORTE EN LÍNEA         */}
          {/* ============================================================== */}

          {/* Bomba centrífuga P-101A */}
          <g
            transform="translate(130, 275)"
            onClick={onToggleBomba}
            className="cursor-pointer"
          >
            {!estado.bombaP101Activa && (
              <circle
                r={26}
                fill="none"
                stroke="#ef4444"
                strokeWidth={2.5}
                className="alarm-red-strobe"
              />
            )}
            {/* Base triangular de la bomba */}
            <polygon
              points="-16,20 16,20 9,8 -9,8"
              fill="#0f172a"
              stroke={estado.bombaP101Activa ? '#10b981' : '#ef4444'}
              strokeWidth={2}
            />
            {/* Descarga tangencial superior */}
            <line
              x1={0}
              y1={-18}
              x2={16}
              y2={-18}
              stroke={estado.bombaP101Activa ? '#10b981' : '#ef4444'}
              strokeWidth={3}
            />
            {/* Carcasa circular */}
            <circle
              r={18}
              fill="#0f172a"
              stroke={estado.bombaP101Activa ? '#10b981' : '#ef4444'}
              strokeWidth={2.5}
            />
            <text
              x={0}
              y={3.5}
              textAnchor="middle"
              fill="#ffffff"
              fontSize="9.5"
              fontWeight="800"
              fontFamily="monospace"
            >
              P-101A
            </text>
            <text
              x={0}
              y={34}
              textAnchor="middle"
              fill={estado.bombaP101Activa ? '#34d399' : '#ef4444'}
              fontSize="10"
              fontWeight="700"
              fontFamily="monospace"
            >
              {estado.bombaP101Activa ? 'RUN' : 'STOP'}
            </text>
          </g>

          {/* Válvula FV-101 (conectada a FIC-H101) */}
          {renderValvulaPID(
            250,
            275,
            `FV-101 (${estado.aperturaFic101}%)`,
            ficEst.esAdvertencia,
            ficEst.esCritico
          )}

          {/* Válvula de corte XV-BMS (conectada a SIS-H101-BMS) */}
          {renderValvulaPID(
            412,
            395,
            'XV-BMS',
            bmsEst.esAdvertencia,
            bmsEst.esCritico
          )}

          {/* Válvula de control térmico TV-101 */}
          {renderValvulaPID(
            508,
            395,
            `TV-101 (${estado.aperturaTic101}%)`,
            tahEst.esAdvertencia,
            tahEst.esCritico
          )}

          {/* ============================================================== */}
          {/* 4. CAJAS DE INSTRUMENTACIÓN Y BARRERAS (7 BARRERAS H-101)      */}
          {/* ============================================================== */}
          {renderCajaInstrumento(
            estado.barreras['FIC-H101'],
            `${Math.round(estado.flujoCarga)} m³/h`
          )}
          {renderCajaInstrumento(
            estado.barreras['FSLL-H101'],
            `${Math.round(estado.flujoCarga)} m³/h`
          )}
          {renderCajaInstrumento(
            estado.barreras['SIS-H101-TSHH'],
            `${estado.tempPielTubos.toFixed(1)} °C`
          )}
          {renderCajaInstrumento(
            estado.barreras['AL-H101-TAH'],
            `${estado.tempSalida.toFixed(1)} °C`
          )}
          {renderCajaInstrumento(
            estado.barreras['AL-H101-PSL'],
            `${estado.presionGasCombustible} psig`
          )}
          {renderCajaInstrumento(
            estado.barreras['SIS-H101-BMS'],
            estado.llamaEncendida ? 'LLAMA OK' : 'SIN LLAMA'
          )}
          {renderCajaInstrumento(
            estado.barreras['GD-H101'],
            `${estado.gasHidrocarburoLel}% LEL`
          )}
        </svg>
      </div>
    </div>
  )
}
