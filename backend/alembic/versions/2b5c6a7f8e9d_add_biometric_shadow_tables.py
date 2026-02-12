"""add biometric shadow tables

Revision ID: 2b5c6a7f8e9d
Revises: 99637cd38140
Create Date: 2026-02-12 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "2b5c6a7f8e9d"
down_revision: Union[str, Sequence[str], None] = "99637cd38140"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "biometric_embeddings",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("person_id", sa.Integer(), nullable=False),
        sa.Column("embedding", sa.Text(), nullable=False),
        sa.Column("model_version", sa.String(length=120), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("invalidated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["person_id"], ["attendees.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_biometric_embeddings_id", "biometric_embeddings", ["id"], unique=False)
    op.create_index("ix_biometric_embeddings_person_id", "biometric_embeddings", ["person_id"], unique=False)
    op.create_index("ix_biometric_embeddings_is_active", "biometric_embeddings", ["is_active"], unique=False)

    op.create_table(
        "biometric_attempts",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("person_id", sa.Integer(), nullable=False),
        sa.Column("match_score", sa.Float(), nullable=True),
        sa.Column("result", sa.String(length=32), nullable=False),
        sa.Column("model_version", sa.String(length=120), nullable=False),
        sa.Column("device_info", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["person_id"], ["attendees.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_biometric_attempts_id", "biometric_attempts", ["id"], unique=False)
    op.create_index("ix_biometric_attempts_person_id", "biometric_attempts", ["person_id"], unique=False)
    op.create_index("ix_biometric_attempts_result", "biometric_attempts", ["result"], unique=False)
    op.create_index("ix_biometric_attempts_created_at", "biometric_attempts", ["created_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_biometric_attempts_created_at", table_name="biometric_attempts")
    op.drop_index("ix_biometric_attempts_result", table_name="biometric_attempts")
    op.drop_index("ix_biometric_attempts_person_id", table_name="biometric_attempts")
    op.drop_index("ix_biometric_attempts_id", table_name="biometric_attempts")
    op.drop_table("biometric_attempts")

    op.drop_index("ix_biometric_embeddings_is_active", table_name="biometric_embeddings")
    op.drop_index("ix_biometric_embeddings_person_id", table_name="biometric_embeddings")
    op.drop_index("ix_biometric_embeddings_id", table_name="biometric_embeddings")
    op.drop_table("biometric_embeddings")
