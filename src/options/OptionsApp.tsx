import { useEffect, useState } from 'react'
import { SettingsIcon, KeyIcon, PaletteIcon, MoonIcon, SunIcon, RefreshIcon, SaveIcon, ShieldIcon, CheckIcon } from '../components/Icons'
import { useTheme } from '../hooks/useTheme'
import Button from '../components/Button'
import Input from '../components/Input'
import { AVAILABLE_PROVIDERS, getProviderDisplayName } from '../config/providers'

export default function OptionsApp() {
  const [provider, setProvider] = useState('openai')
  const [token, setToken] = useState('')
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(false)
  const { theme, toggleTheme } = useTheme()

  // Load settings from storage
  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.get(['provider', 'token'], (res) => {
        if (res?.provider) setProvider(res.provider)
        if (res?.token) setToken(res.token)
      })
    }
  }, [])

  const handleSave = async () => {
    setLoading(true)
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.set({ provider, token }, () => {
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
        setLoading(false)
      })
    } else {
      // Dev mode
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
      setLoading(false)
    }
  }

  const handleReset = () => {
    if (confirm('Are you sure you want to reset all settings?')) {
      setProvider('openai')
      setToken('')
      if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.local.clear()
      }
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-4xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
                <SettingsIcon className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  Settings
                </h1>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Configure your AI assistant
                </p>
              </div>
            </div>
            
            <button
              onClick={toggleTheme}
              className="p-2.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
              title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
            >
              {theme === 'light' ? (
                <MoonIcon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              ) : (
                <SunIcon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-6 py-8">
        {/* Success Message */}
        {saved && (
          <div className="mb-6 p-4 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900 rounded-xl flex items-center gap-3">
            <CheckIcon className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0" />
            <div>
              <p className="font-semibold text-green-900 dark:text-green-100">Settings Saved!</p>
              <p className="text-sm text-green-700 dark:text-green-300">Your preferences have been updated successfully.</p>
            </div>
          </div>
        )}

        {/* Settings Grid */}
        <div className="space-y-6">
          {/* API Configuration Card */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800">
              <div className="flex items-center gap-3">
                <KeyIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    API Configuration
                  </h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Connect to your preferred AI provider
                  </p>
                </div>
              </div>
            </div>
            
            <div className="p-6 space-y-5">
              {/* Provider Selection */}
              <div>
                <label 
                  htmlFor="provider-select"
                  className="block text-sm font-semibold mb-2 text-gray-900 dark:text-gray-100"
                >
                  AI Provider
                </label>
                <select
                  id="provider-select"
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                  className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                >
                  {AVAILABLE_PROVIDERS.map((p) => (
                    <option key={p} value={p}>
                      {getProviderDisplayName(p)}
                    </option>
                  ))}
                </select>
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                  Select your AI model provider (OpenAI, Anthropic, etc.)
                </p>
              </div>

              {/* API Token Input */}
              <Input
                label="API Token"
                type="text"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="sk-..."
                helperText="Enter your API key from your provider's dashboard"
                fullWidth
                icon={<KeyIcon className="w-4 h-4" />}
              />

              <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-lg p-4">
                <div className="flex gap-3">
                  <ShieldIcon className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-blue-900 dark:text-blue-100">
                      Privacy & Security
                    </p>
                    <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                      Your API key is stored locally using chrome.storage.local and is never sent to any third-party servers. 
                      Only you have access to it.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Appearance Card */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800">
              <div className="flex items-center gap-3">
                <PaletteIcon className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    Appearance
                  </h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Customize the look and feel
                  </p>
                </div>
              </div>
            </div>
            
            <div className="p-6">
              <label className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-all">
                <div className="flex items-center gap-3">
                  {theme === 'dark' ? (
                    <MoonIcon className="w-5 h-5 text-gray-700 dark:text-gray-300" />
                  ) : (
                    <SunIcon className="w-5 h-5 text-gray-700 dark:text-gray-300" />
                  )}
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-gray-100">
                      Dark Mode
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {theme === 'dark' ? 'Currently enabled' : 'Currently disabled'}
                    </p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={theme === 'dark'}
                  onChange={toggleTheme}
                  className="w-5 h-5 rounded text-blue-600 focus:ring-2 focus:ring-blue-500"
                />
              </label>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <Button
              variant="primary"
              size="lg"
              onClick={handleSave}
              loading={loading}
              disabled={!token.trim()}
              fullWidth
              icon={<SaveIcon className="w-4 h-4" />}
            >
              Save Settings
            </Button>
            
            <Button
              variant="secondary"
              size="lg"
              onClick={handleReset}
              icon={<RefreshIcon className="w-4 h-4" />}
            >
              Reset
            </Button>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-12 pt-6 border-t border-gray-200 dark:border-gray-800">
          <div className="text-center text-sm text-gray-600 dark:text-gray-400">
            <p className="font-semibold mb-2">Extendy v1.0.0</p>
            <p>Your intelligent browser assistant powered by AI</p>
          </div>
        </div>
      </main>
    </div>
  )
}