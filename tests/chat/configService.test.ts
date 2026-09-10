import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ConfigService } from '../../src/main/config'
import type { SecretStore } from '../../src/main/config'
import type { LLMSettingsSave } from '../../src/shared/chat'

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
    expect(config.llm).not.toHaveProperty('systemPrompt')
    expect(config).not.toHaveProperty('characters')
  })

  it('migrates legacy defaultVoice to selectedVoice', async () => {
    await writeFile(join(dir, 'config.json'), JSON.stringify({
      voice: { defaultVoice: '黑祥' }
    }), 'utf8')
    const service = new ConfigService(join(dir, 'config.json'), new FakeSecretStore())
    const config = await service.load()

    expect(config.voice.selectedVoice).toBe('黑祥')
    expect(config.voice.enabled).toBe(false)
    expect(config.currentCharacter).toBe('sakiko-black')
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

  it('applies a character and its default voice together', async () => {
    const service = new ConfigService(join(dir, 'config.json'), new FakeSecretStore())
    const config = await service.load()
    const updated = service.applyCharacter(config, 'mortis')

    expect(updated.currentCharacter).toBe('mortis')
    expect(updated.voice.selectedVoice).toBe('墨提斯')
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
    let config = await service.load()
    config = service.setApiKey(config, 'old-key')

    const save: LLMSettingsSave = {
      baseUrl: 'https://relay.example.com/v1',
      apiKey: '',
      model: 'deepseek-v4-flash',
      temperature: 0.7,
      timeoutMs: 10000,
      maxHistory: 10
    }

    const saved = service.applySave(config, save)
    expect(service.getApiKey(saved)).toBe('old-key')
    expect(saved.llm.baseUrl).toBe('https://relay.example.com/v1')
  })

  it('returns character identity without exposing the system prompt', async () => {
    const service = new ConfigService(join(dir, 'config.json'), new FakeSecretStore())
    let config = await service.load()
    config = service.setApiKey(config, 'hidden-key')

    const view = service.toView(config)
    expect(view.hasApiKey).toBe(true)
    expect(view.characterId).toBe('mutsumi')
    expect(view.characterName).toBe('若叶睦')
    expect(view).not.toHaveProperty('systemPrompt')
    expect(JSON.stringify(view)).not.toContain('hidden-key')
    expect(view).not.toHaveProperty('apiKey')
  })

  it('migrates three legacy characters to five global personalities', async () => {
    await writeFile(join(dir, 'config.json'), JSON.stringify({
      llm: {
        model: 'deepseek v4flash',
        systemPrompt: 'legacy prompt',
        sessionId: 'ses_092cf255-41ec-4605-bd6b-70ae3f482362'
      },
      voice: { selectedVoice: '黑祥' },
      currentCharacter: 'sakiko',
      characters: {
        sakiko: { model: 'custom-model', systemPrompt: 'legacy override' }
      }
    }), 'utf8')
    const service = new ConfigService(join(dir, 'config.json'), new FakeSecretStore())
    const config = await service.load()

    expect(config.currentCharacter).toBe('sakiko-black')
    expect(config.llm.model).toBe('custom-model')
    expect(config.llm.sessionId).toBe('ses_092cf255-41ec-4605-bd6b-70ae3f482362')
    expect(config.llm).not.toHaveProperty('systemPrompt')
    expect(config).not.toHaveProperty('characters')
  })

  it('persists a migrated legacy config without legacy fields', async () => {
    const filePath = join(dir, 'config.json')
    await writeFile(filePath, JSON.stringify({
      llm: {
        model: 'deepseek v4flash',
        systemPrompt: 'legacy prompt',
        sessionId: 'ses_092cf255-41ec-4605-bd6b-70ae3f482362'
      },
      voice: { selectedVoice: '黑祥' },
      currentCharacter: 'sakiko',
      characters: {
        sakiko: { model: 'custom-model', systemPrompt: 'legacy override' }
      }
    }), 'utf8')
    const service = new ConfigService(filePath, new FakeSecretStore())

    await service.load()

    const persisted = JSON.parse(await readFile(filePath, 'utf8'))
    expect(persisted.currentCharacter).toBe('sakiko-black')
    expect(persisted.llm.model).toBe('custom-model')
    expect(persisted.llm.sessionId).toBe('ses_092cf255-41ec-4605-bd6b-70ae3f482362')
    expect(persisted.llm).not.toHaveProperty('systemPrompt')
    expect(persisted).not.toHaveProperty('characters')
  })

  it('does not rewrite a normalized config on load', async () => {
    const filePath = join(dir, 'config.json')
    const normalized = {
      llm: {
        baseUrl: '',
        apiKeyEncrypted: '',
        sessionId: 'ses_092cf255-41ec-4605-bd6b-70ae3f482362',
        model: 'deepseek-v4-flash',
        temperature: 0.8,
        timeoutMs: 30000,
        maxHistory: 20
      },
      voice: {
        enabled: false,
        selectedVoice: '若叶睦',
        ttsEndpoint: 'http://127.0.0.1:9880',
        sttEndpoint: 'http://127.0.0.1:9881',
        whisperModel: 'large-v3-turbo',
        sttPrecision: 'auto',
        sttTimeoutMs: 600000,
        gptSovitsDir: 'D:\\GPT-SOVITS',
        trainingAudioDir: 'D:\\AGENT\\live\\训练音频',
        startupTimeoutMs: 300000,
        voiceConversationEnabled: false
      },
      currentCharacter: 'mutsumi'
    }
    const before = JSON.stringify(normalized)
    await writeFile(filePath, before, 'utf8')
    const service = new ConfigService(filePath, new FakeSecretStore())

    await service.load()

    expect(await readFile(filePath, 'utf8')).toBe(before)
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
    expect(config).not.toHaveProperty('characters')
  })

  it('preserves a configured global model', async () => {
    await writeFile(join(dir, 'config.json'), JSON.stringify({
      llm: { model: 'custom-model' }
    }), 'utf8')
    const service = new ConfigService(join(dir, 'config.json'), new FakeSecretStore())
    const config = await service.load()

    expect(config.llm.model).toBe('custom-model')
  })

  it('preserves a configured OpenCode session id', async () => {
    await writeFile(join(dir, 'config.json'), JSON.stringify({
      llm: { sessionId: 'ses_ffa09605-3186-493d-b5a2-8bf89c95b32d' }
    }), 'utf8')
    const service = new ConfigService(join(dir, 'config.json'), new FakeSecretStore())
    const config = await service.load()

    expect(config.llm.sessionId).toBe('ses_ffa09605-3186-493d-b5a2-8bf89c95b32d')
  })
})
