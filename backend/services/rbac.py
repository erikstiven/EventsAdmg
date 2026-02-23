from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Optional, Tuple

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from models.rbac import Permission, Role, RolePermission
from models.user_roles import User_roles


def normalize_role_code(role: Optional[str]) -> str:
    value = (role or "").strip().upper()
    aliases = {
        "APPROVER": "APROBADOR",
        "ATTENDEE": "ASISTENTE",
        "USER": "ASISTENTE",
    }
    return aliases.get(value, value)


@dataclass(frozen=True)
class PermissionDef:
    code: str
    name: str
    module: str


DEFAULT_PERMISSIONS: tuple[PermissionDef, ...] = (
    PermissionDef("events.read", "Ver eventos", "EVENTS"),
    PermissionDef("events.create", "Crear eventos", "EVENTS"),
    PermissionDef("events.update", "Editar eventos", "EVENTS"),
    PermissionDef("events.delete", "Eliminar eventos", "EVENTS"),
    PermissionDef("invitations.read", "Ver invitaciones", "INVITATIONS"),
    PermissionDef("invitations.create", "Crear invitaciones", "INVITATIONS"),
    PermissionDef("invitations.update", "Editar invitaciones", "INVITATIONS"),
    PermissionDef("invitations.delete", "Eliminar invitaciones", "INVITATIONS"),
    PermissionDef("invitations.resend", "Reenviar invitaciones", "INVITATIONS"),
    PermissionDef("invitations.reopen_validation", "Reabrir validación", "INVITATIONS"),
    PermissionDef("approvals.read", "Ver solicitudes de aprobación", "APPROVALS"),
    PermissionDef("approvals.decide", "Aprobar o rechazar solicitudes", "APPROVALS"),
    PermissionDef("checkin.scan", "Escanear QR", "CHECKIN"),
    PermissionDef("checkin.biometric", "Validar biometría", "CHECKIN"),
    PermissionDef("checkin.manual_approve", "Aprobar manualmente", "CHECKIN"),
    PermissionDef("attendees.read", "Ver asistentes", "ATTENDEES"),
    PermissionDef("attendees.create", "Crear asistentes", "ATTENDEES"),
    PermissionDef("attendees.update", "Editar asistentes", "ATTENDEES"),
    PermissionDef("attendees.delete", "Eliminar asistentes", "ATTENDEES"),
    PermissionDef("audit.read", "Ver auditoría", "AUDIT"),
    PermissionDef("audit.export", "Exportar auditoría", "AUDIT"),
    PermissionDef("staff.read", "Ver personal operativo", "STAFF"),
    PermissionDef("staff.create", "Crear personal operativo", "STAFF"),
    PermissionDef("staff.update", "Editar personal operativo", "STAFF"),
    PermissionDef("staff.delete", "Eliminar personal operativo", "STAFF"),
    PermissionDef("user_roles.read", "Ver asignaciones de roles", "STAFF"),
    PermissionDef("user_roles.create", "Crear asignaciones de roles", "STAFF"),
    PermissionDef("user_roles.update", "Editar asignaciones de roles", "STAFF"),
    PermissionDef("user_roles.delete", "Eliminar asignaciones de roles", "STAFF"),
)


DEFAULT_ROLES: tuple[tuple[str, str], ...] = (
    ("ADMIN", "Administrador"),
    ("APROBADOR", "Aprobador"),
    ("STAFF", "Staff Check-in"),
    ("ASISTENTE", "Asistente"),
)


DEFAULT_ROLE_PERMISSIONS: dict[str, tuple[str, ...]] = {
    "ADMIN": tuple(p.code for p in DEFAULT_PERMISSIONS),
    "APROBADOR": ("approvals.read", "approvals.decide", "invitations.read"),
    "STAFF": ("checkin.scan", "checkin.biometric", "checkin.manual_approve"),
    "ASISTENTE": (),
}


SENSITIVE_PERMISSION_CODES = {"approvals.decide", "checkin.manual_approve"}


SPECIAL_DEPENDENCIES: dict[str, set[str]] = {
    "approvals.decide": {"approvals.read"},
    "checkin.biometric": {"checkin.scan"},
    "checkin.manual_approve": {"checkin.scan"},
}


def _crud_dependencies(permission_code: str) -> set[str]:
    if "." not in permission_code:
        return set()
    resource, action = permission_code.split(".", 1)
    if action in {"update", "delete"}:
        return {f"{resource}.read"}
    return set()


def expand_permission_dependencies(permission_codes: Iterable[str]) -> tuple[set[str], set[str]]:
    selected = {code.strip() for code in permission_codes if code and code.strip()}
    added = set()

    changed = True
    while changed:
        changed = False
        for code in list(selected):
            for dep in _crud_dependencies(code):
                if dep not in selected:
                    selected.add(dep)
                    added.add(dep)
                    changed = True
            for dep in SPECIAL_DEPENDENCIES.get(code, set()):
                if dep not in selected:
                    selected.add(dep)
                    added.add(dep)
                    changed = True

    return selected, added


async def get_permissions_for_role(db: AsyncSession, role: Optional[str]) -> set[str]:
    normalized_role = normalize_role_code(role)
    if not normalized_role:
        return set()

    query = (
        select(Permission.code)
        .join(RolePermission, RolePermission.permission_id == Permission.id)
        .join(Role, Role.id == RolePermission.role_id)
        .where(Role.code == normalized_role, Role.is_active.is_(True), Permission.is_active.is_(True))
    )
    result = await db.execute(query)
    return {row[0] for row in result.all()}


async def get_user_permissions(db: AsyncSession, user_id: str, fallback_role: Optional[str]) -> set[str]:
    assignment_query = (
        select(Permission.code)
        .join(RolePermission, RolePermission.permission_id == Permission.id)
        .join(Role, Role.id == RolePermission.role_id)
        .join(User_roles, User_roles.role_id == Role.id)
        .where(
            User_roles.user_id == user_id,
            User_roles.is_active.is_(True),
            or_(User_roles.expires_at.is_(None), User_roles.expires_at > func.now()),
            Role.is_active.is_(True),
            Permission.is_active.is_(True),
        )
    )
    assignments_result = await db.execute(assignment_query)
    assigned = {row[0] for row in assignments_result.all()}
    if assigned:
        return assigned
    return await get_permissions_for_role(db, fallback_role)


def has_any_permission(user_permissions: Iterable[str], expected: Iterable[str]) -> bool:
    owned = set(user_permissions)
    return any(code in owned for code in expected)


async def get_role_id_by_code(db: AsyncSession, role_code: Optional[str]) -> Optional[int]:
    code = normalize_role_code(role_code)
    if not code:
        return None
    result = await db.execute(select(Role.id).where(Role.code == code, Role.is_active.is_(True)))
    return result.scalar_one_or_none()


async def get_role_code_by_id(db: AsyncSession, role_id: Optional[int]) -> Optional[str]:
    if not role_id:
        return None
    result = await db.execute(select(Role.code).where(Role.id == role_id, Role.is_active.is_(True)))
    return result.scalar_one_or_none()


async def resolve_user_role(db: AsyncSession, role: Optional[str], role_id: Optional[int]) -> Tuple[str, Optional[int]]:
    code_from_id = await get_role_code_by_id(db, role_id)
    if code_from_id:
        return code_from_id, role_id

    normalized = normalize_role_code(role) or "ASISTENTE"
    resolved_role_id = await get_role_id_by_code(db, normalized)
    return normalized, resolved_role_id


async def ensure_user_role_assignment(
    db: AsyncSession,
    user_id: str,
    role_id: Optional[int],
    role_code: Optional[str],
    assigned_by: Optional[str] = None,
) -> None:
    resolved_role_id = role_id or await get_role_id_by_code(db, role_code)
    if not resolved_role_id:
        return
    existing = await db.execute(
        select(User_roles).where(
            User_roles.user_id == user_id,
            User_roles.role_id == resolved_role_id,
            User_roles.is_active.is_(True),
        )
    )
    if existing.scalar_one_or_none():
        return
    db.add(
        User_roles(
            user_id=user_id,
            role=normalize_role_code(role_code),
            role_id=resolved_role_id,
            is_active=True,
            assigned_by=assigned_by,
        )
    )
