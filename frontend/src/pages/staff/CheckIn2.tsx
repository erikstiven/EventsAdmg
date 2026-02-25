import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { QRScanner } from '@/components/QRScanner';
import { FaceModal } from '@/components/FaceModal';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api';
import { Camera, CheckCircle2, CreditCard, ScanLine } from 'lucide-react';

type FaceResult = 'pendiente' | 'aprobado' | 'rechazado';
type ApprovalMethod = 'Automática' | 'Manual';

type ValidateQRResponse = {
  valid: boolean;
  message: string;
  invitation_id?: number;
  attendee_id?: number | null;
  attendee_name?: string;
  attendee_photo_url?: string;
  event_name?: string;
  fingerprint_code?: string;
  id_document_url?: string;
};

type ScanFeedbackType = 'neutral' | 'info' | 'success' | 'error';

type ScanFeedback = {
  type: ScanFeedbackType;
  title: string;
  detail: string;
};

type QRCheckInResponse = {
  success: boolean;
  message: string;
  checkin_id?: number;
  attendee_name?: string;
  event_name?: string;
};

type LastScan = {
  status: 'ok' | 'error';
  title: string;
  message: string;
  attendee?: string;
  event?: string;
  method?: ApprovalMethod | 'QR';
  at: string;
};

type RecentCheckIn = {
  id: number;
  checked_in_at: string;
  attendee_name: string;
  attendee_identification?: string | null;
  event_id: number;
  event_name?: string | null;
  participant_role?: string | null;
  gate?: string | null;
};

export default function CheckIn2() {
  const { toast } = useToast();
  const facialFlowEnabled = true;
  const [scanning, setScanning] = useState(false);
  const [lastScannedToken, setLastScannedToken] = useState('');
  const [qrLoading, setQrLoading] = useState(false);
  const [qrData, setQrData] = useState<ValidateQRResponse | null>(null);
  const [qrScanned, setQrScanned] = useState(false);
  const [faceResult, setFaceResult] = useState<FaceResult>('pendiente');
  const [idVerified, setIdVerified] = useState(false);
  const [verificationOpen, setVerificationOpen] = useState(false);
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [approvalMethod, setApprovalMethod] = useState<ApprovalMethod>('Automática');
  const [manualLoading, setManualLoading] = useState(false);
  const [qrCheckInLoading, setQrCheckInLoading] = useState(false);
  const [lastScan, setLastScan] = useState<LastScan | null>(null);
  const [recentCheckins, setRecentCheckins] = useState<RecentCheckIn[]>([]);
  const [recentSearch, setRecentSearch] = useState('');
  const [recentTotal, setRecentTotal] = useState(0);
  const [recentLoading, setRecentLoading] = useState(false);
  const [recentPage, setRecentPage] = useState(1);
  const recentPageSize = 10;
  const [events, setEvents] = useState<{ id: number; name: string }[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>('all');
  const [faceScanOpen, setFaceScanOpen] = useState(false);
  const [scanFeedback, setScanFeedback] = useState<ScanFeedback>({
    type: 'neutral',
    title: 'Listo para escanear',
    detail: 'Presiona "Iniciar escaneo" y apunta la cámara al QR del invitado.',
  });

  const neutralFeedback = (): ScanFeedback => ({
    type: 'neutral',
    title: 'Listo para escanear',
    detail: 'Presiona "Iniciar escaneo" y apunta la cámara al QR del invitado.',
  });

  const resetFlow = () => {
    setScanning(false);
    setLastScannedToken('');
    setQrData(null);
    setQrScanned(false);
    setFaceResult('pendiente');
    setIdVerified(false);
    setVerificationOpen(false);
    setApprovalOpen(false);
    setScanFeedback(neutralFeedback());
  };

  const deniedMessage = (message?: string) => {
    const text = (message || '').toLowerCase();
    if (text.includes('ya fue utilizada') || text.includes('ya utilizado')) {
      return { title: 'QR ya utilizado', detail: 'Este código QR ya fue usado anteriormente.' };
    }
    if (text.includes('no aprobado')) {
      return { title: 'Invitado no aprobado', detail: message || 'El invitado no está aprobado para ingreso.' };
    }
    if (text.includes('inválido') || text.includes('invalido') || text.includes('no encontrado')) {
      return { title: 'QR inválido', detail: 'El código no existe o no pertenece a un invitado válido.' };
    }
    return { title: 'Acceso denegado', detail: message || 'No se pudo validar el ingreso con este QR.' };
  };

  const nowLabel = () =>
    new Date().toLocaleString('es-EC', {
      hour12: false,
    });

  const fetchRecentCheckins = useCallback(async (params?: { query?: string; page?: number; eventId?: string }) => {
    const query = params?.query ?? recentSearch;
    const page = params?.page ?? recentPage;
    const eventId = params?.eventId ?? selectedEventId;
    try {
      setRecentLoading(true);
      const res = await api.checkIns.recent({
        skip: Math.max(0, (page - 1) * recentPageSize),
        limit: recentPageSize,
        search: (query ?? '').trim() || undefined,
        event_id: eventId !== 'all' ? Number(eventId) : undefined,
      });
      setRecentCheckins(Array.isArray(res?.items) ? res.items : []);
      setRecentTotal(Number(res?.total || 0));
    } catch {
      // Silent fail for operational panel refresh.
    } finally {
      setRecentLoading(false);
    }
  }, [recentPage, recentSearch, recentPageSize, selectedEventId]);

  const totalRecentPages = useMemo(
    () => Math.max(1, Math.ceil(recentTotal / recentPageSize)),
    [recentTotal, recentPageSize]
  );

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      setRecentPage(1);
      fetchRecentCheckins({ query: recentSearch, page: 1 });
    }, 250);
    return () => window.clearTimeout(timerId);
  }, [fetchRecentCheckins, recentSearch]);

  useEffect(() => {
    setRecentPage(1);
    fetchRecentCheckins({ page: 1, eventId: selectedEventId });
  }, [fetchRecentCheckins, selectedEventId]);

  useEffect(() => {
    fetchRecentCheckins({ page: 1 });
    const intervalId = window.setInterval(() => {
      if (document.hidden) return;
      fetchRecentCheckins();
    }, 10000);
    return () => window.clearInterval(intervalId);
  }, [fetchRecentCheckins]);

  useEffect(() => {
    const loadEvents = async () => {
      try {
        const response = await api.events.list({ limit: 2000 });
        setEvents(response.items || []);
      } catch {
        // No-op: event filter is optional.
      }
    };
    loadEvents();
  }, []);

  useEffect(() => {
    fetchRecentCheckins({ page: recentPage });
  }, [fetchRecentCheckins, recentPage]);

  const isExactMatch = (row: RecentCheckIn) => {
    const q = recentSearch.trim().toLowerCase();
    if (!q) return false;
    const name = (row.attendee_name || '').trim().toLowerCase();
    const id = String(row.attendee_identification || '').replace(/\s+/g, '').toLowerCase();
    const normalizedQ = q.replace(/\s+/g, '');
    return name === q || id === normalizedQ;
  };

  const markApprovalCompleted = (method: ApprovalMethod, detail?: string) => {
    const attendee = qrData?.attendee_name || 'Invitado';
    const eventName = qrData?.event_name || 'Sin evento';
    const message = detail || `Ingreso aprobado (${method}).`;
    setScanFeedback(neutralFeedback());
    setLastScan({
      status: 'ok',
      title: 'Ingreso registrado',
      message,
      attendee,
      event: eventName,
      method,
      at: nowLabel(),
    });
    setQrScanned(false);
    fetchRecentCheckins({ page: 1 });
  };

  const closeApprovalDialog = () => {
    setApprovalOpen(false);
    setScanning(false);
    setLastScannedToken('');
    setQrData(null);
    setQrScanned(false);
    setFaceResult('pendiente');
    setIdVerified(false);
    setScanFeedback(neutralFeedback());
  };

  const getErrorMessage = (error: unknown, fallback: string) => {
    if (error instanceof Error && error.message) return error.message;
    return fallback;
  };

  const formatSimilarityPercent = (value: number) => {
    const normalized = Number.isFinite(value) ? value : 0;
    const bounded = Math.max(0, Math.min(1, normalized));
    return `${Math.round(bounded * 100)}%`;
  };

  const openVerification = () => {
    setFaceResult('pendiente');
    setIdVerified(true);
    setVerificationOpen(true);
  };

  const handleValidateQr = async (token: string) => {
    const qrToken = token.trim();
    if (!qrToken) return;
    try {
      setQrLoading(true);
      setLastScannedToken(qrToken);
      setScanFeedback({
        type: 'info',
        title: 'Validando QR',
        detail: 'Estamos validando el código escaneado contra el estado del invitado.',
      });

      const res: ValidateQRResponse = await api.checkIns.validateQR(qrToken);
      if (!res.valid) {
        const denied = deniedMessage(res.message);
        setQrData(null);
        setQrScanned(false);
        setScanning(false);
        setScanFeedback({
          type: 'error',
          title: denied.title,
          detail: denied.detail,
        });
        setLastScan({
          status: 'error',
          title: denied.title,
          message: denied.detail,
          at: nowLabel(),
        });
        return;
      }
      setQrData(res);
      setQrScanned(true);
      setScanning(false);
      setIdVerified(false);
      setScanFeedback({
        type: 'info',
        title: 'QR válido',
        detail: 'Revisa la información del invitado y confirma el ingreso.',
      });
      openVerification();
    } catch (error) {
      setScanning(false);
      setScanFeedback({
        type: 'error',
        title: 'Error de validación',
        detail: 'No se pudo validar el QR en este momento. Intenta nuevamente.',
      });
    } finally {
      setQrLoading(false);
    }
  };

  const handleQrOnlyCheckIn = async () => {
    if (!lastScannedToken) return;
    try {
      setQrCheckInLoading(true);
      const checkinRes: QRCheckInResponse = await api.checkIns.qrCheckIn(lastScannedToken);
      if (!checkinRes.success) {
        const denied = deniedMessage(checkinRes.message);
        setScanFeedback({
          type: 'error',
          title: denied.title,
          detail: denied.detail,
        });
        setLastScan({
          status: 'error',
          title: denied.title,
          message: denied.detail,
          attendee: checkinRes.attendee_name,
          event: checkinRes.event_name,
          at: nowLabel(),
        });
        return;
      }
      setScanFeedback(neutralFeedback());
      setLastScan({
        status: 'ok',
        title: 'Ingreso registrado',
        message: checkinRes.message || 'El QR se procesó y quedó en desuso.',
        attendee: checkinRes.attendee_name,
        event: checkinRes.event_name,
        method: 'QR',
        at: nowLabel(),
      });
      setVerificationOpen(false);
      toast({
        title: 'Ingreso registrado',
        description: checkinRes.message || 'El QR fue consumido correctamente.',
      });
    } catch (error) {
      setScanFeedback({
        type: 'error',
        title: 'Error de check-in',
        detail: 'No se pudo registrar el ingreso por QR. Intenta nuevamente.',
      });
    } finally {
      setQrCheckInLoading(false);
    }
  };

  const handleBiometricScan = () => {
    if (!facialFlowEnabled) {
      toast({
        title: 'Función pendiente',
        description: 'La validación por reconocimiento facial se activará al final del proyecto.',
      });
      return;
    }
    if (!qrData?.invitation_id) return;
    if (qrData.attendee_id == null) {
      toast({
        title: 'Biometría no disponible',
        description: 'Para QR de grupos, continúa con aprobación manual.',
      });
      setFaceResult('rechazado');
      return;
    }
    setFaceScanOpen(true);
  };

  const handleBiometricValidated = (result: { aprobado: boolean; similitud: number }) => {
    setFaceResult(result.aprobado ? 'aprobado' : 'rechazado');
    const similarityLabel = formatSimilarityPercent(result.similitud);
    if (result.aprobado) {
      toast({
        title: 'Biometría aprobada',
        description: `Similitud ${similarityLabel}. Verifica cédula física y aprueba el ingreso.`,
      });
    } else {
      toast({
        title: 'Biometría rechazada',
        description: `Similitud ${similarityLabel}. Usa aprobación manual.`,
      });
    }
    setFaceScanOpen(false);
  };

  const handleAutoApprove = async () => {
    if (!lastScannedToken) return;
    try {
      setQrCheckInLoading(true);
      const checkinRes: QRCheckInResponse = await api.checkIns.qrCheckIn(lastScannedToken);
      if (!checkinRes.success) {
        const denied = deniedMessage(checkinRes.message);
        setScanFeedback({
          type: 'error',
          title: denied.title,
          detail: denied.detail,
        });
        setLastScan({
          status: 'error',
          title: denied.title,
          message: denied.detail,
          attendee: checkinRes.attendee_name,
          event: checkinRes.event_name,
          at: nowLabel(),
        });
        return;
      }
      setApprovalMethod('Automática');
      setApprovalOpen(true);
      setVerificationOpen(false);
      markApprovalCompleted('Automática', checkinRes.message || 'Validación biométrica exitosa.');
    } catch (error) {
      toast({
        title: 'Error',
        description: getErrorMessage(error, 'No se pudo aprobar el ingreso.'),
        variant: 'destructive',
      });
    } finally {
      setQrCheckInLoading(false);
    }
  };

  const handleManualApprove = async () => {
    if (!facialFlowEnabled) {
      toast({
        title: 'Función pendiente',
        description: 'La aprobación manual asociada a biometría se activará al final del proyecto.',
      });
      return;
    }
    if (!qrData?.invitation_id) return;
    try {
      setManualLoading(true);
      // Invitation groups return attendee_id as null in validate-qr.
      // For those cases, consume the QR directly through qr-checkin.
      if (qrData.attendee_id == null && lastScannedToken) {
        const checkinRes: QRCheckInResponse = await api.checkIns.qrCheckIn(lastScannedToken);
        if (!checkinRes.success) {
          toast({
            title: 'Validación manual',
            description: checkinRes.message || 'No se pudo validar.',
            variant: 'destructive',
          });
          return;
        }
        setApprovalMethod('Manual');
        setApprovalOpen(true);
        setVerificationOpen(false);
        markApprovalCompleted('Manual', checkinRes.message || 'Validación manual exitosa.');
        return;
      }

      const res = await api.checkIns.manualValidate(
        qrData.invitation_id,
        qrData.fingerprint_code || ''
      );
      if (!res?.success) {
        toast({ title: 'Validación manual', description: res?.message || 'No se pudo validar.' });
        return;
      }
      setApprovalMethod('Manual');
      setApprovalOpen(true);
      setVerificationOpen(false);
      markApprovalCompleted('Manual', res?.message || 'Validación manual exitosa.');
    } catch (error) {
      toast({
        title: 'Error',
        description: getErrorMessage(error, 'No se pudo validar manualmente.'),
        variant: 'destructive',
      });
    } finally {
      setManualLoading(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Escaneo de acceso</h1>
          <p className="text-gray-600">
            Presiona "Iniciar escaneo" y apunta la cámara al código del invitado.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ScanLine className="h-5 w-5" />
              Escaneo de QR
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div
              className={`rounded-md border px-4 py-3 text-sm ${
                scanFeedback.type === 'success'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : scanFeedback.type === 'error'
                  ? 'border-rose-200 bg-rose-50 text-rose-800'
                  : scanFeedback.type === 'info'
                  ? 'border-blue-200 bg-blue-50 text-blue-800'
                  : 'border-slate-200 bg-slate-50 text-slate-700'
              }`}
            >
              <div className="font-semibold">{scanFeedback.title}</div>
              <div className="mt-1">{scanFeedback.detail}</div>
            </div>

            <Button
              className="w-full sm:w-64"
              onClick={() => {
                setScanFeedback({
                  type: 'info',
                  title: 'Cámara activa',
                  detail: 'Escanea el QR dentro del marco para continuar.',
                });
                setScanning(true);
              }}
              disabled={qrLoading}
            >
              {qrLoading ? 'Validando...' : qrScanned ? 'Escanear siguiente QR' : 'Iniciar escaneo'}
            </Button>

            {qrScanned && qrData?.valid && (
              <div className="space-y-3">
                <div className="rounded-lg border p-4 bg-gray-50 text-sm">
                  <div className="flex flex-wrap gap-x-6 gap-y-2">
                    <span>
                      <span className="text-gray-500">Invitado:</span>{' '}
                      {qrData.attendee_name || 'Sin nombre'}
                    </span>
                    <span>
                      <span className="text-gray-500">Evento:</span>{' '}
                      {qrData.event_name || 'Sin evento'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div className="rounded-md border border-dashed border-slate-300 p-3 text-xs text-slate-600">
              <div>Sin ingreso por código manual. El acceso se habilita únicamente por QR escaneado.</div>
              <div className="mt-1">Verifica la cédula física antes de aprobar el ingreso.</div>
            </div>
          </CardContent>
        </Card>

        {lastScan && (
          <Card>
            <CardHeader>
              <CardTitle>Último escaneo</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div
                className={`rounded-md border px-3 py-2 ${
                  lastScan.status === 'ok'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : 'border-rose-200 bg-rose-50 text-rose-800'
                }`}
              >
                <div className="font-semibold">{lastScan.title}</div>
                <div>{lastScan.message}</div>
              </div>
              <div className="text-slate-600">
                <span className="font-medium">Hora:</span> {lastScan.at}
              </div>
              {lastScan.attendee && (
                <div className="text-slate-600">
                  <span className="font-medium">Invitado:</span> {lastScan.attendee}
                </div>
              )}
              {lastScan.event && (
                <div className="text-slate-600">
                  <span className="font-medium">Evento:</span> {lastScan.event}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="space-y-3">
            <CardTitle>Ingresos recientes</CardTitle>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input
                placeholder="Buscar por nombre, cédula o evento"
                value={recentSearch}
                onChange={(e) => setRecentSearch(e.target.value)}
              />
              <Select value={selectedEventId} onValueChange={setSelectedEventId}>
                <SelectTrigger className="sm:w-[260px]">
                  <SelectValue placeholder="Filtrar por evento" />
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
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Hora</TableHead>
                  <TableHead>Invitado</TableHead>
                  <TableHead>Cédula</TableHead>
                  <TableHead>Evento</TableHead>
                  <TableHead>Puerta</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentCheckins.map((row) => (
                  <TableRow key={row.id} className={isExactMatch(row) ? 'bg-amber-50/60' : undefined}>
                    <TableCell>
                      {row.checked_in_at ? new Date(row.checked_in_at).toLocaleString('es-EC', { hour12: false }) : '-'}
                    </TableCell>
                    <TableCell className="font-medium">
                      {row.attendee_name || '-'}
                      {isExactMatch(row) && (
                        <Badge variant="outline" className="ml-2 border-amber-300 text-amber-700">
                          Coincidencia exacta
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className={isExactMatch(row) ? 'font-semibold text-amber-700' : undefined}>
                      {row.attendee_identification || '-'}
                    </TableCell>
                    <TableCell>{row.event_name || `Evento ${row.event_id}`}</TableCell>
                    <TableCell>{row.gate || '-'}</TableCell>
                    <TableCell>
                      <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Ingresó</Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {recentCheckins.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-sm text-gray-500 py-8">
                      {recentLoading ? 'Cargando ingresos recientes...' : 'No hay ingresos recientes para mostrar.'}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            <div className="mt-4 flex flex-col gap-2 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
              <div>
                Mostrando {recentCheckins.length} de {recentTotal} ingresos
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={recentPage <= 1 || recentLoading}
                  onClick={() => setRecentPage((p) => Math.max(1, p - 1))}
                >
                  Anterior
                </Button>
                <span>
                  Página {recentPage} de {totalRecentPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={recentPage >= totalRecentPages || recentLoading}
                  onClick={() => setRecentPage((p) => Math.min(totalRecentPages, p + 1))}
                >
                  Siguiente
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

      </div>

      <Dialog open={scanning} onOpenChange={setScanning}>
        <DialogContent className="w-[95vw] max-w-md p-0 overflow-hidden [&>button]:hidden">
          <div className="px-4 pt-3 pb-1">
            <div className="inline-flex items-center gap-2 rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-700">
              <span className="h-2 w-2 rounded-full bg-red-600 animate-pulse" />
              Cámara activa
            </div>
          </div>
          <div className="px-2 pb-2">
            <QRScanner
              onScan={handleValidateQr}
              onClose={() => setScanning(false)}
            />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={verificationOpen} onOpenChange={setVerificationOpen}>
        <DialogContent className="w-[95vw] max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Validación de ingreso</DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            <div className="rounded-lg border bg-gray-50 p-4 text-sm flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <p>
                  <span className="text-gray-500">Invitado:</span>{' '}
                  {qrData?.attendee_name || 'Sin nombre'}
                </p>
                <p>
                  <span className="text-gray-500">Evento:</span>{' '}
                  {qrData?.event_name || 'Sin evento'}
                </p>
              </div>
              <div
                className={
                  faceResult === 'aprobado'
                    ? 'inline-flex items-center rounded-full bg-green-600 text-white px-5 py-2 text-sm font-semibold'
                  : faceResult === 'rechazado'
                  ? 'inline-flex items-center rounded-full bg-red-600 text-white px-5 py-2 text-sm font-semibold'
                  : 'inline-flex items-center rounded-full bg-gray-200 text-gray-700 px-5 py-2 text-sm font-semibold'
                }
              >
                {faceResult === 'aprobado'
                  ? 'Rostro biométrico aprobado'
                  : faceResult === 'rechazado'
                  ? 'Rostro biométrico no aprobado'
                  : 'Validación biométrica pendiente'}
              </div>
            </div>

            <div>
              <div className="mb-4 rounded-lg border border-dashed p-4 text-sm text-gray-600 flex flex-wrap items-center justify-between gap-3">
                <div>
                  Validación facial biométrica
                  <div className="text-xs text-gray-500">
                    Presiona “Escanear rostro” para validar el ingreso.
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleBiometricScan}
                  disabled={!facialFlowEnabled}
                  title={
                    !facialFlowEnabled
                      ? 'Pendiente: reconocimiento facial se habilitará al final del proyecto'
                      : ''
                  }
                >
                  Escanear rostro
                </Button>
              </div>
              <p className="text-sm font-medium mb-3">Rostro registrado</p>
              <div className="rounded-lg border bg-white p-2">
                <div className="w-full aspect-square max-h-56 mx-auto flex items-center justify-center">
                  {qrData?.attendee_photo_url ? (
                    <img
                      src={qrData.attendee_photo_url}
                      alt="Rostro registrado"
                      className="max-h-56 w-full object-contain"
                    />
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
                      <Camera className="h-8 w-8" />
                      <span>No hay rostro registrado</span>
                    </div>
                  )}
                </div>
                <p className="mt-2 text-xs text-gray-500 text-center">Rostro del invitado</p>
              </div>
            </div>

            <div>
              <p className="text-sm font-medium mb-3">Validación de cédula</p>
              <div className="rounded-lg border bg-white p-3">
                {qrData?.id_document_url ? (
                  <img
                    src={qrData.id_document_url}
                    alt="Cédula registrada"
                    className="w-full h-auto max-h-72 object-contain"
                  />
                ) : (
                  <div className="flex h-40 flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
                    <CreditCard className="h-8 w-8" />
                    <span>No hay documento registrado</span>
                  </div>
                )}
                <p className="mt-2 text-xs text-gray-500 text-center">Documento del invitado</p>
              </div>
              <div className="mt-3 flex items-center gap-2 text-sm text-gray-700">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span>Cédula física verificada por staff (obligatorio)</span>
              </div>
            </div>

            <div>
              <p className="text-sm font-medium mb-3">Decisión de ingreso</p>
              {!facialFlowEnabled ? (
                <div className="flex flex-wrap gap-2">
                  <Button onClick={handleQrOnlyCheckIn} disabled={!idVerified || qrCheckInLoading}>
                    {qrCheckInLoading ? 'Registrando...' : 'Aprobar ingreso'}
                  </Button>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={handleAutoApprove}
                    disabled={faceResult !== 'aprobado' || !idVerified || !facialFlowEnabled || qrCheckInLoading}
                    title={
                      !facialFlowEnabled
                        ? 'Pendiente: aprobación por flujo biométrico se habilitará al final del proyecto'
                        : ''
                    }
                  >
                    {qrCheckInLoading ? 'Aprobando...' : 'Aprobar ingreso'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleManualApprove}
                    disabled={faceResult !== 'rechazado' || !idVerified || manualLoading || !facialFlowEnabled}
                    title={
                      !facialFlowEnabled
                        ? 'Pendiente: aprobación manual por biometría se habilitará al final del proyecto'
                        : ''
                    }
                  >
                    {manualLoading ? 'Aprobando…' : 'Aprobar ingreso manualmente'}
                  </Button>
                </div>
              )}
              <p className="text-xs text-gray-500 mt-2">
                {!facialFlowEnabled
                  ? 'Debes verificar cédula física para confirmar el ingreso por QR.'
                  : 'Ambas verificaciones son obligatorias: biometría + cédula.'}
              </p>
              {!facialFlowEnabled && (
                <p className="text-xs text-amber-700 mt-1">
                  Módulo de reconocimiento facial pendiente de implementación final.
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setVerificationOpen(false)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <FaceModal
        open={faceScanOpen}
        onOpenChange={setFaceScanOpen}
        invitadoId={qrData?.attendee_id ?? null}
        onValidated={handleBiometricValidated}
      />

      <Dialog open={approvalOpen} onOpenChange={(open) => !open && closeApprovalDialog()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Ingreso aprobado</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm text-gray-700">
            <p>La aprobación fue registrada correctamente.</p>
            <p>
              <span className="text-gray-500">Invitado:</span> {lastScan?.attendee || qrData?.attendee_name || 'N/D'}
            </p>
            <p>
              <span className="text-gray-500">Evento:</span> {lastScan?.event || qrData?.event_name || 'N/D'}
            </p>
            <p>
              <span className="text-gray-500">Hora:</span> {lastScan?.at || nowLabel()}
            </p>
            <p className="text-green-700">QR consumido y marcado como usado.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeApprovalDialog}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
