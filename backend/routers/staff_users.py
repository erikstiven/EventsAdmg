import logging
from datetime import datetime, timezone
from typing import Optional
from uuid import uuid4

import json

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from dependencies.permissions import require_any_permission
from models.auth import User
from models.security_audit_logs import Security_audit_logs
from models.user_roles import User_roles
from routers.auth_simple import get_current_user_simple
from schemas.auth import UserResponse
from services.rbac import ensure_user_role_assignment, get_role_id_by_code, normalize_role_code

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/staff-users", tags=["staff_users"])
pwd_context = CryptContext(schemes=["argon2", "bcrypt"], deprecated="auto")
ALLOWED_OPERATOR_ROLES = {"STAFF", "APROBADOR"}


class StaffUserCreateRequest(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: str = "STAFF"
    is_active: bool = True


class StaffUserUpdateRequest(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    password: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None


class StaffUserResponse(BaseModel):
    id: str
    name: Optional[str] = None
    email: str
    role: str
    is_active: bool
    created_at: Optional[str] = None
    last_login: Optional[str] = None


class StaffUserListResponse(BaseModel):
    items: list[StaffUserResponse]
    total: int
    skip: int
    limit: int


def ensure_admin(current_user: UserResponse) -> None:
    if normalize_role_code(current_user.role) != "ADMIN":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")


def hash_password(password: str) -> str:
    try:
        return pwd_context.hash(password)
    except Exception:
        return pwd_context.hash(password)


def to_response(user: User) -> StaffUserResponse:
    return StaffUserResponse(
        id=user.id,
        name=user.name,
        email=user.email,
        role=user.role,
        is_active=bool(user.is_active),
        created_at=user.created_at.isoformat() if user.created_at else None,
        last_login=user.last_login.isoformat() if user.last_login else None,
    )


@router.get("", response_model=StaffUserListResponse)
async def list_staff_users(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=200),
    search: Optional[str] = Query(None),
    current_user: UserResponse = Depends(get_current_user_simple),
    _perm: UserResponse = Depends(require_any_permission("staff.read")),
    db: AsyncSession = Depends(get_db),
):
    ensure_admin(current_user)

    allowed_ids = []
    for code in ALLOWED_OPERATOR_ROLES:
        rid = await get_role_id_by_code(db, code)
        if rid:
            allowed_ids.append(rid)

    query = select(User).where(User.role_id.in_(allowed_ids) if allowed_ids else func.upper(User.role).in_(tuple(ALLOWED_OPERATOR_ROLES)))
    count_query = select(func.count(User.id)).where(
        User.role_id.in_(allowed_ids) if allowed_ids else func.upper(User.role).in_(tuple(ALLOWED_OPERATOR_ROLES))
    )

    if search:
        q = f"%{search.strip()}%"
        query = query.where((User.name.ilike(q)) | (User.email.ilike(q)))
        count_query = count_query.where((User.name.ilike(q)) | (User.email.ilike(q)))

    count_result = await db.execute(count_query)
    total = count_result.scalar() or 0

    result = await db.execute(query.order_by(User.created_at.desc()).offset(skip).limit(limit))
    users = result.scalars().all()
    return {
        "items": [to_response(u) for u in users],
        "total": total,
        "skip": skip,
        "limit": limit,
    }


@router.post("", response_model=StaffUserResponse, status_code=201)
async def create_staff_user(
    data: StaffUserCreateRequest,
    request: Request,
    current_user: UserResponse = Depends(get_current_user_simple),
    _perm: UserResponse = Depends(require_any_permission("staff.create")),
    db: AsyncSession = Depends(get_db),
):
    ensure_admin(current_user)
    role = normalize_role_code(data.role)
    if role not in ALLOWED_OPERATOR_ROLES:
        raise HTTPException(status_code=400, detail="Role must be STAFF or APROBADOR")
    role_id = await get_role_id_by_code(db, role)

    email = data.email.lower().strip()
    existing = await db.execute(select(User).where(User.email == email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        id=str(uuid4()),
        email=email,
        name=data.name.strip(),
        role=role,
        role_id=role_id,
        hashed_password=hash_password(data.password),
        is_active=data.is_active,
        email_verified=True,
        created_at=datetime.now(timezone.utc),
    )
    db.add(user)
    await ensure_user_role_assignment(db, user.id, role_id, role, assigned_by=current_user.id)
    db.add(
        Security_audit_logs(
            actor_user_id=current_user.id,
            event_type="ROLE_UPDATED",
            target_type="USER",
            target_id=user.id,
            endpoint=request.url.path,
            method=request.method,
            details_json=json.dumps({"action": "create_user", "role": role}),
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
        )
    )
    await db.commit()
    await db.refresh(user)
    return to_response(user)


@router.put("/{staff_user_id}", response_model=StaffUserResponse)
async def update_staff_user(
    staff_user_id: str,
    data: StaffUserUpdateRequest,
    request: Request,
    current_user: UserResponse = Depends(get_current_user_simple),
    _perm: UserResponse = Depends(require_any_permission("staff.update")),
    db: AsyncSession = Depends(get_db),
):
    ensure_admin(current_user)

    allowed_ids = []
    for code in ALLOWED_OPERATOR_ROLES:
        rid = await get_role_id_by_code(db, code)
        if rid:
            allowed_ids.append(rid)
    result = await db.execute(
        select(User).where(
            User.id == staff_user_id,
            User.role_id.in_(allowed_ids) if allowed_ids else func.upper(User.role).in_(tuple(ALLOWED_OPERATOR_ROLES)),
        )
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Staff user not found")

    if data.email:
        email = data.email.lower().strip()
        existing = await db.execute(select(User).where(User.email == email, User.id != staff_user_id))
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Email already registered")
        user.email = email
    if data.name is not None:
        user.name = data.name.strip()
    if data.password:
        user.hashed_password = hash_password(data.password)
    role_changed = False
    if data.role is not None:
        role = normalize_role_code(data.role)
        if role not in ALLOWED_OPERATOR_ROLES:
            raise HTTPException(status_code=400, detail="Role must be STAFF or APROBADOR")
        old_role_id = user.role_id
        user.role = role
        user.role_id = await get_role_id_by_code(db, role)
        role_changed = True
        if old_role_id and old_role_id != user.role_id:
            old_assign_result = await db.execute(
                select(User_roles).where(
                    User_roles.user_id == user.id,
                    User_roles.role_id == old_role_id,
                    User_roles.is_active.is_(True),
                )
            )
            old_assign = old_assign_result.scalar_one_or_none()
            if old_assign:
                old_assign.is_active = False
        await ensure_user_role_assignment(db, user.id, user.role_id, role, assigned_by=current_user.id)
    if data.is_active is not None:
        user.is_active = data.is_active

    if role_changed:
        db.add(
            Security_audit_logs(
                actor_user_id=current_user.id,
                event_type="ROLE_UPDATED",
                target_type="USER",
                target_id=user.id,
                endpoint=request.url.path,
                method=request.method,
                details_json=json.dumps({"action": "update_user_role", "role": user.role}),
                ip_address=request.client.host if request.client else None,
                user_agent=request.headers.get("user-agent"),
            )
        )
    await db.commit()
    await db.refresh(user)
    return to_response(user)


@router.post("/{staff_user_id}/toggle-active", response_model=StaffUserResponse)
async def toggle_staff_user_active(
    staff_user_id: str,
    request: Request,
    current_user: UserResponse = Depends(get_current_user_simple),
    _perm: UserResponse = Depends(require_any_permission("staff.update")),
    db: AsyncSession = Depends(get_db),
):
    ensure_admin(current_user)

    allowed_ids = []
    for code in ALLOWED_OPERATOR_ROLES:
        rid = await get_role_id_by_code(db, code)
        if rid:
            allowed_ids.append(rid)
    result = await db.execute(
        select(User).where(
            User.id == staff_user_id,
            User.role_id.in_(allowed_ids) if allowed_ids else func.upper(User.role).in_(tuple(ALLOWED_OPERATOR_ROLES)),
        )
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Staff user not found")

    user.is_active = not bool(user.is_active)
    db.add(
        Security_audit_logs(
            actor_user_id=current_user.id,
            event_type="ROLE_UPDATED",
            target_type="USER",
            target_id=user.id,
            endpoint=request.url.path,
            method=request.method,
            details_json=json.dumps({"action": "toggle_user_active", "is_active": bool(user.is_active)}),
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
        )
    )
    await db.commit()
    await db.refresh(user)
    return to_response(user)
