import React, { useEffect, useRef, useState } from 'react';
import {
  BaseModal,
  BaseModalBody,
  BaseModalContent,
  BaseModalFooter,
  BaseModalHeader,
  BaseModalTitle,
} from '@/components/ui/base-modal';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import {
  computeAverageBrightness,
  detectFaces,
  drawFaceBox,
  isFaceCentered,
  loadFaceModels,
  type FaceDetection,
} from '@/services/faceService';
import { biometriaService } from '@/services/biometriaService';

const MIN_BRIGHTNESS = 80;
const MIN_FACE_RATIO = 0.2;
const MAX_FACE_RATIO = 0.72;
const CAPTURE_GRACE_MS = 1200;
const VALID_STREAK_REQUIRED = 3;
const STATUS_THROTTLE_MS = 250;

type FaceModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invitadoId: number | null;
  onValidated: (result: { aprobado: boolean; similitud: number }) => void;
};

export const FaceModal: React.FC<FaceModalProps> = ({
  open,
  onOpenChange,
  invitadoId,
  onValidated,
}) => {
  const { toast } = useToast();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const [cameraError, setCameraError] = useState('');
  const [statusMessage, setStatusMessage] = useState('Inicializando cámara...');
  const [embedding, setEmbedding] = useState<number[] | null>(null);
  const [captureImage, setCaptureImage] = useState<string>('');
  const [isFrozen, setIsFrozen] = useState(false);
  const [isComparing, setIsComparing] = useState(false);
  const [result, setResult] = useState<{ aprobado: boolean; similitud: number } | null>(null);
  const [canCapture, setCanCapture] = useState(false);
  const lastDetection = useRef<FaceDetection | null>(null);
  const lastGoodDetectionAt = useRef(0);
  const validStreak = useRef(0);
  const lastStatusAt = useRef(0);
  const lastStatus = useRef('');

  const stopLoop = () => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
  };

  const stopCamera = () => {
    stopLoop();
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
  };

  const resetState = () => {
    setEmbedding(null);
    setCaptureImage('');
    setIsFrozen(false);
    setResult(null);
    setCanCapture(false);
    lastDetection.current = null;
  };

  const mapCameraErrorMessage = (error: unknown) => {
    const raw = String((error as any)?.message || '').toLowerCase();
    const name = String((error as any)?.name || '').toLowerCase();

    if (name.includes('notallowed') || raw.includes('permission') || raw.includes('denied')) {
      return 'Permite el acceso a la cámara para continuar.';
    }
    if (name.includes('notfound') || raw.includes('requested device not found')) {
      return 'No se encontró una cámara disponible en este dispositivo.';
    }
    if (name.includes('notreadable') || raw.includes('track start')) {
      return 'La cámara está en uso por otra aplicación. Ciérrala e inténtalo de nuevo.';
    }
    if (name.includes('abort') || raw.includes('play() request was interrupted')) {
      return 'La cámara se reinició durante la apertura. Intenta nuevamente.';
    }
    return 'No se pudo acceder a la cámara. Intenta nuevamente.';
  };

  useEffect(() => {
    if (!open) {
      stopCamera();
      resetState();
      setStatusMessage('');
      setCameraError('');
      return;
    }

    const start = async () => {
      try {
        setCameraError('');
        setStatusMessage('Cargando modelos...');
        await loadFaceModels('/models');
        setStatusMessage('Activando cámara...');

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user' },
          audio: false,
        });
        if (!videoRef.current) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setStatusMessage('No se detecta rostro');
        runDetectionLoop();
      } catch (err: any) {
        setCameraError(mapCameraErrorMessage(err));
        setStatusMessage('');
      }
    };

    start();

    return () => {
      stopCamera();
    };
  }, [open]);

  const runDetectionLoop = () => {
    const loop = async () => {
      if (!videoRef.current || !canvasRef.current || isFrozen) {
        return;
      }
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx || video.videoWidth === 0) {
        animationRef.current = requestAnimationFrame(loop);
        return;
      }

      if (!frameCanvasRef.current) {
        frameCanvasRef.current = document.createElement('canvas');
      }
      const frameCanvas = frameCanvasRef.current;
      frameCanvas.width = video.videoWidth;
      frameCanvas.height = video.videoHeight;
      const frameCtx = frameCanvas.getContext('2d');

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const { resizedDetections } = await detectFaces(video, '/models');
      const detections = resizedDetections;

      let nextStatus = '';

      if (detections.length === 0) {
        nextStatus = 'No se detecta rostro';
        lastDetection.current = null;
        validStreak.current = 0;
      } else if (detections.length > 1) {
        nextStatus = 'Más de un rostro detectado';
        lastDetection.current = null;
        validStreak.current = 0;
      } else {
        const detection = detections[0];
        lastDetection.current = detection;
        const box = detection.detection.box;

        let brightness = 0;
        if (frameCtx) {
          frameCtx.drawImage(video, 0, 0, frameCanvas.width, frameCanvas.height);
          brightness = computeAverageBrightness(frameCtx, frameCanvas.width, frameCanvas.height);
        }
        const centered = isFaceCentered(box, canvas.width, canvas.height);
        const faceRatio = box.width / canvas.width;

        if (brightness < MIN_BRIGHTNESS) {
          nextStatus = 'Iluminación insuficiente';
          validStreak.current = 0;
          drawFaceBox(ctx, box, '#ef4444');
        } else if (faceRatio < MIN_FACE_RATIO) {
          nextStatus = 'Acércate un poco más a la cámara';
          validStreak.current = 0;
          drawFaceBox(ctx, box, '#f97316');
        } else if (faceRatio > MAX_FACE_RATIO) {
          nextStatus = 'Aléjate un poco de la cámara';
          validStreak.current = 0;
          drawFaceBox(ctx, box, '#f97316');
        } else if (!centered) {
          nextStatus = 'Rostro no centrado';
          validStreak.current = 0;
          drawFaceBox(ctx, box, '#f97316');
        } else {
          nextStatus = 'Rostro detectado';
          validStreak.current += 1;
          lastGoodDetectionAt.current = Date.now();
          drawFaceBox(ctx, box, '#22c55e');
        }
      }

      const now = Date.now();
      if (nextStatus && (nextStatus !== lastStatus.current || now - lastStatusAt.current > STATUS_THROTTLE_MS)) {
        lastStatus.current = nextStatus;
        lastStatusAt.current = now;
        setStatusMessage(nextStatus);
      }

      const streakOk = validStreak.current >= VALID_STREAK_REQUIRED;
      const withinGrace = now - lastGoodDetectionAt.current <= CAPTURE_GRACE_MS;
      setCanCapture((streakOk || withinGrace) && Boolean(lastDetection.current));

      animationRef.current = requestAnimationFrame(loop);
    };

    animationRef.current = requestAnimationFrame(loop);
  };

  const handleCapture = () => {
    if (!videoRef.current || !canvasRef.current) return;
    if (!lastDetection.current || !canCapture) {
      toast({
        title: 'Rostro no válido',
        description: statusMessage || 'No se puede capturar el rostro.',
      });
      return;
    }
    const video = videoRef.current;
    const captureCanvas = document.createElement('canvas');
    captureCanvas.width = video.videoWidth;
    captureCanvas.height = video.videoHeight;
    const captureCtx = captureCanvas.getContext('2d');
    if (!captureCtx) return;
    captureCtx.drawImage(video, 0, 0, captureCanvas.width, captureCanvas.height);
    const dataUrl = captureCanvas.toDataURL('image/jpeg', 0.92);
    setCaptureImage(dataUrl);
    setEmbedding(Array.from(lastDetection.current.descriptor));
    setIsFrozen(true);
    stopLoop();
    video.pause();
  };

  const handleRepeat = async () => {
    resetState();
    if (videoRef.current) {
      await videoRef.current.play();
      runDetectionLoop();
    }
  };

  const handleValidate = async () => {
    if (!invitadoId || !embedding) return;
    try {
      setIsComparing(true);
      const response = await biometriaService.verificar(invitadoId, embedding, captureImage);
      setResult(response);
      onValidated(response);
      onOpenChange(false);
    } catch (err: any) {
      toast({
        title: 'Error biométrico',
        description: err?.message || 'No se pudo validar la biometría.',
        variant: 'destructive',
      });
    } finally {
      setIsComparing(false);
    }
  };

  return (
    <BaseModal open={open} onOpenChange={onOpenChange}>
      <BaseModalContent size="md" blur>
        <BaseModalHeader>
          <BaseModalTitle>Escanear rostro</BaseModalTitle>
        </BaseModalHeader>

        <BaseModalBody className="space-y-4">
          <div className="relative w-full aspect-square max-h-[320px] sm:max-h-[420px] overflow-hidden rounded-xl bg-black">
            {captureImage ? (
              <img
                src={captureImage}
                alt="Rostro capturado"
                className="h-full w-full object-cover"
              />
            ) : (
              <>
                <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />
                <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
              </>
            )}
            {!captureImage && (
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
          {!captureImage && (
            <div className="text-xs text-slate-500">
              Alinea tu rostro dentro del círculo y mantén la mirada al frente.
            </div>
          )}

          {cameraError && <div className="text-xs text-amber-600">{cameraError}</div>}
          {!cameraError && statusMessage && (
            <div
              className={`text-xs font-medium ${
                statusMessage === 'Rostro detectado'
                  ? 'text-emerald-600'
                  : statusMessage === 'Más de un rostro detectado'
                  ? 'text-rose-600'
                  : 'text-slate-600'
              }`}
            >
              {statusMessage}
            </div>
          )}

          {result && (
            <div
              className={`rounded-md border px-3 py-2 text-sm ${
                result.aprobado
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-rose-200 bg-rose-50 text-rose-700'
              }`}
            >
              {result.aprobado
                ? `Aprobado · similitud ${result.similitud.toFixed(2)}`
                : `Rechazado · similitud ${result.similitud.toFixed(2)}`}
            </div>
          )}

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Button
              className="w-full"
              variant="outline"
              onClick={handleCapture}
              disabled={!canCapture || isFrozen}
            >
              Capturar rostro
            </Button>
            <Button className="w-full" variant="outline" onClick={handleRepeat} disabled={!isFrozen}>
              Repetir
            </Button>
          </div>
        </BaseModalBody>

        <BaseModalFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleValidate} disabled={!embedding || isComparing}>
            {isComparing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Validando...
              </>
            ) : (
              'Validar biometría'
            )}
          </Button>
        </BaseModalFooter>
      </BaseModalContent>
    </BaseModal>
  );
};
