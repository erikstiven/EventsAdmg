import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Render the app immediately without waiting for config
createRoot(document.getElementById('root')!).render(<App />);

// Deshabilitamos SW en desarrollo y limpiamos cualquier registro/caché previo
if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister()));
  if ('caches' in window) {
    caches.keys().then((keys) => keys.forEach((k) => caches.delete(k)));
  }
}

// Si en producción se requiere PWA, reactivar este bloque:
// if (import.meta.env.PROD && 'serviceWorker' in navigator) {
//   window.addEventListener('load', () => {
//     navigator.serviceWorker
//       .register('/sw.js')
//       .then((registration) => console.log('SW registered:', registration))
//       .catch((error) => console.log('SW registration failed:', error));
//   });
// }
