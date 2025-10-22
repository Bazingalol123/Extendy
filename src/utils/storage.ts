/**
 * Storage Utilities
 * Provides functions for managing provider keys and settings in chrome.storage.local
 */

/**
 * Provider keys interface for multi-provider support
 */
export interface ProviderKeys {
  googleGemini: string
  openai: string
  anthropic: string
  ollama: string
  perplexity: string
}

/**
 * Storage schema interface
 */
export interface StorageSchema {
  providerKeys: ProviderKeys
  defaultProvider: string
  lastUsedProvider?: string
  providerModels?: Record<string, string>
  theme?: 'light' | 'dark'
  streamResponses?: boolean
}

/**
 * Default provider keys (all empty initially)
 */
const DEFAULT_PROVIDER_KEYS: ProviderKeys = {
  googleGemini: '',
  openai: '',
  anthropic: '',
  ollama: '',
  perplexity: ''
}

/**
 * Get all provider keys from storage
 * @returns Promise with provider keys object
 */
export async function getProviderKeys(): Promise<ProviderKeys> {
  try {
    const result = await chrome.storage.local.get('providerKeys')
    return result.providerKeys || DEFAULT_PROVIDER_KEYS
  } catch (error) {
    console.error('Error getting provider keys:', error)
    return DEFAULT_PROVIDER_KEYS
  }
}

/**
 * Save all provider keys to storage
 * @param keys - Provider keys object to save
 */
export async function saveProviderKeys(keys: ProviderKeys): Promise<void> {
  try {
    await chrome.storage.local.set({ providerKeys: keys })
  } catch (error) {
    console.error('Error saving provider keys:', error)
    throw new Error('Failed to save provider keys')
  }
}

/**
 * Get the default provider setting
 * @returns Promise with default provider name
 */
export async function getDefaultProvider(): Promise<string> {
  try {
    const result = await chrome.storage.local.get('defaultProvider')
    return result.defaultProvider || 'googleGemini'
  } catch (error) {
    console.error('Error getting default provider:', error)
    return 'googleGemini'
  }
}

/**
 * Set the default provider
 * @param provider - Provider name to set as default
 */
export async function setDefaultProvider(provider: string): Promise<void> {
  try {
    await chrome.storage.local.set({ defaultProvider: provider })
  } catch (error) {
    console.error('Error setting default provider:', error)
    throw new Error('Failed to set default provider')
  }
}

/**
 * Get the last used provider (for session continuity)
 * @returns Promise with last used provider name or undefined
 */
export async function getLastUsedProvider(): Promise<string | undefined> {
  try {
    const result = await chrome.storage.local.get('lastUsedProvider')
    return result.lastUsedProvider
  } catch (error) {
    console.error('Error getting last used provider:', error)
    return undefined
  }
}

/**
 * Set the last used provider
 * @param provider - Provider name to set as last used
 */
export async function setLastUsedProvider(provider: string): Promise<void> {
  try {
    await chrome.storage.local.set({ lastUsedProvider: provider })
  } catch (error) {
    console.error('Error setting last used provider:', error)
  }
}

/**
 * Get saved model for a specific provider
 * @param provider - Provider name
 * @returns Promise with model name or undefined
 */
export async function getProviderModel(provider: string): Promise<string | undefined> {
  try {
    const result = await chrome.storage.local.get('providerModels')
    return result.providerModels?.[provider]
  } catch (error) {
    console.error('Error getting provider model:', error)
    return undefined
  }
}

/**
 * Save model selection for a specific provider
 * @param provider - Provider name
 * @param model - Model name to save
 */
export async function setProviderModel(provider: string, model: string): Promise<void> {
  try {
    const result = await chrome.storage.local.get('providerModels')
    const providerModels = result.providerModels || {}
    providerModels[provider] = model
    await chrome.storage.local.set({ providerModels })
  } catch (error) {
    console.error('Error setting provider model:', error)
    throw new Error('Failed to save model selection')
  }
}

/**
 * Migrate from old storage format (single provider/token) to new multi-provider format
 * This ensures backward compatibility with existing installations
 */
export async function migrateStorage(): Promise<void> {
  try {
    // Check if migration is needed
    const result = await chrome.storage.local.get(['provider', 'token', 'providerKeys'])
    
    // If providerKeys already exists, migration was already done
    if (result.providerKeys) {
      return
    }
    
    // If old format exists, migrate it
    if (result.provider && result.token) {
      const providerKeys = { ...DEFAULT_PROVIDER_KEYS }
      
      // Map old provider names to new format
      const providerMap: Record<string, keyof ProviderKeys> = {
        'openai': 'openai',
        'anthropic': 'anthropic',
        'ollama': 'ollama',
        'mock': 'googleGemini', // Default fallback
        'gemini': 'googleGemini',
        'googlegemini': 'googleGemini',
        'google-gemini': 'googleGemini',
        'perplexity': 'perplexity'
      }
      
      const oldProvider = result.provider.toLowerCase().replace(/[_\s-]/g, '')
      const newProviderKey = providerMap[oldProvider] || 'googleGemini'
      
      // Migrate the API key to the appropriate provider
      providerKeys[newProviderKey] = result.token
      
      // Save migrated data
      await chrome.storage.local.set({
        providerKeys,
        defaultProvider: newProviderKey,
        streamResponses: true
      })
      
      // Clean up old keys
      await chrome.storage.local.remove(['provider', 'token'])
      
      console.log('Storage migration completed successfully')
    } else {
      // No old data, initialize with defaults
      await chrome.storage.local.set({
        providerKeys: DEFAULT_PROVIDER_KEYS,
        defaultProvider: 'googleGemini',
        streamResponses: true
      })
    }
  } catch (error) {
    console.error('Error during storage migration:', error)
    // Don't throw - allow app to continue with defaults
  }
}

/**
 * Get stream responses preference
 * @returns Promise with boolean preference
 */
export async function getStreamResponses(): Promise<boolean> {
  try {
    const result = await chrome.storage.local.get('streamResponses')
    return result.streamResponses !== undefined ? result.streamResponses : true
  } catch (error) {
    console.error('Error getting stream responses preference:', error)
    return true
  }
}

/**
 * Set stream responses preference
 * @param enabled - Whether streaming is enabled
 */
export async function setStreamResponses(enabled: boolean): Promise<void> {
  try {
    await chrome.storage.local.set({ streamResponses: enabled })
  } catch (error) {
    console.error('Error setting stream responses preference:', error)
    throw new Error('Failed to save streaming preference')
  }
}