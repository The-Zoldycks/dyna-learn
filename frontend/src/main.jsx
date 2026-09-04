import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { Toaster } from 'sonner'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
    <Toaster position="bottom-right" richColors closeButton expand={false} theme="light" toastOptions={{ duration: 3500 }} style={{ zIndex: 100 }} />
  </StrictMode>,
)
