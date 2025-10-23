import { useState, useEffect } from 'react'
import { SettingsIcon, MoonIcon, SunIcon } from '../components/Icons'
import ChatBoxWithAI from '../components/ChatBoxWithAI'
import { useTheme } from '../hooks/useTheme'
import { DEFAULT_PROVIDER } from '../config/providers'

export default function SidebarApp() {
  const [provider, setProvider] = useState(DEFAULT_PROVIDER)
  const { theme, toggleTheme } = useTheme()

  useEffect(() => {
    chrome.storage.local.get(['provider'], (res) => {
      if (res?.provider) setProvider(res.provider)
    })
  }, [])

  const handleProviderChange = (p: string) => {
    setProvider(p)
    chrome.storage.local.set({ provider: p })
  }

    useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  const openSettings = () => {
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.openOptionsPage()
    } else {
      // Dev mode fallback
      window.open('/options.html', '_blank')
    }
  }

  return (
    <div className="h-screen w-full flex flex-col bg-white dark:bg-gray-950">
      {/* MINIMAL HEADER */}
      <header className="flex-shrink-0 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-lg flex-shrink-0">
              🤖
            </div>
            <span className="text-base font-semibold text-gray-900 dark:text-gray-100">Extendy</span>
          </div>
          
          <div className="flex items-center gap-1">
            <button
              onClick={toggleTheme}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
              title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
            >
              {theme === 'light' ? (
                <MoonIcon className="w-4 h-4 text-gray-600 dark:text-gray-400" />
              ) : (
                <SunIcon className="w-4 h-4 text-gray-600 dark:text-gray-400" />
              )}
            </button>
            <button
              onClick={openSettings}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
              title="Open Settings"
            >
              <SettingsIcon className="w-4 h-4 text-gray-600 dark:text-gray-400" />
            </button>
            <div className="bg-blue-500 text-white p-4">
  If this is blue with white text, Tailwind works!
</div>
          </div>
        </div>
      </header>

      {/* MAIN CHAT AREA - Full Height */}
      <main className="flex-1 overflow-hidden">
        <ChatBoxWithAI 
          currentProvider={provider}
          onProviderChange={handleProviderChange}
        />
      </main>
    </div>
  )
}
