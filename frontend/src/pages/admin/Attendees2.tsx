import React, { useState } from 'react';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Eye } from 'lucide-react';

type AttendeeRow = {
  name: string;
  cedula: string;
  email: string;
  telefono: string;
  role: 'Titular' | 'Acompañante';
  event: string;
  estado: 'Pendiente' | 'Aprobado' | 'Usado';
};

const mockAttendees: AttendeeRow[] = [
  {
    name: 'Ana López',
    cedula: '0102030405',
    email: 'ana@example.com',
    telefono: '+593 999 123 123',
    role: 'Titular',
    event: 'Gala Anual 2026',
    estado: 'Pendiente',
  },
  {
    name: 'María Torres',
    cedula: '1111111111',
    email: 'maria@example.com',
    telefono: '+593 999 111 111',
    role: 'Acompañante',
    event: 'Gala Anual 2026',
    estado: 'Pendiente',
  },
  {
    name: 'Luis Peña',
    cedula: '2222222222',
    email: 'luis@example.com',
    telefono: '+593 999 222 222',
    role: 'Acompañante',
    event: 'Gala Anual 2026',
    estado: 'Aprobado',
  },
];

export default function Attendees2() {
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<AttendeeRow | null>(null);

  const openDetail = (row: AttendeeRow) => {
    setDetail(row);
    setDetailOpen(true);
  };

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Asistentes</h1>
            <p className="text-gray-600">Listado de asistentes (solo lectura).</p>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Asistentes registrados</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Cédula</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead>Evento</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mockAttendees.map((row) => (
                  <TableRow key={row.cedula}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell>{row.cedula}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{row.email}</TableCell>
                    <TableCell>{row.role}</TableCell>
                    <TableCell>{row.event}</TableCell>
                    <TableCell>
                      <Badge variant={row.estado === 'Pendiente' ? 'outline' : 'default'}>
                        {row.estado}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => openDetail(row)}>
                        <Eye className="h-4 w-4 mr-1" /> Ver
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="w-[90vw] max-w-3xl">
          <DialogHeader>
            <DialogTitle>Detalle del asistente</DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-gray-700">
              <div>
                <div className="text-xs text-gray-500">Nombre</div>
                <Input value={detail.name} disabled />
              </div>
              <div>
                <div className="text-xs text-gray-500">Cédula</div>
                <Input value={detail.cedula} disabled />
              </div>
              <div>
                <div className="text-xs text-gray-500">Email</div>
                <Input value={detail.email} disabled />
              </div>
              <div>
                <div className="text-xs text-gray-500">Teléfono</div>
                <Input value={detail.telefono} disabled />
              </div>
              <div>
                <div className="text-xs text-gray-500">Rol</div>
                <Input value={detail.role} disabled />
              </div>
              <div>
                <div className="text-xs text-gray-500">Evento</div>
                <Input value={detail.event} disabled />
              </div>
              <div>
                <div className="text-xs text-gray-500">Estado</div>
                <Input value={detail.estado} disabled />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
