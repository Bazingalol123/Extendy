import React from 'react'
import ReactDOM from 'react-dom/client'
import SidebarApp from './SidebarApp'
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
      console.log('🎨 [sidebar/main] Theme initialized:', theme)
    })
  }
}

initializeTheme()

const root = document.getElementById('root')
if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <SidebarApp />
    </React.StrictMode>
  )
}