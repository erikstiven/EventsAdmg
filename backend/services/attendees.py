import logging
from typing import Optional, Dict, Any, List

from sqlalchemy import select
from sqlalchemy.exc import MultipleResultsFound
from sqlalchemy.ext.asyncio import AsyncSession

from models.attendees import Attendees
from repositories.attendees_repository import AttendeesRepository

logger = logging.getLogger(__name__)


# ------------------ Service Layer ------------------
class AttendeesService:
    """Service layer for Attendees operations"""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.repo = AttendeesRepository(db)

    async def create(self, data: Dict[str, Any], user_id: Optional[str] = None) -> Optional[Attendees]:
        """Create a new attendees"""
        try:
            if user_id:
                data['user_id'] = user_id
            obj = await self.repo.create(data)
            logger.info(f"Created attendees with id: {obj.id}")
            return obj
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error creating attendees: {str(e)}")
            raise

    async def check_ownership(self, obj_id: int, user_id: str) -> bool:
        """Check if user owns this record"""
        try:
            obj = await self.get_by_id(obj_id, user_id=user_id)
            return obj is not None
        except Exception as e:
            logger.error(f"Error checking ownership for attendees {obj_id}: {str(e)}")
            return False

    async def get_by_id(self, obj_id: int, user_id: Optional[str] = None) -> Optional[Attendees]:
        """Get attendees by ID (user can only see their own records)"""
        try:
            return await self.repo.get_by_id(obj_id, user_id=user_id)
        except Exception as e:
            logger.error(f"Error fetching attendees {obj_id}: {str(e)}")
            raise

    async def get_list(
        self, 
        skip: int = 0, 
        limit: int = 20, 
        user_id: Optional[str] = None,
        query_dict: Optional[Dict[str, Any]] = None,
        sort: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Get paginated list of attendeess (user can only see their own records)"""
        try:
            return await self.repo.get_list(
                skip=skip,
                limit=limit,
                user_id=user_id,
                query_dict=query_dict,
                sort=sort,
            )
        except Exception as e:
            logger.error(f"Error fetching attendees list: {str(e)}")
            raise

    async def update(self, obj_id: int, update_data: Dict[str, Any], user_id: Optional[str] = None) -> Optional[Attendees]:
        """Update attendees (requires ownership)"""
        try:
            obj = await self.get_by_id(obj_id, user_id=user_id)
            if not obj:
                logger.warning(f"Attendees {obj_id} not found for update")
                return None
            obj = await self.repo.update(obj, update_data)
            logger.info(f"Updated attendees {obj_id}")
            return obj
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error updating attendees {obj_id}: {str(e)}")
            raise

    async def delete(self, obj_id: int, user_id: Optional[str] = None) -> bool:
        """Delete attendees (requires ownership)"""
        try:
            obj = await self.get_by_id(obj_id, user_id=user_id)
            if not obj:
                logger.warning(f"Attendees {obj_id} not found for deletion")
                return False
            await self.repo.delete(obj)
            logger.info(f"Deleted attendees {obj_id}")
            return True
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error deleting attendees {obj_id}: {str(e)}")
            raise

    async def get_by_field(self, field_name: str, field_value: Any) -> Optional[Attendees]:
        """Get attendees by any field"""
        try:
            if not hasattr(Attendees, field_name):
                raise ValueError(f"Field {field_name} does not exist on Attendees")
            return await self.repo.get_by_field(field_name, field_value)
        except MultipleResultsFound:
            return await self.repo.get_by_field(field_name, field_value)
        except Exception as e:
            logger.error(f"Error fetching attendees by {field_name}: {str(e)}")
            raise

    async def list_by_field(
        self, field_name: str, field_value: Any, skip: int = 0, limit: int = 20
    ) -> List[Attendees]:
        """Get list of attendeess filtered by field"""
        try:
            if not hasattr(Attendees, field_name):
                raise ValueError(f"Field {field_name} does not exist on Attendees")
            result = await self.db.execute(
                select(Attendees)
                .where(getattr(Attendees, field_name) == field_value)
                .offset(skip)
                .limit(limit)
                .order_by(Attendees.id.desc())
            )
            return result.scalars().all()
        except Exception as e:
            logger.error(f"Error fetching attendeess by {field_name}: {str(e)}")
            raise
