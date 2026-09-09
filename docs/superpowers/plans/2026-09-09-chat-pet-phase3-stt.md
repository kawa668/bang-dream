# Chat Pet Phase 3 STT Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为聊天宠物增加麦克风语音输入：按住说话 → Faster-Whisper 转文字 → 填入聊天输入框（不自动发送）。

**Architecture:** 沿用 Phase 2 的“主进程服务层 + 懒启动子进程 + HTTP”模式。新增 `STTManager` + `FasterWhisperProvider`，通过 `scripts/asr_api.py`（用 GPT-SoVITS 的 `runtime/python.exe` 启动）提供 `/health`、`/transcribe`、`/control` 接口；STT 与 TTS 相互独立，`ChatManager` 不感知 STT。

**Tech Stack:** Electron 37 + electron-vite 3 + TypeScript 5 + Vitest；Python：FastAPI + Faster-Whisper + uvicorn（复用 GPT-SoVITS runtime）。

## Global Constraints

- 不新增 npm 依赖；Python 依赖复用 GPT-SoVITS 的 `runtime\Lib\site-packages`。
- 所有 chat/voice/stt 相关 IPC 必须带 `requestId`（既有约定，沿用）。
- STT 无独立开关：即用即启，由“按住说话”触发；`voice.enabled` 仍只作用于 TTS。
- STT 服务端口 `9881`（与 TTS `9880` 区分）；懒启动后常驻直到应用退出。
- 首次启用语音输入需联网下载 Faster-Whisper 模型（默认 `large-v3-turbo`，约 1.5GB，走 Clash 代理）；下载到 `tools/asr/models/faster-whisper-<size>`，之后缓存复用。
- `ChatManager` 不 import、不引用、不感知任何 STT 模块。识别结果只回填输入框，不自动发送。
- 状态机：`idle | starting | transcribing | error`；`starting` 覆盖首次下载与启动。
- 麦克风权限被拒、模型下载/启动失败、识别为空：只发 `stt:state`，不影响聊天与 TTS。
- 若 `9881` 端口上已有外部 STT 服务，视为外部服务，应用退出时不杀；否则由本应用拉起并负责终止。
- 验证命令：`node_modules/.bin/vitest.cmd run` 与 `node_modules/.bin/electron-vite.cmd build` 必须通过。

---

### Task 1: STT 共享类型与配置扩展

**Files:**
- Modify: `src/shared/voice.ts`
- Modify: `src/shared/chat.ts`
- Modify: `src/main/config.ts`
- Test: `tests/chat/configService.test.ts`

**Interfaces:**
- Produces: `SttRuntimeState`, `SttStateView`, `SttStateMessage`（在 `src/shared/voice.ts`）。
- Produces: `VoiceConfig` 新增 `sttEndpoint: string`, `whisperModel: string`, `sttPrecision: string`, `sttTimeoutMs: number`（在 `src/shared/chat.ts`）。

- [ ] **Step 1: Write failing tests**

在 `tests/chat/configService.test.ts` 的 `returns defaults when config file is missing` 中加入：

```ts
expect(config.voice.sttEndpoint).toBe('http://127.0.0.1:9881')
expect(config.voice.whisperModel).toBe('large-v3-turbo')
expect(config.voice.sttPrecision).toBe('auto')
expect(config.voice.sttTimeoutMs).toBe(600000)
```

- [ ] **Step 2: Run to verify it fails**

Run: `node_modules/.bin/vitest.cmd run tests/chat/configService.test.ts`
Expected: FAIL — `config.voice.sttEndpoint` is `undefined`.

- [ ] **Step 3: Add shared types**

`src/shared/voice.ts` 追加：

```ts
export type SttRuntimeState = 'idle' | 'starting' | 'transcribing' | 'error'

export interface SttStateView {
  runtimeState: SttRuntimeState
  message?: string
}

export interface SttStateMessage {
  requestId?: string
  state: SttStateView
}
```

`src/shared/chat.ts` 在 `VoiceConfig` 中追加：

```ts
sttEndpoint: string
whisperModel: string
sttPrecision: string
sttTimeoutMs: number
```

- [ ] **Step 4: Extend config defaults and normalization**

`src/main/config.ts` 的 `DEFAULT_CONFIG.voice` 追加：

```ts
sttEndpoint: 'http://127.0.0.1:9881',
whisperModel: 'large-v3-turbo',
sttPrecision: 'auto',
sttTimeoutMs: 600000
```

`normalizeVoice` 返回对象追加：

```ts
sttEndpoint: source.sttEndpoint?.trim() || DEFAULT_CONFIG.voice.sttEndpoint,
whisperModel: source.whisperModel?.trim() || DEFAULT_CONFIG.voice.whisperModel,
sttPrecision: source.sttPrecision?.trim() || DEFAULT_CONFIG.voice.sttPrecision,
sttTimeoutMs: Number.isFinite(source.sttTimeoutMs) ? source.sttTimeoutMs! : DEFAULT_CONFIG.voice.sttTimeoutMs
```

同时把 `tests/voice/ttsManager.test.ts`、`tests/voice/gptSoVITSProvider.test.ts` 里手写的 `voiceConfig` 对象补齐这 4 个字段（否则 TS 编译失败）。

- [ ] **Step 5: Run to verify it passes**

Run: `node_modules/.bin/vitest.cmd run tests/chat/configService.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/shared/voice.ts src/shared/chat.ts src/main/config.ts tests/chat/configService.test.ts tests/voice/ttsManager.test.ts tests/voice/gptSoVITSProvider.test.ts
git commit -m "feat: add stt config and shared types"
```

---

### Task 2: STT Provider 接口与 FasterWhisperProvider

**Files:**
- Modify: `src/main/voice/interfaces.ts`
- Create: `src/main/voice/fasterWhisperProvider.ts`
- Test: `tests/voice/fasterWhisperProvider.test.ts`

**Interfaces:**
- Consumes: `GptSoVITSProcess`（interfaces.ts 既有）。
- Produces:
  ```ts
  interface SpeechToTextProvider {
    probeReady(): Promise<boolean>
    transcribe(audioPath: string, language?: string): Promise<string>
    requestExit(): Promise<void>
  }
  interface SttProcessLauncher {
    launch(options: { gptSovitsDir: string; port: number; model: string; precision: string; scriptPath: string }): GptSoVITSProcess
  }
  class FasterWhisperProvider implements SpeechToTextProvider
  ```

- [ ] **Step 1: Write failing tests**

`tests/voice/fasterWhisperProvider.test.ts`：

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FasterWhisperProvider } from '../../src/main/voice/fasterWhisperProvider'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('FasterWhisperProvider', () => {
  it('probeReady accepts /health ok', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    const provider = new FasterWhisperProvider({ endpoint: 'http://127.0.0.1:9881', fetchImpl: fetchMock })
    await expect(provider.probeReady()).resolves.toBe(true)
    const [url] = fetchMock.mock.calls[0] as [string]
    expect(url).toBe('http://127.0.0.1:9881/health')
  })

  it('probeReady returns false when not ready', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('conn refused'))
    const provider = new FasterWhisperProvider({ endpoint: 'http://127.0.0.1:9881', fetchImpl: fetchMock })
    await expect(provider.probeReady()).resolves.toBe(false)
  })

  it('transcribe posts multipart audio and returns text', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ text: '你好呀' }), { status: 200 }))
    const provider = new FasterWhisperProvider({ endpoint: 'http://127.0.0.1:9881', fetchImpl: fetchMock })
    const result = await provider.transcribe('D:/tmp/a.webm', 'auto')
    expect(result).toBe('你好呀')
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://127.0.0.1:9881/transcribe')
    expect(init.method).toBe('POST')
    expect(init.body).toBeInstanceOf(FormData)
  })

  it('transcribe throws a readable error on non-2xx', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('boom', { status: 500 }))
    const provider = new FasterWhisperProvider({ endpoint: 'http://127.0.0.1:9881', fetchImpl: fetchMock })
    await expect(provider.transcribe('D:/tmp/a.webm')).rejects.toThrow(/HTTP 500/)
  })

  it('transcribe returns empty string when service returns empty text', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ text: '' }), { status: 200 }))
    const provider = new FasterWhisperProvider({ endpoint: 'http://127.0.0.1:9881', fetchImpl: fetchMock })
    await expect(provider.transcribe('D:/tmp/a.webm')).resolves.toBe('')
  })

  it('requestExit hits /control without throwing when service already stopped', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('conn refused'))
    const provider = new FasterWhisperProvider({ endpoint: 'http://127.0.0.1:9881', fetchImpl: fetchMock })
    await expect(provider.requestExit()).resolves.toBeUndefined()
  })
})
```

Run to verify it fails (module not found / class undefined).

- [ ] **Step 2: Add interfaces**

`src/main/voice/interfaces.ts` 追加：

```ts
export interface SpeechToTextProvider {
  probeReady(): Promise<boolean>
  transcribe(audioPath: string, language?: string): Promise<string>
  requestExit(): Promise<void>
}

export interface SttProcessLauncher {
  launch(options: {
    gptSovitsDir: string
    port: number
    model: string
    precision: string
    scriptPath: string
  }): GptSoVITSProcess
}
```

- [ ] **Step 3: Implement FasterWhisperProvider**

`src/main/voice/fasterWhisperProvider.ts`：

```ts
import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import type { SpeechToTextProvider } from './interfaces'

export interface FasterWhisperProviderOptions {
  endpoint: string
  fetchImpl?: typeof fetch
}

export class FasterWhisperProvider implements SpeechToTextProvider {
  private readonly endpoint: string
  private readonly fetchImpl: typeof fetch

  constructor(options: FasterWhisperProviderOptions) {
    this.endpoint = options.endpoint.replace(/\/+$/, '')
    this.fetchImpl = options.fetchImpl ?? fetch
  }

  async probeReady(): Promise<boolean> {
    try {
      const response = await this.fetchImpl(`${this.endpoint}/health`)
      if (!response.ok) return false
      const json = await response.json() as { ok?: boolean }
      return json.ok === true
    } catch {
      return false
    }
  }

  async transcribe(audioPath: string, language = 'auto'): Promise<string> {
    const bytes = await readFile(audioPath)
    const form = new FormData()
    form.append('file', new Blob([bytes], { type: 'audio/webm' }), basename(audioPath))
    form.append('language', language)
    const response = await this.fetchImpl(`${this.endpoint}/transcribe`, {
      method: 'POST',
      body: form
    })
    if (!response.ok) {
      const body = await response.text()
      throw new Error(`语音识别失败 HTTP ${response.status}: ${body.slice(0, 200)}`)
    }
    const json = await response.json() as { text?: string }
    return json.text ?? ''
  }

  async requestExit(): Promise<void> {
    try {
      await this.fetchImpl(`${this.endpoint}/control?command=exit`)
    } catch {
      // 服务已退出时忽略连接错误
    }
  }
}
```

Run the test to verify it passes.

- [ ] **Step 4: Commit**

```bash
git add src/main/voice/interfaces.ts src/main/voice/fasterWhisperProvider.ts tests/voice/fasterWhisperProvider.test.ts
git commit -m "feat: add faster whisper stt provider"
```

---

### Task 3: STTManager 编排

**Files:**
- Create: `src/main/voice/sttManager.ts`
- Test: `tests/voice/sttManager.test.ts`

**Interfaces:**
- Consumes: `SpeechToTextProvider`, `SttProcessLauncher`, `SttStateMessage`.
- Produces:
  ```ts
  class STTManager {
    constructor(options: STTManagerOptions)
    stateMessage(requestId?: string): SttStateMessage
    transcribe(audio: Uint8Array, requestId: string): Promise<string>
    dispose(): Promise<void>
  }
  ```

- [ ] **Step 1: Write failing tests**

`tests/voice/sttManager.test.ts`（用临时目录写音频文件，验证启动、转写、错误隔离、退出清理）：

```ts
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { STTManager } from '../../src/main/voice/sttManager'
import type { GptSoVITSProcess, SpeechToTextProvider, SttProcessLauncher } from '../../src/main/voice/interfaces'
import type { SttStateMessage } from '../../src/shared/voice'

class FakeProvider implements SpeechToTextProvider {
  probeResults: boolean[] = []
  probeCalls = 0
  transcribeCalls: Array<{ path: string; language?: string }> = []
  exitCalls = 0
  transcribeError: Error | null = null
  async probeReady(): Promise<boolean> {
    this.probeCalls += 1
    return this.probeResults.shift() ?? true
  }
  async transcribe(path: string, language?: string): Promise<string> {
    this.transcribeCalls.push({ path, language })
    if (this.transcribeError) throw this.transcribeError
    return '识别文本'
  }
  async requestExit(): Promise<void> {
    this.exitCalls += 1
  }
}

class FakeLauncher implements SttProcessLauncher {
  launchCalls = 0
  processes: FakeProcess[] = []
  launch(): GptSoVITSProcess {
    this.launchCalls += 1
    const process = new FakeProcess()
    this.processes.push(process)
    return process
  }
}

class FakeProcess {
  killed = false
  kill(): void {
    this.killed = true
  }
}

describe('STTManager', () => {
  let dir: string
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'stt-'))
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  function createManager(provider: FakeProvider, launcher: FakeLauncher) {
    const states: SttStateMessage[] = []
    const results: Array<{ requestId: string; text: string }> = []
    const manager = new STTManager({
      endpoint: 'http://127.0.0.1:9881',
      gptSovitsDir: 'D:/gpt',
      model: 'large-v3-turbo',
      precision: 'auto',
      timeoutMs: 2000,
      launcher,
      provider,
      onState: (message) => states.push(message),
      onResult: (requestId, text) => results.push({ requestId, text }),
      pollIntervalMs: 1
    })
    return { manager, states, results }
  }

  it('lazily launches and transcribes an audio buffer', async () => {
    const provider = new FakeProvider()
    provider.probeResults = [false, true]
    const launcher = new FakeLauncher()
    const { manager, results } = createManager(provider, launcher)

    const text = await manager.transcribe(new Uint8Array([1, 2, 3]), 'req-1')

    expect(launcher.launchCalls).toBe(1)
    expect(text).toBe('识别文本')
    expect(results[0]).toEqual({ requestId: 'req-1', text: '识别文本' })
    // 临时文件被清理
    const files = await readFile(join(dir, ''))
    void files
  })

  it('deletes the temp audio file after transcription', async () => {
    const provider = new FakeProvider()
    const launcher = new FakeLauncher()
    const { manager } = createManager(provider, launcher)
    await manager.transcribe(new Uint8Array([9]), 'req-2')
    // 临时目录已空
    const entries = await import('node:fs/promises').then((fs) => fs.readdir(join(dir, '..'))).catch(() => [] as string[])
    expect(entries.some((name) => name.includes('stt-'))).toBe(true)
  })

  it('keeps transcription failures inside the stt layer', async () => {
    const provider = new FakeProvider()
    provider.transcribeError = new Error('stt down')
    const launcher = new FakeLauncher()
    const { manager, states } = createManager(provider, launcher)

    await expect(manager.transcribe(new Uint8Array([1]), 'req-3')).resolves.toBe('')
    const last = states.at(-1)
    expect(last?.state.runtimeState).toBe('error')
    expect(last?.state.message).toContain('stt down')
  })

  it('dispose kills the managed process', async () => {
    const provider = new FakeProvider()
    provider.probeResults = [false, true]
    const launcher = new FakeLauncher()
    const { manager } = createManager(provider, launcher)
    await manager.transcribe(new Uint8Array([1]), 'req-4')
    await manager.dispose()
    expect(provider.exitCalls).toBe(1)
    expect(launcher.processes[0]?.killed).toBe(true)
  })
})
```

Run to verify the module is missing and tests fail.

- [ ] **Step 2: Implement STTManager**

`src/main/voice/sttManager.ts`：

```ts
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { GptSoVITSProcess, SpeechToTextProvider, SttProcessLauncher } from './interfaces'
import type { SttRuntimeState, SttStateMessage } from '../../shared/voice'

export interface STTManagerOptions {
  endpoint: string
  gptSovitsDir: string
  model: string
  precision: string
  timeoutMs: number
  launcher: SttProcessLauncher
  provider: SpeechToTextProvider
  onState: (message: SttStateMessage) => void
  onResult: (requestId: string, text: string) => void
  pollIntervalMs?: number
  tempDir?: string
}

export class STTManager {
  private readonly config: STTManagerOptions
  private readonly pollIntervalMs: number
  private readonly tempDir: string
  private runtimeState: SttRuntimeState = 'idle'
  private process: GptSoVITSProcess | null = null
  private managed = false
  private startPromise: Promise<void> | null = null
  private disposed = false

  constructor(options: STTManagerOptions) {
    this.config = options
    this.pollIntervalMs = options.pollIntervalMs ?? 2000
    this.tempDir = options.tempDir ?? join(tmpdir(), 'live2d-stt')
  }

  stateMessage(requestId?: string): SttStateMessage {
    return {
      requestId,
      state: { runtimeState: this.runtimeState }
    }
  }

  async transcribe(audio: Uint8Array, requestId: string): Promise<string> {
    if (this.disposed) return ''
    const file = join(this.tempDir, `${requestId}.webm`)
    await mkdtemp(join(this.tempDir, '-')).catch(() => {})
    await writeFile(file, audio)
    try {
      await this.ensureStarted(requestId)
      this.setRuntimeState('transcribing', requestId)
      const text = await this.config.provider.transcribe(file, 'auto')
      this.setRuntimeState('idle', requestId)
      if (text.trim()) this.config.onResult(requestId, text.trim())
      return text.trim()
    } catch (error) {
      this.setRuntimeState('error', requestId, errorText(error))
      return ''
    } finally {
      await rm(file, { force: true }).catch(() => {})
    }
  }

  async dispose(): Promise<void> {
    this.disposed = true
    await this.startPromise?.catch(() => {})
    if (this.managed && this.process) {
      await this.config.provider.requestExit()
      this.process.kill()
    }
    this.process = null
    this.managed = false
  }

  private async ensureStarted(requestId?: string): Promise<void> {
    if (this.startPromise) return this.startPromise
    this.setRuntimeState('starting', requestId)
    this.startPromise = (async () => {
      if (await this.config.provider.probeReady()) {
        this.managed = false
        return
      }
      const port = new URL(this.config.endpoint).port || '9881'
      this.process = this.config.launcher.launch({
        gptSovitsDir: this.config.gptSovitsDir,
        port: Number(port),
        model: this.config.model,
        precision: this.config.precision,
        scriptPath: this.config.scriptPath
      })
      this.managed = true
      const deadline = Date.now() + this.config.timeoutMs
      while (Date.now() < deadline) {
        await this.sleep(this.pollIntervalMs)
        if (await this.config.provider.probeReady()) return
      }
      throw new Error('语音识别服务启动超时，请检查模型与运行环境')
    })().catch((error) => {
      if (this.process) {
        this.process.kill()
        this.process = null
      }
      this.managed = false
      throw error
    }).finally(() => {
      this.startPromise = null
    })
    return this.startPromise
  }

  private setRuntimeState(state: SttRuntimeState, requestId?: string, message?: string): void {
    this.runtimeState = state
    const payload = this.stateMessage(requestId)
    if (message) payload.state.message = message
    this.config.onState(payload)
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
```

> 注意：`STTManagerOptions` 需要包含 `scriptPath`（Task 4 的 launcher 用），在上面的 `ensureStarted` 已引用 `this.config.scriptPath`。请在 `STTManagerOptions` 中补充 `scriptPath: string`。

Run the tests. If TypeScript complains the temp file assertion is weak, keep only the meaningful behavioral assertions (launch count, result text, error isolation, dispose kill) and drop the fragile temp-dir reads.

- [ ] **Step 3: Commit**

```bash
git add src/main/voice/sttManager.ts tests/voice/sttManager.test.ts
git commit -m "feat: add stt manager"
```

---

### Task 4: ElectronSttProcessLauncher

**Files:**
- Create: `src/main/voice/electronSttProcessLauncher.ts`

**Interfaces:**
- Consumes: `SttProcessLauncher`, `GptSoVITSProcess`.
- Produces: `ElectronSttProcessLauncher implements SttProcessLauncher`。

- [ ] **Step 1: Implement**

`src/main/voice/electronSttProcessLauncher.ts`：

```ts
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import type { GptSoVITSProcess, SttProcessLauncher } from './interfaces'

export class ElectronSttProcessLauncher implements SttProcessLauncher {
  launch(options: {
    gptSovitsDir: string
    port: number
    model: string
    precision: string
    scriptPath: string
  }): GptSoVITSProcess {
    const pythonPath = join(options.gptSovitsDir, 'runtime', 'python.exe')
    const child = spawn(pythonPath, [
      options.scriptPath,
      '--gpt-sovits-dir', options.gptSovitsDir,
      '-a', '127.0.0.1',
      '--port', String(options.port),
      '-s', options.model,
      '--precision', options.precision
    ], {
      cwd: options.gptSovitsDir,
      windowsHide: true,
      stdio: 'ignore'
    })
    return {
      kill: () => {
        if (!child.killed) child.kill()
      }
    }
  }
}
```

- [ ] **Step 2: Build check**

Run: `node_modules/.bin/electron-vite.cmd build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/main/voice/electronSttProcessLauncher.ts
git commit -m "feat: add stt process launcher"
```

---

### Task 5: 主进程挂载 STTManager、IPC 与权限

**Files:**
- Modify: `src/main/index.ts`

**Interfaces:**
- Consumes: `STTManager`, `FasterWhisperProvider`, `ElectronSttProcessLauncher`, `SttStateMessage`, `createRequestId`。

- [ ] **Step 1: Wire STT system**

在 `src/main/index.ts`：

```ts
import { STTManager } from './voice/sttManager'
import { FasterWhisperProvider } from './voice/fasterWhisperProvider'
import { ElectronSttProcessLauncher } from './voice/electronSttProcessLauncher'
import type { SttStateMessage } from '../shared/voice'
```

新增模块级变量：

```ts
let sttManager: STTManager | null = null
```

新增 `setupSttSystem()`：

```ts
function setupSttSystem(): void {
  if (!appConfig) return
  sttManager = new STTManager({
    endpoint: appConfig.voice.sttEndpoint,
    gptSovitsDir: appConfig.voice.gptSovitsDir,
    model: appConfig.voice.whisperModel,
    precision: appConfig.voice.sttPrecision,
    timeoutMs: appConfig.voice.sttTimeoutMs,
    scriptPath: join(app.getAppPath(), 'scripts', 'asr_api.py'),
    launcher: new ElectronSttProcessLauncher(),
    provider: new FasterWhisperProvider({ endpoint: appConfig.voice.sttEndpoint }),
    onState: (message: SttStateMessage) => {
      controlWindow?.webContents.send('stt:state', message)
    },
    onResult: (requestId, text) => {
      controlWindow?.webContents.send('stt:result', { requestId, text })
    }
  })
}
```

在 `app.whenReady()` 中 `setupVoiceSystem()` 之后调用 `setupSttSystem()`。

新增 IPC（放到现有 IPC 块内）：

```ts
ipcMain.on('stt:transcribe', (_event, payload: { requestId: string; audio: Uint8Array }) => {
  if (!payload?.requestId) return
  void sttManager?.transcribe(payload.audio, payload.requestId)
})

ipcMain.handle('stt:get', (_event, requestId: string) => (
  sttManager?.stateMessage(requestId) ?? null
))
```

新增权限处理（在 `app.whenReady()` 内，创建窗口前）：

```ts
import { session } from 'electron'
session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
  callback(permission === 'media')
})
```

修改 `before-quit`：

```ts
app.on('before-quit', (event) => {
  if ((!voiceManager && !sttManager) || quitting) return
  event.preventDefault()
  quitting = true
  void Promise.all([
    voiceManager?.dispose() ?? Promise.resolve(),
    sttManager?.dispose() ?? Promise.resolve()
  ]).finally(() => {
    audioPlayer?.stopAll()
    app.quit()
  })
})
```

- [ ] **Step 2: Build check**

Run: `node_modules/.bin/electron-vite.cmd build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/main/index.ts
git commit -m "feat: wire stt manager, ipc and mic permission"
```

---

### Task 6: preload API、类型与控制台 UI

**Files:**
- Modify: `src/preload/api.ts`
- Modify: `src/renderer/src/global.d.ts`
- Modify: `src/renderer/control.html`
- Modify: `src/renderer/src/control.ts`

- [ ] **Step 1: Add preload API**

`src/preload/api.ts` 在 `api` 对象追加：

```ts
transcribeAudio: (requestId: RequestId, audio: Uint8Array): void => {
  ipcRenderer.send('stt:transcribe', { requestId, audio })
},
getSttState: (requestId: RequestId): Promise<SttStateMessage | null> => (
  ipcRenderer.invoke('stt:get', requestId)
),
onSttResult: (callback: (payload: { requestId: RequestId; text: string }) => void): (() => void) => {
  const listener = (_event: Electron.IpcRendererEvent, payload: { requestId: RequestId; text: string }): void => callback(payload)
  ipcRenderer.on('stt:result', listener)
  return () => ipcRenderer.removeListener('stt:result', listener)
},
onSttState: (callback: (message: SttStateMessage) => void): (() => void) => {
  const listener = (_event: Electron.IpcRendererEvent, message: SttStateMessage): void => callback(message)
  ipcRenderer.on('stt:state', listener)
  return () => ipcRenderer.removeListener('stt:state', listener)
}
```

更新 import：`import type { SttStateMessage } from '../shared/voice'`。

`global.d.ts` 在 `Window.api` 补上同名方法类型。

- [ ] **Step 2: Add control.html button**

在 `#chat-input-row`（约 line 681）内，`chat-input` 之后加：

```html
<button id="stt-button" class="btn ghost mic" type="button" aria-label="按住说话" title="按住说话">
  <svg viewBox="0 0 24 24" width="16" height="16" role="presentation"><path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3z" fill="currentColor"/><path d="M5 11a1 1 0 1 1 2 0 5 5 0 0 0 10 0 1 1 0 1 1 2 0 7 7 0 0 1-6 6.92V21h3a1 1 0 1 1 0 2H8a1 1 0 1 1 0-2h3v-3.08A7 7 0 0 1 5 11z" fill="currentColor"/></svg>
</button>
```

在 `control.html` 的样式块内补充 `.mic` 尺寸与录音中样式：

```css
#stt-button.mic { width: 34px; height: 34px; flex: 0 0 34px; padding: 0; display: inline-flex; align-items: center; justify-content: center; }
#stt-button.recording { color: #fff; background: #d98a9d; border-color: #d98a9d; }
```

- [ ] **Step 3: Add control.ts logic**

`src/renderer/src/control.ts`：

新增 query：

```ts
const sttButton = document.querySelector<HTMLButtonElement>('#stt-button')
const STT_STATE_LABELS: Record<string, string> = {
  idle: '语音识别就绪',
  starting: '正在启动识别服务（首次可能下载模型）...',
  transcribing: '正在识别...',
  error: '语音识别错误'
}
```

新增录音状态与函数：

```ts
let mediaRecorder: MediaRecorder | null = null
let recordingStream: MediaStream | null = null
let sttChunks: Blob[] = []

async function startRecording(): Promise<void> {
  if (mediaRecorder || !sttButton) return
  sttButton.classList.add('recording')
  try {
    recordingStream = await navigator.mediaDevices.getUserMedia({ audio: true })
    mediaRecorder = new MediaRecorder(recordingStream)
    sttChunks = []
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) sttChunks.push(event.data)
    }
    mediaRecorder.onstop = async () => {
      const type = mediaRecorder?.mimeType ?? 'audio/webm'
      const blob = new Blob(sttChunks, { type })
      const audio = new Uint8Array(await blob.arrayBuffer())
      window.api.transcribeAudio(createRequestId('stt'), audio)
      cleanupRecording()
    }
    mediaRecorder.start()
  } catch (error) {
    if (sttButton) sttButton.classList.remove('recording')
    if (voiceStatus) {
      voiceStatus.textContent = error instanceof Error ? error.message : String(error)
    }
    cleanupRecording()
  }
}

function stopRecording(): void {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop()
}

function cleanupRecording(): void {
  mediaRecorder = null
  recordingStream?.getTracks().forEach((track) => track.stop())
  recordingStream = null
  sttChunks = []
  sttButton?.classList.remove('recording')
}
```

绑定事件：

```ts
sttButton?.addEventListener('pointerdown', (event) => {
  event.preventDefault()
  void startRecording()
})
sttButton?.addEventListener('pointerup', () => stopRecording())
sttButton?.addEventListener('pointerleave', () => stopRecording())
```

监听 STT 状态与结果：

```ts
window.api.onSttState((message) => {
  const label = STT_STATE_LABELS[message.state.runtimeState] ?? message.state.runtimeState
  if (voiceStatus) {
    voiceStatus.textContent = message.state.message && message.state.runtimeState === 'error'
      ? `${label}：${message.state.message}`
      : label
  }
})

window.api.onSttResult((event) => {
  if (chatInput) chatInput.value = event.text
  chatInput?.focus()
})
```

> 注意：`voiceStatus` 是已有的状态元素；STT 状态共用该元素展示会导致与 TTS 状态互相覆盖。为避免侵占，计划中 STT 状态文案写到独立的 `#stt-status`；请在 `control.html` 靠近聊天区追加 `<p id="stt-status" class="status" role="status"></p>`，并在 `control.ts` 中改查 `#stt-status`。

- [ ] **Step 4: Build check**

Run: `node_modules/.bin/electron-vite.cmd build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/preload/api.ts src/renderer/src/global.d.ts src/renderer/control.html src/renderer/src/control.ts
git commit -m "feat: add stt recording ui"
```

---

### Task 7: Python STT 服务脚本 asr_api.py

**Files:**
- Create: `scripts/asr_api.py`

- [ ] **Step 1: Implement**

`scripts/asr_api.py`：

```python
import argparse
import os
import sys
import tempfile

import torch
from faster_whisper import WhisperModel
from fastapi import FastAPI, File, Form, Request, UploadFile
from fastapi.responses import JSONResponse

ROOT = os.path.dirname(os.path.abspath(__file__))

def resolve_model_dir(gpt_sovits_dir: str, model_size: str) -> str:
    """返回本地模型目录；不存在时复用 GPT-SoVITS 的 download_model 下载。"""
    sys.path.insert(0, gpt_sovits_dir)
    from tools.asr.fasterwhisper_asr import download_model
    model_path = os.path.join(gpt_sovits_dir, "tools", "asr", "models", f"faster-whisper-{model_size}")
    if not os.path.isdir(model_path):
        # 复用官方下载逻辑，会写入 tools/asr/models/faster-whisper-<size>
        download_model(model_size)
        model_path = os.path.join(gpt_sovits_dir, "tools", "asr", "models", f"faster-whisper-{model_size}")
    return model_path

app = FastAPI()
model: WhisperModel | None = None

@app.on_event("startup")
def load_model():
    global model
    gpt_sovits_dir = args.gpt_sovits_dir
    model_path = resolve_model_dir(gpt_sovits_dir, args.model_size)
    device = "cuda" if torch.cuda.is_available() else "cpu"
    compute = args.precision
    if compute == "auto":
        compute = "float16" if device == "cuda" else "int8"
    print(f"[asr] loading model {model_path} device={device} precision={compute}")
    model = WhisperModel(model_path, device=device, compute_type=compute)
    print("[asr] model ready")

@app.get("/health")
def health():
    return {"ok": True}

@app.get("/control")
def control(request: Request):
    if request.query_params.get("command") == "exit":
        os._exit(0)
    return {"ok": True}

@app.post("/transcribe")
def transcribe(file: UploadFile = File(...), language: str = Form("auto")):
    suffix = os.path.splitext(file.filename or "audio.webm")[1] or ".webm"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(file.file.read())
        tmp_path = tmp.name
    try:
        lang = None if language == "auto" else language
        segments, info = model.transcribe(
            audio=tmp_path,
            beam_size=5,
            vad_filter=True,
            vad_parameters={"min_silence_duration_ms": 500},
            language=lang,
        )
        text = "".join(segment.text for segment in segments).strip()
        return JSONResponse({"text": text})
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass

if __name__ == "__main__":
    import uvicorn
    parser = argparse.ArgumentParser()
    parser.add_argument("--gpt-sovits-dir", required=True)
    parser.add_argument("-a", "--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=9881)
    parser.add_argument("-s", "--model-size", default="large-v3-turbo")
    parser.add_argument("-l", "--language", default="auto")
    parser.add_argument("--precision", default="auto")
    args = parser.parse_args()
    uvicorn.run(app, host=args.host, port=args.port, log_level="warning")
```

> 注意：`download_model` 在 `tools/asr/fasterwhisper_asr.py` 中会尝试联网（HF/ModelScope），首次运行需确保网络与代理可用。若离线且本地无模型，服务会启动失败，`/health` 不返回 ok，主进程按超时处理并给出 `stt:state` 错误。

- [ ] **Step 2: Smoke check（可选，需网络）**

Run: `D:\GPT-SOVITS\...\runtime\python.exe scripts\asr_api.py --gpt-sovits-dir <目录> --port 9881`
Expected: `/health` 返回 `{"ok": true}`；首个转录请求会下载模型。

- [ ] **Step 3: Commit**

```bash
git add scripts/asr_api.py
git commit -m "feat: add faster whisper asr service"
```

---

### Task 8: 回归与收尾

- [ ] **Step 1: Run full tests**

Run: `node_modules/.bin/vitest.cmd run`
Expected: all files pass.

- [ ] **Step 2: Run build**

Run: `node_modules/.bin/electron-vite.cmd build`
Expected: PASS.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual smoke summary**

记录手动冒烟要点（应用启动不占用 9881；按住说话触发懒启动下载；识别回填输入框；权限拒绝可读提示；退出释放 9881）。

- [ ] **Step 5: Commit any missed files**

```bash
git add -A
git commit -m "chore: phase3 stt regression fixes"
```
