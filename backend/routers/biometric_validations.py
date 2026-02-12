import json
import logging
from typing import List, Optional

from datetime import datetime, date

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from services.biometric_validations import Biometric_validationsService
from dependencies.auth import get_current_user
from schemas.auth import UserResponse

# Set up logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/entities/biometric_validations", tags=["biometric_validations"])


# ---------- Pydantic Schemas ----------
class Biometric_validationsData(BaseModel):
    """Entity data schema (for create/update)"""
    checkin_id: int = None
    captured_photo_url: str = None
    reference_photo_url: str = None
    match_score: float = None
    validation_result: str
    ai_response: str = None
    created_at: datetime


class Biometric_validationsUpdateData(BaseModel):
    """Update entity data (partial updates allowed)"""
    checkin_id: Optional[int] = None
    captured_photo_url: Optional[str] = None
    reference_photo_url: Optional[str] = None
    match_score: Optional[float] = None
    validation_result: Optional[str] = None
    ai_response: Optional[str] = None
    created_at: Optional[datetime] = None


class Biometric_validationsResponse(BaseModel):
    """Entity response schema"""
    id: int
    user_id: str
    checkin_id: Optional[int] = None
    captured_photo_url: Optional[str] = None
    reference_photo_url: Optional[str] = None
    match_score: Optional[float] = None
    validation_result: str
    ai_response: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class Biometric_validationsListResponse(BaseModel):
    """List response schema"""
    items: List[Biometric_validationsResponse]
    total: int
    skip: int
    limit: int


class Biometric_validationsBatchCreateRequest(BaseModel):
    """Batch create request"""
    items: List[Biometric_validationsData]


class Biometric_validationsBatchUpdateItem(BaseModel):
    """Batch update item"""
    id: int
    updates: Biometric_validationsUpdateData


class Biometric_validationsBatchUpdateRequest(BaseModel):
    """Batch update request"""
    items: List[Biometric_validationsBatchUpdateItem]


class Biometric_validationsBatchDeleteRequest(BaseModel):
    """Batch delete request"""
    ids: List[int]


# ---------- Routes ----------
@router.get("", response_model=Biometric_validationsListResponse)
async def query_biometric_validationss(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Query biometric_validationss with filtering, sorting, and pagination (user can only see their own records)"""
    logger.debug(f"Querying biometric_validationss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")
    
    service = Biometric_validationsService(db)
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
        logger.debug(f"Found {result['total']} biometric_validationss")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying biometric_validationss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/all", response_model=Biometric_validationsListResponse)
async def query_biometric_validationss_all(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    # Query biometric_validationss with filtering, sorting, and pagination without user limitation
    logger.debug(f"Querying biometric_validationss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")

    service = Biometric_validationsService(db)
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
        logger.debug(f"Found {result['total']} biometric_validationss")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying biometric_validationss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/{id}", response_model=Biometric_validationsResponse)
async def get_biometric_validations(
    id: int,
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a single biometric_validations by ID (user can only see their own records)"""
    logger.debug(f"Fetching biometric_validations with id: {id}, fields={fields}")
    
    service = Biometric_validationsService(db)
    try:
        result = await service.get_by_id(id, user_id=str(current_user.id))
        if not result:
            logger.warning(f"Biometric_validations with id {id} not found")
            raise HTTPException(status_code=404, detail="Biometric_validations not found")
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching biometric_validations {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("", response_model=Biometric_validationsResponse, status_code=201)
async def create_biometric_validations(
    data: Biometric_validationsData,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new biometric_validations"""
    logger.debug(f"Creating new biometric_validations with data: {data}")
    
    service = Biometric_validationsService(db)
    try:
        result = await service.create(data.model_dump(), user_id=str(current_user.id))
        if not result:
            raise HTTPException(status_code=400, detail="Failed to create biometric_validations")
        
        logger.info(f"Biometric_validations created successfully with id: {result.id}")
        return result
    except ValueError as e:
        logger.error(f"Validation error creating biometric_validations: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating biometric_validations: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/batch", response_model=List[Biometric_validationsResponse], status_code=201)
async def create_biometric_validationss_batch(
    request: Biometric_validationsBatchCreateRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create multiple biometric_validationss in a single request"""
    logger.debug(f"Batch creating {len(request.items)} biometric_validationss")
    
    service = Biometric_validationsService(db)
    results = []
    
    try:
        for item_data in request.items:
            result = await service.create(item_data.model_dump(), user_id=str(current_user.id))
            if result:
                results.append(result)
        
        logger.info(f"Batch created {len(results)} biometric_validationss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch create: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch create failed: {str(e)}")


@router.put("/batch", response_model=List[Biometric_validationsResponse])
async def update_biometric_validationss_batch(
    request: Biometric_validationsBatchUpdateRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update multiple biometric_validationss in a single request (requires ownership)"""
    logger.debug(f"Batch updating {len(request.items)} biometric_validationss")
    
    service = Biometric_validationsService(db)
    results = []
    
    try:
        for item in request.items:
            # Only include non-None values for partial updates
            update_dict = {k: v for k, v in item.updates.model_dump().items() if v is not None}
            result = await service.update(item.id, update_dict, user_id=str(current_user.id))
            if result:
                results.append(result)
        
        logger.info(f"Batch updated {len(results)} biometric_validationss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch update: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch update failed: {str(e)}")


@router.put("/{id}", response_model=Biometric_validationsResponse)
async def update_biometric_validations(
    id: int,
    data: Biometric_validationsUpdateData,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update an existing biometric_validations (requires ownership)"""
    logger.debug(f"Updating biometric_validations {id} with data: {data}")

    service = Biometric_validationsService(db)
    try:
        # Only include non-None values for partial updates
        update_dict = {k: v for k, v in data.model_dump().items() if v is not None}
        result = await service.update(id, update_dict, user_id=str(current_user.id))
        if not result:
            logger.warning(f"Biometric_validations with id {id} not found for update")
            raise HTTPException(status_code=404, detail="Biometric_validations not found")
        
        logger.info(f"Biometric_validations {id} updated successfully")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Validation error updating biometric_validations {id}: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating biometric_validations {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.delete("/batch")
async def delete_biometric_validationss_batch(
    request: Biometric_validationsBatchDeleteRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete multiple biometric_validationss by their IDs (requires ownership)"""
    logger.debug(f"Batch deleting {len(request.ids)} biometric_validationss")
    
    service = Biometric_validationsService(db)
    deleted_count = 0
    
    try:
        for item_id in request.ids:
            success = await service.delete(item_id, user_id=str(current_user.id))
            if success:
                deleted_count += 1
        
        logger.info(f"Batch deleted {deleted_count} biometric_validationss successfully")
        return {"message": f"Successfully deleted {deleted_count} biometric_validationss", "deleted_count": deleted_count}
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch delete: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch delete failed: {str(e)}")


@router.delete("/{id}")
async def delete_biometric_validations(
    id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a single biometric_validations by ID (requires ownership)"""
    logger.debug(f"Deleting biometric_validations with id: {id}")
    
    service = Biometric_validationsService(db)
    try:
        success = await service.delete(id, user_id=str(current_user.id))
        if not success:
            logger.warning(f"Biometric_validations with id {id} not found for deletion")
            raise HTTPException(status_code=404, detail="Biometric_validations not found")
        
        logger.info(f"Biometric_validations {id} deleted successfully")
        return {"message": "Biometric_validations deleted successfully", "id": id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting biometric_validations {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")