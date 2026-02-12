import React, { createContext, useContext, useState, useEffect } from 'react';
import { client } from '@/lib/api';

interface User {
  id: string;
  email: string;
  name?: string;
}

interface UserRole {
  user_id: string;
  role: string;
  email: string;
}

interface AuthContextType {
  user: User | null;
  userRole: UserRole | null;
  loading: boolean;
  logout: () => Promise<void>;
  refreshRole: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);

  const checkAuth = async () => {
    try {
      const userData = await client.auth.me();
      setUser(userData.data);
      
      // Get user role with retry logic
      await refreshRole();
    } catch (error) {
      console.error('Auth check failed:', error);
      setUser(null);
      setUserRole(null);
    } finally {
      setLoading(false);
    }
  };

  const refreshRole = async () => {
    try {
      const response = await client.apiCall.invoke({
        url: '/api/v1/auth/me/role',
        method: 'GET',
      });
      setUserRole(response.data);
    } catch (error: any) {
      console.error('Role refresh failed:', error);
      
      // If role not found (404), the backend will auto-assign ADMIN
      // Retry once after a short delay
      if (error?.status === 404 || error?.response?.status === 404) {
        console.log('Role not found, backend should auto-assign. Retrying...');
        await new Promise(resolve => setTimeout(resolve, 1000));
        try {
          const retryResponse = await client.apiCall.invoke({
            url: '/api/v1/auth/me/role',
            method: 'GET',
          });
          setUserRole(retryResponse.data);
        } catch (retryError) {
          console.error('Retry failed:', retryError);
          // Set default ADMIN role as fallback
          if (user) {
            setUserRole({
              user_id: user.id,
              role: 'ADMIN',
              email: user.email,
            });
          }
        }
      }
    }
  };

  const logout = async () => {
    await client.auth.logout();
    setUser(null);
    setUserRole(null);
    window.location.href = '/';
  };

  useEffect(() => {
    checkAuth();
  }, []);

  return (
    <AuthContext.Provider value={{ user, userRole, loading, logout, refreshRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}