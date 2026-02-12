"""
Script para rehashear las contraseñas de los usuarios DEMO con argon2.
"""
import sqlite3
from passlib.context import CryptContext
from datetime import datetime, timezone

DB_PATH = "eventaccess.db"

# Usar argon2 para hash de contraseñas
pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")

# Datos de los usuarios demo
DEMO_USERS = [
    {"email": "admin@demo.com", "password": "demo123"},
    {"email": "aprobador@demo.com", "password": "demo123"},
    {"email": "staff@demo.com", "password": "demo123"},
    {"email": "asistente@demo.com", "password": "demo123"},
]

def rehash_passwords():
    """Rehash all demo user passwords with argon2."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    try:
        print("🔄 Rehasheando contraseñas con argon2...")
        print("=" * 70)
        
        for user in DEMO_USERS:
            hashed_pwd = pwd_context.hash(user["password"])
            
            cursor.execute(
                "UPDATE users SET hashed_password = ? WHERE email = ?",
                (hashed_pwd, user["email"])
            )
            
            print(f"✅ {user['email']:25} - contraseña hasheada con argon2")
        
        conn.commit()
        
        # Verify updates
        print("\n📊 Verificando usuarios actualizados:")
        print("-" * 70)
        cursor.execute("SELECT email, name, role, is_active FROM users WHERE email LIKE '%@demo.com'")
        for row in cursor.fetchall():
            print(f"  • {row[0]:25} | {row[1]:20} | {row[2]:10} | {'✅' if row[3] else '❌'}")
        print("-" * 70)
        
        print("\n✅ ¡Contraseñas rehasheadas exitosamente con argon2!")
        return True
        
    except Exception as e:
        print(f"❌ Error: {e}")
        return False
    finally:
        conn.close()


if __name__ == "__main__":
    success = rehash_passwords()
    exit(0 if success else 1)
