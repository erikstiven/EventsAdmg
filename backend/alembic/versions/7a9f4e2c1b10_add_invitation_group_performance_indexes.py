"""add invitation group performance indexes

Revision ID: 7a9f4e2c1b10
Revises: 5c9a2f8b1d4e
Create Date: 2026-02-25 14:20:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "7a9f4e2c1b10"
down_revision: Union[str, Sequence[str], None] = "5c9a2f8b1d4e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_table(table_name: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    return table_name in inspector.get_table_names()


def _has_index(table_name: str, index_name: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    indexes = inspector.get_indexes(table_name)
    return any(idx.get("name") == index_name for idx in indexes)


def _create_index_if_missing(index_name: str, table_name: str, columns: list[str], *, unique: bool = False) -> None:
    if _has_table(table_name) and not _has_index(table_name, index_name):
        op.create_index(index_name, table_name, columns, unique=unique)


def _drop_index_if_exists(index_name: str, table_name: str) -> None:
    if _has_table(table_name) and _has_index(table_name, index_name):
        op.drop_index(index_name, table_name=table_name)


def upgrade() -> None:
    _create_index_if_missing("ix_invitation_groups_event_id", "invitation_groups", ["event_id"])
    _create_index_if_missing("ix_invitation_groups_status_id", "invitation_groups", ["status_id"])
    _create_index_if_missing("ix_invitation_groups_token_plain", "invitation_groups", ["token_plain"])
    _create_index_if_missing(
        "ix_invitation_groups_event_status",
        "invitation_groups",
        ["event_id", "status_id"],
    )

    _create_index_if_missing("ix_invitation_group_people_cedula", "invitation_group_people", ["cedula"])
    _create_index_if_missing("ix_invitation_group_people_qr_token", "invitation_group_people", ["qr_token"])

    _create_index_if_missing(
        "ix_inv_group_status_history_changed_at",
        "invitation_group_status_history",
        ["changed_at"],
    )
    _create_index_if_missing(
        "ix_inv_group_status_history_to_status_id",
        "invitation_group_status_history",
        ["to_status_id"],
    )


def downgrade() -> None:
    _drop_index_if_exists("ix_inv_group_status_history_to_status_id", "invitation_group_status_history")
    _drop_index_if_exists("ix_inv_group_status_history_changed_at", "invitation_group_status_history")

    _drop_index_if_exists("ix_invitation_group_people_qr_token", "invitation_group_people")
    _drop_index_if_exists("ix_invitation_group_people_cedula", "invitation_group_people")

    _drop_index_if_exists("ix_invitation_groups_event_status", "invitation_groups")
    _drop_index_if_exists("ix_invitation_groups_token_plain", "invitation_groups")
    _drop_index_if_exists("ix_invitation_groups_status_id", "invitation_groups")
    _drop_index_if_exists("ix_invitation_groups_event_id", "invitation_groups")
