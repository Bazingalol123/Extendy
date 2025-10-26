import { useEffect, useMemo, useState, useCallback } from 'react'
import { fileSystem, on as fsOn, off as fsOff } from '../services/fileSystem'
import eventBus, { type PreviewRunPayload } from '../services/eventBus'

type ProjectMeta = ReturnType<typeof fileSystem.getProjectList>[number]

function formatTs(ts: number) {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`
}

export default function ProjectToolbar() {
  const [projects, setProjects] = useState<ProjectMeta[]>(() => fileSystem.getProjectList())
  const [activeId, setActiveId] = useState<string | null>(() => fileSystem.getActiveProjectId())

  useEffect(() => {
    // initial sync
    setProjects(fileSystem.getProjectList())
    setActiveId(fileSystem.getActiveProjectId())

    // subscribe to EventBus updates
    const unsubList = fsOn('project:listChanged', () => {
      setProjects(fileSystem.getProjectList())
    })
    const unsubActive = fsOn('project:activeChanged', ({ projectId }) => {
      setActiveId(projectId)
    })

    return () => {
      unsubList?.()
      unsubActive?.()
    }
  }, [])

  const activeProject = useMemo(
    () => projects.find(p => p.id === activeId) || null,
    [projects, activeId]
  )

  /** Create a starter project with default incremental name "Project N" and activate it. */
  const onNewProject = useCallback(() => {
    const base = 'Project'
    let max = 0
    for (const p of projects) {
      const m = /^Project(?:\s+(\d+))?$/.exec(p.name.trim())
      if (m) {
        const n = m[1] ? parseInt(m[1], 10) : 1
        if (!Number.isNaN(n) && n > max) max = n
      }
    }
    const name = `${base} ${max + 1}`
    const id = fileSystem.createProject(name, true)
    if (id) fileSystem.setActiveProject(id)
  }, [projects])

  /** Duplicate the active project as "Copy of {activeName}" and activate it. */
  const onDuplicateProject = useCallback(async () => {
    if (!activeProject) return
    const activeIdLocal = activeProject.id
    const desiredName = `Copy of ${activeProject.name}`

    try {
      const maybeDuplicate = (fileSystem as any).createProjectDuplicate
      let newId: string | null = null
      if (typeof maybeDuplicate === 'function') {
        newId = maybeDuplicate.call(fileSystem, activeIdLocal, { name: desiredName })
      } else {
        // Fallback: manual duplicate using createProject + copy files
        const id = fileSystem.createProject(desiredName, false)
        const files = fileSystem.getAllFiles(activeIdLocal)
        for (const f of files) {
          fileSystem.writeFile(f.path, f.content ?? '', undefined, id)
        }
        newId = id
      }
      if (newId) fileSystem.setActiveProject(newId)
    } catch (e) {
      console.error('Duplicate project failed', e)
      alert('Failed to duplicate project.')
    }
  }, [activeProject])

  /** Delete the active project after confirmation. Fallback active is handled by FileSystem. */
  const onDeleteProject = useCallback(() => {
    if (!activeProject) return
    const ok = confirm(`Delete project “${activeProject.name}”? This cannot be undone.`)
    if (!ok) return
    fileSystem.deleteProject(activeProject.id)
  }, [activeProject])

  /** Switch active project via dropdown. */
  const onSwitchProject = useCallback((id: string) => {
    fileSystem.setActiveProject(id)
  }, [])

  /** Run the current project in the Preview iframe via event bus. */
  const onRunProject = useCallback(() => {
    // Collect all files from the active project (text-only content)
    const nodes = fileSystem.getAllFiles()
    const filesMap: Record<string, string> = {}
    for (const f of nodes) {
      // Normalize path (no leading slashes)
      const p = (f.path || '').replace(/^\/+/, '')
      filesMap[p] = String(f.content ?? '')
    }

    // Determine entry by priority
    const priority = ['index.html', 'index.tsx', 'index.ts', 'index.jsx', 'index.js']
    const lcToActual = new Map<string, string>()
    Object.keys(filesMap).forEach((k) => lcToActual.set(k.toLowerCase(), k))

    let entry: string | undefined
    for (const cand of priority) {
      const hit = lcToActual.get(cand.toLowerCase())
      if (hit) {
        entry = hit
        break
      }
    }

    // Fallbacks: active file path → first text file
    if (!entry) {
      const activePath = (projects.find(p => p.id === activeId)?.activeFilePath) || null
      if (activePath) {
        entry = lcToActual.get(activePath.toLowerCase()) || (filesMap[activePath] != null ? activePath : undefined)
      }
    }
    if (!entry) {
      const first = Object.keys(filesMap)[0]
      if (first) entry = first
    }

    // Emit preview:run with payload
    const payload: PreviewRunPayload = {
      files: filesMap,
      entry: entry || '' // empty signals preview to show an error
    }
    eventBus.emit('preview:run', payload)
  }, [projects, activeId])

  return (
    <div className="w-full flex items-center gap-2 p-2 border border-gray-200 dark:border-gray-800 rounded-lg bg-white/70 dark:bg-gray-900/70 backdrop-blur">
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-600 dark:text-gray-400">Project</span>
        <select
          className="text-sm px-2 py-1 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
          value={activeId ?? ''}
          onChange={(e) => onSwitchProject(e.target.value)}
        >
          {projects.length === 0 ? (
            <option value="">No projects</option>
          ) : (
            projects.map(p => (
              <option key={p.id} value={p.id}>
                {p.name} {activeId === p.id ? '•' : ''}
              </option>
            ))
          )}
        </select>
      </div>

      <div className="flex-1" />

      <div className="flex items-center gap-2">
        <button
          onClick={onRunProject}
          className="text-sm px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white"
          title="Run project in preview"
        >
          Run
        </button>
        <button
          onClick={onNewProject}
          className="text-sm px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white"
          title="Create new project"
        >
          New
        </button>
        <button
          onClick={onDuplicateProject}
          disabled={!activeProject}
          className="text-sm px-3 py-1.5 rounded-md border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-800 dark:text-gray-100 disabled:opacity-50"
          title="Duplicate active project"
        >
          Duplicate
        </button>
        <button
          onClick={onDeleteProject}
          disabled={!activeProject}
          className="text-sm px-3 py-1.5 rounded-md border border-rose-200 dark:border-rose-800 hover:bg-rose-50 dark:hover:bg-rose-900/30 text-rose-700 dark:text-rose-300 disabled:opacity-50"
          title="Delete active project"
        >
          Delete
        </button>
      </div>
    </div>
  )
}