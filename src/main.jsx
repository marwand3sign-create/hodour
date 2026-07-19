import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

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
