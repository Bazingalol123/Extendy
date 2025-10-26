import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import MonacoESMEditor from './MonacoESMEditor'
import debounce from 'lodash.debounce'
import { fileSystem } from '../services/fileSystem'
import { useTheme } from '../hooks/useTheme'
import type { editor as MonacoEditorNS } from 'monaco-editor'

function extToLanguage(path: string): string {
  const m = path.toLowerCase().match(/\.([a-z0-9]+)$/)
  const ext = m?.[1] || ''
  switch (ext) {
    case 'ts': return 'typescript'
    case 'tsx': return 'typescript'
    case 'js': return 'javascript'
    case 'jsx': return 'javascript'
    case 'json': return 'json'
    case 'css': return 'css'
    case 'html': return 'html'
    case 'md': return 'markdown'
    default: return 'javascript'
  }
}

/**
 * Public CodeEditor facade that renders the MonacoESMEditor internally.
 *
 * Dual mode:
 * - Controlled: provide value and onChange to control the editor externally.
 * - FS-backed (legacy, default): omit value; the editor will bind to the app's fileSystem active file.
 */
export type CodeEditorProps = {
  /** Controlled content; when provided, the editor runs in controlled mode */
  value?: string
  /** Called with raw string on content changes */
  onChange?: (value: string) => void
  /** Explicit language id (e.g. "typescript"). If omitted, derived from fileName or defaults to "javascript" */
  language?: string
  /** Used for language auto-detection when language is not provided */
  fileName?: string
  /** Applied to the inner Monaco container to allow sizing/styling */
  className?: string
  /** Make editor read-only */
  readOnly?: boolean
  /** Called when the Monaco editor instance is created */
  onMount?: (editor: MonacoEditorNS.IStandaloneCodeEditor) => void
  /** Called when the editor is disposed */
  onUnmount?: () => void
}

export default function CodeEditor({
  value: controlledValue,
  onChange: controlledOnChange,
  language: propLanguage,
  fileName,
  className,
  readOnly,
  onMount,
  onUnmount,
}: CodeEditorProps) {
  const { theme } = useTheme()

  // Legacy FS-backed states (used only when uncontrolled)
  const [activePath, setActivePath] = useState<string | null>(null)
  const [value, setValue] = useState<string>('')
  const [dirty, setDirty] = useState<boolean>(false)
  const savingRef = useRef(false)
  const [externalPending, setExternalPending] = useState<boolean>(false)
  const lastReadRef = useRef<string>('')

  const isControlled = controlledValue !== undefined

  // FS-backed file pump (inactive in controlled mode)
  useEffect(() => {
    if (isControlled) return

    const pump = () => {
      const activeId = fileSystem.getActiveProjectId()
      if (!activeId) {
        setActivePath(null)
        if (!dirty) {
          setValue('')
        }
        setDirty(false)
        return
      }
      const projects = fileSystem.getProjectList()
      const meta = projects.find(p => p.id === activeId) || null
      const nextPath = meta?.activeFilePath || null
      const changedFile = nextPath !== activePath
      setActivePath(nextPath)

      if (nextPath) {
        const rf = fileSystem.readFile(nextPath, activeId)
        const content = rf?.content ?? ''
        lastReadRef.current = content
        if (changedFile || (!dirty && !savingRef.current)) {
          setValue(content)
          setDirty(false)
          setExternalPending(false)
        } else {
          if (content !== value) {
            setExternalPending(true)
          }
        }
      } else {
        if (!dirty) {
          setValue('')
        }
        setDirty(false)
        setExternalPending(false)
      }
    }
    pump()
    const unsub = fileSystem.subscribe(pump)
    return unsub
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePath, dirty, value, isControlled])

  const doSave = useCallback(() => {
    if (isControlled) return
    if (!activePath) return
    try {
      savingRef.current = true
      fileSystem.updateFile(activePath, value)
      setDirty(false)
      setExternalPending(false)
    } finally {
      savingRef.current = false
    }
  }, [activePath, value, isControlled])

  // Debounced autosave (500ms idle) for FS-backed mode
  const debouncedSave = useMemo(() => debounce(() => {
    if (isControlled) return
    if (!savingRef.current) {
      doSave()
    }
  }, 500), [doSave, isControlled])

  // Ctrl/Cmd+S handling (FS-backed only)
  const handleKeyDown = useCallback((e: any) => {
    if (isControlled) return
    const isMac = navigator.platform.toUpperCase().includes('MAC')
    if ((isMac ? e.metaKey : e.ctrlKey) && e.key.toLowerCase() === 's') {
      e.preventDefault()
      doSave()
    }
  }, [doSave, isControlled])

  // Warn before unload if dirty (FS-backed only)
  useEffect(() => {
    if (isControlled) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty, isControlled])

  // Compute effective language
  const effectiveLanguage =
    propLanguage
      || (fileName ? extToLanguage(fileName) : undefined)
      || (activePath ? extToLanguage(activePath) : undefined)
      || 'javascript'

  const monacoCommonOptions = {
    minimap: { enabled: false },
    fontSize: 13,
    scrollBeyondLastLine: false,
    automaticLayout: true,
    tabSize: 2,
  } as const

  const handleEditorChange = (next?: string) => {
    const text = next ?? ''
    if (isControlled) {
      controlledOnChange?.(text)
    } else {
      setValue(text)
      setDirty(true)
      debouncedSave()
    }
  }

  return (
    <div className="h-full flex flex-col rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
      {!isControlled && (
        <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-gray-800">
          <div className="text-xs text-gray-700 dark:text-gray-300">
            {activePath ? activePath : 'No file selected'}
            {dirty ? ' • unsaved' : ''}
            {externalPending ? ' • update available' : ''}
          </div>
          <div className="flex items-center gap-2">
            {externalPending && activePath && (
              <button
                onClick={() => {
                  setValue(lastReadRef.current)
                  setDirty(false)
                  setExternalPending(false)
                }}
                className="text-xs px-2 py-1 rounded border border-amber-300 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/30"
                title="Reload changes from disk"
              >
                Reload
              </button>
            )}
            <button
              onClick={doSave}
              disabled={!dirty || !activePath}
              className="text-xs px-2 py-1 rounded border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
              title="Save (Ctrl/Cmd+S)"
            >
              Save
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0" onKeyDown={handleKeyDown}>
        {isControlled ? (
          <MonacoESMEditor
            value={controlledValue ?? ''}
            language={effectiveLanguage}
            theme={theme === 'dark' ? 'dark' : 'light'}
            options={monacoCommonOptions as any}
            onChange={handleEditorChange}
            readOnly={readOnly}
            className={className}
            onMount={onMount}
            onUnmount={onUnmount}
          />
        ) : activePath ? (
          <MonacoESMEditor
            value={value}
            language={effectiveLanguage}
            theme={theme === 'dark' ? 'dark' : 'light'}
            options={monacoCommonOptions as any}
            onChange={handleEditorChange}
            onBlur={() => {
              if (dirty) doSave()
            }}
            onSave={doSave}
            readOnly={readOnly}
            className={className}
            onMount={onMount}
            onUnmount={onUnmount}
          />
        ) : (
          <div className="h-full grid place-items-center text-sm text-gray-500 dark:text-gray-500">
            Select a file to edit
          </div>
        )}
      </div>
    </div>
  )
}