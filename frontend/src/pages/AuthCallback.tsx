import { useEffect } from 'react';
import { client } from '@/lib/api';
import LoadingSpinner from '@/components/LoadingSpinner';

export default function AuthCallback() {
  useEffect(() => {
    client.auth.login().then(() => {
      window.location.href = '/';
    });
  }, []);

  return (
    <LoadingSpinner message="Autenticando..." />
  );
}
