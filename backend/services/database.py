import logging
import time
import json
from datetime import datetime, timezone

from core.database import db_manager
from sqlalchemy import text
from sqlalchemy import select
from models.invitation_groups import Invitation_groups
from models.invitation_group_people import Invitation_group_people
from models.invitation_group_status_catalog import Invitation_group_status_catalog
from models.invitation_group_status_history import Invitation_group_status_history
from models.invitation_group_statuses import (
    INVITATION_GROUP_STATUS_CATALOG,
    invitation_group_status_id_from_label,
    invitation_group_status_label_from_id,
    normalize_invitation_group_status,
)
from models.rbac import Permission, Role, RolePermission
from models.user_roles import User_roles
from services.rbac import DEFAULT_PERMISSIONS, DEFAULT_ROLE_PERMISSIONS, DEFAULT_ROLES
from services.rbac import normalize_role_code

logger = logging.getLogger(__name__)


async def check_database_health() -> bool:
    """Check if database is healthy"""
    start_time = time.time()
    logger.debug("[DB_OP] Starting database health check")
    try:
        if not db_manager.async_session_maker:
            return False

        async with db_manager.async_session_maker() as session:
            await session.execute(text("SELECT 1"))
            logger.debug(f"[DB_OP] Database health check completed in {time.time() - start_time:.4f}s - healthy: True")
            return True
    except Exception as e:
        logger.error(f"Database health check failed: {e}")
        logger.debug(f"[DB_OP] Database health check failed in {time.time() - start_time:.4f}s - healthy: False")
        return False


async def initialize_database():
    """Initialize database and create tables"""
    start_time = time.time()
    logger.debug("[DB_OP] Starting database initialization")
    try:
        # Ensure model modules are loaded before create_all.
        import models  # noqa: F401

        logger.info("[DB] Starting database initialization...")
        await db_manager.init_db()
        logger.info("[DB] Database connection initialized, now creating tables if tables not exist...")
        await db_manager.create_tables()
        await seed_invitation_group_status_catalog()
        await ensure_invitation_group_status_id_columns()
        await ensure_checkins_tracking_columns()
        await ensure_performance_indexes()
        await seed_rbac_catalog()
        await ensure_users_role_id_column()
        await ensure_users_superuser_column()
        await ensure_user_roles_columns()
        await normalize_users_role_codes()
        await sync_users_role_id_fk()
        await sync_user_role_assignments()
        await migrate_invitation_group_status_to_ids()
        await migrate_legacy_companions_json_to_rows()
        logger.info("[DB] Table creation completed")
        logger.info("Database initialized successfully")
        logger.debug(f"[DB_OP] Database initialization completed in {time.time() - start_time:.4f}s")
    except Exception as e:
        logger.error(f"Failed to initialize database: {e}")
        raise


async def close_database():
    """Close database connections"""
    start_time = time.time()
    logger.debug("[DB_OP] Starting database close")
    try:
        await db_manager.close_db()
        logger.info("Database connections closed")
        logger.debug(f"[DB_OP] Database close completed in {time.time() - start_time:.4f}s")
    except Exception as e:
        logger.error(f"Error closing database: {e}")
        logger.debug(f"[DB_OP] Database close failed in {time.time() - start_time:.4f}s")


async def migrate_invitation_group_status_to_ids():
    """Normalize legacy status text values and move them to status_id columns."""
    if not db_manager.async_session_maker:
        return
    try:
        async with db_manager.async_session_maker() as session:
            groups_result = await session.execute(select(Invitation_groups))
            groups = groups_result.scalars().all()
            history_result = await session.execute(select(Invitation_group_status_history))
            history_rows = history_result.scalars().all()
            changed = 0
            for row in groups:
                try:
                    canonical = normalize_invitation_group_status(row.status, default="Pendiente completar")
                except ValueError:
                    canonical = "Pendiente completar"
                status_id = invitation_group_status_id_from_label(canonical, default="Pendiente completar")
                if row.status_id != status_id or row.status != canonical:
                    row.status_id = status_id
                    row.status = canonical
                    changed += 1
            for row in history_rows:
                changed_local = False
                if row.from_status:
                    try:
                        from_label = normalize_invitation_group_status(row.from_status, default="Pendiente completar")
                    except ValueError:
                        from_label = "Pendiente completar"
                    from_id = invitation_group_status_id_from_label(from_label, default="Pendiente completar")
                    if row.from_status_id != from_id:
                        row.from_status_id = from_id
                        changed_local = True
                    if row.from_status != from_label:
                        row.from_status = from_label
                        changed_local = True
                if row.to_status:
                    try:
                        to_label = normalize_invitation_group_status(row.to_status, default="Pendiente completar")
                    except ValueError:
                        to_label = "Pendiente completar"
                    to_id = invitation_group_status_id_from_label(to_label, default="Pendiente completar")
                    if row.to_status_id != to_id:
                        row.to_status_id = to_id
                        changed_local = True
                    if row.to_status != to_label:
                        row.to_status = to_label
                        changed_local = True
                elif row.to_status_id:
                    row.to_status = invitation_group_status_label_from_id(
                        row.to_status_id, default="Pendiente completar"
                    )
                    changed_local = True
                if changed_local:
                    changed += 1
            if changed:
                await session.commit()
                logger.info("[DB] Invitation group status migrated to status_id for %s rows", changed)
    except Exception as exc:
        logger.warning("[DB] Could not migrate invitation group statuses to IDs: %s", exc)


async def seed_invitation_group_status_catalog():
    """Create/update fixed invitation-group status catalog rows."""
    if not db_manager.async_session_maker:
        return
    try:
        async with db_manager.async_session_maker() as session:
            result = await session.execute(select(Invitation_group_status_catalog))
            existing = result.scalars().all()
            by_code = {row.code: row for row in existing}
            changed = False
            for item in INVITATION_GROUP_STATUS_CATALOG:
                row_id = item["id"]
                code = item["code"]
                label = item["label"]
                row = by_code.get(code)
                if not row:
                    session.add(Invitation_group_status_catalog(id=row_id, code=code, label=label))
                    changed = True
                    continue
                if row.label != label:
                    row.label = label
                    changed = True
            if changed:
                await session.commit()
                logger.info("[DB] Invitation group status catalog seeded/updated")
    except Exception as exc:
        logger.warning("[DB] Could not seed invitation group status catalog: %s", exc)


async def ensure_invitation_group_status_id_columns():
    """Best-effort schema patch to add status_id columns if they are missing."""
    if not db_manager.async_session_maker or not db_manager.engine:
        return
    dialect = db_manager.engine.dialect.name
    try:
        async with db_manager.async_session_maker() as session:
            if dialect == "sqlite":
                await session.execute(
                    text(
                        "ALTER TABLE invitation_groups ADD COLUMN status_id INTEGER"
                    )
                )
            elif dialect == "postgresql":
                await session.execute(
                    text(
                        "ALTER TABLE invitation_groups ADD COLUMN IF NOT EXISTS status_id INTEGER"
                    )
                )
            await session.commit()
    except Exception:
        pass

    try:
        async with db_manager.async_session_maker() as session:
            if dialect == "sqlite":
                await session.execute(
                    text(
                        "ALTER TABLE invitation_group_status_history ADD COLUMN from_status_id INTEGER"
                    )
                )
            elif dialect == "postgresql":
                await session.execute(
                    text(
                        "ALTER TABLE invitation_group_status_history ADD COLUMN IF NOT EXISTS from_status_id INTEGER"
                    )
                )
            await session.commit()
    except Exception:
        pass

    try:
        async with db_manager.async_session_maker() as session:
            if dialect == "sqlite":
                await session.execute(
                    text(
                        "ALTER TABLE invitation_group_status_history ADD COLUMN to_status_id INTEGER"
                    )
                )
            elif dialect == "postgresql":
                await session.execute(
                    text(
                        "ALTER TABLE invitation_group_status_history ADD COLUMN IF NOT EXISTS to_status_id INTEGER"
                    )
                )
            await session.commit()
    except Exception:
        pass


async def migrate_legacy_companions_json_to_rows():
    """One-way migration of legacy invitation_groups.companions JSON into invitation_group_people rows."""
    if not db_manager.async_session_maker:
        return
    try:
        async with db_manager.async_session_maker() as session:
            result = await session.execute(select(Invitation_groups))
            groups = result.scalars().all()
            migrated = 0
            for group in groups:
                existing = await session.execute(
                    select(Invitation_group_people.id).where(
                        Invitation_group_people.invitation_group_id == group.id
                    )
                )
                if existing.first():
                    continue
                if not group.companions:
                    continue
                try:
                    companions = json.loads(group.companions)
                except Exception:
                    continue
                if not isinstance(companions, list) or not companions:
                    continue
                now = datetime.now(timezone.utc)
                for idx, comp in enumerate(companions):
                    if not isinstance(comp, dict):
                        continue
                    qr_sent_at = None
                    if comp.get("qr_sent_at"):
                        try:
                            qr_sent_at = datetime.fromisoformat(comp["qr_sent_at"])
                        except Exception:
                            qr_sent_at = None
                    session.add(
                        Invitation_group_people(
                            invitation_group_id=group.id,
                            person_index=idx,
                            name=comp.get("name"),
                            cedula=comp.get("cedula"),
                            email=comp.get("email"),
                            telefono=comp.get("telefono"),
                            codigo=comp.get("codigo"),
                            selfie_url=comp.get("selfie_url"),
                            doc_url=comp.get("doc_url"),
                            approved=comp.get("approved"),
                            rejection_reason=comp.get("rejection_reason"),
                            qr_token=comp.get("qr_token"),
                            qr_sent_at=qr_sent_at,
                            created_at=now,
                            updated_at=now,
                        )
                    )
                migrated += 1
            if migrated:
                await session.commit()
                logger.info("[DB] Migrated companions JSON for %s invitation groups", migrated)
    except Exception as exc:
        logger.warning("[DB] Could not migrate legacy companions JSON: %s", exc)


async def ensure_checkins_tracking_columns():
    """Best-effort schema patch for checkins traceability columns."""
    if not db_manager.async_session_maker or not db_manager.engine:
        return
    dialect = db_manager.engine.dialect.name

    async def _add_column(column_sql_sqlite: str, column_sql_pg: str):
        try:
            async with db_manager.async_session_maker() as session:
                if dialect == "sqlite":
                    await session.execute(text(column_sql_sqlite))
                elif dialect == "postgresql":
                    await session.execute(text(column_sql_pg))
                await session.commit()
        except Exception:
            # Column may already exist.
            pass

    await _add_column(
        "ALTER TABLE checkins ADD COLUMN attendee_id INTEGER",
        "ALTER TABLE checkins ADD COLUMN IF NOT EXISTS attendee_id INTEGER",
    )
    await _add_column(
        "ALTER TABLE checkins ADD COLUMN invitation_group_person_id INTEGER",
        "ALTER TABLE checkins ADD COLUMN IF NOT EXISTS invitation_group_person_id INTEGER",
    )
    await _add_column(
        "ALTER TABLE checkins ADD COLUMN participant_role VARCHAR",
        "ALTER TABLE checkins ADD COLUMN IF NOT EXISTS participant_role VARCHAR",
    )
    await _add_column(
        "ALTER TABLE checkins ADD COLUMN qr_token_used VARCHAR",
        "ALTER TABLE checkins ADD COLUMN IF NOT EXISTS qr_token_used VARCHAR",
    )


async def ensure_performance_indexes():
    """Create practical indexes for lookup-heavy flows."""
    if not db_manager.async_session_maker:
        return
    statements = [
        # Invitation groups and statuses
        "CREATE INDEX IF NOT EXISTS idx_inv_groups_event_status_created ON invitation_groups(event_id, status_id, created_at)",
        "CREATE INDEX IF NOT EXISTS idx_inv_groups_token_plain ON invitation_groups(token_plain)",
        "CREATE UNIQUE INDEX IF NOT EXISTS ux_inv_groups_titular_qr_token ON invitation_groups(titular_qr_token) WHERE titular_qr_token IS NOT NULL",
        # Group people
        "CREATE INDEX IF NOT EXISTS idx_inv_group_people_group_approved ON invitation_group_people(invitation_group_id, approved)",
        "CREATE INDEX IF NOT EXISTS idx_inv_group_people_group_index ON invitation_group_people(invitation_group_id, person_index)",
        "CREATE INDEX IF NOT EXISTS idx_inv_group_people_cedula ON invitation_group_people(cedula)",
        "CREATE UNIQUE INDEX IF NOT EXISTS ux_inv_group_people_qr_token ON invitation_group_people(qr_token) WHERE qr_token IS NOT NULL",
        # Status history
        "CREATE INDEX IF NOT EXISTS idx_inv_group_status_hist_group_changed ON invitation_group_status_history(invitation_group_id, changed_at)",
        "CREATE INDEX IF NOT EXISTS idx_inv_group_status_hist_to_status ON invitation_group_status_history(to_status_id)",
        # Check-ins
        "CREATE INDEX IF NOT EXISTS idx_checkins_event_time ON checkins(event_id, checked_in_at)",
        "CREATE INDEX IF NOT EXISTS idx_checkins_invitation ON checkins(invitation_id)",
        "CREATE INDEX IF NOT EXISTS idx_checkins_attendee ON checkins(attendee_id)",
        "CREATE INDEX IF NOT EXISTS idx_checkins_group_person ON checkins(invitation_group_person_id)",
        "CREATE INDEX IF NOT EXISTS idx_checkins_qr_token_used ON checkins(qr_token_used)",
        # Invitation state machine / audit
        "CREATE INDEX IF NOT EXISTS idx_invitations_status_updated ON invitations(status, updated_at)",
        "CREATE INDEX IF NOT EXISTS idx_invitations_revoked_at ON invitations(revoked_at)",
        "CREATE INDEX IF NOT EXISTS idx_invitation_status_hist_invitation_changed ON invitation_status_history(invitation_id, changed_at)",
        # Biometric shadow mode
        "CREATE INDEX IF NOT EXISTS idx_biometric_embeddings_person_active ON biometric_embeddings(person_id, is_active)",
        "CREATE INDEX IF NOT EXISTS idx_biometric_attempts_person_created ON biometric_attempts(person_id, created_at)",
        "CREATE INDEX IF NOT EXISTS idx_biometric_attempts_result_created ON biometric_attempts(result, created_at)",
    ]
    try:
        async with db_manager.async_session_maker() as session:
            for sql in statements:
                try:
                    await session.execute(text(sql))
                except Exception:
                    # Ignore index creation errors to avoid blocking startup.
                    pass
            await session.commit()
    except Exception as exc:
        logger.warning("[DB] Could not ensure performance indexes: %s", exc)


async def seed_rbac_catalog():
    """Create/update fixed RBAC roles, permissions and assignments."""
    if not db_manager.async_session_maker:
        return

    try:
        async with db_manager.async_session_maker() as session:
            role_result = await session.execute(select(Role))
            existing_roles = {r.code: r for r in role_result.scalars().all()}
            perm_result = await session.execute(select(Permission))
            existing_perms = {p.code: p for p in perm_result.scalars().all()}
            changed = False

            for code, name in DEFAULT_ROLES:
                role = existing_roles.get(code)
                if not role:
                    role = Role(code=code, name=name, is_active=True)
                    session.add(role)
                    existing_roles[code] = role
                    changed = True
                else:
                    if role.name != name:
                        role.name = name
                        changed = True
                    if not role.is_active:
                        role.is_active = True
                        changed = True

            for item in DEFAULT_PERMISSIONS:
                perm = existing_perms.get(item.code)
                if not perm:
                    perm = Permission(code=item.code, name=item.name, module=item.module, is_active=True)
                    session.add(perm)
                    existing_perms[item.code] = perm
                    changed = True
                else:
                    if perm.name != item.name:
                        perm.name = item.name
                        changed = True
                    if perm.module != item.module:
                        perm.module = item.module
                        changed = True
                    if not perm.is_active:
                        perm.is_active = True
                        changed = True

            default_codes = {item.code for item in DEFAULT_PERMISSIONS}
            for code, perm in existing_perms.items():
                if code not in default_codes and perm.is_active:
                    perm.is_active = False
                    changed = True

            if changed:
                await session.flush()

            links_result = await session.execute(select(RolePermission))
            existing_links = {(link.role_id, link.permission_id) for link in links_result.scalars().all()}
            links_added = 0
            # Respect manual RBAC edits. Seed default links only on first bootstrap.
            if not existing_links:
                for role_code, perm_codes in DEFAULT_ROLE_PERMISSIONS.items():
                    role = existing_roles.get(role_code)
                    if not role:
                        continue
                    for perm_code in perm_codes:
                        perm = existing_perms.get(perm_code)
                        if not perm:
                            continue
                        key = (role.id, perm.id)
                        if key in existing_links:
                            continue
                        session.add(RolePermission(role_id=role.id, permission_id=perm.id))
                        existing_links.add(key)
                        links_added += 1

            if changed or links_added:
                await session.commit()
                logger.info("[DB] RBAC catalog seeded/updated (roles/perms changes=%s, links added=%s)", changed, links_added)
    except Exception as exc:
        logger.warning("[DB] Could not seed RBAC catalog: %s", exc)


async def normalize_users_role_codes():
    """Normalize legacy user role values to canonical role codes."""
    if not db_manager.async_session_maker:
        return
    try:
        from models.auth import User

        async with db_manager.async_session_maker() as session:
            result = await session.execute(select(User))
            users = result.scalars().all()
            changed = 0
            for user in users:
                normalized = normalize_role_code(user.role)
                if normalized and normalized != user.role:
                    user.role = normalized
                    changed += 1
            if changed:
                await session.commit()
                logger.info("[DB] Normalized user role codes for %s users", changed)
    except Exception as exc:
        logger.warning("[DB] Could not normalize user role codes: %s", exc)


async def ensure_users_role_id_column():
    """Best-effort schema patch to add users.role_id column if missing."""
    if not db_manager.async_session_maker or not db_manager.engine:
        return
    dialect = db_manager.engine.dialect.name
    try:
        async with db_manager.async_session_maker() as session:
            if dialect == "sqlite":
                await session.execute(text("ALTER TABLE users ADD COLUMN role_id INTEGER"))
            elif dialect == "postgresql":
                await session.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS role_id INTEGER"))
            await session.commit()
    except Exception:
        pass


async def ensure_users_superuser_column():
    """Best-effort schema patch to add users.is_superuser column if missing."""
    if not db_manager.async_session_maker or not db_manager.engine:
        return
    dialect = db_manager.engine.dialect.name
    try:
        async with db_manager.async_session_maker() as session:
            if dialect == "sqlite":
                await session.execute(text("ALTER TABLE users ADD COLUMN is_superuser BOOLEAN DEFAULT 0"))
            elif dialect == "postgresql":
                await session.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_superuser BOOLEAN DEFAULT FALSE"))
            await session.commit()
    except Exception:
        pass


async def ensure_user_roles_columns():
    """Best-effort schema patch for user_roles table to support N:N assignments by role_id."""
    if not db_manager.async_session_maker or not db_manager.engine:
        return
    dialect = db_manager.engine.dialect.name

    async def _add_column(sqlite_sql: str, postgres_sql: str):
        try:
            async with db_manager.async_session_maker() as session:
                if dialect == "sqlite":
                    await session.execute(text(sqlite_sql))
                elif dialect == "postgresql":
                    await session.execute(text(postgres_sql))
                await session.commit()
        except Exception:
            pass

    await _add_column(
        "ALTER TABLE user_roles ADD COLUMN role_id INTEGER",
        "ALTER TABLE user_roles ADD COLUMN IF NOT EXISTS role_id INTEGER",
    )
    await _add_column(
        "ALTER TABLE user_roles ADD COLUMN is_active BOOLEAN DEFAULT 1",
        "ALTER TABLE user_roles ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE",
    )
    await _add_column(
        "ALTER TABLE user_roles ADD COLUMN assigned_by VARCHAR",
        "ALTER TABLE user_roles ADD COLUMN IF NOT EXISTS assigned_by VARCHAR",
    )
    await _add_column(
        "ALTER TABLE user_roles ADD COLUMN expires_at TIMESTAMP",
        "ALTER TABLE user_roles ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP",
    )
    try:
        async with db_manager.async_session_maker() as session:
            await session.execute(text("CREATE INDEX IF NOT EXISTS idx_user_roles_user_active ON user_roles(user_id, is_active)"))
            await session.execute(text("CREATE INDEX IF NOT EXISTS idx_user_roles_role_active ON user_roles(role_id, is_active)"))
            await session.commit()
    except Exception:
        pass

    try:
        async with db_manager.async_session_maker() as session:
            await session.execute(text("CREATE INDEX IF NOT EXISTS idx_users_role_id ON users(role_id)"))
            await session.commit()
    except Exception:
        pass


async def sync_users_role_id_fk():
    """Sync users.role_id based on users.role text and role catalog."""
    if not db_manager.async_session_maker:
        return

    try:
        from models.auth import User

        async with db_manager.async_session_maker() as session:
            roles_result = await session.execute(select(Role))
            roles = roles_result.scalars().all()
            role_id_by_code = {r.code: r.id for r in roles}

            users_result = await session.execute(select(User))
            users = users_result.scalars().all()

            changed = 0
            for user in users:
                normalized = normalize_role_code(user.role) or "ASISTENTE"
                desired_role_id = role_id_by_code.get(normalized)
                if user.role != normalized:
                    user.role = normalized
                    changed += 1
                if desired_role_id and user.role_id != desired_role_id:
                    user.role_id = desired_role_id
                    changed += 1

            if changed:
                await session.commit()
                logger.info("[DB] Synced users.role_id for %s updates", changed)
    except Exception as exc:
        logger.warning("[DB] Could not sync users.role_id: %s", exc)


async def sync_user_role_assignments():
    """Create/update user_roles assignments from users.role_id / users.role legacy values."""
    if not db_manager.async_session_maker:
        return
    try:
        from models.auth import User

        async with db_manager.async_session_maker() as session:
            roles_result = await session.execute(select(Role))
            roles = roles_result.scalars().all()
            role_id_by_code = {r.code: r.id for r in roles}

            users_result = await session.execute(select(User))
            users = users_result.scalars().all()

            existing_result = await session.execute(select(User_roles))
            existing_rows = existing_result.scalars().all()
            existing_keys = {(row.user_id, row.role_id) for row in existing_rows if row.role_id}

            changes = 0
            for user in users:
                normalized = normalize_role_code(user.role) or "ASISTENTE"
                role_id = user.role_id or role_id_by_code.get(normalized)
                if not role_id:
                    continue
                if normalized == "ADMIN" and getattr(user, "is_superuser", False) is not True:
                    user.is_superuser = True
                    changes += 1
                if (user.id, role_id) in existing_keys:
                    continue
                session.add(
                    User_roles(
                        user_id=user.id,
                        role=normalized,
                        role_id=role_id,
                        is_active=True,
                    )
                )
                existing_keys.add((user.id, role_id))
                changes += 1

            if changes:
                await session.commit()
                logger.info("[DB] Synced user_roles assignments, updates=%s", changes)
    except Exception as exc:
        logger.warning("[DB] Could not sync user_roles assignments: %s", exc)
