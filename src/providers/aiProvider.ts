import { createOpenAI } from '@ai-sdk/openai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { generateText, streamText, tool, stepCountIs } from 'ai'
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
1. **ALWAYS create ALL necessary files in ONE conversation** - don't stop after just one file!
2. Use the create_file tool multiple times to generate all required files
3. Start with manifest.json (Manifest V3 format)
4. Create corresponding HTML, JS, and CSS files as needed
5. After creating ALL files, provide a brief summary explaining what you built

**CRITICAL**: For a complete extension, you MUST create AT LEAST:
- manifest.json (required)
- popup.html + popup.js (if using action/browser_action)
- background.js (if using background scripts)
- styles.css (for styling)
- README.md (optional but helpful)

DO NOT stop after creating just manifest.json! Create all the files the user requested.

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
  },
  "action": {
    "default_popup": "popup.html",
    "default_icon": "icons/icon48.png"
  },
  "permissions": ["storage"]
}

IMPORTANT: 
- Always use the tools provided (create_file, update_file, read_file, etc.)
- Don't just describe files - actually create them using tools
- **Call create_file multiple times** to create all necessary files
- After creating files, provide a summary of what you built
- Be conversational and helpful in your responses

You have access to these tools:
- create_file(path, content) - Create a new file
- update_file(path, content) - Modify an existing file
- read_file(path) - Read file contents
- list_files() - See all files in project
- delete_file(path) - Remove a file

Example workflow for "Create a simple hello world extension":
1. Call create_file for manifest.json
2. Call create_file for popup.html
3. Call create_file for popup.js
4. Call create_file for styles.css
5. Respond: "I've created a simple hello world extension with 4 files: manifest.json, popup.html, popup.js, and styles.css. The extension displays a friendly greeting when you click its icon!"

Remember: CREATE ALL FILES, THEN EXPLAIN!`

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
 * FIXED for AI SDK 5: Uses stopWhen instead of maxSteps
 */
function createOpenAIImpl(apiKey: string, defaultModel: string): AIProvider {
  const openai = createOpenAI({ apiKey })

  return {
    async reply(prompt: string, model = defaultModel) {
      const { text, toolCalls } = await generateText({
        model: openai(model),
        system: EXTENSION_BUILDER_PROMPT,
        prompt,
        tools: extensionTools,
        stopWhen: stepCountIs(5), // ← AI SDK 5: Allow up to 5 tool calling steps
        temperature: 0.7
      })
      
      // Log tool activity for debugging
      if (toolCalls && toolCalls.length > 0) {
        console.log(`✅ Tool calls completed: ${toolCalls.length} calls`)
        console.log('📝 Final text response:', text)
      }
      
      return text
    },

    async streamReply(prompt: string, onChunk: (text: string) => void, model = defaultModel) {
      const { textStream } = streamText({
        model: openai(model),
        system: EXTENSION_BUILDER_PROMPT,
        prompt,
        tools: extensionTools,
        stopWhen: stepCountIs(5), // ← AI SDK 5: Allow up to 5 tool calling steps
        temperature: 0.7
      })

      // Stream text parts only
      for await (const chunk of textStream) {
        onChunk(chunk)
      }
    }
  }
}

/**
 * Anthropic Implementation with Tools
 * FIXED for AI SDK 5: Uses stopWhen instead of maxSteps
 */
function createAnthropicImpl(apiKey: string, defaultModel: string): AIProvider {
  const anthropic = createAnthropic({ apiKey })

  return {
    async reply(prompt: string, model = defaultModel) {
      const { text, toolCalls } = await generateText({
        model: anthropic(model),
        system: EXTENSION_BUILDER_PROMPT,
        prompt,
        tools: extensionTools,
        stopWhen: stepCountIs(5), // ← AI SDK 5: Allow up to 5 tool calling steps
        temperature: 0.7
      })
      
      // Log tool activity for debugging
      if (toolCalls && toolCalls.length > 0) {
        console.log(`✅ Tool calls completed: ${toolCalls.length} calls`)
        console.log('📝 Final text response:', text)
      }
      
      return text
    },

    async streamReply(prompt: string, onChunk: (text: string) => void, model = defaultModel) {
      const { textStream } = streamText({
        model: anthropic(model),
        system: EXTENSION_BUILDER_PROMPT,
        prompt,
        tools: extensionTools,
        stopWhen: stepCountIs(5), // ← AI SDK 5: Allow up to 5 tool calling steps
        temperature: 0.7
      })

      // Stream text parts only
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
 * Creates a complete extension with multiple files
 */
function createMockImpl(): AIProvider {
  return {
    async reply(prompt: string) {
      await new Promise(resolve => setTimeout(resolve, 500))
      
      // Create a complete extension
      fileSystem.createFile('manifest.json', JSON.stringify({
        manifest_version: 3,
        name: "Hello World Extension",
        version: "1.0.0",
        description: "A simple hello world extension",
        action: {
          default_popup: "popup.html",
          default_icon: "icon.png"
        },
        permissions: ["storage"]
      }, null, 2))
      
      fileSystem.createFile('popup.html', `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Hello World</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div class="container">
    <h1>👋 Hello World!</h1>
    <p>Welcome to your new extension</p>
    <button id="clickMe">Click Me</button>
  </div>
  <script src="popup.js"></script>
</body>
</html>`)

      fileSystem.createFile('popup.js', `document.getElementById('clickMe').addEventListener('click', () => {
  alert('Hello from the extension!');
  
  // Save to storage
  chrome.storage.local.set({ clicks: (Date.now()) }, () => {
    console.log('Click saved!');
  });
});`)

      fileSystem.createFile('styles.css', `body {
  width: 300px;
  padding: 20px;
  font-family: Arial, sans-serif;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  margin: 0;
}

.container {
  text-align: center;
}

h1 {
  margin: 0 0 10px 0;
  font-size: 24px;
}

p {
  margin: 0 0 20px 0;
  opacity: 0.9;
}

button {
  background: white;
  color: #667eea;
  border: none;
  padding: 10px 24px;
  border-radius: 20px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.2s;
}

button:hover {
  transform: scale(1.05);
}`)
      
      return `I've created a complete "Hello World" extension with 4 files:

**📄 Files Created:**
1. **manifest.json** - Extension configuration (Manifest V3)
2. **popup.html** - The popup interface with a greeting
3. **popup.js** - Click handler with storage example
4. **styles.css** - Beautiful gradient styling

**✨ Features:**
- Displays a friendly greeting
- Interactive button
- Uses Chrome storage API
- Modern gradient design

The extension is ready to load and test!`
    },

    async streamReply(prompt: string, onChunk: (text: string) => void) {
      // Simulate streaming with tool calls
      const parts = [
        "I'll create a complete extension for you...",
        "\n\nCreating files now...",
        "\n\n**Files Created:**\n"
      ]

      for (const part of parts) {
        await new Promise(resolve => setTimeout(resolve, 300))
        onChunk(part)
      }
      
      // Create files
      fileSystem.createFile('manifest.json', JSON.stringify({
        manifest_version: 3,
        name: "Extension",
        version: "1.0.0"
      }, null, 2))
      
      await new Promise(resolve => setTimeout(resolve, 200))
      onChunk("1. ✅ manifest.json\n")
      
      fileSystem.createFile('popup.html', '<html><body><h1>Hello!</h1></body></html>')
      await new Promise(resolve => setTimeout(resolve, 200))
      onChunk("2. ✅ popup.html\n")
      
      fileSystem.createFile('popup.js', 'console.log("Extension loaded!");')
      await new Promise(resolve => setTimeout(resolve, 200))
      onChunk("3. ✅ popup.js\n")
      
      fileSystem.createFile('styles.css', 'body { padding: 20px; }')
      await new Promise(resolve => setTimeout(resolve, 200))
      onChunk("4. ✅ styles.css\n")
      
      await new Promise(resolve => setTimeout(resolve, 300))
      onChunk("\n\n✨ Extension created successfully! All files are ready to use.")
    }
  }
}