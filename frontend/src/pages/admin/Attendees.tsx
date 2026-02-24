import React, { useState } from 'react';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import StatusBadge from '@/components/StatusBadge';
import { AttendeeDetailModal } from '@/components/modals/AttendeeDetailModal';
import { type AttendeeOperationalItem } from '@/api/attendees';
import { useAttendeesOperational } from '@/hooks/useAttendeesOperational';
import { Filter, Search } from 'lucide-react';

export default function Attendees() {
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailAttendee, setDetailAttendee] = useState<AttendeeOperationalItem | null>(null);

  const [filters, setFilters] = useState({
    eventId: 'all',
    status: 'all',
    biometric: 'all',
    checkin: 'all',
    q: '',
    page: 1,
    pageSize: 20,
  });

  const eventsQuery = useQuery({
    queryKey: ['events', 'all'],
    queryFn: () => api.events.list({ limit: 2000 }),
  });

  const operationalQuery = useAttendeesOperational(filters);

  const handleOpenDetail = (row: AttendeeOperationalItem) => {
    setDetailAttendee(row);
    setDetailOpen(true);
  };

  const approvalLabel = (status: AttendeeOperationalItem['invitation_status']) =>
    status === 'approved' ? 'Aprobado' : status === 'rejected' ? 'Rechazado' : 'Pendiente';

  const biometricLabel = (status: AttendeeOperationalItem['biometric_status']) =>
    status === 'ok' ? 'Rostro registrado' : 'Sin rostro';

  const checkinLabel = (status: AttendeeOperationalItem['checkin_status']) =>
    status === 'checked_in' ? 'Ingresado' : 'No ingresado';

  const events = eventsQuery.data?.items || [];
  const metrics = operationalQuery.data?.metrics;
  const items = operationalQuery.data?.items || [];
  const total = operationalQuery.data?.total || 0;
  const pageCount = Math.max(1, Math.ceil(total / filters.pageSize));
  const isLoading = operationalQuery.isLoading || eventsQuery.isLoading;

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold">Panel operativo de asistentes</h1>
            <p className="text-sm text-gray-600">
              Vista consolidada de aprobación, registro de rostro y check-in.
            </p>
          </div>
          <Badge variant="outline" className="px-3 py-1 text-sm">
            {isLoading ? 'Cargando...' : `${total} asistentes`}
          </Badge>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs text-gray-500">Total</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">{metrics?.total ?? 0}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs text-gray-500">Pendientes</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold text-amber-600">{metrics?.pendientes ?? 0}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs text-gray-500">Aprobados</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold text-emerald-600">{metrics?.aprobados ?? 0}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs text-gray-500">Ingresados</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold text-blue-600">{metrics?.ingresados ?? 0}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs text-gray-500">Rechazados</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold text-rose-600">{metrics?.rechazados ?? 0}</CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="space-y-2">
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-4 w-4" /> Filtros
            </CardTitle>
            <p className="text-xs text-gray-500">
              Filtra por estado de aprobación, registro de rostro y check-in. El rostro registrado no implica ingreso al evento.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              <div className="space-y-1">
                <p className="text-xs text-gray-500">Evento</p>
                <Select
                  value={filters.eventId}
                  onValueChange={(value) => setFilters((f) => ({ ...f, eventId: value, page: 1 }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Todos los eventos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los eventos</SelectItem>
                    {events.map((ev) => (
                      <SelectItem key={ev.id} value={String(ev.id)}>
                        {ev.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-gray-500">Aprobación</p>
                <Select
                  value={filters.status}
                  onValueChange={(value) => setFilters((f) => ({ ...f, status: value, page: 1 }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Todas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    <SelectItem value="pending">Pendiente</SelectItem>
                    <SelectItem value="approved">Aprobado</SelectItem>
                    <SelectItem value="rejected">Rechazado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-gray-500">Rostro</p>
                <Select
                  value={filters.biometric}
                  onValueChange={(value) => setFilters((f) => ({ ...f, biometric: value, page: 1 }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Todas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    <SelectItem value="ok">Rostro registrado</SelectItem>
                    <SelectItem value="missing">Sin rostro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-gray-500">Ingreso</p>
                <Select
                  value={filters.checkin}
                  onValueChange={(value) => setFilters((f) => ({ ...f, checkin: value, page: 1 }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="checked_in">Ingresado</SelectItem>
                    <SelectItem value="not_checked">No ingresado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-gray-500">Búsqueda</p>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <Input
                    className="pl-9"
                    placeholder="Nombre o documento"
                    value={filters.q}
                    onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value, page: 1 }))}
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setFilters({
                    eventId: 'all',
                    status: 'all',
                    biometric: 'all',
                    checkin: 'all',
                    q: '',
                    page: 1,
                    pageSize: filters.pageSize,
                  })
                }
              >
                Limpiar filtros
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="py-12 text-center text-gray-500">Cargando asistentes...</div>
            ) : operationalQuery.isError ? (
              <div className="py-12 text-center text-rose-600">Error cargando asistentes.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                      <TableHead>Invitado</TableHead>
                      <TableHead>Documento</TableHead>
                      <TableHead>Evento</TableHead>
                      <TableHead>Aprobación</TableHead>
                    <TableHead>Rostro</TableHead>
                    <TableHead>Ingreso</TableHead>
                    <TableHead>Fecha</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                  {items.map((row) => (
                    <TableRow key={`${row.invitation_id}-${row.attendee_id}`}>
                      <TableCell className="font-medium">{row.full_name}</TableCell>
                      <TableCell>{row.identification}</TableCell>
                      <TableCell>{row.event_name}</TableCell>
                      <TableCell>
                        <StatusBadge
                          tone={row.invitation_status}
                          label={approvalLabel(row.invitation_status)}
                        />
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          tone={row.biometric_status}
                          label={biometricLabel(row.biometric_status)}
                        />
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          tone={row.checkin_status === 'checked_in' ? 'checked_in' : 'missing'}
                          label={checkinLabel(row.checkin_status)}
                        />
                      </TableCell>
                      <TableCell>
                        {new Date(row.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button size="sm" variant="outline" onClick={() => handleOpenDetail(row)}>
                          Ver detalle
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
              <div className="text-sm text-gray-500">
                Página {filters.page} de {pageCount}
              </div>
              <div className="flex items-center gap-2">
                <Select
                  value={String(filters.pageSize)}
                  onValueChange={(value) =>
                    setFilters((f) => ({ ...f, pageSize: Number(value), page: 1 }))
                  }
                >
                  <SelectTrigger className="w-[100px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[10, 20, 50].map((size) => (
                      <SelectItem key={size} value={String(size)}>
                        {size} / pág
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={filters.page <= 1}
                  onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}
                >
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={filters.page >= pageCount}
                  onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}
                >
                  Siguiente
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <AttendeeDetailModal
          open={detailOpen}
          onOpenChange={setDetailOpen}
          attendee={detailAttendee}
        />
      </div>
    </Layout>
  );
}
