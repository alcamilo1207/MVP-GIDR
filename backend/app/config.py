"""Configuración (variables de entorno, ver .env.example)."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://gidr:gidr@localhost:5432/gidr"
    jwt_secret: str = "cambiar-en-produccion"
    jwt_algoritmo: str = "HS256"
    jwt_minutos: int = 480
    cors_origenes: str = "http://localhost:5173,http://localhost:3000"
    auto_seed: bool = True
    #: Días antes del vencimiento para considerar una barrera temporal "próxima a vencer".
    dias_alerta_vencimiento: int = 7
    #: Intervalo (min) del chequeo de vencimiento de temporales; 0 desactiva.
    minutos_chequeo_temporales: int = 15


@lru_cache
def get_settings() -> Settings:
    return Settings()
