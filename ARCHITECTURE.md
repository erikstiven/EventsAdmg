# EventAccess - Arquitectura Técnica

## 🏛️ Visión General del Sistema

EventAccess es una aplicación web progresiva (PWA) diseñada para gestionar el control de acceso a eventos mediante códigos QR únicos y validación biométrica. El sistema implementa una arquitectura de separación frontend-backend con autenticación JWT personalizada.

## 📐 Diagrama de Arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND (PWA)                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   React UI   │  │   Service    │  │   Camera &   │      │
│  │  Components  │  │    Worker    │  │  QR Scanner  │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│         │                  │                  │              │
│         └──────────────────┴──────────────────┘              │
│                         │                                    │
│                  Auth Client (JWT)                           │
│                  (auth-simple.ts)                            │
└─────────────────────────┬───────────────────────────────────┘
                          │ HTTPS/REST + JWT Bearer Token
                          │
┌─────────────────────────▼───────────────────────────────────┐
│                    BACKEND (FastAPI)                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   JWT Auth   │  │   Custom     │  │   Business   │      │
│  │   Routers    │  │   Routers    │  │   Services   │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│         │                  │                  │              │
│         └──────────────────┴──────────────────┘              │
│                         │                                    │
│                    SQLAlchemy ORM                            │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│                   DATABASE (SQLite)                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │    events    │  │  attendees   │  │ invitations  │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   checkins   │  │ biometric_   │  │ user_roles   │      │
│  │              │  │ validations  │  │              │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└──────────────────────────────────────────────────────────────┘
```

## 🔧 Componentes Principales

### 1. Frontend (React PWA)

#### Estructura de Capas

```
Presentation Layer (UI Components)
    ↓
State Management (React Context)
    ↓
Auth Client Layer (auth-simple.ts)
    ↓
Network Layer (HTTP/REST + JWT)
```

#### Componentes Clave

**Componentes de UI:**
- `Layout.tsx`: Layout principal con navegación
- `QRCodeDisplay.tsx`: Generación y visualización de QR
- `QRScanner.tsx`: Escaneo de QR con cámara
- `CameraCapture.tsx`: Captura de foto de cámara o subida de archivo para biometría/ID
- `ui/*`: Componentes shadcn-ui (Button, Card, Dialog, etc.)

**Contextos:**
- `AuthContext.tsx`: Gestión de autenticación legacy (Atoms Backend)
- `AuthContextSimple.tsx`: Gestión de autenticación JWT (actual)

**Páginas por Rol:**
- Admin: Events, Attendees, Invitations
- Aprobador: PendingApprovals
- Staff: CheckIn
- Asistente: MyInvitations

**Servicios:**
- `api.ts`: Cliente API legacy (Atoms Backend SDK)
- `auth-simple.ts`: Cliente de autenticación JWT (actual)

#### Tecnologías Frontend

| Tecnología | Versión | Propósito |
|------------|---------|-----------|
| React | 18.x | Framework UI |
| TypeScript | 5.x | Tipado estático |
| Vite | 5.x | Build tool |
| Tailwind CSS | 3.x | Estilos |
| shadcn-ui | Latest | Componentes UI |
| React Router | 6.x | Navegación |
| @zxing/library | 0.21.x | Escaneo QR |
| qrcode.react | 4.x | Generación QR |

### 2. Backend (FastAPI)

#### Estructura de Capas

```
API Layer (Routers)
    ↓
Authentication Middleware (JWT)
    ↓
Service Layer (Business Logic)
    ↓
Data Access Layer (ORM)
    ↓
Database (SQLite)
```

#### Sistema de Autenticación JWT

**Características:**
- Tokens JWT firmados con HS256
- Secret key configurable vía .env
- Expiración de 7 días por defecto
- Almacenamiento en localStorage (frontend)
- Validación en cada request protegido

**Flujo de Autenticación:**
```
1. POST /api/v1/auth-simple/login
   - Input: { email, password }
   - Validación: Fast verification (skip bcrypt para demo) - Optimización
   - Generación: JWT incluye `role` en payload (evita DB lookup posterior)
   - Output: { access_token, token_type, user }

2. Frontend almacena token en localStorage

3. Todas las requests incluyen:
   Authorization: Bearer <token>

4. Backend valida token:
   - Decodifica JWT (validación firma HS256)
   - Extrae `role` directamente del payload
   - Inyecta usuario en endpoints (Cero latencia DB)
```

**Endpoints de Autenticación:**
- `POST /api/v1/auth-simple/login` - Login con email/password
- `GET /api/v1/auth-simple/me` - Obtener usuario actual
- `GET /api/v1/auth-simple/users` - Listar usuarios (admin)

#### Routers Personalizados

**auth_custom.py:**
- `GET /api/v1/auth/me/role`: Obtener rol del usuario actual

**invitations_custom.py:**
- `POST /api/v1/invitations/generate`: Generar invitación con QR
- `POST /api/v1/invitations/activate`: Activar invitación con OTP
- `GET /api/v1/invitations/pending-approvals`: Listar pendientes
- `POST /api/v1/invitations/approve`: Aprobar/rechazar
- `GET /api/v1/invitations/my-invitations`: Invitaciones del usuario

**checkin_custom.py:**
- `POST /api/v1/checkin/validate-qr`: Validar token QR
- `POST /api/v1/checkin/biometric-validate`: Validación biométrica
- `POST /api/v1/checkin/manual-validate`: Validación manual

**config.py:**
- `GET /api/v1/config`: Configuración del frontend

#### Modelos de Datos (ORM)

**Tablas Principales:**

```python
events:
  - id (PK)
  - name, description, location
  - event_date, start_time, end_time
  - status, created_by, created_at
  - user_id (FK - owner)

attendees:
  - id (PK)
  - user_id (FK)
  - identification, full_name
  - email, phone
  - id_document_url, face_photo_url
  - fingerprint_code
  - created_at

invitations:
  - id (PK)
  - user_id (FK)
  - event_id (FK)
  - attendee_id (FK)
  - token (hashed), token_plain
  - status, activation_code
  - biometric_photo (Base64)
  - approved_by, approved_at, used_at

checkins:
  - id (PK)
  - invitation_id (FK)
  - event_id (FK)
  - staff_user_id (FK)
  - gate
  - biometric_validated, validation_method
  - checked_in_at

biometric_validations:
  - id (PK)
  - user_id (FK)
  - captured_photo_url, reference_photo_url
  - match_score, validation_result
  - ai_response

user_roles:
  - id (PK)
  - user_id (FK)
  - role (admin, aprobador, staff, asistente)
  - created_at
```

#### Tecnologías Backend

| Tecnología | Versión | Propósito |
|------------|---------|-----------|
| FastAPI | 0.110+ | Framework web |
| SQLAlchemy | 2.x | ORM |
| Pydantic | 2.x | Validación de datos |
| Python | 3.10+ | Lenguaje |
| SQLite | 3.x | Base de datos (desarrollo) |
| PyJWT | 2.x | Generación/validación JWT |
| Bcrypt | 4.x | Hashing de contraseñas |
| Python-dotenv | 1.x | Variables de entorno |

### 3. Base de Datos (SQLite)

#### Configuración

**Archivo:** `app/backend/.env`
```env
DATABASE_URL=sqlite:///./eventaccess.db
SECRET_KEY=your-super-secret-key-change-in-production
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_DAYS=7
```

**Inicialización:**
- Tablas creadas automáticamente al iniciar backend
- Usuarios demo insertados en primera ejecución
- Datos de prueba opcionales

#### Migración a Producción

Para producción, se recomienda migrar a PostgreSQL:

```python
# Cambiar en .env
DATABASE_URL=postgresql://user:password@host:port/dbname

# Instalar driver
pip install psycopg2-binary

# SQLAlchemy detecta automáticamente el dialecto
```

## 🔐 Flujo de Seguridad

### Autenticación JWT

```
1. Usuario → Login Page (LoginSimple.tsx)
2. Ingresa email/password
3. Frontend → POST /api/v1/auth-simple/login
4. Backend:
   - Busca usuario en user_roles
   - Valida password con bcrypt
   - Genera JWT con user_id y email
   - Retorna { access_token, user }
5. Frontend:
   - Guarda token en localStorage
   - Actualiza AuthContextSimple
6. Todas las requests protegidas:
   - Incluyen header: Authorization: Bearer <token>
7. Backend en cada request:
   - Extrae token del header
   - Valida firma y expiración
   - Inyecta usuario en endpoint
```

### Autorización por Rol

```
1. Request con token → Backend
2. Middleware JWT valida token
3. get_current_user extrae user_id
4. Consulta user_roles para obtener rol
5. Endpoint verifica permisos según rol
6. Permite/Deniega acceso
```

### Generación de QR Seguro

```
1. Admin genera invitación
2. Backend genera:
   - token_plain = "INV-20260122-ABC123XYZ"
   - token_hash = SHA256(token_plain)
   - activation_code = random 6 dígitos
3. Guarda en BD:
   - token (hash)
   - token_plain (para mostrar QR)
   - activation_code
4. QR contiene solo token_plain
5. En validación:
   - Staff escanea QR → obtiene token_plain
   - Backend busca por token_plain
   - Valida estado y marca como USADO
```

### Seguridad de Contraseñas

```python
# Hashing al crear usuario
hashed = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt())

# Verificación en login
is_valid = bcrypt.checkpw(
    password.encode('utf-8'),
    stored_hash.encode('utf-8')
)
```

## 🔄 Flujos de Datos Críticos

### Flujo de Check-in

```
┌─────────┐
│  Staff  │
└────┬────┘
     │ 1. Escanea QR
     ▼
┌─────────────────┐
│  QR Scanner     │
│  (Frontend)     │
└────┬────────────┘
     │ 2. POST /checkin/validate-qr
     │    { token: "INV-..." }
     │    Authorization: Bearer <jwt>
     ▼
┌─────────────────┐
│  Backend API    │
│  validate-qr    │
└────┬────────────┘
     │ 3. Valida JWT
     │ 4. Busca invitación
     │ 5. Valida estado
     │ 6. Retorna datos asistente
     ▼
┌─────────────────┐
│  Frontend       │
│  Muestra datos  │
└────┬────────────┘
     │ 7. Captura foto
     ▼
┌─────────────────┐
│  Camera         │
│  Capture        │
└────┬────────────┘
     │ 8. POST /checkin/biometric-validate
     │    { invitation_id, photo_base64 }
     │    Authorization: Bearer <jwt>
     ▼
┌─────────────────┐
│  Backend API    │
│  biometric-     │
│  validate       │
└────┬────────────┘
     │ 9. Simula AI validation
     │ 10. Crea biometric_validation
     │ 11. Si MATCH:
     │     - Crea checkin
     │     - Marca invitación USADO
     │ 12. Si NO MATCH:
     │     - Retorna require_manual=true
     ▼
┌─────────────────┐
│  Frontend       │
│  Muestra        │
│  resultado      │
└─────────────────┘
```

### Flujo de Activación

```
┌──────────┐
│ Asistente│
└────┬─────┘
     │ 1. Recibe email con código OTP
     │ 2. Ingresa email + código
     ▼
┌─────────────────┐
│  Frontend       │
│  Activate Form  │
└────┬────────────┘
     │ 3. POST /invitations/activate
     │    { email_or_phone, activation_code }
     │    Authorization: Bearer <jwt>
     ▼
┌─────────────────┐
│  Backend API    │
│  activate       │
└────┬────────────┘
     │ 4. Valida JWT
     │ 5. Busca attendee por email/phone
     │ 6. Busca invitación con código
     │ 7. Valida estado = GENERADO
     │ 8. Actualiza estado → PENDIENTE_APROBACION
     ▼
┌─────────────────┐
│  Database       │
│  invitations    │
│  updated        │
└─────────────────┘
```

## 📊 Modelo de Estados

### Estados de Invitación

```
GENERADO
    ↓ (Asistente activa con OTP)
PENDIENTE_APROBACION
    ↓ (Aprobador decide)
    ├→ APROBADO
    │     ↓ (Staff hace check-in)
    │   USADO
    │
    └→ RECHAZADO
```

### Transiciones Permitidas

| Estado Actual | Acción | Estado Nuevo | Actor |
|---------------|--------|--------------|-------|
| GENERADO | Activar | PENDIENTE_APROBACION | Asistente |
| PENDIENTE_APROBACION | Aprobar | APROBADO | Aprobador |
| PENDIENTE_APROBACION | Rechazar | RECHAZADO | Aprobador |
| APROBADO | Check-in | USADO | Staff |
| APROBADO | Revocar | REVOCADO | Admin |
| * | Expirar | EXPIRADO | Sistema |

## 🎯 Patrones de Diseño Implementados

### Frontend

1. **Context API Pattern**: Gestión de estado global (AuthContextSimple)
2. **Component Composition**: Componentes reutilizables y composables
3. **Custom Hooks**: Lógica reutilizable (useToast)
4. **Protected Routes**: HOC para rutas protegidas por rol
5. **Singleton Pattern**: Cliente de autenticación (authSimple)

### Backend

1. **Repository Pattern**: Services abstraen acceso a datos
2. **Dependency Injection**: FastAPI Depends para servicios
3. **DTO Pattern**: Pydantic models para validación
4. **Layered Architecture**: Separación clara de capas
5. **Factory Pattern**: Creación de tokens y códigos
6. **Middleware Pattern**: JWT authentication middleware

## 🔍 Consideraciones de Rendimiento

### Frontend

- **Code Splitting**: Lazy loading de rutas
- **Memoization**: React.memo para componentes pesados
- **Debouncing**: En búsquedas y filtros
- **Image Optimization**: Compresión de fotos capturadas
- **Service Worker**: Caché de assets estáticos
- **LocalStorage**: Persistencia de token sin cookies

### Backend

- **Connection Pooling**: SQLAlchemy pool
- **Async/Await**: FastAPI async endpoints
- **Indexing**: Índices en campos de búsqueda frecuente
- **Pagination**: Límites en queries de listas
- **JWT Stateless**: Sin necesidad de sesiones en servidor
- **Bcrypt Work Factor**: Balance entre seguridad y rendimiento

## 🚧 Configuración de Red

### Desarrollo Local

**Backend:**
- Host: `0.0.0.0` (escucha en todas las interfaces)
- Puerto: `8000`
- URL interna: `http://localhost:8000`

**Frontend:**
- Host: `0.0.0.0`
- Puerto: `3002`
- URL pública: `http://100.91.28.70:3002`
- Backend URL configurada: `http://localhost:8000`

**Razón de la Configuración:**
El puerto 8000 no es accesible desde la red externa debido a firewall o configuración de red. Por eso, el frontend usa `localhost:8000` para comunicarse con el backend en el mismo servidor.

### Producción (Recomendado)

**Opción 1: Proxy Inverso (nginx)**
```nginx
server {
    listen 80;
    server_name tu-dominio.com;

    location / {
        proxy_pass http://localhost:3002;
    }

    location /api {
        proxy_pass http://localhost:8000;
    }
}
```

**Opción 2: Exponer Backend Directamente**
```bash
# Configurar firewall para permitir puerto 8000
ufw allow 8000/tcp

# Cambiar frontend para usar IP pública
# auth-simple.ts: API_BASE_URL = 'http://tu-ip:8000'
```

## 🧪 Estrategia de Testing (Futuro)

### Frontend

```
Unit Tests (Vitest)
  ↓
Component Tests (React Testing Library)
  ↓
Integration Tests (Cypress)
  ↓
E2E Tests (Playwright)
```

### Backend

```
Unit Tests (pytest)
  ↓
Integration Tests (TestClient)
  ↓
API Tests (pytest + httpx)
  ↓
Load Tests (Locust)
```

## 📈 Escalabilidad

### Horizontal Scaling

- Frontend: CDN + múltiples instancias
- Backend: Load balancer + múltiples workers
- Database: Migrar a PostgreSQL con read replicas

### Vertical Scaling

- Incrementar recursos de servidor
- Optimizar queries SQL
- Implementar caché (Redis)

## 🔮 Roadmap Técnico

### Fase 1 (Actual - MVP)
- ✅ CRUD básico de entidades
- ✅ Autenticación JWT personalizada
- ✅ Sistema de roles
- ✅ Generación y validación de QR
- ✅ Simulación de biometría
- ✅ PWA básica
- ✅ SQLite para desarrollo

### Fase 2 (Próxima)
- [ ] Migrar a PostgreSQL
- [ ] Integración AI real (Gemini 2.5 Pro)
- [ ] Notificaciones push/email/SMS
- [ ] Reportes avanzados
- [ ] Exportación de datos
- [ ] Tests automatizados
- [ ] Configurar proxy inverso (nginx)

### Fase 3 (Futuro)
- [ ] App móvil nativa (React Native)
- [ ] Integración con sistemas externos
- [ ] Multi-tenancy
- [ ] Analytics avanzado
- [ ] Refresh tokens
- [ ] Rate limiting
- [ ] CORS configuración avanzada

## 🔒 Consideraciones de Seguridad

### Implementadas

1. **JWT con HS256**: Tokens firmados criptográficamente
2. **Bcrypt**: Hashing de contraseñas con salt
3. **Token Expiration**: Tokens expiran en 7 días
4. **HTTPS Recomendado**: Para producción
5. **Tokens Opacos en QR**: No exponen datos sensibles
6. **Validación de Input**: Pydantic schemas
7. **SQL Injection Protection**: SQLAlchemy ORM

### Por Implementar

1. **Refresh Tokens**: Para renovar sin re-login
2. **Rate Limiting**: Prevenir ataques de fuerza bruta
3. **CORS Estricto**: Configuración por dominio
4. **HTTPS Obligatorio**: En producción
5. **Audit Logs**: Registro detallado de acciones
6. **2FA**: Autenticación de dos factores
7. **Password Policy**: Requisitos de complejidad

## 📚 Referencias Técnicas

- [FastAPI Docs](https://fastapi.tiangolo.com/)
- [React Docs](https://react.dev/)
- [shadcn-ui](https://ui.shadcn.com/)
- [JWT.io](https://jwt.io/)
- [SQLAlchemy](https://www.sqlalchemy.org/)
- [PWA Guidelines](https://web.dev/progressive-web-apps/)
- [OWASP Security](https://owasp.org/)

## 📝 Notas de Implementación

### Cambios Recientes (Enero 2026 - Sprint 2)

1. **Optimización de Login (Performance):**
   - Eliminada dependencia de base de datos en login (`auth_simple.py`)
   - Rol de usuario embebido en token JWT
   - Bypass de bcrypt para usuarios demo (login instantáneo)

2. **Captura de ID:**
   - Frontend: `CameraCapture` soporta `FileUpload` y cambio de cámara
   - Backend: Recepción de base64 en `attendees` crea/registra foto

3. **Correcciones de Endpoint:**
   - Agregado método `activate` en cliente API frontend
   - Corrección de bloqueo "zombie process" en puerto 8000

### Cambios Recientes (Enero 2026 - Sprint 1)

1. **Migración de Atoms Backend a JWT Personalizado:**
   - Reemplazado `@metagptx/web-sdk` por `auth-simple.ts`
   - Implementado sistema JWT con PyJWT y bcrypt
   - Creado endpoint `/api/v1/auth-simple/login`
   - Usuarios demo precargados en base de datos

2. **Configuración de Red:**
   - Frontend usa `localhost:8000` para backend
   - Razón: Puerto 8000 no accesible externamente
   - Solución temporal para desarrollo local

3. **Base de Datos:**
   - SQLite para desarrollo (archivo `eventaccess.db`)
   - Variables de entorno en `.env`
   - Inicialización automática de tablas

4. **Estructura de Archivos:**
   - Agregado `auth-simple.ts` (cliente JWT)
   - Agregado `LoginSimple.tsx` (página de login JWT)
   - Agregado `AuthContextSimple.tsx` (contexto JWT)
   - Agregado `auth_simple.py` (router JWT)

### Problemas Conocidos

1. **Puerto 8000 No Accesible:**
   - Solución temporal: Frontend usa localhost
   - Solución permanente: Configurar proxy inverso o firewall

2. **Pantalla en Blanco (Resuelto):**
   - Causa: Caché del navegador
   - Solución: Ctrl+Shift+R para limpiar caché

3. **SQLite Limitaciones:**
   - No recomendado para producción
   - Migrar a PostgreSQL para escalabilidad

---

**Documento actualizado:** 2026-01-23
**Versión:** 1.1.0 (MVP con JWT)