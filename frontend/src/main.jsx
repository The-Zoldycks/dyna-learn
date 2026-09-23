import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { Toaster, toast } from 'sonner'

// Surface async failures that escape component error boundaries
if (typeof window !== "undefined") {
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
