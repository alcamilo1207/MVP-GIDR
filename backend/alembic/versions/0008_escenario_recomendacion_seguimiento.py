"""escenario: agregar campos de seguimiento de recomendacion (prioridad, responsable, estado, comentarios)

Revision ID: 0008
Revises: 0007
Create Date: 2026-11-05 01:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = '0008'
down_revision = '0007'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('escenario', sa.Column('rec_prioridad', sa.String(length=40), nullable=True, server_default='Medium'))
    op.add_column('escenario', sa.Column('rec_responsable', sa.String(length=120), nullable=True))
    op.add_column('escenario', sa.Column('rec_estado', sa.String(length=60), nullable=True, server_default='Proposed'))
    op.add_column('escenario', sa.Column('rec_comentarios', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('escenario', 'rec_comentarios')
    op.drop_column('escenario', 'rec_estado')
    op.drop_column('escenario', 'rec_responsable')
    op.drop_column('escenario', 'rec_prioridad')
