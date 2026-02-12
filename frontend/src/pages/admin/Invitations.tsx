import React, { useState, useEffect } from 'react';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { api, Event, Attendee, Invitation } from '@/lib/api';
import { Plus, QrCode as QrCodeIcon, Copy, Camera } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { QRCodeDisplay } from '@/components/QRCodeDisplay';
import { CameraCapture } from '@/components/CameraCapture';

export default function Invitations() {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [qrDialogOpen, setQrDialogOpen] = useState(false);
  const [cameraDialogOpen, setCameraDialogOpen] = useState(false);
  const [selectedInvitation, setSelectedInvitation] = useState<Invitation | null>(null);
  const [biometricPhoto, setBiometricPhoto] = useState<string>('');
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    event_id: '',
    attendee_id: '',
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [invitationsRes, eventsRes, attendeesRes] = await Promise.all([
        api.invitations.list(),
        api.events.list(),
        api.attendees.list(),
      ]);
      setInvitations(invitationsRes.items || []);
      setEvents(eventsRes.items || []);
      setAttendees(attendeesRes.items || []);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los datos',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePhotoCapture = (photoData: string) => {
    setBiometricPhoto(photoData);
    setCameraDialogOpen(false);
    toast({
      title: 'Foto Capturada',
      description: 'Fotografía biométrica registrada correctamente',
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!biometricPhoto) {
      toast({
        title: 'Advertencia',
        description: 'Se recomienda capturar la fotografía biométrica del asistente',
        variant: 'destructive',
      });
      return;
    }

    try {
      const result = await api.invitations.generate(
        parseInt(formData.event_id),
        parseInt(formData.attendee_id),
        biometricPhoto
      );

      toast({
        title: 'Éxito',
        description: `Invitación generada con registro biométrico. Código: ${result.activation_code}`,
      });

      setDialogOpen(false);
      setFormData({ event_id: '', attendee_id: '' });
      setBiometricPhoto('');
      loadData();

      // Show QR dialog with the newly generated invitation
      const newInvitation: Invitation = {
        id: result.invitation_id,
        event_id: parseInt(formData.event_id),
        attendee_id: parseInt(formData.attendee_id),
        token_plain: result.token_plain,
        status: result.status,
        user_id: '',
        token: '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        biometric_photo: biometricPhoto,
      };
      setSelectedInvitation(newInvitation);
      setQrDialogOpen(true);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error?.data?.detail || error?.response?.data?.detail || error.message || 'No se pudo generar la invitación',
        variant: 'destructive',
      });
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: 'Copiado',
      description: `${label} copiado al portapapeles`,
    });
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      GENERADO: 'bg-gray-100 text-gray-800',
      ACTIVADO: 'bg-blue-100 text-blue-800',
      PENDIENTE_APROBACION: 'bg-yellow-100 text-yellow-800',
      APROBADO: 'bg-green-100 text-green-800',
      RECHAZADO: 'bg-red-100 text-red-800',
      USADO: 'bg-purple-100 text-purple-800',
      REVOCADO: 'bg-orange-100 text-orange-800',
      EXPIRADO: 'bg-gray-100 text-gray-800',
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
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">Gestión de Invitaciones</h1>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Generar Invitación
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Generar Nueva Invitación</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="event_id">Evento</Label>
                  <Select
                    value={formData.event_id}
                    onValueChange={(value) => setFormData({ ...formData, event_id: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar evento" />
                    </SelectTrigger>
                    <SelectContent>
                      {events.map((event) => (
                        <SelectItem key={event.id} value={event.id.toString()}>
                          {event.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="attendee_id">Asistente</Label>
                  <Select
                    value={formData.attendee_id}
                    onValueChange={(value) => setFormData({ ...formData, attendee_id: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar asistente" />
                    </SelectTrigger>
                    <SelectContent>
                      {attendees.map((attendee) => (
                        <SelectItem key={attendee.id} value={attendee.id.toString()}>
                          {attendee.full_name} ({attendee.email})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="border-t pt-4">
                  <Label className="mb-2 block">Registro Biométrico (Requerido)</Label>
                  <div className="space-y-2">
                    {!biometricPhoto ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full"
                        onClick={() => setCameraDialogOpen(true)}
                      >
                        <Camera className="h-4 w-4 mr-2" />
                        Capturar Fotografía
                      </Button>
                    ) : (
                      <div className="space-y-2">
                        <div className="relative">
                          <img
                            src={biometricPhoto}
                            alt="Foto biométrica"
                            className="w-full h-48 object-cover rounded-lg border-2 border-green-500"
                          />
                          <div className="absolute top-2 right-2 bg-green-500 text-white px-2 py-1 rounded text-xs font-medium">
                            ✓ Registrada
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="w-full"
                          onClick={() => setCameraDialogOpen(true)}
                        >
                          <Camera className="h-4 w-4 mr-2" />
                          Recapturar
                        </Button>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    La fotografía se usará para validar la identidad del asistente durante el check-in
                  </p>
                </div>

                <div className="flex justify-end gap-2 pt-4">
                  <Button type="button" variant="outline" onClick={() => {
                    setDialogOpen(false);
                    setBiometricPhoto('');
                  }}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={!biometricPhoto}>
                    Generar Invitación
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {invitations.map((invitation) => {
            const event = events.find(e => e.id === invitation.event_id);
            const attendee = attendees.find(a => a.id === invitation.attendee_id);

            return (
              <Card key={invitation.id}>
                <CardHeader>
                  <CardTitle className="text-sm">{event?.name || 'Evento'}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-sm font-medium">{attendee?.full_name || 'Asistente'}</p>
                  <p className="text-xs text-gray-500">{attendee?.email}</p>
                  <div className="pt-2 flex items-center gap-2">
                    <span className={`inline-block px-2 py-1 rounded text-xs ${getStatusBadge(invitation.status)}`}>
                      {invitation.status}
                    </span>
                    {invitation.biometric_photo && (
                      <span className="inline-block px-2 py-1 rounded text-xs bg-blue-100 text-blue-800">
                        🔐 Biométrico
                      </span>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full mt-2"
                    onClick={() => {
                      setSelectedInvitation(invitation);
                      setQrDialogOpen(true);
                    }}
                  >
                    <QrCodeIcon className="h-4 w-4 mr-2" />
                    Ver QR e Info
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {invitations.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center text-gray-500">
              No hay invitaciones generadas. Haz clic en "Generar Invitación" para comenzar.
            </CardContent>
          </Card>
        )}

        {/* Camera Dialog */}
        <Dialog open={cameraDialogOpen} onOpenChange={setCameraDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Capturar Fotografía Biométrica</DialogTitle>
            </DialogHeader>
            <CameraCapture
              onCapture={handlePhotoCapture}
              onClose={() => setCameraDialogOpen(false)}
            />
          </DialogContent>
        </Dialog>

        {/* QR Details Dialog */}
        <Dialog open={qrDialogOpen} onOpenChange={setQrDialogOpen}>
          <DialogContent className="w-[min(90vw,520px)] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Detalles de Invitación</DialogTitle>
            </DialogHeader>
            {selectedInvitation && (
              <div className="space-y-4">
                <div className="bg-white p-4 rounded-lg border">
                  <QRCodeDisplay
                    value={selectedInvitation.token_plain}
                    title="Código QR de Acceso"
                  />
                </div>

                <div className="space-y-3">
                  {selectedInvitation.biometric_photo && (
                    <div className="bg-gray-50 p-3 rounded-lg">
                      <p className="text-xs text-gray-600 mb-2">Fotografía Biométrica Registrada</p>
                      <img
                        src={selectedInvitation.biometric_photo}
                        alt="Foto biométrica"
                        className="w-full h-48 object-cover rounded-lg border"
                      />
                      <p className="text-xs text-green-600 mt-2 flex items-center gap-1">
                        <span>✓</span> Validación biométrica habilitada para check-in
                      </p>
                    </div>
                  )}

                  <div className="bg-gray-50 p-3 rounded-lg">
                    <p className="text-xs text-gray-600 mb-1">Token de Invitación</p>
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-mono break-all flex-1 mr-2">
                        {selectedInvitation.token_plain}
                      </p>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => copyToClipboard(selectedInvitation.token_plain, 'Token')}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {selectedInvitation.activation_code && selectedInvitation.status === 'GENERADO' && (
                    <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg">
                      <p className="text-xs text-amber-800 mb-1 font-bold flex items-center gap-1">
                        🔑 CÓDIGO DE ACTIVACIÓN (6 DÍGITOS)
                      </p>
                      <div className="flex items-center justify-between">
                        <p className="text-xl font-bold tracking-widest text-amber-900">
                          {selectedInvitation.activation_code}
                        </p>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-amber-700 hover:text-amber-900 hover:bg-amber-100"
                          onClick={() => copyToClipboard(selectedInvitation.activation_code || '', 'Código')}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                      <p className="text-[10px] text-amber-700 mt-1">
                        Dale este código al asistente para que active su invitación.
                      </p>
                    </div>
                  )}

                  <div className="bg-gray-50 p-3 rounded-lg">
                    <p className="text-xs text-gray-600 mb-1">Estado</p>
                    <span className={`inline-block px-3 py-1 rounded-full text-sm ${getStatusBadge(selectedInvitation.status)}`}>
                      {selectedInvitation.status}
                    </span>
                  </div>

                  {selectedInvitation.status === 'GENERADO' && (
                    <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg">
                      <p className="text-xs text-blue-800 mb-2 font-medium">
                        📱 Instrucciones para el Asistente
                      </p>
                      <p className="text-xs text-blue-700">
                        1. Comparte el código de activación con el asistente<br />
                        2. El asistente debe activar la invitación en "Mis Invitaciones"<br />
                        3. Después de la aprobación, podrá usar el código QR para el check-in<br />
                        4. Durante el check-in se validará su identidad con la foto biométrica
                      </p>
                    </div>
                  )}

                  {selectedInvitation.status === 'APROBADO' && (
                    <div className="bg-green-50 border border-green-200 p-3 rounded-lg">
                      <p className="text-xs text-green-800 mb-2 font-medium">
                        ✅ Invitación Aprobada con Validación Biométrica
                      </p>
                      <p className="text-xs text-green-700">
                        El asistente puede presentar este código QR en la entrada del evento.
                        Su identidad será validada automáticamente mediante reconocimiento facial.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
