"""permitir multiples consecuencias por desviacion

Revision ID: 0004
Revises: 0003
Create Date: 2026-11-02 18:48:00.000000
"""
from alembic import op

revision = '0004'
down_revision = '0003'
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table('escenario', schema=None) as batch_op:
        batch_op.drop_constraint('uq_escenario_palabra_guia_id', type_='unique')
        batch_op.create_unique_constraint(
            'uq_escenario_palabra_guia_id',
            ['palabra_guia_id', 'consecuencia', 'causa'],
        )


def downgrade() -> None:
    with op.batch_alter_table('escenario', schema=None) as batch_op:
        batch_op.drop_constraint('uq_escenario_palabra_guia_id', type_='unique')
        batch_op.create_unique_constraint(
            'uq_escenario_palabra_guia_id',
            ['palabra_guia_id', 'causa'],
        )
