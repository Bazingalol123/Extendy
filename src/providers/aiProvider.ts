import { createOpenAI } from '@ai-sdk/openai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { generateText, streamText, tool } from 'ai'
import { z } from 'zod'
import { PROVIDERS } from '../config/providers'
import { fileSystem } from '../services/fileSystem'

/**
 * Unified AI Provider Interface
 * Single file for all AI provider implementations with tools support
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
 * AI Tools for Extension Building
 * Correct syntax for AI SDK v5 - uses tool() with inputSchema
 */
const extensionTools = {
  createFile: tool({
    description: 'Create a new file in the extension project',
    inputSchema: z.object({
      path: z.string().describe('File path relative to extension root (e.g., "manifest.json", "popup/index.html")'),
      content: z.string().describe('Complete file content')
    }),
    execute: async ({ path, content }: { path: string; content: string}) => {
      console.log('🔧 Tool called: create_file', { path })
      const file = fileSystem.createFile(path, content)
      return { success: true, path: file.path, message: `Created ${path}` }
    }
  }),

  update_file: tool({
    description: 'Update an existing file in the extension',
    inputSchema: z.object({
      path: z.string().describe('File path to update'),
      content: z.string().describe('New file content')
    }),
    execute: async ({ path, content }: { path: string; content: string }) => {
      console.log('🔧 Tool called: update_file', { path })
      const file = fileSystem.updateFile(path, content)
      return file 
        ? { success: true, path, message: `Updated ${path}` }
        : { success: false, error: `File not found: ${path}` }
    }
  }),

  read_file: tool({
    description: 'Read the contents of an existing file',
    inputSchema: z.object({
      path: z.string().describe('File path to read')
    }),
    execute: async ({ path }: { path: string }) => {
      console.log('🔧 Tool called: read_file', { path })
      const file = fileSystem.getFile(path)
      return file
        ? { success: true, path, content: file.content }
        : { success: false, error: `File not found: ${path}` }
    }
  }),

  list_files: tool({
    description: 'List all files in the current extension project',
    inputSchema: z.object({}),
    execute: async () => {
      console.log('🔧 Tool called: list_files')
      const files = fileSystem.getAllFiles().map(f => ({ path: f.path, type: f.type }))
      return { files, count: files.length }
    }
  }),

  delete_file: tool({
    description: 'Delete a file from the extension project',
    inputSchema: z.object({
      path: z.string().describe('File path to delete')
    }),
    execute: async ({ path }: { path: string }) => {
      console.log('🔧 Tool called: delete_file', { path })
      const deleted = fileSystem.deleteFile(path)
      return deleted
        ? { success: true, message: `Deleted ${path}` }
        : { success: false, error: `File not found: ${path}` }
    }
  })
}

/**
 * System Prompt for Extension Building
 * Teaches the AI how to build Chrome extensions using tools
 */
const EXTENSION_BUILDER_PROMPT = `You are Extendy, an AI assistant specialized in building Chrome browser extensions.

When a user asks you to create an extension:
1. Use the create_file tool to generate all necessary files
2. Always start with manifest.json (Manifest V3 format)
3. Create clean, production-ready code
4. After creating files, explain what you built

Key Chrome Extension Concepts:
- manifest.json: Required config file (use Manifest V3)
- background.js: Service worker for background tasks
- content.js: Scripts that run on web pages
- popup.html/js: Extension popup interface
- options.html/js: Settings page
- icons/: Icon files (16x16, 48x48, 128x128)

Manifest V3 Template:
{
  "manifest_version": 3,
  "name": "Extension Name",
  "version": "1.0.0",
  "description": "Description",
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}

IMPORTANT: 
- Always use the tools provided (create_file, update_file, read_file, etc.)
- Don't just describe files - actually create them using tools
- You can call multiple tools in sequence
- After creating files, provide a brief summary

You have access to these tools:
- create_file(path, content) - Create a new file
- update_file(path, content) - Modify an existing file
- read_file(path) - Read file contents
- list_files() - See all files in project
- delete_file(path) - Remove a file`

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
 * OpenAI Implementation with Tools
 */
function createOpenAIImpl(apiKey: string, defaultModel: string): AIProvider {
  const openai = createOpenAI({ apiKey })

  return {
    async reply(prompt: string, model = defaultModel) {
      const { text } = await generateText({
        model: openai(model),
        system: EXTENSION_BUILDER_PROMPT,
        prompt,
        tools: extensionTools,
        temperature: 0.7
      })
      return text
    },

    async streamReply(prompt: string, onChunk: (text: string) => void, model = defaultModel) {
      const { textStream } = await streamText({
        model: openai(model),
        system: EXTENSION_BUILDER_PROMPT,
        prompt,
        tools: extensionTools,
        temperature: 0.7
      })

      for await (const chunk of textStream) {
        onChunk(chunk)
      }
    }
  }
}

/**
 * Anthropic Implementation with Tools
 */
function createAnthropicImpl(apiKey: string, defaultModel: string): AIProvider {
  const anthropic = createAnthropic({ apiKey })

  return {
    async reply(prompt: string, model = defaultModel) {
      const { text } = await generateText({
        model: anthropic(model),
        system: EXTENSION_BUILDER_PROMPT,
        prompt,
        tools: extensionTools,
        temperature: 0.7
      })
      return text
    },

    async streamReply(prompt: string, onChunk: (text: string) => void, model = defaultModel) {
      const { textStream } = await streamText({
        model: anthropic(model),
        system: EXTENSION_BUILDER_PROMPT,
        prompt,
        tools: extensionTools,
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
 * Note: Tools not yet supported for Ollama
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
            prompt: `${EXTENSION_BUILDER_PROMPT}\n\nUser: ${prompt}`,
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
            prompt: `${EXTENSION_BUILDER_PROMPT}\n\nUser: ${prompt}`,
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
      
      // Simulate tool calls
      fileSystem.createFile('manifest.json', JSON.stringify({
        manifest_version: 3,
        name: "Mock Extension",
        version: "1.0.0",
        description: "Created by mock provider for testing"
      }, null, 2))
      
      fileSystem.createFile('popup.html', `<!DOCTYPE html>
<html>
<head>
  <title>Mock Popup</title>
  <style>
    body { font-family: Arial; padding: 20px; }
    h1 { color: #4285f4; }
  </style>
</head>
<body>
  <h1>Hello from Mock Extension!</h1>
  <p>This was created by the mock provider.</p>
</body>
</html>`)
      
      return `I've created a simple extension with 2 files:

1. **manifest.json** - The extension configuration
2. **popup.html** - A popup interface with styling

The extension is ready to test! This is a mock response to: "${prompt}"`
    },

    async streamReply(prompt: string, onChunk: (text: string) => void) {
      const response = `I'll create a simple extension for you...`
      const words = response.split(' ')

      for (const word of words) {
        await new Promise(resolve => setTimeout(resolve, 100))
        onChunk(word + ' ')
      }
      
      // Simulate file creation
      await new Promise(resolve => setTimeout(resolve, 300))
      
      fileSystem.createFile('manifest.json', JSON.stringify({
        manifest_version: 3,
        name: "Mock Extension",
        version: "1.0.0",
        description: "Created by mock provider"
      }, null, 2))
      
      fileSystem.createFile('popup.html', `<!DOCTYPE html>
<html>
<head><title>Popup</title></head>
<body><h1>Hello!</h1></body>
</html>`)
      
      const summary = `\n\nDone! Created manifest.json and popup.html for: "${prompt}"`
      for (const word of summary.split(' ')) {
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