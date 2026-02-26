from __future__ import annotations

from typing import Any, Dict, Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from models.attendees import Attendees


class AttendeesRepository:
    """Data access for Attendees entities."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, data: Dict[str, Any]) -> Attendees:
        obj = Attendees(**data)
        self.db.add(obj)
        await self.db.commit()
        await self.db.refresh(obj)
        return obj

    async def get_by_id(self, obj_id: int, user_id: Optional[str] = None) -> Optional[Attendees]:
        query = select(Attendees).where(Attendees.id == obj_id)
        if user_id:
            query = query.where(Attendees.user_id == user_id)
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def get_list(
        self,
        *,
        skip: int,
        limit: int,
        user_id: Optional[str] = None,
        query_dict: Optional[Dict[str, Any]] = None,
        sort: Optional[str] = None,
    ) -> Dict[str, Any]:
        query = select(Attendees)
        count_query = select(func.count(Attendees.id))

        if user_id:
            query = query.where(Attendees.user_id == user_id)
            count_query = count_query.where(Attendees.user_id == user_id)

        if query_dict:
            for field, value in query_dict.items():
                if hasattr(Attendees, field):
                    query = query.where(getattr(Attendees, field) == value)
                    count_query = count_query.where(getattr(Attendees, field) == value)

        total = (await self.db.execute(count_query)).scalar()

        if sort:
            if sort.startswith("-"):
                field_name = sort[1:]
                if hasattr(Attendees, field_name):
                    query = query.order_by(getattr(Attendees, field_name).desc())
            elif hasattr(Attendees, sort):
                query = query.order_by(getattr(Attendees, sort))
        else:
            query = query.order_by(Attendees.id.desc())

        items = (await self.db.execute(query.offset(skip).limit(limit))).scalars().all()
        return {"items": items, "total": total, "skip": skip, "limit": limit}

    async def update(self, obj: Attendees, update_data: Dict[str, Any]) -> Attendees:
        for key, value in update_data.items():
            if hasattr(obj, key) and key != "user_id":
                setattr(obj, key, value)
        await self.db.commit()
        await self.db.refresh(obj)
        return obj

    async def delete(self, obj: Attendees) -> None:
        await self.db.delete(obj)
        await self.db.commit()

    async def get_by_field(self, field_name: str, field_value: Any) -> Optional[Attendees]:
        result = await self.db.execute(
            select(Attendees).where(getattr(Attendees, field_name) == field_value).order_by(Attendees.id.desc())
        )
        return result.scalars().first()
