"""Autenticación del MVP: JWT + dos roles (admin, lector).

Punto de extensión Keycloak/SSO: toda la API depende únicamente de
``usuario_actual`` / ``requiere_admin`` y del protocolo ``ProveedorAuth``. Para pasar a
SSO se implementa un ``ProveedorAuth`` que valide el token OIDC de Keycloak (JWKS) y
devuelva ``Principal`` con el mismo conjunto de roles; no se toca ningún router.
"""

from __future__ import annotations

import hashlib
import hmac
import os
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Annotated, Protocol

import jwt
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.errors import ErrorApi
from app.models import Usuario


@dataclass(frozen=True)
class Principal:
    username: str
    rol: str  # admin | lector


class ProveedorAuth(Protocol):
    def autenticar(self, db: Session, username: str, password: str) -> Principal | None: ...
    def validar_token(self, token: str) -> Principal: ...


def hash_password(password: str, salt: bytes | None = None) -> str:
    salt = salt or os.urandom(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 120_000)
    return f"pbkdf2_sha256${salt.hex()}${dk.hex()}"


def verificar_password(password: str, almacenado: str) -> bool:
    try:
        _, salt_hex, dk_hex = almacenado.split("$")
    except ValueError:
        return False
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt_hex), 120_000)
    return hmac.compare_digest(dk.hex(), dk_hex)


class AuthLocalJWT:
    """Proveedor local del MVP (tabla ``usuario`` + JWT HS256)."""

    def autenticar(self, db: Session, username: str, password: str) -> Principal | None:
        u = db.scalars(select(Usuario).where(Usuario.username == username)).first()
        if u is None or not verificar_password(password, u.password_hash):
            return None
        return Principal(u.username, u.rol)

    def crear_token(self, p: Principal) -> str:
        s = get_settings()
        exp = datetime.now(UTC) + timedelta(minutes=s.jwt_minutos)
        return jwt.encode({"sub": p.username, "rol": p.rol, "exp": exp}, s.jwt_secret, s.jwt_algoritmo)

    def validar_token(self, token: str) -> Principal:
        s = get_settings()
        try:
            datos = jwt.decode(token, s.jwt_secret, algorithms=[s.jwt_algoritmo])
        except jwt.PyJWTError as exc:
            raise ErrorApi(401, "TOKEN_INVALIDO", "Sesión inválida o expirada") from exc
        return Principal(datos["sub"], datos.get("rol", "lector"))


proveedor: AuthLocalJWT = AuthLocalJWT()
_bearer = HTTPBearer(auto_error=False)


def usuario_actual(
    cred: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> Principal:
    if cred is None:
        raise ErrorApi(401, "NO_AUTENTICADO", "Se requiere autenticación")
    return proveedor.validar_token(cred.credentials)


def requiere_admin(p: Annotated[Principal, Depends(usuario_actual)]) -> Principal:
    if p.rol != "admin":
        raise ErrorApi(403, "PROHIBIDO", "Se requiere rol administrador")
    return p


Usuario_ = Annotated[Principal, Depends(usuario_actual)]
Admin = Annotated[Principal, Depends(requiere_admin)]
DbSession = Annotated[Session, Depends(get_db)]
