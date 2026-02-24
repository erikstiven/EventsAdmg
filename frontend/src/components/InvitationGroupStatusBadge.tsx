import { Badge } from '@/components/ui/badge';
import { getInvitationGroupStatusMeta } from '@/lib/invitationGroupStatus';

type InvitationGroupStatusBadgeProps = {
  status?: string;
  className?: string;
  showUnknownAsDash?: boolean;
};

export default function InvitationGroupStatusBadge({
  status,
  className = '',
  showUnknownAsDash = false,
}: InvitationGroupStatusBadgeProps) {
  if (!status && showUnknownAsDash) {
    return <Badge variant="outline">-</Badge>;
  }

  const meta = getInvitationGroupStatusMeta(status);
  return <Badge className={`${meta.className} ${className}`.trim()}>{meta.label}</Badge>;
}

