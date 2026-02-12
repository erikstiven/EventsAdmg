import logging
import os
import sys
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path

import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Load environment variables from .env file BEFORE importing anything else
load_dotenv()

from core.config import settings
from routers import load_routers
from services.database import initialize_database

# Setup basic logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

logger.info("=== Application starting ===")
logger.info(f"Environment: {settings.environment}")
logger.info(f"Database URL: {settings.database_url[:30]}...")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifespan context manager for FastAPI application.
    Handles startup and shutdown events.
    """
    # Startup
    logger.info("=== Application startup initiated ===")
    try:
        # Initialize database
        await initialize_database()
        logger.info("[OK] Database initialized successfully")
    except Exception as e:
        logger.error(f"[ERROR] Failed to initialize database: {e}")
        import traceback
        traceback.print_exc()
        raise

    yield

    # Shutdown
    logger.info("=== Application shutdown initiated ===")
    try:
        from core.database import db_manager

        await db_manager.close_db()
        logger.info("[OK] Database connections closed")
    except Exception as e:
        logger.error(f"[WARN] Error during shutdown: {e}")


# Create FastAPI app
app = FastAPI(
    title=settings.app_name,
    version=settings.version,
    debug=settings.debug,
    lifespan=lifespan,
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with specific origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve static files from the 'uploads' directory
from fastapi.staticfiles import StaticFiles
uploads_path = Path("uploads")
uploads_path.mkdir(exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

# Load all routers
load_routers(app)

if __name__ == "__main__":
    logger.info("=== Starting FastAPI server ===")
    logger.info(f"Host: {settings.host}")
    logger.info(f"Port: {settings.port}")
    logger.info(f"Backend URL: {settings.backend_url}")

    uvicorn.run(
        "main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
        log_level="info",
    )