import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { Toaster, toast } from 'sonner'
import { registerSW } from 'virtual:pwa-register'

// autoUpdate installs silently — tell the user a new version is ready so
// they reload deliberately instead of running stale mid-lesson.
if (typeof window !== "undefined" && !window.__dyna_pwa__) {
  window.__dyna_pwa__ = true;
  try {
    registerSW({
      onOfflineReady() {},
      onNeedRefresh() {
        toast.info("A new version is available", {
          description: "Reload to get the latest fixes. Your canvas is saved locally.",
          duration: Infinity,
          action: { label: "Reload", onClick: () => window.location.reload() },
        });
      },
    });
  } catch {}
}

// Surface async failures that escape component error boundaries.
// Guarded so HMR re-evaluation doesn't stack duplicate listeners.
if (typeof window !== "undefined" && !window.__dyna_rejection_handler__) {
  window.__dyna_rejection_handler__ = true;
  window.addEventListener("unhandledrejection", (e) => {
    const reason = e.reason;
    if (reason?.name === "AbortError" || reason?.name === "TimeoutError") return;
    console.error("Unhandled rejection:", reason);
    try {
      toast.error("Something went wrong", {
        description: reason?.message?.slice(0, 160) || "An unexpected background error occurred.",
        duration: 5000,
      });
    } catch {}
  });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
    <Toaster position="bottom-right" richColors closeButton expand={false} theme="light" toastOptions={{ duration: 3500 }} style={{ zIndex: 120 }} />
  </StrictMode>,
);
