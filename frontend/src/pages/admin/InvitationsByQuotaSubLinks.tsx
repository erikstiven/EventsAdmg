import React, { useMemo, useState } from 'react';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Copy, Link as LinkIcon, Mail, UserPlus } from 'lucide-react';

const titularLink = 'https://eventaccess.com/registro/abc123-titular';

const baseCompanions = [
  { name: 'Slot acompañante 1', email: '', link: 'https://eventaccess.com/registro-invitado/slot-001', status: 'No iniciado', sent: false },
  { name: 'Slot acompañante 2', email: '', link: 'https://eventaccess.com/registro-invitado/slot-002', status: 'No iniciado', sent: false },
  { name: 'Slot acompañante 3', email: '', link: 'https://eventaccess.com/registro-invitado/slot-003', status: 'No iniciado', sent: false },
];

export default function InvitationsByQuotaSubLinks() {
  const [form, setForm] = useState({
    titular: 'Ana López',
    email: 'ana@example.com',
    cupoTotal: 3,
  });

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // demo only
    }
  };

  const companions = useMemo(() => baseCompanions.slice(0, Math.max(0, form.cupoTotal - 1)), [form.cupoTotal]);

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold">Invitaciones por cupos (sub-links)</h1>
            <p className="text-gray-600">Un link para el titular + un sub-link por acompañante.</p>
          </div>
          <Badge variant="outline" className="text-xs uppercase self-start">
            Demo visual (sin backend)
          </Badge>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Crear invitación (con sub-links)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>Titular</Label>
                <Input value={form.titular} onChange={(e) => setForm((f) => ({ ...f, titular: e.target.value }))} />
              </div>
              <div>
                <Label>Email</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
              </div>
              <div>
                <Label>Cupo total</Label>
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={form.cupoTotal}
                  onChange={(e) => setForm((f) => ({ ...f, cupoTotal: Number(e.target.value) || 1 }))}
                />
              </div>
            </div>
            <div className="text-sm text-gray-600">
              Se generará 1 link maestro para el titular y {Math.max(0, form.cupoTotal - 1)} sub-links individuales para acompañantes.
            </div>
            <Button className="w-fit">Simular creación</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Link del titular</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Titular</Label>
                <Input disabled value={form.titular} />
              </div>
              <div>
                <Label>Evento</Label>
                <Input disabled value="Gala Anual 2026" />
              </div>
            </div>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div className="text-sm text-gray-700 flex items-center gap-2">
                <LinkIcon className="h-4 w-4" />
                <span className="max-w-[360px] truncate">{titularLink}</span>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => handleCopy(titularLink)}>
                  <Copy className="h-4 w-4 mr-2" /> Copiar
                </Button>
                <Button size="sm" variant="default">
                  <Mail className="h-4 w-4 mr-2" /> Enviar al titular
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3 flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            <CardTitle>Sub-links de acompañantes</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Slot / Acompañante</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Link</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {companions.map((c) => (
                  <TableRow key={c.link}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>
                      <Input
                        placeholder="email del acompañante"
                        value={c.email}
                        onChange={() => {}}
                        className="h-9"
                      />
                    </TableCell>
                    <TableCell className="max-w-[260px] truncate">{c.link}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{c.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button size="sm" variant="ghost" onClick={() => handleCopy(c.link)}>
                        <Copy className="h-4 w-4 mr-1" /> Copiar
                      </Button>
                      <Button size="sm" variant={c.sent ? 'outline' : 'default'}>
                        <Mail className="h-4 w-4 mr-1" />
                        {c.sent ? 'Reenviar' : 'Enviar'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
