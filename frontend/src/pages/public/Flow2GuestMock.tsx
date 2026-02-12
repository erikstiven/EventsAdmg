import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { QRCodeDisplay } from '@/components/QRCodeDisplay';
import { Link as LinkIcon, UserPlus, CheckCircle2 } from 'lucide-react';

const companionLinks = [
  { name: 'María Torres', link: 'https://eventaccess.com/registro-invitado/slot-001', status: 'No iniciado' },
  { name: 'Luis Peña', link: 'https://eventaccess.com/registro-invitado/slot-002', status: 'En progreso' },
  { name: 'Silvia Castro', link: 'https://eventaccess.com/registro-invitado/slot-003', status: 'Completado' },
];

export default function Flow2GuestMock() {
  return (
    <div className="min-h-screen bg-slate-50 py-10">
      <div className="max-w-5xl mx-auto px-4 space-y-8">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold">Flujo 2: Sub-links por acompañante</h1>
            <p className="text-gray-600">Cada acompañante recibe su propio link para autoregistrarse.</p>
          </div>
          <Badge variant="outline" className="text-xs uppercase">
            Demo visual
          </Badge>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Lo que ve el titular (lista de sub-links)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm text-gray-700 flex items-center gap-2">
              <LinkIcon className="h-4 w-4" />
              Link maestro: <span className="font-mono text-xs truncate">https://eventaccess.com/registro/abc123-titular</span>
            </div>
            <Card className="border-dashed shadow-sm">
              <CardHeader className="pb-2 flex items-center gap-2">
                <UserPlus className="h-4 w-4" />
                <CardTitle className="text-lg">Sub-links de acompañantes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-gray-700">
                {companionLinks.map((c) => (
                  <div key={c.link} className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 border rounded-md px-3 py-2">
                    <div className="flex flex-col">
                      <span className="font-medium">{c.name}</span>
                      <span className="font-mono text-xs truncate">{c.link}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{c.status}</Badge>
                      <Button size="sm" variant="outline">Copiar</Button>
                      <Button size="sm" variant={c.status === 'Completado' ? 'outline' : 'default'}>
                        {c.status === 'Completado' ? 'Reenviar' : 'Enviar'}
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Lo que ve un acompañante en su sub-link</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-gray-700">
            <p>Completa datos, selfie y cédula. Tras enviar, ve su QR pendiente/aprobado.</p>
            <Separator />
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="flex items-center gap-2 text-emerald-600">
                <CheckCircle2 className="h-5 w-5" /> Registro enviado (ejemplo)
              </div>
              <Button variant="outline" size="sm">Descargar QR</Button>
            </div>
            <QRCodeDisplay value="INV-COMP-002" title="QR Acompañante" showActions={false} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
