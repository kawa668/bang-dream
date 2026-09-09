import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { JSONMemoryStore } from '../../../src/main/memory/memoryStore'

describe('JSONMemoryStore', () => {
  let dir: string
  let file: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'memory-'))
    file = join(dir, 'memory.json')
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('loads empty when file missing', async () => {
    const store = new JSONMemoryStore(file)
    await expect(store.load()).resolves.toEqual([])
  })

  it('appends, loads and clears', async () => {
    const store = new JSONMemoryStore(file)
    await store.append({ role: 'user', content: '你好', createdAt: 1 })
    await store.append({ role: 'assistant', content: '嗨', createdAt: 2 })

    const entries = await store.load()
    expect(entries).toHaveLength(2)
    expect(entries[1]).toMatchObject({ role: 'assistant', content: '嗨' })

    await store.clear()
    await expect(store.load()).resolves.toEqual([])
  })

  it('returns empty for corrupted file content', async () => {
    const store = new JSONMemoryStore(file)
    await import('node:fs/promises').then((fs) =>
      fs.mkdir(dir, { recursive: true })
    )
    await import('node:fs/promises').then((fs) =>
      fs.writeFile(file, 'not-json', 'utf8')
    )
    await expect(store.load()).resolves.toEqual([])
  })
})
