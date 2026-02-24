import { Badge } from '@/components/ui/badge';
import { getInvitationStatusMeta } from '@/lib/invitationStatus';

type InvitationStatusBadgeProps = {
  status?: string;
  className?: string;
};

export default function InvitationStatusBadge({ status, className = '' }: InvitationStatusBadgeProps) {
  const meta = getInvitationStatusMeta(status);
  return <Badge className={`${meta.className} ${className}`.trim()}>{meta.label}</Badge>;
}

