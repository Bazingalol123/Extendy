import { nanoid } from 'nanoid'
import {
  ensureRootInitialized,
  getProjectsIndex,
  setProjectsIndex,
  getActiveProjectId as storageGetActiveProjectId,
  setActiveProjectId as storageSetActiveProjectId,
  readProjectMeta,
  writeProjectMeta,
  readProjectTree,
  writeProjectTree,
  readFileRecord,
  writeFileRecord,
  deleteFileRecord,
  listAllFilePaths,
  V1TreeNode,
  V1FileRecord,
  ProjectIndexEntry,
  getMigrations,
  setMigrations,
} from '../utils/storage'
import { storageV2, type ProjectDoc, type FileRecord as V2FileRecord, type ProjectMetaIndexItem } from '../utils/storageV2'
import { isV2Initialized } from '../utils/storage'
import eventBus, { type EventName, type Payloads } from './eventBus'

export interface FileNode {
  name: string
  path: string
  type: 'file' | 'directory'
  content?: string
  children?: FileNode[]
}

type ProjectMeta = ProjectIndexEntry

function now() {
  return Date.now()
}

// v1 utils (kept for fallback and tree building)
function normalizePath(p: string): string {
  // remove leading slashes, collapse multiple slashes, remove ./ and resolve ..
  const trimmed = p.replace(/^[\\/]+/, '')
  const parts: string[] = []
  for (const seg of trimmed.split(/[\\/]+/)) {
    if (!seg || seg === '.') continue
    if (seg === '..') {
      parts.pop()
      continue
    }
    parts.push(seg)
  }
  return parts.join('/')
}

function dirname(path: string): string {
  const p = normalizePath(path)
  const i = p.lastIndexOf('/')
  return i === -1 ? '' : p.slice(0, i)
}

function basename(path: string): string {
  const p = normalizePath(path)
  const i = p.lastIndexOf('/')
  return i === -1 ? p : p.slice(i + 1)
}

function ensureRootTree(): V1TreeNode {
  return { type: 'directory', name: '', path: '', children: [] }
}

function ensureDirPath(root: V1TreeNode, dirPath: string): V1TreeNode {
  const parts = normalizePath(dirPath).split('/').filter(Boolean)
  let current: V1TreeNode = root
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    if (!current.children) current.children = []
    let next = current.children.find(
      (c) => c.type === 'directory' && c.name === part
    ) as V1TreeNode | undefined
    if (!next) {
      next = {
        type: 'directory',
        name: part,
        path: parts.slice(0, i + 1).join('/'),
        children: [],
      }
      current.children.push(next)
    }
    current = next
  }
  return current
}

function addOrUpdateFileLeaf(root: V1TreeNode, filePath: string) {
  const dirPath = dirname(filePath)
  const base = basename(filePath)
  const dir = ensureDirPath(root, dirPath)
  if (!dir.children) dir.children = []
  const existingIdx = dir.children.findIndex(
    (c) => c.type === 'file' && c.name === base
  )
  const leaf: V1TreeNode = { type: 'file', name: base, path: filePath }
  if (existingIdx !== -1) {
    dir.children[existingIdx] = leaf
  } else {
    dir.children.push(leaf)
  }
}

function removePathFromTree(root: V1TreeNode, targetPath: string): boolean {
  // returns true if something removed
  const parts = normalizePath(targetPath).split('/').filter(Boolean)
  if (parts.length === 0) return false
  function walk(node: V1TreeNode, depth: number): boolean {
    if (!node.children) return false
    const isLast = depth === parts.length - 1
    const part = parts[depth]
    const idx = node.children.findIndex((c) => c.name === part)
    if (idx === -1) return false
    const child = node.children[idx]
    if (isLast) {
      node.children.splice(idx, 1)
      return true
    } else if (child.type === 'directory') {
      const removed = walk(child, depth + 1)
      // keep empty dir for now (could be pruned in a future maintenance pass)
      return removed
    }
    return false
  }
  return walk(root, 0)
}

function locateNode(root: V1TreeNode, path: string): { parent: V1TreeNode | null; node: V1TreeNode } | null {
  const parts = normalizePath(path).split('/').filter(Boolean)
  if (parts.length === 0) return { parent: null, node: root }
  let current: V1TreeNode = root
  let parent: V1TreeNode | null = null
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    if (!current.children) return null
    const next = current.children.find((c) => c.name === part)
    if (!next) return null
    parent = current
    current = next
  }
  return { parent, node: current }
}

function collectAllPaths(n: V1TreeNode, out: string[]) {
  if (n.type === 'file') {
    out.push(n.path)
  } else if (n.children) {
    for (const ch of n.children) collectAllPaths(ch, out)
  }
}

function renamePathInTree(root: V1TreeNode, fromPath: string, toPath: string) {
  const from = normalizePath(fromPath)
  const to = normalizePath(toPath)
  if (from === to) return

  const info = locateNode(root, from)
  if (!info) return
  const isDirectory = info.node.type === 'directory'

  // Remove original node
  removePathFromTree(root, from)

  if (isDirectory) {
    // re-add all descendant files with new prefix
    const tmpRoot: V1TreeNode = { ...info.node, children: info.node.children ? [...info.node.children] : [] }
    const all: string[] = []
    collectAllPaths(tmpRoot, all)
    for (const oldFilePath of all) {
      const rel = oldFilePath.slice(from.length ? from.length + 1 : 0)
      const newFilePath = to ? `${to}/${rel}`.replace(/\/+/g, '/') : rel
      addOrUpdateFileLeaf(root, newFilePath)
    }
  } else {
    addOrUpdateFileLeaf(root, to)
  }
}

function toFileTree(node: V1TreeNode): FileNode {
  if (node.type === 'file') {
    return {
      type: 'file',
      name: node.name,
      path: node.path,
    }
  }
  return {
    type: 'directory',
    name: node.path === '' ? 'extension' : node.name,
    path: node.path || '/',
    children: (node.children || []).map(toFileTree),
  }
}

class FileSystemService {
  private listeners: Set<() => void> = new Set()

  // -------- v2 caches & routing --------
  private useV2 = false // guarded, set after async check
  private v2Index: ProjectMetaIndexItem[] = []
  private v2Docs = new Map<string, ProjectDoc>()
  private v2Files = new Map<string, Map<string, V2FileRecord>>()
  private v2ActiveProjectId: string | null = null
  private v2InitStarted = false

  constructor() {
    this.initVersionRouting()
  }

  private isDev(): boolean {
    try {
      const g: any = typeof globalThis !== 'undefined' ? (globalThis as any) : {}
      const nodeEnv = g.process?.env?.NODE_ENV
      const viteMode = (typeof import.meta !== 'undefined' ? (import.meta as any)?.env?.MODE : undefined)
      return nodeEnv === 'development' || viteMode === 'development'
    } catch {
      return false
    }
  }
  private log(...args: any[]) {
    if (this.isDev()) {
      // eslint-disable-next-line no-console
      console.log('[FS v2]', ...args)
    }
  }
  private fireAndForget(p: Promise<any>) {
    p.catch((e) => {
      if (this.isDev()) console.warn('[FS v2] async op failed:', e)
    })
  }

  // Initialize routing and bootstrap appropriate backend
  private initVersionRouting() {
    // determine if v2 should be used
    isV2Initialized()
      .then((flag) => {
        this.useV2 = !!flag
        if (this.useV2) {
          this.log('Using v2 backend')
          this.bootstrapV2()
        } else {
          this.log('Using v1 fallback')
          ensureRootInitialized()
          this.bootstrapV1()
        }
      })
      .catch(() => {
        // defensive: fallback to v1
        ensureRootInitialized()
        this.bootstrapV1()
      })
  }

  // ---------- v1 bootstrap (unchanged) ----------
  private bootstrapV1() {
    // Ensure there is an active project; create a default if none
    let active = storageGetActiveProjectId()
    const index = getProjectsIndex()
    if (!active || !index.find((e) => e.id === active)) {
      const id = this.createProject('My Project', true) // v1 fallback
      this.setActiveProject(id) // v1 fallback
    } else {
      // Update lastOpenedAt
      const meta = readProjectMeta(active)
      if (meta) {
        meta.lastOpenedAt = now()
        writeProjectMeta(meta)
        const idx = getProjectsIndex()
        const pos = idx.findIndex((e) => e.id === meta.id)
        if (pos !== -1) {
          idx[pos] = meta
          setProjectsIndex(idx)
        }
      }
    }

    // Best-effort legacy migration (non-blocking)
    this.migrateLegacyFileSystem()
  }

  private async migrateLegacyFileSystem() {
    try {
      const flags = getMigrations()
      if (flags.migratedFileSystem) return
      if (typeof chrome !== 'undefined' && chrome.storage) {
        const res = await chrome.storage.local.get('fileSystem')
        const entries = res?.fileSystem as [string, any][] | undefined
        if (entries && entries.length) {
          const id = this.createProject('Imported Project', false) // v1 fallback
          // Build tree from entries
          let tree = readProjectTree(id) || ensureRootTree()
          for (const [p, node] of entries) {
            if (node && node.type === 'file') {
              const path = normalizePath(p)
              const content = String(node.content ?? '')
              const rec: V1FileRecord = {
                path,
                content,
                hint: undefined,
                updatedAt: now(),
                size: content.length,
              }
              writeFileRecord(id, rec)
              addOrUpdateFileLeaf(tree, path)
            }
          }
          writeProjectTree(id, tree)
          // Update projects index timestamps
          const meta = readProjectMeta(id)
          if (meta) {
            meta.lastOpenedAt = now()
            writeProjectMeta(meta)
            const idx = getProjectsIndex()
            const pos = idx.findIndex((e) => e.id === meta.id)
            if (pos !== -1) {
              idx[pos] = meta
              setProjectsIndex(idx)
            }
          }
          setMigrations({ ...flags, migratedFileSystem: true })
          this.notify()
        }
      }
    } catch (e) {
      console.warn('[FileSystem] legacy migration skipped:', e)
    }
  }

  // ---------- v2 bootstrap ----------
  private async bootstrapV2() {
    if (this.v2InitStarted) return
    this.v2InitStarted = true
    try {
      const index = await storageV2.getProjectsIndex()
      this.v2Index = Array.isArray(index) ? index.slice() : []
      let active = await storageV2.getActiveProjectId()
      // ensure active is valid
      if (!active || !this.v2Index.find((e) => e.id === active)) {
        if (this.v2Index.length === 0) {
          const id = this.v2CreateProject('My Project', true) // updates caches + emits
          active = id
        } else {
          active = this.v2Index[0].id
          this.v2SetActiveProject(active)
        }
      }
      this.v2ActiveProjectId = active
      // load doc and files into cache for active project
      await this.v2EnsureProjectDoc(active)
      const files = await storageV2.idbListFiles(active)
      const map = new Map<string, V2FileRecord>()
      for (const f of files) {
        map.set(storageV2.normalizePath(f.path), f)
      }
      this.v2Files.set(active, map)
      // bump lastOpenedAt and updatedAt
      const idxPos = this.v2Index.findIndex((e) => e.id === active)
      if (idxPos !== -1) {
        const nowTs = now()
        this.v2Index[idxPos] = {
          ...this.v2Index[idxPos],
          lastOpenedAt: nowTs,
          updatedAt: nowTs,
        }
        this.fireAndForget(storageV2.setProjectsIndex(this.v2Index))
      }
      const doc = this.v2Docs.get(active)
      if (doc) {
        doc.stats.lastOpenedAt = now()
        doc.updatedAt = now()
        this.fireAndForget(storageV2.idbPutProject(doc))
      }
      this.notify()
    } catch (e) {
      console.error('[FS v2] bootstrap failed', e)
    }
  }

  // ---------- v2 helpers ----------
  private v2Normalize(p: string): string {
    return storageV2.normalizePath(p)
  }

  private v2GetIndexItem(id: string): ProjectMetaIndexItem | undefined {
    return this.v2Index.find((x) => x.id === id)
  }

  private v2DefaultDoc(id: string, name: string): ProjectDoc {
    const t = now()
    return {
      id,
      name: name || 'Project',
      createdAt: t,
      updatedAt: t,
      stats: { fileCount: 0, totalBytes: 0, lastOpenedAt: t },
      metadata: {
        entryHtmlPath: 'index.html',
        openEditors: [],
        expandedPaths: [],
        explicitDirs: [],
        activeFilePath: null,
      },
    }
  }

  private v2ComputeStats(files: Iterable<V2FileRecord>) {
    let fileCount = 0
    let totalBytes = 0
    for (const f of files) {
      fileCount++
      totalBytes += Number(f.size || 0)
    }
    return { fileCount, totalBytes }
  }

  private async v2EnsureProjectDoc(projectId: string): Promise<ProjectDoc> {
    let doc = this.v2Docs.get(projectId)
    if (doc) return doc
    const fetched = await storageV2.idbGetProject(projectId)
    if (fetched) {
      this.v2Docs.set(projectId, fetched)
      return fetched
    }
    // create minimal default
    const name = this.v2GetIndexItem(projectId)?.name || 'Project'
    doc = this.v2DefaultDoc(projectId, name)
    this.v2Docs.set(projectId, doc)
    this.fireAndForget(storageV2.idbPutProject(doc))
    return doc
  }

  private v2BuildTree(projectId: string): V1TreeNode {
    const root = ensureRootTree()
    const doc = this.v2Docs.get(projectId)
    const explicit = new Set<string>((doc?.metadata.explicitDirs || []).map((d) => this.v2Normalize(d)))
    // add explicit dirs
    for (const dir of explicit) {
      if (dir) ensureDirPath(root, dir)
    }
    // add files
    const files = this.v2Files.get(projectId)
    if (files) {
      for (const p of files.keys()) {
        addOrUpdateFileLeaf(root, this.v2Normalize(p))
      }
    }
    return root
  }

  private v2IsDirectoryPath(projectId: string, p: string): boolean {
    const path = this.v2Normalize(p)
    const doc = this.v2Docs.get(projectId)
    const files = this.v2Files.get(projectId)
    if (doc && doc.metadata.explicitDirs?.some((d) => this.v2Normalize(d) === path)) return true
    if (files) {
      for (const key of files.keys()) {
        if (key === path || key.startsWith(path + '/')) return true
      }
    }
    return false
  }

  // ---------- subscription ----------
  subscribe(callback: () => void) {
    this.listeners.add(callback)
    return () => {
      // cleanup should not return a value to satisfy React types
      this.listeners.delete(callback)
    }
  }

  private notify() {
    this.listeners.forEach((cb) => {
      try {
        cb()
      } catch (e) {
        console.error('[FileSystem] listener error', e)
      }
    })
  }

  // ------------- Project APIs -------------
  getProjectList(): ProjectMeta[] {
    if (this.useV2) {
      // v2 path
      const list = (this.v2Index || []).map<ProjectMeta>((it) => ({
        id: it.id,
        name: it.name,
        createdAt: it.createdAt,
        lastOpenedAt: it.lastOpenedAt,
        activeFilePath: this.v2Docs.get(it.id)?.metadata.activeFilePath ?? null,
        version: 2,
      }))
      return list.slice().sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)
    }
    // v1 fallback
    return getProjectsIndex().slice().sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)
  }

  createProject(name: string, withStarter: boolean): string {
    if (this.useV2) {
      // v2 path
      return this.v2CreateProject(name, withStarter)
    }
    // v1 fallback
    const id = nanoid(10)
    const meta: ProjectMeta = {
      id,
      name: name || 'Untitled',
      createdAt: now(),
      lastOpenedAt: now(),
      activeFilePath: null,
      version: 1,
    }
    const index = getProjectsIndex()
    index.push(meta)
    setProjectsIndex(index)
    writeProjectMeta(meta)

    let tree: V1TreeNode = ensureRootTree()

    if (withStarter) {
      const starter: Record<string, string> = {
        'index.html': [
          '<!doctype html>',
          '<html>',
          '<head>',
          '  <meta charset="utf-8" />',
          '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
          '  <title>Preview</title>',
          '  <link rel="stylesheet" href="style.css">',
          '</head>',
          '<body>',
          '  <h1>Hello from Extendy Preview</h1>',
          '  <script src="main.js"></script>',
          '</body>',
          '</html>',
        ].join('\n'),
        'style.css': 'body{font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;padding:24px}',
        'main.js': 'console.log("Extendy project ready");',
      }
      for (const [p, content] of Object.entries(starter)) {
        const path = normalizePath(p)
        const rec: V1FileRecord = {
          path,
          content,
          hint: undefined,
          updatedAt: now(),
          size: content.length,
        }
        writeFileRecord(id, rec)
        addOrUpdateFileLeaf(tree, path)
      }
      meta.activeFilePath = 'index.html'
      writeProjectMeta(meta)
      const pos = index.findIndex((e) => e.id === id)
      if (pos !== -1) {
        index[pos] = meta
        setProjectsIndex(index)
      }
    }

    writeProjectTree(id, tree)
    // EventBus: projects list changed
    eventBus.emit('project:listChanged', { projects: this.getProjectList() })
    return id
  }

  private v2CreateProject(name: string, withStarter: boolean): string {
    const id = nanoid(10)
    const t = now()
    // index
    const item: ProjectMetaIndexItem = {
      id,
      name: name || 'Untitled',
      createdAt: t,
      updatedAt: t,
      lastOpenedAt: t,
    }
    this.v2Index.push(item)
    // doc
    const doc: ProjectDoc = this.v2DefaultDoc(id, item.name)
    if (withStarter) {
      const starter: Record<string, string> = {
        'index.html': [
          '<!doctype html>',
          '<html>',
          '<head>',
          '  <meta charset="utf-8" />',
          '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
          '  <title>Preview</title>',
          '  <link rel="stylesheet" href="style.css">',
          '</head>',
          '<body>',
          '  <h1>Hello from Extendy Preview</h1>',
          '  <script src="main.js"></script>',
          '</body>',
          '</html>',
        ].join('\n'),
        'style.css': 'body{font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;padding:24px}',
        'main.js': 'console.log("Extendy project ready");',
      }
      const fileMap = new Map<string, V2FileRecord>()
      for (const [p, content] of Object.entries(starter)) {
        const path = this.v2Normalize(p)
        const rec: V2FileRecord = {
          projectId: id,
          path,
          content,
          size: content.length,
          updatedAt: now(),
        }
        fileMap.set(path, rec)
      }
      const stats = this.v2ComputeStats(fileMap.values())
      doc.stats.fileCount = stats.fileCount
      doc.stats.totalBytes = stats.totalBytes
      doc.metadata.activeFilePath = 'index.html'
      this.v2Files.set(id, fileMap)
    } else {
      this.v2Files.set(id, new Map())
    }
    this.v2Docs.set(id, doc)

    // set active
    this.v2ActiveProjectId = id

    // persist (async)
    this.fireAndForget(storageV2.setProjectsIndex(this.v2Index))
    this.fireAndForget(storageV2.idbPutProject(doc))
    const filesMap = this.v2Files.get(id)
    if (filesMap) {
      for (const rec of filesMap.values()) {
        this.fireAndForget(storageV2.idbPutFile(id, rec))
      }
    }
    this.fireAndForget(storageV2.setActiveProjectId(id))

    // emits
    eventBus.emit('project:listChanged', { projects: this.getProjectList() })
    eventBus.emit('project:activeChanged', { projectId: id })
    return id
  }

  renameProject(id: string, newName: string) {
    if (this.useV2) {
      // v2 path
      const idx = this.v2Index.findIndex((e) => e.id === id)
      if (idx === -1) return
      this.v2Index[idx] = { ...this.v2Index[idx], name: newName, updatedAt: now() }
      const doc = this.v2Docs.get(id)
      if (doc) {
        doc.name = newName
        doc.updatedAt = now()
        this.fireAndForget(storageV2.idbPutProject(doc))
      }
      this.fireAndForget(storageV2.setProjectsIndex(this.v2Index))
      eventBus.emit('project:listChanged', { projects: this.getProjectList() })
      this.notify()
      return
    }
    // v1 fallback
    const meta = readProjectMeta(id)
    if (!meta) return
    meta.name = newName
    writeProjectMeta(meta)
    const idx = getProjectsIndex()
    const pos = idx.findIndex((e) => e.id === id)
    if (pos !== -1) {
      idx[pos] = meta
      setProjectsIndex(idx)
    }
    // EventBus: projects list changed (rename)
    eventBus.emit('project:listChanged', { projects: this.getProjectList() })
    this.notify()
  }

  deleteProject(id: string) {
    if (this.useV2) {
      // v2 path
      const wasActive = this.v2ActiveProjectId === id
      // remove files/doc from cache
      this.v2Files.delete(id)
      this.v2Docs.delete(id)
      this.v2Index = this.v2Index.filter((e) => e.id !== id)
      // set new active if needed
      if (wasActive) {
        const nextActive = this.v2Index[0]?.id ?? null
        this.v2ActiveProjectId = nextActive
        this.fireAndForget(storageV2.setActiveProjectId(nextActive))
      }
      // persist deletes async
      this.fireAndForget((async () => {
        const files = await storageV2.idbListFiles(id)
        for (const f of files) {
          await storageV2.idbDeleteFile(id, f.path)
        }
        await storageV2.idbDeleteProject(id)
        await storageV2.setProjectsIndex(this.v2Index)
      })())
      // emits
      eventBus.emit('project:listChanged', { projects: this.getProjectList() })
      eventBus.emit('project:activeChanged', { projectId: this.v2ActiveProjectId })
      this.notify()
      return
    }
    // v1 fallback
    for (const path of listAllFilePaths(id)) {
      deleteFileRecord(id, path)
    }
    writeProjectTree(id, ensureRootTree())
    const idx = getProjectsIndex().filter((e) => e.id !== id)
    setProjectsIndex(idx)
    const active = storageGetActiveProjectId()
    if (active === id) {
      storageSetActiveProjectId(idx[0]?.id ?? null)
    }
    eventBus.emit('project:listChanged', { projects: this.getProjectList() })
    eventBus.emit('project:activeChanged', { projectId: storageGetActiveProjectId() })
    this.notify()
  }

  getActiveProjectId(): string | null {
    if (this.useV2) {
      // v2 path
      return this.v2ActiveProjectId ?? null
    }
    // v1 fallback
    return storageGetActiveProjectId()
  }

  setActiveProject(id: string | null) {
    if (this.useV2) {
      // v2 path
      this.v2SetActiveProject(id)
      return
    }
    // v1 fallback
    storageSetActiveProjectId(id)
    if (id) {
      const meta = readProjectMeta(id)
      if (meta) {
        meta.lastOpenedAt = now()
        writeProjectMeta(meta)
        const idx = getProjectsIndex()
        const pos = idx.findIndex((e) => e.id === id)
        if (pos !== -1) {
          idx[pos] = meta
          setProjectsIndex(idx)
        }
      }
    }
    eventBus.emit('project:activeChanged', { projectId: id })
    this.notify()
  }

  private v2SetActiveProject(id: string | null) {
    this.v2ActiveProjectId = id
    const t = now()
    if (id) {
      const pos = this.v2Index.findIndex((e) => e.id === id)
      if (pos !== -1) {
        this.v2Index[pos] = { ...this.v2Index[pos], lastOpenedAt: t, updatedAt: t }
        this.fireAndForget(storageV2.setProjectsIndex(this.v2Index))
      }
      // ensure doc exists
      this.fireAndForget(this.v2EnsureProjectDoc(id).then((doc) => {
        doc.stats.lastOpenedAt = t
        doc.updatedAt = t
        return storageV2.idbPutProject(doc)
      }))
    }
    this.fireAndForget(storageV2.setActiveProjectId(id))
    eventBus.emit('project:activeChanged', { projectId: id })
    this.notify()
  }

  setActiveFilePath(path: string | null) {
    if (this.useV2) {
      // v2 path
      const id = this.v2ActiveProjectId
      if (!id) return
      const doc = this.v2Docs.get(id)
      if (!doc) return
      doc.metadata.activeFilePath = path ? this.v2Normalize(path) : null
      doc.updatedAt = now()
      this.fireAndForget(storageV2.idbPutProject(doc))
      eventBus.emit('project:metaChanged', {
        projectId: id,
        metaPatch: { activeFilePath: doc.metadata.activeFilePath },
      })
      this.notify()
      return
    }
    // v1 fallback
    const id = this.getActiveProjectId()
    if (!id) return
    const meta = readProjectMeta(id)
    if (!meta) return
    meta.activeFilePath = path ? normalizePath(path) : null
    writeProjectMeta(meta)
    const idx = getProjectsIndex()
    const pos = idx.findIndex((e) => e.id === id)
    if (pos !== -1) {
      idx[pos] = meta
      setProjectsIndex(idx)
    }
    eventBus.emit('project:metaChanged', {
      projectId: id,
      metaPatch: { activeFilePath: meta.activeFilePath },
    })
    this.notify()
  }

  // ------------- File APIs (Project-aware) -------------
  listTree(projectId?: string): FileNode {
    if (this.useV2) {
      // v2 path
      const id = projectId || this.v2ActiveProjectId
      if (!id) return { type: 'directory', name: 'extension', path: '/', children: [] }
      const tree = this.v2BuildTree(id)
      return toFileTree(tree)
    }
    // v1 fallback
    const id = projectId || this.getActiveProjectId()
    if (!id) return { type: 'directory', name: 'extension', path: '/', children: [] }
    const tree = readProjectTree(id) || ensureRootTree()
    return toFileTree(tree)
  }

  getAllFiles(projectId?: string): FileNode[] {
    if (this.useV2) {
      // v2 path
      const id = projectId || this.v2ActiveProjectId
      if (!id) return []
      const files = this.v2Files.get(id)
      if (!files) return []
      return Array.from(files.values()).map((rec) => ({
        type: 'file',
        name: basename(rec.path),
        path: this.v2Normalize(rec.path),
        content: rec.content ?? '',
      }))
    }
    // v1 fallback
    const id = projectId || this.getActiveProjectId()
    if (!id) return []
    const paths = listAllFilePaths(id)
    return paths.map((p) => {
      const rec = readFileRecord(id, p)
      return {
        type: 'file',
        name: basename(p),
        path: p,
        content: rec?.content ?? '',
      } as FileNode
    })
  }

  readFile(path: string, projectId?: string): { content: string; hint?: string } | null {
    if (this.useV2) {
      // v2 path
      const id = projectId || this.v2ActiveProjectId
      if (!id) return null
      const p = this.v2Normalize(path)
      const rec = this.v2Files.get(id)?.get(p)
      if (!rec) return null
      return { content: rec.content, hint: undefined }
    }
    // v1 fallback
    const id = projectId || this.getActiveProjectId()
    if (!id) return null
    const p = normalizePath(path)
    const rec = readFileRecord(id, p)
    if (!rec) return null
    return { content: rec.content, hint: rec.hint }
  }

  writeFile(path: string, content: string, hint?: string, projectId?: string) {
    if (this.useV2) {
      // v2 path
      const id = projectId || this.v2ActiveProjectId
      if (!id) return
      const p = this.v2Normalize(path)
      const files = this.v2Files.get(id) || new Map<string, V2FileRecord>()
      const prev = files.get(p)
      const rec: V2FileRecord = {
        projectId: id,
        path: p,
        content,
        size: content.length,
        updatedAt: now(),
      }
      files.set(p, rec)
      this.v2Files.set(id, files)
      // update stats
      const doc = this.v2Docs.get(id)
      if (doc) {
        const stats = this.v2ComputeStats(files.values())
        doc.stats.fileCount = stats.fileCount
        doc.stats.totalBytes = stats.totalBytes
        doc.updatedAt = now()
        this.fireAndForget(storageV2.idbPutProject(doc))
      }
      // persist file
      this.fireAndForget(storageV2.idbPutFile(id, rec))

      // events
      if (!prev) {
        eventBus.emit('file:created', { projectId: id, path: p })
      } else {
        eventBus.emit('file:updated', { projectId: id, path: p, size: rec.size })
      }

      this.notify()
      return
    }
    // v1 fallback
    const id = projectId || this.getActiveProjectId()
    if (!id) return
    const p = normalizePath(path)
    const prev = readFileRecord(id, p)
    const rec: V1FileRecord = {
      path: p,
      content,
      hint: hint ?? prev?.hint,
      updatedAt: now(),
      size: content.length,
    }
    writeFileRecord(id, rec)
    const tree = readProjectTree(id) || ensureRootTree()
    addOrUpdateFileLeaf(tree, p)
    writeProjectTree(id, tree)

    if (!prev) {
      eventBus.emit('file:created', { projectId: id, path: p })
    } else {
      eventBus.emit('file:updated', { projectId: id, path: p, size: rec.size })
    }

    this.notify()
  }

  createFile(path: string, content: string, hint?: string): FileNode {
    const p = this.useV2 ? this.v2Normalize(path) : normalizePath(path)
    this.writeFile(p, content, hint)
    return { name: basename(p), path: p, type: 'file', content }
  }

  updateFile(path: string, content: string): FileNode | null {
    const p = this.useV2 ? this.v2Normalize(path) : normalizePath(path)
    const id = this.getActiveProjectId()
    if (!id) return null
    if (this.useV2) {
      const existing = this.v2Files.get(id)?.get(p)
      this.writeFile(p, content, undefined, id)
      return { name: basename(p), path: p, type: 'file', content }
    } else {
      const existing = readFileRecord(id, p)
      if (!existing) {
        this.writeFile(p, content)
        return { name: basename(p), path: p, type: 'file', content }
      }
      this.writeFile(p, content, existing.hint)
      return { name: basename(p), path: p, type: 'file', content }
    }
  }

  createFolder(path: string) {
    if (this.useV2) {
      // v2 path
      const id = this.v2ActiveProjectId
      if (!id) return
      const p = this.v2Normalize(path)
      const doc = this.v2Docs.get(id)
      if (!doc) return
      const dirs = new Set<string>(doc.metadata.explicitDirs?.map((d) => this.v2Normalize(d)) || [])
      if (!dirs.has(p)) {
        dirs.add(p)
        doc.metadata.explicitDirs = Array.from(dirs)
        doc.updatedAt = now()
        this.fireAndForget(storageV2.idbPutProject(doc))
        // emit a minimal file:created to trigger tree:changed
        eventBus.emit('file:created', { projectId: id, path: p })
        this.notify()
      }
      return
    }
    // v1 fallback
    const id = this.getActiveProjectId()
    if (!id) return
    const p = normalizePath(path)
    const tree = readProjectTree(id) || ensureRootTree()
    ensureDirPath(tree, p)
    writeProjectTree(id, tree)
    this.notify()
  }

  deletePath(path: string) {
    if (this.useV2) {
      // v2 path
      const id = this.v2ActiveProjectId
      if (!id) return
      const p = this.v2Normalize(path)
      const files = this.v2Files.get(id) || new Map<string, V2FileRecord>()
      const deleted: string[] = []

      if (files.has(p)) {
        // delete file
        files.delete(p)
        deleted.push(p)
        this.fireAndForget(storageV2.idbDeleteFile(id, p))
      } else {
        // assume directory; delete prefix
        const toDelete: string[] = []
        for (const key of files.keys()) {
          if (key === p || key.startsWith(p + '/')) toDelete.push(key)
        }
        for (const key of toDelete) {
          files.delete(key)
          deleted.push(key)
          this.fireAndForget(storageV2.idbDeleteFile(id, key))
        }
        // remove explicit dir
        const doc = this.v2Docs.get(id)
        if (doc) {
          const before = new Set<string>(doc.metadata.explicitDirs || [])
          const after = Array.from(before).filter((d) => this.v2Normalize(d) !== p)
          if (after.length !== before.size) {
            doc.metadata.explicitDirs = after
            doc.updatedAt = now()
          }
        }
      }

      // update stats
      const doc = this.v2Docs.get(id)
      if (doc) {
        const stats = this.v2ComputeStats(files.values())
        doc.stats.fileCount = stats.fileCount
        doc.stats.totalBytes = stats.totalBytes
        doc.updatedAt = now()
        this.fireAndForget(storageV2.idbPutProject(doc))
      }
      this.v2Files.set(id, files)

      // emits
      for (const dp of deleted) {
        eventBus.emit('file:deleted', { projectId: id, path: dp })
      }
      this.notify()
      return
    }
    // v1 fallback
    const id = this.getActiveProjectId()
    if (!id) return
    const p = normalizePath(path)
    const isDir = this.isDirectoryPath(id, p)
    const deletedPaths: string[] = []

    if (isDir) {
      for (const each of listAllFilePaths(id)) {
        if (each === p || each.startsWith(p + '/')) {
          deleteFileRecord(id, each)
          deletedPaths.push(each)
        }
      }
    } else {
      deleteFileRecord(id, p)
      deletedPaths.push(p)
    }
    const tree = readProjectTree(id) || ensureRootTree()
    removePathFromTree(tree, p)
    writeProjectTree(id, tree)

    for (const dp of deletedPaths) {
      eventBus.emit('file:deleted', { projectId: id, path: dp })
    }

    this.notify()
  }

  renamePath(from: string, to: string) {
    if (this.useV2) {
      // v2 path
      const id = this.v2ActiveProjectId
      if (!id) return
      const src = this.v2Normalize(from)
      const dst = this.v2Normalize(to)
      if (src === dst) return

      const files = this.v2Files.get(id) || new Map<string, V2FileRecord>()
      const moves: Array<{ from: string; to: string; rec: V2FileRecord }> = []

      if (files.has(src)) {
        const rec = files.get(src)!
        const newRec: V2FileRecord = { ...rec, path: dst, updatedAt: now() }
        files.delete(src)
        files.set(dst, newRec)
        moves.push({ from: src, to: dst, rec: newRec })
      } else {
        // folder rename
        const affected = Array.from(files.keys())
          .filter((p) => p === src || p.startsWith(src + '/'))
          .sort((a, b) => b.length - a.length)
        for (const oldPath of affected) {
          const rel = oldPath === src ? '' : oldPath.slice(src.length + 1)
          const newPath = rel ? `${dst}/${rel}`.replace(/\/+/g, '/') : dst
          const rec = files.get(oldPath)!
          const newRec: V2FileRecord = { ...rec, path: this.v2Normalize(newPath), updatedAt: now() }
          files.delete(oldPath)
          files.set(newRec.path, newRec)
          moves.push({ from: oldPath, to: newRec.path, rec: newRec })
        }
        // update explicitDirs
        const doc = this.v2Docs.get(id)
        if (doc) {
          const dirs = new Set<string>((doc.metadata.explicitDirs || []).map((d) => this.v2Normalize(d)))
          if (dirs.has(src)) {
            dirs.delete(src)
            dirs.add(dst)
            doc.metadata.explicitDirs = Array.from(dirs)
            doc.updatedAt = now()
            this.fireAndForget(storageV2.idbPutProject(doc))
          }
        }
      }

      // persist files
      for (const m of moves) {
        this.fireAndForget(storageV2.idbPutFile(id, m.rec))
        if (m.from !== m.to) {
          this.fireAndForget(storageV2.idbDeleteFile(id, m.from))
        }
        eventBus.emit('file:moved', { projectId: id, from: m.from, to: m.to })
      }

      // update stats (unchanged counts/sizes but update timestamp)
      const doc = this.v2Docs.get(id)
      if (doc) {
        doc.updatedAt = now()
        this.fireAndForget(storageV2.idbPutProject(doc))
      }
      this.v2Files.set(id, files)
      this.notify()
      return
    }
    // v1 fallback
    const id = this.getActiveProjectId()
    if (!id) return
    const src = normalizePath(from)
    const dst = normalizePath(to)
    if (src === dst) return

    const srcIsDir = this.isDirectoryPath(id, src)

    if (srcIsDir) {
      const all = listAllFilePaths(id)
      const affected = all
        .filter((p) => p === src || p.startsWith(src + '/'))
        .sort((a, b) => b.length - a.length)
      for (const oldPath of affected) {
        const rel = oldPath === src ? '' : oldPath.slice(src.length + 1)
        const newPath = rel ? `${dst}/${rel}`.replace(/\/+/g, '/') : dst
        const rec = readFileRecord(id, oldPath)
        if (rec) {
          writeFileRecord(id, { ...rec, path: newPath })
          deleteFileRecord(id, oldPath)
          eventBus.emit('file:moved', { projectId: id, from: oldPath, to: newPath })
        }
      }
    } else {
      const rec = readFileRecord(id, src)
      if (rec) {
        writeFileRecord(id, { ...rec, path: dst })
        deleteFileRecord(id, src)
        eventBus.emit('file:moved', { projectId: id, from: src, to: dst })
      }
    }

    const tree = readProjectTree(id) || ensureRootTree()
    renamePathInTree(tree, src, dst)
    writeProjectTree(id, tree)
    this.notify()
  }

  movePath(sourcePath: string, targetDirPath: string) {
    const name = basename(sourcePath)
    const to = (this.useV2 ? this.v2Normalize(targetDirPath ? `${targetDirPath}/${name}` : name)
                           : normalizePath(targetDirPath ? `${targetDirPath}/${name}` : name))
    this.renamePath(sourcePath, to)
  }

  // ------------- Back-compat wrappers (active project) -------------
  getTree(): FileNode {
    return this.listTree()
  }

  getFile(path: string): FileNode | undefined {
    if (this.useV2) {
      const id = this.v2ActiveProjectId
      if (!id) return undefined
      const p = this.v2Normalize(path)
      const rec = this.v2Files.get(id)?.get(p)
      if (!rec) return undefined
      return { name: basename(p), path: p, type: 'file', content: rec.content }
    }
    const id = this.getActiveProjectId()
    if (!id) return undefined
    const p = normalizePath(path)
    const rec = readFileRecord(id, p)
    if (!rec) return undefined
    return { name: basename(p), path: p, type: 'file', content: rec.content }
  }

  deleteFile(path: string): boolean {
    if (this.useV2) {
      const id = this.v2ActiveProjectId
      if (!id) return false
      const p = this.v2Normalize(path)
      const exists = this.v2Files.get(id)?.has(p) ?? false
      if (!exists) return false
      this.deletePath(p)
      return true
    }
    const id = this.getActiveProjectId()
    if (!id) return false
    const p = normalizePath(path)
    const exists = !!readFileRecord(id, p)
    if (!exists) return false
    this.deletePath(p)
    return true
  }

  clear() {
    if (this.useV2) {
      const id = this.v2ActiveProjectId
      if (!id) return
      const files = this.v2Files.get(id)
      if (files) {
        const keys = Array.from(files.keys())
        for (const p of keys) {
          files.delete(p)
          this.fireAndForget(storageV2.idbDeleteFile(id, p))
        }
        this.v2Files.set(id, files)
      }
      const doc = this.v2Docs.get(id)
      if (doc) {
        doc.stats.fileCount = 0
        doc.stats.totalBytes = 0
        doc.updatedAt = now()
        this.fireAndForget(storageV2.idbPutProject(doc))
      }
      this.notify()
      return
    }
    const id = this.getActiveProjectId()
    if (!id) return
    for (const p of listAllFilePaths(id)) {
      deleteFileRecord(id, p)
    }
    writeProjectTree(id, ensureRootTree())
    this.notify()
  }

  // ------------- Helpers -------------
  private isDirectoryPath(projectId: string, p: string): boolean {
    if (this.useV2) {
      // v2 path
      return this.v2IsDirectoryPath(projectId, p)
    }
    // v1 fallback
    const tree = readProjectTree(projectId) || ensureRootTree()
    const hit = locateNode(tree, p)
    return !!hit && hit.node.type === 'directory'
  }
}

// Singleton
export const fileSystem = new FileSystemService()

// EventBus bridge (minimal)
export function on<K extends EventName>(eventName: K, handler: (payload: Payloads[K]) => void) {
  return eventBus.on(eventName, handler)
}

export function off<K extends EventName>(eventName: K, handler: (payload: Payloads[K]) => void) {
  return eventBus.off(eventName, handler)
}

// ---- VFS persistence layer (debounced) ----
// Persist a simple virtual FS snapshot for the active project so sessions restore reliably.
// Keys:
//  - 'vfs:files'  => Record&lt;string,string&gt; mapping normalized file paths to content
//  - 'vfs:active' => string|null active file path
// Notes:
//  - Debounced writes (500ms) on any FS mutation or active file change
//  - Idempotent initialization that hydrates from storage or seeds defaults

const VFS_FILES_KEY = 'vfs:files';
const VFS_ACTIVE_KEY = 'vfs:active';

let __vfsInitialized = false;
let __vfsSaveTimer: any = null;
const __vfsDebounceMs = 500;

async function __vfsBuildSnapshot(): Promise<{ files: Record<string, string>; active: string | null; projectId: string | null }> {
  const projectId = fileSystem.getActiveProjectId();
  const filesMap: Record<string, string> = {};
  if (projectId) {
    try {
      const nodes = fileSystem.getAllFiles(projectId) as any[]; // existing sync API with projectId → FileNode[]
      for (const n of nodes) {
        if (n && n.type === 'file') {
          const p = storageV2.normalizePath(n.path || '');
          filesMap[p] = String(n.content ?? '');
        }
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[FS vfs] snapshot failed to enumerate files:', e);
    }
  }
  // Derive active file path from project list meta (works for both v1 and v2)
  let active: string | null = null;
  try {
    if (projectId) {
      const meta = fileSystem.getProjectList().find((x) => x.id === projectId);
      active = (meta?.activeFilePath ?? null) as string | null;
      if (active) active = storageV2.normalizePath(active);
    }
  } catch {}
  return { files: filesMap, active, projectId: projectId ?? null };
}

function __scheduleVfsPersist() {
  try {
    if (__vfsSaveTimer) {
      clearTimeout(__vfsSaveTimer);
      __vfsSaveTimer = null;
    }
    __vfsSaveTimer = setTimeout(async () => {
      __vfsSaveTimer = null;
      await __vfsPersistNow();
    }, __vfsDebounceMs);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[FS vfs] schedule persist error:', e);
  }
}

async function __vfsPersistNow() {
  try {
    const snap = await __vfsBuildSnapshot();
    // Batch logical write (two KV sets)
    await storageV2.idbKvSet(VFS_FILES_KEY, snap.files);
    await storageV2.idbKvSet(VFS_ACTIVE_KEY, snap.active ?? null);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[FS vfs] persist failed:', e);
  }
}

// Subscribe to mutations → debounce save
// Use existing EventBus events without altering service APIs or callers.
(() => {
  try {
    // Coalesced file mutations land as tree:changed
    eventBus.on('tree:changed', ({ projectId }) => {
      const active = fileSystem.getActiveProjectId();
      if (!active || projectId !== active) return;
      __scheduleVfsPersist();
    });
    // Active project changes
    eventBus.on('project:activeChanged', () => {
      __scheduleVfsPersist();
    });
    // Meta changes (listen for activeFilePath changes)
    eventBus.on('project:metaChanged', ({ metaPatch }) => {
      if (metaPatch && Object.prototype.hasOwnProperty.call(metaPatch, 'activeFilePath')) {
        __scheduleVfsPersist();
      }
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[FS vfs] failed to attach event listeners:', e);
  }
})();

// Default seed when storage is empty
function __defaultSeedFiles(): Record<string, string> {
  const html = [
    '<!doctype html>',
    '<html><head><meta charset="utf-8"/><title>Sandbox</title></head>',
    '<body><div id="root">Hello Sandbox</div>',
    '<script type="module">console.log("Hello from index.html")</script>',
    '</body></html>',
  ].join('\n');
  const css = 'body { font-family: sans-serif; padding: 16px; }';
  const js = 'console.log("Hello from index.js")';
  return {
    'index.html': html,
    'styles.css': css,
    'index.js': js, // optional
  };
}

// Public initializer (idempotent)
export async function initializeFromStorage(): Promise<void> {
  if (__vfsInitialized) return;
  try {
    // Read saved KV keys
    const savedFiles = (await storageV2.idbKvGet(VFS_FILES_KEY)) as Record<string, string> | undefined;
    const savedActive = (await storageV2.idbKvGet(VFS_ACTIVE_KEY)) as string | null | undefined;

    const filesObj = (savedFiles && typeof savedFiles === 'object') ? savedFiles as Record<string, string> : {};
    const keys = Object.keys(filesObj || {}).map((k) => storageV2.normalizePath(k));
    const hasSaved = keys.length > 0;

    // Ensure there is an active project
    let pid = fileSystem.getActiveProjectId();
    if (!pid) {
      // Will respect existing v1/v2 routing internally
      pid = fileSystem.createProject('My Project', false);
      if (pid) fileSystem.setActiveProject(pid);
    }

    // If we have saved state, hydrate into active project
    if (hasSaved) {
      const current = fileSystem.getActiveProjectId();
      if (!current) {
        // fallback create once more if race occurred
        const id = fileSystem.createProject('My Project', false);
        if (id) fileSystem.setActiveProject(id);
      }
      const activeId = fileSystem.getActiveProjectId();
      // Delete files not in saved map
      try {
        const existing = fileSystem.getAllFiles(activeId || undefined) as any[]; // FileNode[]
        const existingSet = new Set<string>((existing || []).filter((n) => n?.type === 'file').map((n) => storageV2.normalizePath(n.path)));
        const savedSet = new Set<string>(keys);
        for (const p of existingSet) {
          if (!savedSet.has(p)) {
            // delete missing
            fileSystem.deletePath(p);
          }
        }
      } catch {}

      // Write saved files
      for (const p of keys) {
        try {
          const content = String((filesObj as any)[p] ?? '');
          fileSystem.writeFile(p, content);
        } catch {}
      }

      // Restore active file path if it exists in the saved set
      const ap = savedActive ? storageV2.normalizePath(savedActive) : null;
      const finalActive = ap && keys.includes(ap) ? ap : (keys.includes('index.html') ? 'index.html' : null);
      fileSystem.setActiveFilePath(finalActive);
    } else {
      // First-run: seed defaults only if project has no files yet
      const activeId = fileSystem.getActiveProjectId();
      const existing = fileSystem.getAllFiles(activeId || undefined) as any[]; // FileNode[]
      const hasAny = Array.isArray(existing) && existing.some((n) => n?.type === 'file');
      if (!hasAny) {
        const seed = __defaultSeedFiles();
        for (const [p, c] of Object.entries(seed)) {
          fileSystem.writeFile(storageV2.normalizePath(p), String(c));
        }
        fileSystem.setActiveFilePath('index.html');
      }
    }

    __vfsInitialized = true;
    // Persist snapshot after hydration/seed to ensure keys exist
    __scheduleVfsPersist();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[FS vfs] initializeFromStorage failed:', e);
  }
}

// Additional read APIs (module-level) without changing existing class method signatures
export async function getAllFiles(): Promise<Record<string, string>> {
  const snap = await __vfsBuildSnapshot();
  return snap.files;
}

export function getActivePath(): string | null {
  try {
    const id = fileSystem.getActiveProjectId();
    if (!id) return null;
    const meta = fileSystem.getProjectList().find((x) => x.id === id);
    return (meta?.activeFilePath ?? null) as string | null;
  } catch {
    return null;
  }
}
