import logging
from typing import Optional, Dict, Any, List
from datetime import datetime, timezone

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from models.invitations import Invitations

logger = logging.getLogger(__name__)


# ------------------ Service Layer ------------------
class InvitationsService:
    """Service layer for Invitations operations"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, data: Dict[str, Any], user_id: Optional[str] = None) -> Optional[Invitations]:
        """Create a new invitations"""
        try:
            # Convert string datetime fields to datetime objects
            datetime_fields = ['created_at', 'updated_at', 'approved_at', 'used_at', 'activated_at']
            for field in datetime_fields:
                if field in data and isinstance(data[field], str):
                    data[field] = datetime.now(timezone.utc)
            
            if user_id:
                data['user_id'] = user_id
            obj = Invitations(**data)
            self.db.add(obj)
            await self.db.commit()
            await self.db.refresh(obj)
            logger.info(f"Created invitations with id: {obj.id}")
            return obj
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error creating invitations: {str(e)}")
            raise

    async def check_ownership(self, obj_id: int, user_id: str) -> bool:
        """Check if user owns this record"""
        try:
            obj = await self.get_by_id(obj_id, user_id=user_id)
            return obj is not None
        except Exception as e:
            logger.error(f"Error checking ownership for invitations {obj_id}: {str(e)}")
            return False

    async def get(self, invitation_id: int) -> Optional[Invitations]:
        """Get invitation by ID (alias for get_by_id without user_id check)"""
        try:
            result = await self.db.execute(
                select(Invitations).where(Invitations.id == invitation_id)
            )
            return result.scalar_one_or_none()
        except Exception as e:
            logger.error(f"Error fetching invitation {invitation_id}: {str(e)}")
            raise

    async def get_by_id(self, obj_id: int, user_id: Optional[str] = None) -> Optional[Invitations]:
        """Get invitations by ID (user can only see their own records)"""
        try:
            query = select(Invitations).where(Invitations.id == obj_id)
            if user_id:
                query = query.where(Invitations.user_id == user_id)
            result = await self.db.execute(query)
            return result.scalar_one_or_none()
        except Exception as e:
            logger.error(f"Error fetching invitations {obj_id}: {str(e)}")
            raise

    async def get_all(self) -> list[Invitations]:
        """Get all invitations"""
        try:
            result = await self.db.execute(select(Invitations))
            return result.scalars().all()
        except Exception as e:
            logger.error(f"Error fetching all invitations: {str(e)}")
            raise

    async def get_list(
        self, 
        skip: int = 0, 
        limit: int = 20, 
        user_id: Optional[str] = None,
        query_dict: Optional[Dict[str, Any]] = None,
        sort: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Get paginated list of invitationss (user can only see their own records)"""
        try:
            query = select(Invitations)
            count_query = select(func.count(Invitations.id))
            
            if user_id:
                query = query.where(Invitations.user_id == user_id)
                count_query = count_query.where(Invitations.user_id == user_id)
            
            if query_dict:
                for field, value in query_dict.items():
                    if hasattr(Invitations, field):
                        query = query.where(getattr(Invitations, field) == value)
                        count_query = count_query.where(getattr(Invitations, field) == value)
            
            count_result = await self.db.execute(count_query)
            total = count_result.scalar()

            if sort:
                if sort.startswith('-'):
                    field_name = sort[1:]
                    if hasattr(Invitations, field_name):
                        query = query.order_by(getattr(Invitations, field_name).desc())
                else:
                    if hasattr(Invitations, sort):
                        query = query.order_by(getattr(Invitations, sort))
            else:
                query = query.order_by(Invitations.id.desc())

            result = await self.db.execute(query.offset(skip).limit(limit))
            items = result.scalars().all()

            return {
                "items": items,
                "total": total,
                "skip": skip,
                "limit": limit,
            }
        except Exception as e:
            logger.error(f"Error fetching invitations list: {str(e)}")
            raise

    async def update(self, obj_id: int, update_data: Dict[str, Any], user_id: Optional[str] = None) -> Optional[Invitations]:
        """Update invitations (requires ownership)"""
        try:
            # Convert string datetime fields to datetime objects
            datetime_fields = ['created_at', 'updated_at', 'approved_at', 'used_at', 'activated_at']
            for field in datetime_fields:
                if field in update_data and isinstance(update_data[field], str):
                    update_data[field] = datetime.now(timezone.utc)
            
            obj = await self.get_by_id(obj_id, user_id=user_id)
            if not obj:
                logger.warning(f"Invitations {obj_id} not found for update")
                return None
            for key, value in update_data.items():
                if hasattr(obj, key) and key != 'user_id':
                    setattr(obj, key, value)

            await self.db.commit()
            await self.db.refresh(obj)
            logger.info(f"Updated invitations {obj_id}")
            return obj
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error updating invitations {obj_id}: {str(e)}")
            raise

    async def delete(self, obj_id: int, user_id: Optional[str] = None) -> bool:
        """Delete invitations (requires ownership)"""
        try:
            obj = await self.get_by_id(obj_id, user_id=user_id)
            if not obj:
                logger.warning(f"Invitations {obj_id} not found for deletion")
                return False
            await self.db.delete(obj)
            await self.db.commit()
            logger.info(f"Deleted invitations {obj_id}")
            return True
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error deleting invitations {obj_id}: {str(e)}")
            raise

    async def get_by_field(self, field_name: str, field_value: Any) -> Optional[Invitations]:
        """Get invitations by any field"""
        try:
            if not hasattr(Invitations, field_name):
                raise ValueError(f"Field {field_name} does not exist on Invitations")
            result = await self.db.execute(
                select(Invitations).where(getattr(Invitations, field_name) == field_value)
            )
            return result.scalar_one_or_none()
        except Exception as e:
            logger.error(f"Error fetching invitations by {field_name}: {str(e)}")
            raise

    async def list_by_field(
        self, field_name: str, field_value: Any, skip: int = 0, limit: int = 20
    ) -> List[Invitations]:
        """Get list of invitationss filtered by field"""
        try:
            if not hasattr(Invitations, field_name):
                raise ValueError(f"Field {field_name} does not exist on Invitations")
            result = await self.db.execute(
                select(Invitations)
                .where(getattr(Invitations, field_name) == field_value)
                .offset(skip)
                .limit(limit)
                .order_by(Invitations.id.desc())
            )
            return result.scalars().all()
        except Exception as e:
            logger.error(f"Error fetching invitationss by {field_name}: {str(e)}")
            raise