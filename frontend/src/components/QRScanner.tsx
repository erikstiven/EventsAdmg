import React, { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Camera, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { BrowserMultiFormatReader } from '@zxing/library';

interface QRScannerProps {
  onScan: (data: string) => void;
  onClose: () => void;
}

export function QRScanner({ onScan, onClose }: QRScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [scanning, setScanning] = useState(false);
  const { toast } = useToast();
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);

  useEffect(() => {
    startScanning();
    return () => {
      stopScanning();
    };
  }, []);

  const startScanning = async () => {
    try {
      const codeReader = new BrowserMultiFormatReader();
      readerRef.current = codeReader;
      
      const videoInputDevices = await codeReader.listVideoInputDevices();
      if (videoInputDevices.length === 0) {
        toast({
          title: 'Error',
          description: 'No se encontró ninguna cámara',
          variant: 'destructive',
        });
        return;
      }

      setScanning(true);
      
      codeReader.decodeFromVideoDevice(
        undefined,
        videoRef.current!,
        (result, error) => {
          if (result) {
            onScan(result.getText());
            stopScanning();
          }
        }
      );
    } catch (error) {
      console.error('Error starting scanner:', error);
      toast({
        title: 'Error',
        description: 'No se pudo iniciar la cámara',
        variant: 'destructive',
      });
    }
  };

  const stopScanning = () => {
    if (readerRef.current) {
      readerRef.current.reset();
    }
    setScanning(false);
  };

  return (
    <Card className="w-full max-w-md mx-auto border-0 shadow-none">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Camera className="h-5 w-5" />
          Escanear QR de acceso
        </CardTitle>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-5 w-5" />
        </Button>
      </CardHeader>
      <CardContent>
        <div className="relative aspect-[3/4] sm:aspect-square bg-black rounded-lg overflow-hidden">
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            autoPlay
            playsInline
          />
          {scanning && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-[72%] h-[72%] border-2 border-white rounded-lg"></div>
            </div>
          )}
        </div>
        <p className="text-sm text-gray-500 text-center mt-4">
          Alinea el QR dentro del marco
        </p>
      </CardContent>
    </Card>
  );
}
