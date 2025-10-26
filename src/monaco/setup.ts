/**
 * Monaco worker setup using Vite ?worker imports.
 * Centralized and idempotent initializer for worker mapping.
 */
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api'
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import TsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import CssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import HtmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'


type MonacoEnv = {
  globalAPI?: boolean
  getWorker: (moduleId: string, label: string) => Worker
}

declare global {
  interface Window {
    MonacoEnvironment?: MonacoEnv
  }
}

let installed = false

export function ensureMonacoWorkersInitialized() {
  if (installed) return
  installed = true

  // Touch the API import so it isn't tree-shaken away in some builds
  void monaco

  ;(globalThis as any).MonacoEnvironment = {
    globalAPI: true,
    getWorker(_moduleId: string, label: string): Worker {
      switch (label) {
        case 'typescript':
        case 'javascript':
          return new TsWorker()
        case 'json':
          return new JsonWorker()
        case 'css':
        case 'scss':
        case 'less':
          return new CssWorker()
        case 'html':
        case 'handlebars':
        case 'razor':
          return new HtmlWorker()
        default:
          return new EditorWorker()
      }
    },
  }
}