import React, { useState } from 'react';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api';
import { QRScanner } from '@/components/QRScanner';
import { CameraCapture } from '@/components/CameraCapture';
import { ScanLine, Camera, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';

export default function CheckIn() {
  const [scanning, setScanning] = useState(false);
  const [validationData, setValidationData] = useState<any>(null);
  const [capturing, setCapturing] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [manualMode, setManualMode] = useState(false);
  const [fingerprintCode, setFingerprintCode] = useState('');
  const { toast } = useToast();

  const handleQRScan = async (token: string) => {
    try {
      const response = await api.checkIns.validateQR(token);

      if (response.valid) {
        setValidationData(response);
        setScanning(false);
        setCapturing(true);
      } else {
        toast({
          title: 'QR Inválido',
          description: response.message,
          variant: 'destructive',
        });
        setScanning(false);
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error?.data?.detail || error?.response?.data?.detail || error.message || 'Error al validar QR',
        variant: 'destructive',
      });
      setScanning(false);
    }
  };

  const handlePhotoCapture = async (photoData: string) => {
    try {
      // Backend expects raw base64 without prefix
      const base64Part = photoData.includes(',') ? photoData.split(',')[1] : photoData;
      const response = await api.checkIns.validateBiometric(
        validationData.invitation_id,
        base64Part
      );

      setCapturing(false);
      setResult(response);

      if (!response.success && response.require_manual) {
        setManualMode(true);
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error?.data?.detail || error?.response?.data?.detail || error.message || 'Error en validación biométrica',
        variant: 'destructive',
      });
      setCapturing(false);
    }
  };

  const handleManualValidation = async () => {
    try {
      const response = await api.checkIns.manualValidate(
        validationData.invitation_id,
        fingerprintCode,
        'Main Gate',
        'Biometric validation failed, manual verification performed'
      );

      setResult(response);
      setManualMode(false);
      setFingerprintCode('');
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error?.data?.detail || error?.response?.data?.detail || error.message || 'Error en validación manual',
        variant: 'destructive',
      });
    }
  };

  const resetProcess = () => {
    setScanning(false);
    setValidationData(null);
    setCapturing(false);
    setResult(null);
    setManualMode(false);
    setFingerprintCode('');
  };

  return (
    <Layout>
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-6 text-center">Check-in de Asistentes</h1>

        {!scanning && !capturing && !result && !manualMode && (
          <Card>
            <CardHeader>
              <CardTitle>Iniciar Proceso de Check-in</CardTitle>
            </CardHeader>
            <CardContent>
              <Button
                className="w-full"
                size="lg"
                onClick={() => setScanning(true)}
              >
                <ScanLine className="h-5 w-5 mr-2" />
                Escanear Código QR
              </Button>
            </CardContent>
          </Card>
        )}

        {scanning && (
          <QRScanner
            onScan={handleQRScan}
            onClose={() => setScanning(false)}
          />
        )}

        {capturing && validationData && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Información del Asistente</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <p><strong>Nombre:</strong> {validationData.attendee_name}</p>
                <p><strong>Evento:</strong> {validationData.event_name}</p>
                {validationData.attendee_photo_url && (
                  <div>
                    <p className="mb-2"><strong>Foto de Referencia:</strong></p>
                    <img
                      src={validationData.attendee_photo_url}
                      alt="Reference"
                      className="w-32 h-32 rounded-lg object-cover"
                    />
                  </div>
                )}
              </CardContent>
            </Card>

            <CameraCapture
              onCapture={handlePhotoCapture}
              onClose={() => setCapturing(false)}
              title="Capturar Foto para Validación"
            />
          </div>
        )}

        {manualMode && validationData && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-yellow-600" />
                Validación Manual Requerida
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert>
                <AlertDescription>
                  La validación biométrica falló. Por favor, verifique el documento de identidad
                  y solicite el código de huella dactilar.
                </AlertDescription>
              </Alert>

              {validationData.id_document_url && (
                <div>
                  <p className="mb-2 font-medium">Documento de Identidad:</p>
                  <img
                    src={validationData.id_document_url}
                    alt="ID Document"
                    className="w-full max-w-md rounded-lg"
                  />
                </div>
              )}

              <div>
                <Label htmlFor="fingerprint">Código de Huella Dactilar</Label>
                <Input
                  id="fingerprint"
                  value={fingerprintCode}
                  onChange={(e) => setFingerprintCode(e.target.value)}
                  placeholder="Ingrese el código de huella"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Código esperado: {validationData.fingerprint_code}
                </p>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={resetProcess}>
                  Cancelar
                </Button>
                <Button className="flex-1" onClick={handleManualValidation}>
                  Validar Manualmente
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {result && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {result.success ? (
                  <>
                    <CheckCircle className="h-6 w-6 text-green-600" />
                    <span className="text-green-600">✅ Acceso Permitido</span>
                  </>
                ) : (
                  <>
                    <XCircle className="h-6 w-6 text-red-600" />
                    <span className="text-red-600">❌ Acceso Denegado</span>
                  </>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert className={result.success ? 'border-green-600' : 'border-red-600'}>
                <AlertDescription className="text-lg">
                  {result.message}
                </AlertDescription>
              </Alert>

              {result.match_score !== undefined && (
                <p className="text-sm text-gray-600">
                  Puntuación de coincidencia: {(result.match_score * 100).toFixed(1)}%
                </p>
              )}

              <Button className="w-full" onClick={resetProcess}>
                Escanear Siguiente QR
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}