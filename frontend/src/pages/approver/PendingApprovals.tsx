import { useMemo, useState } from 'react';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import InvitationGroupStatusBadge from '@/components/InvitationGroupStatusBadge';
import ActionIconButton from '@/components/ActionIconButton';
import { Eye, CheckCircle2, XCircle, CreditCard, QrCode, RotateCcw, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { config } from '@/lib/config';
import { getInvitationGroupStatusMeta, normalizeInvitationGroupStatus } from '@/lib/invitationGroupStatus';
import { useToast } from '@/hooks/use-toast';
import { QRCodeDisplay } from '@/components/QRCodeDisplay';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { InfinitySpin } from 'react-loader-spinner';

const APPROVALS_PENDING_QUERY_KEY = ['approvals', 'groups'] as const;


type Companion = {
  name?: string;
  cedula?: string;
  email?: string;
  telefono?: string;
  codigo?: string;
  selfie_url?: string;
  doc_url?: string;
  qr_token?: string | null;
  approved?: boolean | null;
};

type ApprovalItem = {
  id: number;
  event_id: number;
  event_name: string;
  titular_name: string;
  titular_identification: string;
  email?: string | null;
  phone?: string | null;
  group_size: number;
  status: string;
  created_at?: string | null;
  companions: Companion[];
  titular_selfie_url?: string | null;
  titular_doc_url?: string | null;
  titular_approved?: boolean | null;
  titular_qr_token?: string | null;
  link?: string | null;
  token_plain?: string | null;
};

type Participant = {
  name: string;
  rol: 'Titular' | 'Acompañante';
  cedula: string;
  email?: string;
  telefono?: string;
  selfie: boolean;
  doc: boolean;
  selfie_url?: string | null;
  doc_url?: string | null;
  qr_token?: string | null;
  approved?: boolean | null;
  companion_index?: number;
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

export default function PendingApprovals() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<ApprovalItem | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewTitle, setPreviewTitle] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [qrOpen, setQrOpen] = useState(false);
  const [qrTitle, setQrTitle] = useState('');
  const [qrValue, setQrValue] = useState('');
  const [approvedSet, setApprovedSet] = useState<Record<string, boolean>>({});
  const [rejectSet, setRejectSet] = useState<Record<string, boolean>>({});
  const [detailMode, setDetailMode] = useState<'view' | 'approve'>('view');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'approve' | null>(null);
  const [confirmItem, setConfirmItem] = useState<ApprovalItem | null>(null);
  const [isApproving, setIsApproving] = useState(false);
  const [reason, setReason] = useState('');
  const [search, setSearch] = useState('');
  const [selectedEvent, setSelectedEvent] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [updateOpen, setUpdateOpen] = useState(false);
  const [updateTarget, setUpdateTarget] = useState<ApprovalItem | null>(null);
  const [updateReason, setUpdateReason] = useState('');
  const [updateSet, setUpdateSet] = useState<Record<string, boolean>>({});
  const [isUpdating, setIsUpdating] = useState(false);

  const eventsQuery = useQuery({
    queryKey: ['events', 'all'],
    queryFn: () => api.events.list({ limit: 2000 }),
  });

  const approvalsQuery = useQuery({
    queryKey: APPROVALS_PENDING_QUERY_KEY,
    queryFn: () => api.invitationGroups.list({ skip: 0, limit: 2000 }),
    refetchInterval: 10000,
    staleTime: 0,
  });

  const approveMutation = useMutation({
    mutationFn: (payload: { invitation_id: number; participants: any[] }) =>
      api.invitationGroups.approve(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: APPROVALS_PENDING_QUERY_KEY });
      await queryClient.refetchQueries({ queryKey: APPROVALS_PENDING_QUERY_KEY });
      await queryClient.invalidateQueries({ queryKey: ['invitationGroups'] });
      await queryClient.invalidateQueries({ queryKey: ['approvals', 'pending', 'count'] });
      await queryClient.refetchQueries({ queryKey: ['approvals', 'pending', 'count'] });
    },
  });

  const requestUpdateMutation = useMutation({
    mutationFn: (payload: { invitation_id: number; reason?: string; participants: any[] }) =>
      api.invitationGroups.requestUpdate(payload.invitation_id, {
        reason: payload.reason,
        participants: payload.participants,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: APPROVALS_PENDING_QUERY_KEY });
      await queryClient.refetchQueries({ queryKey: APPROVALS_PENDING_QUERY_KEY });
      await queryClient.invalidateQueries({ queryKey: ['invitationGroups'] });
      await queryClient.invalidateQueries({ queryKey: ['approvals', 'pending', 'count'] });
      await queryClient.refetchQueries({ queryKey: ['approvals', 'pending', 'count'] });
    },
  });

  const events = eventsQuery.data?.items || [];
  const eventNameById = useMemo(
    () => new Map(events.map((ev) => [ev.id, ev.name])),
    [events]
  );

  const items: ApprovalItem[] = useMemo(() => {
    const rows = approvalsQuery.data?.items || [];
    return rows.map((item: any) => ({
      id: item.id,
      event_id: item.event_id,
      event_name: item.event_name || eventNameById.get(item.event_id) || `Evento ${item.event_id}`,
      titular_name: item.titular_name,
      titular_identification: item.titular_identification,
      email: item.email,
      phone: item.phone,
      group_size: item.group_size,
      status: item.status,
      created_at: item.created_at,
      companions: Array.isArray(item.companions) ? item.companions : [],
      titular_selfie_url: item.titular_selfie_url,
      titular_doc_url: item.titular_doc_url,
      titular_approved: item.titular_approved ?? null,
      titular_qr_token: item.titular_qr_token ?? null,
      link: item.link ?? null,
      token_plain: item.token_plain ?? null,
    }));
  }, [approvalsQuery.data, eventNameById]);

  const canApproveOrRejectStatus = (status: string) => {
    const key = normalizeInvitationGroupStatus(status);
    return (
      key === 'pendiente aprobacion' ||
      key === 'pendiente de actualizacion' ||
      key === 'aprobado parcial'
    );
  };

  const canRequestUpdateStatus = (status: string) => {
    const key = normalizeInvitationGroupStatus(status);
    return (
      key === 'pendiente aprobacion' ||
      key === 'pendiente de actualizacion' ||
      key === 'aprobado parcial' ||
      key === 'aprobado'
    );
  };

  const eventOptions = useMemo(() => {
    if (events.length) {
      return events.map((ev) => ({ id: ev.id, name: ev.name || `Evento ${ev.id}` }));
    }
    const seen = new Map<number, string>();
    items.forEach((item) => {
      if (!seen.has(item.event_id)) {
        seen.set(item.event_id, item.event_name || `Evento ${item.event_id}`);
      }
    });
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [events, items]);

    const getParticipants = (item: ApprovalItem): Participant[] => {
    const participants: Participant[] = [
      {
        name: item.titular_name,
        rol: 'Titular',
        cedula: item.titular_identification,
        email: item.email || undefined,
        telefono: item.phone || undefined,
        selfie: Boolean(item.titular_selfie_url),
        doc: Boolean(item.titular_doc_url),
        selfie_url: item.titular_selfie_url,
        doc_url: item.titular_doc_url,
        qr_token: item.titular_qr_token ?? null,
        approved: item.titular_approved ?? null,
      },
    ];
    item.companions.forEach((comp, index) => {
      participants.push({
        name: comp.name || 'Acompañante',
        rol: 'Acompañante',
        cedula: comp.cedula || '---',
        email: comp.email,
        telefono: comp.telefono,
        selfie: Boolean(comp.selfie_url),
        doc: Boolean(comp.doc_url),
        selfie_url: comp.selfie_url,
        doc_url: comp.doc_url,
        qr_token: comp.qr_token ?? null,
        approved: typeof (comp as any).approved === 'boolean' ? (comp as any).approved : null,
        companion_index: index,
      });
    });
    return participants;
  };
  
  const deriveStatus = (item: ApprovalItem) => {
    // Keep approver view aligned with admin/backend canonical state.
    return normalizeInvitationGroupStatus(item.status);
  };

  const filtered = useMemo(() => {
    const base = items.filter((item) => {
      const matchEvent = selectedEvent === 'all' || String(item.event_id) === selectedEvent;
      if (!matchEvent) return false;
      const normalizedStatus = deriveStatus(item);
      const matchStatus = selectedStatus === 'all' || normalizedStatus === selectedStatus;
      if (!matchStatus) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        item.titular_name.toLowerCase().includes(q) ||
        item.titular_identification.includes(q) ||
        item.event_name.toLowerCase().includes(q)
      );
    });
    return base.sort((a, b) => {
      const aTs = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bTs = b.created_at ? new Date(b.created_at).getTime() : 0;
      return aTs - bTs;
    });
  }, [items, selectedEvent, selectedStatus, search]);



  const getCompletionCount = (item: ApprovalItem) => {
    const participants = getParticipants(item);
    const completed = participants.filter((p) => p.selfie && p.doc).length;
    return { completed, total: participants.length };
  };

  const resolveFileUrl = (path?: string | null) => {
    if (!path) return '';
    if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:')) {
      return path;
    }
    const base = config.API_BASE_URL || '';
    return `${base}${path}`;
  };

  const openPreview = (title: string, url?: string | null) => {
    if (!url) {
      toast({
        title: 'Sin archivo',
        description: 'No hay imagen cargada para este documento.',
        variant: 'destructive',
      });
      return;
    }
    setPreviewTitle(title);
    setPreviewUrl(resolveFileUrl(url));
    setPreviewOpen(true);
  };

  const openQr = (_item: ApprovalItem, participant: Participant) => {
    const value = participant.qr_token || '';
    if (!value) {
      toast({
        title: 'QR no disponible',
        description: 'No se pudo generar el QR para esta persona.',
        variant: 'destructive',
      });
      return;
    }
    setQrTitle(`QR - ${participant.name}`);
    setQrValue(value);
    setQrOpen(true);
  };

  const getParticipantKey = (p: Participant) =>
    `${p.rol}-${p.cedula}-${p.companion_index ?? 'titular'}-${p.name}`;

  const initApprovalState = (item: ApprovalItem) => {
    const participants = getParticipants(item);
    const next: Record<string, boolean> = {};
    participants.forEach((p) => {
      next[getParticipantKey(p)] = p.selfie && p.doc && !p.approved;
    });
    setApprovedSet(next);
  };

  const initRejectState = (item: ApprovalItem) => {
    const participants = getParticipants(item);
    const next: Record<string, boolean> = {};
    participants.forEach((p) => {
      next[getParticipantKey(p)] = false;
    });
    setRejectSet(next);
  };

  const initUpdateState = (item: ApprovalItem) => {
    const participants = getParticipants(item);
    const next: Record<string, boolean> = {};
    participants.forEach((p) => {
      next[getParticipantKey(p)] = true;
    });
    setUpdateSet(next);
    setUpdateReason('');
  };

  const canApproveSelection = (item: ApprovalItem) => {
    const participants = getParticipants(item);
    const selected = participants.filter((p) => approvedSet[getParticipantKey(p)]);
    if (selected.length === 0) return false;
    return selected.every((p) => p.selfie && p.doc);
  };

  const getSelectedCount = (item: ApprovalItem) => {
    const participants = getParticipants(item);
    return participants.filter((p) => approvedSet[getParticipantKey(p)]).length;
  };

  const approve = async (item: ApprovalItem) => {
    try {
      const participants = getParticipants(item)
        .filter((p) => approvedSet[getParticipantKey(p)])
        .map((p) => ({
          role: (p.rol === 'Titular' ? 'titular' : 'acompanante') as 'titular' | 'acompanante',
          index: p.rol === 'Acompañante' ? p.companion_index : undefined,
          approved: true,
        }));
      if (participants.length === 0) {
        toast({
          title: 'Selecciona registros',
          description: 'Debes seleccionar al menos una persona completa para aprobar.',
          variant: 'destructive',
        });
        return false;
      }

      await approveMutation.mutateAsync({
        invitation_id: item.id,
        participants,
      });
      toast({
        title: 'Aprobado',
        description: 'Aprobación aplicada. Se enviará el QR a los seleccionados.',
      });
      return true;
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error?.data?.detail || 'No se pudo aprobar la solicitud.',
        variant: 'destructive',
      });
      return false;
    }
  };

  const reject = async () => {
    if (!selected) return;
    try {
      const participants = getParticipants(selected)
        .filter((p) => rejectSet[getParticipantKey(p)])
        .map((p) => ({
          role: (p.rol === 'Titular' ? 'titular' : 'acompanante') as 'titular' | 'acompanante',
          index: p.rol === 'Acompañante' ? p.companion_index : undefined,
          approved: false,
          rejection_reason: reason || undefined,
        }));
      if (participants.length === 0) {
        toast({
          title: 'Selecciona personas',
          description: 'Elige al menos una persona para rechazar.',
          variant: 'destructive',
        });
        return;
      }
      await approveMutation.mutateAsync({
        invitation_id: selected.id,
        participants,
      });
      setRejectOpen(false);
      setDialogOpen(false);
      setReason('');
      setRejectSet({});
      toast({
        title: 'Rechazado',
        description: 'Rechazo aplicado a los seleccionados.',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error?.data?.detail || 'No se pudo rechazar la solicitud.',
        variant: 'destructive',
      });
    }
  };

  const openConfirm = (item: ApprovalItem, action: 'approve') => {
    setConfirmItem(item);
    setConfirmAction(action);
    setDialogOpen(false);
    setConfirmOpen(true);
  };

  const runConfirm = async () => {
    if (!confirmItem || !confirmAction) return;
    setIsApproving(true);
    const ok = await approve(confirmItem);
    setIsApproving(false);
    if (ok) {
      setConfirmOpen(false);
      setDialogOpen(false);
      setSelected(null);
    }
  };

  const requestUpdate = async () => {
    if (!updateTarget) return;
    const participants = getParticipants(updateTarget)
      .filter((p) => updateSet[getParticipantKey(p)])
      .map((p) => ({
        role: (p.rol === 'Titular' ? 'titular' : 'acompanante') as 'titular' | 'acompanante',
        index: p.rol === 'Acompañante' ? p.companion_index : undefined,
      }));

    if (participants.length === 0) {
      toast({
        title: 'Selecciona personas',
        description: 'Debes seleccionar al menos una persona para corregir.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setIsUpdating(true);
      await requestUpdateMutation.mutateAsync({
        invitation_id: updateTarget.id,
        reason: updateReason.trim() || undefined,
        participants,
      });
      setUpdateOpen(false);
      setUpdateTarget(null);
      setUpdateReason('');
      setUpdateSet({});
      toast({
        title: 'Corrección habilitada',
        description: 'Se habilitó actualización para las personas seleccionadas.',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error?.data?.detail || 'No se pudo habilitar la corrección.',
        variant: 'destructive',
      });
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Gestión de aprobaciones</h1>
          <p className="text-gray-600">
            Revisa solicitudes por grupo, aprueba/rechaza cuando aplique y consulta el estado actual de cada invitación.
          </p>
        </div>

        <Card>
          <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <CardTitle>Solicitudes por grupo</CardTitle>
            <div className="flex flex-col md:flex-row gap-2 w-full md:w-auto">
              <Input
                placeholder="Buscar por nombre, cédula o evento"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <Select value={selectedEvent} onValueChange={setSelectedEvent}>
                <SelectTrigger className="md:w-[260px]">
                  <SelectValue placeholder="Evento" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los eventos</SelectItem>
                  {eventOptions.map((ev) => (
                    <SelectItem key={ev.id} value={String(ev.id)}>
                      {ev.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                <SelectTrigger className="md:w-[260px]">
                  <SelectValue placeholder="Estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los estados</SelectItem>
                  <SelectItem value="pendiente completar">Pendiente completar</SelectItem>
                  <SelectItem value="pendiente de actualizacion">Pendiente de actualización</SelectItem>
                  <SelectItem value="pendiente aprobacion">Pendiente aprobación</SelectItem>
                  <SelectItem value="aprobado parcial">Aprobado parcial</SelectItem>
                  <SelectItem value="aprobado">Aprobado</SelectItem>
                  <SelectItem value="rechazado">Rechazado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Titular</TableHead>
                  <TableHead>Evento</TableHead>
                  <TableHead>Grupo</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Creado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((item) => {
                  const completion = getCompletionCount(item);
                  const canApproveOrReject = canApproveOrRejectStatus(item.status);
                  const canRequestUpdate = canRequestUpdateStatus(item.status);
                  return (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.titular_name}</TableCell>
                      <TableCell>{item.event_name}</TableCell>
                      <TableCell>{completion.completed}/{completion.total} completados</TableCell>
                      <TableCell>
                        <InvitationGroupStatusBadge status={item.status} className="px-3 py-1 text-xs" />
                      </TableCell>
                      <TableCell>{formatDateTime(item.created_at)}</TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex items-center gap-2">
                          <ActionIconButton
                            label="Ver detalle"
                            tone="neutral"
                            onClick={() => {
                              setSelected(item);
                              setDetailMode('view');
                              setDialogOpen(true);
                            }}
                          >
                            <Eye className="h-4 w-4" />
                          </ActionIconButton>
                          <ActionIconButton
                            label="Aprobar"
                            tone="success"
                            disabled={!canApproveOrReject}
                            onClick={() => {
                              if (!canApproveOrReject) return;
                              setSelected(item);
                              setDetailMode('approve');
                              initApprovalState(item);
                              setDialogOpen(true);
                            }}
                          >
                            <CheckCircle2 className="h-4 w-4" />
                          </ActionIconButton>
                          <ActionIconButton
                            label="Solicitar corrección"
                            tone="warning"
                            disabled={!canRequestUpdate}
                            onClick={() => {
                              if (!canRequestUpdate) return;
                              setUpdateTarget(item);
                              initUpdateState(item);
                              setUpdateOpen(true);
                            }}
                          >
                            <RotateCcw className="h-4 w-4" />
                          </ActionIconButton>
                          <ActionIconButton
                            label="Rechazar"
                            tone="danger"
                            disabled={!canApproveOrReject}
                            onClick={() => {
                              if (!canApproveOrReject) return;
                              setSelected(item);
                              setReason('');
                              initRejectState(item);
                              setRejectOpen(true);
                            }}
                          >
                            <XCircle className="h-4 w-4" />
                          </ActionIconButton>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-sm text-gray-500 py-8">
                      No hay solicitudes para los filtros seleccionados.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent
          className="w-[92vw] max-w-3xl max-h-[85vh] overflow-y-auto"
          onPointerDownOutside={(e) => {
            if (detailMode === 'approve') e.preventDefault();
          }}
          onInteractOutside={(e) => {
            if (detailMode === 'approve') e.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle>{detailMode === 'approve' ? 'Aprobar registros' : 'Detalle de solicitud'}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-5">
              <div className="rounded-lg border bg-white p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-xs text-gray-500">Evento</div>
                    <div className="font-semibold">{selected.event_name}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Titular</div>
                    <div className="font-semibold">{selected.titular_name}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Grupo</div>
                    <div>{selected.group_size} personas</div>
                  </div>
                    <div>
                      <div className="text-xs text-gray-500">Estado de la solicitud</div>
                      <div className="font-medium">
                        {getInvitationGroupStatusMeta(selected.status).label}
                      </div>
                    </div>
                  {detailMode === 'approve' && (
                    <div>
                      <div className="text-xs text-gray-500">Seleccionados</div>
                      <div>{getSelectedCount(selected)} / {getParticipants(selected).length}</div>
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-lg border bg-white">
                <div className="px-4 py-3 border-b">
                  <div className="text-sm font-semibold">Personas del grupo</div>
                  <div className="text-xs text-gray-500">
                    {detailMode === 'approve'
                      ? 'Selecciona a quiénes apruebas. El QR se enviará solo a los seleccionados.'
                      : 'Revisión en solo lectura.'}
                  </div>
                </div>
                <div
                  className={`hidden md:grid gap-3 text-xs text-gray-500 px-4 pt-3 ${
                    detailMode === 'approve'
                      ? 'md:grid-cols-[minmax(0,1fr)_140px_120px_90px]'
                      : 'md:grid-cols-[minmax(0,1fr)_140px_120px]'
                  }`}
                >
                  <div>Persona</div>
                  <div>Documentos</div>
                  <div className="text-center">Acciones</div>
                  {detailMode === 'approve' && <div className="text-right">Aprobar</div>}
                </div>
                <div className="p-4 space-y-3">
                  {getParticipants(selected).map((p, idx) => {
                    const isApproved = Boolean(p.approved);
                    return (
                    <div key={`${p.rol}-${idx}`} className="rounded-md border p-3">
                      <div
                        className={`grid grid-cols-1 gap-3 items-center ${
                          detailMode === 'approve'
                            ? 'md:grid-cols-[minmax(0,1fr)_140px_120px_90px]'
                            : 'md:grid-cols-[minmax(0,1fr)_140px_120px]'
                        }`}
                      >
                        <div>
                          <div className="font-semibold">
                            {p.name} <span className="text-xs text-gray-500">({p.rol})</span>
                          </div>
                          <div className="text-xs text-gray-500 leading-5">
                            Cédula: {p.cedula}
                            {p.email ? ` · ${p.email}` : ''}
                            {p.telefono ? ` · Tel: ${p.telefono}` : ''}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={p.selfie && p.doc ? 'default' : 'outline'}>
                            {p.selfie && p.doc ? 'Docs completos' : 'Docs pendientes'}
                          </Badge>
                        </div>
                        <div className="flex items-center justify-center gap-2">
                          <ActionIconButton label="Ver rostro" tone="neutral" onClick={() => openPreview(`Rostro - ${p.name}`, p.selfie_url)}>
                            <Eye className="h-4 w-4" />
                          </ActionIconButton>
                          <ActionIconButton label="Ver cédula" tone="neutral" onClick={() => openPreview(`Cédula - ${p.name}`, p.doc_url)}>
                            <CreditCard className="h-4 w-4" />
                          </ActionIconButton>
                          {detailMode === 'view' && (
                            <ActionIconButton
                              label={p.approved && p.qr_token ? 'Ver QR' : 'QR disponible solo para aprobados'}
                              tone="info"
                              disabled={!p.approved || !p.qr_token}
                              onClick={() => openQr(selected, p)}
                            >
                              <QrCode className="h-4 w-4" />
                            </ActionIconButton>
                          )}
                        </div>
                        {detailMode === 'approve' && (
                          <div className="flex items-center justify-start md:justify-end">
                            {isApproved ? (
                              <div className="text-xs font-medium text-emerald-700">Aprobado</div>
                            ) : (
                              <label className="flex items-center gap-2 text-sm text-gray-600">
                                <input
                                  type="checkbox"
                                  className="h-4 w-4"
                                  onClick={(e) => e.stopPropagation()}
                                  checked={approvedSet[getParticipantKey(p)] || false}
                                  onChange={(e) =>
                                    setApprovedSet((prev) => ({
                                      ...prev,
                                      [getParticipantKey(p)]: e.target.checked,
                                    }))
                                  }
                                  disabled={isApproved}
                                />
                                Aprobar
                              </label>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cerrar</Button>
            {selected && detailMode === 'approve' && (
              <Button
                onClick={() => openConfirm(selected, 'approve')}
                disabled={!canApproveSelection(selected)}
                title={
                  !canApproveSelection(selected)
                    ? 'Selecciona al menos un registro completo para aprobar'
                    : ''
                }
              >
                Aprobar seleccionados y enviar QR
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent
          className="w-[92vw] max-w-4xl max-h-[85vh] overflow-y-auto"
        >
          <DialogHeader>
            <DialogTitle>Rechazar personas del grupo</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-3">
              <div className="rounded-lg border bg-white p-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                  <div>
                    <div className="text-xs text-gray-500">Evento</div>
                    <div className="font-semibold">{selected.event_name}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Titular</div>
                    <div className="font-semibold">{selected.titular_name}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Grupo</div>
                    <div>{selected.group_size} personas</div>
                  </div>
                </div>
              </div>
              <div className="text-sm text-gray-600">
                Selecciona a las personas que serán rechazadas y escribe el motivo. El rechazo aplica por persona y no
                afecta a los demás. Esta acción no se puede deshacer.
              </div>
              <div className="rounded-lg border bg-white">
                <div className="px-4 py-3 border-b flex items-center justify-between">
                  <div className="text-sm font-semibold">Personas</div>
                  <div className="text-xs text-gray-500">
                    Seleccionados: {getParticipants(selected).filter((p) => rejectSet[getParticipantKey(p)]).length}
                  </div>
                </div>
                <div className="p-4 space-y-3">
                  {getParticipants(selected).map((p, idx) => {
                    const isSelected = rejectSet[getParticipantKey(p)] || false;
                    const isApproved = Boolean(p.approved);
                    return (
                      <label
                        key={`reject-${p.rol}-${idx}`}
                        className={`flex items-start gap-3 rounded-md border p-3 ${
                          isApproved ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
                        } ${isSelected ? 'border-rose-200 bg-rose-50' : 'border-gray-200'}`}
                      >
                        <input
                          type="checkbox"
                          className="mt-1 h-4 w-4"
                          disabled={isApproved}
                          checked={isSelected}
                          onChange={(e) =>
                            !isApproved &&
                            setRejectSet((prev) => ({
                              ...prev,
                              [getParticipantKey(p)]: e.target.checked,
                            }))
                          }
                        />
                        <div className="flex-1">
                          <div className="flex items-center justify-between gap-3">
                            <div className="font-medium text-sm">
                              {p.name} <span className="text-xs text-gray-500">({p.rol})</span>
                            </div>
                            <Badge variant={p.selfie && p.doc ? 'default' : 'outline'}>
                              {p.selfie && p.doc ? 'Docs completos' : 'Docs pendientes'}
                            </Badge>
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            Cédula: {p.cedula}
                            {p.email ? ` · ${p.email}` : ''}
                            {p.telefono ? ` · Tel: ${p.telefono}` : ''}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
              <div className="space-y-2">
                <div className="text-xs text-gray-500">
                  Motivo de rechazo <span className="text-rose-600">*</span>
                </div>
                <Textarea
                  placeholder="Ej: Documento ilegible, datos inconsistentes, etc."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
                {!reason.trim() && (
                  <div className="text-xs text-rose-600">Debes ingresar el motivo para rechazar.</div>
                )}
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRejectOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={reject} disabled={!reason.trim()}>Rechazar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (isApproving) return;
          setConfirmOpen(open);
        }}
      >
        <DialogContent
          className="w-[90vw] max-w-md"
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Confirmar aprobación</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-gray-600">
            {confirmItem ? (
              <>
                Se aprobarán <strong>{getSelectedCount(confirmItem)} de {getParticipants(confirmItem).length}</strong> personas seleccionadas.
                El QR se enviará solo a esas personas. Las no seleccionadas permanecerán pendientes.
                <div className="mt-2 text-xs text-gray-500">Evento: {confirmItem.event_name}</div>
              </>
            ) : (
              'Confirma la acción.'
            )}
          </div>
          {isApproving && (
            <div className="py-2 text-sm text-gray-600 text-center">
              <div className="relative h-16 w-full">
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                  <InfinitySpin width="160" color="#1d4ed8" />
                </div>
              </div>
              <p className="mt-1">Aprobando, espera un momento...</p>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={isApproving}>
              Cancelar
            </Button>
            <Button onClick={runConfirm} disabled={isApproving}>
              {isApproving ? 'Aprobando...' : 'Aprobar seleccionados'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={updateOpen} onOpenChange={setUpdateOpen}>
        <DialogContent className="w-[92vw] max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Habilitar corrección</DialogTitle>
          </DialogHeader>
          {updateTarget && (
            <div className="space-y-3">
              <div className="rounded-lg border bg-white p-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                  <div>
                    <div className="text-xs text-gray-500">Evento</div>
                    <div className="font-semibold">{updateTarget.event_name}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Titular</div>
                    <div className="font-semibold">{updateTarget.titular_name}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Estado actual</div>
                    <div className="font-semibold">
                      {getInvitationGroupStatusMeta(updateTarget.status).label}
                    </div>
                  </div>
                </div>
              </div>
              <div className="text-sm text-gray-600">
                Selecciona las personas para habilitar nueva carga de rostro y cédula.
              </div>
              <div className="rounded-lg border bg-white">
                <div className="px-4 py-3 border-b text-sm font-semibold">Personas del grupo</div>
                <div className="p-4 space-y-3">
                  {getParticipants(updateTarget).map((p, idx) => (
                    <label key={`update-${p.rol}-${idx}`} className="flex items-start gap-3 rounded-md border p-3">
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4"
                        checked={updateSet[getParticipantKey(p)] || false}
                        onChange={(e) =>
                          setUpdateSet((prev) => ({
                            ...prev,
                            [getParticipantKey(p)]: e.target.checked,
                          }))
                        }
                      />
                      <div className="flex-1">
                        <div className="font-medium text-sm">
                          {p.name} <span className="text-xs text-gray-500">({p.rol})</span>
                        </div>
                        <div className="text-xs text-gray-500 mt-1">Cédula: {p.cedula}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <div className="text-xs text-gray-500">Motivo (opcional)</div>
                <Textarea
                  placeholder="Ej: Solicitud de corrección por error de aprobación."
                  value={updateReason}
                  onChange={(e) => setUpdateReason(e.target.value)}
                />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setUpdateOpen(false)} disabled={isUpdating}>
              Cancelar
            </Button>
            <Button onClick={requestUpdate} disabled={isUpdating}>
              {isUpdating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Procesando...
                </>
              ) : (
                'Habilitar corrección'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="w-[94vw] max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{previewTitle}</DialogTitle>
          </DialogHeader>
          <div className="rounded-md border bg-gray-50 p-3 flex items-center justify-center">
            {previewUrl ? (
              <img src={previewUrl} alt={previewTitle} className="max-h-[70vh] w-auto object-contain" />
            ) : (
              <div className="text-sm text-gray-500">Sin imagen</div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent className="w-[92vw] max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{qrTitle || 'QR de acceso'}</DialogTitle>
          </DialogHeader>
          {qrValue ? (
            <QRCodeDisplay value={qrValue} title="Código QR" />
          ) : (
            <div className="text-sm text-gray-500">No hay QR disponible.</div>
          )}
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
