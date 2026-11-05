"""Esquemas Pydantic v2 de la API."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any, Generic, Literal, TypeVar

from pydantic import BaseModel, ConfigDict, Field, model_validator

Frecuencia = Literal["A", "B", "C", "D", "E"]
Estado = Literal["DISPONIBLE", "DEGRADADO", "EN_MANTENIMIENTO", "FUERA_DE_SERVICIO", "INEXISTENTE"]
TipoBarrera = Literal["EXISTENTE", "TEMPORAL"]
Lado = Literal["PREVENTIVA", "MITIGATIVA"]
Rol = Literal["admin", "lector"]

T = TypeVar("T")


class Orm(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class Pagina(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    size: int


# ---------- Auth ----------
class LoginIn(BaseModel):
    username: str
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    username: str
    rol: Rol


class UsuarioOut(BaseModel):
    username: str
    rol: Rol


# ---------- Jerarquía ----------
class EmpresaIn(BaseModel):
    nombre: str = Field(min_length=1, max_length=200)


class EmpresaOut(Orm, EmpresaIn):
    id: int


class SiteIn(BaseModel):
    empresa_id: int
    nombre: str = Field(min_length=1, max_length=200)


class SiteOut(Orm, SiteIn):
    id: int


class UnidadIn(BaseModel):
    site_id: int
    nombre: str = Field(min_length=1, max_length=200)


class UnidadOut(Orm, UnidadIn):
    id: int


class NodoIn(BaseModel):
    unidad_id: int
    nombre: str = Field(min_length=1, max_length=200)
    descripcion: str | None = None
    condiciones_diseno: str | None = None
    condiciones_operacion: str | None = None
    color: str | None = Field(default=None, max_length=40)
    sesion: str | None = Field(default=None, max_length=80)
    planos: list[str] | None = None
    comentarios: str | None = None


class NodoOut(Orm, NodoIn):
    id: int


class PalabraGuiaIn(BaseModel):
    nodo_id: int
    nombre: str = Field(min_length=1, max_length=200)


class PalabraGuiaOut(Orm, PalabraGuiaIn):
    id: int


# ---------- Escenarios ----------
class ResultadoOut(Orm):
    ts: datetime
    severidad: int
    riesgo_inherente: str
    riesgo_diseno: str
    frecuencia_diseno_resid: str
    frr_diseno_total: float
    frecuencia_actual: str
    frr_actual_total: float
    riesgo_actual: str
    puntaje_diseno: int
    puntaje_actual: int
    brecha: int
    escenario_version: int
    motivo: str | None
    version_motor: str


class EscenarioIn(BaseModel):
    """Solo campos de ENTRADA; los calculados los deriva el motor y no se aceptan aquí."""

    model_config = ConfigDict(extra="forbid")
    palabra_guia_id: int | None = None
    nodo_id: int | None = None
    palabra_guia: str | None = None
    causa: str = Field(min_length=1)
    peligro: str | None = None
    evento_tope: str | None = None
    recomendacion: str | None = None
    rec_prioridad: str | None = "Medium"
    rec_responsable: str | None = None
    rec_estado: str | None = "Proposed"
    rec_comentarios: str | None = None
    rec_prioridad: str | None = "Medium"
    rec_responsable: str | None = None
    rec_estado: str | None = "Proposed"
    rec_comentarios: str | None = None
    rec_prioridad: str | None = "Medium"
    rec_responsable: str | None = None
    rec_estado: str | None = "Proposed"
    rec_comentarios: str | None = None
    frecuencia_diseno: Frecuencia
    consecuencia: str = Field(min_length=1)
    imp_economico: int = Field(ge=1, le=5)
    imp_personas: int = Field(ge=1, le=5)
    imp_ambiente: int = Field(ge=1, le=5)
    imp_reputacion: int = Field(ge=1, le=5)


class EscenarioUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    causa: str | None = Field(default=None, min_length=1)
    peligro: str | None = None
    evento_tope: str | None = None
    recomendacion: str | None = None
    rec_prioridad: str | None = "Medium"
    rec_responsable: str | None = None
    rec_estado: str | None = "Proposed"
    rec_comentarios: str | None = None
    rec_prioridad: str | None = "Medium"
    rec_responsable: str | None = None
    rec_estado: str | None = "Proposed"
    rec_comentarios: str | None = None
    rec_prioridad: str | None = None
    rec_responsable: str | None = None
    rec_estado: str | None = None
    rec_comentarios: str | None = None
    frecuencia_diseno: Frecuencia | None = None
    consecuencia: str | None = Field(default=None, min_length=1)
    imp_economico: int | None = Field(default=None, ge=1, le=5)
    imp_personas: int | None = Field(default=None, ge=1, le=5)
    imp_ambiente: int | None = Field(default=None, ge=1, le=5)
    imp_reputacion: int | None = Field(default=None, ge=1, le=5)


class RiesgosPorImpactoOut(BaseModel):
    economico: str
    personas: str
    ambiente: str
    reputacion: str


class ControlFactorOut(BaseModel):
    id: int
    factor_escalamiento_id: int
    descripcion: str
    tag_activo: str | None = None
    estado_actual: str = "DISPONIBLE"


class FactorEscalamientoOut(BaseModel):
    id: int
    escenario_id: int
    escenario_barrera_id: int
    barrera_tag: str
    descripcion: str
    categoria: str | None = None
    controles: list[ControlFactorOut] = []


class BarreraEscenarioOut(BaseModel):
    barrera_id: int
    tag_activo: str
    descripcion: str
    tipo: TipoBarrera
    estado_actual: str
    factor_degradacion: int = 90
    lado: str
    frr_diseno: float
    frr_efectivo: float
    cuenta_en_diseno: bool
    vigente: bool
    vigencia_desde: date | None
    vigencia_hasta: date | None
    moc_ref: str | None


class EscenarioOut(BaseModel):
    id: int
    empresa: str
    site_id: int
    site: str
    unidad_id: int
    unidad: str
    nodo_id: int
    nodo: str
    palabra_guia_id: int
    palabra_guia: str
    causa: str
    peligro: str | None = None
    evento_tope: str | None = None
    recomendacion: str | None = None
    rec_prioridad: str | None = "Medium"
    rec_responsable: str | None = None
    rec_estado: str | None = "Proposed"
    rec_comentarios: str | None = None
    rec_prioridad: str | None = "Medium"
    rec_responsable: str | None = None
    rec_estado: str | None = "Proposed"
    rec_comentarios: str | None = None
    frecuencia_diseno: str
    consecuencia: str
    imp_economico: int
    imp_personas: int
    imp_ambiente: int
    imp_reputacion: int
    version: int
    n_barreras: int = 0
    resultado: ResultadoOut | None = None
    barreras: list[BarreraEscenarioOut] = []
    factores_escalamiento: list[FactorEscalamientoOut] = []
    riesgo_diseno_imp: RiesgosPorImpactoOut | None = None
    riesgo_actual_imp: RiesgosPorImpactoOut | None = None


class EscenarioDetalle(EscenarioOut):
    barreras: list[BarreraEscenarioOut]
    historial: list[ResultadoOut]


class VinculoIn(BaseModel):
    frr_diseno: float = Field(ge=1)
    lado: Lado = "PREVENTIVA"


class VinculoCrear(VinculoIn):
    barrera_id: int


# ---------- Barreras ----------
class BarreraBase(BaseModel):
    descripcion: str = Field(min_length=1)
    tipo: TipoBarrera = "EXISTENTE"
    vigencia_desde: date | None = None
    vigencia_hasta: date | None = None
    moc_ref: str | None = None

    @model_validator(mode="after")
    def _temporal(self) -> BarreraBase:
        if self.tipo == "TEMPORAL" and (self.vigencia_hasta is None or not self.moc_ref):
            raise ValueError("Una barrera TEMPORAL requiere vigencia_hasta y moc_ref")
        if self.vigencia_desde and self.vigencia_hasta and self.vigencia_desde > self.vigencia_hasta:
            raise ValueError("vigencia_desde no puede ser posterior a vigencia_hasta")
        return self


class EscenarioVinculoIn(VinculoIn):
    escenario_id: int


class BarreraIn(BarreraBase):
    tag_activo: str = Field(min_length=1, max_length=100)
    empresa_id: int | None = None
    vinculos: list[EscenarioVinculoIn] = []


class BarreraUpdate(BaseModel):
    descripcion: str | None = None
    vigencia_desde: date | None = None
    vigencia_hasta: date | None = None
    moc_ref: str | None = None
    factor_degradacion: int | None = Field(default=None, ge=1, le=100)


class BarreraOut(Orm):
    id: int
    empresa_id: int
    tag_activo: str
    descripcion: str
    tipo: TipoBarrera
    vigencia_desde: date | None
    vigencia_hasta: date | None
    moc_ref: str | None
    estado_actual: str
    factor_degradacion: int = 90
    estado_actualizado: datetime | None
    n_escenarios: int = 0


class EscenarioDependiente(BaseModel):
    escenario_id: int
    causa: str
    unidad: str
    nodo: str
    lado: str
    frr_diseno: float
    riesgo_diseno: str | None
    riesgo_actual: str | None
    brecha: int | None


class BarreraDetalle(BarreraOut):
    dependientes: list[EscenarioDependiente]


class CambioEstadoIn(BaseModel):
    estado: Estado
    factor_degradacion: int | None = Field(default=None, ge=1, le=100)
    fuente: str = "UI_SIMULACION"
    detalle: dict[str, Any] | None = None
    aplicar: bool = True


class ResultadoSnap(BaseModel):
    riesgo_diseno: str
    riesgo_actual: str
    frecuencia_actual: str
    frr_actual_total: float
    brecha: int


class ImpactoEscenario(BaseModel):
    escenario_id: int
    causa: str
    antes: ResultadoSnap | None
    despues: ResultadoSnap


class CambioEstadoOut(BaseModel):
    aplicado: bool
    barrera_id: int
    tag_activo: str
    estado_anterior: str
    estado_nuevo: str
    impacto: list[ImpactoEscenario]


class HistorialOut(Orm):
    ts: datetime
    estado: str
    fuente: str
    detalle: dict[str, Any] | None


# ---------- Integraciones ----------
class ErrorFilaOut(BaseModel):
    fila: int
    campo: str | None
    mensaje: str


class ImportacionOut(BaseModel):
    filas_totales: int
    filas_aceptadas: int
    errores: list[ErrorFilaOut]
    escenarios_creados: int
    escenarios_actualizados: int
    escenarios_sin_cambios: int
    barreras_creadas: int
    vinculos_creados: int
    escenarios_recalculados: int


class EventoCmmsIn(BaseModel):
    tag_activo: str
    estado: str
    fuente: str | None = None
    fecha: datetime | None = None
    detalle: dict[str, Any] | None = None


class EventosCmmsIn(BaseModel):
    eventos: list[EventoCmmsIn] = Field(min_length=1)


class CambioEstadoIngesta(BaseModel):
    tag_activo: str
    antes: str
    despues: str
    escenarios_afectados: int


class IngestaOut(BaseModel):
    recibidos: int
    aceptados: int
    duplicados: int
    cambios_estado: list[CambioEstadoIngesta]
    no_mapeados: list[str]
    errores: list[ErrorFilaOut]
    escenarios_recalculados: int


# ---------- Analítica ----------
class CeldaMapa(BaseModel):
    frecuencia: str
    severidad: int
    nivel: str
    diseno: int
    actual: int


class EscenarioPriorizado(BaseModel):
    escenario_id: int
    causa: str
    unidad: str
    nodo: str
    riesgo_diseno: str
    riesgo_actual: str
    brecha: int
    puntaje_actual: int
    recomendacion: str | None = None
    rec_prioridad: str | None = "Medium"
    rec_responsable: str | None = None
    rec_estado: str | None = "Proposed"
    rec_comentarios: str | None = None


class ResumenDashboard(BaseModel):
    barreras_total: int
    barreras_disponibles: int
    pct_barreras_disponibles: float
    barreras_por_estado: dict[str, int]
    escenarios_total: int
    escenarios_en_brecha: int
    escenarios_alto_extremo_actual: int
    escenarios_alto_extremo_diseno: int
    mapa_calor: list[CeldaMapa]
    priorizados: list[EscenarioPriorizado]


# ---------- Sistema ----------
class RecalcularIn(BaseModel):
    escenario_ids: list[int] | None = None


class RecalculoOut(BaseModel):
    escenarios: int
    con_brecha: int
    motivo: str
    version_motor: str


class AuditoriaOut(Orm):
    id: int
    ts: datetime
    usuario: str
    accion: str
    entidad: str
    entidad_id: str | None
    antes: dict[str, Any] | None
    despues: dict[str, Any] | None


class AccionIn(BaseModel):
    escenario_id: int | None = None
    barrera_id: int | None = None
    descripcion: str = Field(min_length=1)
    responsable: str | None = None


class AccionOut(Orm):
    id: int
    escenario_id: int | None
    barrera_id: int | None
    descripcion: str
    estado: str
    origen: str
    responsable: str | None
    created_at: datetime
    closed_at: datetime | None


class PoliticaIn(BaseModel):
    multiplicador_frr: float = Field(ge=0)


class CeldaMatrizIn(BaseModel):
    frecuencia: Frecuencia
    severidad: int = Field(ge=1, le=5)
    nivel: Literal["Bajo", "Medio", "Alto", "Extremo"]


# ---------- BowTie 8 Bloques & Hoja PHA ----------
class ControlFactorIn(BaseModel):
    id: int | None = None
    descripcion: str = Field(min_length=1)
    tag_activo: str | None = None
    estado_actual: Estado = "DISPONIBLE"


class FactorEscalamientoIn(BaseModel):
    id: int | None = None
    escenario_barrera_id: int | None = None
    barrera_tag: str
    descripcion: str = Field(min_length=1)
    categoria: str | None = None
    controles: list[ControlFactorIn] = []


class BowTieBarreraIn(BaseModel):
    barrera_id: int | None = None
    tag_activo: str = Field(min_length=1)
    descripcion: str = Field(min_length=1)
    tipo: TipoBarrera = "EXISTENTE"
    lado: Lado = "PREVENTIVA"
    frr_diseno: float = Field(ge=1)
    estado_actual: Estado = "DISPONIBLE"
    factor_degradacion: int = Field(default=90, ge=1, le=100)
    vigencia_desde: date | None = None
    vigencia_hasta: date | None = None
    moc_ref: str | None = None


class BowTieGuardarIn(BaseModel):
    palabra_guia: str | None = None
    peligro: str | None = None
    evento_tope: str | None = None
    recomendacion: str | None = None
    rec_prioridad: str | None = "Medium"
    rec_responsable: str | None = None
    rec_estado: str | None = "Proposed"
    rec_comentarios: str | None = None
    rec_prioridad: str | None = "Medium"
    rec_responsable: str | None = None
    rec_estado: str | None = "Proposed"
    rec_comentarios: str | None = None
    causa: str = Field(min_length=1)
    frecuencia_diseno: Frecuencia
    consecuencia: str = Field(min_length=1)
    imp_economico: int = Field(ge=1, le=5)
    imp_personas: int = Field(ge=1, le=5)
    imp_ambiente: int = Field(ge=1, le=5)
    imp_reputacion: int = Field(ge=1, le=5)
    barreras: list[BowTieBarreraIn] = []
    factores_escalamiento: list[FactorEscalamientoIn] = []
    layout: dict[str, Any] | None = None


class ConsecuenciaBowTie(BaseModel):
    categoria: str
    nivel: int
    texto: str


class BowTieCausaRama(BaseModel):
    escenario_id: int
    causa: str
    frecuencia_diseno: str
    frecuencia_actual: str
    recomendacion: str | None = None
    rec_prioridad: str | None = "Medium"
    rec_responsable: str | None = None
    rec_estado: str | None = "Proposed"
    rec_comentarios: str | None = None
    riesgo_diseno: str | None = None
    riesgo_actual: str | None = None
    brecha: float = 0.0
    barreras_preventivas: list[BarreraEscenarioOut] = []
    factores_escalamiento: list[FactorEscalamientoOut] = []
    resultado: ResultadoOut | None = None


class BowTieConsecuenciaRama(BaseModel):
    consecuencia: str
    severidad_max: int
    imp_economico: int
    imp_personas: int
    imp_ambiente: int
    imp_reputacion: int
    escenario_ids: list[int] = []
    barreras_mitigativas: list[BarreraEscenarioOut] = []
    factores_escalamiento: list[FactorEscalamientoOut] = []


class BowTieDesviacionOut(BaseModel):
    desviacion_id: int  # palabra_guia_id
    nodo_id: int
    nodo: str
    unidad_id: int
    unidad: str
    site: str
    palabra_guia: str
    peligro: str
    evento_tope: str
    ruta: str
    riesgo_diseno_global: str
    riesgo_actual_global: str
    brecha_maxima: float
    causas: list[BowTieCausaRama] = []
    consecuencias: list[BowTieConsecuenciaRama] = []
    escenario_seleccionado_id: int | None = None
    layout: dict[str, Any] | None = None


class BowTieCompletoOut(BaseModel):
    escenario_id: int
    peligro: str
    evento_tope: str
    recomendacion: str | None = None
    rec_prioridad: str | None = "Medium"
    rec_responsable: str | None = None
    rec_estado: str | None = "Proposed"
    rec_comentarios: str | None = None
    causa: str
    frecuencia_diseno: str
    consecuencia: str
    ruta: str
    imp_economico: int
    imp_personas: int
    imp_ambiente: int
    imp_reputacion: int
    preventivas: list[BarreraEscenarioOut]
    mitigativas: list[BarreraEscenarioOut]
    consecuencias: list[ConsecuenciaBowTie]
    factores_escalamiento: list[FactorEscalamientoOut]
    resultado: ResultadoOut | None
    layout: dict[str, Any] | None = None
    desviacion: BowTieDesviacionOut | None = None


class ConfiguracionOut(BaseModel):
    empresa_id: int
    version_motor: str
    politica_estado: dict[str, float]
    matriz: list[CeldaMatrizIn]
    supuestos: list[str]


# ---------- Gemelo Digital y Vínculos Dinámicos en Tiempo Real ----------
SistemaFuenteGemelo = Literal["DCS_SCADA", "SIS", "HISTORIADOR_IOW", "CMMS", "GEMELO_DIGITAL"]
TipoEvaluacionGemelo = Literal["ESTADO_DISCRETO", "SALUD_DEGRADACION", "UMBRAL_IOW"]


class VinculoGemeloIn(BaseModel):
    barrera_id: int
    sistema_fuente: SistemaFuenteGemelo = "GEMELO_DIGITAL"
    tag_gemelo: str = Field(min_length=1, max_length=150)
    descripcion: str = Field(min_length=1)
    tipo_evaluacion: TipoEvaluacionGemelo = "SALUD_DEGRADACION"
    unidad_ing: str | None = None
    umbral_alerta: float | None = None
    umbral_critico: float | None = None
    activo: bool = True


class VinculoGemeloOut(BaseModel):
    id: int
    barrera_id: int
    barrera_tag: str
    barrera_descripcion: str
    barrera_estado: str
    barrera_factor_degradacion: int
    barrera_frr_diseno: float = 10.0
    sistema_fuente: str
    tag_gemelo: str
    descripcion: str
    tipo_evaluacion: str
    unidad_ing: str | None = None
    umbral_alerta: float | None = None
    umbral_critico: float | None = None
    ultimo_valor: float | None = None
    ultimo_estado_evaluado: str | None = None
    ultima_actualizacion: datetime | None = None
    activo: bool


class LecturaTelemetriaIn(BaseModel):
    tag_gemelo: str | None = None
    barrera_tag: str | None = None
    valor: float | None = None
    estado_manual: Estado | None = None
    factor_degradacion: int | None = Field(default=None, ge=1, le=100)
    fuente: str | None = None


class TelemetriaBatchIn(BaseModel):
    lecturas: list[LecturaTelemetriaIn] = Field(min_length=1, max_length=500)


class ResultadoTelemetriaOut(BaseModel):
    procesadas: int
    barreras_actualizadas: int
    escenarios_recalculados: int
    eventos_emitidos: list[dict[str, Any]]

