import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { AttendeeOperationalItem } from '@/api/attendees';
import StatusBadge from '@/components/StatusBadge';

const approvalLabel = (status: AttendeeOperationalItem['invitation_status']) =>
  status === 'approved' ? 'Aprobado' : status === 'rejected' ? 'Rechazado' : 'Pendiente';

const biometricLabel = (status: AttendeeOperationalItem['biometric_status']) =>
  status === 'ok' ? 'Rostro registrado' : 'Sin rostro';

const checkinLabel = (status: AttendeeOperationalItem['checkin_status']) =>
  status === 'checked_in' ? 'Ingresado' : 'No ingresado';

export function AttendeeDetailModal({
  open,
  onOpenChange,
  attendee,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  attendee: AttendeeOperationalItem | null;
}) {
  if (!attendee) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Detalle del asistente</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div>
            <div className="text-gray-500">Nombre</div>
            <div className="font-medium">{attendee.full_name}</div>
          </div>
          <div>
            <div className="text-gray-500">Documento</div>
            <div className="font-medium">{attendee.identification}</div>
          </div>
          <div>
            <div className="text-gray-500">Evento</div>
            <div className="font-medium">{attendee.event_name}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone={attendee.invitation_status} label={approvalLabel(attendee.invitation_status)} />
            <StatusBadge tone={attendee.biometric_status} label={biometricLabel(attendee.biometric_status)} />
            <StatusBadge
              tone={attendee.checkin_status === 'checked_in' ? 'checked_in' : 'missing'}
              label={checkinLabel(attendee.checkin_status)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
