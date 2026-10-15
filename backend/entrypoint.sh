#!/bin/sh
set -e
echo "Aplicando migraciones..."
alembic upgrade head
# El seed de demo se ejecuta al arrancar la app si AUTO_SEED=true (idempotente).
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
