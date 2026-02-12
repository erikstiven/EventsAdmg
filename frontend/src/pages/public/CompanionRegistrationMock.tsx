import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Camera, Upload, CheckCircle2 } from 'lucide-react';

export default function CompanionRegistrationMock() {
  const { token } = useParams();
  const [form, setForm] = useState({
    fullName: 'Acompañante invitado',
    idNumber: '',
    email: '',
    phone: '',
    codigoDactilar: '',
  });

  return (
    <div className="min-h-screen bg-slate-50 py-10">
      <div className="max-w-4xl mx-auto px-4 space-y-6">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold">Registro de acompañante</h1>
            <p className="text-gray-600">Completa tus datos y sube tu selfie y documento.</p>
          </div>
          <Badge variant="outline" className="text-xs uppercase">
            Demo visual (sin backend)
          </Badge>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Datos personales</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <AlertTitle>Token del acompañante</AlertTitle>
              <AlertDescription className="font-mono text-xs text-gray-700 break-all">
                {token || 'companion-token-abc123'}
              </AlertDescription>
            </Alert>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Nombre completo</Label>
                <Input
                  value={form.fullName}
                  onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
                />
              </div>
              <div>
                <Label>Cédula / ID</Label>
                <Input
                  value={form.idNumber}
                  onChange={(e) => setForm((f) => ({ ...f, idNumber: e.target.value }))}
                />
              </div>
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                />
              </div>
              <div>
                <Label>Teléfono</Label>
                <Input
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </div>
              <div>
                <Label>Código dactilar</Label>
                <Input
                  value={form.codigoDactilar}
                  onChange={(e) => setForm((f) => ({ ...f, codigoDactilar: e.target.value }))}
                  placeholder="Ej: V1234V5678"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="border border-dashed rounded-lg p-4 flex flex-col gap-3 bg-slate-50">
                <div className="text-sm font-medium text-gray-700">Selfie biométrica</div>
                <p className="text-xs text-gray-500">Toma o sube una foto frontal de tu rostro.</p>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm">
                    <Camera className="h-4 w-4 mr-2" />
                    Tomar selfie
                  </Button>
                  <Button type="button" variant="ghost" size="sm">
                    <Upload className="h-4 w-4 mr-2" />
                    Subir foto
                  </Button>
                </div>
              </div>
              <div className="border border-dashed rounded-lg p-4 flex flex-col gap-3 bg-slate-50">
                <div className="text-sm font-medium text-gray-700">Foto de cédula</div>
                <p className="text-xs text-gray-500">Sube foto del documento (frontal o ambas caras).</p>
                <Button type="button" variant="outline" size="sm" className="w-fit">
                  <Upload className="h-4 w-4 mr-2" />
                  Subir cédula
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Separator />

        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex items-center gap-2 text-emerald-600">
            <CheckCircle2 className="h-5 w-5" />
            <span className="text-sm">Demostración: no se envían datos reales.</span>
          </div>
          <Button className="w-full md:w-auto">Enviar registro</Button>
        </div>
      </div>
    </div>
  );
}
