import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { Toaster } from 'sonner'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
    <Toaster position="bottom-right" richColors closeButton expand={false} theme="light" toastOptions={{ duration: 3500 }} style={{ zIndex: 100 }} />
  </StrictMode>,
);

// Register PWA Service Worker in production
if ('serviceWorker' in navigator && !window.location.hostname.includes('localhost')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
