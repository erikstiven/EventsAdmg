import React, { useState, useEffect } from 'react';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { api, Attendee } from '@/lib/api';
import { Plus, User, Mail, Phone, FileText, Camera, Upload, X, Edit2, ShieldAlert, ShieldCheck } from 'lucide-react';
import { CameraCapture } from '@/components/CameraCapture';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';

export default function Attendees() {
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [cameraDialogOpen, setCameraDialogOpen] = useState(false);
  const [idCardPhoto, setIdCardPhoto] = useState<string>('');
  const [editingAttendee, setEditingAttendee] = useState<Attendee | null>(null);
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    identification: '',
    full_name: '',
    email: '',
    phone: '',
    fingerprint_code: '',
  });

  useEffect(() => {
    loadAttendees();
  }, []);

  const loadAttendees = async () => {
    try {
      const response = await api.attendees.list();
      setAttendees(response.items || []);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los asistentes',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (attendee: Attendee) => {
    setEditingAttendee(attendee);
    setFormData({
      identification: attendee.identification,
      full_name: attendee.full_name,
      email: attendee.email || '',
      phone: attendee.phone || '',
      fingerprint_code: attendee.fingerprint_code || '',
    });

    // Si ya existe una imagen, preparamos la URL para previsualización
    let photoUrl = attendee.id_document_url || '';
    if (photoUrl && !photoUrl.startsWith('http') && !photoUrl.startsWith('data:')) {
      // Nos aseguramos de que la ruta sea relativa a la raíz para que el proxy de Vite la capture
      photoUrl = photoUrl.startsWith('/') ? photoUrl : `/${photoUrl}`;
    }

    setIdCardPhoto(photoUrl);
    setDialogOpen(true);
  };

  const handleToggleStatus = async (attendee: Attendee) => {
    try {
      const newStatus = !attendee.is_active;
      await api.attendees.update(attendee.id, { is_active: newStatus });
      toast({
        title: 'Estado actualizado',
        description: `Asistente ${newStatus ? 'activado' : 'desactivado'} correctamente`,
      });
      loadAttendees();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'No se pudo actualizar el estado',
        variant: 'destructive',
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Include ID card photo if provided (only if it's a new base64 string)
      const submitData: any = {
        ...formData,
      };

      if (idCardPhoto && idCardPhoto.startsWith('data:')) {
        submitData.id_document_photo = idCardPhoto;
      }

      if (editingAttendee) {
        await api.attendees.update(editingAttendee.id, submitData);
        toast({
          title: 'Éxito',
          description: 'Asistente actualizado correctamente',
        });
      } else {
        await api.attendees.create(submitData);
        toast({
          title: 'Éxito',
          description: 'Asistente registrado correctamente',
        });
      }

      setDialogOpen(false);
      resetForm();
      loadAttendees();
    } catch (error: any) {
      const detail = error?.data?.detail
        || error?.response?.data?.detail
        || error.message
        || 'No se pudo procesar la solicitud';

      toast({
        title: 'Error',
        description: Array.isArray(detail) ? detail.map((err: any) => err.msg).join(', ') : detail,
        variant: 'destructive',
      });
    }
  };

  const resetForm = () => {
    setEditingAttendee(null);
    setFormData({
      identification: '',
      full_name: '',
      email: '',
      phone: '',
      fingerprint_code: '',
    });
    setIdCardPhoto('');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setIdCardPhoto(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCameraCapture = (photoData: string) => {
    setIdCardPhoto(photoData);
    setCameraDialogOpen(false);
  };

  const clearPhoto = () => {
    setIdCardPhoto('');
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
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold">Gestión de Asistentes</h1>
          <Dialog open={dialogOpen} onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) resetForm();
          }}>
            <DialogTrigger asChild>
              <Button onClick={() => resetForm()}>
                <Plus className="h-4 w-4 mr-2" />
                Nuevo Asistente
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>{editingAttendee ? 'Editar Asistente' : 'Registrar Nuevo Asistente'}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="identification">Número de Identificación</Label>
                    <Input
                      id="identification"
                      value={formData.identification}
                      onChange={(e) => setFormData({ ...formData, identification: e.target.value })}
                      placeholder="DNI, Pasaporte, etc."
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="full_name">Nombre Completo</Label>
                    <Input
                      id="full_name"
                      value={formData.full_name}
                      onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Teléfono</Label>
                    <Input
                      id="phone"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="fingerprint_code">Código Dactilar (Cédula)</Label>
                    <Input
                      id="fingerprint_code"
                      value={formData.fingerprint_code}
                      onChange={(e) => setFormData({ ...formData, fingerprint_code: e.target.value })}
                      placeholder="Ej: V1234V5678"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Foto de Cédula (Opcional)</Label>
                  {!idCardPhoto ? (
                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                      <FileText className="h-12 w-12 mx-auto text-gray-400 mb-3" />
                      <p className="text-sm text-gray-600 mb-4">Sube o captura una foto de la cédula</p>
                      <div className="flex gap-2 justify-center">
                        <Button type="button" variant="outline" size="sm" onClick={() => document.getElementById('id-card-upload')?.click()}>
                          <Upload className="h-4 w-4 mr-2" />
                          Subir
                        </Button>
                        <Button type="button" variant="outline" size="sm" onClick={() => setCameraDialogOpen(true)}>
                          <Camera className="h-4 w-4 mr-2" />
                          Cámara
                        </Button>
                      </div>
                      <input id="id-card-upload" type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
                    </div>
                  ) : (
                    <div className="relative border rounded-lg p-2 bg-gray-50">
                      <img src={idCardPhoto} alt="ID Card Preview" className="w-full h-40 object-contain rounded" />
                      <Button type="button" variant="destructive" size="sm" className="absolute top-2 right-2" onClick={clearPhoto}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-2 pt-4">
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit">
                    {editingAttendee ? 'Actualizar Cambios' : 'Registrar Asistente'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {attendees.map((attendee) => (
            <Card key={attendee.id} className={!attendee.is_active ? 'opacity-70 bg-gray-50' : 'hover:shadow-md transition-shadow'}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-lg flex items-center gap-2 truncate pr-2">
                  <User className="h-5 w-5 text-blue-600" />
                  {attendee.full_name}
                </CardTitle>
                <Badge variant={attendee.is_active ? "default" : "secondary"}>
                  {attendee.is_active ? "Activo" : "Inactivo"}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <FileText className="h-4 w-4 shrink-0" />
                    <span className="font-medium">ID:</span> {attendee.identification}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Mail className="h-4 w-4 shrink-0" />
                    {attendee.email}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Phone className="h-4 w-4 shrink-0" />
                    {attendee.phone}
                  </div>
                </div>

                {attendee.fingerprint_code && (
                  <div className="bg-gray-100 p-2 rounded text-[10px] text-gray-500 font-mono">
                    DACTILAR: {attendee.fingerprint_code}
                  </div>
                )}

                <div className="flex gap-2 pt-2 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => handleEdit(attendee)}
                  >
                    <Edit2 className="h-3.5 w-3.5 mr-2" />
                    Editar
                  </Button>
                  <Button
                    variant={attendee.is_active ? "secondary" : "default"}
                    size="sm"
                    className="flex-1"
                    onClick={() => handleToggleStatus(attendee)}
                  >
                    {attendee.is_active ? (
                      <>
                        <ShieldAlert className="h-3.5 w-3.5 mr-2" />
                        Desactivar
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="h-3.5 w-3.5 mr-2" />
                        Activar
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {attendees.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center text-gray-500">
              No hay asistentes registrados. Haz clic en "Nuevo Asistente" para comenzar.
            </CardContent>
          </Card>
        )}

        <Dialog open={cameraDialogOpen} onOpenChange={setCameraDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Capturar Foto de Cédula</DialogTitle>
            </DialogHeader>
            <CameraCapture
              onCapture={handleCameraCapture}
              onClose={() => setCameraDialogOpen(false)}
            />
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}