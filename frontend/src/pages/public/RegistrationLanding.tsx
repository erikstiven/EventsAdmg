import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Camera, Upload, CheckCircle2, AlertTriangle, User, Hourglass, Link as LinkIcon } from 'lucide-react';
import {
  BaseModal,
  BaseModalBody,
  BaseModalContent,
  BaseModalDescription,
  BaseModalFooter,
  BaseModalHeader,
  BaseModalTitle,
} from '@/components/ui/base-modal';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api';

type Participant = {
  name: string;
  cedula: string;
  email: string;
  telefono: string;
  codigo: string;
  rol: 'Titular' | 'Acompañante';
  selfie: boolean;
  doc: boolean;
  selfieName?: string;
  docName?: string;
  selfieUrl?: string;
  docUrl?: string;
};

export default function RegistrationLanding() {
  const { token } = useParams();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingSelfie, setSavingSelfie] = useState(false);
  const [savingDoc, setSavingDoc] = useState(false);
  const [locked, setLocked] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [eventName, setEventName] = useState('');
  const [groupSize, setGroupSize] = useState(3);
  const [status, setStatus] = useState('');
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [showBio, setShowBio] = useState(false);
  const [showDoc, setShowDoc] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const docInputRef = useRef<HTMLInputElement | null>(null);
  const selfieInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const docVideoRef = useRef<HTMLVideoElement | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [selfieBlob, setSelfieBlob] = useState<Blob | null>(null);
  const [docBlob, setDocBlob] = useState<Blob | null>(null);
  const [docCameraActive, setDocCameraActive] = useState(false);
  const [docCameraError, setDocCameraError] = useState('');
  const [selectedDocName, setSelectedDocName] = useState('');
  const [selectedDocPreview, setSelectedDocPreview] = useState('');
  const [selectedSelfieName, setSelectedSelfieName] = useState('');
  const [selectedSelfiePreview, setSelectedSelfiePreview] = useState('');
  const [confirmSubmitOpen, setConfirmSubmitOpen] = useState(false);
  const [showSaving, setShowSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!token) {
        setLoadError('No se encontró el token en el enlace.');
        setLoading(false);
        return;
      }
      try {
        const data = await api.publicInvitations.getByToken(token);
        setLoadError('');
        setEventName(data.event_name || '');
        setGroupSize(data.group_size || 3);
        setStatus(data.status || '');
        setLocked(['pendiente aprobación', 'pendiente aprobacion', 'completado', 'aprobado'].includes((data.status || '').toLowerCase()));
        const titular: Participant = {
          name: data.titular_name || '',
          cedula: data.titular_identification || '',
          email: data.email || '',
          telefono: data.phone || '',
          codigo: data.fingerprint_code || '',
          rol: 'Titular',
          selfie: Boolean(data.titular_selfie_url),
          doc: Boolean(data.titular_doc_url),
          selfieName: '',
          docName: '',
          selfieUrl: data.titular_selfie_url || '',
          docUrl: data.titular_doc_url || '',
        };
        const comps: Participant[] = Array.isArray(data.companions)
          ? data.companions.map((c: any) => ({
              name: c.name || '',
              cedula: c.cedula || '',
              email: c.email || '',
              telefono: c.telefono || '',
              codigo: c.codigo || '',
              rol: 'Acompañante',
              selfie: Boolean(c.selfie_url) || Boolean(c.selfie),
              doc: Boolean(c.doc_url) || Boolean(c.doc),
              selfieName: c.selfieName || '',
              docName: c.docName || '',
              selfieUrl: c.selfie_url || '',
              docUrl: c.doc_url || '',
            }))
          : [];
        setParticipants([titular, ...comps]);
      } catch (error: any) {
        setLoadError(error?.message || 'Token inválido o expirado.');
        toast({
          title: 'Error',
          description: error?.message || 'Token inválido o expirado.',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [token, toast]);

  const maxCompanions = Math.max(0, groupSize - 1);

  useEffect(() => {
    const totalAllowed = maxCompanions + 1;
    if (participants.length > totalAllowed) {
      setParticipants((prev) => prev.slice(0, totalAllowed));
    }
  }, [maxCompanions, participants.length]);

  useEffect(() => {
    if (!showDoc || selectedIdx === null) return;
    const current = participants[selectedIdx];
    if (current?.docUrl) {
      setSelectedDocPreview(current.docUrl);
      setSelectedDocName(current.docName || 'Cédula cargada');
    } else {
      setSelectedDocPreview('');
      setSelectedDocName('');
    }
  }, [showDoc, selectedIdx, participants]);

  useEffect(() => {
    if (!showBio || selectedIdx === null) return;
    const current = participants[selectedIdx];
    if (current?.selfieUrl) {
      setSelectedSelfiePreview(current.selfieUrl);
      setSelectedSelfieName(current.selfieName || 'Selfie cargada');
    } else {
      setSelectedSelfiePreview('');
      setSelectedSelfieName('');
    }
  }, [showBio, selectedIdx, participants]);

  useEffect(() => {
    if (!showBio) return;
    const startCamera = async () => {
      try {
        setCameraError('');
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user' },
          audio: false,
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setCameraActive(true);
        }
      } catch (error: any) {
        setCameraError(error?.message || 'No se pudo acceder a la cámara.');
        setCameraActive(false);
      }
    };
    startCamera();
    return () => {
      if (videoRef.current?.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((track) => track.stop());
        videoRef.current.srcObject = null;
      }
      setCameraActive(false);
    };
  }, [showBio]);

  useEffect(() => {
    if (!showDoc) return;
    const startDocCamera = async () => {
      try {
        setDocCameraError('');
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        });
        if (docVideoRef.current) {
          docVideoRef.current.srcObject = stream;
          await docVideoRef.current.play();
          setDocCameraActive(true);
        }
      } catch (error: any) {
        setDocCameraError(error?.message || 'No se pudo acceder a la cámara.');
        setDocCameraActive(false);
      }
    };
    startDocCamera();
    return () => {
      if (docVideoRef.current?.srcObject) {
        const stream = docVideoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((track) => track.stop());
        docVideoRef.current.srcObject = null;
      }
      setDocCameraActive(false);
    };
  }, [showDoc]);

  const markSelfie = (idx: number, selfieUrl?: string, selfieName?: string) => {
    setParticipants((prev) =>
      prev.map((p, i) =>
        i === idx
          ? {
              ...p,
              selfie: true,
              selfieUrl: selfieUrl || p.selfieUrl,
              selfieName: selfieName || p.selfieName,
            }
          : p
      )
    );
  };

  const validateImageFile = (file?: File) => {
    if (!file) return 'Selecciona una imagen.';
    if (!file.type.startsWith('image/')) return 'El archivo debe ser una imagen.';
    const maxMb = 5;
    if (file.size > maxMb * 1024 * 1024) return `La imagen supera ${maxMb}MB.`;
    return '';
  };

  const captureSelfieFromCamera = async () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    const width = video.videoWidth || 640;
    const height = video.videoHeight || 480;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.92)
    );
    if (!blob) return;
    setSelfieBlob(blob);
    setSelectedSelfieName(`selfie-${Date.now()}.jpg`);
    setSelectedSelfiePreview(URL.createObjectURL(blob));
  };

  const captureDocFromCamera = async () => {
    if (!docVideoRef.current) return;
    const video = docVideoRef.current;
    const canvas = document.createElement('canvas');
    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.92)
    );
    if (!blob) return;
    setDocBlob(blob);
    setSelectedDocName(`cedula-${Date.now()}.jpg`);
    setSelectedDocPreview(URL.createObjectURL(blob));
  };

  const markDoc = (idx: number, docName?: string, docUrl?: string) => {
    setParticipants((prev) =>
      prev.map((p, i) =>
        i === idx ? { ...p, doc: true, docName: docName || p.docName, docUrl: docUrl || p.docUrl } : p
      )
    );
  };

  const completos = useMemo(
    () => participants.filter((p) => p.selfie && p.doc).length,
    [participants]
  );
  const totalCupo = groupSize || participants.length || 0;
  const progreso = totalCupo ? Math.round((completos / totalCupo) * 100) : 0;
  const pendientes = Math.max(0, totalCupo - completos);
  const canSubmit = !locked && completos > 0;

  const normalizeStatusLabel = (value?: string) => {
    if (!value) return '';
    const normalized = value.toLowerCase().replace('_', ' ').trim();
    if (normalized.includes('actualiz')) return 'Pendiente de actualización';
    if (normalized.includes('aprob')) return 'Pendiente aprobación';
    if (normalized.includes('completado') || normalized.includes('aprobado')) return 'Completado';
    if (normalized.includes('registro') || normalized.includes('proceso')) return 'En registro';
    return 'Pendiente completar';
  };

  const handleSubmit = async () => {
    if (!token) return;
      setSaving(true);
      setShowSaving(true);
      try {
      const titular = participants[0];
      const companions = participants.slice(1).map((c) => ({
        name: c.name,
        cedula: c.cedula,
        email: c.email,
        telefono: c.telefono,
        codigo: c.codigo,
        selfie: c.selfie,
        doc: c.doc,
        selfie_url: c.selfieUrl,
        doc_url: c.docUrl,
      }));
      await api.publicInvitations.register(token, {
        titular_name: titular?.name || '',
        titular_identification: titular?.cedula || '',
        email: titular?.email || '',
        phone: titular?.telefono || '',
        fingerprint_code: titular?.codigo || '',
        titular_selfie_url: titular?.selfieUrl || '',
        titular_doc_url: titular?.docUrl || '',
        companions: companions,
        status: 'Pendiente aprobación',
      });
      toast({
        title: 'Registro enviado',
        description: 'Tus datos fueron enviados correctamente.',
      });
      setLocked(true);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error?.data?.detail || 'No se pudo enviar el registro.',
        variant: 'destructive',
      });
      } finally {
        setSaving(false);
        setShowSaving(false);
      }
  };

  return (
    <div className="min-h-screen bg-slate-50 py-10">
      <div className="max-w-5xl mx-auto px-4 space-y-6">
        {loadError && !loading ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">No se pudo abrir la invitación</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-gray-600">
              <p>{loadError}</p>
              <div className="rounded-md border bg-slate-50 px-3 py-2 font-mono text-xs text-gray-700">
                Enlace: {token ? `https://app.com/registro/${token}` : 'Sin token'}
              </div>
              <p className="text-xs text-gray-500">
                Verifica que el enlace esté completo o solicita uno nuevo al organizador.
              </p>
            </CardContent>
          </Card>
        ) : (
        <Card>
          <CardHeader className="pb-2 space-y-2">
            <CardTitle className="text-2xl">Registro de invitados</CardTitle>
            <p className="text-sm text-gray-600">
              Completa la información del titular y acompañantes para confirmar el grupo.
            </p>
            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
              <span>Evento: {eventName || '---'}</span>
              <span>•</span>
              <span>Cupo: {groupSize}</span>
              {status && (
                <>
                  <span>•</span>
                  <span>Estado: {normalizeStatusLabel(status)}</span>
                </>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {locked ? (
              <Alert className="border-slate-200 bg-slate-50 text-slate-700">
                <AlertDescription className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" /> Registro enviado. Ya no puedes editar.
                </AlertDescription>
              </Alert>
            ) : pendientes > 0 ? (
              <Alert className="border-amber-200 bg-amber-50 text-amber-700">
                <AlertDescription className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" /> Faltan {pendientes} por completar.
                </AlertDescription>
              </Alert>
            ) : (
              <Alert className="border-emerald-200 bg-emerald-50 text-emerald-700">
                <AlertDescription className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" /> Datos completos. Puedes enviar.
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <Progress value={progreso} className="h-2 flex-1" />
                <span className="text-sm text-gray-600">{completos}/{totalCupo} completos</span>
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              {participants.map((p, idx) => (
                <Card key={`${p.rol}-${idx}`} className="shadow-sm">
                  <CardContent className="pt-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium flex items-center gap-2">
                          <User className="h-4 w-4" /> {p.name || 'Sin nombre'} ({p.rol})
                        </p>
                        <div className="text-xs text-gray-500 flex flex-wrap gap-4">
                          <span>Cédula: {p.cedula || '---'}</span>
                          <span>Email: {p.email || '---'}</span>
                        </div>
                      </div>
                      <Badge variant={p.selfie && p.doc ? 'default' : 'outline'}>
                        {p.selfie && p.doc ? 'Completo' : 'Pendiente completar'}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        variant={p.selfie ? 'default' : 'outline'}
                        onClick={() => {
                          if (locked) {
                            toast({
                              title: 'Edición bloqueada',
                              description: 'El registro ya fue enviado.',
                            });
                            return;
                          }
                          setSelectedIdx(idx);
                          setShowBio(true);
                        }}
                        className="min-w-[140px] justify-start"
                        disabled={locked}
                      >
                        <Camera className="h-4 w-4 mr-2" /> {p.selfie ? 'Rostro listo' : 'Rostro'}
                      </Button>
                      <Button
                        size="sm"
                        variant={p.doc ? 'default' : 'outline'}
                        onClick={() => {
                          if (locked) {
                            toast({
                              title: 'Edición bloqueada',
                              description: 'El registro ya fue enviado.',
                            });
                            return;
                          }
                          setSelectedIdx(idx);
                          setShowDoc(true);
                        }}
                        className="min-w-[140px] justify-start"
                        disabled={locked}
                      >
                        <Upload className="h-4 w-4 mr-2" /> {p.doc ? 'Cédula lista' : 'Cédula'}
                      </Button>
                      {!p.selfie || !p.doc ? (
                        <div className="flex items-center gap-1 text-amber-600 text-xs">
                          <AlertTriangle className="h-3 w-3" /> Faltan documentos
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-emerald-600 text-xs">
                          <CheckCircle2 className="h-3 w-3" /> Listo para aprobación
                        </div>
                      )}
                    </div>
                    {p.selfie && p.doc && (
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <Hourglass className="h-4 w-4 text-amber-500" />
                        El QR se enviará cuando la invitación sea aprobada.
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>

            <Separator />
            <div className="mt-4 pt-3 flex flex-col md:flex-row md:justify-between items-start md:items-center gap-3 border-t">
              <p className="text-xs text-gray-500">
                El envío confirma los datos del grupo.
              </p>
              <Button
                className="md:w-auto w-full"
                onClick={() => setConfirmSubmitOpen(true)}
                disabled={saving || loading || !canSubmit}
              >
                {saving ? 'Enviando...' : 'Enviar registro'}
              </Button>
            </div>
          </CardContent>
        </Card>
        )}
      </div>

      <BaseModal open={confirmSubmitOpen} onOpenChange={setConfirmSubmitOpen}>
        <BaseModalContent size="sm" blur>
          <BaseModalHeader>
            <BaseModalTitle>Confirmar envío</BaseModalTitle>
            <BaseModalDescription>
              Se enviará el registro del grupo para revisión. Luego no podrás editar desde este enlace.
            </BaseModalDescription>
          </BaseModalHeader>
          <BaseModalFooter>
            <Button variant="outline" onClick={() => setConfirmSubmitOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={async () => {
                setConfirmSubmitOpen(false);
                await handleSubmit();
              }}
              disabled={saving || loading || !canSubmit}
            >
              {saving ? 'Enviando...' : 'Confirmar envío'}
            </Button>
          </BaseModalFooter>
        </BaseModalContent>
      </BaseModal>

      <BaseModal open={showSaving} onOpenChange={() => {}}>
        <BaseModalContent size="sm" blur>
          <BaseModalHeader>
            <BaseModalTitle>Enviando registro...</BaseModalTitle>
            <BaseModalDescription>Espera unos segundos.</BaseModalDescription>
          </BaseModalHeader>
        </BaseModalContent>
      </BaseModal>

      <BaseModal open={showBio} onOpenChange={setShowBio}>
        <BaseModalContent size="md" blur>
          <BaseModalHeader>
            <BaseModalTitle>Registrar rostro</BaseModalTitle>
          </BaseModalHeader>
          <BaseModalBody className="space-y-4 text-sm text-gray-700">
            <p>Escanea tu rostro con la cámara y captura una foto clara.</p>
            <div className="relative w-full aspect-square max-h-[320px] sm:max-h-[420px] overflow-hidden rounded-xl bg-black">
              {selectedSelfiePreview ? (
                <img
                  src={selectedSelfiePreview}
                  alt={selectedSelfieName || 'Previsualización selfie'}
                  className="h-full w-full object-cover"
                />
              ) : (
                <video
                  ref={videoRef}
                  className="h-full w-full object-cover"
                  playsInline
                  muted
                />
              )}
              {!selectedSelfiePreview && (
                <div className="pointer-events-none absolute inset-0">
                  <div
                    className="absolute inset-0"
                    style={{
                      background:
                        'radial-gradient(circle at center, transparent 0 42%, rgba(0,0,0,0.6) 62%)',
                    }}
                  />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="h-[76%] w-[76%] rounded-full border border-white/60 sm:h-[78%] sm:w-[78%]" />
                  </div>
                </div>
              )}
            </div>
            {!selectedSelfiePreview && (
              <div className="text-xs text-slate-500">
                Alinea tu rostro dentro del círculo y mantén la mirada al frente.
              </div>
            )}
            {cameraError && (
              <div className="text-xs text-amber-600">{cameraError}</div>
            )}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Button
                className="w-full"
                variant="outline"
                onClick={captureSelfieFromCamera}
                disabled={savingSelfie || locked || !cameraActive}
              >
                <Camera className="h-4 w-4 mr-2" /> Capturar rostro
              </Button>
              <Button
                className="w-full"
                variant="outline"
                onClick={() => selfieInputRef.current?.click()}
                disabled={savingSelfie || locked}
              >
                <Upload className="h-4 w-4 mr-2" /> Usar archivo
              </Button>
              <input
                ref={selfieInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  setSelfieBlob(file || null);
                  setSelectedSelfieName(file?.name || '');
                  if (file) {
                    const url = URL.createObjectURL(file);
                    setSelectedSelfiePreview(url);
                  } else {
                    setSelectedSelfiePreview('');
                  }
                }}
              />
            </div>
          </BaseModalBody>
          <BaseModalFooter>
            <Button
              onClick={async () => {
                if (selectedIdx !== null && token) {
                  try {
                    setSavingSelfie(true);
                    const participant = participants[selectedIdx];
                    const role = participant.rol === 'Titular' ? 'Titular' : 'Acompanante';
                    const companionIndex = participant.rol === 'Acompañante' ? selectedIdx - 1 : undefined;
                    let fileToSend: File | null = null;
                    if (selfieBlob) {
                      fileToSend = new File([selfieBlob], selectedSelfieName || 'selfie.jpg', {
                        type: selfieBlob.type || 'image/jpeg',
                      });
                    } else {
                      const fileInput = selfieInputRef.current?.files?.[0];
                      fileToSend = fileInput || null;
                    }
                    const validationError = validateImageFile(fileToSend || undefined);
                    if (validationError) {
                      toast({
                        title: 'Archivo inválido',
                        description: validationError,
                        variant: 'destructive',
                      });
                      setSavingSelfie(false);
                      return;
                    }
                    const file = fileToSend as File;
                    const response = await api.publicInvitations.upload(token, {
                      role,
                      kind: 'selfie',
                      companion_index: companionIndex,
                      file,
                    });
                    const updatedSelfieUrl =
                      role === 'Titular'
                        ? response.titular_selfie_url
                        : response.companions?.[companionIndex!]?.selfie_url;
                    const finalSelfieUrl = updatedSelfieUrl || selectedSelfiePreview || '';
                    markSelfie(selectedIdx, finalSelfieUrl, selectedSelfieName);
                  } catch (error: any) {
                    toast({
                      title: 'Error',
                      description: error?.data?.detail || 'No se pudo guardar el rostro.',
                      variant: 'destructive',
                    });
                  } finally {
                    setSavingSelfie(false);
                  }
                }
                setShowBio(false);
                setSelectedSelfieName('');
                setSelectedSelfiePreview('');
                setSelfieBlob(null);
              }}
              disabled={savingSelfie || locked}
            >
              {savingSelfie ? 'Guardando...' : 'Guardar rostro'}
            </Button>
          </BaseModalFooter>
        </BaseModalContent>
      </BaseModal>

      <BaseModal open={showDoc} onOpenChange={setShowDoc}>
        <BaseModalContent size="md" blur>
          <BaseModalHeader>
            <BaseModalTitle>Subir cédula</BaseModalTitle>
          </BaseModalHeader>
          <BaseModalBody className="space-y-4 text-sm text-gray-700">
            <p>Adjunta imágenes claras de la cédula. (Validación pendiente)</p>
            <div className="border rounded-md h-56 bg-slate-100 flex items-center justify-center text-gray-500 overflow-hidden">
              {selectedDocPreview ? (
                <img
                  src={selectedDocPreview}
                  alt={selectedDocName || 'Previsualización cédula'}
                  className="max-h-52 object-contain"
                />
              ) : (
                <video
                  ref={docVideoRef}
                  className="h-52 w-full object-cover"
                  playsInline
                  muted
                />
              )}
            </div>
            {docCameraError && (
              <div className="text-xs text-amber-600">{docCameraError}</div>
            )}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Button
                variant="outline"
                onClick={captureDocFromCamera}
                disabled={savingDoc || locked || !docCameraActive}
              >
                <Camera className="h-4 w-4 mr-2" /> Tomar foto
              </Button>
              <Button
                variant="outline"
                onClick={() => docInputRef.current?.click()}
                disabled={savingDoc || locked}
              >
                <Upload className="h-4 w-4 mr-2" /> Subir imagen
              </Button>
              <input
                ref={docInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  setDocBlob(file || null);
                  setSelectedDocName(file?.name || '');
                  if (file) {
                    const url = URL.createObjectURL(file);
                    setSelectedDocPreview(url);
                  } else {
                    setSelectedDocPreview('');
                  }
                }}
              />
            </div>
          </BaseModalBody>
          <BaseModalFooter>
            <Button
              onClick={async () => {
                if (selectedIdx !== null) {
                  if (!selectedDocName && !docBlob) {
                    toast({
                      title: 'Falta archivo',
                      description: 'Selecciona una imagen de la cédula antes de guardar.',
                      variant: 'destructive',
                    });
                    return;
                  }
                  try {
                    setSavingDoc(true);
                    const participant = participants[selectedIdx];
                    const role = participant.rol === 'Titular' ? 'Titular' : 'Acompanante';
                    const companionIndex = participant.rol === 'Acompañante' ? selectedIdx - 1 : undefined;
                    let fileToSend: File | null = null;
                    if (docBlob) {
                      fileToSend = new File([docBlob], selectedDocName || 'cedula.jpg', {
                        type: docBlob.type || 'image/jpeg',
                      });
                    } else {
                      const fileInput = docInputRef.current?.files?.[0];
                      fileToSend = fileInput || null;
                    }
                    const validationError = validateImageFile(fileToSend || undefined);
                    if (validationError) {
                      toast({
                        title: 'Archivo inválido',
                        description: validationError,
                        variant: 'destructive',
                      });
                      setSavingDoc(false);
                      return;
                    }
                    if (fileToSend && token) {
                      const response = await api.publicInvitations.upload(token, {
                        role,
                        kind: 'doc',
                        companion_index: companionIndex,
                        file: fileToSend,
                      });
                      const updatedDocUrl =
                        role === 'Titular'
                          ? response.titular_doc_url
                          : response.companions?.[companionIndex!]?.doc_url;
                      markDoc(selectedIdx, selectedDocName, updatedDocUrl);
                    } else {
                      markDoc(selectedIdx, selectedDocName);
                    }
                  } catch (error: any) {
                    toast({
                      title: 'Error',
                      description: error?.data?.detail || 'No se pudo subir la cédula.',
                      variant: 'destructive',
                    });
                    return;
                  } finally {
                    setSavingDoc(false);
                  }
                }
                setShowDoc(false);
                setSelectedDocName('');
                setSelectedDocPreview('');
                setDocBlob(null);
              }}
              disabled={savingDoc || locked}
            >
              {savingDoc ? 'Guardando...' : 'Guardar cédula'}
            </Button>
          </BaseModalFooter>
        </BaseModalContent>
      </BaseModal>
    </div>
  );
}
