import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import '@fontsource/cairo/arabic-400.css'
import '@fontsource/cairo/arabic-500.css'
import '@fontsource/cairo/arabic-600.css'
import '@fontsource/cairo/arabic-700.css'
import '@fontsource/cairo/arabic-800.css'
import '@fontsource/cairo/latin-400.css'
import '@fontsource/cairo/latin-500.css'
import '@fontsource/cairo/latin-600.css'
import '@fontsource/cairo/latin-700.css'
import '@fontsource/cairo/latin-800.css'
import '@fontsource/tajawal/arabic-400.css'
import '@fontsource/tajawal/arabic-500.css'
import '@fontsource/tajawal/arabic-700.css'
import '@fontsource/tajawal/latin-400.css'
import '@fontsource/tajawal/latin-500.css'
import '@fontsource/tajawal/latin-700.css'
import '@fontsource/orbitron/latin-500.css'
import '@fontsource/orbitron/latin-600.css'
import '@fontsource/orbitron/latin-700.css'
import { registerSW } from 'virtual:pwa-register'

// Service worker: caches the app so it opens with no internet.
registerSW({ immediate: true })

/*
 * Whacka platform bootstrap (stub).
 *
 * On Whacka, this entry point also wires up the user session, the authentication
 * bridge, the Supabase realtime token, the install prompt and theme-color
 * syncing — all powered by the Whacka runtime. That bootstrap is part of the
 * platform, not your app, so it is omitted from this export.
 *
 * Your application code lives in App.jsx and the components, pages and hooks it
 * imports. See README.md.
 */

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
