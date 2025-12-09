import React from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster, toast } from 'sonner'
import './styles.css'
import App from './App'

// Global error capture to surface stack traces for debugging issues like TDZ/cyclic-imports
if (typeof window !== 'undefined') {
  window.addEventListener('error', (ev) => {
    const msg = ev?.error?.stack || ev?.message || String(ev)
    // eslint-disable-next-line no-console
    console.error('[global-error]', msg)
    try {
      toast.error('Runtime error', {
        description: msg?.slice?.(0, 400) || String(msg)
      })
    } catch (_) { }
  })
  window.addEventListener('unhandledrejection', (ev) => {
    const reason = ev?.reason
    const msg = (reason && (reason.stack || reason.message)) || String(reason)
    // eslint-disable-next-line no-console
    console.error('[unhandled-rejection]', msg)
    try {
      toast.error('Unhandled promise rejection', {
        description: msg?.slice?.(0, 400) || String(msg)
      })
    } catch (_) { }
  })
}

// Add dark class to html element for ShadCN dark mode
if (typeof document !== 'undefined') {
  document.documentElement.classList.add('dark')
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
    <Toaster richColors position="top-right" />
  </React.StrictMode>
)
