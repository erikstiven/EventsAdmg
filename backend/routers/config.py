from fastapi import APIRouter

from core.config import settings

router = APIRouter(prefix="/api", tags=["config"])


@router.get("/config")
async def get_config():
    """Return frontend configuration"""
    backend_url = settings.backend_url or "http://localhost:8000"

    return {
        "API_BASE_URL": backend_url
    }
