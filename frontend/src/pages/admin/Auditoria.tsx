import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import InvitationGroupStatusBadge from '@/components/InvitationGroupStatusBadge';
import { ChevronLeft, ChevronRight, ClipboardList, Eye } from 'lucide-react';
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

const toUserLabel = (raw: string) => {
  if (!raw) return '-';
  if (raw === 'public') return 'Invitado (público)';
  if (raw === 'system') return 'Sistema';
  if (/^\d+$/.test(raw)) return `Usuario #${raw}`;
  return raw;
};

const fieldLabelMap: Record<string, string> = {
  event_id: 'Evento',
  titular_name: 'Nombre titular',
  titular_identification: 'Cédula titular',
  fingerprint_code: 'Código dactilar',
  email: 'Correo',
  phone: 'Teléfono',
  group_size: 'Cupo total',
  send_email: 'Enviar correo',
  send_email_cc: 'Enviar CC',
  intransferible: 'Intransferible',
  companions: 'Acompañantes',
};

type ActionView = {
  title: string;
  summary: string;
  details: string[];
};

const parseAction = (payload?: Record<string, unknown> | null): ActionView => {
  if (!payload || typeof payload !== 'object') {
    return { title: 'Cambio de estado', summary: 'Sin metadatos adicionales.', details: [] };
  }

  const action = typeof payload.action === 'string' ? payload.action : '';
  if (action === 'admin_edit') {
    const changedFieldsRaw = Array.isArray(payload.changed_fields)
      ? payload.changed_fields.filter((f): f is string => typeof f === 'string')
      : [];
    const changedFields = changedFieldsRaw.map((field) => fieldLabelMap[field] || field);
    const fieldChangesRaw =
      payload.field_changes && typeof payload.field_changes === 'object'
        ? (payload.field_changes as Record<string, unknown>)
        : {};
    const valueChanges: string[] = Object.entries(fieldChangesRaw)
      .map(([field, value]) => {
        if (!value || typeof value !== 'object') return null;
        const from = (value as Record<string, unknown>).from;
        const to = (value as Record<string, unknown>).to;
        const label = fieldLabelMap[field] || field;
        const fromText = from === null || from === undefined || from === '' ? 'vacío' : String(from);
        const toText = to === null || to === undefined || to === '' ? 'vacío' : String(to);
        return `${label}: "${fromText}" -> "${toText}"`;
      })
      .filter((line): line is string => Boolean(line));
    const replacements = Array.isArray(payload.identity_replacements)
      ? payload.identity_replacements.filter(
          (item): item is Record<string, unknown> => typeof item === 'object' && item !== null
        )
      : [];
    const sensitive = payload.sensitive_change === true;
    const flags = payload.flags_changed === true;
    const details: string[] = [...valueChanges];
    if (changedFields.length) {
      details.unshift(`Campos actualizados: ${changedFields.join(', ')}`);
    }
    if (replacements.length) {
      replacements.forEach((entry) => {
          const role = String(entry.role || '');
          const index = typeof entry.index === 'number' ? entry.index : null;
          const fromName = String(entry.from_name || '-');
          const fromCedula = String(entry.from_cedula || '-');
          const toName = String(entry.to_name || '-');
          const toCedula = String(entry.to_cedula || '-');
          const actor = role === 'titular' ? 'Titular' : `Acompañante #${index ?? '?'}`;
          details.push(`Reemplazo ${actor}: ${fromName} (${fromCedula}) -> ${toName} (${toCedula})`);
      });
    }
    if (sensitive) details.push('Cambio sensible: se invalida aprobación/QR previo y se genera nuevo enlace.');
    if (flags) details.push('Cambio en banderas de envío/transferencia.');
    return {
      title: 'Edición administrativa',
      summary: changedFields.length
        ? `${changedFields.length} campo(s) actualizado(s).`
        : 'Se aplicó una edición sin campos detectados.',
      details,
    };
  }

  if (action === 'create') {
    return { title: 'Creación de invitación', summary: 'Se creó el grupo de invitación.', details: [] };
  }

  if (action === 'public_register') {
    return { title: 'Registro público', summary: 'El invitado envió su formulario.', details: [] };
  }

  if (action === 'participant_decision') {
    const participants = Array.isArray(payload.participants)
      ? payload.participants.filter((p): p is Record<string, unknown> => typeof p === 'object' && p !== null)
      : [];
    const approved = participants.filter((p) => p.approved === true).length;
    const rejected = participants.filter((p) => p.approved === false).length;
    return {
      title: 'Decisión de aprobación',
      summary: `${participants.length} participante(s) procesado(s).`,
      details: [`Aprobados: ${approved}`, `Rechazados: ${rejected}`],
    };
  }

  if (action === 'reopen_update') {
    const affected = Array.isArray(payload.affected)
      ? payload.affected.filter((p): p is Record<string, unknown> => typeof p === 'object' && p !== null)
      : [];
    return {
      title: 'Habilitación de corrección',
      summary: `${affected.length} persona(s) habilitada(s) para actualizar documentos.`,
      details: affected.map((p) => {
        const role = (p.role || '').toString() === 'titular' ? 'Titular' : 'Acompañante';
        const name = (p.name || '-').toString();
        const cedula = (p.cedula || '-').toString();
        return `${role}: ${name} (${cedula})`;
      }),
    };
  }

  if (action === 'group_decision') {
    const approved = payload.approved === true;
    return {
      title: approved ? 'Aprobación total' : 'Rechazo total',
      summary: approved ? 'Se aprobó toda la invitación.' : 'Se rechazó toda la invitación.',
      details: [],
    };
  }

  return {
    title: action || 'Cambio de estado',
    summary: 'Evento registrado en historial.',
    details: [],
  };
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
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailRow, setDetailRow] = useState<StatusHistoryItem | null>(null);

  const loadEvents = useCallback(async () => {
    try {
      const res = await api.events.list({ limit: 2000 });
      setEvents((res.items || []).map((e: any) => ({ id: e.id, name: e.name })));
    } catch {
      setEvents([]);
    }
  }, []);

  const loadHistory = useCallback(async (options?: { silent?: boolean }) => {
    try {
      if (!options?.silent) setLoading(true);
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
      if (!options?.silent) {
        setRows([]);
        setTotal(0);
      }
    } finally {
      if (!options?.silent) setLoading(false);
    }
  }, [eventFilter, page, pageSize, search, toStatusFilter]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (document.hidden) return;
      loadHistory({ silent: true });
    }, 15000);
    return () => window.clearInterval(intervalId);
  }, [loadHistory]);

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

  const openDetail = (row: StatusHistoryItem) => {
    setDetailRow(row);
    setDetailOpen(true);
  };

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
                  <TableHead>Acción</TableHead>
                  <TableHead>Detalle</TableHead>
                  <TableHead>Motivo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-sm text-gray-500 py-8">
                      Cargando historial...
                    </TableCell>
                  </TableRow>
                )}
                {!loading &&
                  rows.map((row) => {
                    const action = parseAction(row.payload);
                    return (
                    <TableRow key={row.id}>
                      <TableCell>{fmtDate(row.changed_at)}</TableCell>
                      <TableCell>{row.group_label}</TableCell>
                      <TableCell>{row.event_name || `Evento ${row.event_id}`}</TableCell>
                      <TableCell>
                        <div>{row.titular_name}</div>
                        <div className="text-xs text-gray-500">{row.titular_identification}</div>
                      </TableCell>
                      <TableCell>
                        {row.from_status ? (
                          <InvitationGroupStatusBadge status={row.from_status} />
                        ) : (
                          <Badge variant="outline">Inicial</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <InvitationGroupStatusBadge status={row.to_status} />
                      </TableCell>
                      <TableCell>{toUserLabel(row.changed_by)}</TableCell>
                      <TableCell className="max-w-[280px]">
                        <div className="font-medium text-slate-900">{action.title}</div>
                        <div className="text-xs text-slate-600 whitespace-normal break-words">{action.summary}</div>
                      </TableCell>
                      <TableCell className="max-w-[360px] whitespace-normal break-words">
                        {action.details.length === 0 ? (
                          <span className="text-slate-500">-</span>
                        ) : (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 gap-2"
                            onClick={() => openDetail(row)}
                          >
                            <Eye className="h-3.5 w-3.5" />
                            Ver cambios
                            <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-[10px]">
                              {action.details.length}
                            </Badge>
                          </Button>
                        )}
                      </TableCell>
                      <TableCell>{row.reason || '-'}</TableCell>
                    </TableRow>
                  )})}
                {!loading && rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-sm text-gray-500 py-8">
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

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="w-[94vw] max-w-3xl max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalle de cambios</DialogTitle>
          </DialogHeader>
          {detailRow && (() => {
            const action = parseAction(detailRow.payload);
            return (
              <div className="space-y-4">
                <div className="rounded-md border p-3">
                  <div className="text-xs text-slate-500">Acción</div>
                  <div className="text-base font-semibold text-slate-900">{action.title}</div>
                  <div className="text-sm text-slate-600">{action.summary}</div>
                </div>

                <div className="rounded-md border p-3">
                  <div className="text-xs text-slate-500 mb-2">Cambios detectados</div>
                  {action.details.length === 0 ? (
                    <div className="text-sm text-slate-500">No hay detalle adicional para esta acción.</div>
                  ) : (
                    <div className="space-y-2">
                      {action.details.map((line, idx) => (
                        <div key={`${detailRow.id}-modal-detail-${idx}`} className="rounded-md border bg-slate-50 px-3 py-2 text-sm text-slate-700">
                          {line}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-md border p-3">
                  <div className="text-xs text-slate-500">Motivo</div>
                  <div className="text-sm text-slate-700">{detailRow.reason || '-'}</div>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </Layout>
  );
}

