import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ChevronLeft, ChevronRight, ClipboardList, Eye, Shield, Fingerprint, ScanLine, Settings2 } from 'lucide-react';
import { api, type AuditEventItem, type AuditKpisResponse } from '@/lib/api';

const fmtDate = (value: string) => {
  try {
    return new Date(value).toLocaleString('es-EC', { hour12: false });
  } catch {
    return value;
  }
};

const actorLabel = (raw?: string | null) => {
  if (!raw) return 'Sistema';
  if (raw === 'public') return 'Invitado (enlace único)';
  if (raw === 'system') return 'Sistema automático';
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw);
  if (isUuid) return 'Usuario interno';
  return raw;
};

const outcomeBadge = (outcome?: string | null) => {
  const value = (outcome || '').toLowerCase();
  if (!value) return <Badge variant="outline">N/D</Badge>;
  if (value.includes('aprob') || value === 'success' || value === 'match') {
    return <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white">Aprobado</Badge>;
  }
  if (value.includes('rechaz') || value === 'no_match' || value === 'no_embedding') {
    return <Badge className="bg-rose-600 hover:bg-rose-600 text-white">Rechazado</Badge>;
  }
  if (value.includes('pendiente')) {
    return <Badge className="bg-amber-500 hover:bg-amber-500 text-white">Pendiente</Badge>;
  }
  return <Badge variant="outline">{outcome}</Badge>;
};

const requiresAttention = (row: AuditEventItem) => {
  const outcome = (row.outcome || '').toLowerCase();
  return (
    row.severity === 'high' ||
    row.event_type === 'CHECKIN_MANUAL_OVERRIDE' ||
    row.event_type === 'ACCESS_DENIED' ||
    outcome.includes('rechaz') ||
    outcome === 'no_match' ||
    outcome === 'no_embedding'
  );
};

const attentionAdvice = (row: AuditEventItem) => {
  if (!requiresAttention(row)) return 'No requiere acción inmediata.';
  if (row.event_type === 'ACCESS_DENIED') return 'Revisar permisos del usuario y confirmar si el bloqueo fue esperado.';
  if (row.event_type === 'CHECKIN_MANUAL_OVERRIDE') return 'Validar que la aprobación manual esté justificada y documentada.';
  const outcome = (row.outcome || '').toLowerCase();
  if (outcome === 'no_match' || outcome === 'no_embedding') return 'Revisar calidad de selfie/documento y solicitar corrección al invitado.';
  if (outcome.includes('rechaz')) return 'Confirmar motivo de rechazo y comunicar al responsable del evento.';
  return 'Revisar este evento con el equipo operativo.';
};

const eventNarrative = (row: AuditEventItem) => {
  const guest = row.attendee_name || 'invitado';
  const eventName = row.event_name || 'el evento';
  const outcome = row.outcome || '';
  switch (row.event_type) {
    case 'GROUP_STATUS_CHANGED':
      return `Se actualizó el estado del grupo de invitación a "${outcome || 'N/D'}".`;
    case 'INVITATION_STATUS_CHANGED':
      return `La invitación cambió a "${outcome || 'N/D'}".`;
    case 'CHECKIN':
      return `${guest} registró su ingreso a ${eventName}.`;
    case 'CHECKIN_MANUAL_OVERRIDE':
      return `Se aprobó manualmente el ingreso de ${guest}.`;
    case 'BIOMETRIC_ATTEMPT':
      return `Se realizó una validación facial para ${guest} con resultado "${outcome || 'N/D'}".`;
    case 'ACCESS_DENIED':
      return 'Se bloqueó una acción por falta de permisos.';
    case 'SETTING_UPDATED':
      return 'Se actualizó una configuración del sistema.';
    case 'SETTING_ADDED':
      return 'Se agregó una configuración del sistema.';
    case 'SETTING_DELETED':
      return 'Se eliminó una configuración del sistema.';
    default:
      return row.summary || 'Se registró un evento de auditoría.';
  }
};

const categoryLabel: Record<string, string> = {
  invitation: 'Invitación',
  invitation_group: 'Grupo',
  checkin: 'Check-in',
  biometric: 'Biometría',
  security: 'Seguridad',
};

export default function Auditoria() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<AuditEventItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState('');
  const [eventFilter, setEventFilter] = useState<string>('all');
  const [events, setEvents] = useState<Array<{ id: number; name: string }>>([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [kpis, setKpis] = useState<AuditKpisResponse | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailRow, setDetailRow] = useState<AuditEventItem | null>(null);

  const loadEventsCatalog = useCallback(async () => {
    try {
      const res = await api.events.list({ limit: 2000 });
      setEvents((res.items || []).map((e: any) => ({ id: e.id, name: e.name })));
    } catch {
      setEvents([]);
    }
  }, []);

  const commonFilters = useMemo(
    () => ({
      date_from: dateFrom ? `${dateFrom}T00:00:00` : undefined,
      date_to: dateTo ? `${dateTo}T23:59:59` : undefined,
      event_id: eventFilter === 'all' ? undefined : Number(eventFilter),
    }),
    [dateFrom, dateTo, eventFilter]
  );

  const loadKpis = useCallback(async () => {
    const data = await api.audit.kpis(commonFilters);
    setKpis(data);
  }, [commonFilters]);

  const loadRows = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.audit.events({
        skip: (page - 1) * pageSize,
        limit: pageSize,
        search: search.trim() || undefined,
        event_id: commonFilters.event_id,
        date_from: commonFilters.date_from,
        date_to: commonFilters.date_to,
      });
      setRows(res.items);
      setTotal(res.total);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, commonFilters]);

  useEffect(() => {
    void loadEventsCatalog();
  }, [loadEventsCatalog]);

  useEffect(() => {
    void loadKpis();
    void loadRows();
  }, [loadKpis, loadRows]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [pageSize, total]);
  const attentionCount = useMemo(
    () => (kpis?.manual_overrides || 0) + (kpis?.access_denied || 0) + (kpis?.biometric_no_match || 0),
    [kpis]
  );

  const openDetail = (row: AuditEventItem) => {
    setDetailRow(row);
    setDetailOpen(true);
  };

  return (
    <Layout>
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Auditoría Operativa</h1>
          <p className="text-gray-600">Trazabilidad unificada de invitaciones, check-in, biometría y seguridad.</p>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardContent className="pt-4">
              <div className="text-xs text-gray-500">Actividad registrada</div>
              <div className="text-2xl font-bold">{kpis?.total_events ?? 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-xs text-gray-500 flex items-center gap-1"><ScanLine className="h-3.5 w-3.5" />Ingresos confirmados</div>
              <div className="text-2xl font-bold">{kpis?.checkins ?? 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-xs text-gray-500 flex items-center gap-1"><Fingerprint className="h-3.5 w-3.5" />Coincidencia biométrica</div>
              <div className="text-2xl font-bold">{kpis?.biometric_match_rate ?? 0}%</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-xs text-gray-500 flex items-center gap-1"><Shield className="h-3.5 w-3.5" />Requieren atención</div>
              <div className="text-2xl font-bold">{attentionCount}</div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ClipboardList className="h-5 w-5" />Eventos de auditoría</CardTitle>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <Input
                placeholder="Búsqueda global"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
              <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} />
              <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} />
              <Select value={eventFilter} onValueChange={(v) => { setEventFilter(v); setPage(1); }}>
                <SelectTrigger><SelectValue placeholder="Evento" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos eventos</SelectItem>
                  {events.map((ev) => (
                    <SelectItem key={ev.id} value={String(ev.id)}>{ev.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Qué pasó</TableHead>
                  <TableHead>Invitado</TableHead>
                  <TableHead>Quién lo hizo</TableHead>
                  <TableHead>Resultado</TableHead>
                  <TableHead>Atención</TableHead>
                  <TableHead>Detalle</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-sm text-gray-500">Cargando auditoría...</TableCell>
                  </TableRow>
                )}
                {!loading && rows.map((row) => (
                  <TableRow key={row.event_uid}>
                    <TableCell>{fmtDate(row.event_time)}</TableCell>
                    <TableCell>
                      <div className="font-medium">{eventNarrative(row)}</div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {categoryLabel[row.category] || row.category} · {row.event_name || 'Sin evento'}
                      </div>
                    </TableCell>
                    <TableCell>{row.attendee_name || '-'}</TableCell>
                    <TableCell>{actorLabel(row.actor_user_id)}</TableCell>
                    <TableCell>{outcomeBadge(row.outcome)}</TableCell>
                    <TableCell>
                      {requiresAttention(row) ? (
                        <Badge className="bg-rose-600 hover:bg-rose-600 text-white">Requiere atención</Badge>
                      ) : (
                        <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white">Normal</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline" className="h-8 gap-2" onClick={() => openDetail(row)}>
                        <Eye className="h-3.5 w-3.5" />
                        Ver
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!loading && rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-sm text-gray-500">No hay datos para los filtros seleccionados.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm text-gray-600">
              <div>Página {page} de {totalPages} · {total} registros</div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1 || loading}>
                  <ChevronLeft className="h-4 w-4 mr-1" />Anterior
                </Button>
                <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
                  <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="20">20 / página</SelectItem>
                    <SelectItem value="50">50 / página</SelectItem>
                    <SelectItem value="100">100 / página</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages || loading}>
                  Siguiente<ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="w-[94vw] max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Settings2 className="h-4 w-4" />Detalle del evento</DialogTitle>
          </DialogHeader>
          {detailRow && (
            <div className="space-y-3 rounded-md border p-4 text-sm">
              <div><strong>Qué pasó:</strong> {eventNarrative(detailRow)}</div>
              <div><strong>Fecha:</strong> {fmtDate(detailRow.event_time)}</div>
              <div><strong>Invitado:</strong> {detailRow.attendee_name || '-'}</div>
              <div><strong>Quién lo hizo:</strong> {actorLabel(detailRow.actor_user_id)}</div>
              <div><strong>Resultado:</strong> {outcomeBadge(detailRow.outcome)}</div>
              <div>
                <strong>Estado:</strong>{' '}
                {requiresAttention(detailRow) ? (
                  <Badge className="bg-rose-600 hover:bg-rose-600 text-white">Requiere atención</Badge>
                ) : (
                  <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white">Normal</Badge>
                )}
              </div>
              <div className="rounded-md border bg-amber-50 px-3 py-2 text-amber-800">
                <strong>Qué hacer ahora:</strong> {attentionAdvice(detailRow)}
              </div>
              <div className="text-xs text-gray-500">
                Detalle interno: {detailRow.summary || '-'}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
