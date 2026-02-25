# Análisis de flujo de invitaciones y trazabilidad (base para módulo de auditorías)

## 1) Flujo actual implementado (según código)

1. **Generación (ADMIN)**
   - Endpoint: `POST /api/v1/invitations/generate`.
   - Crea token QR, `activation_code`, y deja estado en `GENERADO`.
   - También persiste `created_at`/`updated_at` y opcionalmente foto biométrica.

2. **Activación (ASISTENTE, endpoint público)**
   - Endpoint: `POST /api/v1/invitations/activate`.
   - Busca asistente por email o teléfono, valida código de activación y solo permite continuar si la invitación está en `GENERADO`.
   - Cambia estado a `PENDIENTE_APROBACION`.

3. **Aprobación / Rechazo (APROBADOR)**
   - Endpoint: `POST /api/v1/invitations/approve`.
   - Requiere que el estado actual sea `PENDIENTE_APROBACION`.
   - Cambia a `APROBADO` o `RECHAZADO`; guarda `approved_by`, `approved_at` y opcional `rejection_reason`.

4. **Consumo en acceso (STAFF)**
   - Endpoints de check-in (`/api/v1/checkin/validate-qr` y `/api/v1/checkin/qr-checkin`).
   - Solo permite acceso/check-in si la invitación está en `APROBADO`.
   - Al completar check-in, se marca `USADO` y se persiste `used_at`.

## 2) Riesgos de trazabilidad detectados hoy

1. **Actualización genérica sin reglas de estado**
   - Existe `PUT /api/v1/entities/invitations/{id}` y batch update sin validación de transición de estado.
   - Permite modificar campos sensibles (`status`, `token`, `activation_code`, `approved_at`, `used_at`, `created_at`) sin máquina de estados.

2. **Borrado físico habilitado**
   - Existe `DELETE /api/v1/entities/invitations/{id}` y batch delete.
   - Si se usa en producción, puede romper trazabilidad y auditoría histórica.

3. **Sin bitácora de cambios de invitación (before/after) en flujo principal**
   - Aunque existe tabla `security_audit_logs`, el flujo de invitaciones no registra consistentemente cada transición/edición.

4. **Inconsistencia documental vs implementación**
   - La arquitectura menciona activación con JWT, pero el endpoint de activación actual es público.
   - También se documenta `REVOCADO`/`EXPIRADO`, pero no hay transición explícita implementada en el flujo principal de invitaciones simples.

## 3) Regla de negocio recomendada: ¿hasta cuándo se puede editar?

> Recomendación para no perder trazabilidad ni abrir huecos de control:

### 3.1 Ventana de edición

- **Editable completo solo en `GENERADO`** y antes de activación.
- **Editable parcial en `PENDIENTE_APROBACION`** únicamente campos no críticos (ej. observaciones operativas), nunca token/código/relaciones base.
- **No editable en `APROBADO`, `RECHAZADO`, `USADO`** (solo acciones de negocio explícitas: revocar, reactivar por nuevo ciclo, etc.).

### 3.2 Campos que deben volverse inmutables después de crear

- `token`, `token_plain`, `activation_code`.
- `attendee_id`, `event_id` (si cambia, debe crearse nueva invitación y cerrar la anterior).
- `created_at` siempre inmutable.

### 3.3 Acciones permitidas por estado (matriz propuesta)

| Estado | Acción | ¿Permitir? | Comentario |
|---|---|---:|---|
| GENERADO | Editar datos operativos | Sí | Dentro de ventana de edición |
| GENERADO | Activar OTP | Sí | `GENERADO -> PENDIENTE_APROBACION` |
| PENDIENTE_APROBACION | Aprobar/Rechazar | Sí | Acción de APROBADOR |
| APROBADO | Check-in | Sí | `APROBADO -> USADO` |
| APROBADO | Editar invitación | No | Solo `REVOCAR` (acción explícita) |
| RECHAZADO | Editar para reintentar | No* | Mejor crear nueva versión/invitación |
| USADO | Cualquier edición | No | Registro histórico cerrado |

## 4) ¿Cuándo habilitar actualización?

### 4.1 Opción recomendada (segura para auditoría)

Habilitar `update` **solo en backend** y con una política por estado:

- `UPDATE_ALLOWED_STATES = {GENERADO}` para edición normal.
- Un endpoint separado para decisiones (`approve/reject`) y otro para consumo (`checkin`).
- Cualquier excepción (ej. corrección de typo en nombre) vía endpoint administrativo especial con:
  - motivo obligatorio,
  - actor,
  - snapshot before/after,
  - ticket/incidente asociado.

### 4.2 Control técnico mínimo

1. Validar transiciones en servicio (`InvitationsService.update`) o capa de dominio.
2. Bloquear cambios de campos inmutables si estado != `GENERADO`.
3. Deshabilitar `DELETE` físico en producción (usar `status=ANULADO/REVOCADO` + timestamp + actor).
4. Registrar cada acción en auditoría con `event_type` semántico:
   - `INVITATION_CREATED`
   - `INVITATION_ACTIVATED`
   - `INVITATION_APPROVED`
   - `INVITATION_REJECTED`
   - `INVITATION_CHECKED_IN`
   - `INVITATION_UPDATED_ADMIN_OVERRIDE`
   - `INVITATION_REVOKED`

## 5) Diseño sugerido para trazabilidad sin pérdida

- Agregar tabla de historial, por ejemplo `invitation_status_history`:
  - `invitation_id`, `from_status`, `to_status`, `changed_by`, `changed_at`, `reason`, `source_endpoint`, `request_id`.
- Agregar log de cambios de campos críticos, por ejemplo `invitation_change_log`:
  - `invitation_id`, `field`, `old_value`, `new_value`, `changed_by`, `changed_at`, `reason`.
- Mantener `security_audit_logs` para auditoría transversal de seguridad/acciones, pero no como único mecanismo de trazabilidad funcional.

## 6) Plan corto de endurecimiento (antes de módulo de auditoría)

1. Cerrar `PUT`/`DELETE` genéricos de invitaciones para perfiles no administrativos.
2. Implementar guardas de transición de estado en backend (fail-fast con 409).
3. Definir inmutabilidad de campos críticos en esquema de negocio.
4. Registrar eventos de invitación en bitácora funcional (historial).
5. Después de esto, construir módulo de auditoría (consultas/reportes/export) encima de esos eventos.

---

Este documento se creó para apoyar tus pruebas actuales y reducir riesgo de pérdida de trazabilidad cuando implementes el módulo de auditorías.
