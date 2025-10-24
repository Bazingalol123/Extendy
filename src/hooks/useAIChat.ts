import { useState, useCallback } from 'react'
import { createAIProvider } from '../providers/aiProvider'

export interface Message {
  id: string
  sender: 'user' | 'assistant'
  text: string
  timestamp: Date
  isStreaming?: boolean
  // Future-ready fields (non-breaking for current UI)
  role?: 'user' | 'assistant' | 'tool' | 'system'
  toolCallId?: string
}

export type ToolCallStatus = 'queued' | 'running' | 'success' | 'error'

export interface ToolCall {
  id: string
  name: string
  args?: any
  result?: any
  error?: string
  status: ToolCallStatus
  messageId?: string   // link to assistant message that initiated this tool call
  startedAt?: number
  finishedAt?: number
}

export function useAIChat(provider: string, apiKey: string) {
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null)
  const [toolCalls, setToolCalls] = useState<Record<string, ToolCall>>({})

  const sendMessage = useCallback(async (text: string, useStreaming: boolean = true) => {
    if (!apiKey) {
      console.error('[useAIChat] No API key provided')
      return
    }

    // Add user message
    const userMessage: Message = {
      id: Date.now().toString(),
      sender: 'user',
      text,
      timestamp: new Date()
    }
    setMessages(prev => [...prev, userMessage])
    setIsLoading(true)
    console.debug('[useAIChat] start', { provider, useStreaming, userTextLength: text.length })

    try {
      const ai = createAIProvider(provider, apiKey)

      if (useStreaming) {
        // Create placeholder for streaming message
        const assistantId = (Date.now() + 1).toString()
        const assistantMessage: Message = {
          id: assistantId,
          sender: 'assistant',
          text: '',
          timestamp: new Date(),
          isStreaming: true
        }
        setMessages(prev => [...prev, assistantMessage])
        setStreamingMessageId(assistantId)
        console.debug('[useAIChat] stream begin', { assistantId })

        // Prefer evented streaming if available
        const hasEvents =
          typeof (ai as any).streamReplyWithEvents === 'function'

        if (hasEvents) {
          let fullText = ''
          await (ai as any).streamReplyWithEvents(
            text,
            {
              onTextDelta: (chunk: string) => {
                fullText += chunk
                setMessages(prev =>
                  prev.map(msg =>
                    msg.id === assistantId
                      ? { ...msg, text: fullText, isStreaming: true }
                      : msg
                  )
                )
                // Debug for deltas
                console.debug('[useAIChat] delta', { len: chunk.length, total: fullText.length })
              },
              onToolStart: (e: { id: string; name: string; args: any }) => {
                setToolCalls(prev => ({
                  ...prev,
                  [e.id]: {
                    id: e.id,
                    name: e.name,
                    args: e.args,
                    status: 'running',
                    messageId: assistantId,
                    startedAt: Date.now()
                  }
                }))
                console.debug('[useAIChat] tool start', { id: e.id, name: e.name })
              },
              onToolResult: (e: { id: string; name: string; result: any }) => {
                setToolCalls(prev => {
                  const existing = prev[e.id] || { id: e.id, name: e.name, status: 'running', messageId: assistantId }
                  return {
                    ...prev,
                    [e.id]: {
                      ...existing,
                      name: e.name,
                      result: e.result,
                      status: 'success',
                      finishedAt: Date.now()
                    }
                  }
                })
                console.debug('[useAIChat] tool success', { id: e.id, name: e.name })
              },
              onToolError: (e: { id: string; name: string; error: string }) => {
                setToolCalls(prev => {
                  const existing = prev[e.id] || { id: e.id, name: e.name, status: 'running', messageId: assistantId }
                  return {
                    ...prev,
                    [e.id]: {
                      ...existing,
                      name: e.name,
                      error: e.error,
                      status: 'error',
                      finishedAt: Date.now()
                    }
                  }
                })
                console.debug('[useAIChat] tool error', { id: e.id, name: e.name, error: e.error })
              },
              onEnd: () => {
                setMessages(prev =>
                  prev.map(msg =>
                    msg.id === assistantId
                      ? { ...msg, isStreaming: false }
                      : msg
                  )
                )
                setStreamingMessageId(null)
                console.debug('[useAIChat] stream end', { assistantId })
              }
            }
          )
        } else {
          // Fallback: text-only streaming
          let fullText = ''
          await ai.streamReply(text, (chunk) => {
            fullText += chunk
            setMessages(prev =>
              prev.map(msg =>
                msg.id === assistantId
                  ? { ...msg, text: fullText, isStreaming: true }
                  : msg
              )
            )
            console.debug('[useAIChat] delta (fallback)', { len: chunk.length, total: fullText.length })
          })

          // Mark streaming as complete
          setMessages(prev =>
            prev.map(msg =>
              msg.id === assistantId
                ? { ...msg, isStreaming: false }
                : msg
            )
          )
          setStreamingMessageId(null)
          console.debug('[useAIChat] stream end (fallback)', { assistantId })
        }
      } else {
        // Non-streaming response
        const response = await ai.reply(text)
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          sender: 'assistant',
          text: response,
          timestamp: new Date()
        }
        setMessages(prev => [...prev, assistantMessage])
      }
    } catch (error) {
      console.error('AI error:', error)
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        sender: 'assistant',
        text: `❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date()
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }, [provider, apiKey])

  const clearMessages = useCallback(() => {
    setMessages([])
    setToolCalls({})
  }, [])

  return {
    messages,
    isLoading,
    streamingMessageId,
    toolCalls,
    sendMessage,
    clearMessages
  }
}