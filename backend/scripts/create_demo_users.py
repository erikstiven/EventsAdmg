"""
Script para crear usuarios DEMO en la base de datos.
Crea los mismos usuarios que existían en la versión anterior.
"""
import asyncio
import sys
import os
from datetime import datetime, timezone
from pathlib import Path

# Add backend to path
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))
os.chdir(str(backend_dir))

from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from passlib.context import CryptContext

from core.config import settings
from models.auth import User
from models.base import Base

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Get database URL from settings (will be read from DATABASE_URL env var)
DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite+aiosqlite:///./eventaccess.db")

# Demo users to create
DEMO_USERS = [
    {
        "id": "admin-001",
        "email": "admin@demo.com",
        "name": "Admin Demo",
        "password": "demo123",
        "role": "ADMIN"
    },
    {
        "id": "approver-001",
        "email": "aprobador@demo.com",
        "name": "Aprobador Demo",
        "password": "demo123",
        "role": "APROBADOR"
    },
    {
        "id": "staff-001",
        "email": "staff@demo.com",
        "name": "Staff Demo",
        "password": "demo123",
        "role": "STAFF"
    },
    {
        "id": "attendee-001",
        "email": "asistente@demo.com",
        "name": "Asistente Demo",
        "password": "demo123",
        "role": "ASISTENTE"
    }
]


async def create_demo_users():
    """Create demo users in the database."""
    # Create async engine
    engine = create_async_engine(
        DATABASE_URL,
        echo=False,
        future=True
    )
    
    # Create async session factory
    async_session = sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )
    
    # Create all tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        print("✅ Tablas creadas/verificadas")
    
    async with async_session() as db:
        try:
            for user_data in DEMO_USERS:
                # Check if user already exists
                result = await db.execute(
                    select(User).where(User.email == user_data["email"])
                )
                existing_user = result.scalar_one_or_none()
                
                if existing_user:
                    print(f"⚠️  Usuario {user_data['email']} ya existe. Saltando...")
                    continue
                
                # Hash password
                hashed_password = pwd_context.hash(user_data["password"])
                
                # Create user
                user = User(
                    id=user_data["id"],
                    email=user_data["email"],
                    name=user_data["name"],
                    hashed_password=hashed_password,
                    role=user_data["role"],
                    is_active=True,
                    email_verified=True,
                    created_at=datetime.now(timezone.utc)
                )
                
                db.add(user)
                print(f"✅ Usuario creado: {user_data['email']} (rol: {user_data['role']})")
            
            # Commit all changes
            await db.commit()
            print("\n✅ Todos los usuarios DEMO fueron creados exitosamente!")
            
            # List all users
            result = await db.execute(select(User))
            users = result.scalars().all()
            
            print("\n📊 Usuarios en la base de datos:")
            print("-" * 60)
            for user in users:
                print(f"  • {user.email:25} | {user.name:20} | {user.role:10}")
            print("-" * 60)
            
        except Exception as e:
            print(f"❌ Error creando usuarios: {e}")
            await db.rollback()
            raise
        finally:
            await engine.dispose()


if __name__ == "__main__":
    print("🔧 Creando usuarios DEMO en la base de datos...")
    print("=" * 60)
    
    try:
        asyncio.run(create_demo_users())
    except Exception as e:
        print(f"❌ Error: {e}")
        sys.exit(1)
