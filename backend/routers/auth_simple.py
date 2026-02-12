"""
JWT-based authentication system using database.
All users are stored and authenticated from the database.
"""
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from core.database import get_db
from models.auth import User
from schemas.auth import UserResponse
from services.rbac import (
    ensure_user_role_assignment,
    get_role_id_by_code,
    get_user_permissions,
    normalize_role_code,
    resolve_user_role,
)

logger = logging.getLogger(__name__)

# Password hashing - soporta argon2, bcrypt y fallback SHA256
try:
    pwd_context = CryptContext(
        schemes=["argon2", "bcrypt"],
        deprecated="auto",
        argon2__type="id"
    )
except Exception:
    # Fallback si argon2 no está disponible
    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

security = HTTPBearer()

router = APIRouter(prefix="/api/v1/auth-simple", tags=["auth-simple"])


# Pydantic Models
class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: Optional[str] = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash. Soporta argon2, bcrypt y SHA256 fallback."""
    if not hashed_password:
        return False
    try:
        # Intenta con passlib (argon2, bcrypt)
        return pwd_context.verify(plain_password, hashed_password)
    except Exception as e:
        # Fallback para SHA256 si la contraseña fue hasheada con SHA256
        if hashed_password.startswith("$fallback_sha256$"):
            try:
                import hashlib
                parts = hashed_password.split("$")
                if len(parts) == 4:
                    salt = parts[2]
                    expected_hash = parts[3]
                    computed_hash = hashlib.sha256((plain_password + salt).encode()).hexdigest()
                    return computed_hash == expected_hash
            except Exception:
                pass
        
        logger.error(f"Password verification error: {e}")
        return False


def get_password_hash(password: str) -> str:
    """Hash a password."""
    try:
        return pwd_context.hash(password)
    except Exception as e:
        logger.error(f"Password hashing error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error processing password"
        )


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create a JWT access token."""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.jwt_expire_minutes)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)
    return encoded_jwt


async def get_current_user_simple(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db)
) -> UserResponse:
    """Get the current authenticated user from JWT token."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        token = credentials.credentials
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    
    # Get user from database
    result = await db.execute(
        select(User).where(User.id == user_id)
    )
    user = result.scalar_one_or_none()
    
    if user is None:
        raise credentials_exception
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account is disabled",
        )
    
    resolved_role, resolved_role_id = await resolve_user_role(db, user.role, getattr(user, "role_id", None))
    if user.role != resolved_role or getattr(user, "role_id", None) != resolved_role_id:
        user.role = resolved_role
        user.role_id = resolved_role_id
        db.add(user)
        await db.commit()

    await ensure_user_role_assignment(db, user.id, resolved_role_id, resolved_role, assigned_by=user.id)
    await db.commit()
    permissions = sorted(await get_user_permissions(db, user.id, resolved_role))

    return UserResponse(
        id=user.id,
        email=user.email,
        name=user.name,
        role=resolved_role,
        created_at=user.created_at.isoformat() if user.created_at else None,
        is_active=user.is_active,
        is_superuser=bool(getattr(user, "is_superuser", False)),
        email_verified=user.email_verified,
        permissions=permissions,
    )


@router.post("/login", response_model=TokenResponse)
async def login(
    login_data: LoginRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Login endpoint that authenticates users from database.
    """
    # Query user from database
    result = await db.execute(
        select(User).where(User.email == login_data.email)
    )
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )
    
    # Check if user is active
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account is disabled"
        )
    
    # Verify password
    if not verify_password(login_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )
    
    # Normalize role and update role_id if needed
    resolved_role, resolved_role_id = await resolve_user_role(db, user.role, getattr(user, "role_id", None))
    if user.role != resolved_role:
        user.role = resolved_role
    if getattr(user, "role_id", None) != resolved_role_id:
        user.role_id = resolved_role_id

    # Update last login
    user.last_login = datetime.now(timezone.utc)
    db.add(user)
    await db.commit()
    
    # Create access token
    access_token = create_access_token(
        data={
            "sub": user.id,
            "email": user.email,
            "role": resolved_role
        }
    )
    
    await ensure_user_role_assignment(db, user.id, resolved_role_id, resolved_role, assigned_by=user.id)
    await db.commit()
    permissions = sorted(await get_user_permissions(db, user.id, resolved_role))

    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user={
            "id": user.id,
            "email": user.email,
            "full_name": user.name,
            "role": resolved_role,
            "is_active": user.is_active,
            "is_superuser": bool(getattr(user, "is_superuser", False)),
            "email_verified": user.email_verified,
            "permissions": permissions,
        }
    )


@router.get("/me", response_model=dict)
async def get_current_user_info(
    current_user: UserResponse = Depends(get_current_user_simple),
    db: AsyncSession = Depends(get_db)
):
    """Get current user information."""
    try:
        # Get user from database
        result = await db.execute(
            select(User).where(User.id == current_user.id)
        )
        user = result.scalar_one_or_none()
        
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )
        
        resolved_role, resolved_role_id = await resolve_user_role(db, user.role, getattr(user, "role_id", None))
        if user.role != resolved_role or getattr(user, "role_id", None) != resolved_role_id:
            user.role = resolved_role
            user.role_id = resolved_role_id
            db.add(user)
            await db.commit()

        await ensure_user_role_assignment(db, user.id, resolved_role_id, resolved_role, assigned_by=user.id)
        await db.commit()
        permissions = sorted(await get_user_permissions(db, user.id, resolved_role))

        return {
            "id": user.id,
            "email": user.email,
            "full_name": user.name,
            "role": resolved_role,
            "is_active": user.is_active,
            "is_superuser": bool(getattr(user, "is_superuser", False)),
            "email_verified": user.email_verified,
            "created_at": user.created_at.isoformat() if user.created_at else None,
            "permissions": permissions,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting user info: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error retrieving user information"
        )


@router.post("/register", response_model=TokenResponse)
async def register(
    register_data: RegisterRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Register a new user in the database.
    """
    # Check if user already exists
    result = await db.execute(
        select(User).where(User.email == register_data.email)
    )
    existing_user = result.scalar_one_or_none()
    
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    # Create new user with generated ID
    attendee_role = normalize_role_code("ASISTENTE")
    attendee_role_id = await get_role_id_by_code(db, attendee_role)

    user = User(
        id=str(uuid4()),
        email=register_data.email,
        name=register_data.full_name,
        hashed_password=get_password_hash(register_data.password),
        is_active=True,
        role=attendee_role,
        role_id=attendee_role_id,
        email_verified=False
    )
    
    db.add(user)
    await db.commit()
    await db.refresh(user)
    
    # Create access token
    access_token = create_access_token(
        data={
            "sub": user.id,
            "email": user.email,
            "role": attendee_role
        }
    )
    
    await ensure_user_role_assignment(db, user.id, attendee_role_id, attendee_role, assigned_by=user.id)
    await db.commit()
    permissions = sorted(await get_user_permissions(db, user.id, attendee_role))

    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user={
            "id": user.id,
            "email": user.email,
            "full_name": user.name,
            "role": attendee_role,
            "is_active": user.is_active,
            "is_superuser": bool(getattr(user, "is_superuser", False)),
            "email_verified": user.email_verified,
            "permissions": permissions,
        }
    )


@router.post("/logout")
async def logout():
    """
    Logout endpoint (JWT tokens are stateless, so just clear client-side).
    """
    return {"message": "Logged out successfully"}
