from fastapi import APIRouter

router = APIRouter(tags=["health"])


@router.get("/health")
async def health_check():
    """Simple health check endpoint"""
    return {"status": "healthy", "service": "eventaccess-api"}


@router.get("/database/health")
async def database_health_check():
    """Check database connection health"""
    try:
        from services.database import check_database_health
        is_healthy = await check_database_health()
        return {"status": "healthy" if is_healthy else "unhealthy", "service": "database"}
    except Exception as e:
        return {"status": "unhealthy", "service": "database", "error": str(e)}