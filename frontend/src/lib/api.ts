import { authSimple } from './auth-simple';
import { config } from './config';

export interface Event {
  id: number;
  name: string;
  description: string;
  location: string;
  event_date: string;
  start_time: string;
  end_time: string;
  status: string;
  created_by: string;
  user_id: string;
  created_at: string;
  updated_at: string;
}

export interface Attendee {
  id: number;
  identification: string;
  full_name: string;
  email: string;
  phone: string;
  fingerprint_code?: string;
  is_active?: boolean;
  face_photo_url?: string;
  id_document_url?: string;
  user_id: string;
  created_at: string;
  updated_at: string;
}

export interface Invitation {
  id: number;
  event_id: number;
  attendee_id: number;
  token: string;
  token_plain: string;
  status: string;
  user_id: string;
  created_at: string;
  updated_at: string;
  biometric_photo?: string;
  activation_code?: string;
}

export interface InvitationDetail {
  id: number;
  event_id: number;
  event_name: string;
  attendee_id: number;
  attendee_name: string;
  attendee_email: string;
  attendee_phone: string | null;
  status: string;
  created_at: string;
  token_plain: string;
  activation_code?: string;
  biometric_photo?: string;
}

export interface CheckIn {
  id: number;
  invitation_id: number;
  check_in_time: string;
  check_in_method: string;
  verified_by: string;
  notes?: string;
  user_id: string;
  created_at: string;
}

export interface RecentCheckIn {
  id: number;
  checked_in_at: string;
  attendee_name: string;
  attendee_identification?: string | null;
  event_id: number;
  event_name?: string | null;
  participant_role?: string | null;
  validation_method?: string | null;
  gate?: string | null;
}

export interface BiometricValidation {
  id: number;
  invitation_id: number;
  validation_type: string;
  validation_result: string;
  confidence_score?: number;
  validated_at: string;
  validated_by: string;
  user_id: string;
  created_at: string;
}

export interface UserRole {
  id: number;
  user_id: string;
  role: string;
  created_at: string;
  updated_at: string;
}

export const api = {
  auth: {
    me: async () => {
      return await authSimple.me();
    },
    login: async (email: string, password: string) => {
      return await authSimple.login(email, password);
    },
    logout: async () => {
      return await authSimple.logout();
    },
  },

  events: {
    list: async (params?: {
      search?: string;
      date_from?: string;
      date_to?: string;
      status?: string;
      sort?: string;
      skip?: number;
      limit?: number;
    }) => {
      const qs = new URLSearchParams();
      if (params?.search) qs.set('search', params.search);
      if (params?.date_from) qs.set('date_from', params.date_from);
      if (params?.date_to) qs.set('date_to', params.date_to);
      if (params?.status) qs.set('status', params.status);
      if (params?.sort) qs.set('sort', params.sort);
      if (params?.skip !== undefined) qs.set('skip', String(params.skip));
      if (params?.limit !== undefined) qs.set('limit', String(params.limit));

      const url = qs.toString()
        ? `/api/v1/entities/events/all?${qs.toString()}`
        : '/api/v1/entities/events/all';
      const res = await authSimple.fetch(url);
      if (!res.ok) throw new Error('Error al cargar eventos');
      return await res.json();
    },
    create: async (data: Partial<Event>) => {
      const user = await authSimple.me();
      const now = new Date().toISOString();

      // Ensure event_date is a full ISO datetime string
      let eventDate = data.event_date;
      if (eventDate && eventDate.length === 10) {
        // If only date (YYYY-MM-DD), append a default time
        eventDate = `${eventDate}T${data.start_time || '00:00'}:00`;
      }

      const eventData = {
        ...data,
        event_date: eventDate,
        status: data.status || 'ACTIVE',
        created_by: user.id,
        created_at: now,
        updated_at: now,
      };
      const res = await authSimple.fetch('/api/v1/entities/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(eventData),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw { data: errData, message: 'Error al crear evento' };
      }
      return await res.json();
    },
    update: async (id: number, data: Partial<Event>) => {
      const res = await authSimple.fetch(`/api/v1/entities/events/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Error al actualizar evento');
      return await res.json();
    },
    delete: async (id: number) => {
      const res = await authSimple.fetch(`/api/v1/entities/events/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Error al eliminar evento');
      return await res.json();
    },
  },

  attendees: {
    list: async () => {
      const res = await authSimple.fetch('/api/v1/entities/attendees/all');
      if (!res.ok) throw new Error('Error al cargar asistentes');
      return await res.json();
    },
    lookupByCedula: async (cedula: string) => {
      const res = await authSimple.fetch(`/api/v1/entities/attendees/lookup?cedula=${encodeURIComponent(cedula)}`);
      if (!res.ok) {
        const errData = await res.json();
        throw { data: errData, message: 'Error al buscar asistente' };
      }
      return await res.json();
    },
    create: async (data: Partial<Attendee>) => {
      const now = new Date().toISOString();
      const attendeeData = {
        ...data,
        created_at: now,
        updated_at: now,
      };
      const res = await authSimple.fetch('/api/v1/entities/attendees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(attendeeData),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw { data: errData, message: 'Error al registrar asistente' };
      }
      return await res.json();
    },
    update: async (id: number, data: Partial<Attendee>) => {
      const res = await authSimple.fetch(`/api/v1/entities/attendees/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Error al actualizar asistente');
      return await res.json();
    },
    delete: async (id: number) => {
      const res = await authSimple.fetch(`/api/v1/entities/attendees/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Error al eliminar asistente');
      return await res.json();
    },
  },

  invitations: {
    list: async () => {
      const res = await authSimple.fetch('/api/v1/entities/invitations/all');
      if (!res.ok) throw new Error('Error al cargar invitaciones');
      return await res.json();
    },
    generate: async (event_id: number, attendee_id: number, biometric_photo?: string) => {
      const res = await authSimple.fetch('/api/v1/invitations/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id, attendee_id, biometric_photo }),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw { data: errData, message: 'Error al generar invitación' };
      }
      return await res.json();
    },
    approve: async (id: number, approved: boolean, rejection_reason?: string) => {
      const res = await authSimple.fetch('/api/v1/invitations/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invitation_id: id,
          approved,
          rejection_reason
        }),
      });
      if (!res.ok) throw new Error('Error al procesar invitación');
      return await res.json();
    },
    getPendingApprovals: async () => {
      const res = await authSimple.fetch('/api/v1/invitations/pending-approvals');
      if (!res.ok) throw new Error('Error al cargar aprobaciones pendientes');
      return await res.json();
    },
    getMyInvitations: async () => {
      const res = await authSimple.fetch('/api/v1/invitations/my-invitations');
      if (!res.ok) throw new Error('Error al cargar mis invitaciones');
      return await res.json();
    },
    activate: async (email_or_phone: string, activation_code: string) => {
      const res = await authSimple.fetch('/api/v1/invitations/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email_or_phone, activation_code }),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw { data: errData, message: 'Error al activar invitación' };
      }
      return await res.json();
    },
  },

  invitationGroups: {
    list: async (params?: { skip?: number; limit?: number }) => {
      const qs = new URLSearchParams();
      if (params?.skip !== undefined) qs.set('skip', String(params.skip));
      if (params?.limit !== undefined) qs.set('limit', String(params.limit));
      const url = qs.toString()
        ? `/api/v1/invitation-groups?${qs.toString()}`
        : '/api/v1/invitation-groups';
      const res = await authSimple.fetch(url);
      if (!res.ok) throw new Error('Error al cargar invitaciones por grupo');
      return await res.json();
    },
    resend: async (id: number) => {
      const res = await authSimple.fetch(`/api/v1/invitation-groups/${id}/resend`, {
        method: 'POST',
      });
      if (!res.ok) {
        const errData = await res.json();
        throw { data: errData, message: 'Error al reenviar invitación' };
      }
      return await res.json();
    },
    create: async (data: {
      event_id: number;
      titular_name: string;
      titular_identification: string;
      fingerprint_code?: string;
      email?: string;
      phone?: string;
      group_size?: number;
      send_email?: boolean;
      send_email_cc?: boolean;
      intransferible?: boolean;
      companions?: Array<{
        name: string;
        cedula: string;
        email: string;
        telefono: string;
        codigo: string;
      }>;
    }) => {
      const res = await authSimple.fetch('/api/v1/invitation-groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw { data: errData, message: 'Error al crear invitación por grupo' };
      }
      return await res.json();
    },
    update: async (
      id: number,
      data: {
        event_id?: number;
        titular_name?: string;
        titular_identification?: string;
        fingerprint_code?: string;
        email?: string;
        phone?: string;
        group_size?: number;
        send_email?: boolean;
        send_email_cc?: boolean;
        intransferible?: boolean;
        companions?: Array<{
          name: string;
          cedula: string;
          email: string;
          telefono: string;
          codigo: string;
        }>;
      }
    ) => {
      const res = await authSimple.fetch(`/api/v1/invitation-groups/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw { data: errData, message: 'Error al editar invitación por grupo' };
      }
      return await res.json();
    },
    pendingApprovals: async () => {
      const res = await authSimple.fetch('/api/v1/invitation-groups/pending-approvals');
      if (!res.ok) throw new Error('Error al cargar aprobaciones pendientes');
      return await res.json();
    },
    approve: async (data: {
      invitation_id: number;
      approved?: boolean;
      rejection_reason?: string;
      participants?: Array<{
        role: 'titular' | 'acompanante';
        index?: number;
        approved: boolean;
        rejection_reason?: string;
      }>;
    }) => {
      const res = await authSimple.fetch('/api/v1/invitation-groups/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw { data: errData, message: 'Error al aprobar invitación' };
      }
      return await res.json();
    },
    requestUpdate: async (
      id: number,
      data?: {
        reason?: string;
        participants?: Array<{
          role: 'titular' | 'acompanante';
          index?: number;
        }>;
      }
    ) => {
      const res = await authSimple.fetch(`/api/v1/invitation-groups/${id}/request-update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data || {}),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw { data: errData, message: 'Error al solicitar actualización' };
      }
      return await res.json();
    },
    statusHistory: async (params?: {
      skip?: number;
      limit?: number;
      search?: string;
      event_id?: number;
      to_status?: string;
    }) => {
      const qs = new URLSearchParams();
      if (params?.skip !== undefined) qs.set('skip', String(params.skip));
      if (params?.limit !== undefined) qs.set('limit', String(params.limit));
      if (params?.search) qs.set('search', params.search);
      if (params?.event_id !== undefined) qs.set('event_id', String(params.event_id));
      if (params?.to_status) qs.set('to_status', params.to_status);
      const url = qs.toString()
        ? `/api/v1/invitation-groups/status-history/all?${qs.toString()}`
        : '/api/v1/invitation-groups/status-history/all';
      const res = await authSimple.fetch(url);
      if (!res.ok) throw new Error('Error al cargar historial de estados');
      return await res.json();
    },
  },

  publicInvitations: {
    getByToken: async (token: string) => {
      const url = `${config.API_BASE_URL}/api/v1/invitation-groups/public/${token}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Token inválido o expirado');
      return await res.json();
    },
    register: async (token: string, data: any) => {
      const url = `${config.API_BASE_URL}/api/v1/invitation-groups/public/${token}/register`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw { data: errData, message: 'Error al registrar invitación' };
      }
      return await res.json();
    },
    upload: async (
      token: string,
      data: { role: string; kind: string; companion_index?: number; file: File }
    ) => {
      const formData = new FormData();
      formData.append('role', data.role);
      formData.append('kind', data.kind);
      if (data.companion_index !== undefined) {
        formData.append('companion_index', String(data.companion_index));
      }
      formData.append('file', data.file);
      const url = `${config.API_BASE_URL}/api/v1/invitation-groups/public/${token}/upload`;
      const res = await fetch(url, { method: 'POST', body: formData });
      if (!res.ok) {
        const errData = await res.json();
        throw { data: errData, message: 'Error al subir archivo' };
      }
      return await res.json();
    },
  },

  checkIns: {
    parseError: async (res: Response, fallback: string) => {
      try {
        const errData = await res.json();
        if (typeof errData?.detail === 'string') return errData.detail;
        if (typeof errData?.message === 'string') return errData.message;
      } catch (_) {
        // Ignore parse errors and return fallback message.
      }
      return fallback;
    },
    create: async (data: Partial<CheckIn>) => {
      const res = await authSimple.fetch('/api/v1/checkin/check-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Error al realizar check-in');
      return await res.json();
    },
    validateQR: async (token: string) => {
      const res = await authSimple.fetch('/api/v1/checkin/validate-qr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) throw new Error(await api.checkIns.parseError(res, 'Error al validar QR'));
      return await res.json();
    },
    qrCheckIn: async (token: string, gate: string = 'Main Gate') => {
      const res = await authSimple.fetch('/api/v1/checkin/qr-checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, gate }),
      });
      if (!res.ok) throw new Error(await api.checkIns.parseError(res, 'Error al registrar check-in por QR'));
      return await res.json();
    },
    validateBiometric: async (invitation_id: number, captured_photo_base64: string) => {
      const res = await authSimple.fetch('/api/v1/checkin/validate-biometric', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invitation_id, captured_photo_base64 }),
      });
      if (!res.ok) throw new Error(await api.checkIns.parseError(res, 'Error al validar biométrico'));
      return await res.json();
    },
    manualValidate: async (invitation_id: number, fingerprint_code: string) => {
      const res = await authSimple.fetch('/api/v1/checkin/manual-validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invitation_id, fingerprint_code }),
      });
      if (!res.ok) throw new Error(await api.checkIns.parseError(res, 'Error al validar manualmente'));
      return await res.json();
    },
    recent: async (params?: { skip?: number; limit?: number; search?: string; event_id?: number }) => {
      const qs = new URLSearchParams();
      if (params?.skip !== undefined) qs.set('skip', String(params.skip));
      if (params?.limit !== undefined) qs.set('limit', String(params.limit));
      if (params?.search) qs.set('search', params.search);
      if (params?.event_id !== undefined) qs.set('event_id', String(params.event_id));
      const endpoint = qs.toString() ? `/api/v1/checkin/recent?${qs.toString()}` : '/api/v1/checkin/recent';
      const res = await authSimple.fetch(endpoint);
      if (!res.ok) throw new Error(await api.checkIns.parseError(res, 'Error al cargar ingresos recientes'));
      return await res.json();
    },
  },

  roles: {
    getUserRole: async () => {
      const res = await authSimple.fetch('/api/v1/auth/role');
      if (!res.ok) throw new Error('Error al obtener rol');
      return await res.json();
    },
    setUserRole: async (role: string) => {
      const res = await authSimple.fetch('/api/v1/auth/role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) throw new Error('Error al asignar rol');
      return await res.json();
    },
  },

  staffUsers: {
    list: async (params?: { skip?: number; limit?: number; search?: string }) => {
      const qs = new URLSearchParams();
      if (params?.skip !== undefined) qs.set('skip', String(params.skip));
      if (params?.limit !== undefined) qs.set('limit', String(params.limit));
      if (params?.search) qs.set('search', params.search);
      const url = qs.toString()
        ? `/api/v1/staff-users?${qs.toString()}`
        : '/api/v1/staff-users';
      const res = await authSimple.fetch(url);
      if (!res.ok) throw new Error('Error al cargar usuarios staff');
      return await res.json();
    },
    create: async (data: {
      name: string;
      email: string;
      password: string;
      role?: string;
      is_active?: boolean;
    }) => {
      const res = await authSimple.fetch('/api/v1/staff-users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err?.detail || 'Error al crear usuario staff');
      }
      return await res.json();
    },
    update: async (
      id: string,
      data: { name?: string; email?: string; password?: string; role?: string; is_active?: boolean }
    ) => {
      const res = await authSimple.fetch(`/api/v1/staff-users/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err?.detail || 'Error al actualizar usuario staff');
      }
      return await res.json();
    },
    toggleActive: async (id: string) => {
      const res = await authSimple.fetch(`/api/v1/staff-users/${id}/toggle-active`, {
        method: 'POST',
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err?.detail || 'Error al actualizar estado de usuario staff');
      }
      return await res.json();
    },
  },

  rbac: {
    roles: async () => {
      const res = await authSimple.fetch('/api/v1/rbac/roles');
      if (!res.ok) throw new Error('Error al cargar roles');
      return await res.json();
    },
    permissions: async () => {
      const res = await authSimple.fetch('/api/v1/rbac/permissions');
      if (!res.ok) throw new Error('Error al cargar permisos');
      return await res.json();
    },
    getRole: async (roleId: number) => {
      const res = await authSimple.fetch(`/api/v1/rbac/roles/${roleId}`);
      if (!res.ok) throw new Error('Error al cargar detalle del rol');
      return await res.json();
    },
    updateRolePermissions: async (roleId: number, permissionCodes: string[]) => {
      const res = await authSimple.fetch(`/api/v1/rbac/roles/${roleId}/permissions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permission_codes: permissionCodes }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err?.detail || 'Error al actualizar permisos del rol');
      }
      return await res.json();
    },
    catalog: async () => {
      const [roles, permissions] = await Promise.all([api.rbac.roles(), api.rbac.permissions()]);
      const roleDetails = await Promise.all((roles || []).map((r: any) => api.rbac.getRole(r.id)));
      return {
        roles: roleDetails,
        permissions,
      };
    },
  },

  settings: {
    get: async () => {
      const res = await authSimple.fetch('/api/v1/admin/settings');
      if (!res.ok) throw new Error('Error al cargar configuraciones');
      return await res.json();
    },
    updateBackend: async (key: string, value: string) => {
      const res = await authSimple.fetch(`/api/v1/admin/settings/backend/${key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value }),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw { data: errData, message: 'Error al actualizar configuración' };
      }
      return await res.json();
    },
    renderEmailPreview: async (template: string, values: Record<string, string>) => {
      const res = await authSimple.fetch('/api/v1/admin/settings/email-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template, values }),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw { data: errData, message: 'Error al renderizar vista previa' };
      }
      return await res.json() as {
        original_template: string;
        rendered_html: string;
        smtp_html: string;
        unresolved_variables: string[];
        lengths: Record<string, number>;
        digests: Record<string, string>;
      };
    },
  },
};

export default api;
