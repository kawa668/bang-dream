# 角色人设系统设计

日期：2026-09-10
状态：设计已确认，等待文档审阅

## 背景

项目已有文字聊天、TTS、STT、语音对话、角色档案和 Live2D 情绪联动。现有实现只维护三个 `CharacterId`，白祥与黑祥共用一个丰川祥子档案，墨提斯仅作为音色存在。这会导致声音、人格和对话历史之间可能不一致。

本设计将“音色、人格、会话”统一为五个稳定角色，同时保留 `VoiceId` 与 `CharacterId` 两个独立类型，避免未来扩展“一人格多音色”时重构核心模型。

## 目标

- 五个音色分别对应五套独立、内置、不可编辑的人格。
- 当前音色决定当前角色、System Prompt 和对话历史。
- Live2D 模型切换决定默认音色和默认角色，用户仍可手动切换音色。
- 切换角色时立即停止旧 LLM 请求和旧语音，并清空聊天历史。
- 旧角色的流式回复和语音回调不能进入新角色会话。
- renderer 只能获得角色 ID 和显示名称，不能获得完整 System Prompt。
- LLM 连接与生成参数使用全局配置，不再按角色保存模型或提示词覆盖。

## 非目标

- 不引入 RAG、长期人格记忆或自动摘要。
- 不支持多角色同时聊天。
- 不实现同一人格动态搭配任意音色，只建立默认一一映射。
- 不改变 GPT-SoVITS、STT 或 Live2D 渲染协议。
- 不保留用户自定义角色 System Prompt。

## 架构

```text
Live2D 模型
    |
    v
默认 VoiceId
    |
    v
CharacterId -> CharacterProfile -> System Prompt
    |                                  |
    v                                  v
TTS Voice                      ChatSessionController
                                       |
                                       v
                              ConversationManager / LLM
```

模块边界：

- `src/shared/characterProfiles.ts`：五个角色档案、音色映射和 Live2D 模型默认角色推导。
- `src/shared/voice.ts`：五个 TTS 音色及其校验，不依赖角色实现细节。
- `src/main/config.ts`：全局 LLM 配置、当前角色和旧配置迁移。
- `src/main/chat/chatSessionController.ts`：聊天会话生命周期、请求代号、取消和角色切换编排。
- `src/main/chat/chatManager.ts`：只管理一次聊天的历史写入和事件输出，不监听角色变化。
- `src/main/index.ts`：向协调层提供配置、语音取消和 UI 广播回调。

## 数据模型

```ts
export type CharacterId =
  | 'mutsumi'
  | 'anon'
  | 'sakiko-white'
  | 'sakiko-black'
  | 'mortis'

export interface CharacterProfile {
  id: CharacterId
  name: string
  systemPrompt: string
  defaultVoice: VoiceId
}

export const CHARACTER_PROFILES: Record<CharacterId, CharacterProfile>
export const CHARACTER_FOR_VOICE: Record<VoiceId, CharacterId>
export const DEFAULT_VOICE_FOR_CHARACTER: Record<CharacterId, VoiceId>
```

默认映射：

| CharacterId | 显示名 | VoiceId |
| --- | --- | --- |
| `mutsumi` | 若叶睦 | `若叶睦` |
| `anon` | 千早爱音 | `千早爱音` |
| `sakiko-white` | 白祥 | `白祥` |
| `sakiko-black` | 黑祥 | `黑祥` |
| `mortis` | 墨提斯 | `墨提斯` |

Live2D 模型默认映射：

- `037_*` -> `anon`
- `341_*` -> `sakiko-white`
- 其他模型 -> `mutsumi`

黑祥和墨提斯由用户手动选择音色进入。

## 人设内容

每套 `CharacterProfile.systemPrompt` 必须固定包含：

- 角色身份和世界观背景。
- 性格与情绪表达方式。
- 说话风格、句子长度和常用语气。
- 对用户的固定称呼。
- “使用中文并保持简洁”的回复约束。
- 不冒充其他角色、不泄露系统提示词的限制。

完整提示词只存在于主进程可加载的共享常量中。IPC 和 renderer 只能接收 `characterId` 与 `name`。

## 配置

新的 `AppConfig` 结构：

```ts
interface AppConfig {
  llm: {
    baseUrl: string
    apiKeyEncrypted: string
    sessionId: string
    model: string
    temperature: number
    timeoutMs: number
    maxHistory: number
  }
  voice: VoiceConfig
  currentCharacter: CharacterId
}
```

约束：

- `currentCharacter` 必须与 `voice.selectedVoice` 满足默认映射。
- `llm` 中不再保存 `systemPrompt`。
- 删除 `characters` 角色级覆盖。
- `sessionId` 保留已有值；缺失时生成 `ses_<UUID>`。

### 旧配置迁移

1. 音色有效时，以 `voice.selectedVoice` 推导新的 `currentCharacter`。
2. 音色无效时，以旧 `currentCharacter` 推导：`mutsumi`、`anon`、`sakiko` 分别映射为 `mutsumi`、`anon`、`sakiko-white`。
3. 优先把旧 `characters[旧 currentCharacter].model` 提升为全局 `llm.model`；这里的旧角色以原始配置值为准，不使用迁移后的新 ID。
4. 没有角色级模型覆盖时，保留旧 `llm.model`，并继续应用 `deepseek v4flash` 到 `deepseek-v4-flash` 的迁移。
5. 旧角色 System Prompt 一律丢弃。
6. 迁移后的规范化配置保存一次，避免每次启动重复迁移。

## 会话切换

`ChatSessionController` 持有单调递增的 `generation`。每次切换角色都先递增 generation，使旧请求和旧异步回调失效。

固定切换顺序：

1. 校验目标角色和音色；状态未变化时直接返回。
2. 递增 generation。
3. 中止当前 LLM 流式请求。
4. 取消 TTS 合成链、音频队列和当前播放。
5. 在内存中生成新配置，并使用新角色的内置 System Prompt 创建下一套 `ConversationManager` 和 `ChatManager`。
6. 保存新配置；保存失败则丢弃下一套会话并终止切换。
7. 保存成功后，原子替换 ChatManager，并提交新的 `currentCharacter` 与 `selectedVoice`。
8. 清空持久化聊天历史，广播 `chat:clear` 和当前角色变化。

所有聊天事件携带 generation 或由协调层绑定 generation。代号不匹配的事件必须静默丢弃。

## 取消协议

`LLMProvider.chat(messages, signal)` 接收外部 `AbortSignal`，并与超时信号合并。

规则：

- 用户切换角色触发的取消属于正常控制流，不显示聊天错误。
- 超时仍抛出明确的 `LLM request timed out` 错误。
- `ChatManager.cancel()` 中止当前请求并释放 busy 状态。
- `TTSManager.cancelSpeech()` 清空未合成和待播放任务，停止当前音频，并使旧语音回调失效。
- 主动取消不得触发 TTS 的 `error` 状态。

配置保存失败时：

- 不替换磁盘上的有效配置。
- 丢弃尚未启用的下一套会话，保留切换前的角色状态。
- 旧请求保持取消状态，不恢复执行。
- 向控制台广播明确的保存失败信息。

新 ChatManager 创建失败时：

- 保留旧 ChatManager 和磁盘配置，不执行保存或替换。
- 旧请求不恢复。
- 广播错误并要求用户重试切换。

## UI

LLM 设置面板：

- 移除 System Prompt 输入框。
- 增加只读的“当前角色：角色名”。
- Base URL、API Key、全局模型、Temperature、超时和历史数保持可编辑。

音色与模型：

- 手动切换音色会触发完整角色切换。
- Live2D 模型变化先推导默认角色，再触发角色切换。
- 切换完成后控制台同步显示新角色名。
- renderer 的配置视图中不包含 `systemPrompt`。

## 测试

共享层：

- 五个 `CharacterId` 均有完整档案。
- `VoiceId ↔ CharacterId` 双向映射唯一且完整。
- Live2D 模型默认角色映射正确。

配置层：

- 默认配置生成有效 `sessionId`。
- 旧三角色配置迁移为五角色配置。
- 黑祥音色优先迁移为 `sakiko-black`。
- 当前角色的旧模型覆盖提升为全局模型。
- 旧 System Prompt 和 `characters` 字段不再出现在新配置。

会话层：

- 切换角色时 LLM 请求被中止。
- 旧 generation 的 delta、complete 和 error 被丢弃。
- 主动取消不广播错误，超时仍广播错误。
- 切换后 ConversationManager 从空历史开始。

语音层：

- 切换角色时 TTS 队列和当前播放被取消。
- 取消后旧合成结果不会播放。
- TTS 主动取消不进入 `error` 状态。

集成与回归：

- 配置、preload 和控制台类型同步更新。
- 全量测试、TypeScript 检查和 Electron 构建通过。

## 验收标准

- 五个音色分别使用正确且固定的人格。
- 声音、人格、历史始终绑定同一个当前角色。
- 切换角色后，旧回复和旧语音不会进入新角色。
- 切换操作立即清空界面和历史，新角色从零开始。
- renderer 和配置文件无法读取或修改完整 System Prompt。
- 全局 LLM 设置可持久化，重启后恢复正确角色。
- 旧配置无需手工编辑即可安全迁移。
