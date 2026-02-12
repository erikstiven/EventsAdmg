import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { client } from '@/lib/api';
import { QrCode, LogIn } from 'lucide-react';

export default function Login() {
  const handleLogin = async () => {
    await client.auth.toLogin();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="bg-blue-600 p-4 rounded-full">
              <QrCode className="h-12 w-12 text-white" />
            </div>
          </div>
          <CardTitle className="text-3xl">EventAccess</CardTitle>
          <CardDescription className="text-base">
            Sistema de Control de Acceso a Eventos
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2 text-sm text-gray-600">
            <p>✓ Gestión de eventos y asistentes</p>
            <p>✓ Códigos QR únicos y seguros</p>
            <p>✓ Validación biométrica facial</p>
            <p>✓ Aprobación de invitaciones</p>
            <p>✓ Check-in en tiempo real</p>
          </div>
          
          <Button className="w-full" size="lg" onClick={handleLogin}>
            <LogIn className="h-5 w-5 mr-2" />
            Iniciar Sesión
          </Button>

          <div className="border-t pt-4 space-y-2 text-xs text-gray-500">
            <p className="font-semibold">Usuarios Demo:</p>
            <p>• Admin: admin@demo.com</p>
            <p>• Aprobador: aprobador@demo.com</p>
            <p>• Staff: staff@demo.com</p>
            <p>• Asistente: asistente@demo.com</p>
            <p className="text-xs text-gray-400 mt-2">Password: demo123 (para todos)</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}