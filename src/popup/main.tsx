import React from 'react'
import { createRoot } from 'react-dom/client'
import PopupApp from './popupApp'
import '../styles.css'


createRoot(document.getElementById('root')!).render(
<React.StrictMode>
<PopupApp />
</React.StrictMode>
)