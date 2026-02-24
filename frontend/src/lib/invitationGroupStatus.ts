export type InvitationGroupStatusKey =
  | 'pendiente completar'
  | 'en registro'
  | 'pendiente aprobacion'
  | 'pendiente de actualizacion'
  | 'aprobado parcial'
  | 'aprobado'
  | 'rechazado';

export type InvitationGroupStatusMeta = {
  key: InvitationGroupStatusKey;
  label: string;
  className: string;
};

const STATUS_META: Record<InvitationGroupStatusKey, Omit<InvitationGroupStatusMeta, 'key'>> = {
  'pendiente completar': { label: 'Pendiente completar', className: 'bg-amber-100 text-amber-800' },
  'en registro': { label: 'En registro', className: 'bg-blue-100 text-blue-800' },
  'pendiente aprobacion': { label: 'Pendiente aprobación', className: 'bg-amber-100 text-amber-800' },
  'pendiente de actualizacion': { label: 'Pendiente de actualización', className: 'bg-indigo-100 text-indigo-800' },
  'aprobado parcial': { label: 'Aprobado parcial', className: 'bg-amber-50 text-amber-700' },
  aprobado: { label: 'Aprobado', className: 'bg-emerald-100 text-emerald-800' },
  rechazado: { label: 'Rechazado', className: 'bg-rose-100 text-rose-800' },
};

const ALIASES: Record<string, InvitationGroupStatusKey> = {
  'pendiente completar': 'pendiente completar',
  pendiente_completar: 'pendiente completar',
  generado: 'pendiente completar',
  'en registro': 'en registro',
  en_registro: 'en registro',
  'en proceso': 'en registro',
  en_proceso: 'en registro',
  'pendiente aprobacion': 'pendiente aprobacion',
  pendiente_aprobacion: 'pendiente aprobacion',
  'pendiente de actualizacion': 'pendiente de actualizacion',
  pendiente_de_actualizacion: 'pendiente de actualizacion',
  'aprobado parcial': 'aprobado parcial',
  aprobado_parcial: 'aprobado parcial',
  aprobado: 'aprobado',
  completado: 'aprobado',
  rechazado: 'rechazado',
  rechazada: 'rechazado',
};

const normalizeRaw = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/_/g, ' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

export const normalizeInvitationGroupStatus = (value?: string): InvitationGroupStatusKey => {
  if (!value) return 'pendiente completar';
  const normalized = normalizeRaw(value);
  if (ALIASES[normalized]) return ALIASES[normalized];
  if (normalized.includes('actualiz')) return 'pendiente de actualizacion';
  if (normalized.includes('aprob') && normalized.includes('pendiente')) return 'pendiente aprobacion';
  return 'pendiente completar';
};

export const getInvitationGroupStatusMeta = (value?: string): InvitationGroupStatusMeta => {
  const key = normalizeInvitationGroupStatus(value);
  return { key, ...STATUS_META[key] };
};
