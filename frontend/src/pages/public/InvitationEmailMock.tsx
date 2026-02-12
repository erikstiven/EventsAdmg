import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Calendar, MapPin, User, Mail } from 'lucide-react';

export default function InvitationEmailMock() {
  const linkRegistro = 'https://app.com/registro/ana-lopez-001';

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center py-10 px-4">
      <Card className="w-full max-w-3xl shadow-lg">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl">Invitación al evento</CardTitle>
          <p className="text-sm text-gray-600">Así se vería al abrir el enlace desde el correo.</p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-700">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4" /> <span>Gala Anual 2026 — 15 feb 2026, 19:00</span>
            </div>
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4" /> <span>Centro de Convenciones</span>
            </div>
            <div className="flex items-center gap-2">
              <User className="h-4 w-4" /> <span>Invitado: Ana López (Titular)</span>
            </div>
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4" /> <span>ana@example.com</span>
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <p className="text-sm text-gray-700">
              Completa el registro biométrico y la foto de tu cédula (tú y tus acompañantes) para generar los QR de acceso.
            </p>
            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
              <Badge variant="outline">Link único titular</Badge>
              <Badge variant="outline">Cupo: 3 personas</Badge>
              <Badge variant="outline">Intransferible</Badge>
            </div>
          </div>

          <div className="bg-slate-100 border rounded-lg p-4">
            <div className="text-xs text-gray-500 uppercase mb-1">Tu enlace</div>
            <div className="text-sm font-mono break-all mb-3">{linkRegistro}</div>
            <Button className="w-full md:w-auto" onClick={() => window.location.href = linkRegistro}>
              Ir al registro y subir documentos
            </Button>
          </div>

          <Separator />

          <div className="text-xs text-gray-500">
            Si no eres Ana López o no reconoces esta invitación, ignora este correo.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
