/**
 * storageV2: Non-breaking v2 storage module
 * - Chrome storage local index helpers (with localStorage fallback)
 * - IndexedDB adapters for projects, files, and chat
 * - Safe wrappers to work in MV3 extension and dev (no chrome)
 *
 * This file intentionally has no side-effects.
 */

// ========= Types =========

export type ProjectMetaIndexItem = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  lastOpenedAt: number;
};

export type ProjectDoc = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  stats: { fileCount: number; totalBytes: number; lastOpenedAt: number };
  metadata: {
    entryHtmlPath: string;
    openEditors: string[];
    expandedPaths: string[];
    explicitDirs: string[];
    preview?: { throttleMs?: number; device?: string };
    activeFilePath?: string | null;
  };
};

export type FileRecord = {
  projectId: string;
  path: string;
  content: string;
  contentType?: string;
  size: number;
  updatedAt: number;
};

export type ChatMeta = {
  projectId: string;
  totalMessages: number;
  segments: number;
  segmentSize: number;
  lastUpdated: number;
};

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant' | 'tool' | 'system';
  text: string;
  timestamp: number;
  toolCallId?: string;
};

export type OpenDbOptions = {
  upgrade?: (db: IDBDatabase, oldVersion: number, newVersion: number | null) => void;
};

// ========= Internals / helpers =========

const __DEV__ = (() => {
  try {
    const env = (import.meta as any)?.env;
    return !!(env && (env.DEV === true || env.MODE === 'development'));
  } catch {
    return false;
  }
})();
const LOG_PREFIX = '[storageV2]';

function getChromeStorageLocal(): any | null {
  const c = (globalThis as any).chrome;
  return c && c.storage && c.storage.local ? c.storage.local : null;
}

function getChromeRuntime(): any | null {
  const c = (globalThis as any).chrome;
  return c && c.runtime ? c.runtime : null;
}

function hasLocalStorage(): boolean {
  try {
    return typeof globalThis !== 'undefined' && typeof (globalThis as any).localStorage !== 'undefined';
  } catch {
    return false;
  }
}

function safeParseJSON<T>(str: string | null, fallback: T): T {
  if (!str) return fallback;
  try {
    return JSON.parse(str) as T;
  } catch {
    return fallback;
  }
}

export function isChromeStorageAvailable(): boolean {
  return !!getChromeStorageLocal();
}

// ========= Chrome storage index helpers (with localStorage fallback) =========

const KEY_SCHEMA_VERSION = 'extendy:schemaVersion';
const KEY_ACTIVE_PROJECT_ID = 'extendy:activeProjectId';
const KEY_PROJECTS_INDEX = 'extendy:projects:v2:index';

function chromeGet<T = any>(key: string): Promise<T | undefined> {
  const storageLocal = getChromeStorageLocal();
  if (!storageLocal) return Promise.resolve(undefined);
  return new Promise<T | undefined>((resolve, reject) => {
    try {
      storageLocal.get(key, (result: any) => {
        const runtime = getChromeRuntime();
        const err = runtime && runtime.lastError;
        if (err) {
          reject(new Error(`${LOG_PREFIX} chrome.storage.local.get("${key}") failed: ${err.message || err}`));
          return;
        }
        resolve(result ? result[key] as T : undefined);
      });
    } catch (e: any) {
      reject(new Error(`${LOG_PREFIX} chrome.storage.local.get("${key}") threw: ${e?.message || e}`));
    }
  });
}

function chromeSet(key: string, value: any): Promise<void> {
  const storageLocal = getChromeStorageLocal();
  if (!storageLocal) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    try {
      storageLocal.set({ [key]: value }, () => {
        const runtime = getChromeRuntime();
        const err = runtime && runtime.lastError;
        if (err) {
          reject(new Error(`${LOG_PREFIX} chrome.storage.local.set("${key}") failed: ${err.message || err}`));
          return;
        }
        resolve();
      });
    } catch (e: any) {
      reject(new Error(`${LOG_PREFIX} chrome.storage.local.set("${key}") threw: ${e?.message || e}`));
    }
  });
}

function chromeRemove(key: string): Promise<void> {
  const storageLocal = getChromeStorageLocal();
  if (!storageLocal) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    try {
      storageLocal.remove(key, () => {
        const runtime = getChromeRuntime();
        const err = runtime && runtime.lastError;
        if (err) {
          reject(new Error(`${LOG_PREFIX} chrome.storage.local.remove("${key}") failed: ${err.message || err}`));
          return;
        }
        resolve();
      });
    } catch (e: any) {
      reject(new Error(`${LOG_PREFIX} chrome.storage.local.remove("${key}") threw: ${e?.message || e}`));
    }
  });
}

async function getSchemaVersion(): Promise<number | null> {
  try {
    if (isChromeStorageAvailable()) {
      const val = await chromeGet<number | string>(KEY_SCHEMA_VERSION);
      if (typeof val === 'number') return val;
      if (typeof val === 'string') {
        const n = parseInt(val, 10);
        return Number.isFinite(n) ? n : null;
      }
      return null;
    }
    if (hasLocalStorage()) {
      const raw = (globalThis as any).localStorage.getItem(KEY_SCHEMA_VERSION);
      const n = raw != null ? parseInt(raw, 10) : NaN;
      return Number.isFinite(n) ? n : null;
    }
    return null;
  } catch (e: any) {
    throw new Error(`${LOG_PREFIX} getSchemaVersion failed: ${e?.message || e}`);
  }
}

async function setSchemaVersion(v: number): Promise<void> {
  try {
    if (isChromeStorageAvailable()) {
      await chromeSet(KEY_SCHEMA_VERSION, v);
      return;
    }
    if (hasLocalStorage()) {
      (globalThis as any).localStorage.setItem(KEY_SCHEMA_VERSION, String(v));
    }
  } catch (e: any) {
    throw new Error(`${LOG_PREFIX} setSchemaVersion failed: ${e?.message || e}`);
  }
}

async function getActiveProjectId(): Promise<string | null> {
  try {
    if (isChromeStorageAvailable()) {
      const val = await chromeGet<string>(KEY_ACTIVE_PROJECT_ID);
      return typeof val === 'string' ? val : null;
    }
    if (hasLocalStorage()) {
      const raw = (globalThis as any).localStorage.getItem(KEY_ACTIVE_PROJECT_ID);
      return raw !== null ? raw : null;
    }
    return null;
  } catch (e: any) {
    throw new Error(`${LOG_PREFIX} getActiveProjectId failed: ${e?.message || e}`);
  }
}

async function setActiveProjectId(id: string | null): Promise<void> {
  try {
    if (isChromeStorageAvailable()) {
      if (id == null) {
        await chromeRemove(KEY_ACTIVE_PROJECT_ID);
      } else {
        await chromeSet(KEY_ACTIVE_PROJECT_ID, id);
      }
      return;
    }
    if (hasLocalStorage()) {
      if (id == null) {
        (globalThis as any).localStorage.removeItem(KEY_ACTIVE_PROJECT_ID);
      } else {
        (globalThis as any).localStorage.setItem(KEY_ACTIVE_PROJECT_ID, id);
      }
    }
  } catch (e: any) {
    throw new Error(`${LOG_PREFIX} setActiveProjectId failed: ${e?.message || e}`);
  }
}

async function getProjectsIndex(): Promise<ProjectMetaIndexItem[]> {
  try {
    if (isChromeStorageAvailable()) {
      const val = await chromeGet<ProjectMetaIndexItem[] | string>(KEY_PROJECTS_INDEX);
      if (Array.isArray(val)) return val as ProjectMetaIndexItem[];
      if (typeof val === 'string') {
        return safeParseJSON<ProjectMetaIndexItem[]>(val, []);
      }
      return [];
    }
    if (hasLocalStorage()) {
      const raw = (globalThis as any).localStorage.getItem(KEY_PROJECTS_INDEX);
      return safeParseJSON<ProjectMetaIndexItem[]>(raw, []);
    }
    return [];
  } catch (e: any) {
    throw new Error(`${LOG_PREFIX} getProjectsIndex failed: ${e?.message || e}`);
  }
}

async function setProjectsIndex(list: ProjectMetaIndexItem[]): Promise<void> {
  try {
    if (isChromeStorageAvailable()) {
      // Store as structured clone (array) to avoid parse/stringify in extension
      await chromeSet(KEY_PROJECTS_INDEX, list);
      return;
    }
    if (hasLocalStorage()) {
      (globalThis as any).localStorage.setItem(KEY_PROJECTS_INDEX, JSON.stringify(list || []));
    }
  } catch (e: any) {
    throw new Error(`${LOG_PREFIX} setProjectsIndex failed: ${e?.message || e}`);
  }
}

// ========= Path utility =========

function normalizePath(p: string): string {
  if (!p) return '';
  let s = String(p).replace(/\\/g, '/');
  s = s.replace(/^\/+/, '');
  const parts: string[] = [];
  for (const seg of s.split('/')) {
    if (!seg || seg === '.') continue;
    parts.push(seg);
  }
  return parts.join('/');
}

// ========= IndexedDB =========

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(options?: OpenDbOptions): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    try {
      const req = indexedDB.open('extendy.v2', 1);
      req.onupgradeneeded = (ev: IDBVersionChangeEvent) => {
        const db = req.result;
        // Create object stores if missing
        if (!db.objectStoreNames.contains('projects')) {
          db.createObjectStore('projects', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('files')) {
          const files = db.createObjectStore('files', { keyPath: ['projectId', 'path'] });
          files.createIndex('byProjectId', 'projectId', { unique: false });
        }
        if (!db.objectStoreNames.contains('chatMeta')) {
          db.createObjectStore('chatMeta', { keyPath: 'projectId' });
        }
        if (!db.objectStoreNames.contains('chatSegments')) {
          const segs = db.createObjectStore('chatSegments', { keyPath: ['projectId', 'index'] });
          segs.createIndex('byProjectId', 'projectId', { unique: false });
        }
        if (!db.objectStoreNames.contains('kv')) {
          db.createObjectStore('kv', { keyPath: 'key' });
        }
        try {
          options?.upgrade?.(db, ev.oldVersion, (ev as any).newVersion ?? null);
        } catch (e: any) {
          if (__DEV__) console.warn(`${LOG_PREFIX} upgrade callback error:`, e);
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => {
          if (__DEV__) console.warn(`${LOG_PREFIX} versionchange, closing DB`);
          db.close();
        };
        resolve(db);
      };
      req.onerror = () => {
        reject(new Error(`${LOG_PREFIX} openDb failed: ${req.error?.message || req.error}`));
      };
      req.onblocked = () => {
        if (__DEV__) console.warn(`${LOG_PREFIX} openDb blocked`);
      };
    } catch (e: any) {
      reject(new Error(`${LOG_PREFIX} openDb threw: ${e?.message || e}`));
    }
  });
  return dbPromise;
}

function reqToPromise<T = any>(req: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(new Error(`${LOG_PREFIX} IDB request failed: ${req.error?.message || req.error}`));
  });
}

// ========= IDB Adapters =========

async function idbGetProject(id: string): Promise<ProjectDoc | null> {
  try {
    const db = await openDb();
    const tx = db.transaction('projects', 'readonly');
    const store = tx.objectStore('projects');
    const req = store.get(id);
    const res = await reqToPromise<ProjectDoc | undefined>(req);
    return res ?? null;
  } catch (e: any) {
    throw new Error(`${LOG_PREFIX} idbGetProject failed: ${e?.message || e}`);
  }
}

async function idbPutProject(doc: ProjectDoc): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction('projects', 'readwrite');
    const store = tx.objectStore('projects');
    await reqToPromise(store.put(doc));
  } catch (e: any) {
    throw new Error(`${LOG_PREFIX} idbPutProject failed: ${e?.message || e}`);
  }
}

async function idbDeleteProject(id: string): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction('projects', 'readwrite');
    const store = tx.objectStore('projects');
    await reqToPromise(store.delete(id));
  } catch (e: any) {
    throw new Error(`${LOG_PREFIX} idbDeleteProject failed: ${e?.message || e}`);
  }
}

async function idbPutFile(projectId: string, rec: FileRecord): Promise<void> {
  try {
    if (rec.projectId !== projectId) {
      if (__DEV__) console.warn(`${LOG_PREFIX} id mismatch in idbPutFile; overriding rec.projectId`);
      rec = { ...rec, projectId };
    }
    const db = await openDb();
    const tx = db.transaction('files', 'readwrite');
    const store = tx.objectStore('files');
    await reqToPromise(store.put(rec));
  } catch (e: any) {
    throw new Error(`${LOG_PREFIX} idbPutFile failed: ${e?.message || e}`);
  }
}

async function idbGetFile(projectId: string, path: string): Promise<FileRecord | null> {
  try {
    const db = await openDb();
    const tx = db.transaction('files', 'readonly');
    const store = tx.objectStore('files');
    const key = [projectId, path] as any;
    const req = store.get(key);
    const res = await reqToPromise<FileRecord | undefined>(req);
    return res ?? null;
  } catch (e: any) {
    throw new Error(`${LOG_PREFIX} idbGetFile failed: ${e?.message || e}`);
  }
}

async function idbDeleteFile(projectId: string, path: string): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction('files', 'readwrite');
    const store = tx.objectStore('files');
    await reqToPromise(store.delete([projectId, path] as any));
  } catch (e: any) {
    throw new Error(`${LOG_PREFIX} idbDeleteFile failed: ${e?.message || e}`);
  }
}

async function idbListFiles(projectId: string): Promise<FileRecord[]> {
  try {
    const db = await openDb();
    const tx = db.transaction('files', 'readonly');
    const index = tx.objectStore('files').index('byProjectId');
    const results: FileRecord[] = [];
    await new Promise<void>((resolve, reject) => {
      const range = IDBKeyRange.only(projectId);
      const cursorReq = index.openCursor(range);
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result as IDBCursorWithValue | null;
        if (cursor) {
          results.push(cursor.value as FileRecord);
          cursor.continue();
        } else {
          resolve();
        }
      };
      cursorReq.onerror = () => reject(new Error(`${LOG_PREFIX} idbListFiles cursor failed: ${cursorReq.error?.message || cursorReq.error}`));
    });
    return results;
  } catch (e: any) {
    throw new Error(`${LOG_PREFIX} idbListFiles failed: ${e?.message || e}`);
  }
}

async function idbListFilesByPrefix(projectId: string, prefix: string): Promise<FileRecord[]> {
  try {
    const db = await openDb();
    const tx = db.transaction('files', 'readonly');
    const index = tx.objectStore('files').index('byProjectId');
    const results: FileRecord[] = [];
    const range = IDBKeyRange.only(projectId);
    await new Promise<void>((resolve, reject) => {
      const cursorReq = index.openCursor(range);
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result as IDBCursorWithValue | null;
        if (cursor) {
          const val = cursor.value as FileRecord;
          if (val.path.startsWith(prefix)) {
            results.push(val);
          }
          cursor.continue();
        } else {
          resolve();
        }
      };
      cursorReq.onerror = () => reject(new Error(`${LOG_PREFIX} idbListFilesByPrefix cursor failed: ${cursorReq.error?.message || cursorReq.error}`));
    });
    return results;
  } catch (e: any) {
    throw new Error(`${LOG_PREFIX} idbListFilesByPrefix failed: ${e?.message || e}`);
  }
}

async function idbGetChatMeta(projectId: string): Promise<ChatMeta | null> {
  try {
    const db = await openDb();
    const tx = db.transaction('chatMeta', 'readonly');
    const store = tx.objectStore('chatMeta');
    const req = store.get(projectId);
    const res = await reqToPromise<ChatMeta | undefined>(req);
    return res ?? null;
  } catch (e: any) {
    throw new Error(`${LOG_PREFIX} idbGetChatMeta failed: ${e?.message || e}`);
  }
}

async function idbPutChatMeta(projectId: string, meta: ChatMeta): Promise<void> {
  try {
    if (meta.projectId !== projectId) {
      if (__DEV__) console.warn(`${LOG_PREFIX} id mismatch in idbPutChatMeta; overriding meta.projectId`);
      meta = { ...meta, projectId };
    }
    const db = await openDb();
    const tx = db.transaction('chatMeta', 'readwrite');
    const store = tx.objectStore('chatMeta');
    await reqToPromise(store.put(meta));
  } catch (e: any) {
    throw new Error(`${LOG_PREFIX} idbPutChatMeta failed: ${e?.message || e}`);
  }
}

async function idbGetChatSegment(projectId: string, index: number): Promise<ChatMessage[]> {
  try {
    const db = await openDb();
    const tx = db.transaction('chatSegments', 'readonly');
    const store = tx.objectStore('chatSegments');
    const req = store.get([projectId, index] as any);
    const res = await reqToPromise<any>(req);
    if (!res) return [];
    return Array.isArray(res.messages) ? (res.messages as ChatMessage[]) : [];
  } catch (e: any) {
    throw new Error(`${LOG_PREFIX} idbGetChatSegment failed: ${e?.message || e}`);
  }
}

async function idbPutChatSegment(projectId: string, index: number, messages: ChatMessage[]): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction('chatSegments', 'readwrite');
    const store = tx.objectStore('chatSegments');
    const value = { projectId, index, messages: messages || [] };
    await reqToPromise(store.put(value));
  } catch (e: any) {
    throw new Error(`${LOG_PREFIX} idbPutChatSegment failed: ${e?.message || e}`);
  }
}

async function idbKvGet(key: string): Promise<any> {
  try {
    const db = await openDb();
    const tx = db.transaction('kv', 'readonly');
    const store = tx.objectStore('kv');
    const req = store.get(key);
    const res = await reqToPromise<any>(req);
    return res ? res.value : undefined;
  } catch (e: any) {
    throw new Error(`${LOG_PREFIX} idbKvGet failed: ${e?.message || e}`);
  }
}

async function idbKvSet(key: string, value: any): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction('kv', 'readwrite');
    const store = tx.objectStore('kv');
    await reqToPromise(store.put({ key, value }));
  } catch (e: any) {
    throw new Error(`${LOG_PREFIX} idbKvSet failed: ${e?.message || e}`);
  }
}

// ========= Exported API =========

export const storageV2 = {
  // utils
  isChromeStorageAvailable,
  normalizePath,
  openDb,
  // chrome index helpers
  getSchemaVersion,
  setSchemaVersion,
  getActiveProjectId,
  setActiveProjectId,
  getProjectsIndex,
  setProjectsIndex,
  // idb adapters
  idbGetProject,
  idbPutProject,
  idbDeleteProject,
  idbPutFile,
  idbGetFile,
  idbDeleteFile,
  idbListFiles,
  idbListFilesByPrefix,
  idbGetChatMeta,
  idbPutChatMeta,
  idbGetChatSegment,
  idbPutChatSegment,
  idbKvGet,
  idbKvSet,
};