# Chat Pet Phase 1 文字聊天 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有 Electron Live2D 桌宠中加入 Phase 1 文字聊天 MVP：控制台输入消息，主进程通过 OpenAI-compatible 中转站流式调用 `deepseek v4flash`，并把回复显示在控制台。

**Architecture:** 所有网络和配置逻辑放在 Electron 主进程，渲染进程只通过 preload/IPC 收发消息。`ConfigService` 管理 `userData/config.json`，API Key 用 Electron `safeStorage` 加密。`ConversationManager` 负责会话历史，`OpenAICompatibleProvider` 负责 LLM 请求，`ChatManager` 编排一次聊天并广播 `start/delta/complete/error` 事件。

**Tech Stack:** Electron 37、electron-vite 3、TypeScript 5、Vitest 3、Node 内置 `fetch`。

## Global Constraints

- 目标平台：Windows 11；项目路径 `D:\AGENT\live`。
- 不新增 npm 依赖；LLM 使用 Node 内置 `fetch`。
- Phase 1 不创建 `src/main/voice/`，不启动 GPT-SoVITS，不出现 `VoiceManager`。
- API Key 不硬编码、不提交 Git；落盘前必须用 Electron `safeStorage` 加密，字段名为 `apiKeyEncrypted`。
- 所有 LLM 请求在主进程异步执行，不允许阻塞 UI。
- 控制台界面文字使用中文；输出窗口 Live2D 逻辑保持不变。
- 每个任务结束时 `npm test` 相关用例通过；所有任务结束时 `npm test` 和 `npm run build` 通过。

## File Structure

新增：

- `src/shared/chat.ts`：聊天消息、LLM 配置、配置视图共享类型。
- `src/main/chat/conversationManager.ts`：会话历史和 System Prompt。
- `src/main/chat/llmProvider.ts`：LLMProvider 接口和 OpenAICompatibleProvider。
- `src/main/chat/chatManager.ts`：聊天编排和事件。
- `src/main/config.ts`：ConfigService 和 SecretStore 接口。
- `src/main/electronSecretStore.ts`：Electron safeStorage 实现。
- `tests/chat/conversationManager.test.ts`
- `tests/chat/llmProvider.test.ts`
- `tests/chat/configService.test.ts`
- `tests/chat/chatManager.test.ts`

修改：

- `src/main/index.ts`：初始化 ChatManager、注册聊天/配置 IPC。
- `src/preload/api.ts`：暴露聊天和配置 API。
- `src/renderer/src/global.d.ts`：更新 Window.api 类型。
- `src/renderer/control.html`：新增聊天区和 LLM 设置。
- `src/renderer/src/control.ts`：聊天和设置逻辑。

---

### Task 1: 共享类型与 ConversationManager

**Files:**
- Create: `src/shared/chat.ts`
- Create: `src/main/chat/conversationManager.ts`
- Test: `tests/chat/conversationManager.test.ts`

**Interfaces:**
- Consumes: 无。
- Produces:
  - `type ChatRole = 'system' | 'user' | 'assistant'`
  - `interface ChatMessage { role: ChatRole; content: string }`
  - `interface LLMConfig`、`interface VoiceConfigReserved`、`interface AppConfig`
  - `interface LLMSettingsView`、`interface LLMSettingsSave`
  - `class ConversationManager`
    - `constructor(maxHistory: number, systemPrompt: string)`
    - `append(message: ChatMessage): void`
    - `payload(): ChatMessage[]`
    - `compact(): void`
    - `clear(): void`
    - `get size(): number`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from 'vitest'
import { ConversationManager } from '../../src/main/chat/conversationManager'

describe('ConversationManager', () => {
  it('appends messages and prefixes system prompt in payload', () => {
    const manager = new ConversationManager(10, '你是若叶睦')
    manager.append({ role: 'user', content: '你好' })

    expect(manager.payload()).toEqual([
      { role: 'system', content: '你是若叶睦' },
      { role: 'user', content: '你好' }
    ])
  })

  it('caps payload to the most recent maxHistory messages', () => {
    const manager = new ConversationManager(2, 'sys')
    manager.append({ role: 'user', content: 'm1' })
    manager.append({ role: 'user', content: 'm2' })
    manager.append({ role: 'user', content: 'm3' })

    expect(manager.payload()).toEqual([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'm2' },
      { role: 'user', content: 'm3' }
    ])
  })

  it('clear removes all non-system messages', () => {
    const manager = new ConversationManager(2, 'sys')
    manager.append({ role: 'user', content: 'hi' })
    manager.clear()

    expect(manager.size).toBe(0)
    expect(manager.payload()).toEqual([{ role: 'system', content: 'sys' }])
  })

  it('compact trims overflow from the front', () => {
    const manager = new ConversationManager(2, 'sys')
    manager.append({ role: 'user', content: 'm1' })
    manager.append({ role: 'assistant', content: 'a1' })
    manager.append({ role: 'user', content: 'm2' })
    manager.compact()

    expect(manager.size).toBe(2)
    expect(manager.payload().map((message) => message.content)).toEqual(['sys', 'a1', 'm2'])
  })
})
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npm test -- tests/chat/conversationManager.test.ts`
Expected: FAIL，因为 `conversationManager.ts` 不存在。

- [ ] **Step 3: Create shared types**

Create `src/shared/chat.ts`:

```ts
export type ChatRole = 'system' | 'user' | 'assistant'

export interface ChatMessage {
  role: ChatRole
  content: string
}

export interface LLMConfig {
  baseUrl: string
  apiKeyEncrypted: string
  model: string
  systemPrompt: string
  temperature: number
  timeoutMs: number
  maxHistory: number
}

export interface VoiceConfigReserved {
  ttsEndpoint: string
  gptSovitsDir: string
  defaultVoice: string
}

export interface AppConfig {
  llm: LLMConfig
  voice: VoiceConfigReserved
}

export interface LLMSettingsView {
  baseUrl: string
  model: string
  systemPrompt: string
  temperature: number
  timeoutMs: number
  maxHistory: number
  hasApiKey: boolean
}

export interface LLMSettingsSave {
  baseUrl: string
  apiKey: string
  model: string
  systemPrompt: string
  temperature: number
  timeoutMs: number
  maxHistory: number
}
```

- [ ] **Step 4: Implement ConversationManager**

Create `src/main/chat/conversationManager.ts`:

```ts
import type { ChatMessage } from '../../shared/chat'

export class ConversationManager {
  private messages: ChatMessage[] = []

  constructor(
    private readonly maxHistory: number,
    private readonly systemPrompt: string
  ) {}

  append(message: ChatMessage): void {
    this.messages.push(message)
  }

  payload(): ChatMessage[] {
    const recent = this.messages.slice(-this.maxHistory)
    return [{ role: 'system', content: this.systemPrompt }, ...recent]
  }

  compact(): void {
    const overflow = this.messages.length - this.maxHistory
    if (overflow > 0) this.messages.splice(0, overflow)
  }

  clear(): void {
    this.messages = []
  }

  get size(): number {
    return this.messages.length
  }
}
```

- [ ] **Step 5: Run tests and verify they pass**

Run: `npm test -- tests/chat/conversationManager.test.ts`
Expected: 4 tests PASS。

- [ ] **Step 6: Commit**

Run:

```bash
git add src/shared/chat.ts src/main/chat/conversationManager.ts tests/chat/conversationManager.test.ts
git commit -m "feat: add chat conversation manager"
```

---

### Task 2: OpenAICompatibleProvider

**Files:**
- Create: `src/main/chat/llmProvider.ts`
- Test: `tests/chat/llmProvider.test.ts`

**Interfaces:**
- Consumes: `ChatMessage` from `src/shared/chat.ts`。
- Produces:
  - `interface LLMProviderOptions { baseUrl: string; apiKey: string; model: string; temperature: number; timeoutMs: number }`
  - `interface LLMProvider { chat(messages: ChatMessage[]): AsyncIterable<string> }`
  - `class OpenAICompatibleProvider implements LLMProvider`

- [ ] **Step 1: Write failing tests**

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OpenAICompatibleProvider } from '../../src/main/chat/llmProvider'
import type { ChatMessage } from '../../src/shared/chat'

function streamResponse(chunks: string[]): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    }
  })
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } })
}

function jsonResponse(content: string): Response {
  return new Response(
    JSON.stringify({ choices: [{ message: { content } }] }),
    { headers: { 'Content-Type': 'application/json' } }
  )
}

const messages: ChatMessage[] = [{ role: 'user', content: '你好' }]

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('OpenAICompatibleProvider', () => {
  it('sends an OpenAI-compatible chat completions request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse('你好'))
    vi.stubGlobal('fetch', fetchMock)
    const provider = new OpenAICompatibleProvider({
      baseUrl: 'https://relay.example.com/v1/',
      apiKey: 'secret',
      model: 'deepseek v4flash',
      temperature: 0.8,
      timeoutMs: 5000
    })

    const chunks: string[] = []
    for await (const chunk of provider.chat(messages)) chunks.push(chunk)

    expect(chunks).toEqual(['你好'])
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://relay.example.com/v1/chat/completions')
    expect(init.headers).toMatchObject({
      'Content-Type': 'application/json',
      Authorization: 'Bearer secret'
    })
    const body = JSON.parse(String(init.body))
    expect(body).toMatchObject({
      model: 'deepseek v4flash',
      messages,
      stream: true,
      temperature: 0.8
    })
  })

  it('parses SSE chunks into deltas', async () => {
    const sse = [
      'data: {"choices":[{"delta":{"content":"你"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"好"}}]}\n\n',
      'data: [DONE]\n\n'
    ]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(streamResponse(sse)))
    const provider = new OpenAICompatibleProvider({
      baseUrl: 'https://relay.example.com',
      apiKey: 'secret',
      model: 'deepseek v4flash',
      temperature: 0.8,
      timeoutMs: 5000
    })

    const chunks: string[] = []
    for await (const chunk of provider.chat(messages)) chunks.push(chunk)

    expect(chunks).toEqual(['你', '好'])
  })

  it('throws on HTTP errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('unauthorized', { status: 401 })))
    const provider = new OpenAICompatibleProvider({
      baseUrl: 'https://relay.example.com',
      apiKey: 'bad',
      model: 'deepseek v4flash',
      temperature: 0.8,
      timeoutMs: 5000
    })

    await expect(async () => {
      for await (const _chunk of provider.chat(messages)) {
        // consume stream
      }
    }).rejects.toThrow('LLM HTTP 401')
  })

  it('times out when the server never responds', async () => {
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => {
        const error = new Error('aborted')
        error.name = 'AbortError'
        reject(error)
      })
    })))
    const provider = new OpenAICompatibleProvider({
      baseUrl: 'https://relay.example.com',
      apiKey: 'secret',
      model: 'deepseek v4flash',
      temperature: 0.8,
      timeoutMs: 10
    })

    await expect(async () => {
      for await (const _chunk of provider.chat(messages)) {
        // consume stream
      }
    }).rejects.toThrow(/timed out/)
  })
})
```

- [ ] **Step 2: Run tests and verify they fail**

Run: `npm test -- tests/chat/llmProvider.test.ts`
Expected: FAIL，因为 `llmProvider.ts` 不存在。

- [ ] **Step 3: Implement OpenAICompatibleProvider**

Create `src/main/chat/llmProvider.ts`:

```ts
import type { ChatMessage } from '../../shared/chat'

export interface LLMProviderOptions {
  baseUrl: string
  apiKey: string
  model: string
  temperature: number
  timeoutMs: number
}

export interface LLMProvider {
  chat(messages: ChatMessage[]): AsyncIterable<string>
}

export class OpenAICompatibleProvider implements LLMProvider {
  constructor(private readonly options: LLMProviderOptions) {}

  async *chat(messages: ChatMessage[]): AsyncIterable<string> {
    const url = `${this.options.baseUrl.replace(/\/+$/, '')}/chat/completions`
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs)

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.options.apiKey}`
        },
        body: JSON.stringify({
          model: this.options.model,
          messages,
          stream: true,
          temperature: this.options.temperature
        }),
        signal: controller.signal
      })

      if (!response.ok) {
        const body = await response.text()
        throw new Error(`LLM HTTP ${response.status}: ${body.slice(0, 200)}`)
      }

      const contentType = response.headers.get('content-type') ?? ''
      if (!contentType.includes('text/event-stream')) {
        const json = await response.json() as { choices?: Array<{ message?: { content?: string } }> }
        const content = json.choices?.[0]?.message?.content
        if (content) yield content
        return
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error('LLM response has no body')

      const decoder = new TextDecoder()
      let buffer = ''
      let finished = false

      while (!finished) {
        const result = await reader.read()
        if (result.done) break
        buffer += decoder.decode(result.value, { stream: true })

        let newlineIndex = buffer.indexOf('\n')
        while (newlineIndex >= 0) {
          const line = buffer.slice(0, newlineIndex).trim()
          buffer = buffer.slice(newlineIndex + 1)

          if (line.startsWith('data:')) {
            const data = line.slice(5).trim()
            if (data === '[DONE]') {
              finished = true
              break
            }
            try {
              const parsed = JSON.parse(data) as {
                choices?: Array<{
                  delta?: { content?: string }
                  message?: { content?: string }
                }>
              }
              const content = parsed.choices?.[0]?.delta?.content
                ?? parsed.choices?.[0]?.message?.content
              if (typeof content === 'string' && content.length > 0) yield content
            } catch {
              // 忽略 keep-alive 或格式不完整的数据行
            }
          }

          newlineIndex = buffer.indexOf('\n')
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`LLM request timed out after ${this.options.timeoutMs}ms`)
      }
      throw error
    } finally {
      clearTimeout(timer)
    }
  }
}
```

- [ ] **Step 4: Run tests and verify they pass**

Run: `npm test -- tests/chat/llmProvider.test.ts`
Expected: 4 tests PASS。

- [ ] **Step 5: Commit**

Run:

```bash
git add src/main/chat/llmProvider.ts tests/chat/llmProvider.test.ts
git commit -m "feat: add openai compatible LLM provider"
```

---

### Task 3: ConfigService 与 safeStorage

**Files:**
- Create: `src/main/config.ts`
- Create: `src/main/electronSecretStore.ts`
- Test: `tests/chat/configService.test.ts`

**Interfaces:**
- Consumes: `AppConfig`、`LLMSettingsView`、`LLMSettingsSave` from `src/shared/chat.ts`。
- Produces:
  - `interface SecretStore { isAvailable(): boolean; encrypt(plain: string): string; decrypt(encrypted: string): string }`
  - `const DEFAULT_CONFIG: AppConfig`
  - `class ConfigService`
    - `load(): Promise<AppConfig>`
    - `save(config: AppConfig): Promise<void>`
    - `setApiKey(config: AppConfig, plainKey: string): AppConfig`
    - `getApiKey(config: AppConfig): string`
    - `toView(config: AppConfig): LLMSettingsView`
    - `applySave(config: AppConfig, save: LLMSettingsSave): AppConfig`
  - `class ElectronSecretStore implements SecretStore`

- [ ] **Step 1: Write failing tests**

```ts
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
```

- [ ] **Step 2: Run tests and verify they fail**

Run: `npm test -- tests/chat/configService.test.ts`
Expected: FAIL，因为 `src/main/config.ts` 不存在。

- [ ] **Step 3: Implement ConfigService**

Create `src/main/config.ts`:

```ts
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { AppConfig, LLMSettingsSave, LLMSettingsView } from '../shared/chat'

export interface SecretStore {
  isAvailable(): boolean
  encrypt(plain: string): string
  decrypt(encrypted: string): string
}

export const DEFAULT_CONFIG: AppConfig = {
  llm: {
    baseUrl: '',
    apiKeyEncrypted: '',
    model: 'deepseek v4flash',
    systemPrompt: '你是若叶睦，说话温柔克制，用中文简短回复。',
    temperature: 0.8,
    timeoutMs: 30000,
    maxHistory: 20
  },
  voice: {
    ttsEndpoint: 'http://127.0.0.1:9880',
    gptSovitsDir: 'D:\\GPT-SOVITS\\GPT-SoVITS-v2pro-20250604-nvidia50\\GPT-SoVITS-v2pro-20250604-nvidia50',
    defaultVoice: '若叶睦'
  }
}

function cloneDefaults(): AppConfig {
  return JSON.parse(JSON.stringify(DEFAULT_CONFIG)) as AppConfig
}

function mergeDefaults(value: Partial<AppConfig> | undefined): AppConfig {
  return {
    llm: { ...cloneDefaults().llm, ...value?.llm },
    voice: { ...cloneDefaults().voice, ...value?.voice }
  }
}

export class ConfigService {
  constructor(
    private readonly filePath: string,
    private readonly secretStore: SecretStore
  ) {}

  async load(): Promise<AppConfig> {
    try {
      const raw = await readFile(this.filePath, 'utf8')
      return mergeDefaults(JSON.parse(raw) as Partial<AppConfig>)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return cloneDefaults()
      throw error
    }
  }

  async save(config: AppConfig): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true })
    await writeFile(this.filePath, JSON.stringify(config, null, 2), 'utf8')
  }

  setApiKey(config: AppConfig, plainKey: string): AppConfig {
    const trimmed = plainKey.trim()
    if (!trimmed) return config
    if (!this.secretStore.isAvailable()) {
      throw new Error('系统安全存储不可用，无法保存 API Key')
    }
    return {
      ...config,
      llm: {
        ...config.llm,
        apiKeyEncrypted: this.secretStore.encrypt(trimmed)
      }
    }
  }

  getApiKey(config: AppConfig): string {
    return config.llm.apiKeyEncrypted
      ? this.secretStore.decrypt(config.llm.apiKeyEncrypted)
      : ''
  }

  toView(config: AppConfig): LLMSettingsView {
    return {
      baseUrl: config.llm.baseUrl,
      model: config.llm.model,
      systemPrompt: config.llm.systemPrompt,
      temperature: config.llm.temperature,
      timeoutMs: config.llm.timeoutMs,
      maxHistory: config.llm.maxHistory,
      hasApiKey: config.llm.apiKeyEncrypted.length > 0
    }
  }

  applySave(config: AppConfig, save: LLMSettingsSave): AppConfig {
    const withKey = this.setApiKey(config, save.apiKey)
    return {
      ...withKey,
      llm: {
        ...withKey.llm,
        baseUrl: save.baseUrl.trim(),
        model: save.model.trim() || cloneDefaults().llm.model,
        systemPrompt: save.systemPrompt.trim() || cloneDefaults().llm.systemPrompt,
        temperature: save.temperature,
        timeoutMs: save.timeoutMs,
        maxHistory: save.maxHistory
      }
    }
  }
}
```

- [ ] **Step 4: Implement ElectronSecretStore**

Create `src/main/electronSecretStore.ts`:

```ts
import { safeStorage } from 'electron'
import type { SecretStore } from './config'

export class ElectronSecretStore implements SecretStore {
  isAvailable(): boolean {
    return safeStorage.isEncryptionAvailable()
  }

  encrypt(plain: string): string {
    return safeStorage.encryptString(plain).toString('base64')
  }

  decrypt(encrypted: string): string {
    return safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
  }
}
```

- [ ] **Step 5: Run tests and verify they pass**

Run: `npm test -- tests/chat/configService.test.ts`
Expected: 4 tests PASS。

- [ ] **Step 6: Commit**

Run:

```bash
git add src/main/config.ts src/main/electronSecretStore.ts tests/chat/configService.test.ts
git commit -m "feat: add encrypted config service"
```

---

### Task 4: ChatManager

**Files:**
- Create: `src/main/chat/chatManager.ts`
- Test: `tests/chat/chatManager.test.ts`

**Interfaces:**
- Consumes:
  - `ConversationManager`
  - `LLMProvider`
- Produces:
  - `type ChatEvent = { type: 'start' } | { type: 'delta'; delta: string } | { type: 'complete'; message: string } | { type: 'error'; message: string }`
  - `class ChatManager`
    - `constructor(conversation: ConversationManager, provider: LLMProvider, emit: (event: ChatEvent) => void)`
    - `sendUserMessage(text: string): Promise<void>`
    - `clear(): void`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from 'vitest'
import { ChatManager } from '../../src/main/chat/chatManager'
import { ConversationManager } from '../../src/main/chat/conversationManager'
import type { LLMProvider } from '../../src/main/chat/llmProvider'
import type { ChatMessage } from '../../src/shared/chat'

function fakeProvider(handler: () => AsyncIterable<string>): LLMProvider {
  return {
    chat(_messages: ChatMessage[]): AsyncIterable<string> {
      return handler()
    }
  }
}

describe('ChatManager', () => {
  it('appends user and assistant messages on success', async () => {
    const conversation = new ConversationManager(10, 'sys')
    const events: Array<{ type: string; delta?: string; message?: string }> = []
    const provider = fakeProvider(async function* () {
      yield '你'
      yield '好'
    })
    const chat = new ChatManager(conversation, provider, (event) => events.push(event))

    await chat.sendUserMessage(' 在吗 ')

    expect(events.map((event) => event.type)).toEqual(['start', 'delta', 'delta', 'complete'])
    expect(conversation.payload().map((message) => message.content)).toEqual([
      'sys',
      '在吗',
      '你好'
    ])
  })

  it('does not write an assistant message when the provider fails', async () => {
    const conversation = new ConversationManager(10, 'sys')
    const events: string[] = []
    const provider = fakeProvider(async function* () {
      throw new Error('relay down')
    })
    const chat = new ChatManager(conversation, provider, (event) => events.push(event.type))

    await chat.sendUserMessage('hi')

    expect(events).toEqual(['start', 'error'])
    expect(conversation.payload().map((message) => message.content)).toEqual(['sys', 'hi'])
  })

  it('ignores blank messages', async () => {
    const conversation = new ConversationManager(10, 'sys')
    const events: string[] = []
    const provider = fakeProvider(async function* () {
      yield 'x'
    })
    const chat = new ChatManager(conversation, provider, (event) => events.push(event.type))

    await chat.sendUserMessage('   ')

    expect(events).toEqual([])
    expect(conversation.size).toBe(0)
  })

  it('ignores a second message while the first is still streaming', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const conversation = new ConversationManager(10, 'sys')
    const events: string[] = []
    const provider = fakeProvider(async function* () {
      await gate
      yield 'ok'
    })
    const chat = new ChatManager(conversation, provider, (event) => events.push(event.type))

    const first = chat.sendUserMessage('first')
    const second = chat.sendUserMessage('second')
    release()
    await first
    await second

    expect(events).toEqual(['start', 'error', 'delta', 'complete'])
    expect(conversation.payload().map((message) => message.content)).toEqual([
      'sys',
      'first',
      'ok'
    ])
  })
})
```

- [ ] **Step 2: Run tests and verify they fail**

Run: `npm test -- tests/chat/chatManager.test.ts`
Expected: FAIL，因为 `chatManager.ts` 不存在。

- [ ] **Step 3: Implement ChatManager**

Create `src/main/chat/chatManager.ts`:

```ts
import type { ConversationManager } from './conversationManager'
import type { LLMProvider } from './llmProvider'

export type ChatEvent =
  | { type: 'start' }
  | { type: 'delta'; delta: string }
  | { type: 'complete'; message: string }
  | { type: 'error'; message: string }

export class ChatManager {
  private busy = false

  constructor(
    private readonly conversation: ConversationManager,
    private readonly provider: LLMProvider,
    private readonly emit: (event: ChatEvent) => void
  ) {}

  async sendUserMessage(text: string): Promise<void> {
    const content = text.trim()
    if (!content) return

    if (this.busy) {
      this.emit({ type: 'error', message: '上一条消息还在回复中，请稍候' })
      return
    }

    this.busy = true
    let full = ''
    try {
      this.conversation.append({ role: 'user', content })
      this.emit({ type: 'start' })
      for await (const delta of this.provider.chat(this.conversation.payload())) {
        full += delta
        this.emit({ type: 'delta', delta })
      }
      if (!full.trim()) throw new Error('LLM 返回了空回复')

      this.conversation.append({ role: 'assistant', content: full })
      this.conversation.compact()
      this.emit({ type: 'complete', message: full })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.emit({ type: 'error', message })
    } finally {
      this.busy = false
    }
  }

  clear(): void {
    this.conversation.clear()
  }
}
```

- [ ] **Step 4: Run tests and verify they pass**

Run: `npm test -- tests/chat/chatManager.test.ts`
Expected: 4 tests PASS。

- [ ] **Step 5: Commit**

Run:

```bash
git add src/main/chat/chatManager.ts tests/chat/chatManager.test.ts
git commit -m "feat: add chat manager with streaming events"
```

---

### Task 5: 主进程 IPC 与 preload

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/preload/api.ts`
- Modify: `src/renderer/src/global.d.ts`

**Interfaces:**
- Consumes: `ChatManager`、`ChatEvent`、`ConfigService`、`ElectronSecretStore`、`AppConfig`、`LLMSettingsSave`、`LLMSettingsView`。
- Produces:
  - IPC renderer → main：`chat:send`、`chat:clear`、`config:save`
  - IPC renderer → main invoke：`config:get`
  - IPC main → renderer：`chat:start`、`chat:delta`、`chat:complete`、`chat:error`、`chat:clear`

- [ ] **Step 1: Add imports and state to main process**

In `src/main/index.ts`, add imports after the existing Electron import:

```ts
import { join } from 'node:path'
import { ChatManager } from './chat/chatManager'
import type { ChatEvent } from './chat/chatManager'
import { ConversationManager } from './chat/conversationManager'
import { OpenAICompatibleProvider } from './chat/llmProvider'
import { ConfigService } from './config'
import { ElectronSecretStore } from './electronSecretStore'
import type { AppConfig, LLMSettingsSave } from '../shared/chat'
```

Note: `src/main/index.ts` already imports `join` from `node:path`; keep only one import statement.

Add state after `let isMenuOpen = false`:

```ts
let chatManager: ChatManager | null = null
let configService: ConfigService | null = null
let appConfig: AppConfig | null = null
```

- [ ] **Step 2: Add chat helpers before `app.whenReady`**

```ts
function broadcastChatEvent(event: ChatEvent): void {
  if (!controlWindow) return
  if (event.type === 'start') controlWindow.webContents.send('chat:start')
  if (event.type === 'delta') controlWindow.webContents.send('chat:delta', event.delta)
  if (event.type === 'complete') controlWindow.webContents.send('chat:complete', event.message)
  if (event.type === 'error') controlWindow.webContents.send('chat:error', event.message)
}

function rebuildChatManager(): void {
  if (!configService || !appConfig) return
  const conversation = new ConversationManager(
    appConfig.llm.maxHistory,
    appConfig.llm.systemPrompt
  )
  const provider = new OpenAICompatibleProvider({
    baseUrl: appConfig.llm.baseUrl,
    apiKey: configService.getApiKey(appConfig),
    model: appConfig.llm.model,
    temperature: appConfig.llm.temperature,
    timeoutMs: appConfig.llm.timeoutMs
  })
  chatManager = new ChatManager(conversation, provider, broadcastChatEvent)
}
```

- [ ] **Step 3: Initialize ConfigService inside app.whenReady**

Change the beginning of `app.whenReady().then(...)` so it is async and loads config before registering IPC:

```ts
app.whenReady().then(async () => {
  configService = new ConfigService(
    join(app.getPath('userData'), 'config.json'),
    new ElectronSecretStore()
  )
  appConfig = await configService.load()
  rebuildChatManager()

  createOutputWindow()
  createControlWindow()
```

Keep the rest of the existing body, then add these handlers after the existing `ipcMain.on('menu-state', ...)` block:

```ts
  ipcMain.on('chat:send', (_event, text: string) => {
    void chatManager?.sendUserMessage(text)
  })

  ipcMain.on('chat:clear', () => {
    chatManager?.clear()
    controlWindow?.webContents.send('chat:clear')
  })

  ipcMain.handle('config:get', () => {
    if (!configService || !appConfig) return null
    return configService.toView(appConfig)
  })

  ipcMain.handle('config:save', async (_event, save: LLMSettingsSave) => {
    if (!configService || !appConfig) return null
    appConfig = configService.applySave(appConfig, save)
    await configService.save(appConfig)
    rebuildChatManager()
    return configService.toView(appConfig)
  })
```

- [ ] **Step 4: Extend preload API**

Replace the import line in `src/preload/api.ts`:

```ts
import type { OutfitId } from '../shared/types'
import type { LLMSettingsSave, LLMSettingsView } from '../shared/chat'
```

Add these methods to the `api` object before the closing `}`:

```ts
  sendChatMessage: (text: string): void => {
    ipcRenderer.send('chat:send', text)
  },
  clearChat: (): void => {
    ipcRenderer.send('chat:clear')
  },
  onChatStart: (callback: () => void): (() => void) => {
    const listener = (): void => callback()
    ipcRenderer.on('chat:start', listener)
    return () => ipcRenderer.removeListener('chat:start', listener)
  },
  onChatDelta: (callback: (delta: string) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, delta: string): void => callback(delta)
    ipcRenderer.on('chat:delta', listener)
    return () => ipcRenderer.removeListener('chat:delta', listener)
  },
  onChatComplete: (callback: (message: string) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, message: string): void => callback(message)
    ipcRenderer.on('chat:complete', listener)
    return () => ipcRenderer.removeListener('chat:complete', listener)
  },
  onChatError: (callback: (message: string) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, message: string): void => callback(message)
    ipcRenderer.on('chat:error', listener)
    return () => ipcRenderer.removeListener('chat:error', listener)
  },
  onChatClear: (callback: () => void): (() => void) => {
    const listener = (): void => callback()
    ipcRenderer.on('chat:clear', listener)
    return () => ipcRenderer.removeListener('chat:clear', listener)
  },
  getConfig: (): Promise<LLMSettingsView | null> => ipcRenderer.invoke('config:get'),
  saveConfig: (settings: LLMSettingsSave): Promise<LLMSettingsView | null> => (
    ipcRenderer.invoke('config:save', settings)
  )
```

- [ ] **Step 5: Update global type declarations**

In `src/renderer/src/global.d.ts`, add this import:

```ts
import type { LLMSettingsSave, LLMSettingsView } from '../../shared/chat'
```

Add these methods inside the `Window.api` object:

```ts
      sendChatMessage: (text: string) => void
      clearChat: () => void
      onChatStart: (callback: () => void) => () => void
      onChatDelta: (callback: (delta: string) => void) => () => void
      onChatComplete: (callback: (message: string) => void) => () => void
      onChatError: (callback: (message: string) => void) => () => void
      onChatClear: (callback: () => void) => () => void
      getConfig: () => Promise<LLMSettingsView | null>
      saveConfig: (settings: LLMSettingsSave) => Promise<LLMSettingsView | null>
```

- [ ] **Step 6: Verify build**

Run: `npm run build`
Expected: electron-vite build 成功，无类型错误。

- [ ] **Step 7: Commit**

Run:

```bash
git add src/main/index.ts src/preload/api.ts src/renderer/src/global.d.ts
git commit -m "feat: wire chat and config IPC"
```

---

### Task 6: 控制台聊天界面与 LLM 设置

**Files:**
- Modify: `src/renderer/control.html`
- Modify: `src/renderer/src/control.ts`

**Interfaces:**
- Consumes: `window.api.sendChatMessage`、`clearChat`、`onChatStart`、`onChatDelta`、`onChatComplete`、`onChatError`、`onChatClear`、`getConfig`、`saveConfig`。
- Produces: 控制台聊天面板和 LLM 设置。

- [ ] **Step 1: Add chat HTML**

Replace the `<body>` of `src/renderer/control.html` with:

```html
  <body>
    <h1>控制台</h1>
    <p>热键：F1-F4 切换常用模型；更多模型用下方按钮切换</p>

    <h2>聊天</h2>
    <div id="chat-window">
      <div id="chat-messages"></div>
      <div id="chat-input-row">
        <input id="chat-input" type="text" placeholder="和宠物说话..." />
        <button id="chat-send">发送</button>
        <button id="chat-clear">清空</button>
      </div>
    </div>
    <p id="chat-status"></p>

    <details id="llm-settings">
      <summary>LLM 设置</summary>
      <label>
        Base URL
        <input id="llm-base-url" type="url" placeholder="https://relay.example.com/v1" />
      </label>
      <label>
        API Key
        <input id="llm-api-key" type="password" placeholder="留空表示不修改" />
      </label>
      <label>
        模型
        <input id="llm-model" type="text" />
      </label>
      <label>
        System Prompt
        <textarea id="llm-system-prompt" rows="3"></textarea>
      </label>
      <label>
        Temperature
        <input id="llm-temperature" type="number" step="0.1" min="0" max="2" />
      </label>
      <label>
        超时（毫秒）
        <input id="llm-timeout" type="number" min="1000" />
      </label>
      <label>
        历史消息数
        <input id="llm-max-history" type="number" min="1" />
      </label>
      <button id="config-save">保存设置</button>
    </details>
    <p id="config-status"></p>

    <div id="model-buttons"></div>
    <label>指定动作</label>
    <div id="action-groups"></div>
    <p id="status">正在启动...</p>
    <script type="module" src="/src/control.ts"></script>
  </body>
```

Add these CSS rules inside the existing `<style>`:

```css
      #chat-window {
        display: flex;
        flex-direction: column;
        height: 280px;
        border: 1px solid #ccc;
        margin: 8px 0;
      }
      #chat-messages {
        flex: 1;
        overflow-y: auto;
        padding: 8px;
        background: #fafafa;
      }
      .chat-message {
        margin: 6px 0;
        white-space: pre-wrap;
        word-break: break-word;
      }
      .chat-message .chat-author {
        font-weight: 700;
        margin-right: 6px;
      }
      .chat-user {
        text-align: right;
      }
      #chat-input-row {
        display: flex;
        gap: 6px;
        padding: 8px;
        border-top: 1px solid #ddd;
      }
      #chat-input {
        flex: 1;
      }
      details {
        border: 1px solid #ddd;
        margin: 8px 0;
        padding: 8px;
      }
      details label {
        display: block;
        margin: 6px 0;
      }
      details input,
      details textarea {
        width: 100%;
        box-sizing: border-box;
      }
```

- [ ] **Step 2: Add chat state and helpers to src/renderer/src/control.ts**

Keep the existing imports, then add this import:

```ts
import type { LLMSettingsSave, LLMSettingsView } from '../../shared/chat'
```

After the existing DOM selectors at the top of `src/renderer/src/control.ts`, add:

```ts
const chatMessages = document.querySelector<HTMLDivElement>('#chat-messages')
const chatInput = document.querySelector<HTMLInputElement>('#chat-input')
const chatSend = document.querySelector<HTMLButtonElement>('#chat-send')
const chatClearButton = document.querySelector<HTMLButtonElement>('#chat-clear')
const chatStatus = document.querySelector<HTMLParagraphElement>('#chat-status')
const baseUrlInput = document.querySelector<HTMLInputElement>('#llm-base-url')
const apiKeyInput = document.querySelector<HTMLInputElement>('#llm-api-key')
const modelInput = document.querySelector<HTMLInputElement>('#llm-model')
const systemPromptInput = document.querySelector<HTMLTextAreaElement>('#llm-system-prompt')
const temperatureInput = document.querySelector<HTMLInputElement>('#llm-temperature')
const timeoutInput = document.querySelector<HTMLInputElement>('#llm-timeout')
const maxHistoryInput = document.querySelector<HTMLInputElement>('#llm-max-history')
const configSave = document.querySelector<HTMLButtonElement>('#config-save')
const configStatus = document.querySelector<HTMLParagraphElement>('#config-status')
```

Add these functions after the selector block:

```ts
let assistantContent: HTMLDivElement | null = null

function appendChatMessage(role: 'user' | 'assistant' | 'system', text: string): HTMLDivElement {
  const message = document.createElement('div')
  message.className = `chat-message chat-${role}`
  const author = document.createElement('span')
  author.className = 'chat-author'
  author.textContent = role === 'user' ? '你' : role === 'assistant' ? '宠物' : '系统'
  const content = document.createElement('div')
  content.className = 'chat-content'
  content.textContent = text
  message.appendChild(author)
  message.appendChild(content)
  chatMessages?.appendChild(message)
  chatMessages?.scrollTo(0, chatMessages.scrollHeight)
  return message
}

function clearChatMessages(): void {
  if (chatMessages) chatMessages.innerHTML = ''
  assistantContent = null
}

async function sendChatMessage(): Promise<void> {
  if (!chatInput) return
  const text = chatInput.value
  if (!text.trim()) return
  appendChatMessage('user', text.trim())
  chatInput.value = ''
  window.api.sendChatMessage(text)
}

async function loadConfig(): Promise<void> {
  try {
    const view = await window.api.getConfig()
    if (!view) return
    if (baseUrlInput) baseUrlInput.value = view.baseUrl
    if (modelInput) modelInput.value = view.model
    if (systemPromptInput) systemPromptInput.value = view.systemPrompt
    if (temperatureInput) temperatureInput.value = String(view.temperature)
    if (timeoutInput) timeoutInput.value = String(view.timeoutMs)
    if (maxHistoryInput) maxHistoryInput.value = String(view.maxHistory)
    if (apiKeyInput) apiKeyInput.value = ''
    if (configStatus) {
      configStatus.textContent = view.hasApiKey ? 'API Key 已保存' : '尚未保存 API Key'
    }
  } catch (error) {
    if (configStatus) configStatus.textContent = error instanceof Error ? error.message : String(error)
  }
}

async function saveConfig(): Promise<void> {
  const settings: LLMSettingsSave = {
    baseUrl: baseUrlInput?.value ?? '',
    apiKey: apiKeyInput?.value ?? '',
    model: modelInput?.value ?? '',
    systemPrompt: systemPromptInput?.value ?? '',
    temperature: Number(temperatureInput?.value ?? 0.8),
    timeoutMs: Number(timeoutInput?.value ?? 30000),
    maxHistory: Number(maxHistoryInput?.value ?? 20)
  }
  if (!settings.baseUrl.trim() || !settings.model.trim()) {
    if (configStatus) configStatus.textContent = '请填写 Base URL 和模型名'
    return
  }
  try {
    const view = await window.api.saveConfig(settings)
    if (view) {
      if (apiKeyInput) apiKeyInput.value = ''
      if (configStatus) configStatus.textContent = '设置已保存'
    }
  } catch (error) {
    if (configStatus) configStatus.textContent = error instanceof Error ? error.message : String(error)
  }
}
```

- [ ] **Step 3: Add chat event listeners**

Replace the bottom initialization block in `src/renderer/src/control.ts`:

```ts
window.api.onModelSwitch((id) => {
  void renderActions(id)
})

window.api.onChatStart(() => {
  const message = appendChatMessage('assistant', '')
  assistantContent = message.querySelector<HTMLDivElement>('.chat-content')
  if (chatStatus) chatStatus.textContent = '正在回复...'
})

window.api.onChatDelta((delta) => {
  if (assistantContent) assistantContent.textContent += delta
  chatMessages?.scrollTo(0, chatMessages.scrollHeight)
})

window.api.onChatComplete((message) => {
  if (assistantContent) assistantContent.textContent = message
  assistantContent = null
  if (chatStatus) chatStatus.textContent = ''
})

window.api.onChatError((message) => {
  if (assistantContent) {
    assistantContent.textContent += `\n[${message}]`
  } else {
    appendChatMessage('system', message)
  }
  assistantContent = null
  if (chatStatus) chatStatus.textContent = ''
})

window.api.onChatClear(() => {
  clearChatMessages()
})

chatSend?.addEventListener('click', () => {
  void sendChatMessage()
})

chatInput?.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    void sendChatMessage()
  }
})

chatClearButton?.addEventListener('click', () => {
  window.api.clearChat()
  clearChatMessages()
})

configSave?.addEventListener('click', () => {
  void saveConfig()
})

void loadConfig()
void renderActions('casual')
void renderModelButtons()

if (status) {
  window.api.onStatus((message) => {
    status.textContent = message
  })
}
```

Remove the old duplicate lines that previously called `renderActions` and `renderModelButtons`.

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: electron-vite build 成功。

- [ ] **Step 5: Commit**

Run:

```bash
git add src/renderer/control.html src/renderer/src/control.ts
git commit -m "feat: add chat UI and LLM settings to console"
```

---

### Task 7: 全量验证与手动冒烟

**Files:**
- 无新增或修改；只运行验证。

- [ ] **Step 1: Run all unit tests**

Run: `npm test`
Expected: 原有模型配置测试 + 新增聊天测试全部 PASS。

- [ ] **Step 2: Run production build**

Run: `npm run build`
Expected: electron-vite build 成功。

- [ ] **Step 3: Manual smoke test**

Run: `npm run dev`

手动验证：
1. 控制台出现“聊天”区和“LLM 设置”。
2. 填入 Base URL、API Key（若有）、模型 `deepseek v4flash`，点击“保存设置”，提示“设置已保存”。
3. 在聊天输入框发送消息，依次看到用户消息、宠物回复的流式出现。
4. 未配置 Base URL 时发送消息不崩溃，聊天区或状态区给出错误提示。
5. 关闭应用后检查 `app.getPath('userData')/config.json`：文件里只有 `apiKeyEncrypted`，没有明文 API Key。
6. 确认没有 GPT-SoVITS 子进程被启动，`9880` 端口未被本项目占用。

- [ ] **Step 4: Final commit if any smoke-test fixes were made**

Run:

```bash
git status
git add <fixed-files>
git commit -m "fix: chat pet phase 1 smoke test issues"
```

如果没有任何修复，跳过此步骤。

## Self-Review

- 设计文档要求 Phase 1 不启动语音：计划中没有语音文件，Task 5/6 不引入 GPT-SoVITS，符合要求。
- API Key 加密：Task 3 实现 `apiKeyEncrypted`，Task 5 只把加密后的字段写入 userData。
- IPC 状态机：Task 5 使用 `chat:start/delta/complete/error/clear`，与设计文档一致。
- 测试覆盖：ConversationManager、LLMProvider、ConfigService、ChatManager 都有独立测试，ChatManager 覆盖成功写入历史和失败不写入历史。
- 类型一致性：`LLMProvider.chat()` 返回 `AsyncIterable<string>`，`ChatManager` 直接 `for await`，Task 2 和 Task 4 签名一致。
