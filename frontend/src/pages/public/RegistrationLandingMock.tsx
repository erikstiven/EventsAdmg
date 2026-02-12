import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Camera, Upload, CheckCircle2, AlertTriangle, User, Link as LinkIcon, Hourglass } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog as BaseDialog,
  DialogContent as BaseDialogContent,
  DialogHeader as BaseDialogHeader,
  DialogTitle as BaseDialogTitle,
  DialogFooter as BaseDialogFooter,
} from '@/components/ui/dialog';

export default function RegistrationLandingMock() {
  const [participantes, setParticipantes] = useState([
    { nombre: 'Ana López', rol: 'Titular', cedula: '0102030405', email: 'ana@example.com', selfie: false, doc: false },
    { nombre: 'María Torres', rol: 'Acompañante', cedula: '1111111111', email: 'maria@example.com', selfie: false, doc: false },
    { nombre: 'Luis Peña', rol: 'Acompañante', cedula: '2222222222', email: 'luis@example.com', selfie: false, doc: false },
  ]);
  const [showBio, setShowBio] = useState(false);
  const [showDoc, setShowDoc] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [enRevision, setEnRevision] = useState(false);

  const completos = useMemo(() => participantes.filter((p) => p.selfie && p.doc).length, [participantes]);
  const pendientes = participantes.length - completos;
  const progreso = Math.round((completos / participantes.length) * 100);

  const marcarSelfie = (idx: number) =>
    setParticipantes((prev) => prev.map((p, i) => (i === idx ? { ...p, selfie: true } : p)));
  const marcarDoc = (idx: number) =>
    setParticipantes((prev) => prev.map((p, i) => (i === idx ? { ...p, doc: true } : p)));

  return (
    <div className="min-h-screen bg-slate-50 py-10">
      <div className="max-w-5xl mx-auto px-4 space-y-6">
        <Card>
          <CardHeader className="pb-2 space-y-2">
            <CardTitle className="text-2xl">Registro Biométrico (Requerido)</CardTitle>
            <p className="text-sm text-gray-600">
              Verifica la identidad subiendo rostro y cédula de cada participante para generar los QR de acceso. Los cambios se guardan automáticamente.
            </p>
            <div className="flex flex-wrap items-center gap-3 text-sm text-gray-700">
              <Badge variant="outline">Evento: Gala Anual 2026</Badge>
              <Badge variant="outline">Titular: Ana López</Badge>
              {enRevision ? (
                <Badge variant="default">En revisión (edición bloqueada)</Badge>
              ) : (
                <Badge variant="outline">Edición habilitada</Badge>
              )}
              <div className="flex items-center gap-2 text-gray-600">
                <LinkIcon className="h-4 w-4" />
                <span className="font-mono text-xs truncate">https://app.com/registro/ana-lopez-001</span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-sm text-gray-700">
              <Badge variant="outline">Cupo total: 3</Badge>
              <Badge variant="outline">Intransferible</Badge>
              <Badge variant="outline">El QR se enviará al aprobar</Badge>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                {pendientes > 0 ? (
                  <Alert className="border-amber-200 bg-amber-50 text-amber-700">
                    <AlertDescription className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4" /> Faltan {pendientes} por completar biometría/cédula.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <Alert className="border-emerald-200 bg-emerald-50 text-emerald-700">
                    <AlertDescription className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4" /> Documentos completos. Pendiente aprobación para enviar los QR.
                    </AlertDescription>
                  </Alert>
                )}
              </div>
              <div className="flex items-center gap-3">
                <Progress value={progreso} className="h-2 flex-1" />
                <span className="text-sm text-gray-600">{completos}/{participantes.length} completos</span>
              </div>
            </div>
            <Separator />

            <div className="space-y-4">
              {participantes.map((p, idx) => (
                <Card key={idx} className="shadow-sm">
                  <CardContent className="pt-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium flex items-center gap-2"><User className="h-4 w-4" /> {p.nombre} ({p.rol})</p>
                        <div className="text-xs text-gray-500 flex flex-wrap gap-4">
                          <span>Cédula: {p.cedula}</span>
                          <span>Email: {p.email}</span>
                        </div>
                      </div>
                      <Badge variant={p.selfie && p.doc ? 'default' : 'outline'}>
                        {p.selfie && p.doc ? 'Completo' : 'Pendiente'}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        variant={p.selfie ? 'default' : 'outline'}
                        disabled={enRevision}
                        onClick={() => {
                          if (enRevision) return;
                          setSelectedIdx(idx);
                          setShowBio(true);
                        }}
                        className="min-w-[170px] justify-start"
                      >
                        <Camera className="h-4 w-4 mr-2" /> {p.selfie ? 'Rostro registrado' : 'Registrar rostro'}
                      </Button>
                      <Button
                        size="sm"
                        variant={p.doc ? 'default' : 'outline'}
                        disabled={enRevision}
                        onClick={() => {
                          if (enRevision) return;
                          setSelectedIdx(idx);
                          setShowDoc(true);
                        }}
                        className="min-w-[150px] justify-start"
                      >
                        <Upload className="h-4 w-4 mr-2" /> {p.doc ? 'Cédula cargada' : 'Subir cédula'}
                      </Button>
                      {!p.selfie || !p.doc ? (
                        <div className="flex items-center gap-1 text-amber-600 text-xs">
                          <AlertTriangle className="h-3 w-3" /> Falta completar documentos
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-emerald-600 text-xs">
                          <CheckCircle2 className="h-3 w-3" /> Completo · Pendiente de aprobación y envío de QR
                        </div>
                      )}
                    </div>
                    {p.selfie && p.doc && (
                      <div className="flex items-center gap-2 text-sm text-gray-700 bg-slate-50 border rounded-md px-3 py-2">
                        <Hourglass className="h-4 w-4 text-amber-500" />
                        {enRevision
                          ? 'En revisión. QR se enviará tras la aprobación.'
                          : 'QR en espera de aprobación; se enviará al correo registrado.'}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>

            <Separator />
            <div className="mt-4 pt-3 flex flex-col md:flex-row md:justify-between items-start md:items-center gap-3 border-t">
              <p className="text-xs text-gray-500">
                Los cambios se guardan automáticamente. {enRevision ? 'Enviado a revisión; edición bloqueada.' : 'Envía cuando esté todo completo.'}
              </p>
              <Button
                className="md:w-auto w-full"
                disabled={enRevision}
                onClick={() => setShowSubmitModal(true)}
              >
                {enRevision ? 'Enviado' : 'Enviar registro'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={showBio} onOpenChange={setShowBio}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Capturar fotografía biométrica</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm text-gray-700">
            <p>
              {selectedIdx !== null && participantes[selectedIdx].selfie
                ? 'Reemplaza la foto si necesitas una nueva captura.'
                : 'Enciende tu cámara o sube una foto frontal con buena iluminación.'}
            </p>
            <div className="border rounded-md h-48 bg-slate-100 flex items-center justify-center text-gray-500">
              Vista previa de cámara / foto
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline">
                <Camera className="h-4 w-4 mr-2" /> Activar cámara
              </Button>
              <Button variant="outline">
                <Upload className="h-4 w-4 mr-2" /> Subir foto
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                if (selectedIdx !== null) {
                  marcarSelfie(selectedIdx);
                }
                setShowBio(false);
              }}
            >
              {selectedIdx !== null && participantes[selectedIdx].selfie ? 'Actualizar biometría' : 'Guardar biometría'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDoc} onOpenChange={setShowDoc}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Subir cédula (frontal y reverso)</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm text-gray-700">
            <p>
              {selectedIdx !== null && participantes[selectedIdx].doc
                ? 'Reemplaza los archivos si necesitas actualizarlos.'
                : 'Adjunta imágenes claras de la cédula. Acepta JPG/PNG/PDF.'}
            </p>
            <div className="border rounded-md h-32 bg-slate-100 flex items-center justify-center text-gray-500">
              Zona de previsualización
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline">
                <Upload className="h-4 w-4 mr-2" /> Subir frontal
              </Button>
              <Button variant="outline">
                <Upload className="h-4 w-4 mr-2" /> Subir reverso
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                if (selectedIdx !== null) {
                  marcarDoc(selectedIdx);
                }
                setShowDoc(false);
              }}
            >
              {selectedIdx !== null && participantes[selectedIdx].doc ? 'Actualizar cédula' : 'Guardar cédula'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BaseDialog open={showSubmitModal} onOpenChange={setShowSubmitModal}>
        <BaseDialogContent>
          <BaseDialogHeader>
            <BaseDialogTitle>Enviar registro</BaseDialogTitle>
          </BaseDialogHeader>
          <div className="text-sm text-gray-700 space-y-2">
            <p>Se enviará tu registro para aprobación. No podrás editar mientras esté en revisión.</p>
            <ul className="list-disc list-inside text-gray-600">
              <li>QR de cada participante se enviará por correo tras la aprobación.</li>
              <li>Puedes reabrir si el aprobador solicita correcciones.</li>
            </ul>
          </div>
          <BaseDialogFooter className="flex gap-2">
            <Button variant="ghost" onClick={() => setShowSubmitModal(false)}>Cancelar</Button>
            <Button
              onClick={() => {
                setEnRevision(true);
                setShowSubmitModal(false);
              }}
            >
              Confirmar envío
            </Button>
          </BaseDialogFooter>
        </BaseDialogContent>
      </BaseDialog>
    </div>
  );
}
