from fastapi import APIRouter

from app.errors import ErrorApi
from app.schemas import LoginIn, TokenOut, UsuarioOut
from app.security import DbSession, Usuario_, proveedor

router = APIRouter(prefix="/auth", tags=["Autenticación"])


@router.post("/login", response_model=TokenOut)
def login(datos: LoginIn, db: DbSession) -> TokenOut:
    p = proveedor.autenticar(db, datos.username, datos.password)
    if p is None:
        raise ErrorApi(401, "CREDENCIALES_INVALIDAS", "Usuario o contraseña incorrectos")
    return TokenOut(access_token=proveedor.crear_token(p), username=p.username, rol=p.rol)


@router.get("/me", response_model=UsuarioOut)
def me(p: Usuario_) -> UsuarioOut:
    return UsuarioOut(username=p.username, rol=p.rol)
