# Chat Pet Phase 2 GPT-SoVITS Voice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Electron 桌宠中加入语音回复：控制台开关 + 音色选择，主进程懒启动 GPT-SoVITS，聊天完成后合成并播放语音，模型切换自动联动音色。

**Architecture:** 所有 IPC 携带 `requestId`；`ChatManager` 只发聊天事件，主进程 index.ts 作为编排层把 `chat:complete` 交给 `TTSManager`。`GPTSoVITSProvider` 负责 HTTP、`TTSManager` 负责生命周期、`AudioPlayer` 通过输出窗口隐藏 `<audio>` 播放。

**Tech Stack:** Electron 37、electron-vite 3、TypeScript 5、Vitest 3、Node 内置 `fetch`、GPT-SoVITS `api_v2.py`。

## Global Constraints

- 目标平台：Windows 11；项目路径 `D:\AGENT\live`。
- 不新增 npm 依赖。
- 语音默认关闭；应用启动不启动 GPT-SoVITS；打开语音或首次语音回复时才懒启动。
- `ChatManager.ts` 不得 import/依赖任何 voice 模块。
- 所有 chat/voice IPC 带 `requestId`。
- GPT-SoVITS 就绪探测按实测固定为：`GET /tts?text_lang=auto&prompt_lang=ja` → `HTTP 400` JSON `{"message":"ref_audio_path is required"}`；判据只解析 `message`，不依赖状态码。
- API Key 不写源码/Git。
- 验证命令：`node_modules/.bin/vitest.cmd run` 与 `node_modules/.bin/electron-vite.cmd build`。

---

### Task 1: 给现有 chat IPC 和 ChatManager 加 requestId

**Files:**
- Create: `src/shared/requestId.ts`
- Modify: `src/main/chat/chatManager.ts`
- Modify: `src/main/index.ts`
- Modify: `src/preload/api.ts`
- Modify: `src/renderer/src/global.d.ts`
- Modify: `src/renderer/src/control.ts`
- Modify: `tests/chat/chatManager.test.ts`

**Interfaces:**
- Consumes: 无。
- Produces:
  - `type RequestId = string`
  - `createRequestId(prefix: string): RequestId`
  - `ChatManager.sendUserMessage(requestId: string, text: string): Promise<void>`
  - `ChatEvent = { type: 'start'; requestId } | { type: 'delta'; requestId; delta } | { type: 'complete'; requestId; message } | { type: 'error'; requestId; message }`
  - preload `sendChatMessage(requestId, text)`、`clearChat(requestId)`、`onChatStart(({ requestId }) => void)` 等。

- [ ] **Step 1: Write failing ChatManager tests**

```ts
it('propagates requestId through every event', async () => {
  const conversation = new ConversationManager(10, 'sys')
  const events: unknown[] = []
  const provider = fakeProvider(async function* () {
    yield 'hi'
  })
  const chat = new ChatManager(conversation, provider, (event) => events.push(event))

  await chat.sendUserMessage('req-1', 'hello')

  expect(events).toEqual([
    { type: 'start', requestId: 'req-1' },
    { type: 'delta', requestId: 'req-1', delta: 'hi' },
    { type: 'complete', requestId: 'req-1', message: 'hi' }
  ])
})
```

同时把现有调用改为 `sendUserMessage('req-1', ...)`，`events` 断言补 `requestId`。

- [ ] **Step 2: Run new test and verify failure**

Run: `node_modules/.bin/vitest.cmd run tests/chat/chatManager.test.ts`
Expected: FAIL，当前 `ChatManager` 不接受 requestId。

- [ ] **Step 3: Create requestId helper**

```ts
export type RequestId = string

export function createRequestId(prefix: string): RequestId {
  const random = Math.random().toString(36).slice(2, 10)
  return `${prefix}-${Date.now().toString(36)}-${random}`
}
```

- [ ] **Step 4: Update ChatManager**

```ts
export type ChatEvent =
  | { type: 'start'; requestId: string }
  | { type: 'delta'; requestId: string; delta: string }
  | { type: 'complete'; requestId: string; message: string }
  | { type: 'error'; requestId: string; message: string }

async sendUserMessage(requestId: string, text: string): Promise<void> {
  const content = text.trim()
  if (!content) return
  if (this.busy) {
    this.emit({ type: 'error', requestId, message: '上一条消息还在回复中，请稍候' })
    return
  }
  // 后续所有 emit 都带 requestId；错误 catch 也带 requestId。
}
```

- [ ] **Step 5: Update main process chat wiring**

`src/main/index.ts` 中：

```ts
function broadcastChatEvent(event: ChatEvent): void {
  if (!controlWindow) return
  if (event.type === 'start') controlWindow.webContents.send('chat:start', event)
  if (event.type === 'delta') controlWindow.webContents.send('chat:delta', event)
  if (event.type === 'complete') controlWindow.webContents.send('chat:complete', event)
  if (event.type === 'error') controlWindow.webContents.send('chat:error', event)
}

ipcMain.on('chat:send', (_event, payload: { requestId: string; text: string }) => {
  if (!payload?.requestId) return
  void chatManager?.sendUserMessage(payload.requestId, payload.text)
})

ipcMain.on('chat:clear', (_event, payload: { requestId: string }) => {
  if (!payload?.requestId) return
  chatManager?.clear()
  controlWindow?.webContents.send('chat:clear', payload)
})
```

- [ ] **Step 6: Update preload and global types**

preload 中 listener 改为解包 `{ requestId, ... }`，例如：

```ts
sendChatMessage: (requestId: string, text: string): void => {
  ipcRenderer.send('chat:send', { requestId, text })
},
clearChat: (requestId: string): void => {
  ipcRenderer.send('chat:clear', { requestId })
},
onChatStart: (callback: (event: { requestId: string }) => void): (() => void) => {
  const listener = (_event: Electron.IpcRendererEvent, event: { requestId: string }): void => callback(event)
  ipcRenderer.on('chat:start', listener)
  return () => ipcRenderer.removeListener('chat:start', listener)
}
```

`global.d.ts` 同步签名。

- [ ] **Step 7: Update control renderer**

`control.ts` 发送处生成 requestId：

```ts
import { createRequestId } from '../../shared/requestId'

async function sendChatMessage(): Promise<void> {
  const text = chatInput?.value ?? ''
  if (!text.trim()) return
  appendChatMessage('user', text.trim())
  chatInput.value = ''
  window.api.sendChatMessage(createRequestId('chat'), text)
}
```

事件回调改为接收事件对象；`chat:complete` 时正文取 `event.message`。

- [ ] **Step 8: Run tests and build**

Run: `node_modules/.bin/vitest.cmd run`
Expected: PASS。

Run: `node_modules/.bin/electron-vite.cmd build`
Expected: PASS。

- [ ] **Step 9: Commit**

```bash
git add src/shared/requestId.ts src/main/chat/chatManager.ts src/main/index.ts src/preload/api.ts src/renderer/src/global.d.ts src/renderer/src/control.ts tests/chat/chatManager.test.ts
git commit -m "refactor: add requestId to chat IPC"
```

---

### Task 2: 共享音色模型与配置扩展

**Files:**
- Create: `src/shared/voice.ts`
- Modify: `src/shared/chat.ts`
- Modify: `src/main/config.ts`
- Modify: `tests/chat/configService.test.ts`
- Create: `tests/voice/modelVoiceMapping.test.ts`

**Interfaces:**
- Consumes: `OutfitId`。
- Produces:
  - `type VoiceId = '若叶睦' | '千早爱音' | '白祥' | '黑祥' | '墨提斯'`
  - `VOICE_OPTIONS: Array<{ id: VoiceId; displayName: string }>`
  - `voiceIdForModel(modelId: OutfitId): VoiceId`
  - `isVoiceId(value: unknown): value is VoiceId`
  - `VoiceConfig`、`VoiceRuntimeState`、`VoiceStateView`、`VoiceStateMessage`

- [ ] **Step 1: Write mapping tests**

```ts
describe('voiceIdForModel', () => {
  it('maps any 341_ model to white Sakiko', () => {
    expect(voiceIdForModel('341_casual')).toBe('白祥')
    expect(voiceIdForModel('341_live_2024')).toBe('白祥')
  })

  it('maps any 037_ model to Anon', () => {
    expect(voiceIdForModel('037_birthday_2024_ssr')).toBe('千早爱音')
  })

  it('maps remaining models to Mutsumi', () => {
    expect(voiceIdForModel('casual')).toBe('若叶睦')
    expect(voiceIdForModel('event')).toBe('若叶睦')
  })
})
```

- [ ] **Step 2: Run and verify failure**

- [ ] **Step 3: Implement shared voice module**

```ts
export type VoiceId = '若叶睦' | '千早爱音' | '白祥' | '黑祥' | '墨提斯'

export const VOICE_OPTIONS: Array<{ id: VoiceId; displayName: string }> = [
  { id: '若叶睦', displayName: '若叶睦' },
  { id: '千早爱音', displayName: '千早爱音' },
  { id: '白祥', displayName: '白祥' },
  { id: '黑祥', displayName: '黑祥' },
  { id: '墨提斯', displayName: '墨提斯' }
]

export const VOICE_IDS: VoiceId[] = VOICE_OPTIONS.map((option) => option.id)

export function isVoiceId(value: unknown): value is VoiceId {
  return typeof value === 'string' && (VOICE_IDS as string[]).includes(value)
}

export function voiceIdForModel(modelId: OutfitId): VoiceId {
  if (modelId.startsWith('341_')) return '白祥'
  if (modelId.startsWith('037_')) return '千早爱音'
  return '若叶睦'
}

export type VoiceRuntimeState = 'off' | 'idle' | 'starting' | 'loading-voice' | 'synthesizing' | 'playing' | 'stopping' | 'error'

export interface VoiceStateView {
  enabled: boolean
  selectedVoice: VoiceId
  modelId: string | null
  runtimeState: VoiceRuntimeState
  message?: string
}

export interface VoiceStateMessage {
  requestId?: string
  state: VoiceStateView
}
```

- [ ] **Step 4: Replace VoiceConfigReserved**

`src/shared/chat.ts` 中把 `VoiceConfigReserved` 替换为：

```ts
export interface VoiceConfig {
  enabled: boolean
  selectedVoice: VoiceId
  ttsEndpoint: string
  gptSovitsDir: string
  trainingAudioDir: string
  startupTimeoutMs: number
}
```

`AppConfig.voice` 类型改为 `VoiceConfig`。

- [ ] **Step 5: Update ConfigService**

默认值：

```ts
voice: {
  enabled: false,
  selectedVoice: '若叶睦',
  ttsEndpoint: 'http://127.0.0.1:9880',
  gptSovitsDir: 'D:\\GPT-SOVITS\\GPT-SoVITS-v2pro-20250604-nvidia50\\GPT-SoVITS-v2pro-20250604-nvidia50',
  trainingAudioDir: 'D:\\AGENT\\live\\训练音频',
  startupTimeoutMs: 300000
}
```

`load()` 的 voice 合并逻辑必须处理旧 `defaultVoice` 字段并校验 `selectedVoice`：

```ts
function normalizeVoice(value?: Partial<VoiceConfig> & { defaultVoice?: unknown }): VoiceConfig {
  const source = value ?? {}
  const selected = source.selectedVoice ?? source.defaultVoice ?? DEFAULT_CONFIG.voice.selectedVoice
  return {
    enabled: typeof source.enabled === 'boolean' ? source.enabled : DEFAULT_CONFIG.voice.enabled,
    selectedVoice: isVoiceId(selected) ? selected : DEFAULT_CONFIG.voice.selectedVoice,
    ttsEndpoint: source.ttsEndpoint?.trim() || DEFAULT_CONFIG.voice.ttsEndpoint,
    gptSovitsDir: source.gptSovitsDir?.trim() || DEFAULT_CONFIG.voice.gptSovitsDir,
    trainingAudioDir: source.trainingAudioDir?.trim() || DEFAULT_CONFIG.voice.trainingAudioDir,
    startupTimeoutMs: Number.isFinite(source.startupTimeoutMs) ? source.startupTimeoutMs! : DEFAULT_CONFIG.voice.startupTimeoutMs
  }
}
```

新增 `applyVoiceConfig(config, changes)`，只允许 `enabled` 与 `selectedVoice` 变化，返回新 `AppConfig`。

- [ ] **Step 6: Update config tests and run**

默认断言改为 `config.voice.selectedVoice === '若叶睦'`、`enabled === false`。新增旧配置迁移测试：写入含 `defaultVoice: '黑祥'` 的 JSON 后 load，期望 `selectedVoice === '黑祥'`。

Run: `node_modules/.bin/vitest.cmd run tests/chat/configService.test.ts tests/voice/modelVoiceMapping.test.ts`
Expected: PASS。

- [ ] **Step 7: Commit**

```bash
git add src/shared/voice.ts src/shared/chat.ts src/main/config.ts tests/chat/configService.test.ts tests/voice/modelVoiceMapping.test.ts
git commit -m "feat: add voice config and model voice mapping"
```

---

### Task 3: GPT-SoVITS Provider 与音色目录

**Files:**
- Create: `src/main/voice/interfaces.ts`
- Create: `src/main/voice/voiceCatalog.ts`
- Create: `src/main/voice/gptSoVITSProvider.ts`
- Create: `tests/voice/gptSoVITSProvider.test.ts`

**Interfaces:**
- Consumes: `VoiceId`、`VoiceProfile`。
- Produces:
  - `TextToSpeechProvider.probeReady(): Promise<boolean>`
  - `TextToSpeechProvider.loadVoice(profile): Promise<void>`
  - `TextToSpeechProvider.synthesize(profile, text): Promise<Uint8Array>`
  - `buildVoiceCatalog(options): Record<VoiceId, VoiceProfile>`

- [ ] **Step 1: Write provider tests**

```ts
it('probeReady accepts only the observed JSON validation message', async () => {
  const fetchMock = vi.fn()
    .mockResolvedValue(new Response(JSON.stringify({ message: 'ref_audio_path is required' }), { status: 400 }))
  const provider = new GPTSoVITSProvider({ endpoint: 'http://127.0.0.1:9880', fetchImpl: fetchMock })

  await expect(provider.probeReady()).resolves.toBe(true)

  const [url] = fetchMock.mock.calls[0] as [string]
  expect(url).toContain('/tts?text_lang=auto&prompt_lang=ja')
})

it('probeReady rejects text/plain 500 responses', async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response('Internal Server Error', { status: 500 }))
  const provider = new GPTSoVITSProvider({ endpoint: 'http://127.0.0.1:9880', fetchImpl: fetchMock })

  await expect(provider.probeReady()).resolves.toBe(false)
})
```

另加两个用例：`loadVoice()` 依次请求 `/set_gpt_weights`、`/set_sovits_weights`；`synthesize()` POST `/tts` 并返回字节。

- [ ] **Step 2: Run and verify failure**

- [ ] **Step 3: Create interfaces**

```ts
export interface VoiceProfile {
  voiceId: VoiceId
  gptWeightsPath: string
  sovitsWeightsPath: string
  referenceAudioPath: string
  promptText: string
  promptLang: 'ja'
}

export interface TextToSpeechProvider {
  probeReady(): Promise<boolean>
  loadVoice(profile: VoiceProfile): Promise<void>
  synthesize(profile: VoiceProfile, text: string): Promise<Uint8Array>
}

export interface GptSoVITSProcess {
  kill(): void
}

export interface VoiceProcessLauncher {
  launch(options: { gptSovitsDir: string; port: number }): GptSoVITSProcess
}
```

- [ ] **Step 4: Create voiceCatalog**

按 spec 音色资料表实现 `VOICE_SPECS`，目录结构使用 `GPT_weights_v2Pro`、`SoVITS_weights_v2Pro` 和 `训练AudioDir` 下的角色目录。参考音频和 Prompt 原样保留中文/日文文件名。

```ts
export function buildVoiceCatalog(options: {
  gptSovitsDir: string
  trainingAudioDir: string
}): Record<VoiceId, VoiceProfile>
```

- [ ] **Step 5: Implement GPTSoVITSProvider**

```ts
async probeReady(): Promise<boolean> {
  const url = `${this.endpoint}/tts?text_lang=auto&prompt_lang=ja`
  let response: Response
  try {
    response = await this.fetchImpl(url)
  } catch {
    return false
  }
  const text = await response.text()
  try {
    const json = JSON.parse(text) as { message?: string }
    return typeof json.message === 'string' && json.message.includes('ref_audio_path is required')
  } catch {
    return false
  }
}

async loadVoice(profile: VoiceProfile): Promise<void> {
  await this.getCommand('/set_gpt_weights', { weights_path: profile.gptWeightsPath })
  await this.getCommand('/set_sovits_weights', { weights_path: profile.sovitsWeightsPath })
}

async synthesize(profile: VoiceProfile, text: string): Promise<Uint8Array> {
  const response = await this.fetchImpl(`${this.endpoint}/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      text_lang: 'auto',
      ref_audio_path: profile.referenceAudioPath,
      prompt_text: profile.promptText,
      prompt_lang: profile.promptLang,
      media_type: 'wav',
      streaming_mode: 0
    })
  })
  if (!response.ok) throw new Error(`语音合成失败 HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`)
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes.byteLength === 0) throw new Error('语音服务返回空音频')
  return bytes
}
```

`getCommand` 用 `URLSearchParams` 拼查询，非 2xx 时读取响应体并抛中文错误。

- [ ] **Step 6: Run tests**

Run: `node_modules/.bin/vitest.cmd run tests/voice/gptSoVITSProvider.test.ts`
Expected: PASS。

- [ ] **Step 7: Commit**

```bash
git add src/main/voice tests/voice
git commit -m "feat: add gpt-sovits provider and voice catalog"
```

---

### Task 4: TTSManager 懒启动与音色联动

**Files:**
- Create: `src/main/voice/ttsManager.ts`
- Create: `src/main/voice/electronVoiceProcessLauncher.ts`
- Create: `tests/voice/ttsManager.test.ts`

**Interfaces:**
- Consumes: `TextToSpeechProvider`、`VoiceProcessLauncher`、`VoiceConfig`、`VoiceStateMessage`。
- Produces:
  - `class TTSManager`：
    - `stateMessage(requestId?): VoiceStateMessage`
    - `setModel(modelId: OutfitId): void`
    - `setVoice(voiceId: VoiceId): void`
    - `setEnabled(enabled: boolean): Promise<void>`
    - `speak(text: string, requestId: string): Promise<void>`
    - `dispose(): Promise<void>`

- [ ] **Step 1: Write TTSManager tests**

覆盖：disabled 时 `speak` 不启动服务；开启后首次 `speak` 懒启动并调用 `loadVoice`；关闭时 kill 本应用启动的子进程；`setModel('341_xxx')` 把音色改为 `白祥`；Provider 失败时 `speak` 不抛给调用者且状态为 `error`。

- [ ] **Step 2: Run and verify failure**

- [ ] **Step 3: Create launcher**

`ElectronVoiceProcessLauncher` 使用 `child_process.spawn`：

```ts
launch(options): GptSoVITSProcess {
  const pythonPath = join(options.gptSovitsDir, 'runtime', 'python.exe')
  const scriptPath = join(options.gptSovitsDir, 'api_v2.py')
  const child = spawn(pythonPath, [
    scriptPath,
    '-a', '127.0.0.1',
    '-p', String(options.port),
    '-c', 'GPT_SoVITS/configs/tts_infer.yaml'
  ], { cwd: options.gptSovitsDir, windowsHide: true, stdio: 'ignore' })
  return { kill: () => { if (!child.killed) child.kill() } }
}
```

- [ ] **Step 4: Implement TTSManager**

关键状态：

```ts
private enabled: boolean
private selectedVoice: VoiceId
private modelId: OutfitId | null = null
private runtimeState: VoiceRuntimeState = 'off'
private process: GptSoVITSProcess | null = null
private managed = false
private startPromise: Promise<void> | null = null
private loadedVoice: VoiceId | null = null
private voiceLoadPromise: Promise<void> | null = null
private speechTail: Promise<void> = Promise.resolve()
```

`setEnabled(true)` → `ensureStarted()` → `ensureVoiceLoaded(this.selectedVoice)`。

`setEnabled(false)` → 若 `managed` 为 true，先 GET `/control?command=exit`，随后 `process.kill()`；外部服务不杀；状态回 `off`。

`setModel(modelId)` → `voiceIdForModel(modelId)`；与当前不同则 `setVoice(next)`。

`speak` 用 `speechTail` 串行化；每段流程为：

```ts
this.speechTail = this.speechTail.then(async () => {
  if (!this.enabled) return
  await this.ensureStarted()
  await this.ensureVoiceLoaded(this.selectedVoice)
  this.setRuntimeState('synthesizing', requestId)
  const audio = await this.provider.synthesize(profile, text)
  this.setRuntimeState('playing', requestId)
  await this.play(requestId, audio)
  this.setRuntimeState('idle', requestId)
})
```

`speak` 外层 catch 错误并调用 `setRuntimeState('error', requestId, message)`，不向聊天链路抛错。

`ensureStarted()` 先 `provider.probeReady()`，true 则不启动外部服务；false 才 `launcher.launch()`，随后每 2 秒再次探测直到 `startupTimeoutMs`。

- [ ] **Step 5: Run tests**

Run: `node_modules/.bin/vitest.cmd run tests/voice/ttsManager.test.ts`
Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add src/main/voice/ttsManager.ts src/main/voice/electronVoiceProcessLauncher.ts tests/voice/ttsManager.test.ts
git commit -m "feat: add tts manager with lazy start"
```

---

### Task 5: AudioPlayer 与输出窗口播放

**Files:**
- Create: `src/main/voice/audioPlayer.ts`
- Create: `src/main/voice/electronAudioSink.ts`
- Create: `tests/voice/audioPlayer.test.ts`
- Modify: `src/renderer/index.html`
- Modify: `src/renderer/src/main.ts`
- Modify: `src/preload/api.ts`
- Modify: `src/renderer/src/global.d.ts`

**Interfaces:**
- Consumes: `RequestId`。
- Produces:
  - `class AudioPlayer`，`enqueue(requestId, audio): Promise<void>`，`stopAll(): void`
  - `PlaybackSink.play(requestId, playbackId, audio): Promise<void>`、`stop(playbackId): void`

- [ ] **Step 1: Write AudioPlayer tests**

用 fake sink 的 deferred promise 验证：两条音频按 FIFO 播放；第一条结束后自动播放第二条。

- [ ] **Step 2: Run and verify failure**

- [ ] **Step 3: Implement AudioPlayer**

队列项携带 `requestId`、`playbackId`、`audio` 和 resolve；`enqueue` 返回一个在该项播放完成时 resolve 的 Promise；`pump` 串行播放。

`stopAll()` 清空队列并对当前项调用 `sink.stop(playbackId)`。

- [ ] **Step 4: Implement ElectronAudioSink**

持有 `pending` Map。`play()` 校验输出窗口存在后 `webContents.send('voice:play', { requestId, playbackId, audio })`，并注册一个超时；收到 `voice:playback-ended` 或 `voice:playback-error` 时按 `playbackId` resolve/reject。

`stop(playbackId)` 发送 `voice:stop` 并立即 resolve 对应 pending。

- [ ] **Step 5: Add hidden audio element**

`index.html` 的 body 增加 `<audio id="voice-audio" hidden></audio>`，并让 `#voice-audio { display: none; }`。

- [ ] **Step 6: Play audio in output renderer**

`main.ts` 注册：

```ts
window.api.onVoicePlay(({ requestId, playbackId, audio }) => {
  const audioElement = document.querySelector<HTMLAudioElement>('#voice-audio')
  if (!audioElement) return
  if (currentVoiceUrl) URL.revokeObjectURL(currentVoiceUrl)
  const blob = new Blob([audio], { type: 'audio/wav' })
  currentVoiceUrl = URL.createObjectURL(blob)
  audioElement.src = currentVoiceUrl
  audioElement.onended = () => window.api.reportVoiceEnded(requestId, playbackId)
  audioElement.onerror = () => window.api.reportVoiceError(requestId, playbackId, '音频播放失败')
  void audioElement.play()
})

window.api.onVoiceStop(({ playbackId }) => {
  audioElement.pause()
  audioElement.currentTime = 0
})
```

- [ ] **Step 7: Add preload methods and types**

输出窗口 preload 新增 `onVoicePlay`、`onVoiceStop`、`reportVoiceEnded`、`reportVoiceError`，类型同步进 `global.d.ts`。

- [ ] **Step 8: Run tests and build**

- [ ] **Step 9: Commit**

```bash
git add src/main/voice src/renderer/index.html src/renderer/src/main.ts src/preload/api.ts src/renderer/src/global.d.ts tests/voice/audioPlayer.test.ts
git commit -m "feat: add voice audio player over output window"
```

---

### Task 6: 主进程编排、IPC 与控制台 UI

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/preload/api.ts`
- Modify: `src/renderer/src/global.d.ts`
- Modify: `src/renderer/control.html`
- Modify: `src/renderer/src/control.ts`

**Interfaces:**
- Consumes: `TTSManager`、`AudioPlayer`、`ElectronAudioSink`、`ElectronVoiceProcessLauncher`、`buildVoiceCatalog`。
- Produces: 主进程 `voice:get`、`voice:set-enabled`、`voice:set-voice`、`voice:state`；控制台语音 UI。

- [ ] **Step 1: Wire voice managers in main**

`app.whenReady` 中在创建窗口前后初始化：

```ts
const voiceCatalog = buildVoiceCatalog({
  gptSovitsDir: appConfig.voice.gptSovitsDir,
  trainingAudioDir: appConfig.voice.trainingAudioDir
})
const audioSink = new ElectronAudioSink(() => outputWindow)
const audioPlayer = new AudioPlayer(audioSink)
const voiceManager = new TTSManager({
  voiceConfig: appConfig.voice,
  catalog: voiceCatalog,
  provider: new GPTSoVITSProvider({ endpoint: appConfig.voice.ttsEndpoint }),
  launcher: new ElectronVoiceProcessLauncher(),
  persist: (changes) => {
    if (!appConfig) return
    appConfig = configService.applyVoiceConfig(appConfig, changes)
    void configService.save(appConfig)
  },
  onState: (message) => {
    if (controlWindow) controlWindow.webContents.send('voice:state', message)
  },
  play: (requestId, audio) => audioPlayer.enqueue(requestId, audio)
})
```

`handleChatEvent` 在 `chat:complete` 时调用 `void voiceManager.speak(event.message, event.requestId)`；`ChatManager` 构造时传入 `handleChatEvent`。

`model:changed` handler 除转发外调用 `voiceManager.setModel(id)`。

注册：

```ts
ipcMain.handle('voice:get', () => voiceManager?.stateMessage() ?? null)
ipcMain.on('voice:set-enabled', (_event, payload: { requestId: string; enabled: boolean }) => {
  if (!payload?.requestId) return
  void voiceManager?.setEnabled(Boolean(payload.enabled))
})
ipcMain.on('voice:set-voice', (_event, payload: { requestId: string; voiceId: VoiceId }) => {
  if (!payload?.requestId || !isVoiceId(payload.voiceId)) return
  voiceManager?.setVoice(payload.voiceId)
})
```

`before-quit` 中先 `preventDefault()`，等 `voiceManager.dispose()` 后再 `app.quit()`，防止遗留子进程。

- [ ] **Step 2: Add control UI**

`control.html` 聊天区后增加：

```html
<div id="voice-controls">
  <label><input id="voice-enabled" type="checkbox" /> 语音回复</label>
  <label>音色 <select id="voice-select"></select></label>
</div>
<p id="voice-status"></p>
```

`control.ts` 用 `VOICE_OPTIONS` 填下拉，加载 `voice:get` 状态，监听 `voice:state`。开关和下拉变更时分别用 `createRequestId('voice')` 调用 `setVoiceEnabled` / `setVoiceId`。

- [ ] **Step 3: Update preload/global types**

新增：

```ts
getVoiceState: () => Promise<VoiceStateMessage | null>
setVoiceEnabled: (requestId: string, enabled: boolean) => void
setVoiceId: (requestId: string, voiceId: VoiceId) => void
onVoiceState: (callback: (message: VoiceStateMessage) => void) => () => void
```

- [ ] **Step 4: Run tests and build**

- [ ] **Step 5: Commit**

```bash
git add src/main/index.ts src/preload/api.ts src/renderer/src/global.d.ts src/renderer/control.html src/renderer/src/control.ts
git commit -m "feat: wire voice UI and orchestration"
```

---

### Task 7: 全量验证与真实语音冒烟

**Files:** 无新增；按需修文件。

- [ ] **Step 1: Run all unit tests**

Run: `node_modules/.bin/vitest.cmd run`
Expected: 全部 PASS。

- [ ] **Step 2: Run build**

Run: `node_modules/.bin/electron-vite.cmd build`
Expected: PASS。

- [ ] **Step 3: Manual smoke**

应用启动后确认 `9880` 未启动。开启语音，确认懒启动状态。发送真实消息，确认文字先到、随后语音播放。切换 `341_*`，确认下拉自动变白祥。手动选墨提斯，再切一次模型，确认回联动音色。关闭语音，确认本应用启动的 GPT-SoVITS 退出且端口释放。

- [ ] **Step 4: Commit smoke fixes if any**

```bash
git add <fixed-files>
git commit -m "fix: phase2 voice smoke test issues"
```

## Self-Review

- `ChatManager` 不依赖 voice：Task 1 只加 requestId，Task 6 在 index.ts 编排。
- requestId：Task 1 覆盖 chat；Task 4-6 覆盖 TTS/播放 IPC。
- 就绪探测：Task 3 使用实测 JSON 消息判据，不做状态码假设。
- 默认关闭/懒启动：Task 4 `setEnabled(false)` 不启动；speak 才 `ensureStarted`。
- 音色联动：Task 2 映射 + Task 4 `setModel`。
