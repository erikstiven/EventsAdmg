import os
import sys

print("🔍 Buscando configuración de base de datos...")
print("\n1️⃣ Variables de entorno relacionadas con DATABASE:")

# Buscar todas las variables que contengan "DATABASE" o "DB"
db_vars = {k: v for k, v in os.environ.items() if 'DATABASE' in k.upper() or k.upper().startswith('DB')}

if db_vars:
    for key, value in db_vars.items():
        # Ocultar contraseñas
        if 'PASSWORD' in key.upper() or 'PASS' in key.upper():
            print(f"   {key} = ***hidden***")
        else:
            print(f"   {key} = {value}")
else:
    print("   ❌ No se encontraron variables de entorno relacionadas con base de datos")

print("\n2️⃣ Verificando archivos de configuración:")

# Buscar archivos .env
env_files = ['.env', '../.env', '../../.env', '.env.local', '.env.production']
for env_file in env_files:
    if os.path.exists(env_file):
        print(f"   ✅ Encontrado: {env_file}")
        try:
            with open(env_file, 'r') as f:
                lines = [line.strip() for line in f if 'DATABASE' in line.upper() and not line.strip().startswith('#')]
                if lines:
                    print(f"      Contiene configuración de DATABASE:")
                    for line in lines:
                        if 'PASSWORD' in line.upper() or 'PASS' in line.upper():
                            key = line.split('=')[0]
                            print(f"         {key}=***hidden***")
                        else:
                            print(f"         {line}")
        except Exception as e:
            print(f"      ⚠️ Error leyendo archivo: {e}")
    else:
        print(f"   ❌ No encontrado: {env_file}")

print("\n3️⃣ Verificando core/config.py:")
try:
    sys.path.insert(0, '/workspace/app/backend')
    from core.config import settings
    
    # Intentar acceder a database_url
    try:
        db_url = settings.database_url
        print(f"   ✅ settings.database_url está configurado")
        print(f"      Valor: {db_url[:30]}...{db_url[-20:]}")
    except AttributeError:
        print("   ❌ settings.database_url NO está configurado")
        print("      El atributo no existe en la clase Settings")
        
except Exception as e:
    print(f"   ⚠️ Error importando settings: {e}")

print("\n" + "="*60)
print("📋 RESUMEN:")
print("="*60)
print("\nPara que el backend funcione, necesitas configurar DATABASE_URL.")
print("\n🔧 OPCIONES:")
print("\nOpción A - Usar variable de entorno:")
print("   export DATABASE_URL='postgresql+asyncpg://user:pass@host:port/dbname'")
print("\nOpción B - Crear archivo .env:")
print("   echo 'DATABASE_URL=postgresql+asyncpg://user:pass@host:port/dbname' > .env")
print("\nOpción C - Usar SQLite (temporal, para desarrollo):")
print("   export DATABASE_URL='sqlite+aiosqlite:///./eventaccess.db'")
print("\n" + "="*60)
