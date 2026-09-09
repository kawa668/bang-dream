# Chat Pet Phase 5 Profile / Emotion / Memory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 引入 CharacterProfile、情绪探测（AIState）与 MemoryStore（JSON 记忆），切换角色自动应用角色档案，chat:complete 附加情绪，会话可跨恢复。

**Architecture:** 纯函数/接口放 `shared`；记忆实现放 `main/memory`；配置增加 `currentCharacter` 与 `characters` 覆盖；主进程在 `model:changed` 应用档案并重建 ChatManager，在 `chat:complete` 附加情绪，启动时恢复记忆。

**Tech Stack:** Electron 37 + electron-vite 3 + TypeScript 5 + Vitest。

## Global Constraints

- 不新增 npm 依赖。
- 不改 `LLMProvider`、TTS/STT 链路、Live2D。
- 角色为 `mutsumi / anon / sakiko`，由现有模型 id 前缀映射（`341_`→sakiko，`037_`→anon，其余→mutsumi）。
- 记忆用 JSON 文件，无数据库；不做 RAG/摘要。
- 验证命令：`vitest run`、`tsc --noEmit`、`electron-vite build` 全部通过。

---

### Task 1: 角色档案与情绪探测（纯函数）

**Files:**
- Create: `src/shared/characterProfiles.ts`
- Create: `src/shared/emotion.ts`
- Test: `tests/shared/characterProfiles.test.ts`
- Test: `tests/shared/emotion.test.ts`

**Interfaces:**
- Produces: `CharacterId`, `CharacterProfile`, `CHARACTER_PROFILES`, `characterForModel(modelId): CharacterId`, `profileForModel(modelId): CharacterProfile`；`Emotion`, `detectEmotion(text): Emotion`。

- [ ] **Step 1: Write failing tests**

`tests/shared/characterProfiles.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { characterForModel, profileForModel } from '../../src/shared/characterProfiles'

describe('characterProfiles', () => {
  it('maps model prefixes to characters', () => {
    expect(characterForModel('341_casual')).toBe('sakiko')
    expect(characterForModel('037_casual-2023')).toBe('anon')
    expect(characterForModel('casual')).toBe('mutsumi')
  })

  it('returns the profile defaults per character', () => {
    expect(profileForModel('341_casual').name).toBe('丰川祥子')
    expect(profileForModel('037_casual-2023').defaultVoice).toBe('千早爱音')
    expect(profileForModel('casual').defaultVoice).toBe('若叶睦')
  })
})
```

`tests/shared/emotion.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { detectEmotion } from '../../src/shared/emotion'

describe('detectEmotion', () => {
  it('detects happy and sad keywords', () => {
    expect(detectEmotion('好耶！太开心了')).toBe('happy')
    expect(detectEmotion('对不起，我很难过')).toBe('sad')
  })
  it('defaults to neutral', () => {
    expect(detectEmotion('今天天气不错')).toBe('neutral')
  })
})
```

Run to verify they fail (module missing).

- [ ] **Step 2: Implement**

`src/shared/characterProfiles.ts`（`characterForModel` 用 `getCharacter` 做映射）：

```ts
import type { VoiceId } from './voice'
import { getCharacter } from './modelCategories'

export type CharacterId = 'mutsumi' | 'anon' | 'sakiko'

export interface CharacterProfile {
  id: CharacterId
  name: string
  systemPrompt: string
  model: string
  defaultVoice: VoiceId
}

export const CHARACTER_PROFILES: Record<CharacterId, CharacterProfile> = {
  mutsumi: { id: 'mutsumi', name: '若叶睦', systemPrompt: '你是若叶睦，说话温柔克制，用中文简短回复。', model: 'deepseek v4flash', defaultVoice: '若叶睦' },
  anon: { id: 'anon', name: '千早爱音', systemPrompt: '你是千早爱音，活泼开朗，用中文回复。', model: 'deepseek v4flash', defaultVoice: '千早爱音' },
  sakiko: { id: 'sakiko', name: '丰川祥子', systemPrompt: '你是丰川祥子，优雅端庄，用中文回复。', model: 'deepseek v4flash', defaultVoice: '白祥' }
}

export function characterForModel(modelId: string): CharacterId {
  const character = getCharacter(modelId)
  if (character === '丰川祥子') return 'sakiko'
  if (character === '千早爱音') return 'anon'
  return 'mutsumi'
}

export function profileForModel(modelId: string): CharacterProfile {
  return CHARACTER_PROFILES[characterForModel(modelId)]
}
```

`src/shared/emotion.ts`：

```ts
export type Emotion = 'neutral' | 'calm' | 'happy' | 'sad' | 'excited' | 'thinking'

const HAPPY = ['开心', '哈哈', '太棒', '好耶', '高兴', '喜欢']
const SAD = ['难过', '对不起', '哭', '伤心', '遗憾']
const EXCITED = ['好耶', '哇', '！！', '太激动']
const THINKING = ['嗯', '思考', '想想', '也许', '可能']
const CALM = ['没事', '平静', '放心', '别担心']

export function detectEmotion(text: string): Emotion {
  if (EXCITED.some((k) => text.includes(k))) return 'excited'
  if (HAPPY.some((k) => text.includes(k))) return 'happy'
  if (SAD.some((k) => text.includes(k))) return 'sad'
  if (THINKING.some((k) => text.includes(k))) return 'thinking'
  if (CALM.some((k) => text.includes(k))) return 'calm'
  return 'neutral'
}
```

Run tests to verify they pass.

- [ ] **Step 3: Commit**

```bash
git add src/shared/characterProfiles.ts src/shared/emotion.ts tests/shared/characterProfiles.test.ts tests/shared/emotion.test.ts
git commit -m "feat: add character profiles and emotion detection"
```

---

### Task 2: 配置 currentCharacter / characters 覆盖

**Files:**
- Modify: `src/shared/chat.ts`
- Modify: `src/main/config.ts`
- Test: `tests/chat/configService.test.ts`

**Interfaces:**
- Produces: `AppConfig.currentCharacter`, `AppConfig.characters`；`ConfigService.effectiveProfile(role)`。

- [ ] **Step 1: Write failing tests**

在 `tests/chat/configService.test.ts` 加：

```ts
it('defaults currentCharacter and can apply a character override', async () => {
  const service = new ConfigService(join(dir, 'config.json'), new FakeSecretStore())
  const config = await service.load()
  expect(config.currentCharacter).toBe('mutsumi')

  const save: LLMSettingsSave = {
    baseUrl: 'https://relay.example.com/v1',
    apiKey: '',
    model: 'gpt-4o',
    systemPrompt: '你是千早爱音',
    temperature: 0.7,
    timeoutMs: 10000,
    maxHistory: 10
  }
  const updated = service.applySave(config, save)
  expect(updated.characters['anon']).toMatchObject({ model: 'gpt-4o', systemPrompt: '你是千早爱音' })
})
```

Run to verify it fails (`currentCharacter` undefined).

- [ ] **Step 2: Implement**

`src/shared/chat.ts` 的 `AppConfig` 增补：

```ts
import type { CharacterId } from './characterProfiles'
currentCharacter: CharacterId
characters: Record<CharacterId, { systemPrompt?: string; model?: string }>
```

`src/main/config.ts`：

- `DEFAULT_CONFIG` 增补 `currentCharacter: 'mutsumi'` 与 `characters: {}`。
- `mergeDefaults` 中 `characters` 由 `CHARACTER_PROFILES` 键回填（`normalizeCharacters`）。
- 新增 `effectiveProfile(role)` 返回 `{ systemPrompt, model }`：优先 `characters[role]`，否则档案默认。
- `toView` 用 `effectiveProfile(config.currentCharacter)` 返回 `systemPrompt/model`。
- `applySave` 写入当前角色覆盖：
  ```ts
  const role = config.currentCharacter
  const characterOverrides = {
    ...config.characters,
    [role]: { systemPrompt: save.systemPrompt.trim(), model: save.model.trim() }
  }
  ```
  并返回带 `currentCharacter`、`characters`、`llm` 的新 config。
- `LLMSettingsSave` 与 `LLMSettingsView` 不变（`systemPrompt/model` 语义为“当前角色”）。

> 注意：`applySave` 仍要保留 `setApiKey`、baseUrl 等既有逻辑；只将 `systemPrompt/model` 的来源改为角色覆盖。

- [ ] **Step 3: Run to verify it passes**

Run: `node_modules/.bin/vitest.cmd run tests/chat/configService.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/shared/chat.ts src/main/config.ts tests/chat/configService.test.ts
git commit -m "feat: add per-character config overrides"
```

---

### Task 3: ConversationManager.restore

**Files:**
- Modify: `src/main/chat/conversationManager.ts`
- Test: `tests/chat/conversationManager.test.ts`

**Interfaces:**
- Produces: `restore(messages: ChatMessage[]): void`。

- [ ] **Step 1: Write failing test**

在 `tests/chat/conversationManager.test.ts` 加：

```ts
it('restores history capped by maxHistory', () => {
  const manager = new ConversationManager(2, '系统提示')
  manager.restore([
    { role: 'user', content: 'a' },
    { role: 'assistant', content: 'b' },
    { role: 'user', content: 'c' },
    { role: 'assistant', content: 'd' }
  ])
  expect(manager.size).toBe(2)
  expect(manager.payload()).toEqual([
    { role: 'system', content: '系统提示' },
    { role: 'user', content: 'c' },
    { role: 'assistant', content: 'd' }
  ])
})
```

Run to verify it fails (`restore` is not a function).

- [ ] **Step 2: Implement**

`ConversationManager.restore`：

```ts
restore(messages: ChatMessage[]): void {
  this.messages = messages.slice(-this.maxHistory)
}
```

- [ ] **Step 3: Run to verify it passes**

Run: `node_modules/.bin/vitest.cmd run tests/chat/conversationManager.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/main/chat/conversationManager.ts tests/chat/conversationManager.test.ts
git commit -m "feat: support restoring conversation history"
```

---

### Task 4: JSON MemoryStore

**Files:**
- Create: `src/main/memory/memoryStore.ts`
- Test: `tests/main/memory/memoryStore.test.ts`

**Interfaces:**
- Produces: `MemoryEntry`, `MemoryStore`, `JSONMemoryStore implements MemoryStore`。

- [ ] **Step 1: Write failing test**

`tests/main/memory/memoryStore.test.ts`：

```ts
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { JSONMemoryStore } from '../../src/main/memory/memoryStore'

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
})
```

Run to verify it fails (module missing).

- [ ] **Step 2: Implement**

`src/main/memory/memoryStore.ts`：

```ts
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export interface MemoryEntry {
  role: 'user' | 'assistant'
  content: string
  createdAt: number
}

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
```

Run tests to verify they pass.

- [ ] **Step 3: Commit**

```bash
git add src/main/memory/memoryStore.ts tests/main/memory/memoryStore.test.ts
git commit -m "feat: add json memory store"
```

---

### Task 5: 主进程接线（角色切换、情绪附加、记忆恢复/追加/清空）

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/preload/api.ts`
- Modify: `src/renderer/src/global.d.ts`

**Interfaces:**
- Consumes: `profileForModel`, `characterForModel`, `detectEmotion`, `JSONMemoryStore`, `ConversationManager.restore`。

- [ ] **Step 1: Wire character switching + emotion + memory in index.ts**

导入：

```ts
import { characterForModel, profileForModel, CHARACTER_PROFILES } from '../shared/characterProfiles'
import { detectEmotion } from '../shared/emotion'
import { JSONMemoryStore } from './memory/memoryStore'
```

新增模块级：

```ts
let memoryStore: JSONMemoryStore | null = null
let currentEmotion: string | null = null
```

在 `rebuildChatManager` 中读取 `effectiveProfile(config.currentCharacter)` 的 `systemPrompt/model`，替代直接读 `appConfig.llm`：

```ts
const profile = CONFIG_SERVICE.effectiveProfile(appConfig.currentCharacter)
const conversation = new ConversationManager(
  appConfig.llm.maxHistory,
  profile.systemPrompt
)
const provider = new OpenAICompatibleProvider({ ...model: profile.model ... })
```

（实现时保留 `configService` 的引用即可，或用局部变量。）

在 `handleChatEvent` 的 `complete` 分支：

```ts
if (event.type === 'complete') {
  currentEmotion = detectEmotion(event.message)
  controlWindow?.webContents.send('chat:complete', { ...event, emotion: currentEmotion })
  void memoryStore?.append({ role: 'assistant', content: event.message, createdAt: Date.now() })
  void voiceManager?.speak(event.message, event.requestId)
}
```

同时把 `sendUserMessage` 入口处 append 用户消息到 memory（`chat:send` handler 里 `memoryStore?.append({ role: 'user', content: text })`）。注意避免与 `ChatManager` 内部历史重复：memory 作为跨会话持久层，`chat:complete` 与 `chat:send` 各写用户在/助手各一次。

在 `model:changed` handler：

```ts
ipcMain.on('model:changed', (_event, id: string) => {
  currentModelId = id
  controlWindow?.webContents.send('model:switch', id)
  voiceManager?.setModel(id)
  const role = characterForModel(id)
  if (role !== appConfig?.currentCharacter) {
    if (appConfig) {
      appConfig = { ...appConfig, currentCharacter: role }
      const profile = profileForModel(id)
      appConfig = configService!.applyCharacterDefaults(appConfig, role, profile)
      void configService!.save(appConfig).catch(() => {})
      voiceManager?.setVoice(profile.defaultVoice, undefined)
      rebuildChatManager()
    }
  }
})
```

在 `app.whenReady` 中初始化 memory 并恢复：

```ts
memoryStore = new JSONMemoryStore(join(app.getPath('userData'), 'memory.json'))
const past = await memoryStore.load()
if (past.length > 0) {
  // rebuildChatManager 之后把历史注入 conversation
  chatManager?.restoreConversation(past.map(({ role, content }) => ({ role, content })))
}
```

新增 `ChatManager.restoreConversation(messages)`（或直接在 `rebuildChatManager` 后通过 `conversation.restore` 注入）。为保证单一职责，给 `ChatManager` 加 `restoreConversation(messages)`，内部 `this.conversation.restore(messages)`。（若不想改 ChatManager，可在初始化后直接由 `ConversationManager` 引用注入，但 `index.ts` 不持有 conversation 引用，故加 `ChatManager.restoreConversation`。）

`chat:clear` handler 里 `memoryStore?.clear()`。

`ConfigService.applyCharacterDefaults(role, profile)`：把 `llm.systemPrompt/model` 设为档案默认（用于无覆盖角色），返回新 config。

- [ ] **Step 2: preload / types**

`src/preload/api.ts` 的 `onChatComplete` 事件类型加 `emotion?: string`；`src/renderer/src/global.d.ts` 同步。

- [ ] **Step 3: Build + tests**

Run: `node_modules/.bin/electron-vite.cmd build` 与 `node_modules/.bin/vitest.cmd run`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/main/index.ts src/preload/api.ts src/renderer/src/global.d.ts
git commit -m "feat: wire character profiles, emotion and memory"
```

---

### Task 6: 回归与收尾

- [ ] **Step 1: Run full suite**

Run: `node_modules/.bin/vitest.cmd run`
Expected: all pass.

- [ ] **Step 2: tsc**

Run: `node_modules/.bin/tsc.cmd --noEmit`
Expected: no errors.

- [ ] **Step 3: build**

Run: `node_modules/.bin/electron-vite.cmd build`
Expected: PASS.

- [ ] **Step 4: Commit any missed files**

```bash
git add -A
git commit -m "chore: phase5 profile/memory regression"
```
