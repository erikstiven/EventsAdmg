import json
import logging
from typing import List, Optional

from datetime import datetime, date

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from services.attendees import AttendeesService
from services.storage import StorageService
from dependencies.auth import get_current_user
from dependencies.permissions import require_any_permission
from schemas.auth import UserResponse

# Set up logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/entities/attendees", tags=["attendees"])


# ---------- Pydantic Schemas ----------
class AttendeesData(BaseModel):
    """Entity data schema (for create/update)"""
    identification: str
    full_name: str
    email: str = None
    phone: str = None
    id_document_url: str = None
    id_document_photo: Optional[str] = None  # Base64 encoded photo
    face_photo_url: str = None
    fingerprint_code: str = None
    is_active: bool = True
    created_at: datetime
    updated_at: Optional[datetime] = None



class AttendeesUpdateData(BaseModel):
    """Update entity data (partial updates allowed)"""
    identification: Optional[str] = None
    full_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    id_document_url: Optional[str] = None
    id_document_photo: Optional[str] = None  # Base64 encoded photo
    face_photo_url: Optional[str] = None
    fingerprint_code: Optional[str] = None
    is_active: Optional[bool] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class AttendeesResponse(BaseModel):
    """Entity response schema"""
    id: int
    user_id: str
    identification: str
    full_name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    id_document_url: Optional[str] = None
    face_photo_url: Optional[str] = None
    fingerprint_code: Optional[str] = None
    is_active: bool = True
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class AttendeesListResponse(BaseModel):
    """List response schema"""
    items: List[AttendeesResponse]
    total: int
    skip: int
    limit: int


class AttendeesLookupResponse(BaseModel):
    """Lookup response schema (single match or null)"""
    item: Optional[AttendeesResponse] = None


class AttendeesBatchCreateRequest(BaseModel):
    """Batch create request"""
    items: List[AttendeesData]


class AttendeesBatchUpdateItem(BaseModel):
    """Batch update item"""
    id: int
    updates: AttendeesUpdateData


class AttendeesBatchUpdateRequest(BaseModel):
    """Batch update request"""
    items: List[AttendeesBatchUpdateItem]


class AttendeesBatchDeleteRequest(BaseModel):
    """Batch delete request"""
    ids: List[int]


# ---------- Routes ----------
@router.get("", response_model=AttendeesListResponse)
async def query_attendeess(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    current_user: UserResponse = Depends(get_current_user),
    _perm: UserResponse = Depends(require_any_permission("attendees.read")),
    db: AsyncSession = Depends(get_db),
):
    """Query attendeess with filtering, sorting, and pagination (user can only see their own records)"""
    logger.debug(f"Querying attendeess: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")
    
    service = AttendeesService(db)
    try:
        # Parse query JSON if provided
        query_dict = None
        if query:
            try:
                query_dict = json.loads(query)
            except json.JSONDecodeError:
                raise HTTPException(status_code=400, detail="Invalid query JSON format")
        
        result = await service.get_list(
            skip=skip, 
            limit=limit,
            query_dict=query_dict,
            sort=sort,
            user_id=str(current_user.id),
        )
        logger.debug(f"Found {result['total']} attendeess")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying attendeess: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/all", response_model=AttendeesListResponse)
async def query_attendeess_all(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    _user: UserResponse = Depends(get_current_user),
    _perm: UserResponse = Depends(require_any_permission("attendees.read")),
    db: AsyncSession = Depends(get_db),
):
    # Query attendeess with filtering, sorting, and pagination without user limitation
    logger.debug(f"Querying attendeess: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")

    service = AttendeesService(db)
    try:
        # Parse query JSON if provided
        query_dict = None
        if query:
            try:
                query_dict = json.loads(query)
            except json.JSONDecodeError:
                raise HTTPException(status_code=400, detail="Invalid query JSON format")

        result = await service.get_list(
            skip=skip,
            limit=limit,
            query_dict=query_dict,
            sort=sort
        )
        logger.debug(f"Found {result['total']} attendeess")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying attendeess: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/lookup", response_model=AttendeesLookupResponse)
async def lookup_attendee_by_cedula(
    cedula: str = Query(..., description="Cédula a buscar"),
    current_user: UserResponse = Depends(get_current_user),
    _perm: UserResponse = Depends(require_any_permission("attendees.read")),
    db: AsyncSession = Depends(get_db),
):
    """Lookup attendee by identification (cedula)"""
    service = AttendeesService(db)
    try:
        result = await service.get_by_field("identification", cedula)
        return {"item": result}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error lookup attendees by cedula: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="No se pudo buscar la cédula")


@router.get("/{id}", response_model=AttendeesResponse)
async def get_attendees(
    id: int,
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    current_user: UserResponse = Depends(get_current_user),
    _perm: UserResponse = Depends(require_any_permission("attendees.read")),
    db: AsyncSession = Depends(get_db),
):
    """Get a single attendees by ID (user can only see their own records)"""
    logger.debug(f"Fetching attendees with id: {id}, fields={fields}")
    
    service = AttendeesService(db)
    try:
        result = await service.get_by_id(id, user_id=str(current_user.id))
        if not result:
            logger.warning(f"Attendees with id {id} not found")
            raise HTTPException(status_code=404, detail="Attendees not found")
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching attendees {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("", response_model=AttendeesResponse, status_code=201)
async def create_attendees(
    data: AttendeesData,
    current_user: UserResponse = Depends(get_current_user),
    _perm: UserResponse = Depends(require_any_permission("attendees.create")),
    db: AsyncSession = Depends(get_db),
):
    """Create a new attendees"""
    logger.debug(f"Creating new attendees with data: {data}")
    
    service = AttendeesService(db)
    try:
        # Prepare data for creation
        attendee_data = data.model_dump()
        
        # If id_document_photo (base64) is provided, save it to local storage
        if data.id_document_photo:
            try:
                storage_service = StorageService()
                doc_url = await storage_service.save_base64_image(
                    data.id_document_photo, 
                    bucket_name="documents",
                    filename_prefix=f"doc_{data.identification}"
                )
                attendee_data['id_document_url'] = doc_url
                logger.info(f"ID Document photo saved to local storage: {doc_url}")
            except Exception as e:
                logger.warning(f"Failed to save ID document to storage: {e}. Storing as base64 in DB instead.")
                attendee_data['id_document_url'] = data.id_document_photo
            
            # Remove the temporary field
            attendee_data.pop('id_document_photo', None)
        
        result = await service.create(attendee_data, user_id=str(current_user.id))
        if not result:
            raise HTTPException(status_code=400, detail="Failed to create attendees")
        
        logger.info(f"Attendees created successfully with id: {result.id}")
        return result
    except ValueError as e:
        logger.error(f"Validation error creating attendees: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating attendees: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")



@router.post("/batch", response_model=List[AttendeesResponse], status_code=201)
async def create_attendeess_batch(
    request: AttendeesBatchCreateRequest,
    current_user: UserResponse = Depends(get_current_user),
    _perm: UserResponse = Depends(require_any_permission("attendees.create")),
    db: AsyncSession = Depends(get_db),
):
    """Create multiple attendeess in a single request"""
    logger.debug(f"Batch creating {len(request.items)} attendeess")
    
    service = AttendeesService(db)
    results = []
    
    try:
        for item_data in request.items:
            result = await service.create(item_data.model_dump(), user_id=str(current_user.id))
            if result:
                results.append(result)
        
        logger.info(f"Batch created {len(results)} attendeess successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch create: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch create failed: {str(e)}")


@router.put("/batch", response_model=List[AttendeesResponse])
async def update_attendeess_batch(
    request: AttendeesBatchUpdateRequest,
    current_user: UserResponse = Depends(get_current_user),
    _perm: UserResponse = Depends(require_any_permission("attendees.update")),
    db: AsyncSession = Depends(get_db),
):
    """Update multiple attendeess in a single request (requires ownership)"""
    logger.debug(f"Batch updating {len(request.items)} attendeess")
    
    service = AttendeesService(db)
    results = []
    
    try:
        for item in request.items:
            # Only include non-None values for partial updates
            update_dict = {k: v for k, v in item.updates.model_dump().items() if v is not None}
            result = await service.update(item.id, update_dict, user_id=str(current_user.id))
            if result:
                results.append(result)
        
        logger.info(f"Batch updated {len(results)} attendeess successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch update: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch update failed: {str(e)}")


@router.put("/{id}", response_model=AttendeesResponse)
async def update_attendees(
    id: int,
    data: AttendeesUpdateData,
    current_user: UserResponse = Depends(get_current_user),
    _perm: UserResponse = Depends(require_any_permission("attendees.update")),
    db: AsyncSession = Depends(get_db),
):
    """Update an existing attendees (requires ownership)"""
    logger.debug(f"Updating attendees {id} with data: {data}")

    service = AttendeesService(db)
    try:
        # Prepare data for update
        update_dict = {k: v for k, v in data.model_dump().items() if v is not None}
        
        # If id_document_photo (base64) is provided, save it to local storage
        if data.id_document_photo:
            try:
                storage_service = StorageService()
                doc_url = await storage_service.save_base64_image(
                    data.id_document_photo, 
                    bucket_name="documents",
                    filename_prefix=f"doc_{data.identification or id}"
                )
                update_dict['id_document_url'] = doc_url
                logger.info(f"Updated ID Document photo saved: {doc_url}")
            except Exception as e:
                logger.warning(f"Failed to save ID document to storage during update: {e}")
                update_dict['id_document_url'] = data.id_document_photo
            
            # Remove the temporary base64 field
            update_dict.pop('id_document_photo', None)

        result = await service.update(id, update_dict, user_id=str(current_user.id))
        if not result:
            logger.warning(f"Attendees with id {id} not found for update")
            raise HTTPException(status_code=404, detail="Attendees not found")
        
        logger.info(f"Attendees {id} updated successfully")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Validation error updating attendees {id}: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating attendees {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.delete("/batch")
async def delete_attendeess_batch(
    request: AttendeesBatchDeleteRequest,
    current_user: UserResponse = Depends(get_current_user),
    _perm: UserResponse = Depends(require_any_permission("attendees.delete")),
    db: AsyncSession = Depends(get_db),
):
    """Delete multiple attendeess by their IDs (requires ownership)"""
    logger.debug(f"Batch deleting {len(request.ids)} attendeess")
    
    service = AttendeesService(db)
    deleted_count = 0
    
    try:
        for item_id in request.ids:
            success = await service.delete(item_id, user_id=str(current_user.id))
            if success:
                deleted_count += 1
        
        logger.info(f"Batch deleted {deleted_count} attendeess successfully")
        return {"message": f"Successfully deleted {deleted_count} attendeess", "deleted_count": deleted_count}
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch delete: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch delete failed: {str(e)}")


@router.delete("/{id}")
async def delete_attendees(
    id: int,
    current_user: UserResponse = Depends(get_current_user),
    _perm: UserResponse = Depends(require_any_permission("attendees.delete")),
    db: AsyncSession = Depends(get_db),
):
    """Delete a single attendees by ID (requires ownership)"""
    logger.debug(f"Deleting attendees with id: {id}")
    
    service = AttendeesService(db)
    try:
        success = await service.delete(id, user_id=str(current_user.id))
        if not success:
            logger.warning(f"Attendees with id {id} not found for deletion")
            raise HTTPException(status_code=404, detail="Attendees not found")
        
        logger.info(f"Attendees {id} deleted successfully")
        return {"message": "Attendees deleted successfully", "id": id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting attendees {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/lookup", response_model=AttendeesLookupResponse)
async def lookup_attendee_by_cedula(
    cedula: str = Query(..., description="Cédula a buscar"),
    current_user: UserResponse = Depends(get_current_user),
    _perm: UserResponse = Depends(require_any_permission("attendees.read")),
    db: AsyncSession = Depends(get_db),
):
    """Lookup attendee by identification (cedula)"""
    service = AttendeesService(db)
    try:
        result = await service.get_by_field("identification", cedula)
        return {"item": result}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error lookup attendees by cedula: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")
