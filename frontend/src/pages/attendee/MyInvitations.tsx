import React, { useState, useEffect } from 'react';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { api, InvitationDetail } from '@/lib/api';
import { QRCodeDisplay } from '@/components/QRCodeDisplay';
import { Calendar, MapPin, CheckCircle, Clock, XCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

export default function MyInvitations() {
  const [invitations, setInvitations] = useState<InvitationDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [activateDialogOpen, setActivateDialogOpen] = useState(false);
  const [qrDialogOpen, setQrDialogOpen] = useState(false);
  const [selectedQR, setSelectedQR] = useState('');
  const { toast } = useToast();

  const [activateForm, setActivateForm] = useState({
    email_or_phone: '',
    activation_code: '',
  });

  useEffect(() => {
    loadInvitations();
  }, []);

  const loadInvitations = async () => {
    try {
      const data = await api.invitations.getMyInvitations();
      setInvitations(data);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las invitaciones',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await api.invitations.activate(
        activateForm.email_or_phone,
        activateForm.activation_code
      );
      
      toast({
        title: 'Éxito',
        description: response.message,
      });
      
      setActivateDialogOpen(false);
      setActivateForm({ email_or_phone: '', activation_code: '' });
      loadInvitations();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error?.data?.detail || error?.response?.data?.detail || error.message || 'No se pudo activar la invitación',
        variant: 'destructive',
      });
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'APROBADO':
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case 'PENDIENTE_APROBACION':
        return <Clock className="h-5 w-5 text-yellow-600" />;
      case 'RECHAZADO':
        return <XCircle className="h-5 w-5 text-red-600" />;
      case 'USADO':
        return <CheckCircle className="h-5 w-5 text-purple-600" />;
      default:
        return <Clock className="h-5 w-5 text-gray-600" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      GENERADO: 'bg-gray-100 text-gray-800',
      ACTIVADO: 'bg-blue-100 text-blue-800',
      PENDIENTE_APROBACION: 'bg-yellow-100 text-yellow-800',
      APROBADO: 'bg-green-100 text-green-800',
      RECHAZADO: 'bg-red-100 text-red-800',
      USADO: 'bg-purple-100 text-purple-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">Mis Invitaciones</h1>
          <Dialog open={activateDialogOpen} onOpenChange={setActivateDialogOpen}>
            <DialogTrigger asChild>
              <Button>Activar Invitación</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Activar Invitación</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleActivate} className="space-y-4">
                <div>
                  <Label htmlFor="email_or_phone">Email o Teléfono</Label>
                  <Input
                    id="email_or_phone"
                    value={activateForm.email_or_phone}
                    onChange={(e) => setActivateForm({ ...activateForm, email_or_phone: e.target.value })}
                    placeholder="tu@email.com o +57 300 123 4567"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="activation_code">Código de Activación</Label>
                  <Input
                    id="activation_code"
                    value={activateForm.activation_code}
                    onChange={(e) => setActivateForm({ ...activateForm, activation_code: e.target.value })}
                    placeholder="123456"
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Código demo: 123456 o 654321
                  </p>
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setActivateDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit">Activar</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="space-y-4">
          {invitations.map((invitation) => (
            <Card key={invitation.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-xl">{invitation.event_name}</CardTitle>
                    <p className="text-sm text-gray-500 mt-1">{invitation.attendee_name}</p>
                  </div>
                  {getStatusIcon(invitation.status)}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Calendar className="h-4 w-4" />
                  Creado: {new Date(invitation.created_at).toLocaleString()}
                </div>
                
                <div>
                  <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${getStatusBadge(invitation.status)}`}>
                    {invitation.status}
                  </span>
                </div>

                {invitation.status === 'APROBADO' && (
                  <Button
                    className="w-full"
                    onClick={() => {
                      setSelectedQR(invitation.token_plain);
                      setQrDialogOpen(true);
                    }}
                  >
                    Ver Mi Código QR
                  </Button>
                )}

                {invitation.status === 'PENDIENTE_APROBACION' && (
                  <p className="text-sm text-yellow-700 bg-yellow-50 p-3 rounded">
                    Tu invitación está en proceso de aprobación. Te notificaremos cuando sea aprobada.
                  </p>
                )}

                {invitation.status === 'RECHAZADO' && (
                  <p className="text-sm text-red-700 bg-red-50 p-3 rounded">
                    Tu invitación fue rechazada. Contacta al organizador para más información.
                  </p>
                )}

                {invitation.status === 'USADO' && (
                  <p className="text-sm text-purple-700 bg-purple-50 p-3 rounded">
                    Ya realizaste el check-in para este evento.
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {invitations.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center text-gray-500">
              <p className="mb-4">No tienes invitaciones aún.</p>
              <Button onClick={() => setActivateDialogOpen(true)}>
                Activar Invitación
              </Button>
            </CardContent>
          </Card>
        )}

        <Dialog open={qrDialogOpen} onOpenChange={setQrDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Tu Código QR de Acceso</DialogTitle>
            </DialogHeader>
            <QRCodeDisplay value={selectedQR} title="Presenta este código en la entrada" />
            <p className="text-sm text-center text-gray-600">
              Guarda este código o toma una captura de pantalla para presentarlo en el evento.
            </p>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}