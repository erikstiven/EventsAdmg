import React, { useEffect, useMemo, useState } from 'react';
import { useCallback } from 'react';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Copy, Link as LinkIcon, Mail, CheckCircle2, Eye, ChevronLeft, ChevronRight, Plus, RotateCcw, Pencil } from 'lucide-react';
import { Box, Step, StepLabel, Stepper, useMediaQuery } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { InfinitySpin } from 'react-loader-spinner';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader as ModalHeader,
  DialogTitle as ModalTitle,
  DialogDescription as ModalDescription,
} from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';

type QuotaInvitation = {
  id: string;
  rawId?: number;
  eventId?: number;
  titular: string;
  event: string;
  cupoUsado: number;
  cupoTotal: number;
  estado:
    | 'Pendiente completar'
    | 'En registro'
    | 'Pendiente aprobación'
    | 'Pendiente de actualización'
    | 'Aprobado parcial'
    | 'Aprobado'
    | 'Rechazado';
  link: string;
  sent: boolean;
  emailSentAt?: string | null;
  companions?: { name: string; cedula: string; email: string; telefono: string; codigo: string }[];
  titularCedula?: string;
  titularEmail?: string;
  titularTelefono?: string;
  titularCodigo?: string;
  titularSelfieUrl?: string | null;
  titularDocUrl?: string | null;
};

export default function InvitationsByQuota() {
  const { toast } = useToast();
  const theme = useTheme();
  const isSmall = useMediaQuery(theme.breakpoints.down('sm'));
  const [events, setEvents] = useState<{ id: number; name: string }[]>([]);
  const [invitations, setInvitations] = useState<QuotaInvitation[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [filters, setFilters] = useState({
    search: '',
    eventId: 'all',
    status: 'all',
  });

  const [form, setForm] = useState({
    eventId: '',
    titular: '',
    cedula: '',
    codigoDactilar: '',
    email: '',
    telefono: '',
    cupoTotal: 3,
    sendEmail: true,
    sendEmailCc: false,
    intransferible: true,
  });
  const [createdLink, setCreatedLink] = useState('');
  const [companions, setCompanions] = useState<
    { name: string; cedula: string; email: string; telefono: string; codigo: string }[]
  >([]);

  const resetInvitationForm = () => {
    setActiveStep(0);
    setEditingInvitationId(null);
    setForm({
      eventId: '',
      titular: '',
      cedula: '',
      codigoDactilar: '',
      email: '',
      telefono: '',
      cupoTotal: 3,
      sendEmail: true,
      sendEmailCc: false,
      intransferible: true,
    });
    setCompanions([]);
  };
  const [showSuccess, setShowSuccess] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailInvitation, setDetailInvitation] = useState<QuotaInvitation | null>(null);
  const [editingInvitationId, setEditingInvitationId] = useState<number | null>(null);
  const isEditing = editingInvitationId !== null;
  const [activeStep, setActiveStep] = useState(0);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupCompanionLoading, setLookupCompanionLoading] = useState<Record<number, boolean>>({});
  const [reopenOpen, setReopenOpen] = useState(false);
  const [reopenTarget, setReopenTarget] = useState<QuotaInvitation | null>(null);
  const [reopenReason, setReopenReason] = useState('');
  const [reopenLoading, setReopenLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: 'Copiado',
        description: 'Link copiado al portapapeles.',
      });
    } catch {
      toast({
        title: 'Error',
        description: 'No se pudo copiar el link.',
        variant: 'destructive',
      });
    }
  };

  useEffect(() => {
    const loadEvents = async () => {
      try {
        const response = await api.events.list({ limit: 2000 });
        setEvents(response.items || []);
      } catch {
        toast({
          title: 'Error',
          description: 'No se pudieron cargar los eventos',
          variant: 'destructive',
        });
      }
    };
    loadEvents();
  }, [toast]);

  const fetchInvitations = useCallback(async (options?: { silent?: boolean }) => {
    try {
      const response = await api.invitationGroups.list({ limit: 2000 });
      const normalizeStatus = (rawStatus?: string) => {
        if (!rawStatus) return 'Pendiente completar' as QuotaInvitation['estado'];
        const value = rawStatus.toLowerCase().trim();
        if (['pendiente completar', 'pendiente_completar', 'generado'].includes(value)) {
          return 'Pendiente completar';
        }
        if (['en registro', 'en_registro', 'en proceso', 'en_proceso'].includes(value)) {
          return 'En registro';
        }
        if (['pendiente aprobación', 'pendiente_aprobacion', 'pendiente aprobacion', 'pendiente_aprobación'].includes(value)) {
          return 'Pendiente aprobación';
        }
        if (value.includes('pendiente') && value.includes('actualiz')) {
          return 'Pendiente de actualización';
        }
        if (['aprobado parcial', 'aprobado_parcial'].includes(value)) {
          return 'Aprobado parcial';
        }
        if (['completado', 'aprobado'].includes(value)) {
          return 'Aprobado';
        }
        if (['rechazado', 'rechazada'].includes(value)) {
          return 'Rechazado';
        }
        return 'Pendiente completar';
      };
      const mapped = (response.items || []).map((item: any) => {
        const companions = Array.isArray(item.companions) ? item.companions : [];
        const titularComplete = Boolean(item.titular_selfie_url && item.titular_doc_url);
        const companionsComplete = companions.filter(
          (c: any) => Boolean(c?.selfie_url && c?.doc_url)
        ).length;
        const cupoUsado = (titularComplete ? 1 : 0) + companionsComplete;
        return {
          id: `INV-${String(item.id).padStart(3, '0')}`,
          rawId: item.id,
          eventId: item.event_id,
          titular: item.titular_name,
          event: events.find((ev) => ev.id === item.event_id)?.name || `Evento ${item.event_id}`,
          cupoUsado,
          cupoTotal: item.group_size,
          estado: normalizeStatus(item.status),
          link: item.link,
          sent: Boolean(item.email_sent_at),
          emailSentAt: item.email_sent_at,
          companions,
          titularCedula: item.titular_identification,
          titularEmail: item.email,
          titularTelefono: item.phone,
          titularCodigo: item.fingerprint_code,
          titularSelfieUrl: item.titular_selfie_url,
          titularDocUrl: item.titular_doc_url,
        };
      });
      setInvitations(mapped);
      setLastUpdatedAt(new Date());
      return mapped;
    } catch {
      if (!options?.silent) {
        toast({
          title: 'Error',
          description: 'No se pudieron cargar las invitaciones por grupo',
          variant: 'destructive',
        });
      }
      return [];
    }
  }, [events, toast]);

  useEffect(() => {
    fetchInvitations();
  }, [fetchInvitations]);

  useEffect(() => {
    const intervalMs = 20000;
    const intervalId = window.setInterval(() => {
      if (document.hidden) return;
      fetchInvitations({ silent: true });
    }, intervalMs);
    return () => window.clearInterval(intervalId);
  }, [fetchInvitations]);

  useEffect(() => {
    if (!detailInvitation) return;
    const latest =
      invitations.find((inv) => inv.rawId && inv.rawId === detailInvitation.rawId) ||
      invitations.find((inv) => inv.id === detailInvitation.id);
    if (latest) {
      setDetailInvitation(latest);
    }
  }, [detailInvitation, invitations]);

  const generatedLink = useMemo(() => {
    if (!form.titular) return '';
    const slug = form.titular.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    return `https://app.com/registro/${slug || 'titular'}-${Date.now().toString().slice(-4)}`;
  }, [form.titular]);

  const handleCreate = async () => {
    if (activeStep < steps.length - 1) {
      goNextStep();
      return;
    }
    if (!form.eventId || !form.titular) return;

    try {
      const normalizeId = (value: string) => value.trim().toLowerCase();
      const groupIds = [form.cedula, ...companions.map((c) => c.cedula)]
        .map((v) => normalizeId(v || ''))
        .filter(Boolean);
      const uniqueIds = new Set(groupIds);
      if (uniqueIds.size !== groupIds.length) {
        toast({
          title: 'Cédula duplicada',
          description: 'La cédula no puede repetirse dentro del mismo grupo.',
          variant: 'destructive',
        });
        return;
      }

      const selectedEventId = Number(form.eventId);
      const existingIds = new Set<string>();
      invitations
        .filter((inv) => {
          if (inv.eventId !== selectedEventId) return false;
          if (isEditing && editingInvitationId && inv.rawId === editingInvitationId) return false;
          return true;
        })
        .forEach((inv) => {
          if (inv.titularCedula) existingIds.add(normalizeId(inv.titularCedula));
          (inv.companions || []).forEach((c) => {
            if (c.cedula) existingIds.add(normalizeId(c.cedula));
          });
        });
      const repeated = groupIds.find((id) => existingIds.has(id));
      if (repeated) {
        toast({
          title: 'Cédula ya registrada',
          description: 'La cédula ya está registrada en este evento.',
          variant: 'destructive',
        });
        return;
      }

      const maxCompanions = Math.max(0, form.cupoTotal - 1);
      const missing = Math.max(0, maxCompanions - companions.length);
      if (missing > 0) {
        toast({
          title: 'Faltan acompañantes',
          description: `Debes agregar ${missing} acompañante(s) para completar el cupo total.`,
          variant: 'destructive',
        });
        return;
      }
      if (isEditing) {
        await updateInvitation();
      } else {
        await createInvitation();
      }
    } catch (error: any) {
      const message =
        error?.data?.detail ||
        error?.message ||
        'No se pudo crear la invitación por grupo';
      toast({
        title: 'Error',
        description: message,
        variant: 'destructive',
      });
    }
  };

  const createInvitation = async () => {
    try {
      setCreating(true);
      const companionsPayload = companions;
      const response = await api.invitationGroups.create({
        event_id: Number(form.eventId),
        titular_name: form.titular,
        titular_identification: form.cedula,
        fingerprint_code: form.codigoDactilar,
        email: form.email,
        phone: form.telefono,
        group_size: form.cupoTotal,
        send_email: form.sendEmail,
        send_email_cc: form.sendEmailCc,
        intransferible: form.intransferible,
        companions: companionsPayload,
      });

      const eventName = events.find((ev) => String(ev.id) === form.eventId)?.name || 'Evento';
      setCreatedLink(response.link || '');
      setInvitations((prev) => [
        {
          id: `INV-${String(prev.length + 1).padStart(3, '0')}`,
          rawId: response.id,
          eventId: Number(form.eventId),
          titular: response.titular_name,
          event: eventName,
          cupoUsado: 0,
          cupoTotal: response.group_size,
          estado: response.status,
          link: response.link || generatedLink,
          sent: Boolean(response.email_sent_at),
          emailSentAt: response.email_sent_at,
          companions: companionsPayload,
          titularCedula: form.cedula,
          titularEmail: form.email,
          titularTelefono: form.telefono,
          titularCodigo: form.codigoDactilar,
        },
        ...prev,
      ]);
      setShowSuccess(true);
      setShowForm(false);
      resetInvitationForm();
    } catch (error: any) {
      const message =
        error?.data?.detail ||
        error?.message ||
        'No se pudo crear la invitación por grupo';
      toast({
        title: 'Error',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setCreating(false);
    }
  };

  const updateInvitation = async () => {
    if (!editingInvitationId) return;
    try {
      setCreating(true);
      await api.invitationGroups.update(editingInvitationId, {
        event_id: Number(form.eventId),
        titular_name: form.titular,
        titular_identification: form.cedula,
        fingerprint_code: form.codigoDactilar,
        email: form.email,
        phone: form.telefono,
        group_size: form.cupoTotal,
        send_email: form.sendEmail,
        send_email_cc: form.sendEmailCc,
        intransferible: form.intransferible,
        companions,
      });
      await fetchInvitations();
      toast({
        title: 'Invitación actualizada',
        description: 'Se guardaron los cambios correctamente.',
      });
      setShowForm(false);
      resetInvitationForm();
    } catch (error: any) {
      const message =
        error?.data?.detail ||
        error?.message ||
        'No se pudo actualizar la invitación por grupo';
      toast({
        title: 'Error',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setCreating(false);
    }
  };

  const maxCompanions = Math.max(0, form.cupoTotal - 1);
  const canAddCompanion = companions.length < maxCompanions;

  useEffect(() => {
    if (companions.length > maxCompanions) {
      setCompanions((prev) => prev.slice(0, maxCompanions));
    }
  }, [maxCompanions]);

  const addCompanion = () => {
    if (!canAddCompanion) return;
    setCompanions((prev) => [
      ...prev,
      { name: '', cedula: '', email: '', telefono: '', codigo: '' },
    ]);
  };

  const updateCompanion = (idx: number, key: keyof (typeof companions)[number], value: string) => {
    if (key === 'cedula') {
      if (isCedulaDuplicated(value, idx)) {
        toast({
          title: 'Cédula duplicada',
          description: normalizeCedula(form.cedula) === normalizeCedula(value)
            ? 'La cédula del acompañante no puede ser igual a la del titular.'
            : 'La cédula ya está registrada en otro acompañante.',
          variant: 'destructive',
        });
        return;
      }
    }
    setCompanions((prev) => prev.map((c, i) => (i === idx ? { ...c, [key]: value } : c)));
  };

  const removeCompanion = (idx: number) => {
    setCompanions((prev) => prev.filter((_, i) => i !== idx));
  };

  const normalizeCedula = (value: string) => value.trim().toLowerCase();

  const isCedulaDuplicated = (cedula: string, companionIdx?: number) => {
    const normalized = normalizeCedula(cedula);
    if (!normalized) return false;
    if (normalizeCedula(form.cedula) && normalizeCedula(form.cedula) === normalized) {
      return true;
    }
    return companions.some((c, i) => {
      if (companionIdx !== undefined && i === companionIdx) return false;
      return normalizeCedula(c.cedula) === normalized;
    });
  };

  const handleLookupTitular = async () => {
    if (!form.cedula?.trim()) {
      toast({
        title: 'Cédula requerida',
        description: 'Ingresa la cédula para buscar datos.',
        variant: 'destructive',
      });
      return;
    }
    try {
      setLookupLoading(true);
      const response = await api.attendees.lookupByCedula(normalizeCedula(form.cedula));
      const attendee = response?.item;
      if (!attendee) {
        toast({
          title: 'No encontrado',
          description: 'No existen datos previos para esta cédula.',
        });
        return;
      }
      setForm((f) => ({
        ...f,
        titular: attendee.full_name || f.titular,
        email: attendee.email || f.email,
        telefono: attendee.phone || f.telefono,
        codigoDactilar: attendee.fingerprint_code || f.codigoDactilar,
      }));
      toast({
        title: 'Datos cargados',
        description: 'Se reutilizaron los datos del invitado.',
      });
    } catch (error: any) {
      const detail = error?.data?.detail;
      const message = Array.isArray(detail)
        ? detail.map((d: any) => d?.msg).filter(Boolean).join('. ')
        : detail || 'No se pudo buscar el invitado.';
      toast({
        title: 'Error',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setLookupLoading(false);
    }
  };

  const handleLookupCompanion = async (idx: number) => {
    const cedula = companions[idx]?.cedula || '';
    if (!cedula.trim()) {
      toast({
        title: 'Cédula requerida',
        description: 'Ingresa la cédula para buscar datos.',
        variant: 'destructive',
      });
      return;
    }
    const normalized = normalizeCedula(cedula);
    if (normalizeCedula(form.cedula) === normalized) {
      toast({
        title: 'Cédula duplicada',
        description: 'La cédula del acompañante no puede ser igual a la del titular.',
        variant: 'destructive',
      });
      return;
    }
    const duplicateInCompanions = companions.some(
      (c, i) => i !== idx && normalizeCedula(c.cedula) === normalized
    );
    if (duplicateInCompanions) {
      toast({
        title: 'Cédula duplicada',
        description: 'La cédula ya está registrada en otro acompañante.',
        variant: 'destructive',
      });
      return;
    }
    try {
      setLookupCompanionLoading((prev) => ({ ...prev, [idx]: true }));
      const response = await api.attendees.lookupByCedula(normalizeCedula(cedula));
      const attendee = response?.item;
      if (!attendee) {
        toast({
          title: 'No encontrado',
          description: 'No existen datos previos para esta cédula.',
        });
        return;
      }
      setCompanions((prev) =>
        prev.map((c, i) =>
          i === idx
            ? {
                ...c,
                name: attendee.full_name || c.name,
                email: attendee.email || c.email,
                telefono: attendee.phone || c.telefono,
                codigo: attendee.fingerprint_code || c.codigo,
              }
            : c
        )
      );
      toast({
        title: 'Datos cargados',
        description: 'Se reutilizaron los datos del acompañante.',
      });
    } catch (error: any) {
      const detail = error?.data?.detail;
      const message = Array.isArray(detail)
        ? detail.map((d: any) => d?.msg).filter(Boolean).join('. ')
        : detail || 'No se pudo buscar el acompañante.';
      toast({
        title: 'Error',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setLookupCompanionLoading((prev) => ({ ...prev, [idx]: false }));
    }
  };

  const steps = ['Titular', 'Acompañantes'];

  const goNextStep = () => {
    if (activeStep === 0) {
      if (
        !form.eventId ||
        !form.titular ||
        !form.cedula ||
        !form.email ||
        !form.telefono ||
        !form.codigoDactilar
      ) {
        toast({
          title: 'Datos incompletos',
          description: 'Completa los datos del titular para continuar.',
          variant: 'destructive',
        });
        return;
      }
    }
    setActiveStep((s) => Math.min(steps.length - 1, s + 1));
  };

  const goPrevStep = () => setActiveStep((s) => Math.max(0, s - 1));

  const filteredInvitations = useMemo(() => {
    return invitations.filter((inv) => {
      const matchSearch =
        !filters.search.trim() ||
        inv.titular.toLowerCase().includes(filters.search.toLowerCase()) ||
        inv.event.toLowerCase().includes(filters.search.toLowerCase());
      const matchEvent = filters.eventId === 'all' || inv.event === filters.eventId;
      const matchStatus = filters.status === 'all' || inv.estado === filters.status;
      return matchSearch && matchEvent && matchStatus;
    });
  }, [invitations, filters]);

  const totalPages = Math.max(1, Math.ceil(filteredInvitations.length / pageSize));
  const pagedInvitations = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredInvitations.slice(start, start + pageSize);
  }, [filteredInvitations, page, pageSize]);

  const shortLink = (link: string) => {
    if (!link) return '';
    if (link.length <= 40) return link;
    return `${link.slice(0, 24)}…${link.slice(-6)}`;
  };

  const statusStyles = (estado: QuotaInvitation['estado']) => {
    switch (estado) {
      case 'Pendiente completar':
        return 'bg-amber-100 text-amber-800';
      case 'En registro':
        return 'bg-blue-100 text-blue-800';
      case 'Pendiente aprobación':
        return 'bg-violet-100 text-violet-800';
      case 'Pendiente de actualización':
        return 'bg-indigo-100 text-indigo-800';
      case 'Aprobado parcial':
        return 'bg-amber-50 text-amber-700';
      case 'Aprobado':
        return 'bg-emerald-100 text-emerald-800';
      case 'Rechazado':
        return 'bg-rose-100 text-rose-800';
      default:
        return 'bg-slate-100 text-slate-700';
    }
  };

  const statusLabel = (estado: QuotaInvitation['estado']) => {
    switch (estado) {
      case 'Pendiente completar':
        return 'Pendiente completar';
      case 'En registro':
        return 'En registro';
      case 'Pendiente aprobación':
        return 'Pendiente aprobación';
      case 'Pendiente de actualización':
        return 'Pendiente de actualización';
      case 'Aprobado parcial':
        return 'Aprobado parcial';
      case 'Aprobado':
        return 'Aprobado';
      case 'Rechazado':
        return 'Rechazado';
      default:
        return estado;
    }
  };

  const formatSentAt = (value?: string | null) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString();
  };

  const isPersonComplete = (selfieUrl?: string | null, docUrl?: string | null) =>
    Boolean(selfieUrl && docUrl);

  const canRequestUpdate = (estado: QuotaInvitation['estado']) =>
    estado === 'Aprobado' || estado === 'Aprobado parcial' || estado === 'Pendiente aprobación';

  const canEditInvitation = (estado: QuotaInvitation['estado']) =>
    estado === 'Pendiente completar' ||
    estado === 'En registro' ||
    estado === 'Pendiente de actualización' ||
    estado === 'Pendiente aprobación' ||
    estado === 'Rechazado';

  const openRequestUpdate = (invitation: QuotaInvitation) => {
    setReopenTarget(invitation);
    setReopenReason('');
    setReopenOpen(true);
  };

  const submitRequestUpdate = async () => {
    if (!reopenTarget?.rawId) return;
    try {
      setReopenLoading(true);
      await api.invitationGroups.requestUpdate(reopenTarget.rawId, {
        reason: reopenReason.trim() || undefined,
      });
      const updatedList = await fetchInvitations();
      if (detailInvitation?.rawId === reopenTarget.rawId) {
        const latest =
          updatedList.find((i) => i.rawId === reopenTarget.rawId) ||
          updatedList.find((i) => i.id === reopenTarget.id);
        if (latest) setDetailInvitation(latest);
      }
      toast({
        title: 'Actualización habilitada',
        description: 'El enlace fue reabierto para que el grupo actualice documentos.',
      });
      setReopenOpen(false);
      setReopenTarget(null);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error?.data?.detail || 'No se pudo habilitar la actualización.',
        variant: 'destructive',
      });
    } finally {
      setReopenLoading(false);
    }
  };

  const openEditInForm = (inv: QuotaInvitation) => {
    setEditingInvitationId(inv.rawId || null);
    setForm({
      eventId: inv.eventId ? String(inv.eventId) : '',
      titular: inv.titular || '',
      cedula: inv.titularCedula || '',
      codigoDactilar: inv.titularCodigo || '',
      email: inv.titularEmail || '',
      telefono: inv.titularTelefono || '',
      cupoTotal: inv.cupoTotal || 1,
      sendEmail: true,
      sendEmailCc: false,
      intransferible: true,
    });
    setCompanions(
      (inv.companions || []).map((c) => ({
        name: c.name || '',
        cedula: c.cedula || '',
        email: c.email || '',
        telefono: c.telefono || '',
        codigo: c.codigo || '',
      }))
    );
    setActiveStep(0);
    setShowForm(true);
  };

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold">Invitaciones por grupo</h1>
            <p className="text-gray-600">
              Crea un link único para grupos de hasta 3 personas.
              {lastUpdatedAt && (
                <span className="ml-2 text-xs text-gray-400">
                  Actualizado {lastUpdatedAt.toLocaleTimeString()}
                </span>
              )}
            </p>
          </div>
          <Button
            variant="outline"
            onClick={async () => {
              setRefreshing(true);
              await fetchInvitations();
              setRefreshing(false);
            }}
            disabled={refreshing}
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            {refreshing ? 'Actualizando...' : 'Actualizar'}
          </Button>
        </div>

        <Card>
          <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>Invitaciones creadas</CardTitle>
              <p className="text-sm text-gray-600">Gestiona links y estados de las invitaciones por grupo.</p>
            </div>
            <Button
              onClick={() => {
                if (showForm) {
                  setShowForm(false);
                  resetInvitationForm();
                  return;
                }
                resetInvitationForm();
                setShowForm(true);
              }}
            >
              <Plus className="h-4 w-4 mr-2" />
              {showForm ? 'Ocultar formulario' : 'Crear invitación'}
            </Button>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
              <Input
                placeholder="Buscar por titular o evento"
                value={filters.search}
                onChange={(e) => {
                  setFilters((f) => ({ ...f, search: e.target.value }));
                  setPage(1);
                }}
              />
              <Select
                value={filters.eventId}
                onValueChange={(value) => {
                  setFilters((f) => ({ ...f, eventId: value }));
                  setPage(1);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Evento" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los eventos</SelectItem>
                  {Array.from(new Set(invitations.map((inv) => inv.event))).map((ev) => (
                    <SelectItem key={ev} value={ev}>
                      {ev}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={filters.status}
                onValueChange={(value) => {
                  setFilters((f) => ({ ...f, status: value }));
                  setPage(1);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los estados</SelectItem>
                  <SelectItem value="Pendiente completar">Pendiente completar</SelectItem>
                  <SelectItem value="En registro">En registro</SelectItem>
                  <SelectItem value="Pendiente aprobación">Pendiente aprobación</SelectItem>
                  <SelectItem value="Pendiente de actualización">Pendiente de actualización</SelectItem>
                  <SelectItem value="Aprobado parcial">Aprobado parcial</SelectItem>
                  <SelectItem value="Aprobado">Aprobado</SelectItem>
                  <SelectItem value="Rechazado">Rechazado</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex items-center justify-end">
                <Button
                  variant="outline"
                  onClick={() => {
                    setFilters({ search: '', eventId: 'all', status: 'all' });
                    setPage(1);
                  }}
                >
                  Limpiar filtros
                </Button>
              </div>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Titular</TableHead>
                  <TableHead>Evento</TableHead>
                  <TableHead>Grupo</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Link</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagedInvitations.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-medium">{inv.titular}</TableCell>
                    <TableCell>{inv.event}</TableCell>
                    <TableCell>
                      <div className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs text-gray-700">
                        <span className="font-semibold">{inv.cupoUsado}/{inv.cupoTotal}</span>
                        <span className="text-gray-500">personas</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Badge className={`${statusStyles(inv.estado)} px-3 py-1 text-xs`} title={inv.estado}>
                          {statusLabel(inv.estado)}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[220px] truncate" title={inv.link}>
                      {shortLink(inv.link)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {canEditInvitation(inv.estado) && (
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Editar invitación"
                            aria-label="Editar invitación"
                            onClick={() => openEditInForm(inv)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Ver detalle"
                          aria-label="Ver detalle"
                          onClick={async () => {
                            const updated = await fetchInvitations();
                            const latest =
                              updated.find((i) => i.rawId === inv.rawId) ||
                              updated.find((i) => i.id === inv.id) ||
                              inv;
                            setDetailInvitation(latest);
                            setDetailOpen(true);
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {canRequestUpdate(inv.estado) && (
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Habilitar actualización"
                            aria-label="Habilitar actualización"
                            onClick={() => openRequestUpdate(inv)}
                          >
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          title={inv.sent ? 'Reenviar' : 'Enviar'}
                          aria-label={inv.sent ? 'Reenviar' : 'Enviar'}
                          onClick={async () => {
                            if (!inv.rawId) return;
                            try {
                              const updated = await api.invitationGroups.resend(inv.rawId);
                              setInvitations((prev) =>
                                prev.map((i) =>
                                  i.id === inv.id
                                    ? { ...i, sent: Boolean(updated.email_sent_at), emailSentAt: updated.email_sent_at }
                                    : i
                                )
                              );
                              toast({
                                title: inv.sent ? 'Reenviado' : 'Enviado',
                                description: 'Correo enviado correctamente.',
                              });
                            } catch (error: any) {
                              toast({
                                title: 'Error',
                                description: error?.data?.detail || 'No se pudo enviar el correo.',
                                variant: 'destructive',
                              });
                            }
                          }}
                        >
                          <Mail className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Copiar link"
                          aria-label="Copiar link"
                          onClick={() => handleCopy(inv.link)}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {pagedInvitations.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-sm text-gray-500 py-8">
                      No hay invitaciones para los filtros actuales.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm text-gray-600">
              <div>
                Página {page} de {totalPages} · {filteredInvitations.length} registros
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
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
                  disabled={page >= totalPages}
                >
                  Siguiente
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Dialog
          open={showForm}
          onOpenChange={(open) => {
            setShowForm(open);
            if (!open) resetInvitationForm();
          }}
        >
        <DialogContent className="w-[95vw] max-w-5xl max-h-[90vh] overflow-y-auto">
          <ModalHeader>
            <div className="flex items-center gap-2">
              <ModalTitle>{isEditing ? 'Editar invitación' : 'Nueva Invitación'}</ModalTitle>
              {isEditing && <Badge variant="outline">Modo edición</Badge>}
            </div>
            <ModalDescription>
              {isEditing
                ? 'Corrige los datos del grupo en los mismos pasos del registro.'
                : 'Completa los datos en pasos para generar el link del grupo.'}
            </ModalDescription>
          </ModalHeader>
            <form onSubmit={(e) => e.preventDefault()} className="space-y-5 mt-2">
              <Box sx={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
                <Stepper
                  activeStep={activeStep}
                  orientation={isSmall ? 'vertical' : 'horizontal'}
                  sx={{
                    width: '100%',
                    maxWidth: 520,
                    '& .MuiStepConnector-line': { minWidth: 40 },
                    '& .MuiStepLabel-label': { fontSize: 14 },
                  }}
                >
                  {steps.map((label) => (
                    <Step key={label}>
                      <StepLabel>{label}</StepLabel>
                    </Step>
                  ))}
                </Stepper>
              </Box>

              {activeStep === 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <Label className="text-sm text-gray-700">Evento</Label>
                    <Select
                      value={form.eventId}
                      onValueChange={(value) => setForm((f) => ({ ...f, eventId: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar evento" />
                      </SelectTrigger>
                      <SelectContent>
                        {events.map((ev) => (
                          <SelectItem key={ev.id} value={String(ev.id)}>
                            {ev.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-sm text-gray-700">Titular</Label>
                    <Input
                      placeholder="Nombre completo"
                      value={form.titular}
                      onChange={(e) => setForm((f) => ({ ...f, titular: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label className="text-sm text-gray-700">Cédula</Label>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Cédula"
                        value={form.cedula}
                        onChange={(e) => setForm((f) => ({ ...f, cedula: e.target.value }))}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        className="whitespace-nowrap"
                        onClick={handleLookupTitular}
                        disabled={lookupLoading}
                      >
                        {lookupLoading ? 'Buscando...' : 'Buscar datos'}
                      </Button>
                    </div>
                  </div>

                  <div>
                    <Label className="text-sm text-gray-700">Email</Label>
                    <Input
                      placeholder="Correo electrónico"
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label className="text-sm text-gray-700">Teléfono</Label>
                    <Input
                      placeholder="Teléfono"
                      value={form.telefono}
                      onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label className="text-sm text-gray-700">Código dactilar</Label>
                    <Input
                      placeholder="Ej: V1234V5678"
                      value={form.codigoDactilar}
                      onChange={(e) => setForm((f) => ({ ...f, codigoDactilar: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label className="text-sm text-gray-700">Cupo total</Label>
                    <Input
                      className="w-full"
                      type="number"
                      min={1}
                      max={10}
                      value={form.cupoTotal}
                      onChange={(e) => setForm((f) => ({ ...f, cupoTotal: Number(e.target.value) || 1 }))}
                    />
                  </div>

                  <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="w-full flex items-center gap-2">
                      <Switch
                        id="sendEmail"
                        checked={form.sendEmail}
                        onCheckedChange={(checked) =>
                          setForm((f) => ({ ...f, sendEmail: checked, sendEmailCc: checked ? f.sendEmailCc : false }))
                        }
                      />
                      <Label htmlFor="sendEmail">Enviar invitación al correo del titular</Label>
                    </div>
                    <div className="md:col-span-2 flex items-start gap-2">
                      <Switch
                        id="sendEmailCc"
                        checked={form.sendEmailCc}
                        disabled={!form.sendEmail}
                        onCheckedChange={(checked) => setForm((f) => ({ ...f, sendEmailCc: checked }))}
                      />
                      <div className="flex flex-col gap-1">
                        <Label htmlFor="sendEmailCc" className="text-gray-700 font-normal">
                          Enviar también a los acompañantes
                        </Label>
                        <span className="text-xs text-gray-500">
                          Si activas, el link se enviará también a los correos de acompañantes.
                        </span>
                      </div>
                    </div>
                  </div>

                  {isEditing && (
                    <div className="md:col-span-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                      Al guardar cambios se generará un nuevo enlace automáticamente y el enlace anterior quedará inválido.
                    </div>
                  )}
                </div>
              )}

              {activeStep === 1 && (
                <div className="space-y-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Label className="text-sm text-gray-700">Acompañantes (opcional)</Label>
                        <Badge variant="outline">
                          {companions.length} / {Math.max(0, form.cupoTotal - 1)}
                        </Badge>
                      </div>
                      <p className="text-xs text-gray-500">
                        Agrega hasta {Math.max(0, form.cupoTotal - 1)} acompañantes para este grupo.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addCompanion}
                      disabled={!canAddCompanion}
                    >
                      Agregar acompañante
                    </Button>
                  </div>

                  {companions.length === 0 ? (
                    <div className="rounded-lg border border-dashed p-6 text-center text-sm text-gray-600">
                      <div className="font-medium">Sin acompañantes agregados</div>
                      <p className="text-xs text-gray-500 mt-1">
                        Usa el botón “Agregar acompañante” para completar los datos.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {companions.map((c, idx) => (
                        <Card key={idx} className="border border-slate-200">
                          <CardHeader className="pb-2">
                            <div className="flex items-center justify-between">
                              <CardTitle className="text-sm">Acompañante #{idx + 1}</CardTitle>
                              <Button
                                type="button"
                                size="sm"
                                variant="destructive"
                                onClick={() => removeCompanion(idx)}
                              >
                                Eliminar
                              </Button>
                            </div>
                          </CardHeader>
                          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <Label className="text-xs text-gray-500">Nombre completo</Label>
                              <Input
                                placeholder="Nombre completo"
                                value={c.name}
                                onChange={(e) => updateCompanion(idx, 'name', e.target.value)}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs text-gray-500">Cédula</Label>
                              <div className="flex gap-2">
                                <Input
                                  placeholder="Cédula"
                                  value={c.cedula}
                                  onChange={(e) => {
                                    const value = e.target.value;
                                    updateCompanion(idx, 'cedula', value);
                                    if (isCedulaDuplicated(value, idx)) {
                                      toast({
                                        title: 'Cédula duplicada',
                                        description: normalizeCedula(form.cedula) === normalizeCedula(value)
                                          ? 'La cédula del acompañante no puede ser igual a la del titular.'
                                          : 'La cédula ya está registrada en otro acompañante.',
                                        variant: 'destructive',
                                      });
                                    }
                                  }}
                                />
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleLookupCompanion(idx)}
                                  disabled={lookupCompanionLoading[idx] || isCedulaDuplicated(c.cedula, idx)}
                                >
                                  {lookupCompanionLoading[idx] ? 'Buscando...' : 'Buscar datos'}
                                </Button>
                              </div>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs text-gray-500">Correo electrónico</Label>
                              <Input
                                placeholder="Correo electrónico"
                                value={c.email}
                                onChange={(e) => updateCompanion(idx, 'email', e.target.value)}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs text-gray-500">Teléfono</Label>
                              <Input
                                placeholder="Teléfono"
                                value={c.telefono}
                                onChange={(e) => updateCompanion(idx, 'telefono', e.target.value)}
                              />
                            </div>
                            <div className="space-y-1 md:col-span-2">
                              <Label className="text-xs text-gray-500">Código dactilar</Label>
                              <Input
                                placeholder="Código dactilar"
                                value={c.codigo}
                                onChange={(e) => updateCompanion(idx, 'codigo', e.target.value)}
                              />
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-3">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setShowForm(false);
                      resetInvitationForm();
                    }}
                    disabled={creating}
                  >
                    Cancelar
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" onClick={goPrevStep} disabled={activeStep === 0 || creating}>
                    Atrás
                  </Button>
                  {activeStep < steps.length - 1 ? (
                    <Button type="button" onClick={goNextStep} disabled={creating}>
                      Siguiente
                    </Button>
                  ) : (
                    <Button type="button" className="w-fit" onClick={handleCreate} disabled={creating}>
                      {isEditing ? 'Guardar cambios' : 'Crear y generar link'}
                    </Button>
                  )}
                </div>
              </div>
            </form>
          </DialogContent>
        </Dialog>

      </div>

      <Dialog open={reopenOpen} onOpenChange={(open) => {
        setReopenOpen(open);
        if (!open) {
          setReopenReason('');
          setReopenTarget(null);
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <ModalHeader>
            <ModalTitle>Habilitar actualización</ModalTitle>
            <ModalDescription>
              {reopenTarget
                ? `Invitación ${reopenTarget.id} · ${reopenTarget.titular}`
                : 'Reabrir enlace para actualizar documentos.'}
            </ModalDescription>
          </ModalHeader>
          <div className="space-y-2">
            <Label className="text-sm text-gray-700">Motivo (opcional)</Label>
            <Input
              placeholder="Ej: Corregir selfie o cédula"
              value={reopenReason}
              onChange={(e) => setReopenReason(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setReopenOpen(false)} disabled={reopenLoading}>
              Cancelar
            </Button>
            <Button onClick={submitRequestUpdate} disabled={reopenLoading}>
              {reopenLoading ? 'Procesando...' : 'Habilitar'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="w-[95vw] max-w-5xl overflow-hidden p-0">
          {detailInvitation && (() => {
            const companionsList = detailInvitation.companions || [];
            const titularComplete = isPersonComplete(
              detailInvitation.titularSelfieUrl,
              detailInvitation.titularDocUrl
            );
            const companionsComplete = companionsList.filter((c: any) =>
              isPersonComplete(c?.selfie_url, c?.doc_url)
            ).length;
            const detailCupoUsed = (titularComplete ? 1 : 0) + companionsComplete;
            const people = [
              {
                name: detailInvitation.titular,
                role: 'Titular',
                cedula: detailInvitation.titularCedula || '----',
                email: detailInvitation.titularEmail || '----',
                selfieUrl: detailInvitation.titularSelfieUrl,
                docUrl: detailInvitation.titularDocUrl,
              },
              ...companionsList.map((c: any) => ({
                name: c.name || 'Acompañante',
                role: 'Acompañante',
                cedula: c.cedula || '----',
                email: c.email || '----',
                selfieUrl: c.selfie_url,
                docUrl: c.doc_url,
              })),
            ];
            const statusText = statusLabel(detailInvitation.estado);
            const sentText = detailInvitation.sent ? 'Enviado' : 'Pendiente';

            return (
              <div className="flex max-h-[90vh] flex-col">
                <ModalHeader className="border-b px-6 py-4">
                  <ModalTitle>Detalle de invitación</ModalTitle>
                  <ModalDescription>Información en solo lectura de la invitación y sus personas.</ModalDescription>
                </ModalHeader>

                <div className="space-y-5 overflow-y-auto px-6 py-5 text-sm text-slate-700">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">ID: {detailInvitation.id}</Badge>
                    <Badge variant="outline">Cupos: {detailCupoUsed}/{detailInvitation.cupoTotal}</Badge>
                    <Badge variant={detailInvitation.sent ? 'default' : 'outline'}>{sentText}</Badge>
                  </div>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Resumen</CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-slate-500">Titular</p>
                        <div className="rounded-md border bg-slate-50 px-3 py-2">{detailInvitation.titular || '----'}</div>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-slate-500">Evento</p>
                        <div className="rounded-md border bg-slate-50 px-3 py-2">{detailInvitation.event || '----'}</div>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-slate-500">Estado</p>
                        <div className="flex h-[42px] items-center rounded-md border bg-slate-50 px-3">
                          <Badge variant={detailInvitation.estado === 'Aprobado' ? 'default' : 'outline'}>{statusText}</Badge>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-slate-500">Intransferible</p>
                        <div className="rounded-md border bg-slate-50 px-3 py-2">Sí</div>
                      </div>
                      <div className="space-y-1 md:col-span-2">
                        <p className="text-xs font-medium text-slate-500">Link de registro</p>
                        <div className="flex flex-col gap-2 rounded-md border bg-slate-50 p-2 sm:flex-row sm:items-center sm:justify-between">
                          <p className="min-w-0 truncate px-1 text-slate-700" title={detailInvitation.link}>
                            {detailInvitation.link}
                          </p>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 shrink-0"
                            onClick={() => handleCopy(detailInvitation.link)}
                          >
                            <Copy className="mr-2 h-3.5 w-3.5" />
                            Copiar
                          </Button>
                        </div>
                      </div>
                      <div className="space-y-1 md:col-span-2">
                        <p className="text-xs font-medium text-slate-500">Correo</p>
                        <div className="rounded-md border bg-slate-50 px-3 py-2">
                          <span className="font-medium">{sentText}</span>
                          {detailInvitation.emailSentAt && (
                            <span className="ml-2 text-xs text-slate-500">
                              ({formatSentAt(detailInvitation.emailSentAt)})
                            </span>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Personas registradas</CardTitle>
                      <p className="text-xs text-slate-500">Titular y acompañantes en modo lectura.</p>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {people.map((c, idx) => {
                        const complete = isPersonComplete(c.selfieUrl, c.docUrl);
                        return (
                          <div key={`${c.role}-${idx}`} className="rounded-lg border bg-slate-50 p-3">
                            <div className="grid grid-cols-1 gap-2 text-sm md:grid-cols-12 md:items-center">
                              <div className="md:col-span-4">
                                <p className="text-xs text-slate-500">Nombre</p>
                                <p className="font-medium text-slate-900">{c.name}</p>
                                <p className="text-xs text-slate-500">{c.role}</p>
                              </div>
                              <div className="md:col-span-3">
                                <p className="text-xs text-slate-500">Cédula</p>
                                <p>{c.cedula}</p>
                              </div>
                              <div className="md:col-span-3">
                                <p className="text-xs text-slate-500">Correo</p>
                                <p className="truncate" title={c.email}>{c.email}</p>
                              </div>
                              <div className="md:col-span-2">
                                <p className="text-xs text-slate-500">Estado</p>
                                <Badge variant={complete ? 'default' : 'outline'}>
                                  {complete ? 'Completo' : 'Pendiente'}
                                </Badge>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>
                </div>

                <div className="flex items-center justify-end gap-2 border-t px-6 py-4">
                  <Button variant="outline" onClick={() => handleCopy(detailInvitation.link)}>
                    <Copy className="mr-2 h-4 w-4" />
                    Copiar link
                  </Button>
                  <Button onClick={() => setDetailOpen(false)}>Cerrar</Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      <AlertDialog open={showSuccess} onOpenChange={setShowSuccess}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-3 text-lg">
              <CheckCircle2 className="h-6 w-6 text-emerald-600" />
              Invitación creada
            </AlertDialogTitle>
          </AlertDialogHeader>
          <div className="text-sm text-gray-600 space-y-2">
            <p>Invitación creada correctamente. Se envió un correo con el enlace de invitación al titular.</p>
            <p className="flex items-center gap-2">
              <LinkIcon className="h-4 w-4" />
              {createdLink || generatedLink}
            </p>
          </div>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setShowSuccess(false)}>Entendido</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={creating} onOpenChange={() => {}}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Creando invitación...</AlertDialogTitle>
          </AlertDialogHeader>
          <div className="py-2 flex flex-col items-center gap-3 text-sm text-gray-600">
            <InfinitySpin width="160" color="#1d4ed8" />
            <p>Estamos generando el link y enviando el correo si aplica. Por favor espera.</p>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cupo total obligatorio: no se permite crear si faltan acompañantes */}
    </Layout>
  );
}
