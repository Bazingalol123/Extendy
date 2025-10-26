import { useEffect, useMemo, useRef, useState } from 'react'
import { Tree, NodeApi, NodeRendererProps } from 'react-arborist'
import { fileSystem, type FileNode, initializeFromStorage } from '../services/fileSystem'
import eventBus from '../services/eventBus'
import { storageV2 } from '../utils/storageV2'

type ExplorerNode = {
  id: string
  name: string
  path: string
  type: 'file' | 'directory'
  content?: string
  children?: ExplorerNode[]
}

// ---- Path + sort helpers (normalized by storageV2.normalizePath) ----
const normalize = (p: string | null | undefined) => storageV2.normalizePath(p || '')

const dirname = (p: string) => {
  const n = normalize(p)
  const i = n.lastIndexOf('/')
  return i === -1 ? '' : n.slice(0, i)
}
const basename = (p: string) => {
  const n = normalize(p)
  const i = n.lastIndexOf('/')
  return i === -1 ? n : n.slice(i + 1)
}

function toExplorer(node: FileNode): ExplorerNode {
  return {
    id: node.path || '/',
    name: node.name,
    path: node.path,
    type: node.type,
    content: node.content,
    children: node.children?.map(toExplorer),
  }
}

function sortNodesStable(arr: ExplorerNode[]): ExplorerNode[] {
  // folder-first, then lexicographic by name (case-insensitive), stable
  const deco = arr.map((n, i) => ({ n, i }))
  deco.sort((a, b) => {
    if (a.n.type !== b.n.type) return a.n.type === 'directory' ? -1 : 1
    const an = (a.n.name || '').toLowerCase()
    const bn = (b.n.name || '').toLowerCase()
    if (an < bn) return -1
    if (an > bn) return 1
    return a.i - b.i
  })
  return deco.map((d) => d.n)
}

function sortTreeDeep(node: ExplorerNode): ExplorerNode {
  const children = node.children ? sortNodesStable(node.children).map(sortTreeDeep) : undefined
  return { ...node, children }
}

function findFileNode(root: FileNode, path: string): FileNode | null {
  const target = normalize(path)
  const rootPath = root.path === '/' ? '' : normalize(root.path)
  if (rootPath === target) return root
  if (!root.children || !root.children.length) return null
  for (const ch of root.children) {
    const hit = findFileNode(ch, path)
    if (hit) return hit
  }
  return null
}

function isDescendantPath(ancestor: string, maybeChild: string): boolean {
  const a = normalize(ancestor)
  const b = normalize(maybeChild)
  if (!a) return !!b // root ancestor, everything else is descendant
  return b === a || b.startsWith(a + '/')
}

function splitNameExt(name: string): [string, string] {
  const i = name.lastIndexOf('.')
  if (i <= 0) return [name, '']
  return [name.slice(0, i), name.slice(i)]
}
function withSuffix(name: string, n: number): string {
  const [base, ext] = splitNameExt(name)
  return `${base} (${n})${ext}`
}

export default function FileExplorer() {
  const [activeProjectId, setActiveProjectId] = useState<string | null>(() => fileSystem.getActiveProjectId())
  const [root, setRoot] = useState<FileNode>(() => fileSystem.listTree(activeProjectId || undefined))
  const [selected, setSelected] = useState<string | null>(null)

  // Ensure VFS is initialized (idempotent; safe if Sidebar also calls)
  useEffect(() => {
    initializeFromStorage()
  }, [])

  // Expanded directories (normalized dir paths, no leading slash)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const expandedRef = useRef(expanded)
  expandedRef.current = expanded

  // ---- Persisted expanded paths per project ----
  const loadExpandedForProject = async (projectId: string | null) => {
    const pid = projectId
    if (!pid) {
      setExpanded(new Set())
      return
    }
    let paths: string[] | undefined
    try {
      const anyFs: any = fileSystem as any
      const meta = await anyFs.getProjectMeta?.(pid)
      paths = meta?.metadata?.expandedPaths
    } catch {
      // ignore
    }
    if (!paths) {
      try {
        const raw = (globalThis as any).localStorage?.getItem(`extendy:expandedPaths:${pid}`)
        if (raw) paths = JSON.parse(raw)
      } catch {
        // ignore
      }
    }
    const setVal = new Set((paths || []).map((p: string) => normalize(p)))
    setVal.add('') // always keep root open
    setExpanded(setVal)
  }

  const persistExpandedForProject = async (projectId: string | null, expandedSet: Set<string>) => {
    const pid = projectId
    if (!pid) return
    const arr = Array.from(expandedSet).map((p) => normalize(p)).filter((p) => p !== '') // don't store root
    let persisted = false
    try {
      const anyFs: any = fileSystem as any
      if (typeof anyFs.setProjectMeta === 'function') {
        await anyFs.setProjectMeta(pid, { expandedPaths: arr })
        persisted = true
      }
    } catch {
      // ignore
    }
    if (!persisted) {
      try {
        (globalThis as any).localStorage?.setItem(`extendy:expandedPaths:${pid}`, JSON.stringify(arr))
      } catch {
        // ignore
      }
    }
  }

  // ---- Tree reload helpers ----
  const reloadTree = (pid: string | null = activeProjectId) => {
    setRoot(fileSystem.listTree(pid || undefined))
  }

  // Subscribe to EventBus for project and tree changes
  useEffect(() => {
    // initial sync
    reloadTree(activeProjectId)
    loadExpandedForProject(activeProjectId)

    const offActive = eventBus.on('project:activeChanged', ({ projectId }) => {
      setActiveProjectId(projectId)
      loadExpandedForProject(projectId)
      reloadTree(projectId)
      setSelected(null)
    })

    const offTree = eventBus.on('tree:changed', ({ projectId }) => {
      const current = fileSystem.getActiveProjectId()
      if (!current || current !== projectId) return
      reloadTree(current)
    })

    const offMeta = eventBus.on('project:metaChanged', ({ projectId, metaPatch }) => {
      const current = fileSystem.getActiveProjectId()
      if (!current || current !== projectId) return
      if (metaPatch.expandedPaths) {
        const setVal = new Set(metaPatch.expandedPaths.map((p) => normalize(p)))
        setVal.add('')
        setExpanded(setVal)
      }
    })

    return () => {
      offActive()
      offTree()
      offMeta()
    }
  }, [])

  // Build explorer data, sorted deep; ensure empty explicit dirs are kept (FileSystem v2 already provides them)
  const data: ExplorerNode[] = useMemo(() => {
    const exRoot = toExplorer(root)
    const sorted = sortTreeDeep({
      ...exRoot,
      name: exRoot.name || 'extension',
    })
    sorted.children = sorted.children ? sortNodesStable(sorted.children) : []
    return [sorted]
  }, [root])

  const hasAnyChildren = !!(data[0]?.children && data[0].children.length > 0)

  // Expanded ids for Tree: include root "/"
  const openIds = useMemo(() => {
    const ids = new Set<string>()
    ids.add('/') // root
    for (const p of expanded) {
      ids.add(p || '/')
    }
    return Array.from(ids)
  }, [expanded])

  // ---- Directory resolution + uniqueness helpers ----
  const selectedDirPath = (fallbackToRoot = true) => {
    if (!selected) return fallbackToRoot ? '' : ''
    const n = findFileNode(root, selected)
    if (n?.type === 'directory') return normalize(selected)
    const parts = normalize(selected).split('/').filter(Boolean)
    parts.pop()
    return parts.join('/')
  }

  const listChildNamesInDir = (dirPath: string): { files: Set<string>; dirs: Set<string>; all: Set<string> } => {
    const dirNode = findFileNode(root, dirPath)
    const files = new Set<string>()
    const dirs = new Set<string>()
    const all = new Set<string>()
    if (dirNode && dirNode.type === 'directory' && dirNode.children) {
      for (const ch of dirNode.children) {
        const nm = (ch.name || '').toLowerCase()
        all.add(nm)
        if (ch.type === 'file') files.add(nm)
        else dirs.add(nm)
      }
    }
    return { files, dirs, all }
  }

  const ensureUniqueInDir = (dirPath: string, desiredName: string, ignoreExistingPath?: string) => {
    const dir = normalize(dirPath)
    const want = desiredName.trim()
    if (!want) return 'untitled'
    const { all } = listChildNamesInDir(dir)
    // If renaming the same entry, allow the same name (case-sensitive equal)
    if (ignoreExistingPath) {
      const ignoreDir = dirname(ignoreExistingPath)
      const ignoreBase = basename(ignoreExistingPath)
      if (normalize(ignoreDir) === dir && ignoreBase === want) return want
    }
    let candidate = want
    let index = 1
    while (all.has(candidate.toLowerCase())) {
      candidate = withSuffix(want, index++)
    }
    return candidate
  }

  // ---- Expanded toggle ----
  const handleToggle = (dirPath: string, willBeOpen: boolean) => {
    const p = normalize(dirPath)
    setExpanded((prev) => {
      const next = new Set(prev)
      if (willBeOpen) next.add(p)
      else next.delete(p)
      persistExpandedForProject(activeProjectId, next)
      return next
    })
  }

  // ---- CRUD actions ----
  const handleCreateFile = (targetDirOverride?: string) => {
    const baseDir = normalize(targetDirOverride ?? selectedDirPath())
    const defaultName = 'untitled.html'
    const input = prompt('New file name', defaultName) || defaultName
    const name = ensureUniqueInDir(baseDir, basename(input))
    const path = [baseDir, name].filter(Boolean).join('/')
    fileSystem.createFile(path, '')
    fileSystem.setActiveFilePath(path)
    setSelected(path)
  }

  const handleCreateFolder = (targetDirOverride?: string) => {
    const baseDir = normalize(targetDirOverride ?? selectedDirPath())
    const defaultName = 'new-folder'
    const input = prompt('New folder name', defaultName) || defaultName
    const name = ensureUniqueInDir(baseDir, basename(input))
    const path = [baseDir, name].filter(Boolean).join('/')
    fileSystem.createFolder(path)
    setSelected(path)
    // optimistically expand parent and the new folder
    handleToggle(baseDir, true)
    handleToggle(path, true)
  }

  const handleRename = (targetPathOverride?: string) => {
    const target = normalize(targetPathOverride ?? selected ?? '')
    if (!target) return
    const base = basename(target)
    const name = prompt('Rename to', base)
    if (!name) return
    const parent = dirname(target)
    const safeName = ensureUniqueInDir(parent, name, target)
    const to = [parent, safeName].filter(Boolean).join('/')
    if (to === target) return
    // prevent folder rename into own descendant (shouldn't happen since parent unchanged)
    fileSystem.renamePath(target, to)
    setSelected(to)
  }

  const handleDelete = (targetPathOverride?: string) => {
    const target = normalize(targetPathOverride ?? selected ?? '')
    if (!target) return
    const node = findFileNode(root, target)
    const isDir = node?.type === 'directory'
    if (isDir) {
      if (!confirm(`Delete folder "${target}" and all its contents?`)) return
    } else {
      if (!confirm(`Delete file "${target}"?`)) return
    }
    fileSystem.deletePath(target)
    setSelected(null)
  }

  // ---- Drag and drop ----
  const canDrop = (args: any) => {
    const parent: NodeApi<ExplorerNode> | null = args?.parentNode ?? args?.parent ?? null
    return parent?.data?.type === 'directory'
  }

  const onMove = (args: any) => {
    const dragNodes: NodeApi<ExplorerNode>[] = args?.dragNodes || args?.nodes || []
    const parent: NodeApi<ExplorerNode> | null = args?.parentNode ?? args?.parent ?? null
    if (!dragNodes.length) return
    const src = normalize(dragNodes[0].data.path)
    let targetDir =
      parent?.data?.type === 'directory'
        ? normalize(parent.data.path)
        : normalize(parent?.parent?.data?.path || '')
    // no-op
    if (dirname(src) === targetDir) return

    // Prevent moving a folder into its own descendant
    const srcNode = findFileNode(root, src)
    if (srcNode?.type === 'directory' && isDescendantPath(src, targetDir)) {
      alert('Cannot move a folder into its own descendant.')
      return
    }

    // Resolve conflicts by suffixing
    const finalName = ensureUniqueInDir(targetDir, basename(src))
    const dest = [targetDir, finalName].filter(Boolean).join('/')

    if (dest === src) return
    fileSystem.renamePath(src, dest)
    setSelected(dest)
    // optimistically expand target dir
    handleToggle(targetDir, true)
  }

  // ---- Selection and open behavior ----
  const onSelect = (nodes: NodeApi<ExplorerNode>[]) => {
    const node = nodes?.[0]
    const id = node?.data?.path ?? null
    setSelected(id)
  }

  // react-arborist doesn't type onToggle/openIds on some versions; cast to any to pass through
  const TreeAny = Tree as any
  const onToggleAny = (node: NodeApi<ExplorerNode>) => {
    if (node?.data?.type === 'directory') {
      // node.isOpen is current state; compute next state
      handleToggle(node.data.path, !node.isOpen)
    }
  }

  // ---- Row renderer (inner to access handlers) ----
  function Row({ node }: NodeRendererProps<ExplorerNode>) {
    const isDir = node.data.type === 'directory'
    return (
      <div
        className={`flex items-center gap-2 px-2 ${node.isSelected ? 'bg-blue-50 dark:bg-cyan-900/30' : ''}`}
        onDoubleClick={() => {
          if (isDir) {
            // toggle and persist
            const nextOpen = !node.isOpen
            node.toggle()
            handleToggle(node.data.path, nextOpen)
          } else {
            // open file
            fileSystem.setActiveFilePath(node.data.path)
          }
        }}
        onContextMenu={(e) => {
          e.preventDefault()
          setSelected(node.data.path)
          const targetDir = isDir ? normalize(node.data.path) : dirname(node.data.path)
          const choice = prompt('Action: 1) New File  2) New Folder  3) Rename  4) Delete', '1')
          if (!choice) return
          if (choice === '1') handleCreateFile(targetDir)
          else if (choice === '2') handleCreateFolder(targetDir)
          else if (choice === '3') handleRename(node.data.path)
          else if (choice === '4') handleDelete(node.data.path)
        }}
      >
        <span className="text-xs">{isDir ? '📁' : '📄'}</span>
        <span className="text-sm text-gray-800 dark:text-gray-200 truncate">
          {node.data.name || (node.data.path === '/' ? 'extension' : '')}
        </span>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
      <div className="flex items-center gap-2 p-2 border-b border-gray-200 dark:border-gray-800">
        <span className="text-xs text-gray-600 dark:text-gray-400">Files</span>
        <div className="flex-1" />
        <button
          onClick={() => handleCreateFile()}
          className="text-xs px-2 py-1 rounded border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
          title="Create file"
        >
          + File
        </button>
        <button
          onClick={() => handleCreateFolder()}
          className="text-xs px-2 py-1 rounded border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
          title="Create folder"
        >
          + Folder
        </button>
        <button
          onClick={() => handleRename()}
          disabled={!selected}
          className="text-xs px-2 py-1 rounded border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
          title="Rename"
        >
          Rename
        </button>
        <button
          onClick={() => handleDelete()}
          disabled={!selected}
          className="text-xs px-2 py-1 rounded border border-rose-200 dark:border-rose-800 hover:bg-rose-50 dark:hover:bg-rose-900/30 text-rose-700 dark:text-rose-300 disabled:opacity-50"
          title="Delete"
        >
          Delete
        </button>
      </div>

      {!hasAnyChildren && (
        <div className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
          No files yet — use New File or New Folder.
        </div>
      )}

      <div className="flex-1 overflow-auto">
        <TreeAny
          data={data}
          childrenAccessor="children"
          idAccessor="id"
          indent={16}
          rowHeight={28}
          height={360}
          selection={selected ?? ''}
          onSelect={onSelect}
          canDrop={canDrop}
          onMove={(args: any) => onMove(args)}
          onToggle={onToggleAny}
          openIds={openIds}
          openByDefault={false}
        >
          {Row}
        </TreeAny>
      </div>
    </div>
  )
}