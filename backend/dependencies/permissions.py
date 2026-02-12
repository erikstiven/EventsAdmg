from __future__ import annotations

import json
from typing import Callable

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from dependencies.auth import get_current_user
from models.auth import User
from models.security_audit_logs import Security_audit_logs
from schemas.auth import UserResponse
from services.rbac import get_user_permissions, has_any_permission, resolve_user_role


async def _log_access_denied(
    db: AsyncSession,
    request: Request,
    actor_user_id: str,
    required_permissions: list[str],
) -> None:
    try:
        db.add(
            Security_audit_logs(
                actor_user_id=actor_user_id,
                event_type="ACCESS_DENIED",
                target_type="ENDPOINT",
                target_id=request.url.path,
                endpoint=request.url.path,
                method=request.method,
                details_json=json.dumps({"required_permissions": required_permissions}),
                ip_address=request.client.host if request.client else None,
                user_agent=request.headers.get("user-agent"),
            )
        )
        await db.commit()
    except Exception:
        await db.rollback()


def require_any_permission(*permission_codes: str) -> Callable:
    async def dependency(
        request: Request,
        current_user: UserResponse = Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
    ) -> UserResponse:
        user_result = await db.execute(select(User).where(User.id == current_user.id))
        user = user_result.scalar_one_or_none()
        if not user or not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Cuenta inactiva o no encontrada",
            )
        if bool(getattr(user, "is_superuser", False)):
            return current_user

        resolved_role, resolved_role_id = await resolve_user_role(db, user.role, getattr(user, "role_id", None))
        if user.role != resolved_role or getattr(user, "role_id", None) != resolved_role_id:
            user.role = resolved_role
            user.role_id = resolved_role_id
            db.add(user)
            await db.commit()

        user_permissions = await get_user_permissions(db, user.id, resolved_role)
        if not has_any_permission(user_permissions, permission_codes):
            await _log_access_denied(db, request, user.id, list(permission_codes))
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No tienes permisos para ejecutar esta acción",
            )
        return current_user

    return dependency


def require_permission(permission_code: str) -> Callable:
    return require_any_permission(permission_code)
