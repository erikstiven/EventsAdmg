import asyncio
import os
import sys
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

async def setup_and_fix():
    """Setup database and add biometric_photo column"""
    
    print("🔧 PASO 1: Verificando configuración de base de datos...")
    
    # Check if DATABASE_URL exists in environment
    database_url = os.environ.get('DATABASE_URL')
    
    if not database_url:
        print("❌ DATABASE_URL no está configurado")
        print("\n📋 Para continuar, necesito que me proporciones la URL de conexión a la base de datos.")
        print("\n🔧 Formato esperado:")
        print("   postgresql+asyncpg://usuario:contraseña@host:puerto/nombre_bd")
        print("\n💡 Ejemplo:")
        print("   postgresql+asyncpg://postgres:mypassword@localhost:5432/eventaccess")
        print("\n⚠️  Si no tienes PostgreSQL instalado, puedo usar SQLite como alternativa temporal.")
        print("\n¿Qué prefieres?")
        print("   A) Proporcionar URL de PostgreSQL")
        print("   B) Usar SQLite (más simple, para desarrollo)")
        return False
    
    print(f"✅ DATABASE_URL encontrada: {database_url[:30]}...")
    
    try:
        print("\n🔧 PASO 2: Conectando a la base de datos...")
        engine = create_async_engine(database_url, echo=False)
        print("✅ Conexión establecida")
        
        print("\n🔍 PASO 3: Verificando tabla invitations...")
        async with engine.begin() as conn:
            # Check if table exists
            if 'postgresql' in database_url:
                result = await conn.execute(text(
                    "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'invitations')"
                ))
            else:  # SQLite
                result = await conn.execute(text(
                    "SELECT name FROM sqlite_master WHERE type='table' AND name='invitations'"
                ))
            
            table_exists = result.fetchone()
            
            if not table_exists or not table_exists[0]:
                print("❌ La tabla invitations no existe")
                print("ℹ️  El backend creará las tablas automáticamente al iniciar")
                await engine.dispose()
                return True
            
            print("✅ Tabla invitations existe")
            
            # Check for biometric_photo column
            print("\n🔍 PASO 4: Verificando columna biometric_photo...")
            
            if 'postgresql' in database_url:
                result = await conn.execute(text(
                    "SELECT column_name FROM information_schema.columns "
                    "WHERE table_name = 'invitations' AND column_name = 'biometric_photo'"
                ))
            else:  # SQLite
                result = await conn.execute(text("PRAGMA table_info(invitations)"))
                columns = result.fetchall()
                result = [col for col in columns if col[1] == 'biometric_photo']
            
            exists = result.fetchone() if 'postgresql' in database_url else len(result) > 0
            
            if exists:
                print("✅ La columna biometric_photo YA EXISTE")
            else:
                print("❌ La columna biometric_photo NO EXISTE")
                print("\n➕ PASO 5: Agregando columna biometric_photo...")
                
                await conn.execute(text(
                    'ALTER TABLE invitations ADD COLUMN biometric_photo TEXT'
                ))
                print("✅ Columna biometric_photo agregada exitosamente")
                
                # Verify
                print("\n🔍 PASO 6: Verificando...")
                if 'postgresql' in database_url:
                    result = await conn.execute(text(
                        "SELECT column_name, data_type FROM information_schema.columns "
                        "WHERE table_name = 'invitations' AND column_name = 'biometric_photo'"
                    ))
                    verification = result.fetchone()
                    if verification:
                        print(f"✅ CONFIRMADO: {verification[0]} ({verification[1]})")
                else:
                    result = await conn.execute(text("PRAGMA table_info(invitations)"))
                    columns = result.fetchall()
                    bio_col = [col for col in columns if col[1] == 'biometric_photo']
                    if bio_col:
                        print(f"✅ CONFIRMADO: biometric_photo ({bio_col[0][2]})")
        
        print("\n✅✅✅ PROCESO COMPLETADO EXITOSAMENTE ✅✅✅")
        await engine.dispose()
        return True
        
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = asyncio.run(setup_and_fix())
    sys.exit(0 if success else 1)
