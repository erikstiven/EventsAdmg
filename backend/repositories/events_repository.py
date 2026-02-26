from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from models.events import Events


class EventsRepository:
    """Data access for Events entities."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, data: Dict[str, Any]) -> Events:
        obj = Events(**data)
        self.db.add(obj)
        await self.db.commit()
        await self.db.refresh(obj)
        return obj

    async def get_by_id(self, obj_id: int) -> Optional[Events]:
        result = await self.db.execute(select(Events).where(Events.id == obj_id))
        return result.scalar_one_or_none()

    async def get_list(
        self,
        *,
        skip: int,
        limit: int,
        query_dict: Optional[Dict[str, Any]] = None,
        sort: Optional[str] = None,
        search: Optional[str] = None,
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None,
        status: Optional[str] = None,
    ) -> Dict[str, Any]:
        query = select(Events)
        count_query = select(func.count(Events.id))

        if query_dict:
            for field, value in query_dict.items():
                if hasattr(Events, field):
                    query = query.where(getattr(Events, field) == value)
                    count_query = count_query.where(getattr(Events, field) == value)

        if search:
            term = f"%{search.strip()}%"
            query = query.where((Events.name.ilike(term)) | (Events.location.ilike(term)))
            count_query = count_query.where((Events.name.ilike(term)) | (Events.location.ilike(term)))

        if status:
            query = query.where(Events.status == status)
            count_query = count_query.where(Events.status == status)

        if date_from:
            query = query.where(Events.event_date >= date_from)
            count_query = count_query.where(Events.event_date >= date_from)

        if date_to:
            query = query.where(Events.event_date <= date_to)
            count_query = count_query.where(Events.event_date <= date_to)

        total = (await self.db.execute(count_query)).scalar()

        if sort:
            if sort.startswith("-"):
                field_name = sort[1:]
                if hasattr(Events, field_name):
                    query = query.order_by(getattr(Events, field_name).desc())
            elif hasattr(Events, sort):
                query = query.order_by(getattr(Events, sort))
        else:
            query = query.order_by(Events.id.desc())

        items = (await self.db.execute(query.offset(skip).limit(limit))).scalars().all()
        return {"items": items, "total": total, "skip": skip, "limit": limit}

    async def update(self, obj: Events, update_data: Dict[str, Any]) -> Events:
        for key, value in update_data.items():
            if hasattr(obj, key):
                setattr(obj, key, value)
        await self.db.commit()
        await self.db.refresh(obj)
        return obj

    async def delete(self, obj: Events) -> None:
        await self.db.delete(obj)
        await self.db.commit()

    async def get_by_field(self, field_name: str, field_value: Any) -> Optional[Events]:
        result = await self.db.execute(select(Events).where(getattr(Events, field_name) == field_value))
        return result.scalar_one_or_none()
