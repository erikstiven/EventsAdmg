# Guía de Despliegue en Producción - Debian 12 (Detrás de Apache Proxy)

Esta guía detalla los pasos para desplegar el proyecto en el servidor de red local **10.100.46.37**, el cual recibirá tráfico desde un proxy Apache externo (`https://eventos.ge-admg.com`).

## 1. Preparación del Servidor (10.100.46.37)

Actualiza los paquetes e instala Docker en el servidor local:
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y docker.io docker-compose-v2
```

## 2. Clonar y Preparar

Sitúate en la rama de despliegue:
```bash
git clone http://10.100.46.36/root/eventos-reconocimiento-facial.git
cd eventos-reconocimiento-facial
git checkout deploy
```

## 3. Configuración del Entorno (.env)

Crea el archivo `.env` en la raíz. **Es vital configurar la URL base correcta** para que el backend genere enlaces válidos:

```env
# URL Pública del proyecto (Importante para QR y links)
PYTHON_BACKEND_URL=https://eventos.ge-admg.com

# Database y Entorno
DATABASE_URL=sqlite+aiosqlite:////app/data/eventaccess.db
DEBUG=false
ENVIRONMENT=production
PORT=8000

# Seguridad
SECRET_KEY=clave_segura_de_al_menos_32_caracteres
JWT_SECRET_KEY=otra_clave_segura_para_tokens

# Configuración OSS
OSS_SERVICE_URL=http://tu-servicio-oss.com
OSS_API_KEY=tu-api-key
```

## 4. Despliegue

Inicia el proyecto. El frontend escuchará internamente en el puerto **80** del servidor local `.37`.

```bash
sudo docker compose up -d --build
```

## 5. Configuración en el Servidor Apache (Proxy Externo)

En el servidor que tiene la URL `https://eventos.ge-admg.com`, asegúrate de que el VirtualHost de Apache esté configurado de la siguiente manera para redirigir el tráfico al servidor local `.37`:

```apache
<VirtualHost *:443>
    ServerName eventos.ge-admg.com

    # Configuración SSL (Gestionada por Apache)
    SSLEngine on
    SSLCertificateFile /path/to/cert.pem
    SSLCertificateKeyFile /path/to/key.pem

    # Proxy hacia el servidor local Docker
    ProxyPreserveHost On
    ProxyPass / http://10.100.46.37/
    ProxyPassReverse / http://10.100.46.37/

    # Soporte para WebSockets (si el proyecto los usa en el futuro)
    RewriteEngine On
    RewriteCond %{HTTP:Upgrade} =websocket [NC]
    RewriteRule /(.*)           ws://10.100.46.37/$1 [P,L]
</VirtualHost>
```

## ¿Hay que eliminar archivos?

**No**, no es necesario eliminar nada. La arquitectura actual es:
`Usuario (HTTPS)` -> `Apache Proxy` -> `Nginx Docker (HTTP en puerto 80)` -> `Backend FastAPI`.

Esta arquitectura es la recomendada porque:
1.  **Apache** se encarga de los Certificados SSL y la seguridad perimetral.
2.  **Nginx (Docker)** sirve los archivos estáticos de React de forma ultra rápida.
3.  **FastAPI** está protegido detrás de dos capas de proxy.

## Notas de mantenimiento
- Si necesitas ver logs del backend: `docker compose logs -f backend`
- La base de datos persistirá en `.37` dentro de un volumen de Docker.
