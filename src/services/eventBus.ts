/**
 * Typed, dependency-free EventBus singleton with micro-batched tree updates.
 * Dev logging behind NODE_ENV === 'development'.
 */

export type EventName =
  | 'project:activeChanged'
  | 'project:listChanged'
  | 'project:metaChanged'
  | 'file:created'
  | 'file:updated'
  | 'file:deleted'
  | 'file:moved'
  | 'tree:changed'
  | 'chat:messageAppended'
  | 'chat:cleared'
  | 'preview:run'

export interface Payloads {
  'project:activeChanged': { projectId: string | null }
  'project:listChanged': {
    projects: Array<{ id: string; name: string; lastOpenedAt: number }>
  }
  'project:metaChanged': {
    projectId: string
    metaPatch: Partial<{
      entryHtmlPath: string
      openEditors: string[]
      expandedPaths: string[]
      explicitDirs: string[]
      preview?: { throttleMs?: number; device?: string }
      activeFilePath?: string | null
    }>
  }
  'file:created': { projectId: string; path: string }
  'file:updated': { projectId: string; path: string; size?: number }
  'file:deleted': { projectId: string; path: string }
  'file:moved': { projectId: string; from: string; to: string }
  'tree:changed': { projectId: string }
  'chat:messageAppended': { projectId: string; messageId: string }
  'chat:cleared': { projectId: string }
  'preview:run': { files: Record<string, string>; entry: string }
}
export type PreviewRunPayload = Payloads['preview:run']

type Handler<K extends EventName> = (payload: Payloads[K]) => void

export interface EventBus {
  on<K extends EventName>(eventName: K, handler: Handler<K>): () => void
  once<K extends EventName>(eventName: K, handler: Handler<K>): void
  off<K extends EventName>(eventName: K, handler: Handler<K>): void
  emit<K extends EventName>(eventName: K, payload: Payloads[K]): void
  clearAll(): void
}

class InternalEventBus implements EventBus {
  private listeners = new Map<EventName, Set<(payload: any) => void>>()
  private pendingTreeChanged = new Map<string, ReturnType<typeof setTimeout>>()

  private isDev(): boolean {
    // Dev logging is strictly behind NODE_ENV === 'development'
    // Works in both browser (Vite) and Node contexts without Node types.
    const g: any = typeof globalThis !== 'undefined' ? (globalThis as any) : {}
    const nodeEnv = g.process?.env?.NODE_ENV
    const viteMode = (typeof import.meta !== 'undefined' ? (import.meta as any)?.env?.MODE : undefined)
    return nodeEnv === 'development' || viteMode === 'development'
  }

  private log(...args: any[]) {
    if (this.isDev()) {
      // eslint-disable-next-line no-console
      console.log('[EventBus]', ...args)
    }
  }

  on<K extends EventName>(eventName: K, handler: Handler<K>): () => void {
    let set = this.listeners.get(eventName)
    if (!set) {
      set = new Set()
      this.listeners.set(eventName, set)
    }
    // Store without generic type at runtime
    set.add(handler as unknown as (payload: any) => void)
    return () => this.off(eventName, handler)
  }

  once<K extends EventName>(eventName: K, handler: Handler<K>): void {
    const wrapper = (payload: Payloads[K]) => {
      try {
        handler(payload)
      } finally {
        this.off(eventName, wrapper as Handler<K>)
      }
    }
    this.on(eventName, wrapper as Handler<K>)
  }

  off<K extends EventName>(eventName: K, handler: Handler<K>): void {
    const set = this.listeners.get(eventName)
    if (!set) return
    set.delete(handler as unknown as (payload: any) => void)
    if (set.size === 0) {
      this.listeners.delete(eventName)
    }
  }

  emit<K extends EventName>(eventName: K, payload: Payloads[K]): void {
    this.log('emit', eventName, payload)

    // Micro-batching: schedule a tree:changed for file mutations
    if (
      eventName === 'file:created' ||
      eventName === 'file:updated' ||
      eventName === 'file:deleted' ||
      eventName === 'file:moved'
    ) {
      const projectId = (payload as any).projectId as string | undefined
      if (projectId) {
        this.scheduleTreeChanged(projectId)
      }
    }

    const set = this.listeners.get(eventName)
    if (!set || set.size === 0) return
    // Call defensively in a snapshot to avoid mutation during iteration
    Array.from(set.values()).forEach((fn) => {
      try {
        fn(payload)
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('[EventBus] handler error for', eventName, e)
      }
    })
  }

  clearAll(): void {
    // Clear listeners
    this.listeners.clear()
    // Cancel pending tree:changed timers
    for (const t of this.pendingTreeChanged.values()) {
      clearTimeout(t)
    }
    this.pendingTreeChanged.clear()
  }

  private scheduleTreeChanged(projectId: string) {
    if (this.pendingTreeChanged.has(projectId)) return
    const timer = setTimeout(() => {
      this.pendingTreeChanged.delete(projectId)
      // Emit the coalesced tree change
      this.emit('tree:changed', { projectId })
    }, 50)
    this.pendingTreeChanged.set(projectId, timer)
  }
}

// Default singleton instance
const eventBus: EventBus = new InternalEventBus()

export default eventBus