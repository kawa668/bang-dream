import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ConfigService } from '../../src/main/config'
import type { SecretStore } from '../../src/main/config'
import type { AppConfig, LLMSettingsSave } from '../../src/shared/chat'

class FakeSecretStore implements SecretStore {
  isAvailable(): boolean {
    return true
  }

  encrypt(plain: string): string {
    return `enc:${Buffer.from(plain).toString('base64')}`
  }

  decrypt(encrypted: string): string {
    return encrypted.startsWith('enc:')
      ? Buffer.from(encrypted.slice(4), 'base64').toString('utf8')
      : encrypted
  }
}

describe('ConfigService', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'chat-config-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('returns defaults when config file is missing', async () => {
    const service = new ConfigService(join(dir, 'config.json'), new FakeSecretStore())
    const config = await service.load()

    expect(config.llm.model).toBe('deepseek v4flash')
    expect(config.llm.apiKeyEncrypted).toBe('')
    expect(config.voice.defaultVoice).toBe('若叶睦')
  })

  it('encrypts API keys and never writes plaintext', async () => {
    const service = new ConfigService(join(dir, 'config.json'), new FakeSecretStore())
    const config = await service.load()
    const withKey = service.setApiKey(config, 'my-secret')

    expect(withKey.llm.apiKeyEncrypted).toBe('enc:bXktc2VjcmV0')
    expect(service.getApiKey(withKey)).toBe('my-secret')

    await service.save(withKey)
    const raw = await readFile(join(dir, 'config.json'), 'utf8')
    expect(raw).not.toContain('my-secret')
    expect(raw).toContain('apiKeyEncrypted')
  })

  it('keeps the existing encrypted key when save sends a blank key', async () => {
    const service = new ConfigService(join(dir, 'config.json'), new FakeSecretStore())
    let config: AppConfig = await service.load()
    config = service.setApiKey(config, 'old-key')

    const save: LLMSettingsSave = {
      baseUrl: 'https://relay.example.com/v1',
      apiKey: '',
      model: 'deepseek v4flash',
      systemPrompt: '你是若叶睦',
      temperature: 0.7,
      timeoutMs: 10000,
      maxHistory: 10
    }

    const saved = service.applySave(config, save)
    expect(service.getApiKey(saved)).toBe('old-key')
    expect(saved.llm.baseUrl).toBe('https://relay.example.com/v1')
  })

  it('returns a view without the plaintext key', async () => {
    const service = new ConfigService(join(dir, 'config.json'), new FakeSecretStore())
    let config: AppConfig = await service.load()
    config = service.setApiKey(config, 'hidden-key')

    const view = service.toView(config)
    expect(view.hasApiKey).toBe(true)
    expect(JSON.stringify(view)).not.toContain('hidden-key')
    expect(view).not.toHaveProperty('apiKey')
  })
})
