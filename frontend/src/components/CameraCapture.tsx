import React, { useRef, useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Camera, X, RotateCw } from 'lucide-react';

interface CameraCaptureProps {
  onCapture: (imageBase64: string) => void;
  onClose: () => void;
  title?: string;
}

export function CameraCapture({ onCapture, onClose, title = 'Capturar Foto' }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [captured, setCaptured] = useState(false);

  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
    };
  }, []);

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (error) {
      console.error('Error accessing camera:', error);
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0);
        const imageData = canvas.toDataURL('image/jpeg', 0.8);
        setCaptured(true);
        onCapture(imageData);
      }
    }
  };

  const retake = () => {
    setCaptured(false);
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Camera className="h-5 w-5" />
          {title}
        </CardTitle>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-5 w-5" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative aspect-square bg-black rounded-lg overflow-hidden">
          <video
            ref={videoRef}
            className={`w-full h-full object-cover ${captured ? 'hidden' : ''}`}
            autoPlay
            playsInline
          />
          <canvas
            ref={canvasRef}
            className={`w-full h-full object-cover ${!captured ? 'hidden' : ''}`}
          />
        </div>

        <div className="flex gap-2">
          {!captured ? (
            <Button className="flex-1" onClick={capturePhoto}>
              <Camera className="h-4 w-4 mr-2" />
              Capturar
            </Button>
          ) : (
            <>
              <Button variant="outline" className="flex-1" onClick={retake}>
                <RotateCw className="h-4 w-4 mr-2" />
                Repetir
              </Button>
              <Button className="flex-1" onClick={onClose}>
                Confirmar
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}