# Extendy - AI-Powered Browser Extension

A modern browser extension with AI chat capabilities, featuring light/dark mode themes and streaming responses powered by Vercel AI SDK.

## 🚀 Features

- 🎨 **Modern UI**: Clean, minimal design with light and dark mode
- 💬 **AI Chat**: Real-time streaming responses from multiple AI providers
- 🌓 **Theme Toggle**: Beautiful light and dark mode with smooth transitions
- ⚡ **Streaming Support**: See AI responses appear word-by-word in real-time
- 🔌 **Multiple Providers**: OpenAI, Anthropic, and Ollama support
- 📱 **Responsive**: Works perfectly as a browser extension sidebar

## 🎨 UI Design

### Light Mode
- Clean blue theme (#4285f4)
- White backgrounds with subtle gradients
- Professional message bubbles

### Dark Mode
- Modern teal/cyan theme (#00c9a7)
- Dark navy backgrounds
- Beautiful gradient effects in empty state

## 📦 Installation

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build
```

## 🔧 Technologies Used

- **React 18** - UI framework
- **TypeScript** - Type safety
- **Vite** - Fast build tool
- **Tailwind CSS** - Utility-first CSS
- **Vercel AI SDK** - AI streaming responses
- **Chrome Extension APIs** - Browser integration

## 🤖 AI SDK Integration

This project uses the Vercel AI SDK for AI chat functionality with streaming support.

### Quick Start

```tsx
import { useAIChat } from './hooks/useAIChat'

function MyChat() {
  const { messages, sendMessage } = useAIChat('openai', apiKey)
  
  // Send message with streaming
  await sendMessage('Hello!', true)
}
```

### Supported Providers

- **OpenAI**: GPT-4, GPT-4o, GPT-3.5 Turbo
- **Anthropic**: Claude 3.5 Sonnet, Claude 3 Opus
- **Ollama**: Local AI models

See [`AI_SDK_GUIDE.md`](./AI_SDK_GUIDE.md) for complete documentation.

## 📁 Project Structure

```
extendy/
├── src/
│   ├── sidebar/
│   │   ├── SidebarApp.tsx      # Main sidebar component
│   │   └── main.tsx             # Sidebar entry point
│   ├── popup/
│   │   ├── components/
│   │   │   ├── ChatBox.tsx             # Legacy chat component
│   │   │   └── ChatBoxWithAI.tsx       # AI SDK chat component
│   │   ├── hooks/
│   │   │   ├── useTheme.ts             # Theme management
│   │   │   └── useAIChat.ts            # AI chat hook
│   │   └── providers/
│   │       ├── aiSdkProvider.ts        # AI SDK providers
│   │       ├── openaiProvider.ts       # OpenAI legacy
│   │       ├── ollamaProvider.ts       # Ollama legacy
│   │       └── mockProvider.ts         # Mock provider
│   └── styles.css               # Global styles with theme variables
├── public/
│   ├── manifest.json            # Extension manifest
│   └── background.js            # Background script
├── AI_SDK_GUIDE.md              # Complete AI SDK documentation
└── README.md                    # This file
```

## 🎯 Usage

### Setting Up API Keys

1. Click the settings icon (⚙️) in the sidebar
2. Enter your API token (OpenAI or Anthropic)
3. Select your preferred AI provider
4. Start chatting!

### Using the Chat

1. **Type a message** in the input field
2. **Press Enter** or click the send button
3. **Watch the response stream** in real-time
4. **Toggle streaming** on/off in the header

### Theme Switching

Click the sun/moon toggle button in the header to switch between light and dark modes.

## 🔐 Security

- API keys are stored securely in Chrome's local storage
- No keys are hardcoded or exposed
- All API calls are made client-side

## 📝 Development

### Adding a New Provider

1. Create a provider in `src/popup/providers/aiSdkProvider.ts`
2. Add it to the `getAIProvider` function
3. Update the provider list in `ProviderService`

Example:

```tsx
export function createCustomProvider(apiKey: string): AIProvider {
  return {
    async reply(prompt: string) {
      // Your implementation
    },
    async streamReply(prompt: string, onChunk) {
      // Your streaming implementation
    }
  }
}
```

### Customizing Themes

Edit the CSS variables in `src/styles.css`:

```css
:root[data-theme="light"] {
  --brand-primary: #4285f4;
  --bg-primary: #ffffff;
  /* ... */
}

:root[data-theme="dark"] {
  --brand-primary: #00c9a7;
  --bg-primary: #0f1419;
  /* ... */
}
```

## 🎨 Components

### ChatBoxWithAI

Full-featured AI chat with streaming support:

```tsx
<ChatBoxWithAI currentProvider="openai" />
```

Features:
- Real-time streaming
- Message history
- Typing indicators
- Theme-aware styling

### SidebarApp

Main application container:

```tsx
<SidebarApp />
```

Features:
- Theme toggle
- Provider selection
- Settings panel
- Chat container

## 📚 Documentation

- [AI SDK Guide](./AI_SDK_GUIDE.md) - Complete AI SDK documentation
- [Vercel AI SDK Docs](https://sdk.vercel.ai/docs) - Official AI SDK documentation
- [Chrome Extension Docs](https://developer.chrome.com/docs/extensions/) - Chrome extension development

## 🐛 Troubleshooting

### API Key Issues

Make sure your API key is properly set:

```tsx
chrome.storage.local.set({ token: 'your-api-key' })
```

### Streaming Not Working

1. Check API key validity
2. Verify network connectivity
3. Ensure provider supports streaming

### TypeScript Errors

Rebuild the project:

```bash
npm run build
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## 📄 License

MIT License - feel free to use this project for your own purposes.

## 🙏 Acknowledgments

- [Vercel AI SDK](https://sdk.vercel.ai/) - Excellent AI streaming library
- [Tailwind CSS](https://tailwindcss.com/) - Amazing utility-first CSS framework
- [React](https://react.dev/) - The best UI library

---

**Built with ❤️ using React, TypeScript, and Vercel AI SDK**