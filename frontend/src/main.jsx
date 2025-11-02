import React from 'react'
import { createRoot } from 'react-dom/client'
import * as Mantine from '@mantine/core'
import { Notifications, notifications } from '@mantine/notifications'
import '@mantine/core/styles.css'
import '@mantine/notifications/styles.css'

const mantineTheme = {
  colorScheme: 'light',
  primaryColor: 'blue',
  fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial",
  headings: { fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial" },
}
import App from './App'
import './styles.css'

// Global error capture to surface stack traces for debugging issues like TDZ/cyclic-imports
if (typeof window !== 'undefined') {
  window.addEventListener('error', (ev) => {
    const msg = ev?.error?.stack || ev?.message || String(ev)
    // eslint-disable-next-line no-console
    console.error('[global-error]', msg)
    try { notifications.show({ title: 'Runtime error', message: msg?.slice?.(0, 400) || String(msg), color: 'red' }) } catch (_) {}
  })
  window.addEventListener('unhandledrejection', (ev) => {
    const reason = ev?.reason
    const msg = (reason && (reason.stack || reason.message)) || String(reason)
    // eslint-disable-next-line no-console
    console.error('[unhandled-rejection]', msg)
    try { notifications.show({ title: 'Unhandled promise rejection', message: msg?.slice?.(0, 400) || String(msg), color: 'red' }) } catch (_) {}
  })
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Mantine.MantineProvider withGlobalStyles withNormalizeCSS theme={mantineTheme}>
      <App />
      <Notifications />
    </Mantine.MantineProvider>
  </React.StrictMode>
)
