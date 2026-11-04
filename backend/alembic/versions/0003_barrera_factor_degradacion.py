"""barrera factor degradacion

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-02 18:04:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = '0003'
down_revision = '0002'
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table('barrera', schema=None) as batch_op:
        batch_op.add_column(sa.Column('factor_degradacion', sa.Integer(), server_default='90', nullable=False))
        batch_op.create_check_constraint('factor_degradacion', 'factor_degradacion BETWEEN 1 AND 100')


def downgrade() -> None:
    with op.batch_alter_table('barrera', schema=None) as batch_op:
        batch_op.drop_constraint('ck_barrera_factor_degradacion', type_='check')
        batch_op.drop_column('factor_degradacion')
