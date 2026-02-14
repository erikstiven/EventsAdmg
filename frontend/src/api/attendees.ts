import { authSimple } from '@/lib/auth-simple';

export type AttendeeOperationalFilters = {
  eventId?: string | number | null;
  status?: 'pending' | 'approved' | 'rejected' | 'all' | '';
  biometric?: 'ok' | 'missing' | 'all' | '';
  checkin?: 'checked_in' | 'not_checked' | 'all' | '';
  q?: string;
  page?: number;
  pageSize?: number;
};

export type AttendeeOperationalItem = {
  invitation_id: number;
  attendee_id: number;
  full_name: string;
  identification: string;
  event_id: number;
  event_name: string;
  invitation_status: 'pending' | 'approved' | 'rejected';
  biometric_status: 'ok' | 'missing';
  checkin_status: 'checked_in' | 'not_checked';
  created_at: string;
};

export type AttendeeOperationalMetrics = {
  total: number;
  pendientes: number;
  aprobados: number;
  ingresados: number;
  rechazados: number;
};

export type AttendeeOperationalResponse = {
  items: AttendeeOperationalItem[];
  page: number;
  pageSize: number;
  total: number;
  metrics: AttendeeOperationalMetrics;
};

export async function getOperational(filters: AttendeeOperationalFilters): Promise<AttendeeOperationalResponse> {
  const params = new URLSearchParams();
  if (filters.eventId && String(filters.eventId) !== 'all') params.set('eventId', String(filters.eventId));
  if (filters.status && filters.status !== 'all') params.set('status', filters.status);
  if (filters.biometric && filters.biometric !== 'all') params.set('biometric', filters.biometric);
  if (filters.checkin && filters.checkin !== 'all') params.set('checkin', filters.checkin);
  if (filters.q) params.set('q', filters.q);
  if (filters.page) params.set('page', String(filters.page));
  if (filters.pageSize) params.set('pageSize', String(filters.pageSize));

  const url = `/api/attendees/operational?${params.toString()}`;
  const res = await authSimple.fetch(url);
  if (!res.ok) throw new Error('No se pudo cargar el panel operativo de asistentes');
  return await res.json();
}

export async function approveInvitation(invitationId: number) {
  const res = await authSimple.fetch('/api/v1/invitations/approve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ invitation_id: invitationId, approved: true }),
  });
  if (!res.ok) throw new Error(await res.text());
  return await res.json();
}

export async function rejectInvitation(invitationId: number, rejection_reason?: string) {
  const res = await authSimple.fetch('/api/v1/invitations/approve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ invitation_id: invitationId, approved: false, rejection_reason }),
  });
  if (!res.ok) throw new Error(await res.text());
  return await res.json();
}
