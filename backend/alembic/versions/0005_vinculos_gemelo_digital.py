"""vinculos dinamicos gemelo digital

Revision ID: 0005
Revises: 0004
Create Date: 2026-11-03 00:57:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = '0005'
down_revision = '0004'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'vinculo_gemelo',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('barrera_id', sa.Integer(), nullable=False),
        sa.Column('sistema_fuente', sa.String(length=40), nullable=False),
        sa.Column('tag_gemelo', sa.String(length=150), nullable=False),
        sa.Column('descripcion', sa.Text(), nullable=False),
        sa.Column('tipo_evaluacion', sa.String(length=30), nullable=False),
        sa.Column('unidad_ing', sa.String(length=30), nullable=True),
        sa.Column('umbral_alerta', sa.Float(), nullable=True),
        sa.Column('umbral_critico', sa.Float(), nullable=True),
        sa.Column('ultimo_valor', sa.Float(), nullable=True),
        sa.Column('ultimo_estado_evaluado', sa.String(length=20), nullable=True),
        sa.Column('ultima_actualizacion', sa.DateTime(timezone=True), nullable=True),
        sa.Column('activo', sa.Boolean(), server_default='1', nullable=False),
        sa.CheckConstraint(
            "sistema_fuente IN ('DCS_SCADA','SIS','HISTORIADOR_IOW','CMMS','GEMELO_DIGITAL')",
            name=op.f('ck_vinculo_gemelo_sistema_fuente'),
        ),
        sa.CheckConstraint(
            "tipo_evaluacion IN ('ESTADO_DISCRETO','SALUD_DEGRADACION','UMBRAL_IOW')",
            name=op.f('ck_vinculo_gemelo_tipo_evaluacion'),
        ),
        sa.ForeignKeyConstraint(
            ['barrera_id'],
            ['barrera.id'],
            name=op.f('fk_vinculo_gemelo_barrera_id_barrera'),
            ondelete='CASCADE',
        ),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_vinculo_gemelo')),
        sa.UniqueConstraint('tag_gemelo', name=op.f('uq_vinculo_gemelo_tag_gemelo')),
    )
    with op.batch_alter_table('vinculo_gemelo', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_vinculo_gemelo_barrera_id'), ['barrera_id'], unique=False)


def downgrade() -> None:
    op.drop_table('vinculo_gemelo')
