import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
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

    expect(config.llm.model).toBe('deepseek-v4-flash')
    expect(config.llm.sessionId).toMatch(/^ses_[0-9a-f-]{36}$/)
    expect(config.llm.apiKeyEncrypted).toBe('')
    expect(config.voice.selectedVoice).toBe('若叶睦')
    expect(config.voice.enabled).toBe(false)
    expect(config.voice.sttEndpoint).toBe('http://127.0.0.1:9881')
    expect(config.voice.whisperModel).toBe('large-v3-turbo')
    expect(config.voice.sttPrecision).toBe('auto')
    expect(config.voice.sttTimeoutMs).toBe(600000)
    expect(config.voice.voiceConversationEnabled).toBe(false)
    expect(config.currentCharacter).toBe('mutsumi')
    expect(config.characters['anon']).toBeDefined()
  })

  it('migrates legacy defaultVoice to selectedVoice', async () => {
    await writeFile(join(dir, 'config.json'), JSON.stringify({
      voice: { defaultVoice: '黑祥' }
    }), 'utf8')
    const service = new ConfigService(join(dir, 'config.json'), new FakeSecretStore())
    const config = await service.load()

    expect(config.voice.selectedVoice).toBe('黑祥')
    expect(config.voice.enabled).toBe(false)
  })

  it('applies voice config changes without touching LLM settings', async () => {
    const service = new ConfigService(join(dir, 'config.json'), new FakeSecretStore())
    const config = await service.load()
    const updated = service.applyVoiceConfig(config, {
      enabled: true,
      selectedVoice: '白祥'
    })

    expect(updated.voice.enabled).toBe(true)
    expect(updated.voice.selectedVoice).toBe('白祥')
    expect(updated.llm.model).toBe(config.llm.model)
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

  it('applies system prompt/model to the current character override', async () => {
    const service = new ConfigService(join(dir, 'config.json'), new FakeSecretStore())
    let config: AppConfig = await service.load()

    const save: LLMSettingsSave = {
      baseUrl: 'https://relay.example.com/v1',
      apiKey: '',
      model: 'gpt-4o',
      systemPrompt: '你是千早爱音',
      temperature: 0.7,
      timeoutMs: 10000,
      maxHistory: 10
    }
    config = service.applySave(config, save)

    expect(config.characters['mutsumi']).toMatchObject({
      systemPrompt: '你是千早爱音',
      model: 'gpt-4o'
    })
    expect(service.toView(config).model).toBe('gpt-4o')
  })

  it('migrates the legacy model id to the supported id', async () => {
    await writeFile(join(dir, 'config.json'), JSON.stringify({
      llm: {
        model: 'deepseek v4flash',
        sessionId: 'ses_092cf255-41ec-4605-bd6b-70ae3f482362'
      }
    }), 'utf8')
    const service = new ConfigService(join(dir, 'config.json'), new FakeSecretStore())
    const config = await service.load()

    expect(config.llm.model).toBe('deepseek-v4-flash')
    expect(config.llm.sessionId).toBe('ses_092cf255-41ec-4605-bd6b-70ae3f482362')
    expect(config.characters['mutsumi'].model).toBe('deepseek-v4-flash')
  })

  it('preserves a configured OpenCode session id', async () => {
    await writeFile(join(dir, 'config.json'), JSON.stringify({
      llm: { sessionId: 'ses_ffa09605-3186-493d-b5a2-8bf89c95b32d' }
    }), 'utf8')
    const service = new ConfigService(join(dir, 'config.json'), new FakeSecretStore())
    const config = await service.load()

    expect(config.llm.sessionId).toBe('ses_ffa09605-3186-493d-b5a2-8bf89c95b32d')
  })

  it('preserves a pre-existing custom model as the current character override', async () => {
    await writeFile(join(dir, 'config.json'), JSON.stringify({
      llm: { model: 'custom-model', systemPrompt: '自定义提示' }
    }), 'utf8')
    const service = new ConfigService(join(dir, 'config.json'), new FakeSecretStore())
    const config = await service.load()

    expect(config.characters['mutsumi']).toMatchObject({
      model: 'custom-model',
      systemPrompt: '自定义提示'
    })
  })
})
