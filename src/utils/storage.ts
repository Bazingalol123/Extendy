/**
 * Storage Utilities
 * Provides functions for managing provider keys and settings in chrome.storage.local
 */

import { storageV2, ProjectDoc, FileRecord, ChatMeta, ChatMessage, ProjectMetaIndexItem } from './storageV2'

/**
 * Provider keys interface for multi-provider support
 */
export interface ProviderKeys {
  googleGemini: string
  openai: string
  anthropic: string
  ollama: string
  perplexity: string
}

/**
 * Storage schema interface
 */
export interface StorageSchema {
  providerKeys: ProviderKeys
  defaultProvider: string
  lastUsedProvider?: string
  providerModels?: Record<string, string>
  theme?: 'light' | 'dark'
  streamResponses?: boolean
}

/**
 * Default provider keys (all empty initially)
 */
const DEFAULT_PROVIDER_KEYS: ProviderKeys = {
  googleGemini: '',
  openai: '',
  anthropic: '',
  ollama: '',
  perplexity: ''
}

/**
 * Get all provider keys from storage
 * @returns Promise with provider keys object
 */
export async function getProviderKeys(): Promise<ProviderKeys> {
  try {
    const result = await chrome.storage.local.get('providerKeys')
    return result.providerKeys || DEFAULT_PROVIDER_KEYS
  } catch (error) {
    console.error('Error getting provider keys:', error)
    return DEFAULT_PROVIDER_KEYS
  }
}

/**
 * Save all provider keys to storage
 * @param keys - Provider keys object to save
 */
export async function saveProviderKeys(keys: ProviderKeys): Promise<void> {
  try {
    await chrome.storage.local.set({ providerKeys: keys })
  } catch (error) {
    console.error('Error saving provider keys:', error)
    throw new Error('Failed to save provider keys')
  }
}

/**
 * Get the default provider setting
 * @returns Promise with default provider name
 */
export async function getDefaultProvider(): Promise<string> {
  try {
    const result = await chrome.storage.local.get('defaultProvider')
    return result.defaultProvider || 'googleGemini'
  } catch (error) {
    console.error('Error getting default provider:', error)
    return 'googleGemini'
  }
}

/**
 * Set the default provider
 * @param provider - Provider name to set as default
 */
export async function setDefaultProvider(provider: string): Promise<void> {
  try {
    await chrome.storage.local.set({ defaultProvider: provider })
  } catch (error) {
    console.error('Error setting default provider:', error)
    throw new Error('Failed to set default provider')
  }
}

/**
 * Get the last used provider (for session continuity)
 * @returns Promise with last used provider name or undefined
 */
export async function getLastUsedProvider(): Promise<string | undefined> {
  try {
    const result = await chrome.storage.local.get('lastUsedProvider')
    return result.lastUsedProvider
  } catch (error) {
    console.error('Error getting last used provider:', error)
    return undefined
  }
}

/**
 * Set the last used provider
 * @param provider - Provider name to set as last used
 */
export async function setLastUsedProvider(provider: string): Promise<void> {
  try {
    await chrome.storage.local.set({ lastUsedProvider: provider })
  } catch (error) {
    console.error('Error setting last used provider:', error)
  }
}

/**
 * Get saved model for a specific provider
 * @param provider - Provider name
 * @returns Promise with model name or undefined
 */
export async function getProviderModel(provider: string): Promise<string | undefined> {
  try {
    const result = await chrome.storage.local.get('providerModels')
    return result.providerModels?.[provider]
  } catch (error) {
    console.error('Error getting provider model:', error)
    return undefined
  }
}

/**
 * Save model selection for a specific provider
 * @param provider - Provider name
 * @param model - Model name to save
 */
export async function setProviderModel(provider: string, model: string): Promise<void> {
  try {
    const result = await chrome.storage.local.get('providerModels')
    const providerModels = result.providerModels || {}
    providerModels[provider] = model
    await chrome.storage.local.set({ providerModels })
  } catch (error) {
    console.error('Error setting provider model:', error)
    throw new Error('Failed to save model selection')
  }
}

/**
 * Migrate from old storage format (single provider/token) to new multi-provider format
 * This ensures backward compatibility with existing installations
 */
export async function migrateStorage(): Promise<void> {
  try {
    // Check if migration is needed
    const result = await chrome.storage.local.get(['provider', 'token', 'providerKeys'])
    
    // If providerKeys already exists, migration was already done
    if (result.providerKeys) {
      return
    }
    
    // If old format exists, migrate it
    if (result.provider && result.token) {
      const providerKeys = { ...DEFAULT_PROVIDER_KEYS }
      
      // Map old provider names to new format
      const providerMap: Record<string, keyof ProviderKeys> = {
        'openai': 'openai',
        'anthropic': 'anthropic',
        'ollama': 'ollama',
        'mock': 'googleGemini', // Default fallback
        'gemini': 'googleGemini',
        'googlegemini': 'googleGemini',
        'google-gemini': 'googleGemini',
        'perplexity': 'perplexity'
      }
      
      const oldProvider = result.provider.toLowerCase().replace(/[_\s-]/g, '')
      const newProviderKey = providerMap[oldProvider] || 'googleGemini'
      
      // Migrate the API key to the appropriate provider
      providerKeys[newProviderKey] = result.token
      
      // Save migrated data
      await chrome.storage.local.set({
        providerKeys,
        defaultProvider: newProviderKey,
        streamResponses: true
      })
      
      // Clean up old keys
      await chrome.storage.local.remove(['provider', 'token'])
      
      console.log('Storage migration completed successfully')
    } else {
      // No old data, initialize with defaults
      await chrome.storage.local.set({
        providerKeys: DEFAULT_PROVIDER_KEYS,
        defaultProvider: 'googleGemini',
        streamResponses: true
      })
    }
  } catch (error) {
    console.error('Error during storage migration:', error)
    // Don't throw - allow app to continue with defaults
  }
}

/**
 * Get stream responses preference
 * @returns Promise with boolean preference
 */
export async function getStreamResponses(): Promise<boolean> {
  try {
    const result = await chrome.storage.local.get('streamResponses')
    return result.streamResponses !== undefined ? result.streamResponses : true
  } catch (error) {
    console.error('Error getting stream responses preference:', error)
    return true
  }
}

/**
 * Set stream responses preference
 * @param enabled - Whether streaming is enabled
 */
export async function setStreamResponses(enabled: boolean): Promise<void> {
  try {
    await chrome.storage.local.set({ streamResponses: enabled })
  } catch (error) {
    console.error('Error setting stream responses preference:', error)
    throw new Error('Failed to save streaming preference')
  }
}
// ================================================
// Project Storage v1 (localStorage-backed) additions
// Namespaced under extendy:v1:*
// ================================================

/** Sender roles for chat messages */
export type V1Sender = 'user' | 'assistant' | 'tool' | 'system'

/** Lightweight index entry for listing projects */
export interface ProjectIndexEntry {
  id: string
  name: string
  createdAt: number
  lastOpenedAt: number
  activeFilePath?: string | null
  version: number
}

/** File record persisted per file path */
export interface V1FileRecord {
  path: string
  content: string // utf-8 or data-url for binary-like assets
  hint?: string   // language/category hint (html, css, js, ts, tsx, json, md, image, other)
  updatedAt: number
  size?: number
}

/** Tree node entry (lightweight) */
export interface V1TreeNode {
  type: 'directory' | 'file'
  name: string
  path: string // slash-delimited, no leading slash e.g. src/index.html
  children?: V1TreeNode[] // only for directories
}

/** Per-project chat meta */
export interface V1ChatMeta {
  totalMessages: number
  segments: number
  segmentSize: number
  lastUpdated: number
}

/** Chat message payload for segments */
export interface V1ChatMessage {
  id: string
  sender: V1Sender
  text: string
  timestamp: number
  role?: V1Sender
  toolCallId?: string
}

const STORAGE_PREFIX = 'extendy:v1:'
const KEY_ROOT_VERSION = 'rootVersion'
const KEY_PROJECTS_INDEX = 'projectsIndex'
const KEY_ACTIVE_PROJECT = 'activeProjectId'
const KEY_MIGRATIONS = 'migrations'

function ns(key: string): string {
  return `${STORAGE_PREFIX}${key}`
}

function safeParse<T>(raw: string | null, fallback: T): T {
  try {
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function jsonGet<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined' || !window.localStorage) return fallback
  const raw = localStorage.getItem(ns(key))
  return safeParse<T>(raw, fallback)
}

function jsonSet(key: string, value: unknown): void {
  if (typeof window === 'undefined' || !window.localStorage) return
  try {
    localStorage.setItem(ns(key), JSON.stringify(value))
  } catch (e) {
    console.error('[storage] Failed to set key', key, e)
    throw e
  }
}

function keyProjectMeta(id: string): string {
  return `proj:${id}:meta`
}
function keyProjectTree(id: string): string {
  return `proj:${id}:tree`
}
function keyProjectFile(id: string, encodedPath: string): string {
  return `proj:${id}:files:${encodedPath}`
}
function keyProjectChatMeta(id: string): string {
  return `proj:${id}:chat:meta`
}
function keyProjectChatSeg(id: string, n: number): string {
  return `proj:${id}:chat:seg:${n}`
}

export function encodePath(path: string): string {
  return encodeURIComponent(path)
}

export function decodePath(encoded: string): string {
  return decodeURIComponent(encoded)
}

// Root initialization and versioning
export function ensureRootInitialized(): void {
  const ver = jsonGet<number>(KEY_ROOT_VERSION, 0)
  if (!ver) {
    jsonSet(KEY_ROOT_VERSION, 1)
    jsonSet(KEY_PROJECTS_INDEX, [] as ProjectIndexEntry[])
    // migrations bootstrap
    jsonSet(KEY_MIGRATIONS, { })
  }
}

// Projects index
export function getProjectsIndex(): ProjectIndexEntry[] {
  return jsonGet<ProjectIndexEntry[]>(KEY_PROJECTS_INDEX, [])
}

export function setProjectsIndex(entries: ProjectIndexEntry[]): void {
  jsonSet(KEY_PROJECTS_INDEX, entries)
}

// Active project
export function getActiveProjectId(): string | null {
  return jsonGet<string | null>(KEY_ACTIVE_PROJECT, null)
}

export function setActiveProjectId(id: string | null): void {
  jsonSet(KEY_ACTIVE_PROJECT, id)
}

// Project meta
export function readProjectMeta(id: string): ProjectIndexEntry | null {
  return jsonGet<ProjectIndexEntry | null>(keyProjectMeta(id), null)
}

export function writeProjectMeta(meta: ProjectIndexEntry): void {
  jsonSet(keyProjectMeta(meta.id), meta)
}

export function deleteProjectMeta(id: string): void {
  if (typeof window === 'undefined' || !window.localStorage) return
  localStorage.removeItem(ns(keyProjectMeta(id)))
}

// Tree
export function readProjectTree(id: string): V1TreeNode | null {
  return jsonGet<V1TreeNode | null>(keyProjectTree(id), null)
}

export function writeProjectTree(id: string, tree: V1TreeNode): void {
  jsonSet(keyProjectTree(id), tree)
}

export function deleteProjectTree(id: string): void {
  if (typeof window === 'undefined' || !window.localStorage) return
  localStorage.removeItem(ns(keyProjectTree(id)))
}

// File records
export function readFileRecord(projectId: string, path: string): V1FileRecord | null {
  return jsonGet<V1FileRecord | null>(keyProjectFile(projectId, encodePath(path)), null)
}

export function writeFileRecord(projectId: string, rec: V1FileRecord): void {
  jsonSet(keyProjectFile(projectId, encodePath(rec.path)), rec)
}

export function deleteFileRecord(projectId: string, path: string): void {
  if (typeof window === 'undefined' || !window.localStorage) return
  localStorage.removeItem(ns(keyProjectFile(projectId, encodePath(path))))
}

/** Enumerate all stored file records for a project (by scanning keys) */
export function listAllFilePaths(projectId: string): string[] {
  if (typeof window === 'undefined' || !window.localStorage) return []
  const prefix = ns(`proj:${projectId}:files:`)
  const out: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k && k.startsWith(prefix)) {
      const encoded = k.slice(prefix.length)
      try {
        out.push(decodePath(encoded))
      } catch {
        // skip malformed
      }
    }
  }
  return out
}

// Chat meta and segments
export function readChatMeta(projectId: string): V1ChatMeta | null {
  return jsonGet<V1ChatMeta | null>(keyProjectChatMeta(projectId), null)
}

export function writeChatMeta(projectId: string, meta: V1ChatMeta): void {
  jsonSet(keyProjectChatMeta(projectId), meta)
}

export function readChatSegment(projectId: string, n: number): V1ChatMessage[] {
  return jsonGet<V1ChatMessage[]>(keyProjectChatSeg(projectId, n), [])
}

export function writeChatSegment(projectId: string, n: number, msgs: V1ChatMessage[]): void {
  jsonSet(keyProjectChatSeg(projectId, n), msgs)
}

// Migrations flag helpers
export interface MigrationFlags {
  migratedFileSystem?: boolean
}

export function getMigrations(): MigrationFlags {
  return jsonGet<MigrationFlags>(KEY_MIGRATIONS, {})
}

export function setMigrations(flags: MigrationFlags): void {
  jsonSet(KEY_MIGRATIONS, flags)
}

// ================================================
// v2 migration — helpers and orchestrator
// Note: v1 APIs remain unchanged; this section only adds v2 migration utilities.
// ================================================

/** kv key prefix for v1Id → v2Id mapping */
const V2_KV_MAP_PREFIX = 'migrate.map.'
/** kv key prefix to flag a v1 project as migrated */
const V2_KV_DONE_PREFIX = 'migrate.done.'
/** default chat segment size for v2 when absent in v1 */
const V2_DEFAULT_SEGMENT_SIZE = 100

/** Coerce any legacy id into a safe v2 id (currently trim-only) */
function coerceId(id: string): string {
  return String(id ?? '').trim()
}

/** Construct a default v2 ProjectDoc following the Architect spec */
function defaultProjectDoc(v2Id: string, name: string, now: number): ProjectDoc {
  return {
    id: v2Id,
    name: name || 'Project',
    createdAt: now,
    updatedAt: now,
    stats: { fileCount: 0, totalBytes: 0, lastOpenedAt: now },
    metadata: {
      entryHtmlPath: 'index.html',
      openEditors: [],
      expandedPaths: [],
      explicitDirs: [],
      // preview: undefined (omitted)
      activeFilePath: null,
    },
  }
}

/** Derive explicit directory paths from a v1 tree (includes empty dirs) */
function collectExplicitDirsFromTree(tree: V1TreeNode | null): string[] {
  if (!tree) return []
  const dirs: Set<string> = new Set()
  const walk = (node: V1TreeNode) => {
    if (node.type === 'directory') {
      const normalized = storageV2.normalizePath(node.path || node.name || '')
      if (normalized) dirs.add(normalized)
      if (Array.isArray(node.children)) {
        for (const c of node.children) walk(c)
      }
    } else if (Array.isArray(node.children)) {
      for (const c of node.children) walk(c)
    }
  }
  walk(tree)
  return Array.from(dirs)
}

/**
 * Migrate a single v1 project into v2 backing stores.
 * Idempotent by per-project done flags and id mapping KV.
 */
async function migrateProject(v1Id: string, name: string): Promise<void> {
  // Per-project idempotency
  const done = await storageV2.idbKvGet(`${V2_KV_DONE_PREFIX}${v1Id}`)
  if (done) return

  // Resolve or create v2 id mapping
  let v2Id = await storageV2.idbKvGet(`${V2_KV_MAP_PREFIX}${v1Id}`)
  if (!v2Id || typeof v2Id !== 'string') {
    v2Id = coerceId(v1Id)
    await storageV2.idbKvSet(`${V2_KV_MAP_PREFIX}${v1Id}`, v2Id)
  }

  const now = Date.now()
  const doc: ProjectDoc = defaultProjectDoc(v2Id, name || 'Project', now)

  // Explicit dirs from v1 tree (if available)
  try {
    const tree = readProjectTree(v1Id)
    const dirs = collectExplicitDirsFromTree(tree)
    doc.metadata.explicitDirs = dirs
  } catch {
    // non-fatal
  }

  // Files
  const paths = listAllFilePaths(v1Id)
  for (const rawPath of paths) {
    try {
      const path = storageV2.normalizePath(rawPath)
      const rec = readFileRecord(v1Id, path)
      const content = rec?.content ?? ''
      const size = typeof rec?.size === 'number' ? (rec as V1FileRecord).size! : new Blob([content]).size
      const fileRec: FileRecord = {
        projectId: v2Id,
        path,
        content,
        contentType: (rec as any)?.contentType,
        size,
        updatedAt: rec?.updatedAt ?? now,
      }
      await storageV2.idbPutFile(v2Id, fileRec)
      doc.stats.fileCount += 1
      doc.stats.totalBytes += size
    } catch {
      // continue on per-file errors
    }
  }

  // Chat (if present)
  try {
    const chatMetaV1 = readChatMeta(v1Id)
    if (chatMetaV1) {
      const meta: ChatMeta = {
        projectId: v2Id,
        totalMessages: chatMetaV1.totalMessages || 0,
        segments: chatMetaV1.segments || 0,
        segmentSize: chatMetaV1.segmentSize || V2_DEFAULT_SEGMENT_SIZE,
        lastUpdated: chatMetaV1.lastUpdated || now,
      }
      await storageV2.idbPutChatMeta(v2Id, meta)
      for (let i = 0; i < meta.segments; i++) {
        const msgsV1 = readChatSegment(v1Id, i)
        const msgs: ChatMessage[] = Array.isArray(msgsV1) ? (msgsV1 as unknown as ChatMessage[]) : []
        await storageV2.idbPutChatSegment(v2Id, i, msgs)
      }
    }
  } catch {
    // non-fatal
  }

  // Finalize project doc
  doc.updatedAt = now
  doc.stats.lastOpenedAt = now
  await storageV2.idbPutProject(doc)

  // Mark done
  await storageV2.idbKvSet(`${V2_KV_DONE_PREFIX}${v1Id}`, true)
}

/**
 * Check whether storage v2 has been initialized (schemaVersion === 2).
 * @returns Promise<boolean>
 */
export async function isV2Initialized(): Promise<boolean> {
  try {
    const current = await storageV2.getSchemaVersion()
    return current === 2
  } catch {
    return false
  }
}

/**
 * Orchestrate v1 → v2 migration.
 * - No side effects if already initialized (schemaVersion === 2).
 * - Idempotent per-project using KV flags and v1→v2 id map.
 * - Does not run automatically; call from app bootstrap.
 * @returns Promise<void>
 */
export async function migrateToV2IfNeeded(): Promise<void> {
  try {
    const current = await storageV2.getSchemaVersion()
    if (current === 2) return

    // Ensure IDB stores exist up front
    await storageV2.openDb()

    // Read v1 projects index and migrate each
    const v1Index = getProjectsIndex() || []
    const dedup = new Map<string, ProjectMetaIndexItem>()
    const now = Date.now()

    for (const item of v1Index) {
      const id = coerceId(item.id)
      const name = item.name || 'Project'
      await migrateProject(item.id, name)

      const entry: ProjectMetaIndexItem = {
        id,
        name,
        createdAt: item.createdAt ?? now,
        updatedAt: (item as any).updatedAt ?? now,
        lastOpenedAt: now,
      }
      dedup.set(id, entry)
    }

    // Persist v2 index (deduplicated)
    const v2Index = Array.from(dedup.values())
    await storageV2.setProjectsIndex(v2Index)

    // Active project id
    const activeV1 = getActiveProjectId()
    await storageV2.setActiveProjectId(activeV1 ? coerceId(activeV1) : null)

    // Set schema version last to signal completion
    await storageV2.setSchemaVersion(2)
  } catch (e: any) {
    const msg = e?.message || String(e)
    throw new Error(`[migration] ${msg}`)
  }
}