import logging
import os
import uuid
import base64
from pathlib import Path
from urllib.parse import urljoin
from core.config import settings

logger = logging.getLogger(__name__)

class StorageService:
    """Service for handling local file storage for images and documents."""

    def __init__(self):
        # We'll use a local directory named 'uploads' in the backend root
        self.upload_dir = Path("uploads")
        self.upload_dir.mkdir(exist_ok=True)
        
        # Base URL for accessing files
        # settings.backend_url is already dynamic
        self.base_url = settings.backend_url

    def _get_file_path(self, bucket_name: str, object_key: str) -> Path:
        """Helper to get local file path and ensure directory exists."""
        bucket_dir = self.upload_dir / bucket_name
        bucket_dir.mkdir(exist_ok=True)
        return bucket_dir / object_key

    def _get_access_url(self, bucket_name: str, object_key: str) -> str:
        """Helper to generate full access URL for a file."""
        return f"{self.base_url}/uploads/{bucket_name}/{object_key}"

    async def save_base64_image(self, base64_str: str, bucket_name: str, filename_prefix: str = "img") -> str:
        """
        Saves a base64 encoded image to the local storage.
        
        Args:
            base64_str: The base64 encoded image (with or without data URI prefix)
            bucket_name: The subdirectory/bucket to save into
            filename_prefix: Prefix for the generated filename
            
        Returns:
            The public URL to access the saved image
        """
        try:
            # Handle data URI prefix (e.g., "data:image/jpeg;base64,")
            if "," in base64_str:
                header, base64_str = base64_str.split(",", 1)
                # Try to guess extension from header
                ext = "png"
                if "image/jpeg" in header or "image/jpg" in header:
                    ext = "jpg"
                elif "image/webp" in header:
                    ext = "webp"
            else:
                ext = "png" # Default

            image_data = base64.b64decode(base64_str)
            filename = f"{filename_prefix}_{uuid.uuid4().hex[:8]}.{ext}"
            
            file_path = self._get_file_path(bucket_name, filename)
            
            with open(file_path, "wb") as f:
                f.write(image_data)
            
            access_url = self._get_access_url(bucket_name, filename)
            logger.info(f"Saved base64 image to {file_path}, URL: {access_url}")
            return access_url
        except Exception as e:
            logger.error(f"Error saving base64 image: {e}")
            raise

    # Compatibility methods for existing code that uses OSS-style requests
    # Note: These are simplified versions to keep the project running without OSS

    async def create_upload_url(self, request):
        """Simulate creating an upload URL (for API compatibility)"""
        # In this local version, we actually expect the client to post the file or send base64
        # Since we are implementing base64 saving, this might not be needed if we refactor callers
        return {
            "upload_url": f"{self.base_url}/api/v1/storage/upload-local",
            "expires_at": "never"
        }

    async def create_download_url(self, request):
        """Returns the direct access URL for an object."""
        return {
            "download_url": self._get_access_url(request.bucket_name, request.object_key),
            "expires_at": "never"
        }
    
    async def delete_object(self, request):
        """Deletes a file from local storage."""
        file_path = self._get_file_path(request.bucket_name, request.object_key)
        if file_path.exists():
            file_path.unlink()
            return {"success": True}
        return {"success": False}
    
    async def list_buckets(self):
        """Lists subdirectories in the upload dir."""
        buckets = [d.name for d in self.upload_dir.iterdir() if d.is_dir()]
        return {"buckets": [{"bucket_name": b, "visibility": "public"} for b in buckets]}
