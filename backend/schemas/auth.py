from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class UserResponse(BaseModel):
    id: str  # Now a string UUID (platform sub)
    email: str
    name: Optional[str] = None
    role: str = "user"  # user/admin/staff/approver/attendee
    last_login: Optional[datetime] = None
    created_at: Optional[str] = None
    is_active: bool = True
    is_superuser: bool = False
    email_verified: bool = False
    permissions: list[str] = Field(default_factory=list)

    class Config:
        from_attributes = True


class PlatformTokenExchangeRequest(BaseModel):
    """Request body for exchanging Platform token for app token."""

    platform_token: str


class TokenExchangeResponse(BaseModel):
    """Response body for issued application token."""

    token: str
