import { useEffect, useState } from 'react'
import { SettingsIcon, SparklesIcon, MoonIcon, SunIcon } from '../components/Icons'
import ChatBoxWithAI from '../components/ChatBoxWithAI'
import { useTheme } from '../hooks/useTheme'
import { DEFAULT_PROVIDER } from '../config/providers'

export default function PopupApp() {
  const [ready, setReady] = useState(false)
  const [settingsOk, setSettingsOk] = useState<boolean | null>(null)
  const [provider, setProvider] = useState(DEFAULT_PROVIDER)
  const { theme, toggleTheme } = useTheme()

  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.get(['provider', 'token'], (res) => {
        setSettingsOk(Boolean(res?.provider && res?.token))
        if (res?.provider) setProvider(res.provider)
        setReady(true)
      })
    } else {
      // fallback for dev mode
      console.warn('Chrome APIs unavailable — dev mode.')
      setSettingsOk(true)
      setReady(true)
    }
  }, [])

  const handleProviderChange = (p: string) => {
    setProvider(p)
    chrome.storage.local.set({ provider: p })
  }

  const openSettings = () => {
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.openOptionsPage()
    } else {
      window.open('/options.html', '_blank')
    }
  }

  if (!ready) {
    return (
      <div className="w-[400px] h-[600px] flex items-center justify-center bg-white dark:bg-gray-950">
        <div className="text-center">
          <div className="w-12 h-12 rounded-full bg-blue-600 animate-pulse mx-auto mb-3"></div>
          <p className="text-sm text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    )
  }

  if (!settingsOk) {
    return (
      <div className="w-[400px] h-[600px] flex flex-col items-center justify-center bg-white dark:bg-gray-950 p-8">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center mx-auto mb-2">
            <SparklesIcon className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Welcome to Extendy
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 max-w-sm">
            Please complete the setup by configuring your AI provider and API key
          </p>
          <button
            onClick={openSettings}
            className="mt-4 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-all active:scale-95 flex items-center gap-2 mx-auto"
          >
            <SettingsIcon className="w-4 h-4" />
            Open Settings
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="w-[400px] h-[600px] flex flex-col bg-white dark:bg-gray-950">
      {/* Header */}
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
          </div>
        </div>
      </header>

      {/* Chat Area */}
      <main className="flex-1 overflow-hidden">
        <ChatBoxWithAI 
          currentProvider={provider}
          onProviderChange={handleProviderChange}
        />
      </main>
    </div>
  )
}