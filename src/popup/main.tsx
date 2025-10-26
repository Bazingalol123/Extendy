import React from 'react'
import { createRoot } from 'react-dom/client'
import PopupApp from './popupApp'
import ErrorBoundary from '../components/ErrorBoundary'
import '../styles.css'


const rootEl = document.getElementById('root')!
const root = createRoot(rootEl)
root.render(
  <React.StrictMode>
    <ErrorBoundary fallbackTitle="Popup crashed">
      <PopupApp />
    </ErrorBoundary>
  </React.StrictMode>
)
console.info("[SMOKE] Popup mounted")
console.debug("[SMOKE] env", { mode: (typeof import.meta !== "undefined" ? (import.meta as any)?.env?.MODE : undefined) })