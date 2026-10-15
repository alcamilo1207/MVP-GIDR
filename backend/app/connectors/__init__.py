from app.connectors.base import BaseConnector, EventoEstado
from app.connectors.cmms_sim import CmmsSimuladoConnector
from app.connectors.stubs import IowConnector, LmsConnector, RondasConnector, SapPmConnector

#: Registro de conectores; añadir uno nuevo = una línea aquí.
REGISTRO: dict[str, type[BaseConnector]] = {
    cls.nombre: cls
    for cls in (CmmsSimuladoConnector, RondasConnector, IowConnector, LmsConnector, SapPmConnector)
}

__all__ = ["REGISTRO", "BaseConnector", "CmmsSimuladoConnector", "EventoEstado"]
