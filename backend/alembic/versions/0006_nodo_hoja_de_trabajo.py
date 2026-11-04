"""nodo: campos de hoja de trabajo (condiciones, sesion, planos, comentarios)

Revision ID: 0006
Revises: 0005
Create Date: 2026-11-04 12:20:00.000000
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '0006'
down_revision = '0005'
branch_labels = None
depends_on = None


def upgrade() -> None:
    json_type = sa.JSON().with_variant(postgresql.JSONB(), 'postgresql')
    op.add_column('nodo', sa.Column('condiciones_diseno', sa.Text(), nullable=True))
    op.add_column('nodo', sa.Column('condiciones_operacion', sa.Text(), nullable=True))
    op.add_column('nodo', sa.Column('color', sa.String(length=40), nullable=True))
    op.add_column('nodo', sa.Column('sesion', sa.String(length=80), nullable=True))
    op.add_column('nodo', sa.Column('planos', json_type, nullable=True))
    op.add_column('nodo', sa.Column('comentarios', sa.Text(), nullable=True))


def downgrade() -> None:
    for col in ('comentarios', 'planos', 'sesion', 'color', 'condiciones_operacion', 'condiciones_diseno'):
        op.drop_column('nodo', col)
