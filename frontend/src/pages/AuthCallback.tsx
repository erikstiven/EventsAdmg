import { useEffect } from 'react';
import { client } from '@/lib/api';

export default function AuthCallback() {
  useEffect(() => {
    client.auth.login().then(() => {
      window.location.href = '/';
    });
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-4 text-gray-600">Autenticando...</p>
      </div>
    </div>
  );
}