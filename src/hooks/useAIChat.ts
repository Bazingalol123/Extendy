import { useState, useCallback, useEffect, useRef } from 'react'
import { sendChat, getActiveProvider, getApiKey as getProviderApiKey, createAIProvider, type ProviderId, type ChatMessage as ProviderMessage, type ChatTurn } from '../providers/aiProvider'

// v2 adapters and types
import { storageV2, type ChatMeta as V2ChatMeta, type ChatMessage as V2ChatMessage } from '../utils/storageV2'

// v1 fallback storage helpers
import {
  isV2Initialized,
  readChatMeta as v1ReadChatMeta,
  writeChatMeta as v1WriteChatMeta,
  readChatSegment as v1ReadChatSegment,
  writeChatSegment as v1WriteChatSegment,
} from '../utils/storage'

import { fileSystem } from '../services/fileSystem'
import eventBus from '../services/eventBus'

// UI-facing message (preserve existing API surface)
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

const SEGMENT_SIZE_DEFAULT = 100

// ---------- Converters between v2 ChatMessage and UI Message ----------

function v2ToUI(msg: V2ChatMessage): Message {
  const role = msg.role
  return {
    id: String(msg.id),
    sender: role === 'user' ? 'user' : 'assistant',
    text: String(msg.text ?? ''),
    timestamp: new Date(Number(msg.timestamp ?? Date.now())),
    role,
    toolCallId: msg.toolCallId,
  }
}

function uiToV2(msg: Message): V2ChatMessage {
  return {
    id: String(msg.id),
    role: (msg.role ?? (msg.sender === 'user' ? 'user' : 'assistant')) as V2ChatMessage['role'],
    text: String(msg.text ?? ''),
    timestamp: msg.timestamp instanceof Date ? msg.timestamp.getTime() : Number(msg.timestamp ?? Date.now()),
    toolCallId: msg.toolCallId,
  }
}

// ---------- Storage v2 routing helpers (with v1 fallback) ----------

let __v2Ready: boolean | null = null

/**
 * Cached check whether storage v2 is initialized.
 */
async function isV2(): Promise<boolean> {
  if (__v2Ready !== null) return __v2Ready
  try {
    __v2Ready = await isV2Initialized()
    return __v2Ready
  } catch {
    __v2Ready = false
    return false
  }
}

/**
 * Load all chat messages for a project.
 * - v2: read meta + segments via IndexedDB adapters
 * - v1: read meta + segments via localStorage-backed helpers
 */
async function loadAllMessages(projectId: string): Promise<V2ChatMessage[]> {
  if (await isV2()) {
    const meta = await storageV2.idbGetChatMeta(projectId)
    if (!meta || (meta.segments ?? 0) === 0) return []
    const out: V2ChatMessage[] = []
    for (let i = 0; i < (meta.segments ?? 0); i++) {
      const seg = await storageV2.idbGetChatSegment(projectId, i)
      if (Array.isArray(seg) && seg.length) out.push(...seg)
    }
    return out
  }

  // v1 fallback
  const meta = v1ReadChatMeta(projectId)
  if (!meta) return []
  const segs = Math.max(1, meta.segments ?? 1)
  const out: V2ChatMessage[] = []
  for (let i = 0; i < segs; i++) {
    const segV1 = v1ReadChatSegment(projectId, i) || []
    for (const r of segV1 as any[]) {
      out.push({
        id: String(r.id),
        role: (r.role || r.sender) as V2ChatMessage['role'],
        text: String(r.text ?? ''),
        timestamp: Number(r.timestamp ?? Date.now()),
        toolCallId: r.toolCallId,
      })
    }
  }
  return out
}

/**
 * Append a single message to the project's chat history.
 * - v2: rolls segments when full, updates meta, emits chat:messageAppended
 * - v1: uses existing segment/meta helpers and identical rollover behavior
 */
async function appendMessage(projectId: string, msg: V2ChatMessage): Promise<void> {
  if (await isV2()) {
    const now = Date.now()
    let meta: V2ChatMeta | null = await storageV2.idbGetChatMeta(projectId)
    if (!meta) {
      meta = {
        projectId,
        totalMessages: 0,
        segments: 0,
        segmentSize: SEGMENT_SIZE_DEFAULT,
        lastUpdated: now,
      }
    }

    const segSize = meta.segmentSize || SEGMENT_SIZE_DEFAULT
    let segIdx = meta.segments > 0 ? meta.segments - 1 : 0
    let createdNewSegment = meta.segments === 0

    let seg = await storageV2.idbGetChatSegment(projectId, segIdx)
    if (createdNewSegment) {
      await storageV2.idbPutChatSegment(projectId, segIdx, [])
      seg = []
    }
    if (seg.length >= segSize) {
      segIdx = segIdx + 1
      await storageV2.idbPutChatSegment(projectId, segIdx, [])
      seg = []
      createdNewSegment = true
    }

    seg.push(msg)
    await storageV2.idbPutChatSegment(projectId, segIdx, seg)

    meta.totalMessages = (meta.totalMessages || 0) + 1
    meta.lastUpdated = now
    if (createdNewSegment) {
      meta.segments = (meta.segments || 0) + 1
    }
    await storageV2.idbPutChatMeta(projectId, { ...meta, projectId })

    eventBus.emit('chat:messageAppended', { projectId, messageId: msg.id })
    return
  }

  // v1 fallback
  const now = Date.now()
  const meta =
    v1ReadChatMeta(projectId) || {
      totalMessages: 0,
      segments: 1,
      segmentSize: SEGMENT_SIZE_DEFAULT,
      lastUpdated: 0,
    }
  const segSize = meta.segmentSize || SEGMENT_SIZE_DEFAULT
  const lastIdx = Math.max(0, (meta.segments || 1) - 1)
  let seg = v1ReadChatSegment(projectId, lastIdx) || []
  let targetIdx = lastIdx
  if (seg.length >= segSize) {
    targetIdx = lastIdx + 1
    seg = []
  }

  const v1Msg = {
    id: msg.id,
    sender: msg.role,
    text: msg.text,
    timestamp: msg.timestamp,
    role: msg.role,
    toolCallId: msg.toolCallId,
  }
  seg.push(v1Msg as any)
  v1WriteChatSegment(projectId, targetIdx, seg)
  v1WriteChatMeta(projectId, {
    totalMessages: (meta.totalMessages || 0) + 1,
    segments: Math.max(targetIdx + 1, meta.segments || 1),
    segmentSize: segSize,
    lastUpdated: now,
  })
  eventBus.emit('chat:messageAppended', { projectId, messageId: msg.id })
}

/**
 * Clear all chat data for the given project.
 * - v2: reset meta to 0 segments and totals
 * - v1: reset meta to 1 empty segment and clear segment 0
 */
async function clearChat(projectId: string): Promise<void> {
  const now = Date.now()
  if (await isV2()) {
    const meta: V2ChatMeta = {
      projectId,
      totalMessages: 0,
      segments: 0,
      segmentSize: SEGMENT_SIZE_DEFAULT,
      lastUpdated: now,
    }
    await storageV2.idbPutChatMeta(projectId, meta)
    // Note: segments are not physically deleted; meta.segments=0 hides them. Acceptable for now.
    eventBus.emit('chat:cleared', { projectId })
    return
  }

  // v1 fallback
  v1WriteChatMeta(projectId, {
    totalMessages: 0,
    segments: 1,
    segmentSize: SEGMENT_SIZE_DEFAULT,
    lastUpdated: now,
  })
  v1WriteChatSegment(projectId, 0, [])
  eventBus.emit('chat:cleared', { projectId })
}

// ---------- Hook ----------

/**
 * useAIChat — Project-aware chat hook with Storage V2 + v1 fallback.
 * Keeps existing API surface intact for consumers.
 */
export function useAIChat(provider: string, apiKey: string, projectId?: string | null) {
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null)
  const [toolCalls, setToolCalls] = useState<Record<string, ToolCall>>({})
  const [canLoadMore, setCanLoadMore] = useState(false)
  const loadedSegmentsRef = useRef<Set<number>>(new Set())

  // Provider-layer state
  const [error, setError] = useState<{ code?: string; message: string } | null>(null)
  const [needsKey, setNeedsKey] = useState(false)
  const [selectedProvider, setSelectedProvider] = useState<ProviderId>('openai')
  const [isConfigured, setIsConfigured] = useState<boolean>(false)
  const [toolModeDisabled, setToolModeDisabled] = useState<boolean>(false)
  const abortRef = useRef<AbortController | null>(null)

  // Load active provider + key to determine configuration
  useEffect(() => {
    (async () => {
      try {
        const p = await getActiveProvider()
        setSelectedProvider(p)
        // Always allow chatting; tool mode may be disabled at runtime (non-blocking)
        const _k = await getProviderApiKey(p)
        setIsConfigured(true)
      } catch {
        // allow chat even if provider lookup fails
        setIsConfigured(true)
      }
    })()
  }, [])

  // Track effective project id: controlled (prop) or derived (active project)
  const [activeProjectId, setActiveProjectId] = useState<string | null>(projectId ?? null)

  // Resolve active project id if not provided, and react to project:activeChanged
  useEffect(() => {
    if (projectId != null) {
      setActiveProjectId(projectId)
      return
    }
    // derive from FS
    setActiveProjectId(fileSystem.getActiveProjectId())
    const off = eventBus.on('project:activeChanged', ({ projectId: pid }) => {
      setActiveProjectId(pid)
    })
    return () => {
      if (typeof off === 'function') off()
    }
  }, [projectId])

  // Load messages on project change
  useEffect(() => {
    // reset state when project changes
    setMessages([])
    setToolCalls({})
    setStreamingMessageId(null)
    setCanLoadMore(false)
    loadedSegmentsRef.current = new Set()

    if (!activeProjectId) return

    ;(async () => {
      if (await isV2()) {
        const all = await loadAllMessages(activeProjectId)
        setMessages(all.map(v2ToUI))
        setCanLoadMore(false)
      } else {
        // v1: keep previous behavior — load only the latest segment
        const meta = v1ReadChatMeta(activeProjectId)
        if (!meta) {
          // initialize meta if missing
          v1WriteChatMeta(activeProjectId, {
            totalMessages: 0,
            segments: 1,
            segmentSize: SEGMENT_SIZE_DEFAULT,
            lastUpdated: Date.now(),
          })
          v1WriteChatSegment(activeProjectId, 0, [])
          setCanLoadMore(false)
          return
        }
        const lastIdx = Math.max(0, (meta.segments || 1) - 1)
        const seg = v1ReadChatSegment(activeProjectId, lastIdx) || []
        loadedSegmentsRef.current.add(lastIdx)
        const uiMsgs = (seg as any[]).map((r) =>
          v2ToUI({
            id: String(r.id),
            role: (r.role || r.sender) as V2ChatMessage['role'],
            text: String(r.text ?? ''),
            timestamp: Number(r.timestamp ?? Date.now()),
            toolCallId: r.toolCallId,
          })
        )
        setMessages(uiMsgs)
        setCanLoadMore(lastIdx > 0)
      }
    })()
  }, [activeProjectId])

  // Load older segments (v1 only)
  const loadMore = useCallback(() => {
    const pid = activeProjectId
    if (!pid) return
    // v2 loads all at once currently; no incremental paging
    isV2().then((v2) => {
      if (v2) {
        setCanLoadMore(false)
        return
      }
      const meta = v1ReadChatMeta(pid)
      if (!meta) return
      const minLoaded = Math.min(
        ...Array.from(
          loadedSegmentsRef.current.size
            ? loadedSegmentsRef.current
            : new Set([meta.segments - 1]),
        ),
      )
      const nextIdx = minLoaded - 1
      if (nextIdx < 0) {
        setCanLoadMore(false)
        return
      }
      const seg = v1ReadChatSegment(pid, nextIdx) || []
      if (seg.length === 0) {
        setCanLoadMore(nextIdx > 0)
        loadedSegmentsRef.current.add(nextIdx)
        return
      }
      const older = (seg as any[]).map((r) =>
        v2ToUI({
          id: String(r.id),
          role: (r.role || r.sender) as V2ChatMessage['role'],
          text: String(r.text ?? ''),
          timestamp: Number(r.timestamp ?? Date.now()),
          toolCallId: r.toolCallId,
        }),
      )
      setMessages((prev) => [...older, ...prev])
      loadedSegmentsRef.current.add(nextIdx)
      setCanLoadMore(nextIdx > 0)
    })
  }, [activeProjectId])

  function genId(): string {
    try {
      // @ts-ignore
      if (typeof crypto !== 'undefined' && crypto?.randomUUID) return crypto.randomUUID()
    } catch {}
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`
  }

  const sendMessage = useCallback(
    async (text: string, _useStreaming: boolean = true) => {
      setError(null)
      const pid = activeProjectId
      if (!pid) return

      // Add user message (UI immediately)
      const userV2: V2ChatMessage = {
        id: genId(),
        role: 'user',
        text,
        timestamp: Date.now(),
      }
      setMessages((prev) => [...prev, v2ToUI(userV2)])
      appendMessage(pid, userV2).catch(() => {})

      setIsLoading(true)
      setNeedsKey(false)
      setToolModeDisabled(false)

      // Abort any in-flight request
      if (abortRef.current) {
        try { abortRef.current.abort() } catch {}
      }
      const ac = new AbortController()
      abortRef.current = ac

      // Helper to build provider history as ChatTurn[]
      const toHistory = (arr: Message[]): ChatTurn[] =>
        arr.map(m => ({
          role: m.sender === 'user' ? 'user' : 'assistant',
          content: m.text,
        }))

      let attemptedFallback = false

      try {
        // Prefer OpenAI tool-enabled path if available (key present)
        const openaiKey = await getProviderApiKey('openai')
        if (openaiKey && openaiKey.trim()) {
          const provider = createAIProvider('openai', openaiKey.trim())

          // Create streaming assistant placeholder
          const assistantId = genId()
          const assistantUI: Message = {
            id: assistantId,
            sender: 'assistant',
            text: '',
            timestamp: new Date(),
            isStreaming: true,
            role: 'assistant',
          }
          setMessages(prev => [...prev, assistantUI])
          setStreamingMessageId(assistantId)

          const history: ChatTurn[] = toHistory([...messages, v2ToUI(userV2)])
          let finalText = ''

          await provider.streamReplyWithEvents?.(
            text,
            {
              onTextDelta: (delta: string) => {
                finalText += delta
                setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, text: finalText } : m))
              },
              onToolStart: (e) => {
                setToolCalls(prev => ({
                  ...prev,
                  [e.id]: {
                    id: e.id,
                    name: e.name,
                    args: e.args,
                    status: 'running',
                    messageId: assistantId,
                    startedAt: Date.now(),
                  }
                }))
              },
              onToolResult: (e) => {
                setToolCalls(prev => ({
                  ...prev,
                  [e.id]: {
                    ...(prev[e.id] || { id: e.id, name: e.name, messageId: assistantId }),
                    id: e.id,
                    name: e.name,
                    result: e.result,
                    status: 'success',
                    finishedAt: Date.now(),
                  }
                }))
              },
              onToolError: (e) => {
                setToolCalls(prev => ({
                  ...prev,
                  [e.id]: {
                    ...(prev[e.id] || { id: e.id, name: e.name, messageId: assistantId }),
                    id: e.id,
                    name: e.name,
                    error: e.error,
                    status: 'error',
                    finishedAt: Date.now(),
                  }
                }))
              },
              onEnd: () => {
                setStreamingMessageId(null)
              }
            },
            undefined,
            history,
          )

          // finalize assistant message and persist
          const assistantV2: V2ChatMessage = {
            id: assistantId,
            role: 'assistant',
            text: finalText,
            timestamp: Date.now(),
          }
          setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, isStreaming: false, text: finalText } : m))
          await appendMessage(pid, assistantV2)
          return
        }

        // No OpenAI key -> fall back to legacy text-only path
        attemptedFallback = true
        setToolModeDisabled(true)

        const providerMsgs: ProviderMessage[] = [...messages, v2ToUI(userV2)]
          .slice(-40)
          .map(m => ({
            role: m.sender === 'user' ? 'user' : 'assistant',
            content: m.text,
          }))

        const { text: reply } = await sendChat(providerMsgs, { signal: ac.signal })

        const assistantV2: V2ChatMessage = {
          id: genId(),
          role: 'assistant',
          text: reply,
          timestamp: Date.now(),
        }
        setMessages((prev) => [...prev, v2ToUI(assistantV2)])
        await appendMessage(pid, assistantV2)
      } catch (err: any) {
        // If tools path failed, attempt fallback once
        try {
          if (!attemptedFallback) {
            attemptedFallback = true
            setToolModeDisabled(true)
            const providerMsgs: ProviderMessage[] = [...messages, v2ToUI(userV2)]
              .slice(-40)
              .map(m => ({
                role: m.sender === 'user' ? 'user' : 'assistant',
                content: m.text,
              }))
            const { text: reply } = await sendChat(providerMsgs, { signal: ac.signal })
            const assistantV2: V2ChatMessage = {
              id: genId(),
              role: 'assistant',
              text: reply,
              timestamp: Date.now(),
            }
            setMessages((prev) => [...prev, v2ToUI(assistantV2)])
            await appendMessage(pid, assistantV2)
          } else {
            throw err
          }
        } catch (fallbackErr: any) {
          const code = fallbackErr?.code as string | undefined
          const msg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)
          setError({ code, message: msg })

          if (code === 'NO_API_KEY') {
            setNeedsKey(true)
            try {
              const p = await getActiveProvider()
              setSelectedProvider(p)
            } catch {}
          }

          const assistantV2: V2ChatMessage = {
            id: genId(),
            role: 'assistant',
            text: `❌ ${msg}`,
            timestamp: Date.now(),
          }
          setMessages((prev) => [...prev, v2ToUI(assistantV2)])
          appendMessage(pid, assistantV2).catch(() => {})
        }
      } finally {
        if (abortRef.current === ac) abortRef.current = null
        setIsLoading(false)
      }
    },
    [activeProjectId, messages],
  )

  const clearMessages = useCallback(() => {
    setMessages([])
    setToolCalls({})
    setStreamingMessageId(null)
    setCanLoadMore(false)
    loadedSegmentsRef.current = new Set()
    const pid = activeProjectId
    if (!pid) return
    clearChat(pid).catch((e) => console.warn('[useAIChat] clearChat failed', e))
  }, [activeProjectId])

  // Alias for back-compat and forward-compat
  const clearChatForProject = clearMessages

  return {
    messages,
    isLoading,
    streamingMessageId,
    toolCalls,
    sendMessage,
    clearMessages,
    clearChat: clearChatForProject,
    loadMore,
    canLoadMore,
    // Provider-layer error and guidance
    error,
    needsKey,
    provider: selectedProvider,
    isConfigured,
    toolModeDisabled,
  }
}