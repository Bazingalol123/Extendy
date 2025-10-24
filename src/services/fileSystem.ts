export interface FileNode {
  name: string
  path: string
  type: 'file' | 'directory'
  content?: string
  children?: FileNode[]
}

class FileSystemService {
  private files: Map<string, FileNode> = new Map()
  private listeners: Set<() => void> = new Set()

  constructor() {
    this.loadFromStorage()
  }

  // Subscribe to changes
  subscribe(callback: () => void) {
    this.listeners.add(callback)
    return () => this.listeners.delete(callback)
  }

  private notifyListeners() {
    this.listeners.forEach(callback => callback())
  }

  // Create file
  createFile(path: string, content: string): FileNode {
    const file: FileNode = {
      name: path.split('/').pop()!,
      path,
      type: 'file',
      content
    }
    this.files.set(path, file)
    this.saveToStorage()
    this.notifyListeners()
    return file
  }

  // Update file
  updateFile(path: string, content: string): FileNode | null {
    const file = this.files.get(path)
    if (!file) return null
    
    file.content = content
    this.saveToStorage()
    this.notifyListeners()
    return file
  }

  // Get file
  getFile(path: string): FileNode | undefined {
    return this.files.get(path)
  }

  // Get all files
  getAllFiles(): FileNode[] {
    return Array.from(this.files.values())
  }

  // Delete file
  deleteFile(path: string): boolean {
    const deleted = this.files.delete(path)
    if (deleted) {
      this.saveToStorage()
      this.notifyListeners()
    }
    return deleted
  }

  // Get tree structure
  getTree(): FileNode {
    const root: FileNode = {
      name: 'extension',
      path: '/',
      type: 'directory',
      children: []
    }

    for (const file of this.files.values()) {
      const parts = file.path.split('/').filter(Boolean)
      let current = root

      // Build directory structure
      for (let i = 0; i < parts.length - 1; i++) {
        const dirName = parts[i]
        let dir = current.children?.find(c => c.name === dirName && c.type === 'directory')
        
        if (!dir) {
          dir = {
            name: dirName,
            path: parts.slice(0, i + 1).join('/'),
            type: 'directory',
            children: []
          }
          if (!current.children) current.children = []
          current.children.push(dir)
        }
        current = dir
      }

      // Add file to current directory
      if (!current.children) current.children = []
      current.children.push(file)
    }

    return root
  }

  // Clear all files
  clear() {
    this.files.clear()
    this.saveToStorage()
    this.notifyListeners()
  }

  // Persistence
  private async saveToStorage() {
    const data = Array.from(this.files.entries())
    if (typeof chrome !== 'undefined' && chrome.storage) {
      await chrome.storage.local.set({ fileSystem: data })
    }
  }

  private async loadFromStorage() {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      const result = await chrome.storage.local.get('fileSystem')
      if (result.fileSystem) {
        this.files = new Map(result.fileSystem)
      }
    }
  }
}

// Singleton
export const fileSystem = new FileSystemService()