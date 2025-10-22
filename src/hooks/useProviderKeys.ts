import { useState, useEffect, useCallback } from 'react'
import { 
  ProviderKeys, 
  getProviderKeys, 
  saveProviderKeys,
  migrateStorage
} from '../utils/storage'

/**
 * Hook for managing provider API keys
 * Handles loading, updating, and saving all provider keys
 * 
 * @returns Object containing keys, loading state, and update functions
 * 
 * @example
 * ```tsx
 * const { keys, updateKey, saveAll, loading } = useProviderKeys()
 * 
 * // Update a single key
 * updateKey('openai', 'sk-...')
 * 
 * // Save all keys to storage
 * await saveAll()
 * ```
 */
export function useProviderKeys() {
  const [keys, setKeys] = useState<ProviderKeys>({
    googleGemini: '',
    openai: '',
    anthropic: '',
    ollama: '',
    perplexity: ''
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  /**
   * Load provider keys from storage on mount
   */
  useEffect(() => {
    const loadKeys = async () => {
      try {
        setLoading(true)
        setError(null)
        
        // Run migration first to ensure compatibility
        await migrateStorage()
        
        // Load keys from storage
        const storedKeys = await getProviderKeys()
        setKeys(storedKeys)
      } catch (err) {
        console.error('Error loading provider keys:', err)
        setError('Failed to load provider keys')
      } finally {
        setLoading(false)
      }
    }

    loadKeys()
  }, [])

  /**
   * Update a single provider key in local state
   * Does not persist to storage until saveAll() is called
   * 
   * @param provider - Provider name (e.g., 'openai', 'anthropic')
   * @param value - API key value
   */
  const updateKey = useCallback((provider: keyof ProviderKeys, value: string) => {
    setKeys(prev => ({
      ...prev,
      [provider]: value
    }))
  }, [])

  /**
   * Save all provider keys to chrome.storage.local
   * 
   * @returns Promise that resolves when save is complete
   * @throws Error if save fails
   */
  const saveAll = useCallback(async (): Promise<void> => {
    try {
      setError(null)
      await saveProviderKeys(keys)
    } catch (err) {
      console.error('Error saving provider keys:', err)
      setError('Failed to save provider keys')
      throw err
    }
  }, [keys])

  /**
   * Reset all keys to empty strings
   * Does not persist until saveAll() is called
   */
  const resetAll = useCallback(() => {
    setKeys({
      googleGemini: '',
      openai: '',
      anthropic: '',
      ollama: '',
      perplexity: ''
    })
  }, [])

  /**
   * Check if a specific provider has a key configured
   * 
   * @param provider - Provider name to check
   * @returns Boolean indicating if key exists
   */
  const hasKey = useCallback((provider: keyof ProviderKeys): boolean => {
    return Boolean(keys[provider] && keys[provider].trim().length > 0)
  }, [keys])

  /**
   * Get list of providers that have keys configured
   * 
   * @returns Array of provider names with configured keys
   */
  const getConfiguredProviders = useCallback((): Array<keyof ProviderKeys> => {
    return (Object.keys(keys) as Array<keyof ProviderKeys>).filter(provider => 
      hasKey(provider)
    )
  }, [keys, hasKey])

  return {
    /** Current provider keys state */
    keys,
    /** Whether keys are currently being loaded */
    loading,
    /** Error message if loading/saving failed */
    error,
    /** Update a single provider key */
    updateKey,
    /** Save all keys to storage */
    saveAll,
    /** Reset all keys to empty */
    resetAll,
    /** Check if a provider has a key */
    hasKey,
    /** Get list of configured providers */
    getConfiguredProviders
  }
}