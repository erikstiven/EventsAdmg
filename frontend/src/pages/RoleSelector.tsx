import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContextSimple';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { authSimple } from '@/lib/auth-simple';
import { Shield, UserCog, Users, ScanLine, User } from 'lucide-react';

const roles = [
  {
    value: 'ADMIN',
    label: 'Administrador',
    description: 'Gestión completa del sistema',
    icon: Shield,
    color: 'bg-blue-500',
  },
  {
    value: 'APROBADOR',
    label: 'Aprobador',
    description: 'Aprobar invitaciones',
    icon: UserCog,
    color: 'bg-orange-500',
  },
  {
    value: 'STAFF',
    label: 'Personal de Puerta',
    description: 'Check-in de asistentes',
    icon: ScanLine,
    color: 'bg-red-500',
  },
  {
    value: 'ASISTENTE',
    label: 'Asistente',
    description: 'Ver mis invitaciones',
    icon: User,
    color: 'bg-indigo-500',
  },
];

export default function RoleSelector() {
  const { user, refreshUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleSelectRole = async (role: string) => {
    setLoading(true);
    try {
      await authSimple.fetch('/api/v1/auth/assign-role?role=' + role, {
        method: 'POST',
      });

      toast({
        title: 'Rol Actualizado',
        description: `Tu rol ha sido cambiado a ${role}`,
      });

      await refreshUser();
      navigate('/');
    } catch (error: any) {
      const detail = error?.data?.detail
        || error?.response?.data?.detail
        || error.message
        || 'No se pudo cambiar el rol';

      // Handle validation errors array
      let errorMessage = detail;
      if (Array.isArray(detail)) {
        errorMessage = detail.map((err: any) => err.msg || JSON.stringify(err)).join(', ');
      } else if (typeof detail === 'object') {
        errorMessage = JSON.stringify(detail);
      }

      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-4xl">
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-3xl">Seleccionar Rol</CardTitle>
            <CardDescription>
              {user?.role ? `Rol actual: ${user.role}` : 'Elige tu rol para continuar'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {roles.map((role) => {
                const Icon = role.icon;
                const isCurrentRole = user?.role === role.value;

                return (
                  <Card
                    key={role.value}
                    className={`cursor-pointer hover:shadow-lg transition-all ${isCurrentRole ? 'ring-2 ring-blue-600' : ''
                      }`}
                    onClick={() => !loading && handleSelectRole(role.value)}
                  >
                    <CardHeader>
                      <div className="flex items-center gap-4">
                        <div className={`${role.color} p-3 rounded-lg text-white`}>
                          <Icon className="h-6 w-6" />
                        </div>
                        <div className="flex-1">
                          <CardTitle className="text-lg">{role.label}</CardTitle>
                          <CardDescription className="text-sm">
                            {role.description}
                          </CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    {isCurrentRole && (
                      <CardContent>
                        <div className="bg-blue-50 text-blue-700 px-3 py-2 rounded text-sm text-center">
                          ✓ Rol Actual
                        </div>
                      </CardContent>
                    )}
                  </Card>
                );
              })}
            </div>

            <div className="mt-6 text-center">
              <Button
                variant="outline"
                onClick={() => navigate('/')}
                disabled={loading}
              >
                Ir al Dashboard
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}