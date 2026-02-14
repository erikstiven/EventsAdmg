import { Badge } from '@/components/ui/badge';
import React from 'react';

type StatusBadgeProps = {
  tone: 'pending' | 'approved' | 'rejected' | 'checked_in' | 'ok' | 'missing';
  label: string;
};

const STYLES: Record<StatusBadgeProps['tone'], string> = {
  pending: 'bg-amber-100 text-amber-800',
  approved: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-rose-100 text-rose-800',
  checked_in: 'bg-blue-100 text-blue-800',
  ok: 'bg-emerald-100 text-emerald-800',
  missing: 'bg-gray-100 text-gray-700',
};

export default function StatusBadge({ tone, label }: StatusBadgeProps) {
  return <Badge className={STYLES[tone]}>{label}</Badge>;
}
