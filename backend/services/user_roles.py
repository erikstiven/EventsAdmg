from typing import Any, Dict, Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timezone

from models.user_roles import User_roles


class User_rolesService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, data: Dict[str, Any], user_id: str) -> User_roles:
        """Create a new user role"""
        # Avoid passing user_id twice (data may already include it)
        data = data.copy()
        data.pop("user_id", None)
        # Ensure datetime fields are datetime objects, not strings
        if 'created_at' in data and isinstance(data['created_at'], str):
            data['created_at'] = datetime.now(timezone.utc)
            
        user_role = User_roles(**data, user_id=user_id)
        self.db.add(user_role)
        await self.db.commit()
        await self.db.refresh(user_role)
        return user_role

    async def get(self, role_id: int) -> Optional[User_roles]:
        """Get user role by ID"""
        result = await self.db.execute(
            select(User_roles).where(User_roles.id == role_id)
        )
        return result.scalar_one_or_none()

    async def get_by_field(self, field: str, value: Any) -> Optional[User_roles]:
        """Get user role by any field"""
        result = await self.db.execute(
            select(User_roles).where(getattr(User_roles, field) == value)
        )
        return result.scalar_one_or_none()

    async def get_all(self) -> list[User_roles]:
        """Get all user roles"""
        result = await self.db.execute(select(User_roles))
        return result.scalars().all()

    async def update(self, role_id: int, data: Dict[str, Any], user_id: str) -> User_roles:
        """Update a user role"""
        # Ensure datetime fields are datetime objects, not strings
        if 'created_at' in data and isinstance(data['created_at'], str):
            data['created_at'] = datetime.now(timezone.utc)
            
        user_role = await self.get(role_id)
        if user_role:
            for key, value in data.items():
                setattr(user_role, key, value)
            await self.db.commit()
            await self.db.refresh(user_role)
        return user_role

    async def delete(self, role_id: int) -> bool:
        """Delete a user role"""
        user_role = await self.get(role_id)
        if user_role:
            await self.db.delete(user_role)
            await self.db.commit()
            return True
        return False
