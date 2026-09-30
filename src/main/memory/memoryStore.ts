import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { ChatHistoryEntry } from '../../shared/chat'

export type MemoryEntry = ChatHistoryEntry

export interface MemoryStore {
  append(entry: MemoryEntry): Promise<void>
  load(): Promise<MemoryEntry[]>
  clear(): Promise<void>
}

export class JSONMemoryStore implements MemoryStore {
  constructor(private readonly filePath: string) {}

  async load(): Promise<MemoryEntry[]> {
    try {
      const raw = await readFile(this.filePath, 'utf8')
      const parsed = JSON.parse(raw) as MemoryEntry[]
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  async append(entry: MemoryEntry): Promise<void> {
    const entries = await this.load()
    entries.push(entry)
    await this.persist(entries)
  }

  async clear(): Promise<void> {
    await this.persist([])
  }

  private async persist(entries: MemoryEntry[]): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true })
    await writeFile(this.filePath, JSON.stringify(entries, null, 2), 'utf8')
  }
}
