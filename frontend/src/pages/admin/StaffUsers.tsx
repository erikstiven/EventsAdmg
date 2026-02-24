import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api';
import { ChevronLeft, ChevronRight, Plus, UserCog } from 'lucide-react';

type StaffUser = {
  id: string;
  name?: string;
  email: string;
  role: string;
  is_active: boolean;
  created_at?: string;
  last_login?: string;
};

const formatDateTime = (value?: string | null) => {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return new Intl.DateTimeFormat('es-EC', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(d);
};

export default function StaffUsers() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<StaffUser[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<StaffUser | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'STAFF',
    is_active: true,
  });

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize]);

  const load = useCallback(async (options?: { silent?: boolean }) => {
    try {
      if (!options?.silent) setLoading(true);
      const res = await api.staffUsers.list({
        skip: (page - 1) * pageSize,
        limit: pageSize,
        search: search.trim() || undefined,
      });
      setItems(res.items || []);
      setTotal(res.total || 0);
    } catch (e: any) {
      if (!options?.silent) {
        toast({
          title: 'Error',
          description: e?.message || 'No se pudo cargar personal operativo.',
          variant: 'destructive',
        });
      }
      setItems([]);
      setTotal(0);
    } finally {
      if (!options?.silent) setLoading(false);
    }
  }, [page, pageSize, search, toast]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (document.hidden) return;
      load({ silent: true });
    }, 15000);
    return () => window.clearInterval(intervalId);
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', email: '', password: '', role: 'STAFF', is_active: true });
    setOpen(true);
  };

  const openEdit = (row: StaffUser) => {
    setEditing(row);
    setForm({
      name: row.name || '',
      email: row.email,
      password: '',
      role: row.role || 'STAFF',
      is_active: row.is_active,
    });
    setOpen(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      if (editing) {
        await api.staffUsers.update(editing.id, {
          name: form.name,
          email: form.email,
          password: form.password || undefined,
          role: form.role,
          is_active: form.is_active,
        });
        toast({ title: 'Actualizado', description: 'Usuario staff actualizado correctamente.' });
      } else {
        if (!form.password) {
          toast({
            title: 'Validación',
            description: 'La contraseña es obligatoria para crear usuario.',
            variant: 'destructive',
          });
          return;
        }
        await api.staffUsers.create({
          name: form.name,
          email: form.email,
          password: form.password,
          role: form.role,
          is_active: form.is_active,
        });
        toast({ title: 'Creado', description: 'Usuario staff creado correctamente.' });
      }
      setOpen(false);
      await load();
    } catch (e: any) {
      toast({
        title: 'Error',
        description: e?.message || 'No se pudo guardar el usuario.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (row: StaffUser) => {
    try {
      await api.staffUsers.toggleActive(row.id);
      toast({
        title: 'Estado actualizado',
        description: `Usuario ${row.is_active ? 'inactivado' : 'activado'}.`,
      });
      await load();
    } catch (e: any) {
      toast({
        title: 'Error',
        description: e?.message || 'No se pudo cambiar estado.',
        variant: 'destructive',
      });
    }
  };

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Personal Operativo</h1>
            <p className="text-gray-600">Gestión de usuarios staff de check-in y aprobadores.</p>
          </div>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Nuevo usuario
          </Button>
        </div>

        <Card>
          <CardHeader className="space-y-4">
            <CardTitle className="flex items-center gap-2">
              <UserCog className="h-5 w-5" />
              Usuarios operativos
            </CardTitle>
            <Input
              placeholder="Buscar por nombre o email"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Último acceso</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-sm text-gray-500 py-8">
                      Cargando personal...
                    </TableCell>
                  </TableRow>
                )}
                {!loading &&
                  items.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">{row.name || '-'}</TableCell>
                      <TableCell>{row.email}</TableCell>
                      <TableCell>{row.role === 'APROBADOR' ? 'Aprobador' : 'Staff Check-in'}</TableCell>
                      <TableCell>
                        <Badge variant={row.is_active ? 'default' : 'outline'}>
                          {row.is_active ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </TableCell>
                      <TableCell>{formatDateTime(row.last_login)}</TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button size="sm" variant="outline" onClick={() => openEdit(row)}>
                          Editar
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => toggleActive(row)}>
                          {row.is_active ? 'Inactivar' : 'Activar'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                {!loading && items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-sm text-gray-500 py-8">
                      No hay usuarios operativos para los filtros actuales.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm text-gray-600">
              <div>
                Página {page} de {totalPages} · {total} registros
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1 || loading}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Anterior
                </Button>
                <Select
                  value={String(pageSize)}
                  onValueChange={(v) => {
                    setPageSize(Number(v));
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="w-[110px]">
                    <SelectValue placeholder="10 / página" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10 / página</SelectItem>
                    <SelectItem value="20">20 / página</SelectItem>
                    <SelectItem value="50">50 / página</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages || loading}
                >
                  Siguiente
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar usuario operativo' : 'Nuevo usuario operativo'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <Input
              placeholder="Nombre completo"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
            />
            <Input
              type="email"
              placeholder="correo@dominio.com"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              required
            />
            <Input
              type="password"
              placeholder={editing ? 'Nueva contraseña (opcional)' : 'Contraseña'}
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            />
            <Select
              value={form.role}
              onValueChange={(v) => setForm((f) => ({ ...f, role: v }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Rol operativo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="STAFF">Staff Check-in</SelectItem>
                <SelectItem value="APROBADOR">Aprobador</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={form.is_active ? 'active' : 'inactive'}
              onValueChange={(v) => setForm((f) => ({ ...f, is_active: v === 'active' }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Activo</SelectItem>
                <SelectItem value="inactive">Inactivo</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Guardando...' : 'Guardar'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
