import { useEffect, useState } from 'react'
import { SettingsIcon, KeyIcon, PaletteIcon, MoonIcon, SunIcon, RefreshIcon, SaveIcon, ShieldIcon, CheckIcon } from '../components/Icons'
import { useTheme } from '../hooks/useTheme'
import Button from '../components/Button'
import Input from '../components/Input'
import { getProviderDisplayName } from '../config/providers'
import ProjectToolbar from '../components/ProjectToolbar'
import FileExplorer from '../components/FileExplorer'
import CodeEditor from '../components/CodeEditor'

import PreviewRunner from '../components/PreviewRunner'
import {
  getActiveProvider,
  setActiveProvider,
  getApiKey,
  setApiKey,
  type ProviderId
} from '../providers/aiProvider'

export default function OptionsApp() {
  const [provider, setProvider] = useState<ProviderId>('openai')
  const [openaiKey, setOpenaiKey] = useState('')
  const [anthropicKey, setAnthropicKey] = useState('')
  const [showOpenAI, setShowOpenAI] = useState(false)
  const [showAnthropic, setShowAnthropic] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(false)
  const { theme, toggleTheme } = useTheme()

  // Track initial values to detect changes
  const [initial, setInitial] = useState<{ provider: ProviderId; openaiKey: string; anthropicKey: string }>({
    provider: 'openai',
    openaiKey: '',
    anthropicKey: ''
  })
  const dirty = provider !== initial.provider || openaiKey !== initial.openaiKey || anthropicKey !== initial.anthropicKey
  const activeKey = provider === 'anthropic' ? anthropicKey : openaiKey
  const isValid = activeKey.trim().length > 0

  // Load settings from provider layer storage
  useEffect(() => {
    (async () => {
      try {
        const p = await getActiveProvider()
        const ok = (await getApiKey('openai')) ?? ''
        const ak = (await getApiKey('anthropic')) ?? ''
        setProvider(p)
        setOpenaiKey(ok)
        setAnthropicKey(ak)
        setInitial({ provider: p, openaiKey: ok, anthropicKey: ak })
      } catch {
        // ignore - keep defaults
      }
    })()
  }, [])

  const handleSave = async () => {
    setLoading(true)
    try {
      await setActiveProvider(provider)
      await setApiKey('openai', openaiKey || '')
      await setApiKey('anthropic', anthropicKey || '')
      setInitial({ provider, openaiKey, anthropicKey })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch {
      // keep UI minimal on error
    } finally {
      setLoading(false)
    }
  }

  const handleReset = async () => {
    if (confirm('Are you sure you want to reset all settings?')) {
      const nextProvider: ProviderId = 'openai'
      setProvider(nextProvider)
      setOpenaiKey('')
      setAnthropicKey('')
      setInitial({ provider: nextProvider, openaiKey: '', anthropicKey: '' })
      try {
        await setActiveProvider(nextProvider)
        await setApiKey('openai', '')
        await setApiKey('anthropic', '')
      } catch {
        // ignore
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
        <div className="mb-6">
          <ProjectToolbar />
        </div>

        {/* Project Workspace: File Explorer + Code Editor */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <div className="h-[420px]">
            <FileExplorer />
          </div>
          <div className="h-[420px]">
            <CodeEditor />
          </div>
        </div>

        {/* Live Preview Runner */}
        <div className="h-[420px] mb-10">
          <PreviewRunner />
        </div>
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
                  onChange={(e) => {
                    const v = e.target.value as ProviderId
                    if (v === 'openai' || v === 'anthropic') setProvider(v)
                  }}
                  className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                >
                  <option value="openai">{getProviderDisplayName('openai')}</option>
                  <option value="anthropic">{getProviderDisplayName('anthropic')}</option>
                </select>
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                  Select your AI model provider (OpenAI, Anthropic, etc.)
                </p>
              </div>

              {/* Provider API Keys */}
              <div className="space-y-4">
                {/* OpenAI */}
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <Input
                      label="OpenAI API Key"
                      type={showOpenAI ? 'text' : 'password'}
                      value={openaiKey}
                      onChange={(e) => setOpenaiKey(e.target.value)}
                      placeholder="sk-..."
                      helperText="Used when OpenAI is the active provider"
                      fullWidth
                      icon={<KeyIcon className="w-4 h-4" />}
                    />
                  </div>
                  <Button size="sm" onClick={() => setShowOpenAI(s => !s)}>
                    {showOpenAI ? 'Hide' : 'Show'}
                  </Button>
                </div>

                {/* Anthropic */}
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <Input
                      label="Anthropic API Key"
                      type={showAnthropic ? 'text' : 'password'}
                      value={anthropicKey}
                      onChange={(e) => setAnthropicKey(e.target.value)}
                      placeholder="anthropic-key-..."
                      helperText="Used when Anthropic is the active provider"
                      fullWidth
                      icon={<KeyIcon className="w-4 h-4" />}
                    />
                  </div>
                  <Button size="sm" onClick={() => setShowAnthropic(s => !s)}>
                    {showAnthropic ? 'Hide' : 'Show'}
                  </Button>
                </div>
              </div>

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
              disabled={!dirty || !isValid}
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