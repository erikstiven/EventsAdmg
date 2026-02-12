from typing import Any, Dict, Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timezone

from models.biometric_validations import Biometric_validations


class Biometric_validationsService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, data: Dict[str, Any], user_id: str) -> Biometric_validations:
        """Create a new biometric validation"""
        # Ensure datetime fields are datetime objects, not strings
        if 'created_at' in data and isinstance(data['created_at'], str):
            data['created_at'] = datetime.now(timezone.utc)
        if 'validated_at' in data and isinstance(data['validated_at'], str):
            data['validated_at'] = datetime.now(timezone.utc)
            
        validation = Biometric_validations(**data, user_id=user_id)
        self.db.add(validation)
        await self.db.commit()
        await self.db.refresh(validation)
        return validation

    async def get(self, validation_id: int) -> Optional[Biometric_validations]:
        """Get validation by ID"""
        result = await self.db.execute(
            select(Biometric_validations).where(Biometric_validations.id == validation_id)
        )
        return result.scalar_one_or_none()

    async def get_by_field(self, field: str, value: Any) -> Optional[Biometric_validations]:
        """Get validation by any field"""
        result = await self.db.execute(
            select(Biometric_validations).where(getattr(Biometric_validations, field) == value)
        )
        return result.scalar_one_or_none()

    async def get_all(self) -> list[Biometric_validations]:
        """Get all validations"""
        result = await self.db.execute(select(Biometric_validations))
        return result.scalars().all()

    async def update(self, validation_id: int, data: Dict[str, Any], user_id: str) -> Biometric_validations:
        """Update a validation"""
        # Ensure datetime fields are datetime objects, not strings
        if 'created_at' in data and isinstance(data['created_at'], str):
            data['created_at'] = datetime.now(timezone.utc)
        if 'validated_at' in data and isinstance(data['validated_at'], str):
            data['validated_at'] = datetime.now(timezone.utc)
            
        validation = await self.get(validation_id)
        if validation:
            for key, value in data.items():
                setattr(validation, key, value)
            await self.db.commit()
            await self.db.refresh(validation)
        return validation

    async def delete(self, validation_id: int) -> bool:
        """Delete a validation"""
        validation = await self.get(validation_id)
        if validation:
            await self.db.delete(validation)
            await self.db.commit()
            return True
        return False