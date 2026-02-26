import logging
from datetime import datetime
from typing import Optional, Dict, Any, List

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.events import Events
from repositories.events_repository import EventsRepository

logger = logging.getLogger(__name__)


# ------------------ Service Layer ------------------
class EventsService:
    """Service layer for Events operations"""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.repo = EventsRepository(db)

    async def create(self, data: Dict[str, Any]) -> Optional[Events]:
        """Create a new events"""
        try:
            obj = await self.repo.create(data)
            logger.info(f"Created events with id: {obj.id}")
            return obj
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error creating events: {str(e)}")
            raise

    async def get_by_id(self, obj_id: int) -> Optional[Events]:
        """Get events by ID"""
        try:
            return await self.repo.get_by_id(obj_id)
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
            return await self.repo.get_list(
                skip=skip,
                limit=limit,
                query_dict=query_dict,
                sort=sort,
                search=search,
                date_from=date_from,
                date_to=date_to,
                status=status,
            )
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
            obj = await self.repo.update(obj, update_data)
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
            await self.repo.delete(obj)
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
            return await self.repo.get_by_field(field_name, field_value)
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
