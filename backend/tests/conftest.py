import os
import tempfile

_dir = tempfile.mkdtemp(prefix="gidr_test_")
os.environ["DATABASE_URL"] = f"sqlite:///{_dir}/test.db"
os.environ["AUTO_SEED"] = "false"
os.environ["MINUTOS_CHEQUEO_TEMPORALES"] = "0"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.db import SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Base  # noqa: E402
from app.seed import sembrar  # noqa: E402


@pytest.fixture()
def db():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    with SessionLocal() as s:
        sembrar(s)
        yield s


@pytest.fixture()
def client(db):
    with TestClient(app) as c:
        yield c


def _login(client: TestClient, user: str, pw: str) -> dict[str, str]:
    r = client.post("/auth/login", json={"username": user, "password": pw})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture()
def admin(client):
    return _login(client, "admin", "admin123")


@pytest.fixture()
def lector(client):
    return _login(client, "lector", "lector123")
