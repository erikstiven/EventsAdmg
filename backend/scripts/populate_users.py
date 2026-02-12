"""
Script para crear usuarios DEMO directamente en la base de datos SQLite.
Este script evita problemas de migración usando ALTER TABLE.
"""
import sqlite3
import hashlib
import os
from pathlib import Path
from datetime import datetime, timezone

# Usar argon2 en lugar de bcrypt (más confiable)
try:
    from passlib.context import CryptContext
    pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")
    print("✅ Usando argon2 para hash de contraseñas")
except Exception as e:
    print(f"⚠️  Usando fallback de hash: {e}")
    pwd_context = None

DB_PATH = "eventaccess.db"

# Demo users
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


def create_users():
    """Create demo users in SQLite database."""
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    try:
        # Check if users table exists
        cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='users'"
        )
        table_exists = cursor.fetchone()
        
        if not table_exists:
            print("❌ Tabla 'users' no existe. Crea primero el proyecto.")
            return False
        
        # Check current table schema
        cursor.execute("PRAGMA table_info(users)")
        columns = {row[1] for row in cursor.fetchall()}
        print(f"📊 Columnas existentes: {columns}")
        
        # Add missing columns if needed
        missing_columns = {
            'hashed_password': 'TEXT',
            'is_active': 'BOOLEAN',
            'email_verified': 'BOOLEAN'
        }
        
        for col_name, col_type in missing_columns.items():
            if col_name not in columns:
                print(f"➕ Agregando columna: {col_name}")
                try:
                    cursor.execute(f"ALTER TABLE users ADD COLUMN {col_name} {col_type}")
                except sqlite3.OperationalError as e:
                    if "duplicate column name" not in str(e):
                        print(f"   Advertencia: {e}")
        
        conn.commit()
        
        # Insert users
        now = datetime.now(timezone.utc).isoformat()
        
        for user in DEMO_USERS:
            # Hash password with proper error handling
            if pwd_context:
                try:
                    hashed_pwd = pwd_context.hash(user["password"])
                except Exception as e:
                    print(f"   ⚠️  Error hashing con argon2: {e}")
                    # Fallback: hash simple usando SHA256 (para testing)
                    import secrets
                    salt = secrets.token_hex(16)
                    hashed_pwd = f"$fallback_sha256${salt}${hashlib.sha256((user['password'] + salt).encode()).hexdigest()}"
            else:
                # Fallback si passlib no está disponible
                import secrets
                salt = secrets.token_hex(16)
                hashed_pwd = f"$fallback_sha256${salt}${hashlib.sha256((user['password'] + salt).encode()).hexdigest()}"
            
            # Check if user exists
            cursor.execute("SELECT id FROM users WHERE email = ?", (user["email"],))
            exists = cursor.fetchone()
            
            if exists:
                print(f"⚠️  Usuario {user['email']} ya existe")
                continue
            
            try:
                cursor.execute("""
                    INSERT INTO users 
                    (id, email, name, role, created_at, last_login, hashed_password, is_active, email_verified)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    user["id"],
                    user["email"],
                    user["name"],
                    user["role"],
                    now,
                    None,
                    hashed_pwd,
                    True,  # is_active
                    True   # email_verified
                ))
                print(f"✅ Usuario creado: {user['email']:25} (rol: {user['role']})")
            except sqlite3.IntegrityError as e:
                print(f"⚠️  Error insertando {user['email']}: {e}")
        
        conn.commit()
        
        # Show all users
        print("\n📊 Usuarios en la base de datos:")
        print("-" * 70)
        cursor.execute("SELECT id, email, name, role, is_active FROM users")
        for row in cursor.fetchall():
            print(f"  • {row[1]:25} | {row[2]:20} | {row[3]:10} | {'✅' if row[4] else '❌'}")
        print("-" * 70)
        
        print("\n✅ ¡Todos los usuarios DEMO fueron creados exitosamente!")
        return True
        
    except Exception as e:
        print(f"❌ Error: {e}")
        return False
    finally:
        conn.close()


if __name__ == "__main__":
    print("🔧 Creando usuarios DEMO en SQLite...")
    print("=" * 70)
    
    if os.path.exists(DB_PATH):
        success = create_users()
        exit(0 if success else 1)
    else:
        print(f"❌ Base de datos no encontrada: {DB_PATH}")
        print("Asegúrate de que el servidor backend haya creado la BD primero.")
        exit(1)
