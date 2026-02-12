import json
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from dependencies.permissions import require_any_permission
from models.rbac import Permission, Role, RolePermission
from models.security_audit_logs import Security_audit_logs
from schemas.auth import UserResponse
from services.rbac import SENSITIVE_PERMISSION_CODES, expand_permission_dependencies

router = APIRouter(prefix="/api/v1/rbac", tags=["rbac"])


class RolePermissionsUpdateRequest(BaseModel):
    permission_codes: List[str]


def _serialize_permissions(perms: list[Permission]):
    return [
        {
            "id": perm.id,
            "code": perm.code,
            "name": perm.name,
            "module": perm.module,
            "is_sensitive": perm.code in SENSITIVE_PERMISSION_CODES,
            "description": perm.name,
        }
        for perm in perms
    ]


async def _serialize_role_with_permissions(db: AsyncSession, role: Role) -> dict:
    perms_query = (
        select(Permission)
        .join(RolePermission, RolePermission.permission_id == Permission.id)
        .where(RolePermission.role_id == role.id, Permission.is_active.is_(True))
        .order_by(Permission.module.asc(), Permission.code.asc())
    )
    perms = (await db.execute(perms_query)).scalars().all()
    return {
        "id": role.id,
        "code": role.code,
        "name": role.name,
        "is_active": role.is_active,
        "permissions": [perm.code for perm in perms],
    }


async def _audit_security_event(
    db: AsyncSession,
    request: Request,
    actor_user_id: str,
    event_type: str,
    target_type: str,
    target_id: str,
    details: dict,
):
    db.add(
        Security_audit_logs(
            actor_user_id=actor_user_id,
            event_type=event_type,
            target_type=target_type,
            target_id=target_id,
            endpoint=request.url.path,
            method=request.method,
            details_json=json.dumps(details),
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
        )
    )


@router.get("/roles")
async def list_roles(
    _current_user: UserResponse = Depends(require_any_permission("staff.read")),
    db: AsyncSession = Depends(get_db),
):
    roles = (await db.execute(select(Role).where(Role.is_active.is_(True)).order_by(Role.code.asc()))).scalars().all()
    return [{"id": role.id, "code": role.code, "name": role.name, "is_active": role.is_active} for role in roles]


@router.get("/permissions")
async def list_permissions(
    _current_user: UserResponse = Depends(require_any_permission("staff.read")),
    db: AsyncSession = Depends(get_db),
):
    perms = (
        await db.execute(select(Permission).where(Permission.is_active.is_(True)).order_by(Permission.module.asc(), Permission.code.asc()))
    ).scalars().all()
    return _serialize_permissions(perms)


@router.get("/roles/{role_id}")
async def get_role(
    role_id: int,
    _current_user: UserResponse = Depends(require_any_permission("staff.read")),
    db: AsyncSession = Depends(get_db),
):
    role = (await db.execute(select(Role).where(Role.id == role_id, Role.is_active.is_(True)))).scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=404, detail="Rol no encontrado")
    return await _serialize_role_with_permissions(db, role)


@router.put("/roles/{role_id}/permissions")
async def update_role_permissions(
    role_id: int,
    data: RolePermissionsUpdateRequest,
    request: Request,
    current_user: UserResponse = Depends(require_any_permission("staff.update")),
    db: AsyncSession = Depends(get_db),
):
    role = (await db.execute(select(Role).where(Role.id == role_id, Role.is_active.is_(True)))).scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=404, detail="Rol no encontrado")
    if role.code == "ADMIN":
        raise HTTPException(status_code=400, detail="No se permite editar permisos del rol ADMIN")

    clean_codes = sorted({(code or "").strip() for code in data.permission_codes if (code or "").strip()})
    expanded_codes, added_dependencies = expand_permission_dependencies(clean_codes)

    perms = (
        await db.execute(
            select(Permission).where(Permission.code.in_(sorted(expanded_codes)), Permission.is_active.is_(True))
        )
    ).scalars().all()
    found_codes = {p.code for p in perms}
    missing = sorted(code for code in expanded_codes if code not in found_codes)
    if missing:
        raise HTTPException(status_code=400, detail=f"Permisos inválidos: {', '.join(missing)}")

    try:
        await db.execute(delete(RolePermission).where(RolePermission.role_id == role_id))
        for perm in perms:
            db.add(RolePermission(role_id=role_id, permission_id=perm.id))

        await _audit_security_event(
            db=db,
            request=request,
            actor_user_id=current_user.id,
            event_type="PERMISSIONS_UPDATED",
            target_type="ROLE",
            target_id=str(role_id),
            details={
                "role_code": role.code,
                "requested_permissions": clean_codes,
                "effective_permissions": sorted(found_codes),
                "added_dependencies": sorted(added_dependencies),
            },
        )
        await db.commit()
    except Exception:
        await db.rollback()
        raise

    return {
        "success": True,
        "role_id": role.id,
        "role_code": role.code,
        "permission_codes": sorted(found_codes),
        "added_dependencies": sorted(added_dependencies),
    }


@router.get("/catalog")
async def get_rbac_catalog(
    _current_user: UserResponse = Depends(require_any_permission("staff.read")),
    db: AsyncSession = Depends(get_db),
):
    roles_result = await db.execute(select(Role).where(Role.is_active.is_(True)).order_by(Role.code.asc()))
    permissions_result = await db.execute(
        select(Permission).where(Permission.is_active.is_(True)).order_by(Permission.module.asc(), Permission.code.asc())
    )
    links_result = await db.execute(select(RolePermission))

    roles = roles_result.scalars().all()
    permissions = permissions_result.scalars().all()
    links = links_result.scalars().all()

    role_permissions_map: dict[int, list[int]] = {}
    for link in links:
        role_permissions_map.setdefault(link.role_id, []).append(link.permission_id)

    permission_by_id = {p.id: p for p in permissions}
    role_items = []
    for role in roles:
        permission_codes = [
            permission_by_id[perm_id].code
            for perm_id in role_permissions_map.get(role.id, [])
            if perm_id in permission_by_id
        ]
        role_items.append(
            {
                "id": role.id,
                "code": role.code,
                "name": role.name,
                "permissions": sorted(permission_codes),
            }
        )

    return {"roles": role_items, "permissions": _serialize_permissions(permissions)}
