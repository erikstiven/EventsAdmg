import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContextSimple';
import LoadingSpinner from '@/components/LoadingSpinner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Shield, User, LogIn } from 'lucide-react';

interface ProtectedAdminRouteProps {
  children: React.ReactNode;
}

const ProtectedAdminRoute: React.FC<ProtectedAdminRouteProps> = ({
  children,
}) => {
  const { user, isLoading, logout } = useAuth();
  const isAdmin = user?.role?.toUpperCase() === 'ADMIN';
  const location = useLocation();

  // Loading state
  if (isLoading) {
    return <LoadingSpinner message="Verificando permisos..." />;
  }

  // If the user is not logged in, redirect to the login page
  if (!user) {
    return <Navigate to="/" replace />;
  }

  // If the user is not an admin, show an insufficient-permissions page
  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md mx-4">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
              <Shield className="h-8 w-8 text-red-600" />
            </div>
            <CardTitle className="text-xl text-gray-900">
              Insufficient Permissions
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <div className="text-gray-600">
              <p className="mb-2">
                The account you are using does not have administrator rights.
              </p>
              <div className="bg-gray-100 rounded-lg p-3 mb-4">
                <div className="flex items-center justify-center space-x-2 text-sm">
                  <User className="h-4 w-4 text-gray-500" />
                  <span className="text-gray-700">
                    Current account: {user.email}
                  </span>
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  Role: {user.role === 'user' ? 'Regular user' : user.role}
                </div>
              </div>
              <p className="text-sm">
                Please log in with an account that has administrator rights.
              </p>
            </div>

            <div className="space-y-3">
              <Button onClick={() => logout()} className="w-full" variant="outline">
                <LogIn className="h-4 w-4 mr-2" />
                Switch account
              </Button>

              <Button
                onClick={() => window.history.back()}
                className="w-full"
                variant="ghost"
              >
                Go back
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // If the user is an admin, render the child components
  return <>{children}</>;
};

export default ProtectedAdminRoute;
