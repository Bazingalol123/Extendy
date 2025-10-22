# Extendy Architecture - Simplified Structure

## 📁 New Consolidated File Structure

```
extendy/
├── src/
│   ├── config/
│   │   └── providers.ts           # ✨ All provider configs in one place
│   ├── providers/
│   │   └── aiProvider.ts          # ✨ All AI providers unified (OpenAI, Anthropic, Ollama, Mock)
│   ├── hooks/
│   │   ├── useTheme.ts            # Theme management
│   │   └── useAIChat.ts           # AI chat with streaming
│   ├── components/
│   │   └── ChatBoxWithAI.tsx      # Main chat component
│   ├── sidebar/
│   │   ├── SidebarApp.tsx         # Main app container
│   │   └── main.tsx               # Entry point
│   └── styles.css                 # Theme-aware global styles
├── AI_SDK_GUIDE.md                # Complete documentation
└── README.md                      # Project overview
```

## 🎯 Key Improvements

### Before (Multiple Provider Files):
- ❌ `openaiProvider.ts` (19 lines)
- ❌ `anthropicProvider.ts` (empty)
- ❌ `ollamaProvider.ts` (21 lines)
- ❌ `mockProvider.ts` (7 lines)
- ❌ `aiSdkProvider.ts` (91 lines)
- ❌ `index.ts` (26 lines)
**Total: ~164 lines across 6 files**

### After (Consolidated):
- ✅ `config/providers.ts` (76 lines) - All configurations
- ✅ `providers/aiProvider.ts` (206 lines) - All implementations
**Total: 282 lines across 2 files (but much cleaner!)**

## 🚀 Benefits

1. **Single Source of Truth**: All provider logic in one file
2. **Easy Configuration**: Provider settings centralized in config
3. **Consistent Interface**: Same API for all providers
4. **Less Duplication**: Shared logic, no repeated code
5. **Easy to Extend**: Add new providers by implementing the interface

## 📐 Architecture Overview

### 1. Configuration Layer (`config/providers.ts`)
```typescript
// Define provider configs
export const PROVIDERS = {
  openai: { name, models, endpoint },
  anthropic: { name, models, endpoint },
  ollama: { name, models, endpoint },
  mock: { name, models }
}

// Export helpers
export function getProviderDisplayName(provider: string)
export function getProviderModels(provider: string)
```

### 2. Provider Layer (`providers/aiProvider.ts`)
```typescript
// Unified interface
export interface AIProvider {
  reply(prompt: string, model?: string): Promise<string>
  streamReply(prompt: string, onChunk: (text: string) => void, model?: string): Promise<void>
}

// Single factory function
export function createAIProvider(provider: string, apiKey: string): AIProvider

// Internal implementations
function createOpenAIImpl(apiKey, defaultModel): AIProvider
function createAnthropicImpl(apiKey, defaultModel): AIProvider
function createOllamaImpl(endpoint, defaultModel): AIProvider
function createMockImpl(): AIProvider
```

### 3. Hook Layer (`hooks/useAIChat.ts`)
```typescript
export function useAIChat(provider: string, apiKey: string) {
  // Uses createAIProvider internally
  // Returns: { messages, isLoading, sendMessage, clearMessages }
}
```

### 4. Component Layer
```typescript
// ChatBoxWithAI uses useAIChat
function ChatBoxWithAI({ currentProvider }) {
  const { messages, sendMessage } = useAIChat(currentProvider, apiKey)
  // Renders chat UI
}

// SidebarApp orchestrates everything
function SidebarApp() {
  // Uses AVAILABLE_PROVIDERS from config
  // Renders ChatBoxWithAI
}
```

## 🔄 Data Flow

```
User Input → SidebarApp → ChatBoxWithAI → useAIChat → createAIProvider → AI API
                                                                          ↓
User sees response ← ChatBoxWithAI ← useAIChat ← Streaming chunks ← AI API
```

## 💡 Usage Examples

### Adding a New Provider

1. **Add configuration** in `config/providers.ts`:
```typescript
export const PROVIDERS = {
  // ... existing providers
  gemini: {
    name: 'gemini',
    displayName: 'Google Gemini',
    models: {
      default: 'gemini-pro',
      options: ['gemini-pro', 'gemini-pro-vision']
    },
    apiEndpoint: 'https://generativelanguage.googleapis.com/v1'
  }
}
```

2. **Implement provider** in `providers/aiProvider.ts`:
```typescript
function createGeminiImpl(apiKey: string, defaultModel: string): AIProvider {
  return {
    async reply(prompt: string, model = defaultModel) {
      // Implementation
    },
    async streamReply(prompt: string, onChunk, model = defaultModel) {
      // Streaming implementation
    }
  }
}

// Add to createAIProvider switch
case 'gemini':
  return createGeminiImpl(apiKey, providerConfig.models.default)
```

3. **Done!** The new provider will automatically appear in the UI.

### Using Different Models

```typescript
const provider = createAIProvider('openai', apiKey)

// Use default model
await provider.reply('Hello')

// Use specific model
await provider.reply('Hello', 'gpt-4o')
```

## 🎨 Theme System

### Theme Variables (CSS)
```css
:root[data-theme="light"] {
  --brand-primary: #4285f4;
  /* ... */
}

:root[data-theme="dark"] {
  --brand-primary: #00c9a7;
  /* ... */
}
```

### Theme Hook
```typescript
const { theme, toggleTheme } = useTheme()
// Automatically saves to Chrome storage
```

## 🔐 Security

- API keys stored in Chrome's local storage
- No keys in source code
- Client-side only API calls

## 📊 Performance

- **Lazy Loading**: Providers loaded only when needed
- **Streaming**: Real-time response display
- **Efficient State**: Minimal re-renders with React hooks

## 🧪 Testing

```typescript
// Use mock provider for testing
const { messages, sendMessage } = useAIChat('mock', '')
await sendMessage('test')
// Returns "Mock response to: test"
```

## 🛠️ Development Workflow

1. **Start dev server**: `npm run dev`
2. **Make changes** in appropriate layer
3. **Test** with mock provider
4. **Build**: `npm run build`

## 📈 Future Enhancements

- [ ] Message persistence
- [ ] Conversation history
- [ ] Model switching mid-conversation
- [ ] Token usage tracking
- [ ] Rate limiting
- [ ] Retry logic
- [ ] Error recovery

---

**The new architecture is cleaner, more maintainable, and easier to extend!** 🎉