# Vercel AI SDK Integration Guide

This guide explains how to use the Vercel AI SDK in the Extendy browser extension.

## 📦 Installation

The AI SDK packages are already installed:

```bash
npm install ai @ai-sdk/openai @ai-sdk/anthropic
```

## 🚀 Quick Start

### 1. Using the AI Chat Hook

The easiest way to use AI SDK is with the `useAIChat` hook:

```tsx
import { useAIChat } from '../hooks/useAIChat'

function MyComponent() {
  const { messages, isLoading, sendMessage, clearMessages } = useAIChat(
    'openai',      // or 'anthropic'
    'your-api-key'
  )

  // Send a message with streaming
  await sendMessage('Hello!', true)  // true = streaming enabled

  // Send without streaming
  await sendMessage('Hello!', false)
}
```

### 2. Using Providers Directly

For more control, use providers directly:

```tsx
import { getAIProvider } from '../providers/aiSdkProvider'

const provider = getAIProvider('openai', apiKey)

// Non-streaming response
const response = await provider.reply('Hello!')

// Streaming response
await provider.streamReply('Hello!', (chunk) => {
  console.log('Received chunk:', chunk)
})
```

## 🎯 Components

### ChatBoxWithAI Component

Use the pre-built component with streaming support:

```tsx
import ChatBoxWithAI from '../components/ChatBoxWithAI'

<ChatBoxWithAI currentProvider="openai" />
```

Features:
- ✅ Real-time streaming responses
- ✅ Message history
- ✅ Toggle streaming on/off
- ✅ Beautiful UI with dark mode support

### Using in SidebarApp

Replace the old ChatBox with ChatBoxWithAI:

```tsx
import ChatBoxWithAI from '../popup/components/ChatBoxWithAI'

// In your component
<ChatBoxWithAI currentProvider={provider} />
```

## 🔧 Supported Providers

### OpenAI

```tsx
import { createOpenAIProvider } from '../providers/aiSdkProvider'

const provider = createOpenAIProvider(apiKey)
```

**Models:**
- `gpt-4o-mini` (default)
- `gpt-4o`
- `gpt-4-turbo`
- `gpt-3.5-turbo`

**Features:**
- ✅ Streaming support
- ✅ Chat completions
- ✅ Temperature control

### Anthropic

```tsx
import { createAnthropicProvider } from '../providers/aiSdkProvider'

const provider = createAnthropicProvider(apiKey)
```

**Models:**
- `claude-3-5-sonnet-20241022` (default)
- `claude-3-opus-20240229`
- `claude-3-sonnet-20240229`

**Features:**
- ✅ Streaming support
- ✅ Long context windows
- ✅ Advanced reasoning

## 📝 API Reference

### useAIChat Hook

```tsx
const {
  messages,           // Array of Message objects
  isLoading,          // Boolean: is AI processing?
  streamingMessageId, // ID of currently streaming message
  sendMessage,        // Function to send a message
  clearMessages       // Function to clear chat history
} = useAIChat(provider, apiKey)
```

**Message Interface:**
```tsx
interface Message {
  id: string
  sender: 'user' | 'ai'
  text: string
  timestamp: Date
  isStreaming?: boolean
}
```

### AI Provider Interface

```tsx
interface AIProvider {
  // Get complete response at once
  reply: (prompt: string) => Promise<string>
  
  // Stream response in chunks
  streamReply: (
    prompt: string,
    onChunk: (text: string) => void
  ) => Promise<void>
}
```

## 🎨 Streaming UI Features

The streaming implementation includes:

1. **Real-time Updates**: See responses appear word-by-word
2. **Streaming Indicator**: Visual cue showing active streaming
3. **Cursor Animation**: Blinking cursor during streaming
4. **Status Badge**: Shows "Streaming..." status

## 🔐 API Key Setup

Store your API key in Chrome storage:

```tsx
chrome.storage.local.set({ token: 'your-api-key' })
```

Or configure it in the settings panel in the UI.

## 💡 Examples

### Example 1: Basic Chat

```tsx
import { useAIChat } from '../hooks/useAIChat'

function BasicChat() {
  const { messages, sendMessage } = useAIChat('openai', apiKey)

  return (
    <div>
      {messages.map(msg => (
        <div key={msg.id}>
          {msg.sender}: {msg.text}
        </div>
      ))}
      <button onClick={() => sendMessage('Hello!')}>
        Send
      </button>
    </div>
  )
}
```

### Example 2: Streaming with Progress

```tsx
import { getAIProvider } from '../providers/aiSdkProvider'

async function streamExample() {
  const provider = getAIProvider('openai', apiKey)
  let fullResponse = ''

  await provider.streamReply('Tell me a story', (chunk) => {
    fullResponse += chunk
    console.log('Progress:', fullResponse)
  })

  console.log('Complete:', fullResponse)
}
```

### Example 3: Custom Hook Usage

```tsx
function CustomChat() {
  const [input, setInput] = useState('')
  const { messages, sendMessage } = useAIChat('anthropic', apiKey)

  const handleSubmit = async () => {
    await sendMessage(input, true) // Enable streaming
    setInput('')
  }

  return (
    <>
      <input value={input} onChange={e => setInput(e.target.value)} />
      <button onClick={handleSubmit}>Send with Streaming</button>
    </>
  )
}
```

## 🎯 Best Practices

1. **Use Streaming for Better UX**: Enable streaming for longer responses
2. **Handle Errors Gracefully**: Wrap API calls in try-catch blocks
3. **Store API Keys Securely**: Use Chrome storage, never hardcode keys
4. **Show Loading States**: Use `isLoading` to show appropriate UI
5. **Clean Up**: Clear messages when appropriate to manage memory

## 🐛 Troubleshooting

### Issue: API Key Not Found

**Solution:** Make sure to set the API key in Chrome storage:
```tsx
chrome.storage.local.set({ token: 'your-api-key' })
```

### Issue: Streaming Not Working

**Solution:** Check that:
1. Your API key is valid
2. The provider supports streaming
3. Network requests aren't blocked

### Issue: TypeScript Errors

**Solution:** Ensure all AI SDK types are properly imported:
```tsx
import type { AIProvider } from '../providers/aiSdkProvider'
```

## 🔄 Migrating from Old Providers

### Before (Old Provider System):
```tsx
import ProviderService from '../providers'

const replyFn = ProviderService.get(provider, token)
const response = await replyFn.reply(prompt)
```

### After (AI SDK):
```tsx
import { getAIProvider } from '../providers/aiSdkProvider'

const provider = getAIProvider('openai', apiKey)
const response = await provider.reply(prompt)

// Or with streaming:
await provider.streamReply(prompt, (chunk) => {
  console.log(chunk)
})
```

## 📚 Additional Resources

- [Vercel AI SDK Documentation](https://sdk.vercel.ai/docs)
- [OpenAI API Reference](https://platform.openai.com/docs/api-reference)
- [Anthropic API Reference](https://docs.anthropic.com/claude/reference)

## 🎉 Features

- ✨ **Unified API**: Single interface for multiple AI providers
- 🔄 **Real-time Streaming**: See responses as they're generated
- 🎨 **Beautiful UI**: Modern chat interface with dark mode
- 🚀 **Easy to Use**: Simple hooks and components
- 🔐 **Secure**: API keys stored securely in Chrome storage
- 📱 **Responsive**: Works perfectly in browser extensions

---

Need help? Check the example components in `src/popup/components/ChatBoxWithAI.tsx`