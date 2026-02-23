"""Custom authentication and role management endpoints"""
import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone

from core.database import get_db
from dependencies.auth import get_current_user
from schemas.auth import UserResponse
from services.user_roles import User_rolesService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


class UserRoleResponse(BaseModel):
    user_id: str
    role: str
    email: Optional[str] = None


@router.get("/me/role", response_model=UserRoleResponse)
async def get_current_user_role(
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get current user's role, auto-assign ASISTENTE if no role exists"""
    try:
        service = User_rolesService(db)
        user_role = await service.get_by_field("user_id", current_user.id)
        
        if not user_role:
            # Auto-assign least-privilege role for first-time users
            logger.info(f"Auto-assigning ASISTENTE role to user {current_user.id}")
            user_role_data = {
                "user_id": current_user.id,
                "role": "ASISTENTE",
                "created_at": datetime.now(timezone.utc),
            }
            user_role = await service.create(user_role_data, current_user.id)
            
            # ALSO update the role in the main User model for the auth system
            from models.auth import User
            from sqlalchemy import update
            await db.execute(
                update(User).where(User.id == current_user.id).values(role="ASISTENTE")
            )
            await db.commit()
        
        return UserRoleResponse(
            user_id=current_user.id,
            role=user_role.role,
            email=current_user.email
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting user role: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/assign-role")
async def assign_role_to_user(
    role: str = Query(..., description="Role to assign (ADMIN, APROBADOR, STAFF, ASISTENTE)"),
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Disabled endpoint: self role-switching is not allowed in current environment."""
    raise HTTPException(status_code=403, detail="Cambio de perfil deshabilitado.")
