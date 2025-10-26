/**
 * Provider Configuration
 * Centralized configuration for all AI providers
 */

export interface ProviderConfig {
  name: string
  displayName: string
  models: {
    default: string
    options: string[]
  }
  apiEndpoint?: string
  getKeyUrl?: string
  installUrl?: string
  icon?: string
}

export const PROVIDERS: Record<string, ProviderConfig> = {
  googleGemini: {
    name: 'googleGemini',
    displayName: 'Google Gemini',
    models: {
      default: 'gemini-2.0-flash-exp',
      options: [
        'gemini-2.0-flash-exp',
        'gemini-1.5-pro',
        'gemini-1.5-flash',
        'gemini-1.5-flash-8b'
      ]
    },
    apiEndpoint: 'https://generativelanguage.googleapis.com/v1beta',
    getKeyUrl: 'https://makersuite.google.com/app/apikey',
    icon: '🔷'
  },
  openai: {
    name: 'openai',
    displayName: 'OpenAI',
    models: {
      default: 'gpt-4o-mini',
      options: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo']
    },
    apiEndpoint: 'https://api.openai.com/v1',
    getKeyUrl: 'https://platform.openai.com/api-keys',
    icon: '🤖'
  },
  anthropic: {
    name: 'anthropic',
    displayName: 'Anthropic',
    models: {
      default: 'claude-3-5-sonnet-20241022',
      options: [
        'claude-3-5-sonnet-20241022',
        'claude-3-opus-20240229',
        'claude-3-sonnet-20240229',
        'claude-3-haiku-20240307'
      ]
    },
    apiEndpoint: 'https://api.anthropic.com/v1',
    getKeyUrl: 'https://console.anthropic.com/settings/keys',
    icon: '🧠'
  },
  ollama: {
    name: 'ollama',
    displayName: 'Ollama (Local)',
    models: {
      default: 'llama2',
      options: ['llama2', 'llama3', 'mistral', 'codellama', 'phi', 'gemma']
    },
    apiEndpoint: 'http://localhost:11434',
    installUrl: 'https://ollama.ai/download',
    icon: '🦙'
  },
  perplexity: {
    name: 'perplexity',
    displayName: 'Perplexity',
    models: {
      default: 'sonar',
      options: ['sonar', 'sonar-pro']
    },
    apiEndpoint: 'https://api.perplexity.ai',
    getKeyUrl: 'https://www.perplexity.ai/settings/api',
    icon: '🔍'
  },
  mock: {
    name: 'mock',
    displayName: 'Mock (Testing)',
    models: {
      default: 'mock-model',
      options: ['mock-model']
    },
    icon: '🎭'
  }
}

export const DEFAULT_PROVIDER = 'openai'
export const AVAILABLE_PROVIDERS = Object.keys(PROVIDERS).filter(p => p !== 'mock')

/**
 * Get provider display name
 */
export function getProviderDisplayName(provider: string): string {
  return PROVIDERS[provider.toLowerCase()]?.displayName || provider
}

/**
 * Get available models for a provider
 */
export function getProviderModels(provider: string): string[] {
  return PROVIDERS[provider.toLowerCase()]?.models.options || []
}

// App settings
export const APP_CONFIG = {
  name: 'Extendy Agent',
  version: '1.0.0',
  defaultTheme: 'light' as 'light' | 'dark',
  streamingEnabled: true,
  maxMessageLength: 4000,
  animationDuration: 300
}