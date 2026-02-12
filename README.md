# EventAccess - Sistema de Control de Acceso a Eventos

## 📋 Descripción

EventAccess es un prototipo MVP (Producto Mínimo Viable) de una aplicación PWA para control de acceso a eventos mediante códigos QR de uso único y validación biométrica facial. El sistema incluye gestión completa de eventos, asistentes, invitaciones, aprobaciones y check-in con múltiples métodos de validación.

**Novedades (Enero 2026):**
- 🚀 **Login Instantáneo**: Optimización completa eliminando bloqueos de base de datos en autenticación.
- 📸 **Captura ID**: Soporte para subir o capturar foto de documento de identidad en registro.
- 🔐 **Validación Robusta**: Flujo de activación mejorado con códigos numéricos de 6 dígitos.

## 🏗️ Arquitectura

### Stack Tecnológico

**Frontend:**
- React 18 con TypeScript
- Vite como bundler
- Tailwind CSS + shadcn-ui para componentes UI
- React Router para navegación
- @zxing/library para escaneo de QR
- qrcode.react para generación de QR
- PWA con Service Worker

**Backend:**
- FastAPI (Python)
- SQLAlchemy (ORM)
- SQLite (Base de datos - desarrollo)
- Autenticación JWT personalizada
- Bcrypt para hashing de contraseñas

### Justificación

1. **React + Vite**: Desarrollo rápido con hot reload, excelente experiencia de desarrollo
2. **shadcn-ui**: Componentes UI modernos y accesibles, fácilmente personalizables
3. **FastAPI**: Alto rendimiento, tipado automático, documentación automática con OpenAPI
4. **PWA**: Instalable en dispositivos móviles, funciona offline (caché), experiencia nativa
5. **JWT Auth**: Sistema de autenticación simple y seguro sin dependencias externas

## 📁 Estructura de Carpetas

```
app/
├── backend/                    # Backend FastAPI
│   ├── core/                   # Configuración y utilidades core
│   │   ├── config.py           # Configuración de entorno
│   │   └── database.py         # Configuración de base de datos
│   ├── dependencies/           # Dependencias de inyección
│   │   └── auth.py             # Dependencias de autenticación
│   ├── models/                 # Modelos ORM (auto-generados + personalizados)
│   │   ├── events.py           # Modelo de eventos
│   │   ├── attendees.py        # Modelo de asistentes
│   │   ├── invitations.py      # Modelo de invitaciones
│   │   ├── checkins.py         # Modelo de check-ins
│   │   ├── biometric_validations.py # Modelo de validaciones biométricas
│   │   └── user_roles.py       # Modelo de roles de usuario
│   ├── routers/                # Endpoints API
│   │   ├── auth_simple.py      # Autenticación JWT
│   │   ├── auth_custom.py      # Gestión de roles personalizados
│   │   ├── invitations_custom.py # Gestión de invitaciones
│   │   ├── checkin_custom.py   # Check-in y validación biométrica
│   │   └── config.py           # Endpoint de configuración
│   ├── services/               # Lógica de negocio
│   │   ├── events.py           # Servicio de eventos
│   │   ├── attendees.py        # Servicio de asistentes
│   │   ├── invitations.py      # Servicio de invitaciones
│   │   ├── checkins.py         # Servicio de check-ins
│   │   ├── biometric_validations.py # Servicio de validaciones
│   │   ├── user_roles.py       # Servicio de roles
│   │   └── database.py         # Inicialización de BD
│   ├── schemas/                # Esquemas Pydantic
│   ├── main.py                 # Punto de entrada
│   ├── requirements.txt        # Dependencias Python
│   └── .env                    # Variables de entorno
│
├── frontend/                   # Frontend React
│   ├── public/                 # Archivos estáticos
│   │   ├── manifest.json       # Manifest PWA
│   │   ├── sw.js               # Service Worker
│   │   └── images/             # Imágenes del proyecto
│   ├── src/
│   │   ├── components/         # Componentes reutilizables
│   │   │   ├── Layout.tsx      # Layout principal
│   │   │   ├── QRCodeDisplay.tsx # Mostrar QR
│   │   │   ├── QRScanner.tsx   # Escanear QR
│   │   │   ├── CameraCapture.tsx # Captura de foto
│   │   │   └── ui/             # Componentes shadcn-ui
│   │   ├── contexts/           # Contextos React
│   │   │   ├── AuthContext.tsx # Contexto de autenticación (legacy)
│   │   │   └── AuthContextSimple.tsx # Contexto JWT
│   │   ├── lib/                # Utilidades
│   │   │   ├── api.ts          # Cliente API (legacy)
│   │   │   └── auth-simple.ts  # Cliente de autenticación JWT
│   │   ├── pages/              # Páginas por rol
│   │   │   ├── Login.tsx       # Página de login (legacy)
│   │   │   ├── LoginSimple.tsx # Página de login JWT
│   │   │   ├── Dashboard.tsx   # Dashboard principal
│   │   │   ├── AuthCallback.tsx # Callback de auth
│   │   │   ├── RoleSelector.tsx # Selector de roles
│   │   │   ├── admin/          # Páginas de administrador
│   │   │   │   ├── Events.tsx
│   │   │   │   ├── Attendees.tsx
│   │   │   │   └── Invitations.tsx
│   │   │   ├── approver/       # Páginas de aprobador
│   │   │   │   └── PendingApprovals.tsx
│   │   │   ├── staff/          # Páginas de staff
│   │   │   │   └── CheckIn.tsx
│   │   │   └── attendee/       # Páginas de asistente
│   │   │       └── MyInvitations.tsx
│   │   ├── App.tsx             # Componente raíz
│   │   └── main.tsx            # Punto de entrada
│   ├── package.json
│   └── vite.config.ts
│
├── README.md                   # Este archivo
└── ARCHITECTURE.md             # Documentación de arquitectura detallada
```

## 🔐 Sistema de Autenticación

### Arquitectura JWT

El sistema utiliza autenticación JWT (JSON Web Tokens) personalizada:

**Características:**
- Tokens JWT firmados con HS256
- Expiración de 7 días
- Almacenamiento en localStorage
- Refresh automático en cada petición
- Usuarios demo precargados

**Flujo de Autenticación:**
```
1. Usuario ingresa email/password
2. Backend verifica credenciales (Check rápido en memoria para demo users)
3. Backend genera JWT incluyendo el ROL del usuario (evita consulta a DB)
4. Frontend almacena token en localStorage
5. Todas las peticiones incluyen header Authorization: Bearer <token>
6. Backend valida token en cada petición (CPU-bound, sin I/O bloqueante)
```

**Endpoints de Autenticación:**
- `POST /api/v1/auth-simple/login` - Login con email/password
- `GET /api/v1/auth-simple/me` - Obtener usuario actual
- `GET /api/v1/auth-simple/users` - Listar usuarios (admin)

### Configuración de Red

**IMPORTANTE:** El sistema está configurado para funcionar en un entorno de red local:

- **Backend URL:** `http://localhost:8000`
- **Frontend URL:** `http://100.91.28.70:3002`
- **Razón:** El puerto 8000 no es accesible externamente, por lo que el frontend usa localhost para comunicarse con el backend en el mismo servidor.

**Nota de Despliegue:** Para producción, se debe configurar un proxy inverso (nginx/Apache) o exponer el backend correctamente.

## 🔐 Roles y Permisos

### ADMIN (Administrador)
- Crear y gestionar eventos
- Registrar asistentes
- Generar invitaciones con QR
- Ver reportes y estadísticas
- Revocar/regenerar invitaciones

### APROBADOR
- Ver invitaciones pendientes de aprobación
- Aprobar o rechazar invitaciones
- Agregar observaciones al rechazar

### STAFF (Personal de Puerta)
- Escanear códigos QR
- Realizar validación biométrica facial
- Validación manual con huella dactilar
- Registrar check-in de asistentes

### ASISTENTE
- Activar invitaciones con código OTP
- Ver estado de sus invitaciones
- Mostrar código QR para acceso
- Copiar/compartir link de invitación

## 🔄 Flujo de Trabajo

### 1. Creación de Evento (ADMIN)
```
Admin → Eventos → Nuevo Evento → Llenar formulario → Crear
```

### 2. Registro de Asistente (ADMIN)
```
Admin → Asistentes → Nuevo Asistente → Ingresar datos → Registrar
```

### 3. Generación de Invitación (ADMIN)
```
Admin → Invitaciones → Generar → Seleccionar Evento + Asistente → Generar
Sistema genera: Token QR único + Código de activación OTP
```

### 4. Activación por Asistente (ASISTENTE)
```
Asistente → Mis Invitaciones → Activar → Ingresar email/teléfono + código OTP
Estado cambia: GENERADO → PENDIENTE_APROBACION
```

### 5. Aprobación (APROBADOR)
```
Aprobador → Aprobaciones Pendientes → Ver detalle → Aprobar/Rechazar
Estado cambia: PENDIENTE_APROBACION → APROBADO/RECHAZADO
```

### 6. Check-in (STAFF)
```
Staff → Check-in → Escanear QR → Validar token
↓
Capturar foto del asistente → Validación biométrica con AI
↓
Si MATCH (score >= 75%): Acceso permitido → Estado: USADO
Si NO MATCH: Validación manual requerida
↓
Validación Manual: Verificar documento + Código de huella dactilar
Si correcto: Acceso permitido → Estado: USADO
```

## 🚀 Instalación y Ejecución

### Requisitos Previos
- Node.js 18+ y pnpm
- Python 3.10+
- SQLite (incluido en Python)

### Instalación

```bash
# 1. Instalar dependencias del frontend
cd app/frontend
pnpm install

# 2. Instalar dependencias del backend
cd ../backend
pip install -r requirements.txt

# 3. Configurar variables de entorno (backend)
# Crear archivo .env en app/backend/ con:
DATABASE_URL=sqlite:///./eventaccess.db
SECRET_KEY=your-secret-key-here-change-in-production
```

### Ejecución

```bash
# Terminal 1: Backend (desde app/backend)
uvicorn main:app --host 0.0.0.0 --port 8000 --reload

# Terminal 2: Frontend (desde app/frontend)
pnpm run dev --host 0.0.0.0 --port 3002
```

**URLs de Acceso:**
- Frontend: `http://localhost:3002` o `http://<tu-ip>:3002`
- Backend API: `http://localhost:8000`
- Documentación API: `http://localhost:8000/docs`

## 👥 Usuarios Demo

| Rol | Email | Password | Descripción |
|-----|-------|----------|-------------|
| ADMIN | admin@demo.com | demo123 | Gestión completa del sistema |
| APROBADOR | aprobador@demo.com | demo123 | Aprobación de invitaciones |
| STAFF | staff@demo.com | demo123 | Check-in en puerta |
| ASISTENTE | asistente@demo.com | demo123 | Usuario final |

**Nota:** Estos usuarios se crean automáticamente al iniciar el backend por primera vez.

## 🧪 Flujo de Prueba Paso a Paso

### Escenario Completo: Desde Creación hasta Check-in

#### Paso 1: Login como ADMIN
```
1. Ir a http://localhost:3002
2. Ingresar: admin@demo.com / demo123
3. Clic en "Iniciar Sesión"
```

#### Paso 2: Crear Evento
```
1. Dashboard → Eventos
2. Clic en "Nuevo Evento"
3. Llenar:
   - Nombre: "Conferencia Tech 2026"
   - Ubicación: "Centro de Convenciones"
   - Fecha: 2026-02-15
   - Hora inicio: 09:00
   - Hora fin: 18:00
4. Crear Evento
```

#### Paso 3: Registrar Asistente
```
1. Dashboard → Asistentes
2. Clic en "Nuevo Asistente"
3. Llenar:
   - Identificación: 1234567890
   - Nombre: Carlos Rodríguez
   - Email: carlos@example.com
   - Teléfono: +57 300 123 4567
   - Código Huella: FP-001-DEMO-XYZ789
4. Registrar
```

#### Paso 4: Generar Invitación
```
1. Dashboard → Invitaciones
2. Clic en "Generar Invitación"
3. Seleccionar:
   - Evento: Conferencia Tech 2026
   - Asistente: Carlos Rodríguez
4. Generar
5. Guardar código de activación mostrado (ej: 123456)
```

#### Paso 5: Activar como Asistente
```
1. Cerrar sesión
2. Login como: asistente@demo.com / demo123
3. Mis Invitaciones → Activar Invitación
4. Ingresar:
   - Email: carlos@example.com
   - Código: 123456
5. Activar
```

#### Paso 6: Aprobar como APROBADOR
```
1. Cerrar sesión
2. Login como: aprobador@demo.com / demo123
3. Aprobaciones Pendientes
4. Ver invitación de Carlos Rodríguez
5. Clic en "Aprobar"
```

#### Paso 7: Ver QR como Asistente
```
1. Cerrar sesión
2. Login como: asistente@demo.com / demo123
3. Mis Invitaciones
4. Clic en "Ver Mi Código QR"
5. Guardar/capturar QR
```

#### Paso 8: Check-in como STAFF
```
1. Cerrar sesión
2. Login como: staff@demo.com / demo123
3. Check-in → Escanear Código QR
4. Escanear QR del asistente
5. Capturar foto del asistente
6. Sistema valida biométricamente
7. Si falla: Validación manual
   - Verificar documento
   - Ingresar código huella: FP-001-DEMO-XYZ789
8. Acceso permitido ✅
```

## 🔒 Seguridad Implementada

1. **JWT Tokens**: Autenticación segura con tokens firmados
2. **Bcrypt**: Hashing de contraseñas con salt
3. **Tokens Opacos**: QR contiene solo token, no datos personales
4. **Hashing**: Tokens hasheados en BD (SHA-256)
5. **Uso Único**: Validación atómica, token marcado como USADO
6. **Roles y Permisos**: Guards en rutas por rol
7. **Auditoría**: Registro de quién aprobó y quién hizo check-in
8. **Validación Biométrica**: AI para comparación facial (simulada en MVP)
9. **Fallback Manual**: Huella dactilar + documento ID

## 🎯 Estados de Invitación

| Estado | Descripción |
|--------|-------------|
| GENERADO | Invitación creada, pendiente de activación |
| ACTIVADO | Asistente activó con OTP (no usado en flujo actual) |
| PENDIENTE_APROBACION | Esperando aprobación del APROBADOR |
| APROBADO | Aprobada, QR listo para usar |
| RECHAZADO | Rechazada por APROBADOR |
| USADO | Check-in completado |
| REVOCADO | Cancelada por ADMIN |
| EXPIRADO | Fecha del evento pasó |

## 📱 Características PWA

- ✅ Instalable en dispositivos móviles
- ✅ Funciona offline (caché básico)
- ✅ Icono en pantalla de inicio
- ✅ Splash screen
- ✅ Responsive design (mobile-first)
- ✅ Service Worker registrado

## 🔧 Configuración Adicional

### Variables de Entorno (Backend)

Crear archivo `app/backend/.env`:

```env
# Base de datos
DATABASE_URL=sqlite:///./eventaccess.db

# JWT Secret (cambiar en producción)
SECRET_KEY=your-super-secret-key-change-in-production-min-32-chars

# Configuración JWT
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_DAYS=7
```

### Personalización
- Colores: Modificar `tailwind.config.js`
- Componentes UI: Carpeta `src/components/ui`
- Rutas API: `backend/routers/`
- Modelos de datos: `backend/models/`

## 🐛 Troubleshooting

### Problema: Error de autenticación / NetworkError
**Solución**: 
1. Verificar que el backend esté corriendo en `http://localhost:8000`
2. Limpiar caché del navegador (Ctrl+Shift+R)
3. Verificar que `auth-simple.ts` use `http://localhost:8000`
4. Revisar logs del backend en terminal

### Problema: Pantalla en blanco
**Solución**:
1. Abrir consola del navegador (F12)
2. Verificar errores en la pestaña Console
3. Limpiar localStorage: `localStorage.clear()`
4. Recargar con Ctrl+Shift+R

### Problema: Cámara no funciona
**Solución**: Verificar permisos del navegador, usar HTTPS en producción

### Problema: QR no escanea
**Solución**: Asegurar buena iluminación, probar con otro dispositivo

### Problema: Base de datos no conecta
**Solución**: 
1. Verificar que existe `app/backend/eventaccess.db`
2. Revisar permisos de escritura en carpeta backend
3. Verificar variable `DATABASE_URL` en `.env`

### Problema: Puerto 8000 ya en uso
**Solución**:
```bash
# Linux/Mac
lsof -ti:8000 | xargs kill -9

# Windows
netstat -ano | findstr :8000
taskkill /PID <PID> /F
```

### Problema: Login colgado o lento
**Causa**: Procesos de Python "zombie" bloqueando el puerto o archivos de base de datos.
**Solución**:
1. Detener todos los procesos de terminal.
2. Verificar en Administrador de Tareas que no haya `python.exe` sueltos.
3. Reiniciar el backend. El código ya está optimizado para no usar DB en login.

### Problema: "Invalid activation code"
**Solución**: Asegúrate de usar el **código numérico de 6 dígitos** (ej: 354724) y NO el token largo que empieza con `INV-...`. El token largo es solo para el QR.

## 📊 Datos de Prueba Incluidos

El sistema crea automáticamente al iniciar:
- 4 Usuarios demo (admin, aprobador, staff, asistente)
- 2 Eventos de ejemplo
- 2 Asistentes de prueba
- 3 Invitaciones en diferentes estados

## 🚧 Limitaciones del MVP

1. **Validación Biométrica**: Simulada (en producción usar Gemini 2.5 Pro o servicio especializado)
2. **API Registro Civil**: Simulada (integración pendiente)
3. **Notificaciones**: No implementadas (email/SMS)
4. **Reportes**: Básicos (pendiente dashboard avanzado)
5. **Pago**: No implementado
6. **Base de Datos**: SQLite (para producción usar PostgreSQL/MySQL)
7. **Escalabilidad**: Configuración para desarrollo local

## 🔮 Próximos Pasos (Post-MVP)

1. Migrar a PostgreSQL para producción
2. Integrar AI real para validación biométrica (Gemini 2.5 Pro)
3. Implementar notificaciones push/email/SMS
4. Dashboard de reportes y analytics
5. Exportación de datos (CSV, PDF)
6. Multi-idioma (i18n)
7. Modo oscuro
8. Integración con sistemas de pago
9. App móvil nativa (React Native)
10. Configurar proxy inverso (nginx) para producción
11. Implementar rate limiting y CORS adecuado
12. Agregar tests unitarios y de integración

## 📞 Soporte

Para preguntas o problemas:
1. Revisar este README y ARCHITECTURE.md
2. Verificar logs del backend en terminal
3. Revisar consola del navegador (F12)
4. Consultar documentación de FastAPI: https://fastapi.tiangolo.com
5. Consultar documentación de React: https://react.dev

## 📄 Licencia

Prototipo MVP para demostración. Uso educativo y de prueba.

---

**Desarrollado con ❤️ usando React, FastAPI y autenticación JWT**

**Última actualización:** Enero 2026# EventsAdmg
# EventsAdmg
