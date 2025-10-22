import { createOpenAI } from '@ai-sdk/openai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { generateText, streamText } from 'ai'
import { PROVIDERS } from '../config/providers'

/**
 * Unified AI Provider Interface
 * Single file for all AI provider implementations
 */

export interface AIProvider {
  reply: (prompt: string, model?: string) => Promise<string>
  streamReply: (
    prompt: string,
    onChunk: (text: string) => void,
    model?: string
  ) => Promise<void>
}

/**
 * Create AI Provider based on provider name
 * @param provider - Provider name ('openai', 'anthropic', 'ollama', 'mock')
 * @param apiKey - API key or endpoint URL
 */
export function createAIProvider(provider: string, apiKey: string): AIProvider {
  const providerConfig = PROVIDERS[provider.toLowerCase()]
  if (!providerConfig) {
    throw new Error(`Unknown provider: ${provider}`)
  }

  switch (provider.toLowerCase()) {
    case 'openai':
      return createOpenAIImpl(apiKey, providerConfig.models.default)
    
    case 'anthropic':
      return createAnthropicImpl(apiKey, providerConfig.models.default)
    
    case 'ollama':
      return createOllamaImpl(apiKey, providerConfig.models.default)
    
    case 'mock':
      return createMockImpl()
    
    default:
      throw new Error(`Provider not implemented: ${provider}`)
  }
}

/**
 * OpenAI Implementation
 */
function createOpenAIImpl(apiKey: string, defaultModel: string): AIProvider {
  const openai = createOpenAI({ apiKey })

  return {
    async reply(prompt: string, model = defaultModel) {
      const { text } = await generateText({
        model: openai(model),
        prompt,
        temperature: 0.7
      })
      return text
    },

    async streamReply(prompt: string, onChunk: (text: string) => void, model = defaultModel) {
      const { textStream } = await streamText({
        model: openai(model),
        prompt,
        temperature: 0.7
      })

      for await (const chunk of textStream) {
        onChunk(chunk)
      }
    }
  }
}

/**
 * Anthropic Implementation
 */
function createAnthropicImpl(apiKey: string, defaultModel: string): AIProvider {
  const anthropic = createAnthropic({ apiKey })

  return {
    async reply(prompt: string, model = defaultModel) {
      const { text } = await generateText({
        model: anthropic(model),
        prompt,
        temperature: 0.7
      })
      return text
    },

    async streamReply(prompt: string, onChunk: (text: string) => void, model = defaultModel) {
      const { textStream } = await streamText({
        model: anthropic(model),
        prompt,
        temperature: 0.7
      })

      for await (const chunk of textStream) {
        onChunk(chunk)
      }
    }
  }
}

/**
 * Ollama Local Implementation
 */
function createOllamaImpl(endpoint: string, defaultModel: string): AIProvider {
  return {
    async reply(prompt: string, model = defaultModel) {
      try {
        const response = await fetch(`${endpoint}/api/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            prompt,
            stream: false
          })
        })
        const data = await response.json()
        return data.response || '(No response)'
      } catch (error) {
        throw new Error(`Ollama error: ${error}`)
      }
    },

    async streamReply(prompt: string, onChunk: (text: string) => void, model = defaultModel) {
      try {
        const response = await fetch(`${endpoint}/api/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            prompt,
            stream: true
          })
        })

        const reader = response.body?.getReader()
        const decoder = new TextDecoder()

        while (reader) {
          const { done, value } = await reader.read()
          if (done) break

          const chunk = decoder.decode(value)
          const lines = chunk.split('\n').filter(line => line.trim())

          for (const line of lines) {
            try {
              const json = JSON.parse(line)
              if (json.response) {
                onChunk(json.response)
              }
            } catch (e) {
              // Skip invalid JSON
            }
          }
        }
      } catch (error) {
        throw new Error(`Ollama streaming error: ${error}`)
      }
    }
  }
}

/**
 * Mock Implementation for Testing
 */
function createMockImpl(): AIProvider {
  return {
    async reply(prompt: string) {
      await new Promise(resolve => setTimeout(resolve, 500))
      return `Mock response to: "${prompt}"`
    },

    async streamReply(prompt: string, onChunk: (text: string) => void) {
      const response = `Mock streaming response to: "${prompt}"`
      const words = response.split(' ')

      for (const word of words) {
        await new Promise(resolve => setTimeout(resolve, 100))
        onChunk(word + ' ')
      }
    }
  }
}

/**
 * Get list of available providers
 */
export function getAvailableProviders(): string[] {
  return Object.keys(PROVIDERS)
}

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