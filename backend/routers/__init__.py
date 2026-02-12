"""
Routers package - Auto-loads all router modules
"""
import logging
from pathlib import Path
from fastapi import FastAPI

logger = logging.getLogger(__name__)


def load_routers(app: FastAPI):
    """
    Dynamically load all routers from the routers directory.
    
    Args:
        app: FastAPI application instance
    """
    routers_dir = Path(__file__).parent
    
    # Get all Python files in routers directory except __init__.py
    router_files = [
        f.stem for f in routers_dir.glob("*.py") 
        if f.stem != "__init__" and not f.stem.startswith("_")
    ]
    
    for router_name in sorted(router_files):
        try:
            # Import the router module
            module = __import__(f"routers.{router_name}", fromlist=["router"])
            
            # Get the router object
            if hasattr(module, "router"):
                app.include_router(module.router)
                logger.info(f"[OK] Loaded router: routers.{router_name}")
            else:
                logger.warning(f"[WARN] No 'router' found in routers.{router_name}")
                
        except Exception as e:
            logger.error(f"[ERROR] Failed to load router {router_name}: {e}")
            import traceback
            traceback.print_exc()