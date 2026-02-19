import React, { useState, useEffect } from 'react';
import { Layout } from '@/components/Layout';
import LoadingSpinner from '@/components/LoadingSpinner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { api, InvitationDetail } from '@/lib/api';
import { CheckCircle, XCircle, User, Mail, Calendar } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export default function PendingApprovals() {
  const [invitations, setInvitations] = useState<InvitationDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedInvitation, setSelectedInvitation] = useState<InvitationDetail | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const { toast } = useToast();

  useEffect(() => {
    loadPendingApprovals();
  }, []);

  const loadPendingApprovals = async () => {
    try {
      const data = await api.invitations.getPendingApprovals();
      setInvitations(data);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las aprobaciones pendientes',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (invitation: InvitationDetail) => {
    try {
      await api.invitations.approve(invitation.id, true);
      toast({
        title: 'Éxito',
        description: 'Invitación aprobada correctamente',
      });
      loadPendingApprovals();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error?.data?.detail || error?.response?.data?.detail || error.message || 'No se pudo aprobar la invitación',
        variant: 'destructive',
      });
    }
  };

  const handleReject = async () => {
    if (!selectedInvitation) return;
    
    try {
      await api.invitations.approve(selectedInvitation.id, false, rejectionReason);
      toast({
        title: 'Éxito',
        description: 'Invitación rechazada',
      });
      setDialogOpen(false);
      setRejectionReason('');
      setSelectedInvitation(null);
      loadPendingApprovals();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error?.data?.detail || error?.response?.data?.detail || error.message || 'No se pudo rechazar la invitación',
        variant: 'destructive',
      });
    }
  };

  if (loading) {
    return (
      <Layout>
        <LoadingSpinner fullScreen={false} className="h-64" message="Cargando aprobaciones..." />
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Aprobaciones Pendientes</h1>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {invitations.map((invitation) => (
            <Card key={invitation.id}>
              <CardHeader>
                <CardTitle className="text-lg">{invitation.event_name}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <User className="h-4 w-4 text-gray-500" />
                  <span className="font-medium">{invitation.attendee_name}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Mail className="h-4 w-4" />
                  {invitation.attendee_email}
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Calendar className="h-4 w-4" />
                  Solicitado: {new Date(invitation.created_at).toLocaleString()}
                </div>
                <div className="flex gap-2 pt-2">
                  <Button
                    className="flex-1"
                    onClick={() => handleApprove(invitation)}
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Aprobar
                  </Button>
                  <Button
                    variant="destructive"
                    className="flex-1"
                    onClick={() => {
                      setSelectedInvitation(invitation);
                      setDialogOpen(true);
                    }}
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    Rechazar
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {invitations.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center text-gray-500">
              No hay invitaciones pendientes de aprobación.
            </CardContent>
          </Card>
        )}

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Rechazar Invitación</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="reason">Motivo del Rechazo</Label>
                <Textarea
                  id="reason"
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Ingrese el motivo del rechazo..."
                  rows={4}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button variant="destructive" onClick={handleReject}>
                  Confirmar Rechazo
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
