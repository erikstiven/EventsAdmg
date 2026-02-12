from typing import Any, Dict, Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timezone

from models.checkins import Checkins


class CheckinsService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, data: Dict[str, Any], user_id: str) -> Checkins:
        """Create a new checkin"""
        # Ensure datetime fields are datetime objects, not strings
        if 'created_at' in data and isinstance(data['created_at'], str):
            data['created_at'] = datetime.now(timezone.utc)
        if 'checked_in_at' in data and isinstance(data['checked_in_at'], str):
            data['checked_in_at'] = datetime.now(timezone.utc)
            
        checkin = Checkins(**data, user_id=user_id)
        self.db.add(checkin)
        await self.db.commit()
        await self.db.refresh(checkin)
        return checkin

    async def get(self, checkin_id: int) -> Optional[Checkins]:
        """Get checkin by ID"""
        result = await self.db.execute(
            select(Checkins).where(Checkins.id == checkin_id)
        )
        return result.scalar_one_or_none()

    async def get_by_field(self, field: str, value: Any) -> Optional[Checkins]:
        """Get checkin by any field"""
        result = await self.db.execute(
            select(Checkins).where(getattr(Checkins, field) == value)
        )
        return result.scalar_one_or_none()

    async def get_all(self) -> list[Checkins]:
        """Get all checkins"""
        result = await self.db.execute(select(Checkins))
        return result.scalars().all()

    async def update(self, checkin_id: int, data: Dict[str, Any], user_id: str) -> Checkins:
        """Update a checkin"""
        # Ensure datetime fields are datetime objects, not strings
        if 'created_at' in data and isinstance(data['created_at'], str):
            data['created_at'] = datetime.now(timezone.utc)
        if 'checked_in_at' in data and isinstance(data['checked_in_at'], str):
            data['checked_in_at'] = datetime.now(timezone.utc)
            
        checkin = await self.get(checkin_id)
        if checkin:
            for key, value in data.items():
                setattr(checkin, key, value)
            await self.db.commit()
            await self.db.refresh(checkin)
        return checkin

    async def delete(self, checkin_id: int) -> bool:
        """Delete a checkin"""
        checkin = await self.get(checkin_id)
        if checkin:
            await self.db.delete(checkin)
            await self.db.commit()
            return True
        return False