"""harden invitation state machine and audit history

Revision ID: 5c9a2f8b1d4e
Revises: 2b5c6a7f8e9d
Create Date: 2026-02-23 11:10:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "5c9a2f8b1d4e"
down_revision: Union[str, Sequence[str], None] = "2b5c6a7f8e9d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_column(table_name: str, column_name: str) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = inspector.get_columns(table_name)
    return any(col.get("name") == column_name for col in columns)


def _has_table(table_name: str) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return table_name in inspector.get_table_names()


def upgrade() -> None:
    if not _has_column("invitations", "approved_by"):
        op.add_column("invitations", sa.Column("approved_by", sa.String(), nullable=True))
    if not _has_column("invitations", "rejection_reason"):
        op.add_column("invitations", sa.Column("rejection_reason", sa.String(), nullable=True))
    if not _has_column("invitations", "revoked_at"):
        op.add_column("invitations", sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True))
    if not _has_column("invitations", "revoked_by"):
        op.add_column("invitations", sa.Column("revoked_by", sa.String(), nullable=True))

    if not _has_table("invitation_status_history"):
        op.create_table(
            "invitation_status_history",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("invitation_id", sa.Integer(), nullable=False),
            sa.Column("from_status", sa.String(), nullable=True),
            sa.Column("to_status", sa.String(), nullable=False),
            sa.Column("changed_by", sa.String(), nullable=False),
            sa.Column("changed_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("reason", sa.Text(), nullable=True),
            sa.Column("endpoint", sa.String(), nullable=True),
            sa.Column("request_id", sa.String(), nullable=True),
            sa.ForeignKeyConstraint(["invitation_id"], ["invitations.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_invitation_status_history_id", "invitation_status_history", ["id"], unique=False)
        op.create_index(
            "ix_invitation_status_history_invitation_id",
            "invitation_status_history",
            ["invitation_id"],
            unique=False,
        )


def downgrade() -> None:
    if _has_table("invitation_status_history"):
        op.drop_index("ix_invitation_status_history_invitation_id", table_name="invitation_status_history")
        op.drop_index("ix_invitation_status_history_id", table_name="invitation_status_history")
        op.drop_table("invitation_status_history")

    if _has_column("invitations", "revoked_by"):
        op.drop_column("invitations", "revoked_by")
    if _has_column("invitations", "revoked_at"):
        op.drop_column("invitations", "revoked_at")
    if _has_column("invitations", "rejection_reason"):
        op.drop_column("invitations", "rejection_reason")
    if _has_column("invitations", "approved_by"):
        op.drop_column("invitations", "approved_by")
