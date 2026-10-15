"""CRUD de la jerarquía Empresa → Site → Unidad → Nodo → Palabra guía."""


from typing import Any, cast

from fastapi import APIRouter, Query
from pydantic import BaseModel
from sqlalchemy import func, select

from app.errors import no_encontrado
from app.models import Empresa, Nodo, PalabraGuia, Site, Unidad
from app.schemas import (
    EmpresaIn,
    EmpresaOut,
    NodoIn,
    NodoOut,
    Pagina,
    PalabraGuiaIn,
    PalabraGuiaOut,
    SiteIn,
    SiteOut,
    UnidadIn,
    UnidadOut,
)
from app.security import Admin, DbSession, Usuario_
from app.services.audit import registrar

router = APIRouter(tags=["Jerarquía"])


def _crud(path: str, modelo: Any, in_: type[BaseModel], out: type[BaseModel], padre: str | None, nombre: str) -> None:
    @router.get(f"/{path}", response_model=Pagina[out], name=f"listar_{path}")  # type: ignore[valid-type]
    def listar(
        db: DbSession,
        _: Usuario_,
        padre_id: int | None = Query(None, alias=padre) if padre else None,
        page: int = Query(1, ge=1),
        size: int = Query(100, ge=1, le=500),
    ) -> Any:
        stmt = select(modelo)
        if padre and padre_id:
            stmt = stmt.where(getattr(modelo, padre) == padre_id)
        total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
        items = db.scalars(stmt.order_by(modelo.id).offset((page - 1) * size).limit(size)).all()
        return {"items": items, "total": total, "page": page, "size": size}

    @router.post(f"/{path}", response_model=out, status_code=201, name=f"crear_{path}")
    def crear(datos: in_, db: DbSession, p: Admin) -> Any:  # type: ignore[valid-type]
        d = cast(BaseModel, datos).model_dump()
        obj = modelo(**d)
        db.add(obj)
        db.flush()
        registrar(db, p.username, f"CREAR_{nombre}", path, obj.id, despues=d)
        db.commit()
        return obj

    @router.get(f"/{path}/{{id_}}", response_model=out, name=f"obtener_{path}")
    def obtener(id_: int, db: DbSession, _: Usuario_) -> Any:
        obj = db.get(modelo, id_)
        if obj is None:
            raise no_encontrado(nombre, id_)
        return obj

    @router.put(f"/{path}/{{id_}}", response_model=out, name=f"actualizar_{path}")
    def actualizar(id_: int, datos: in_, db: DbSession, p: Admin) -> Any:  # type: ignore[valid-type]
        obj = db.get(modelo, id_)
        if obj is None:
            raise no_encontrado(nombre, id_)
        nuevos = cast(BaseModel, datos).model_dump()
        antes = {k: getattr(obj, k) for k in nuevos}
        for k, v in nuevos.items():
            setattr(obj, k, v)
        registrar(db, p.username, f"ACTUALIZAR_{nombre}", path, id_, antes=antes, despues=nuevos)
        db.commit()
        return obj

    @router.delete(f"/{path}/{{id_}}", status_code=204, name=f"eliminar_{path}")
    def eliminar(id_: int, db: DbSession, p: Admin) -> None:
        obj = db.get(modelo, id_)
        if obj is None:
            raise no_encontrado(nombre, id_)
        registrar(db, p.username, f"ELIMINAR_{nombre}", path, id_)
        db.delete(obj)
        db.commit()


_crud("empresas", Empresa, EmpresaIn, EmpresaOut, None, "EMPRESA")
_crud("sites", Site, SiteIn, SiteOut, "empresa_id", "SITE")
_crud("unidades", Unidad, UnidadIn, UnidadOut, "site_id", "UNIDAD")
_crud("nodos", Nodo, NodoIn, NodoOut, "unidad_id", "NODO")
_crud("palabras-guia", PalabraGuia, PalabraGuiaIn, PalabraGuiaOut, "nodo_id", "PALABRA_GUIA")
