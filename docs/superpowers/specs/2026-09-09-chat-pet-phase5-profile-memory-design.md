# Chat Pet Phase 5 CharacterProfile / AIState / Memory 设计

日期：2026-09-09
状态：确认方向，进入实施

## 背景

Phase 1-4 已完成文字聊天、TTS、STT、语音对话闭环。当前 `systemPrompt` 与 `model` 仍是全局配置，对话历史只在内存；没有角色抽象、没有 AI 情绪状态、没有跨会话记忆。Phase 5 聚焦“接口抽象 + 最小实现”，为 Phase 6（Live2D 联动）铺路。

## 已确认的产品决策

- 角色档案用现有角色：`若叶睦 / 千早爱音 / 丰川祥子`（音色侧已有墨提斯，作为音色映射；不做独立角色档案）。
- 切换 Live2D 角色时自动应用该角色的默认 `systemPrompt / model / defaultVoice`；LLM 设置面板保留为“对当前角色的覆盖”。
- AI 状态按“情绪状态探测”理解，`detectEmotion(text)` 为纯函数，在 `chat:complete` 时把情绪附加到事件，供控制台显示与 Phase 6 联动。Phase 5 只记录，不改 Live2D。
- 记忆接口提供 JSON 文件实现，持久化会话，支持跨会话恢复与清空。Phase 5 不做 RAG、语义检索、摘要生成。
- 不改 `LLMProvider`、不动 Live2D、不动 TTS/STT 链路。

## 架构

```text
shared/characterProfiles.ts   角色档案表 + characterForModel/profileForModel
shared/emotion.ts             情绪类型 + detectEmotion
main/memory/memoryStore.ts    MemoryStore 接口 + JSONMemoryStore
main/config.ts                增加 currentCharacter + characters 覆盖
main/index.ts                 角色切换应用档案、chat:complete 附加情绪、记忆接线
```

## 内容

### CharacterProfile

`src/shared/characterProfiles.ts`：

```ts
export type CharacterId = 'mutsumi' | 'anon' | 'sakiko'

export interface CharacterProfile {
  id: CharacterId
  name: string
  systemPrompt: string
  model: string
  defaultVoice: VoiceId
}

export const CHARACTER_PROFILES: Record<CharacterId, CharacterProfile>

export function characterForModel(modelId: string): CharacterId
export function profileForModel(modelId: string): CharacterProfile
```

- `characterForModel`：`341_*` → `sakiko`，`037_*` → `anon`，其余 → `mutsumi`。
- `characterForModel` 复用 `getCharacter` 输出映射，避免与现有角色分类不同步（实现时可用 `getCharacter(modelId)` 的返回值做映射）。

### 配置

`AppConfig` 新增：

```ts
currentCharacter: CharacterId
characters: Record<CharacterId, { systemPrompt?: string; model?: string }>
```

- `characters` 是“对当前角色 systemPrompt/model 的用户覆盖”；未覆盖时用档案默认。
- `DEFAULT_CONFIG`：`currentCharacter: 'mutsumi'`；`characters` 由 `CHARACTER_PROFILES` 派生为 `Record<CharacterId, {}>`（无覆盖）。
- `normalizeCharacters`：按 `CHARACTER_PROFILES` key 回填缺失项。
- `effectiveProfile(role)`：`characters[role]` 有值时覆盖档案默认，否则档案默认；用于 `toView`、`applySave`、`rebuildChatManager`。
- `applySave`：把保存的 `systemPrompt/model` 写入**当前角色**的 `characters` 覆盖，同时更新 `llm.systemPrompt/model`。
- `toView`：返回当前角色生效的 `systemPrompt/model`。

### 角色切换

主进程 `model:changed`：

1. `const role = characterForModel(id)`；若与 `currentCharacter` 不同：
2. `appConfig.currentCharacter = role`。
3. 用 `effectiveProfile(role)` 更新 `llm.systemPrompt/model`，`configService.save`。
4. 重建 `ChatManager`（新的 systemPrompt/model）。
5. `voiceManager.setModel(id)`（既有音色联动）+ 用 `profile.defaultVoice` 确保音色为角色默认。

### AIState

`src/shared/emotion.ts`：

```ts
export type Emotion = 'neutral' | 'calm' | 'happy' | 'sad' | 'excited' | 'thinking'
export function detectEmotion(text: string): Emotion
```

- `detectEmotion` 用关键词/规则映射（如“开心/哈哈/太棒了”→`happy`，“难过/对不起/哭”→`sad`，“？/思考/嗯”→`thinking`，“！/好耶”→`excited`，默认 `neutral`）。
- 主进程 `handleChatEvent` 的 `complete` 分支：`const emotion = detectEmotion(event.message)`，把 `emotion` 附加到发送给控制台的 `chat:complete` payload；同时记录到内存变量供查询。
- `preload` 的 `onChatComplete` 事件类型增加可选 `emotion`；控制台暂只接收不展示（Phase 6 联动）。

### Memory

`src/main/memory/memoryStore.ts`：

```ts
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

export class JSONMemoryStore implements MemoryStore
```

- `JSONMemoryStore(filePath)`：`load` 读取 JSON（缺省返回 `[]`），`append` 追加并写回，`clear` 清空并写 `[]`。
- 主进程接线：启动时 `memoryStore.load()` 恢复 `ConversationManager` 历史（`restore`）；每次 `chat:complete` 追加 user/assistant 到 memory；`chat:clear` 一起清空 memory。
- `ConversationManager` 新增 `restore(messages)`：把历史注入 `messages`（受 `maxHistory` 裁剪）。

## 文件改动清单

新增：

- `src/shared/characterProfiles.ts`
- `src/shared/emotion.ts`
- `src/main/memory/memoryStore.ts`
- `tests/shared/emotion.test.ts`
- `tests/main/memory/memoryStore.test.ts`
- `tests/shared/characterProfiles.test.ts`

修改：

- `src/shared/chat.ts`：`AppConfig` 增补 `currentCharacter`、`characters`。
- `src/main/config.ts`：默认值、`normalizeCharacters`、`effectiveProfile`、`applySave`、`toView`。
- `src/main/chat/conversationManager.ts`：`restore`。
- `src/main/index.ts`：角色切换应用档案、`chat:complete` 附加情绪、memory 接线。
- `src/renderer/src/global.d.ts`、`src/preload/api.ts`：`onChatComplete` 事件加可选 `emotion`。
- `tests/chat/configService.test.ts`：新增字段断言。
- `tests/chat/conversationManager.test.ts`：`restore` 行为。

## 测试与验收

单元测试：

- `characterProfiles`：`characterForModel` 三类映射、`profileForModel` 返回对应档案默认。
- `emotion`：`detectEmotion` 若干关键词 → 情绪映射。
- `JSONMemoryStore`：缺省空、append/load/clear 往返。
- `ConversationManager.restore`：注入历史并按 `maxHistory` 裁剪。
- `ConfigService`：`currentCharacter` 默认、`characters` 覆盖读写、`applySave` 写入当前角色覆盖。

验证命令：

- `node_modules/.bin/vitest.cmd run`
- `node_modules/.bin/tsc.cmd --noEmit`
- `node_modules/.bin/electron-vite.cmd build`

手动冒烟：

1. 默认当前角色为睦，LLM 设置面板显示该角色生效的 systemPrompt/model。
2. 切换到千早爱音模型，面板与回复系统提示变为爱音角色档案默认，音色自动变为千早爱音。
3. 编辑 systemPrompt/model 保存后，切走的角色再切回仍保留该角色的覆盖值。
4. 重启应用后对话历史从 memory 恢复；清空会话后 memory 同步清空。
5. 语音对话/文字聊天流程不受影响。

## Phase 5 不做

- 不做 Live2D 表情/动作联动（Phase 6）。
- 不做 RAG、语义检索、自动摘要。
- 不做 Wake Word、多 Agent。
- 不引入数据库；记忆用 JSON 文件。
