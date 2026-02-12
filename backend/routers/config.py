from fastapi import APIRouter
import os

router = APIRouter(prefix="/api", tags=["config"])

@router.get("/config")
async def get_config():
    """Return frontend configuration"""
    # Get the backend URL from environment or use default
    backend_url = os.environ.get("BACKEND_URL", "http://localhost:8002")
    
    return {
        "API_BASE_URL": backend_url
    }