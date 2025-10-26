import React from 'react'
import ReactDOM from 'react-dom/client'
import OptionsApp from './OptionsApp'
import ErrorBoundary from '../components/ErrorBoundary'
import '../styles.css'

// Initialize theme immediately before React renders
const initializeTheme = () => {
  if (typeof chrome !== 'undefined' && chrome.storage) {
    chrome.storage.local.get(['theme'], (result) => {
      const theme = result.theme || 'light'
      document.documentElement.setAttribute('data-theme', theme)
      if (theme === 'dark') {
        document.documentElement.classList.add('dark')
        document.body.classList.add('dark')
      }
      console.log('🎨 [options/main] Theme initialized:', theme)
    })
  }
}

initializeTheme()

const root = document.getElementById('root')
if (root) {
  const rootApi = ReactDOM.createRoot(root)
  rootApi.render(
    <React.StrictMode>
      <ErrorBoundary fallbackTitle="Options crashed">
        <OptionsApp />
      </ErrorBoundary>
    </React.StrictMode>
  )
  console.info("[SMOKE] Options mounted")
  console.debug("[SMOKE] env", { mode: (typeof import.meta !== "undefined" ? (import.meta as any)?.env?.MODE : undefined) })
}