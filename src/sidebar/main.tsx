import React from 'react'
import { createRoot } from 'react-dom/client'
import SidebarApp from './SidebarApp'
import '../styles.css'

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SidebarApp />
  </React.StrictMode>
)