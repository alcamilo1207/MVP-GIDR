"""Modelo de datos (SQLAlchemy 2.x). Convención: nombres de dominio en español.

Portable entre PostgreSQL (producción/demo) y SQLite (tests): JSONB solo en PostgreSQL.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any

from sqlalchemy import (
    JSON,
    CheckConstraint,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    MetaData,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

NAMING = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}

JsonType = JSON().with_variant(JSONB(), "postgresql")
Ts = DateTime(timezone=True)

FREC_CHECK = "IN ('A','B','C','D','E')"
ESTADOS_CHECK = "IN ('DISPONIBLE','DEGRADADO','EN_MANTENIMIENTO','FUERA_DE_SERVICIO','INEXISTENTE')"
NIVELES_CHECK = "IN ('Bajo','Medio','Alto','Extremo')"


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING)


class Empresa(Base):
    __tablename__ = "empresa"
    id: Mapped[int] = mapped_column(primary_key=True)
    nombre: Mapped[str] = mapped_column(String(200), unique=True)
    sites: Mapped[list[Site]] = relationship(back_populates="empresa", cascade="all, delete-orphan")


class Site(Base):
    __tablename__ = "site"
    __table_args__ = (UniqueConstraint("empresa_id", "nombre"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    empresa_id: Mapped[int] = mapped_column(ForeignKey("empresa.id", ondelete="CASCADE"), index=True)
    nombre: Mapped[str] = mapped_column(String(200))
    empresa: Mapped[Empresa] = relationship(back_populates="sites")
    unidades: Mapped[list[Unidad]] = relationship(back_populates="site", cascade="all, delete-orphan")


class Unidad(Base):
    __tablename__ = "unidad"
    __table_args__ = (UniqueConstraint("site_id", "nombre"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    site_id: Mapped[int] = mapped_column(ForeignKey("site.id", ondelete="CASCADE"), index=True)
    nombre: Mapped[str] = mapped_column(String(200))
    site: Mapped[Site] = relationship(back_populates="unidades")
    nodos: Mapped[list[Nodo]] = relationship(back_populates="unidad", cascade="all, delete-orphan")


class Nodo(Base):
    __tablename__ = "nodo"
    __table_args__ = (UniqueConstraint("unidad_id", "nombre"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    unidad_id: Mapped[int] = mapped_column(ForeignKey("unidad.id", ondelete="CASCADE"), index=True)
    nombre: Mapped[str] = mapped_column(String(200))
    descripcion: Mapped[str | None] = mapped_column(Text)
    unidad: Mapped[Unidad] = relationship(back_populates="nodos")
    palabras_guia: Mapped[list[PalabraGuia]] = relationship(back_populates="nodo", cascade="all, delete-orphan")


class PalabraGuia(Base):
    __tablename__ = "palabra_guia"
    __table_args__ = (UniqueConstraint("nodo_id", "nombre"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    nodo_id: Mapped[int] = mapped_column(ForeignKey("nodo.id", ondelete="CASCADE"), index=True)
    nombre: Mapped[str] = mapped_column(String(200))
    nodo: Mapped[Nodo] = relationship(back_populates="palabras_guia")
    escenarios: Mapped[list[Escenario]] = relationship(
        back_populates="palabra_guia", cascade="all, delete-orphan"
    )


class Escenario(Base):
    """Escenario HAZOP: una causa con su consecuencia. Solo campos de ENTRADA."""

    __tablename__ = "escenario"
    __table_args__ = (
        UniqueConstraint("palabra_guia_id", "causa"),
        CheckConstraint(f"frecuencia_diseno {FREC_CHECK}", name="frecuencia_diseno"),
        CheckConstraint("imp_economico BETWEEN 1 AND 5", name="imp_economico"),
        CheckConstraint("imp_personas BETWEEN 1 AND 5", name="imp_personas"),
        CheckConstraint("imp_ambiente BETWEEN 1 AND 5", name="imp_ambiente"),
        CheckConstraint("imp_reputacion BETWEEN 1 AND 5", name="imp_reputacion"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    palabra_guia_id: Mapped[int] = mapped_column(ForeignKey("palabra_guia.id", ondelete="CASCADE"), index=True)
    causa: Mapped[str] = mapped_column(Text)
    frecuencia_diseno: Mapped[str] = mapped_column(String(1))
    consecuencia: Mapped[str] = mapped_column(Text)
    imp_economico: Mapped[int] = mapped_column(Integer)
    imp_personas: Mapped[int] = mapped_column(Integer)
    imp_ambiente: Mapped[int] = mapped_column(Integer)
    imp_reputacion: Mapped[int] = mapped_column(Integer)
    peligro: Mapped[str | None] = mapped_column(Text, nullable=True)
    evento_tope: Mapped[str | None] = mapped_column(Text, nullable=True)
    bowtie_layout: Mapped[dict[str, Any] | None] = mapped_column(JsonType, nullable=True)
    version: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
    activo: Mapped[bool] = mapped_column(default=True, server_default="1")
    updated_at: Mapped[datetime] = mapped_column(Ts, server_default=func.now(), onupdate=func.now())
    palabra_guia: Mapped[PalabraGuia] = relationship(back_populates="escenarios")
    barreras: Mapped[list[EscenarioBarrera]] = relationship(
        back_populates="escenario", cascade="all, delete-orphan"
    )
    factores_escalamiento: Mapped[list[FactorEscalamiento]] = relationship(
        back_populates="escenario", cascade="all, delete-orphan"
    )


class Barrera(Base):
    __tablename__ = "barrera"
    __table_args__ = (
        UniqueConstraint("empresa_id", "tag_activo"),
        CheckConstraint("tipo IN ('EXISTENTE','TEMPORAL')", name="tipo"),
        CheckConstraint(f"estado_actual {ESTADOS_CHECK}", name="estado_actual"),
        CheckConstraint("tipo = 'EXISTENTE' OR vigencia_hasta IS NOT NULL", name="temporal_vigencia"),
        Index("ix_barrera_estado_actual", "estado_actual"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    empresa_id: Mapped[int] = mapped_column(ForeignKey("empresa.id", ondelete="CASCADE"), index=True)
    tag_activo: Mapped[str] = mapped_column(String(100))
    descripcion: Mapped[str] = mapped_column(Text)
    tipo: Mapped[str] = mapped_column(String(10), default="EXISTENTE")
    vigencia_desde: Mapped[date | None] = mapped_column(Date)
    vigencia_hasta: Mapped[date | None] = mapped_column(Date)
    moc_ref: Mapped[str | None] = mapped_column(String(100))
    estado_actual: Mapped[str] = mapped_column(String(20), default="DISPONIBLE")
    estado_actualizado: Mapped[datetime | None] = mapped_column(Ts)
    escenarios: Mapped[list[EscenarioBarrera]] = relationship(
        back_populates="barrera", cascade="all, delete-orphan"
    )


class EscenarioBarrera(Base):
    __tablename__ = "escenario_barrera"
    __table_args__ = (
        UniqueConstraint("escenario_id", "barrera_id"),
        CheckConstraint("frr_diseno >= 1", name="frr_diseno"),
        CheckConstraint("lado IN ('PREVENTIVA','MITIGATIVA')", name="lado"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    escenario_id: Mapped[int] = mapped_column(ForeignKey("escenario.id", ondelete="CASCADE"), index=True)
    barrera_id: Mapped[int] = mapped_column(ForeignKey("barrera.id", ondelete="CASCADE"), index=True)
    frr_diseno: Mapped[float] = mapped_column(Float)
    lado: Mapped[str] = mapped_column(String(12), default="PREVENTIVA", server_default="PREVENTIVA")
    escenario: Mapped[Escenario] = relationship(back_populates="barreras")
    barrera: Mapped[Barrera] = relationship(back_populates="escenarios")
    factores_escalamiento: Mapped[list[FactorEscalamiento]] = relationship(
        back_populates="escenario_barrera", cascade="all, delete-orphan"
    )


class FactorEscalamiento(Base):
    """Factor de escalamiento (Escalation Factor) que puede comprometer la eficacia de una barrera."""

    __tablename__ = "factor_escalamiento"
    id: Mapped[int] = mapped_column(primary_key=True)
    escenario_id: Mapped[int] = mapped_column(ForeignKey("escenario.id", ondelete="CASCADE"), index=True)
    escenario_barrera_id: Mapped[int] = mapped_column(ForeignKey("escenario_barrera.id", ondelete="CASCADE"), index=True)
    descripcion: Mapped[str] = mapped_column(Text)
    categoria: Mapped[str | None] = mapped_column(String(100), nullable=True)

    escenario: Mapped[Escenario] = relationship(back_populates="factores_escalamiento")
    escenario_barrera: Mapped[EscenarioBarrera] = relationship(back_populates="factores_escalamiento")
    controles: Mapped[list[ControlFactorEscalamiento]] = relationship(
        back_populates="factor_escalamiento", cascade="all, delete-orphan"
    )


class ControlFactorEscalamiento(Base):
    """Control o barrera de mitigación del factor de escalamiento (EF Barrier)."""

    __tablename__ = "control_factor_escalamiento"
    id: Mapped[int] = mapped_column(primary_key=True)
    factor_escalamiento_id: Mapped[int] = mapped_column(
        ForeignKey("factor_escalamiento.id", ondelete="CASCADE"), index=True
    )
    descripcion: Mapped[str] = mapped_column(Text)
    tag_activo: Mapped[str | None] = mapped_column(String(100), nullable=True)
    estado_actual: Mapped[str] = mapped_column(String(20), default="DISPONIBLE", server_default="DISPONIBLE")

    factor_escalamiento: Mapped[FactorEscalamiento] = relationship(back_populates="controles")


class EstadoBarreraHist(Base):
    """Historial de estados. En PostgreSQL+TimescaleDB es un hypertable por ``ts``
    (la PK incluye ``ts``, requisito de TimescaleDB); si no, es una tabla normal."""

    __tablename__ = "estado_barrera_hist"
    __table_args__ = (
        CheckConstraint(f"estado {ESTADOS_CHECK}", name="estado"),
        Index("ix_estado_barrera_hist_barrera_ts", "barrera_id", "ts"),
    )
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    ts: Mapped[datetime] = mapped_column(Ts, primary_key=True)
    barrera_id: Mapped[int] = mapped_column(ForeignKey("barrera.id", ondelete="CASCADE"))
    estado: Mapped[str] = mapped_column(String(20))
    fuente: Mapped[str] = mapped_column(String(50))
    detalle: Mapped[dict[str, Any] | None] = mapped_column(JsonType)


class ResultadoRiesgo(Base):
    """Historial de resultados del motor (campos CALCULADOS; nunca se capturan)."""

    __tablename__ = "resultado_riesgo"
    __table_args__ = (
        CheckConstraint(f"frecuencia_actual {FREC_CHECK}", name="frecuencia_actual"),
        CheckConstraint(f"frecuencia_diseno_resid {FREC_CHECK}", name="frecuencia_diseno_resid"),
        CheckConstraint(f"riesgo_actual {NIVELES_CHECK}", name="riesgo_actual"),
        CheckConstraint(f"riesgo_diseno {NIVELES_CHECK}", name="riesgo_diseno"),
        CheckConstraint(f"riesgo_inherente {NIVELES_CHECK}", name="riesgo_inherente"),
        Index("ix_resultado_riesgo_escenario_ts", "escenario_id", "ts"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    escenario_id: Mapped[int] = mapped_column(ForeignKey("escenario.id", ondelete="CASCADE"))
    ts: Mapped[datetime] = mapped_column(Ts, server_default=func.now())
    severidad: Mapped[int] = mapped_column(Integer)
    riesgo_inherente: Mapped[str] = mapped_column(String(10))
    frr_diseno_total: Mapped[float] = mapped_column(Float)
    frecuencia_diseno_resid: Mapped[str] = mapped_column(String(1))
    riesgo_diseno: Mapped[str] = mapped_column(String(10))
    frecuencia_actual: Mapped[str] = mapped_column(String(1))
    frr_actual_total: Mapped[float] = mapped_column(Float)
    riesgo_actual: Mapped[str] = mapped_column(String(10))
    puntaje_diseno: Mapped[int] = mapped_column(Integer)
    puntaje_actual: Mapped[int] = mapped_column(Integer)
    brecha: Mapped[int] = mapped_column(Integer)
    escenario_version: Mapped[int] = mapped_column(Integer, default=1)
    motivo: Mapped[str | None] = mapped_column(String(200))
    version_motor: Mapped[str] = mapped_column(String(20))


class MatrizRiesgo(Base):
    __tablename__ = "matriz_riesgo"
    __table_args__ = (
        UniqueConstraint("empresa_id", "frecuencia", "severidad"),
        CheckConstraint(f"frecuencia {FREC_CHECK}", name="frecuencia"),
        CheckConstraint("severidad BETWEEN 1 AND 5", name="severidad"),
        CheckConstraint(f"nivel {NIVELES_CHECK}", name="nivel"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    empresa_id: Mapped[int] = mapped_column(ForeignKey("empresa.id", ondelete="CASCADE"), index=True)
    frecuencia: Mapped[str] = mapped_column(String(1))
    severidad: Mapped[int] = mapped_column(Integer)
    nivel: Mapped[str] = mapped_column(String(10))


class PoliticaEstado(Base):
    __tablename__ = "politica_estado"
    __table_args__ = (
        UniqueConstraint("empresa_id", "estado"),
        CheckConstraint(f"estado {ESTADOS_CHECK}", name="estado"),
        CheckConstraint("multiplicador_frr >= 0", name="multiplicador_frr"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    empresa_id: Mapped[int] = mapped_column(ForeignKey("empresa.id", ondelete="CASCADE"), index=True)
    estado: Mapped[str] = mapped_column(String(20))
    multiplicador_frr: Mapped[float] = mapped_column(Float)


class Accion(Base):
    __tablename__ = "accion"
    __table_args__ = (
        CheckConstraint("estado IN ('ABIERTA','CERRADA')", name="estado"),
        CheckConstraint("origen IN ('AUTO','MANUAL')", name="origen"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    escenario_id: Mapped[int | None] = mapped_column(ForeignKey("escenario.id", ondelete="CASCADE"), index=True)
    barrera_id: Mapped[int | None] = mapped_column(ForeignKey("barrera.id", ondelete="SET NULL"))
    descripcion: Mapped[str] = mapped_column(Text)
    estado: Mapped[str] = mapped_column(String(10), default="ABIERTA")
    origen: Mapped[str] = mapped_column(String(10), default="MANUAL")
    responsable: Mapped[str | None] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(Ts, server_default=func.now())
    closed_at: Mapped[datetime | None] = mapped_column(Ts)


class EventoAuditoria(Base):
    __tablename__ = "evento_auditoria"
    id: Mapped[int] = mapped_column(primary_key=True)
    ts: Mapped[datetime] = mapped_column(Ts, server_default=func.now(), index=True)
    usuario: Mapped[str] = mapped_column(String(100))
    accion: Mapped[str] = mapped_column(String(100), index=True)
    entidad: Mapped[str] = mapped_column(String(50))
    entidad_id: Mapped[str | None] = mapped_column(String(50))
    antes: Mapped[dict[str, Any] | None] = mapped_column(JsonType)
    despues: Mapped[dict[str, Any] | None] = mapped_column(JsonType)


class Usuario(Base):
    """Usuarios locales del MVP (sustituibles por Keycloak/SSO, ver app/security.py)."""

    __tablename__ = "usuario"
    __table_args__ = (CheckConstraint("rol IN ('admin','lector')", name="rol"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(100), unique=True)
    password_hash: Mapped[str] = mapped_column(String(300))
    rol: Mapped[str] = mapped_column(String(10))
