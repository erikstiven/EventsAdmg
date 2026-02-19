import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContextSimple';
import { Layout } from '@/components/Layout';
import LoadingSpinner from '@/components/LoadingSpinner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Calendar,
  Users,
  QrCode,
  CheckCircle,
  ScanLine,
  UserCheck,
  Settings,
  Mail,
  ClipboardList,
  UserCog,
  ShieldCheck,
} from 'lucide-react';

export default function Dashboard() {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && !user) {
      navigate('/login');
    }
  }, [user, isLoading, navigate]);

  if (isLoading) {
    return <LoadingSpinner message="Cargando panel..." />;
  }

  const userPermissions = new Set((user?.permissions || []).map((p) => p.toLowerCase()));
  const can = (perm: string) => userPermissions.has(perm.toLowerCase());

  const getMenuItems = () => {
    const role = (user?.role || '').toUpperCase();
    const items = [];

    if (can('events.read')) {
      items.push(
        {
          title: 'Eventos',
          description: 'Crear, editar y gestionar eventos',
          icon: Calendar,
          path: '/admin/events',
          color: 'bg-blue-500',
        },
      );
    }
    if (can('attendees.read')) {
      items.push(
        {
          title: 'Asistentes',
          description: 'Administrar asistentes del sistema',
          icon: Users,
          path: '/admin/attendees',
          color: 'bg-teal-500',
        },
      );
    }
    if (can('invitations.read')) {
      items.push(
        {
          title: 'Invitaciones',
          description: 'Gestionar invitaciones por grupo',
          icon: QrCode,
          path: '/admin/invitations-quota',
          color: 'bg-teal-500',
        },
      );
    }
    if (can('staff.read')) {
      items.push(
        {
          title: 'Personal operativo',
          description: 'Crear y administrar staff y aprobadores',
          icon: UserCog,
          path: '/admin/staff-users',
          color: 'bg-cyan-600',
        },
      );
      items.push(
        {
          title: 'Roles y permisos',
          description: 'Configurar acceso por rol a módulos y acciones',
          icon: ShieldCheck,
          path: '/admin/roles-permissions',
          color: 'bg-sky-700',
        },
      );
    }
    if (role === 'ADMIN') {
      items.push(
        {
          title: 'Configuración del sistema',
          description: 'Configurar biometría, envío y plantillas de correo',
          icon: Mail,
          path: '/admin/email-settings',
          color: 'bg-indigo-500',
        },
      );
    }
    if (can('audit.read')) {
      items.push(
        {
          title: 'Auditoría',
          description: 'Consultar historial de ingresos y cambios',
          icon: ClipboardList,
          path: '/admin/auditoria',
          color: 'bg-slate-600',
        },
      );
    }
    if (can('approvals.read')) {
      items.push(
        {
          title: 'Aprobaciones',
          description: 'Revisar registros y aprobar solicitudes',
          icon: CheckCircle,
          path: '/approver/pending',
          color: 'bg-amber-600',
        },
      );
    }
    if (can('checkin.scan')) {
      items.push(
        {
          title: 'Control de acceso',
          description: 'Escanear QR y registrar ingresos',
          icon: ScanLine,
          path: '/staff/checkin',
          color: 'bg-rose-500',
        },
      );
    }

    if (role === 'ASISTENTE') {
      items.push(
        {
          title: 'Mis Invitaciones',
          description: 'Ver y activar invitaciones',
          icon: UserCheck,
          path: '/attendee/invitations',
          color: 'bg-indigo-500',
        },
      );
    }

    if (items.length > 0) return items;

    switch (role) {
      case 'ADMIN':
        return [
          {
            title: 'Eventos',
            description: 'Crear, editar y gestionar eventos',
            icon: Calendar,
            path: '/admin/events',
            color: 'bg-blue-500',
          },
          {
            title: 'Asistentes',
            description: 'Administrar asistentes del sistema',
            icon: Users,
            path: '/admin/attendees',
            color: 'bg-teal-500',
          },
          {
            title: 'Invitaciones',
            description: 'Gestionar invitaciones por grupo',
            icon: QrCode,
            path: '/admin/invitations-quota',
            color: 'bg-teal-500',
          },
          {
            title: 'Personal operativo',
            description: 'Crear y administrar staff y aprobadores',
            icon: UserCog,
            path: '/admin/staff-users',
            color: 'bg-cyan-600',
          },
          {
            title: 'Roles y permisos',
            description: 'Configurar acceso por rol a módulos y acciones',
            icon: ShieldCheck,
            path: '/admin/roles-permissions',
            color: 'bg-sky-700',
          },
          {
            title: 'Configuración del sistema',
            description: 'Configurar biometría, envío y plantillas de correo',
            icon: Mail,
            path: '/admin/email-settings',
            color: 'bg-indigo-500',
          },
          {
            title: 'Auditoría',
            description: 'Consultar historial de ingresos y cambios',
            icon: ClipboardList,
            path: '/admin/auditoria',
            color: 'bg-slate-600',
          },
        ];
      case 'ASISTENTE':
        return [
          {
            title: 'Mis Invitaciones',
            description: 'Ver y activar invitaciones',
            icon: UserCheck,
            path: '/attendee/invitations',
            color: 'bg-indigo-500',
          },
        ];
      default:
        return [];
    }
  };

  const menuItems = getMenuItems();

  return (
    <Layout>
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-bold mb-2">Panel principal</h1>
              <p className="text-gray-600">
                Bienvenido, {user?.email} ({user?.role || 'Sin rol asignado'})
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/role-selector')}
            >
              <Settings className="h-4 w-4 mr-2" />
              Cambiar perfil
            </Button>
          </div>
        </div>

        {menuItems.length === 0 && (
          <Card className="mb-6">
            <CardContent className="py-12 text-center">
              <p className="text-gray-600 mb-4">
                No tienes un rol asignado o tu rol no tiene módulos disponibles.
              </p>
              <Button onClick={() => navigate('/role-selector')}>
                Seleccionar Rol
              </Button>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {menuItems.map((item) => (
            <Card
              key={item.path}
              className="cursor-pointer hover:shadow-lg transition-shadow"
              onClick={() => navigate(item.path)}
            >
              <CardHeader>
                <div className="flex items-center gap-4">
                  <div className={`${item.color} p-3 rounded-lg text-white`}>
                    <item.icon className="h-6 w-6" />
                  </div>
                  <div>
                    <CardTitle>{item.title}</CardTitle>
                    <CardDescription>{item.description}</CardDescription>
                  </div>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>
    </Layout>
  );
}
