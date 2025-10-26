import { useEffect, useMemo, useRef, useState } from 'react'
import { fileSystem, on } from '../services/fileSystem'
import type { PreviewRunPayload } from '../services/eventBus'

type Asset = { path: string; content: string }

function normalize(p: string) {
  return p.replace(/^\/+/, '').replace(/\/+/g, '/')
}

function isDev(): boolean {
  try {
    const g: any = typeof globalThis !== 'undefined' ? (globalThis as any) : {}
    const nodeEnv = g.process?.env?.NODE_ENV
    const viteMode = (typeof import.meta !== 'undefined' ? (import.meta as any)?.env?.MODE : undefined)
    return nodeEnv === 'development' || viteMode === 'development'
  } catch {
    return false
  }
}
function dlog(...args: any[]) {
  if (isDev()) {
    // eslint-disable-next-line no-console
    console.log('[PreviewRunner]', ...args)
  }
}

export default function PreviewRunner() {
  const [entry, setEntry] = useState<string | null>(null)
  const [status, setStatus] = useState<'idle' | 'building' | 'ready'>('idle')
  const [filesState, setFilesState] = useState<Asset[]>([])

  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const sandboxReadyRef = useRef(false)
  const pingTimerRef = useRef<number | null>(null)

  const activeProjectIdRef = useRef<string | null>(fileSystem.getActiveProjectId())
  const debounceTimerRef = useRef<number | null>(null)
  const pendingPayloadRef = useRef<{ entryPath: string; files: Asset[]; projectId: string } | null>(null)

  function pingOnce() {
    const win = iframeRef.current?.contentWindow
    if (!win) {
      console.warn('[PreviewRunner] pingOnce: no iframe.contentWindow')
      return
    }
    try {
      win.postMessage({ type: 'PING' }, '*')
    } catch (e) {
      console.warn('[PreviewRunner] pingOnce error', e)
    }
  }

  function startPing() {
    if (pingTimerRef.current) {
      window.clearInterval(pingTimerRef.current)
      pingTimerRef.current = null
    }
    // ping until sandboxReady
   pingTimerRef.current = window.setInterval(() => {
      if (sandboxReadyRef.current) {
        if (pingTimerRef.current) {
          window.clearInterval(pingTimerRef.current)
          pingTimerRef.current = null
        }
        return
      }
      pingOnce()
    }, 300)
  }

  const sandboxSrc = useMemo(() => {
    try {
      const isExtension = typeof location !== 'undefined' && location.protocol === 'chrome-extension:'
      if (isExtension) {
        const c = (window as any).chrome
        const url = c?.runtime?.getURL ? c.runtime.getURL('sandbox.html') : 'sandbox.html'
        console.log('[PreviewRunner] computed sandboxSrc (extension)', { url })
        return url
      }
    } catch (e) {
      console.warn('[PreviewRunner] sandboxSrc compute error', e)
    }
    const url = '/sandbox.html'
    console.log('[PreviewRunner] computed sandboxSrc (dev)', { url })
    return url
  }, [])

  const entryCandidates = useMemo(() => {
    const paths = filesState.map(f => f.path)
    const htmls = paths.filter(p => p.toLowerCase().endsWith('.html'))
    const preferred = ['index.html', 'popup.html', 'options.html'].filter(p => htmls.includes(p))
    return [...preferred, ...htmls.filter(p => !preferred.includes(p))]
  }, [filesState])

  function pickDefaultEntry(candidates: string[]): string | null {
    if (candidates.length === 0) return null
    const activeId = activeProjectIdRef.current
    const metaActive = fileSystem.getProjectList().find(p => p.id === activeId)?.activeFilePath || null
    if (metaActive && candidates.includes(metaActive)) return metaActive
    if (candidates.includes('index.html')) return 'index.html'
    return candidates[0] || null
  }

  useEffect(() => {
    if (entryCandidates.length === 0) {
      setEntry(null)
      return
    }
    setEntry(prev => (prev && entryCandidates.includes(prev) ? prev : pickDefaultEntry(entryCandidates)))
  }, [entryCandidates])

  async function buildAndMaybeRun(reason: string) {
    const pid = fileSystem.getActiveProjectId()
    dlog(`${reason} → fetch`, { pid })
    if (!pid) {
      setFilesState([])
      setEntry(null)
      setStatus('idle')
      pendingPayloadRef.current = null
      return
    }
    // Race guard: ensure requested project is still active
    if (pid !== activeProjectIdRef.current) {
      dlog('active changed during fetch (pre)', { pid, active: activeProjectIdRef.current })
      return
    }
    const nodes = fileSystem.getAllFiles(pid)
    const files: Asset[] = nodes.map(f => ({ path: normalize(f.path), content: f.content ?? '' }))
    // Race guard again after potentially expensive mapping (defensive)
    if (pid !== activeProjectIdRef.current) {
      dlog('active changed during fetch (post)', { pid, active: activeProjectIdRef.current })
      return
    }
    setFilesState(files)

    if (!files.length) {
      setEntry(null)
      setStatus('idle')
      pendingPayloadRef.current = null
      return
    }

   let entryPath = entry
   const candidates = files.filter(f => f.path.toLowerCase().endsWith('.html')).map(f => f.path)
   if (!entryPath || !candidates.includes(entryPath)) {
     entryPath = pickDefaultEntry(candidates)
     setEntry(entryPath)
   }
   if (!entryPath) {
     setStatus('idle')
     pendingPayloadRef.current = null
     return
   }

    const payload = { entryPath, files, projectId: pid }
    if (!sandboxReadyRef.current) {
      dlog('queue RUN until READY', { projectId: pid, files: files.length, entryPath })
      pendingPayloadRef.current = payload
      setStatus('building')
      return
    }

    const win = iframeRef.current?.contentWindow
    if (!win) {
      console.warn('[PreviewRunner] no iframe.contentWindow yet; deferring RUN', { entryPath })
      pendingPayloadRef.current = payload
      setStatus('building')
      return
    }
    try {
      dlog(`RUN for project ${pid} files=${files.length}`, { entryPath })
      win.postMessage({ type: 'RUN', entryPath, files }, '*')
      setTimeout(() => setStatus('ready'), 0)
    } catch (e) {
      console.error('[PreviewRunner] sandbox run error', e)
      setStatus('idle')
    }
  }

  // Send a custom payload to sandbox (used by preview:run toolbar action)
  function postRun(entryPath: string, files: Asset[]) {
    const win = iframeRef.current?.contentWindow
    // Basic guard + error rendering
    if (!files || files.length === 0 || !entryPath) {
      const errHtml =
        '<!doctype html><html><body><pre style="color:#ef4444;font-family:monospace;padding:12px;">No files or entry to run.</pre></body></html>'
      const payloadFiles: Asset[] = [{ path: '__error__.html', content: errHtml }]
      const payloadEntry = '__error__.html'
      if (win && sandboxReadyRef.current) {
        try {
          win.postMessage({ type: 'RUN', entryPath: payloadEntry, files: payloadFiles }, '*')
          setTimeout(() => setStatus('ready'), 0)
        } catch {
          setStatus('idle')
        }
      } else {
        pendingPayloadRef.current = {
          entryPath: payloadEntry,
          files: payloadFiles,
          projectId: activeProjectIdRef.current || 'unknown',
        }
        setStatus('building')
      }
      return
    }

    if (win && sandboxReadyRef.current) {
      try {
        dlog(`RUN (preview:run) files=${files.length}`, { entryPath })
        win.postMessage({ type: 'RUN', entryPath, files }, '*')
        setTimeout(() => setStatus('ready'), 0)
      } catch (e) {
        console.error('[PreviewRunner] sandbox run error', e)
        setStatus('idle')
      }
    } else {
      pendingPayloadRef.current = { entryPath, files, projectId: activeProjectIdRef.current || 'unknown' }
      setStatus('building')
    }
  }

  function scheduleDebouncedRun() {
    if (debounceTimerRef.current) {
      window.clearTimeout(debounceTimerRef.current)
      debounceTimerRef.current = null
    }
    dlog('tree:changed → debounce')
    debounceTimerRef.current = window.setTimeout(() => {
      buildAndMaybeRun('debounced:tree:changed')
    }, 180)
  }

  // EventBus subscriptions
  useEffect(() => {
    const offActive = on('project:activeChanged', ({ projectId }) => {
      dlog('project:activeChanged', { projectId })
      activeProjectIdRef.current = projectId
      if (debounceTimerRef.current) {
        window.clearTimeout(debounceTimerRef.current)
        debounceTimerRef.current = null
      }
      buildAndMaybeRun('project:activeChanged')
    })
    const offTree = on('tree:changed', ({ projectId }) => {
      if (projectId !== activeProjectIdRef.current) return
      scheduleDebouncedRun()
    })
    // initial run
    buildAndMaybeRun('mount')
    return () => {
      offActive()
      offTree()
      if (debounceTimerRef.current) {
        window.clearTimeout(debounceTimerRef.current)
        debounceTimerRef.current = null
      }
    }
  }, [])

  // Run when user manually changes entry selection
  useEffect(() => {
    if (!entry) {
      setStatus('idle')
      return
    }
    if (sandboxReadyRef.current && filesState.length > 0) {
      const pid = activeProjectIdRef.current
      if (pid) {
        const payload = { entryPath: entry, files: filesState, projectId: pid }
        const win = iframeRef.current?.contentWindow
        if (win) {
          dlog(`RUN for project ${pid} files=${filesState.length}`, { entryPath: entry })
          try {
            win.postMessage({ type: 'RUN', entryPath: entry, files: filesState }, '*')
            setTimeout(() => setStatus('ready'), 0)
          } catch (e) {
            console.error('[PreviewRunner] sandbox run error', e)
            setStatus('idle')
          }
        } else {
          pendingPayloadRef.current = payload
          setStatus('building')
        }
      }
    }
  }, [entry])

  function openInNewTab(entryPath: string) {
    try {
      const sid = Math.random().toString(36).slice(2)
      const payload = { entryPath, files: filesState }
      localStorage.setItem(`extendy:sandbox:nav:${sid}`, JSON.stringify(payload))
      const url = `${sandboxSrc}?sid=${encodeURIComponent(sid)}`
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (e) {
      console.error('[PreviewRunner] openInNewTab error', e)
      alert('Failed to open sandbox in a new tab. See console for details.')
    }
  }

  // Listen for handshake from sandbox page
  useEffect(() => {
    dlog('attaching message listener for SANDBOX_READY')
    const onMsg = (ev: MessageEvent) => {
      try {
        dlog('received message from sandbox', ev.data)
      } catch {}
      const data = ev.data as any
      if (data && typeof data === 'object' && data.type === 'SANDBOX_READY') {
        const iframeWin = iframeRef.current?.contentWindow || null
        const fromIframe = !!iframeWin && ev.source === iframeWin
        dlog('SANDBOX_READY received', { fromIframe })
        sandboxReadyRef.current = true
        // stop pinging
        if (pingTimerRef.current) {
          window.clearInterval(pingTimerRef.current)
          pingTimerRef.current = null
        }

        // choose payload: pending first, else current state
        const pending = pendingPayloadRef.current
        const payload = pending
          ? { entryPath: pending.entryPath, files: pending.files }
          : (entry && filesState.length > 0 ? { entryPath: entry, files: filesState } : null)

        if (payload) {
          let sent = false
          const trySend = (win: Window | null, label: string) => {
            if (!win) return
            try {
              win.postMessage({ type: 'RUN', ...payload }, '*')
              dlog('sent RUN', { label, entryPath: payload.entryPath, filesCount: payload.files.length })
              sent = true
            } catch (e) {
              console.error('[PreviewRunner] failed to send RUN', { label, error: e })
            }
          }
          const sourceWin = (ev.source && typeof (ev.source as Window).postMessage === 'function')
            ? (ev.source as Window)
            : null
          trySend(sourceWin, 'ev.source')
          if (!fromIframe) {
            trySend(iframeWin, 'iframe.contentWindow')
          }
          if (!sent && iframeWin) {
            console.warn('[PreviewRunner] RUN not sent via postMessage; trying iframe direct')
            trySend(iframeWin, 'iframe.contentWindow(fallback)')
          } else if (!sent) {
            setTimeout(() => {
              if (iframeRef.current?.contentWindow && entry) {
                dlog('retrying RUN after READY')
                iframeRef.current.contentWindow?.postMessage({ type: 'RUN', entryPath: entry, files: filesState }, '*')
              }
            }, 300)
          } else {
            setTimeout(() => setStatus('ready'), 0)
          }
        } else {
          console.warn('[PreviewRunner] READY received but no entry selected yet')
        }
        // clear pending once handled
        pendingPayloadRef.current = null
      }
    }
    window.addEventListener('message', onMsg)
    // start ping loop until READY
    startPing()
    return () => {
      window.removeEventListener('message', onMsg)
      if (pingTimerRef.current) {
        window.clearInterval(pingTimerRef.current)
        pingTimerRef.current = null
      }
    }
  }, [entry, filesState])

  // Subscribe to preview:run events from toolbar and forward to sandbox
  useEffect(() => {
    const offRun = on('preview:run', (payload: PreviewRunPayload) => {
      try {
        const filesMap = payload?.files || {}
        const keys = Object.keys(filesMap)
        // Build assets from file map
        const assets: Asset[] = keys.map((k) => ({
          path: normalize(k),
          content: String(filesMap[k] ?? ''),
        }))

        // Map for case-insensitive lookup
        const actualByLc = new Map<string, string>()
        for (const k of keys) actualByLc.set(k.toLowerCase(), k)

        let entryPath = (payload?.entry || '').trim()
        const lower = entryPath.toLowerCase()
        const isHtml = lower.endsWith('.html') || lower.endsWith('.htm')
        const isScript =
          lower.endsWith('.js') || lower.endsWith('.mjs') || lower.endsWith('.ts') || lower.endsWith('.tsx') || lower.endsWith('.jsx')

        if (!keys.length || !entryPath) {
          postRun('__error__.html', [
            {
              path: '__error__.html',
              content:
                '<!doctype html><html><body><pre style="color:#ef4444;font-family:monospace;padding:12px;">No files to run.</pre></body></html>',
            },
          ])
          return
        }

        if (isHtml) {
          const actual = actualByLc.get(entryPath.toLowerCase())
          entryPath = actual || entryPath
          postRun(entryPath, assets)
          return
        }

        if (isScript) {
          // Synthesize minimal HTML shell with inline CSS and a module script for the entry code
          const cssContents = keys
            .filter((k) => k.toLowerCase().endsWith('.css'))
            .map((k) => String(filesMap[k] ?? ''))
          const entryActual = actualByLc.get(entryPath.toLowerCase()) || entryPath
          const code = String(filesMap[entryActual] ?? '')

          const htmlParts: string[] = []
          htmlParts.push('<!doctype html>')
          htmlParts.push('<html>')
          htmlParts.push('<head>')
          htmlParts.push('<meta charset="utf-8" />')
          htmlParts.push('<meta name="viewport" content="width=device-width, initial-scale=1" />')
          for (const css of cssContents) {
            htmlParts.push('<style>')
            htmlParts.push(css)
            htmlParts.push('</style>')
          }
          htmlParts.push('</head>')
          htmlParts.push('<body>')
          htmlParts.push('<div id="root"></div>')
          htmlParts.push('<script type="module">')
          htmlParts.push(code)
          htmlParts.push('</script>')
          htmlParts.push('</body>')
          htmlParts.push('</html>')

          const synthetic = { path: '__entry__.html', content: htmlParts.join('\n') }
          postRun(synthetic.path, [...assets, synthetic])
          return
        }

        // Unsupported entry type -> show error
        postRun('__error__.html', [
          {
            path: '__error__.html',
            content:
              '<!doctype html><html><body><pre style="color:#ef4444;font-family:monospace;padding:12px;">Unsupported entry type. Choose an HTML or script file.</pre></body></html>',
          },
        ])
      } catch (e) {
        console.error('[PreviewRunner] preview:run handler error', e)
        postRun('__error__.html', [
          {
            path: '__error__.html',
            content:
              '<!doctype html><html><body><pre style="color:#ef4444;font-family:monospace;padding:12px;">Failed to run preview.</pre></body></html>',
          },
        ])
      }
    })
    return () => {
      offRun()
    }
  }, [])

  const hasPopup = entryCandidates.includes('popup.html')
  const hasOptions = entryCandidates.includes('options.html')

  return (
    <div className="h-full flex flex-col rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 dark:border-gray-800">
        <span className="text-xs text-gray-600 dark:text-gray-400">Preview</span>
        <div className="flex items-center gap-2">
          <select
            value={entry ?? ''}
            onChange={(e) => setEntry(e.target.value || null)}
            className="text-xs px-2 py-1 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100"
            title="Select entry HTML"
          >
            {entryCandidates.length === 0 && <option value="">No HTML entries</option>}
            {entryCandidates.map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>

          {(hasPopup || hasOptions) && (
            <div className="flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400">
              {hasPopup && (
                <button
                  onClick={() => setEntry('popup.html')}
                  className={`px-2 py-1 rounded border ${entry === 'popup.html' ? 'border-blue-400 text-blue-600 dark:text-blue-300' : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                  title="Preview popup.html"
                >
                  popup
                </button>
              )}
              {hasOptions && (
                <button
                  onClick={() => setEntry('options.html')}
                  className={`px-2 py-1 rounded border ${entry === 'options.html' ? 'border-blue-400 text-blue-600 dark:text-blue-300' : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                  title="Preview options.html"
                >
                  options
                </button>
              )}
            </div>
          )}
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-2">
          <span className="text-[11px] text-gray-500 dark:text-gray-500">{status === 'building' ? 'Building…' : status === 'ready' ? 'Ready' : ''}</span>
          <button
            onClick={() => buildAndMaybeRun('manual:refresh')}
            className="text-xs px-2 py-1 rounded border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
            title="Refresh preview"
          >
            Refresh
          </button>
          <button
            onClick={() => entry && openInNewTab(entry)}
            className="text-xs px-2 py-1 rounded border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
            title="Open sandbox in a new tab"
          >
            Open Tab
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <iframe
          ref={iframeRef}
          title="Project Preview"
          src={sandboxSrc}
          sandbox="allow-scripts allow-modals allow-same-origin"
          onLoad={() => { console.log('[PreviewRunner] iframe onLoad', { src: sandboxSrc }); pingOnce(); startPing(); }}
          style={{ width: '100%', height: '100%', border: '0' }}
        />
      </div>
    </div>
  )
}