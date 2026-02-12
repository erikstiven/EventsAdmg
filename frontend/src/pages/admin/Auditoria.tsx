import React, { useEffect, useMemo, useState } from 'react';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, ClipboardList } from 'lucide-react';
import { api } from '@/lib/api';

type StatusHistoryItem = {
  id: number;
  invitation_group_id: number;
  group_label: string;
  event_id: number;
  event_name?: string;
  titular_name: string;
  titular_identification: string;
  from_status?: string | null;
  to_status: string;
  changed_by: string;
  reason?: string | null;
  payload?: Record<string, unknown> | null;
  changed_at: string;
};

type StatusHistoryResponse = {
  items: StatusHistoryItem[];
  total: number;
  skip: number;
  limit: number;
};

const fmtDate = (value: string) => {
  try {
    return new Date(value).toLocaleString('es-EC', { hour12: false });
  } catch {
    return value;
  }
};

export default function Auditoria() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<StatusHistoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [events, setEvents] = useState<Array<{ id: number; name: string }>>([]);
  const [eventFilter, setEventFilter] = useState<string>('all');
  const [toStatusFilter, setToStatusFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    const loadEvents = async () => {
      try {
        const res = await api.events.list({ limit: 2000 });
        setEvents((res.items || []).map((e: any) => ({ id: e.id, name: e.name })));
      } catch {
        setEvents([]);
      }
    };
    loadEvents();
  }, []);

  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true);
        const result: StatusHistoryResponse = await api.invitationGroups.statusHistory({
          skip: (page - 1) * pageSize,
          limit: pageSize,
          search: search.trim() || undefined,
          event_id: eventFilter === 'all' ? undefined : Number(eventFilter),
          to_status: toStatusFilter === 'all' ? undefined : toStatusFilter,
        });
        setRows(result.items || []);
        setTotal(result.total || 0);
      } catch (e) {
        setRows([]);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [page, pageSize, search, eventFilter, toStatusFilter]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize]);
  const hasActiveFilters = Boolean(search.trim()) || eventFilter !== 'all' || toStatusFilter !== 'all';

  const statusOptions = [
    'Pendiente completar',
    'Pendiente aprobación',
    'Pendiente de actualización',
    'Aprobado parcial',
    'Aprobado',
    'Rechazado',
  ];

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Auditoría</h1>
          <p className="text-gray-600">
            Historial de cambios de estado con origen, destino, usuario, motivo y fecha.
          </p>
        </div>

        <Card>
          <CardHeader className="space-y-4">
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5" />
              Historial de estados
            </CardTitle>
            <div className="grid gap-3 md:grid-cols-3">
              <Input
                placeholder="Buscar por grupo, titular, cédula, evento o usuario"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
              <Select
                value={eventFilter}
                onValueChange={(v) => {
                  setEventFilter(v);
                  setPage(1);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Evento" />
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
              <Select
                value={toStatusFilter}
                onValueChange={(v) => {
                  setToStatusFilter(v);
                  setPage(1);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Estado destino" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los estados destino</SelectItem>
                  {statusOptions.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="text-xs text-gray-500">
              {hasActiveFilters ? 'Mostrando resultados filtrados' : 'Sin filtros activos'}
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Grupo</TableHead>
                  <TableHead>Evento</TableHead>
                  <TableHead>Titular</TableHead>
                  <TableHead>Origen</TableHead>
                  <TableHead>Destino</TableHead>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Motivo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-sm text-gray-500 py-8">
                      Cargando historial...
                    </TableCell>
                  </TableRow>
                )}
                {!loading &&
                  rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{fmtDate(row.changed_at)}</TableCell>
                      <TableCell>{row.group_label}</TableCell>
                      <TableCell>{row.event_name || `Evento ${row.event_id}`}</TableCell>
                      <TableCell>
                        <div>{row.titular_name}</div>
                        <div className="text-xs text-gray-500">{row.titular_identification}</div>
                      </TableCell>
                      <TableCell>{row.from_status || 'Inicial'}</TableCell>
                      <TableCell>{row.to_status}</TableCell>
                      <TableCell>{row.changed_by}</TableCell>
                      <TableCell>{row.reason || '-'}</TableCell>
                    </TableRow>
                  ))}
                {!loading && rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-sm text-gray-500 py-8">
                      No hay cambios de estado para los filtros actuales.
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
    </Layout>
  );
}

