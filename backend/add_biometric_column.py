import asyncio
import sys
from sqlalchemy import text

# Add parent directory to path to import from core
sys.path.insert(0, '/workspace/app/backend')

from core.database import db_manager

async def add_biometric_column():
    """Add biometric_photo column to invitations table if it doesn't exist"""
    try:
        print("🔧 Checking if biometric_photo column exists...")
        
        # Use the existing database connection
        if not db_manager.engine:
            print("⚠️ Database engine not initialized. The column will be added when the backend starts.")
            return
        
        async with db_manager.engine.begin() as conn:
            # Check if column exists (works for PostgreSQL)
            result = await conn.execute(text(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_name = 'invitations' AND column_name = 'biometric_photo'"
            ))
            exists = result.fetchone()
            
            if not exists:
                print("➕ Adding biometric_photo column to invitations table...")
                await conn.execute(text('ALTER TABLE invitations ADD COLUMN biometric_photo TEXT'))
                print("✅ Column biometric_photo added successfully!")
            else:
                print("✅ Column biometric_photo already exists")
                
    except Exception as e:
        print(f"⚠️ Note: {e}")
        print("ℹ️ The column will be automatically added when the backend server starts.")

if __name__ == "__main__":
    asyncio.run(add_biometric_column())
