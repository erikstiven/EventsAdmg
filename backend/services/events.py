import logging
from datetime import datetime
from typing import Optional, Dict, Any, List

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from models.events import Events

logger = logging.getLogger(__name__)


# ------------------ Service Layer ------------------
class EventsService:
    """Service layer for Events operations"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, data: Dict[str, Any]) -> Optional[Events]:
        """Create a new events"""
        try:
            obj = Events(**data)
            self.db.add(obj)
            await self.db.commit()
            await self.db.refresh(obj)
            logger.info(f"Created events with id: {obj.id}")
            return obj
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error creating events: {str(e)}")
            raise

    async def get_by_id(self, obj_id: int) -> Optional[Events]:
        """Get events by ID"""
        try:
            query = select(Events).where(Events.id == obj_id)
            result = await self.db.execute(query)
            return result.scalar_one_or_none()
        except Exception as e:
            logger.error(f"Error fetching events {obj_id}: {str(e)}")
            raise

    async def get_list(
        self,
        skip: int = 0,
        limit: int = 20,
        query_dict: Optional[Dict[str, Any]] = None,
        sort: Optional[str] = None,
        search: Optional[str] = None,
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None,
        status: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Get paginated list of events with filters"""
        try:
            query = select(Events)
            count_query = select(func.count(Events.id))
            
            if query_dict:
                for field, value in query_dict.items():
                    if hasattr(Events, field):
                        query = query.where(getattr(Events, field) == value)
                        count_query = count_query.where(getattr(Events, field) == value)

            if search:
                term = f"%{search.strip()}%"
                query = query.where(
                    (Events.name.ilike(term)) | (Events.location.ilike(term))
                )
                count_query = count_query.where(
                    (Events.name.ilike(term)) | (Events.location.ilike(term))
                )

            if status:
                query = query.where(Events.status == status)
                count_query = count_query.where(Events.status == status)

            if date_from:
                query = query.where(Events.event_date >= date_from)
                count_query = count_query.where(Events.event_date >= date_from)

            if date_to:
                query = query.where(Events.event_date <= date_to)
                count_query = count_query.where(Events.event_date <= date_to)
            
            count_result = await self.db.execute(count_query)
            total = count_result.scalar()

            if sort:
                if sort.startswith('-'):
                    field_name = sort[1:]
                    if hasattr(Events, field_name):
                        query = query.order_by(getattr(Events, field_name).desc())
                else:
                    if hasattr(Events, sort):
                        query = query.order_by(getattr(Events, sort))
            else:
                query = query.order_by(Events.id.desc())

            result = await self.db.execute(query.offset(skip).limit(limit))
            items = result.scalars().all()

            return {
                "items": items,
                "total": total,
                "skip": skip,
                "limit": limit,
            }
        except Exception as e:
            logger.error(f"Error fetching events list: {str(e)}")
            raise

    async def update(self, obj_id: int, update_data: Dict[str, Any]) -> Optional[Events]:
        """Update events"""
        try:
            obj = await self.get_by_id(obj_id)
            if not obj:
                logger.warning(f"Events {obj_id} not found for update")
                return None
            for key, value in update_data.items():
                if hasattr(obj, key):
                    setattr(obj, key, value)

            await self.db.commit()
            await self.db.refresh(obj)
            logger.info(f"Updated events {obj_id}")
            return obj
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error updating events {obj_id}: {str(e)}")
            raise

    async def delete(self, obj_id: int) -> bool:
        """Delete events"""
        try:
            obj = await self.get_by_id(obj_id)
            if not obj:
                logger.warning(f"Events {obj_id} not found for deletion")
                return False
            await self.db.delete(obj)
            await self.db.commit()
            logger.info(f"Deleted events {obj_id}")
            return True
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error deleting events {obj_id}: {str(e)}")
            raise

    async def get_by_field(self, field_name: str, field_value: Any) -> Optional[Events]:
        """Get events by any field"""
        try:
            if not hasattr(Events, field_name):
                raise ValueError(f"Field {field_name} does not exist on Events")
            result = await self.db.execute(
                select(Events).where(getattr(Events, field_name) == field_value)
            )
            return result.scalar_one_or_none()
        except Exception as e:
            logger.error(f"Error fetching events by {field_name}: {str(e)}")
            raise

    async def list_by_field(
        self, field_name: str, field_value: Any, skip: int = 0, limit: int = 20
    ) -> List[Events]:
        """Get list of eventss filtered by field"""
        try:
            if not hasattr(Events, field_name):
                raise ValueError(f"Field {field_name} does not exist on Events")
            result = await self.db.execute(
                select(Events)
                .where(getattr(Events, field_name) == field_value)
                .offset(skip)
                .limit(limit)
                .order_by(Events.id.desc())
            )
            return result.scalars().all()
        except Exception as e:
            logger.error(f"Error fetching eventss by {field_name}: {str(e)}")
            raise
