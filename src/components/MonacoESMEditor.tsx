import { useEffect, useRef } from 'react'
import { ensureMonacoWorkersInitialized } from '../monaco/setup'
import * as monaco from 'monaco-editor'
import { useTheme } from '../hooks/useTheme'

// Ensure Monaco workers mapping is set before any editor usage
ensureMonacoWorkersInitialized()

// ESM Monaco editor wrapper compatible with MV3 (no AMD loader, no blob workers).
// Relies on global MonacoEnvironment provided by ../monaco/setup

export type MonacoESMEditorProps = {
  value: string
  language: string
  // Optional internal override; defaults to app theme via useTheme
  theme?: 'light' | 'dark'
  onChange: (next: string) => void
  options?: monaco.editor.IStandaloneEditorConstructionOptions
  onBlur?: () => void
  onSave?: () => void
  readOnly?: boolean
  className?: string
  onMount?: (editor: monaco.editor.IStandaloneCodeEditor) => void
  onUnmount?: () => void
}
 
export default function MonacoESMEditor({
  value,
  language,
  theme,
  onChange,
  options,
  onBlur,
  onSave,
  readOnly,
  className,
  onMount,
  onUnmount,
}: MonacoESMEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const modelRef = useRef<monaco.editor.ITextModel | null>(null)
  const updatingRef = useRef(false)

  // App theme integration: derive effective theme
  const { theme: appTheme } = useTheme()
  const effectiveTheme = (theme ?? appTheme)
  const isDark = effectiveTheme === 'dark'
  // Init editor
  useEffect(() => {
    if (!containerRef.current) return

    // Apply initial theme before creating editor to avoid flash
    monaco.editor.setTheme(isDark ? 'vs-dark' : 'vs')

    // Create or reuse a model so language switching is smooth
    modelRef.current = monaco.editor.createModel(value ?? '', language || 'plaintext')
 
    editorRef.current = monaco.editor.create(containerRef.current, {
      model: modelRef.current,
      automaticLayout: true,
      fontSize: 13,
      scrollBeyondLastLine: false,
      minimap: { enabled: false },
      tabSize: 2,
      ...options,
      // Prop has precedence over options if provided
      readOnly: readOnly ?? options?.readOnly,
    })
 
    // Notify mount with the created editor instance
    onMount?.(editorRef.current)
 
    const sub = editorRef.current.onDidChangeModelContent(() => {
      if (updatingRef.current) return
      const next = editorRef.current!.getValue()
      onChange(next)
    })
 
    // Map blur to autosave hook (fire for both text/widget blur to be safe)
    const blurSubs: monaco.IDisposable[] = []
    blurSubs.push(editorRef.current.onDidBlurEditorText(() => { onBlur?.() }))
    blurSubs.push(editorRef.current.onDidBlurEditorWidget(() => { onBlur?.() }))
 
    // Ctrl/Cmd+S inside Monaco triggers onSave
    editorRef.current.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      onSave?.()
    })
 
    return () => {
      try { sub.dispose() } catch {}
      // blur subscriptions
      try { blurSubs.forEach(d => d.dispose()) } catch {}
      // Dispose editor first, then model
      try { editorRef.current?.dispose() } catch {}
      try { modelRef.current?.dispose() } catch {}
      editorRef.current = null
      modelRef.current = null
      try { onUnmount?.() } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
 
  // Theme update (follow app theme or optional override)
  useEffect(() => {
    monaco.editor.setTheme(isDark ? 'vs-dark' : 'vs')
  }, [isDark])
 
  // Language update
  useEffect(() => {
    if (!modelRef.current) return
    const lang = (language || 'plaintext')
    // monaco types don't export a LanguageId union; pass string
    monaco.editor.setModelLanguage(modelRef.current, lang as any)
  }, [language])
 
  // Reflect readOnly changes live
  useEffect(() => {
    if (editorRef.current && readOnly !== undefined) {
      editorRef.current.updateOptions({ readOnly })
    }
  }, [readOnly])
 
  // Value update from outside
  useEffect(() => {
    const ed = editorRef.current
    const m = modelRef.current
    if (!ed || !m) return
    const current = m.getValue()
    if (current !== value) {
      updatingRef.current = true
      m.pushEditOperations(
        [],
        [
          {
            range: m.getFullModelRange(),
            text: value ?? '',
          },
        ],
        () => null
      )
      updatingRef.current = false
    }
  }, [value])
 
  return <div ref={containerRef} className={className} style={{ width: '100%', height: '100%' }} />
}