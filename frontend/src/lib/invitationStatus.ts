export type InvitationStatusCode =
  | 'GENERADO'
  | 'ACTIVADO'
  | 'PENDIENTE_APROBACION'
  | 'APROBADO'
  | 'RECHAZADO'
  | 'USADO'
  | 'REVOCADO'
  | 'EXPIRADO';

type InvitationStatusMeta = {
  label: string;
  className: string;
};

const STATUS_META: Record<InvitationStatusCode, InvitationStatusMeta> = {
  GENERADO: { label: 'Generado', className: 'bg-slate-100 text-slate-700' },
  ACTIVADO: { label: 'Activado', className: 'bg-blue-100 text-blue-800' },
  PENDIENTE_APROBACION: { label: 'Pendiente aprobación', className: 'bg-amber-100 text-amber-800' },
  APROBADO: { label: 'Aprobado', className: 'bg-emerald-100 text-emerald-800' },
  RECHAZADO: { label: 'Rechazado', className: 'bg-rose-100 text-rose-800' },
  USADO: { label: 'Usado', className: 'bg-indigo-100 text-indigo-800' },
  REVOCADO: { label: 'Revocado', className: 'bg-orange-100 text-orange-800' },
  EXPIRADO: { label: 'Expirado', className: 'bg-slate-100 text-slate-700' },
};

export const normalizeInvitationStatusCode = (value?: string): InvitationStatusCode => {
  const normalized = (value || '').trim().toUpperCase();
  if (normalized in STATUS_META) return normalized as InvitationStatusCode;
  if (normalized.includes('PENDIENTE')) return 'PENDIENTE_APROBACION';
  if (normalized.includes('APROBAD')) return 'APROBADO';
  if (normalized.includes('RECHAZ')) return 'RECHAZADO';
  return 'GENERADO';
};

export const getInvitationStatusMeta = (value?: string): InvitationStatusMeta => {
  const code = normalizeInvitationStatusCode(value);
  return STATUS_META[code];
};

