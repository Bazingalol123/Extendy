import React from 'react'
import ReactDOM from 'react-dom/client'
import OptionsApp from './OptionsApp'
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
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <OptionsApp />
    </React.StrictMode>
  )
}