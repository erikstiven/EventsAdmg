import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { authSimple } from '@/lib/auth-simple';
import { QrCode, LogIn, Loader2 } from 'lucide-react';

export default function LoginSimple() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      await authSimple.login(email, password);
      toast({
        title: "¡Bienvenido!",
        description: "Has iniciado sesión correctamente.",
      });
      // Force navigation to dashboard
      window.location.href = '/';
    } catch (error: any) {
      toast({
        title: "Error de autenticación",
        description: error.message || "Email o contraseña incorrectos",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const fillDemoUser = (userEmail: string) => {
    setEmail(userEmail);
    setPassword('demo123');
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
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="usuario@ejemplo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>

            <Button className="w-full" size="lg" type="submit" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                  Iniciando sesión...
                </>
              ) : (
                <>
                  <LogIn className="h-5 w-5 mr-2" />
                  Iniciar Sesión
                </>
              )}
            </Button>
          </form>

          <div className="border-t pt-4 space-y-2">
            <p className="text-sm font-semibold text-gray-700">Usuarios Demo (click para autocompletar):</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => fillDemoUser('admin@demo.com')}
                disabled={isLoading}
                className="text-xs"
              >
                👤 Admin
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fillDemoUser('aprobador@demo.com')}
                disabled={isLoading}
                className="text-xs"
              >
                ✅ Aprobador
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fillDemoUser('staff@demo.com')}
                disabled={isLoading}
                className="text-xs"
              >
                👔 Staff
              </Button>
            </div>
            <p className="text-xs text-gray-500 text-center mt-2">
              Contraseña para todos: <span className="font-mono font-semibold">demo123</span>
            </p>
          </div>

          <div className="space-y-2 text-xs text-gray-600 border-t pt-4">
            <p>✓ Gestión de eventos y asistentes</p>
            <p>✓ Códigos QR únicos y seguros</p>
            <p>✓ Validación biométrica facial</p>
            <p>✓ Aprobación de invitaciones</p>
            <p>✓ Check-in en tiempo real</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
