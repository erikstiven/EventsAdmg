import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContextSimple';
import { useAuth } from './contexts/AuthContextSimple';
import { Toaster } from '@/components/ui/toaster';

// Pages
import LoginSimple from './pages/LoginSimple';
import Dashboard from './pages/Dashboard';
import RoleSelector from './pages/RoleSelector';

// Admin pages
import Events from './pages/admin/Events';
import Attendees2 from './pages/admin/Attendees2';
import InvitationsByQuota from './pages/admin/InvitationsByQuota';
import EmailSettings from './pages/admin/EmailSettings';
import Auditoria from './pages/admin/Auditoria';
import StaffUsers from './pages/admin/StaffUsers';
import RolesPermissions from './pages/admin/RolesPermissions';
import InvitationEmailMock from './pages/public/InvitationEmailMock';
import RegistrationLandingMock from './pages/public/RegistrationLandingMock';
import RegistrationLanding from './pages/public/RegistrationLanding';

// Approver pages
import PendingApprovals2 from './pages/approver/PendingApprovals2';

// Staff pages
import CheckIn2 from './pages/staff/CheckIn2';

// Attendee pages
import MyInvitations from './pages/attendee/MyInvitations';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Cargando...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function normalizeRole(role?: string) {
  const value = (role || '').toUpperCase();
  if (value === 'APPROVER') return 'APROBADOR';
  if (value === 'ATTENDEE') return 'ASISTENTE';
  return value;
}

function hasAnyPermission(userPermissions: string[] | undefined, expected: string[]) {
  const owned = new Set((userPermissions || []).map((p) => p.trim().toLowerCase()));
  return expected.some((p) => owned.has(p.toLowerCase()));
}

function RoleRoute({
  children,
  allowedRoles,
  requiredPermissions,
}: {
  children: React.ReactNode;
  allowedRoles: string[];
  requiredPermissions?: string[];
}) {
  const { user, isLoading, isAuthenticated } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Cargando...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (user?.is_superuser) return <>{children}</>;

  const role = normalizeRole(user?.role);
  if (requiredPermissions?.length) {
    if (!hasAnyPermission(user?.permissions, requiredPermissions)) {
      return <Navigate to="/" replace />;
    }
  } else if (!allowedRoles.includes(role)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  const { isAuthenticated } = useAuth();

  return (
    <Routes>
      <Route path="/demo/invitacion-email" element={<InvitationEmailMock />} />
      <Route path="/demo/registro-landing" element={<RegistrationLandingMock />} />
      <Route path="/registro/:token" element={<RegistrationLanding />} />
      <Route
        path="/login"
        element={isAuthenticated ? <Navigate to="/" replace /> : <LoginSimple />}
      />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/role-selector"
        element={
          <ProtectedRoute>
            <RoleSelector />
          </ProtectedRoute>
        }
      />
      
      {/* Admin routes */}
      <Route
        path="/admin/events"
        element={
          <RoleRoute allowedRoles={['ADMIN']} requiredPermissions={['events.read']}>
            <Events />
          </RoleRoute>
        }
      />
      <Route
        path="/admin/attendees"
        element={
          <ProtectedRoute>
            <Navigate to="/admin/attendees2" replace />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/attendees2"
        element={
          <RoleRoute allowedRoles={['ADMIN']} requiredPermissions={['attendees.read']}>
            <Attendees2 />
          </RoleRoute>
        }
      />
      <Route
        path="/admin/invitations"
        element={
          <ProtectedRoute>
            <Navigate to="/admin/invitations-quota" replace />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/invitations-quota"
        element={
          <RoleRoute allowedRoles={['ADMIN']} requiredPermissions={['invitations.read']}>
            <InvitationsByQuota />
          </RoleRoute>
        }
      />
      <Route
        path="/admin/staff-users"
        element={
          <RoleRoute allowedRoles={['ADMIN']} requiredPermissions={['staff.read']}>
            <StaffUsers />
          </RoleRoute>
        }
      />
      <Route
        path="/admin/roles-permissions"
        element={
          <RoleRoute allowedRoles={['ADMIN']} requiredPermissions={['staff.read']}>
            <RolesPermissions />
          </RoleRoute>
        }
      />
      <Route
        path="/admin/email-settings"
        element={
          <RoleRoute allowedRoles={['ADMIN']}>
            <EmailSettings />
          </RoleRoute>
        }
      />
      <Route
        path="/admin/auditoria"
        element={
          <RoleRoute allowedRoles={['ADMIN']} requiredPermissions={['audit.read']}>
            <Auditoria />
          </RoleRoute>
        }
      />
      
      {/* Approver routes */}
      <Route
        path="/approver/pending"
        element={
          <RoleRoute allowedRoles={['APROBADOR']} requiredPermissions={['approvals.read']}>
            <PendingApprovals2 />
          </RoleRoute>
        }
      />
      <Route
        path="/approver/pending2"
        element={
          <Navigate to="/approver/pending" replace />
        }
      />
      
      {/* Staff routes */}
      <Route
        path="/staff/checkin"
        element={
          <RoleRoute allowedRoles={['STAFF']} requiredPermissions={['checkin.scan']}>
            <CheckIn2 />
          </RoleRoute>
        }
      />
      <Route
        path="/staff/checkin2"
        element={
          <Navigate to="/staff/checkin" replace />
        }
      />
      
      {/* Attendee routes */}
      <Route
        path="/attendee/invitations"
        element={
          <RoleRoute allowedRoles={['ASISTENTE']}>
            <MyInvitations />
          </RoleRoute>
        }
      />
    </Routes>
  );
}

function App() {
  return (
    <Router>
      <AuthProvider>
        <AppRoutes />
        <Toaster />
      </AuthProvider>
    </Router>
  );
}

export default App;
