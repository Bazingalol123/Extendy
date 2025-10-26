// Sandbox runner script
// Receives files from the parent (options page) and renders a preview
// inside an iframe using srcdoc and blob: URLs created within the sandbox
// context (MV3 allows blob in sandboxed pages).

type FileAsset = { path: string; content: string }

function normalize(p: string) {
  return p.replace(/^\/+/, '').replace(/\/+/g, '/')
}
function dirname(p: string) {
  const i = p.lastIndexOf('/')
  return i === -1 ? '' : p.slice(0, i)
}
function isExternalUrl(href: string) {
  return /^(https?:)?\/\//i.test(href) || href.startsWith('data:')
}
function joinPath(base: string, rel: string) {
  if (!base) return normalize(rel)
  const baseParts = base.split('/').filter(Boolean)
  const relParts = rel.split('/').filter(Boolean)
  const out: string[] = [...baseParts]
  for (const seg of relParts) {
    if (seg === '.') continue
    if (seg === '..') {
      out.pop()
      continue
    }
    out.push(seg)
  }
  return normalize(out.join('/'))
}
function extToMime(path: string): string {
  const lower = path.toLowerCase()
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'text/html'
  if (lower.endsWith('.css')) return 'text/css'
  if (lower.endsWith('.js')) return 'text/javascript'
  if (lower.endsWith('.mjs')) return 'text/javascript'
  if (lower.endsWith('.json')) return 'application/json'
  if (lower.endsWith('.svg')) return 'image/svg+xml'
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.gif')) return 'image/gif'
  if (lower.endsWith('.txt')) return 'text/plain'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.ico')) return 'image/x-icon'
  return 'application/octet-stream'
}

// Utilities for inline/data: URL fallbacks when origin is opaque (blob:null)
function toBase64(str: string): string {
  try {
    return btoa(unescape(encodeURIComponent(str)))
  } catch {
    // best effort
    return btoa(str)
  }
}
function createDataUrl(path: string, content: string): string {
  const type = extToMime(path)
  return `data:${type};base64,${toBase64(content ?? '')}`
}

const currentUrls: string[] = []
function cleanupBlobUrls() {
  for (const u of currentUrls) {
    try { URL.revokeObjectURL(u) } catch {}
  }
  currentUrls.length = 0
}
function createBlobUrl(path: string, content: string): string {
  const type = extToMime(path)
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  currentUrls.push(url)
  return url
}

function rewriteHtml(entryPath: string, files: FileAsset[]): string {
  // map file path -> blob url
  const urlByPath = new Map<string, string>()
  for (const f of files) {
    urlByPath.set(normalize(f.path), createBlobUrl(f.path, f.content ?? ''))
  }

  const entry = files.find(f => normalize(f.path) === normalize(entryPath))
  const html = entry?.content ?? '<!doctype html><html><body><div>Missing entry file</div></body></html>'
  const baseDir = dirname(normalize(entryPath))

  const doc = new DOMParser().parseFromString(html, 'text/html')

  const rewriteAttr = (el: Element, attr: 'src' | 'href') => {
    const val = el.getAttribute(attr)
    if (!val || isExternalUrl(val)) return
    const resolved = joinPath(baseDir, val)
    const url = urlByPath.get(resolved)
    if (url) el.setAttribute(attr, url)
  }

  doc.querySelectorAll('script[src]').forEach(el => rewriteAttr(el, 'src'))
  // Also rewrite any link[href] (not just rel="stylesheet") so styles load even if rel is missing
  doc.querySelectorAll('link[href]').forEach(el => rewriteAttr(el as Element, 'href'))
  doc.querySelectorAll('img[src], source[src], video[src], audio[src]').forEach(el => rewriteAttr(el as Element, 'src'))

  return '<!doctype html>\n' + (doc.documentElement?.outerHTML || html)
}

// Inline-rewrite variant for opaque origins (e.g., extension sandbox => blob:null)
// Inlines script and stylesheet contents; converts basic media to data: URLs.
function rewriteHtmlInline(entryPath: string, files: FileAsset[]): string {
  const byPath = new Map<string, string>()
  for (const f of files) byPath.set(normalize(f.path), f.content ?? '')

  const entry = files.find(f => normalize(f.path) === normalize(entryPath))
  const html = entry?.content ?? '<!doctype html><html><body><div>Missing entry file</div></body></html>'
  const baseDir = dirname(normalize(entryPath))
  const doc = new DOMParser().parseFromString(html, 'text/html')

  const resolveRel = (rel: string | null) => (rel ? joinPath(baseDir, rel) : null)

  // Inline <script src>, preserve type attribute if present
  doc.querySelectorAll('script[src]').forEach((node) => {
    const el = node as HTMLScriptElement
    const val = el.getAttribute('src')
    if (!val || isExternalUrl(val)) return
    const resolved = resolveRel(val)
    if (!resolved) return
    const content = byPath.get(resolved)
    if (content == null) return
    const inline = doc.createElement('script')
    const t = el.getAttribute('type')
    if (t) inline.setAttribute('type', t)
    inline.textContent = content
    el.replaceWith(inline)
  })

  // Inline stylesheets and handle preload/modulepreload to avoid fetches
  doc.querySelectorAll('link[href]').forEach((node) => {
    const el = node as HTMLLinkElement
    const val = el.getAttribute('href')
    if (!val || isExternalUrl(val)) return
    const resolved = resolveRel(val)
    if (!resolved) return
    const relAttr = (el.getAttribute('rel') || '').toLowerCase()
    const content = byPath.get(resolved)

    // Stylesheets or any .css file -> inline as <style>
    if (relAttr.includes('stylesheet') || resolved.toLowerCase().endsWith('.css')) {
      if (content != null) {
        const style = doc.createElement('style')
        style.textContent = content
        el.replaceWith(style)
      } else {
        el.remove()
      }
      return
    }

    // modulepreload/preload for JS -> inline as <script> if available, else drop
    if ((relAttr.includes('modulepreload') || relAttr.includes('preload')) && resolved.toLowerCase().endsWith('.js')) {
      if (content != null) {
        const s = doc.createElement('script')
        // Keep it classic to avoid further network imports from ESM graph
        s.textContent = content
        el.replaceWith(s)
      } else {
        el.remove()
      }
      return
    }

    // Non-critical internal links (icons, manifests, etc.) -> drop to avoid blocked fetches
    el.remove()
  })

  // Convert media to data: URLs where possible
  doc.querySelectorAll('img[src], source[src], video[src], audio[src]').forEach((node) => {
    const el = node as HTMLElement
    const val = el.getAttribute('src')
    if (!val || isExternalUrl(val)) return
    const resolved = resolveRel(val)
    if (!resolved) return
    const content = byPath.get(resolved)
    if (content != null) {
      el.setAttribute('src', createDataUrl(resolved, content))
    }
  })

  return '<!doctype html>\n' + (doc.documentElement?.outerHTML || html)
}

let runner: HTMLIFrameElement | null = null

function ensureRunner() {
  if (!runner) {
    runner = document.createElement('iframe')
    runner.id = 'runner'
    // Include allow-same-origin so blob: URLs created in this sandbox are loadable
    runner.setAttribute('sandbox', 'allow-scripts allow-modals allow-same-origin')
    runner.style.width = '100%'
    runner.style.height = '100%'
    runner.style.border = '0'
    const root = document.getElementById('root') || document.body
    root.innerHTML = ''
    root.appendChild(runner)
  }
}

function render(entryPath: string, files: FileAsset[]) {
  try {
    console.log('[sandbox] render()', { entryPath, filesCount: files?.length })
    ensureRunner()
    cleanupBlobUrls()

    const isOpaqueOrigin = (self.origin === 'null')
    const html = isOpaqueOrigin ? rewriteHtmlInline(entryPath, files) : rewriteHtml(entryPath, files)

    if (!runner) return

    if (isOpaqueOrigin) {
      // Opaque origins (e.g., extension sandbox) cannot use blob: (becomes blob:null).
      // Use srcdoc with fully inlined HTML instead.
      runner.removeAttribute('src')
      runner.srcdoc = html
      console.log('[sandbox] render() using srcdoc (inline mode) due to opaque origin')
    } else {
      // Use a blob URL for the entire HTML instead of srcdoc so subresources (blob:http...) load
      const htmlUrl = createBlobUrl('__entry__.html', html)
      runner.removeAttribute('srcdoc')
      runner.src = htmlUrl
      console.log('[sandbox] render() set runner.src to blob html url', htmlUrl)
    }
  } catch (e) {
    console.error('[sandbox] render error', e)
    if (runner) {
      const errHtml = `<!doctype html><html><body><pre style="color:#ef4444;font-family:monospace;padding:12px;">Preview error: ${String(e)}</pre></body></html>`
      // For maximum compatibility on error, use srcdoc
      runner.removeAttribute('src')
      runner.srcdoc = errHtml
    }
  }
}

/**
 * Allow launching sandbox in a separate tab:
 * - The parent stores a payload in localStorage at "extendy:sandbox:nav:{sid}"
 * - We read it using the ?sid=... URL param and render immediately
 */
function getQueryParam(name: string): string | null {
  const m = location.search.match(new RegExp(`[?&]${name}=([^&]+)`))
  return m ? decodeURIComponent(m[1]) : null
}
const __sid = getQueryParam('sid')
if (__sid) {
  try {
    const key = `extendy:sandbox:nav:${__sid}`
    const raw = localStorage.getItem(key)
    if (raw) {
      const payload = JSON.parse(raw)
      if (payload && typeof payload.entryPath === 'string' && Array.isArray(payload.files)) {
        render(payload.entryPath, payload.files)
      }
      // best-effort cleanup
      localStorage.removeItem(key)
    }
  } catch (e) {
    console.warn('[sandbox] nav payload error', e)
  }
}

window.addEventListener('message', (ev) => {
  try {
    console.log('[sandbox] received message', ev.data)
  } catch {}
  const data = ev.data
  if (!data || typeof data !== 'object') return
  if (data.type === 'PING') {
    sendReady()
    return
  }
  if (data.type === 'RUN' && typeof data.entryPath === 'string' && Array.isArray(data.files)) {
    render(data.entryPath, data.files)
  }
})

// Notify parent that sandbox is ready (immediate and on DOMContentLoaded) and respond to PINGs
function sendReady() {
 try {
   console.log('[sandbox] sending SANDBOX_READY')
   window.parent?.postMessage({ type: 'SANDBOX_READY' }, '*')
 } catch {
   // ignore
 }
}

// Send immediately (module evaluated) in case parent is ready
sendReady()

// Also send after DOM is loaded to avoid early-race with parent listener setup
window.addEventListener('DOMContentLoaded', () => {
 sendReady()
})