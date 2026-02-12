import asyncio
import os
import sys
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

async def fix_biometric_column():
    """Direct database connection to add biometric_photo column"""
    
    # Get DATABASE_URL from environment
    database_url = os.environ.get('DATABASE_URL')
    
    if not database_url:
        print('❌ ERROR: DATABASE_URL environment variable not set')
        print('ℹ️  Please set DATABASE_URL before running this script')
        print('   Example: export DATABASE_URL="postgresql+asyncpg://user:pass@host:port/dbname"')
        return
    
    print(f'🔧 PASO 1: Conectando a la base de datos...')
    print(f'   URL: {database_url[:30]}...')
    
    try:
        # Create engine directly
        engine = create_async_engine(database_url, echo=False)
        print('✅ Conexión establecida')
        
        print('\n🔍 PASO 2: Verificando estructura actual de la tabla invitations...')
        async with engine.begin() as conn:
            # Verificar columnas actuales
            result = await conn.execute(text(
                "SELECT column_name, data_type, is_nullable "
                "FROM information_schema.columns "
                "WHERE table_name = 'invitations' "
                "ORDER BY ordinal_position"
            ))
            columns = result.fetchall()
            print('📋 Columnas actuales en la tabla invitations:')
            for col in columns:
                print(f'  - {col[0]} ({col[1]}) nullable={col[2]}')
            
            # Verificar si biometric_photo existe
            result = await conn.execute(text(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_name = 'invitations' AND column_name = 'biometric_photo'"
            ))
            exists = result.fetchone()
            
            if exists:
                print('\n✅ La columna biometric_photo YA EXISTE en la base de datos')
                print('   No se requiere ninguna acción')
            else:
                print('\n❌ La columna biometric_photo NO EXISTE')
                print('➕ PASO 3: Agregando columna biometric_photo...')
                
                # Agregar la columna
                await conn.execute(text(
                    'ALTER TABLE invitations ADD COLUMN biometric_photo TEXT'
                ))
                print('✅ Columna biometric_photo agregada exitosamente')
                
                # Verificar que se agregó
                print('\n🔍 PASO 4: Verificando que la columna se agregó correctamente...')
                result = await conn.execute(text(
                    "SELECT column_name, data_type, is_nullable FROM information_schema.columns "
                    "WHERE table_name = 'invitations' AND column_name = 'biometric_photo'"
                ))
                verification = result.fetchone()
                if verification:
                    print(f'✅ CONFIRMADO: {verification[0]} (tipo: {verification[1]}, nullable: {verification[2]})')
                    print('   La columna existe correctamente en la base de datos')
                else:
                    print('❌ ERROR: La columna no se pudo verificar después de agregarla')
        
        print('\n✅✅✅ PROCESO COMPLETADO EXITOSAMENTE ✅✅✅')
        print('ℹ️  Ahora puedes reiniciar el servidor backend')
        
        await engine.dispose()
        
    except Exception as e:
        print(f'\n❌ ERROR DURANTE LA EJECUCIÓN: {e}')
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(fix_biometric_column())
