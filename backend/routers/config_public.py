from fastapi import APIRouter
from core.config import settings

router = APIRouter()


@router.get("/api/config")
async def get_public_config():
    return {
        "API_BASE_URL": settings.backend_url or "http://localhost:8000",
    }
