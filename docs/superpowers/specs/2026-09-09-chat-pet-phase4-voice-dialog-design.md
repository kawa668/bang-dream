# Chat Pet Phase 4 完整语音对话设计

日期：2026-09-09
状态：确认方向，进入实施

## 背景

Phase 1 完成文字聊天，Phase 2 完成 TTS 语音回复（文字进、语音出），Phase 3 完成 STT 语音输入（语音进、文字出）。当前开始 Phase 4，把两者串成完整闭环：

```text
按住说话 → STT 转文字 → 自动发送给 LLM → 流式回复 → 自动 TTS 朗读
```

Phase 4 只补“闭环”。不实现语音打断（说话时中断正在朗读的回复）、不做 Wake Word、不做 VAD 自动分段、不做 Live2D 口型/情绪/动作联动（Phase 6）、不做多角色与长期记忆（Phase 5）。

## 已确认的产品决策

- 控制台“语音”区新增“语音对话”开关（默认关闭）。
- 开启“语音对话”：STT 识别结果**自动发送**给 `ChatManager`（不再只填入输入框）；若“语音回复”尚未开启，则自动开启（否则回复无法朗读）。
- 关闭“语音对话”：恢复 Phase 3 行为，STT 识别结果只填入聊天输入框。
- “开启语音对话时自动开启语音回复”；关闭语音对话**不**自动关闭语音回复，二者按用户当前状态各自保持。
- 识别结果为空、麦克风权限被拒、TTS 启动失败：只走既有状态/错误路径，不影响下一步对话。
- 现有 `chat:complete → TTSManager.speak` 链路已接通，主进程编排无需改闭环，只新增一个配置项与一个状态字段。

## 架构

改动集中在“配置 + 渲染编排 + 一个状态字段”，不动 Phase 1-3 的模块边界：

```text
控制台
├── “语音对话”开关
├── STT 识别结果 →
│     开：sendChatMessage(text)          （自动发送）
│     关：chatInput.value = text          （回填）
└── 开关打开时若语音回复未开 → 自动 setVoiceEnabled(true)

主进程
├── voice:set-conversation  保存 voiceConversationEnabled 并广播状态
└── VoiceStateView 增补 voiceConversationEnabled，供控制台初始化/同步
```

## 内容

### 配置扩展

`userData/config.json` 的 `voice` 新增：

```json
{
  "voice": {
    "voiceConversationEnabled": false,
    "enabled": false,
    "selectedVoice": "若叶睦"
  }
}
```

- `voiceConversationEnabled`：语音对话总开关，默认 `false`。
- 旧配置缺省回填默认值；与 TTS 的 `enabled`、`selectedVoice` 相互独立。

### 共享类型

`src/shared/voice.ts` 的 `VoiceStateView` 增补：

```ts
export interface VoiceStateView {
  enabled: boolean
  selectedVoice: VoiceId
  modelId: string | null
  runtimeState: VoiceRuntimeState
  voiceConversationEnabled: boolean
  message?: string
}
```

`src/shared/chat.ts` 的 `VoiceConfig` 增补 `voiceConversationEnabled: boolean`。

### 主进程

- `config.ts`：`DEFAULT_CONFIG.voice` 加 `voiceConversationEnabled: false`；`normalizeVoice` 归一化；`applyVoiceConfig` 接受 `voiceConversationEnabled?: boolean`。
- `ttsManager.ts`：新增字段 `voiceConversationEnabled`；`stateMessage()` 返回该字段；新增 `setVoiceConversation(enabled, requestId?)`，更新并 `persist`、广播 `voice:state`。`TTSManagerOptions['persist']` 类型扩展为 `(changes: { enabled?: boolean; selectedVoice?: VoiceId; voiceConversationEnabled?: boolean }) => void`。
- `index.ts`：新增 IPC `voice:set-conversation`，主进程先 `applyVoiceConfig` 保存，再调 `voiceManager.setVoiceConversation` 广播状态。

### preload / 全局类型

- `src/preload/api.ts` 新增 `setVoiceConversation(requestId, enabled)`。
- `src/renderer/src/global.d.ts` 同步补方法类型。

### 控制台 UI

- `control.html`“语音”区新增开关 `#voice-conversation`，标签“语音对话”。
- `control.ts`：
  - `applyVoiceState` 同步 `#voice-conversation` 的勾选态。
  - `#voice-conversation` 的 `change` 事件调用 `setVoiceConversation`；当开启且语音回复未开时，同时 `setVoiceEnabled(true)`。
  - `onSttResult`：若语音对话开启，直接 `sendChatMessage`（新 `requestId`）；否则回填输入框。

## 数据流

```text
开启语音对话 + 开启语音回复
按住说话 → getUserMedia / MediaRecorder → stt:transcribe
→ STTManager → FasterWhisperProvider → asr_api.py → text
→ stt:result → 控制台：语音对话开 → chat:send → ChatManager → 流式回复
→ chat:complete → TTSManager.speak → AudioPlayer 播放
```

关闭语音对话时 `stt:result` 只回填输入框，不自动发送。

## 文件改动清单

新增：

- `docs/superpowers/specs/2026-09-09-chat-pet-phase4-voice-dialog-design.md`

修改：

- `src/shared/voice.ts`：`VoiceStateView` 增补 `voiceConversationEnabled`。
- `src/shared/chat.ts`：`VoiceConfig` 增补字段。
- `src/main/config.ts`：默认值、归一化、`applyVoiceConfig` 扩展。
- `src/main/voice/ttsManager.ts`：状态字段、`stateMessage`、`setVoiceConversation`、`persist` 类型。
- `src/main/index.ts`：`voice:set-conversation` IPC。
- `src/preload/api.ts`、`src/renderer/src/global.d.ts`：`setVoiceConversation`。
- `src/renderer/control.html`、`src/renderer/src/control.ts`：开关与自动发送逻辑。
- `tests/chat/configService.test.ts`：默认值/迁移断言。
- `tests/voice/ttsManager.test.ts`：`voiceConfig` 补字段 + `setVoiceConversation` 行为断言。

## 测试与验收

单元测试：

- `ConfigService`：`voiceConversationEnabled` 默认 `false`，旧配置缺省回填。
- `TTSManager`：`stateMessage` 暴露 `voiceConversationEnabled`；`setVoiceConversation` 更新状态并触发 `persist`。

验证命令：

- `node_modules/.bin/vitest.cmd run`
- `node_modules/.bin/tsc.cmd --noEmit`
- `node_modules/.bin/electron-vite.cmd build`

手动冒烟：

1. 默认语音对话关闭，按住说话识别后文字回填输入框、不自动发送。
2. 打开“语音对话”，待语音回复自动开启后，按住说话识别结果自动发送并得到文字+语音回复。
3. 关闭“语音对话”，恢复回填行为；语音回复保持原状态。
4. 语音识别失败/权限拒绝不影响后续手动聊天。

## Phase 4 不做

- 不做语音打断（说话时中断正在朗读的回复）。
- 不做 Wake Word、VAD 自动分段。
- 不做 Live2D 口型、情绪或动作联动（Phase 6）。
- 不做多角色系统、长期记忆或 RAG（Phase 5）。
- 不引入 CharacterProfile 抽象。
