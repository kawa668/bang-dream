# Chat Pet Phase 4 Voice Dialog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 打通“按住说话 → 识别 → 自动发送 → LLM 流式回复 → 自动 TTS 朗读”的完整语音对话闭环，通过“语音对话”开关控制自动发送与否。

**Architecture:** 改动集中在配置、TTSManager 状态与渲染编排；`chat:complete → TTSManager.speak` 已接通，闭环无需改主进程编排逻辑，仅新增一个配置项与一个状态字段。

**Tech Stack:** Electron 37 + electron-vite 3 + TypeScript 5 + Vitest。

## Global Constraints

- 不新增 npm 依赖。
- 所有相关 IPC 带 `requestId`（既有约定）。
- `voiceConversationEnabled` 默认 `false`（语音对话开关默认关闭）。
- 开启“语音对话”时若“语音回复”未开则自动开启；关闭“语音对话”不自动关闭语音回复。
- 语音对话关闭时 STT 结果只回填输入框；开启时自动发送。
- Phase 4 不做：语音打断、Wake Word、VAD 自动分段、Live2D 联动、多角色/记忆。
- 验证命令：`vitest run`、`tsc --noEmit`、`electron-vite build` 全部通过。

---

### Task 1: voice 状态与配置字段

**Files:**
- Modify: `src/shared/voice.ts`
- Modify: `src/shared/chat.ts`
- Modify: `src/main/config.ts`
- Test: `tests/chat/configService.test.ts`

**Interfaces:**
- Produces: `VoiceStateView.voiceConversationEnabled: boolean`；`VoiceConfig.voiceConversationEnabled: boolean`。

- [ ] **Step 1: Write failing test**

在 `tests/chat/configService.test.ts` 的 `returns defaults when config file is missing` 中加：

```ts
expect(config.voice.voiceConversationEnabled).toBe(false)
```

Run to verify it fails (`undefined`).

- [ ] **Step 2: Add shared types**

`src/shared/voice.ts` 的 `VoiceStateView` 增补：

```ts
voiceConversationEnabled: boolean
```

`src/shared/chat.ts` 的 `VoiceConfig` 增补：

```ts
voiceConversationEnabled: boolean
```

- [ ] **Step 3: Extend config**

`src/main/config.ts` 的 `DEFAULT_CONFIG.voice` 增补：

```ts
voiceConversationEnabled: false
```

`normalizeVoice` 增补：

```ts
voiceConversationEnabled: typeof source.voiceConversationEnabled === 'boolean'
  ? source.voiceConversationEnabled
  : DEFAULT_CONFIG.voice.voiceConversationEnabled
```

`applyVoiceConfig` 的 `changes` 类型扩展为 `{ enabled?: boolean; selectedVoice?: VoiceId; voiceConversationEnabled?: boolean }`，并透传该字段。同时给 `tests/voice/ttsManager.test.ts` 的 `voiceConfig` 补 `voiceConversationEnabled: false`。

- [ ] **Step 4: Run to verify it passes**

Run: `node_modules/.bin/vitest.cmd run tests/chat/configService.test.ts tests/voice/ttsManager.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/voice.ts src/shared/chat.ts src/main/config.ts tests/chat/configService.test.ts tests/voice/ttsManager.test.ts
git commit -m "feat: add voice conversation config and state"
```

---

### Task 2: TTSManager 暴露与持久化 voiceConversationEnabled

**Files:**
- Modify: `src/main/voice/ttsManager.ts`
- Test: `tests/voice/ttsManager.test.ts`

- [ ] **Step 1: Write failing tests**

在 `tests/voice/ttsManager.test.ts` 加：

```ts
it('exposes and persists voiceConversationEnabled', async () => {
  const provider = new FakeProvider()
  const launcher = new FakeLauncher()
  const { manager, persisted } = createManager(provider, launcher)

  expect(manager.stateMessage().state.voiceConversationEnabled).toBe(false)
  manager.setVoiceConversation(true, 'req-dialog')

  expect(manager.stateMessage().state.voiceConversationEnabled).toBe(true)
  expect(persisted.at(-1)).toMatchObject({ voiceConversationEnabled: true })
})
```

同时把 `createManager` 中 `persisted` 的类型改为 `Array<{ enabled?: boolean; selectedVoice?: string; voiceConversationEnabled?: boolean }>`。

Run to verify it fails (`voiceConversationEnabled` undefined).

- [ ] **Step 2: Implement**

`src/main/voice/ttsManager.ts`：

- 构造函数增加 `this.voiceConversationEnabled = options.voiceConfig.voiceConversationEnabled`。
- `stateMessage()` 的 `state` 增补 `voiceConversationEnabled: this.voiceConversationEnabled`。
- 新增方法：

```ts
setVoiceConversation(enabled: boolean, requestId?: string): void {
  if (this.voiceConversationEnabled === enabled) return
  this.voiceConversationEnabled = enabled
  this.persist({ enabled: this.enabled, selectedVoice: this.selectedVoice, voiceConversationEnabled: enabled })
  this.emitState()
}
```

- 更新 `TTSManagerOptions['persist']` 类型为 `(changes: { enabled?: boolean; selectedVoice?: VoiceId; voiceConversationEnabled?: boolean }) => void`。注意 `persist` 现有的调用传 `{ enabled, selectedVoice }`，类型兼容。

- [ ] **Step 3: Run to verify it passes**

Run: `node_modules/.bin/vitest.cmd run tests/voice/ttsManager.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/main/voice/ttsManager.ts tests/voice/ttsManager.test.ts
git commit -m "feat: persist and expose voice conversation toggle"
```

---

### Task 3: 主进程 voice:set-conversation IPC

**Files:**
- Modify: `src/main/index.ts`

- [ ] **Step 1: Add IPC handler**

在 `src/main/index.ts` 的 `voice:set-voice` handler 附近加入：

```ts
ipcMain.on('voice:set-conversation', (_event, payload: {
  requestId: string
  enabled: boolean
}) => {
  if (!payload?.requestId) return
  if (!configService || !appConfig) return
  appConfig = configService.applyVoiceConfig(appConfig, {
    enabled: appConfig.voice.enabled,
    selectedVoice: appConfig.voice.selectedVoice,
    voiceConversationEnabled: Boolean(payload.enabled)
  })
  void configService.save(appConfig).catch(() => {})
  voiceManager?.setVoiceConversation(Boolean(payload.enabled), payload.requestId)
})
```

- [ ] **Step 2: Build check**

Run: `node_modules/.bin/electron-vite.cmd build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/main/index.ts
git commit -m "feat: wire voice conversation toggle ipc"
```

---

### Task 4: preload、类型与控制台 UI

**Files:**
- Modify: `src/preload/api.ts`
- Modify: `src/renderer/src/global.d.ts`
- Modify: `src/renderer/control.html`
- Modify: `src/renderer/src/control.ts`

- [ ] **Step 1: preload + types**

`src/preload/api.ts` 在 `onVoiceState` 附近加入：

```ts
setVoiceConversation: (requestId: RequestId, enabled: boolean): void => {
  ipcRenderer.send('voice:set-conversation', { requestId, enabled })
}
```

`src/renderer/src/global.d.ts` 同步补 `setVoiceConversation` 类型。

- [ ] **Step 2: control.html**

在“语音”区 `#voice-enabled` 的 `label.switch` 后，新增一个同级 `label.switch`：

```html
<label class="switch">
  <input id="voice-conversation" type="checkbox" />
  <span class="switch-track" aria-hidden="true"></span>
  <span class="switch-label">语音对话</span>
</label>
```

- [ ] **Step 3: control.ts**

新增 query 与同步：

```ts
const voiceConversation = document.querySelector<HTMLInputElement>('#voice-conversation')
```

`applyVoiceState` 内同步：

```ts
if (voiceConversation && voiceConversation.checked !== state.voiceConversationEnabled) {
  voiceConversation.checked = state.voiceConversationEnabled
}
```

新增 change 事件：

```ts
voiceConversation?.addEventListener('change', () => {
  const enabled = voiceConversation.checked
  window.api.setVoiceConversation(createRequestId('voice-conversation'), enabled)
  if (enabled && voiceEnabled && !voiceEnabled.checked) {
    window.api.setVoiceEnabled(createRequestId('voice-enabled'), true)
  }
})
```

`onSttResult` 改为：

```ts
window.api.onSttResult((event) => {
  if (voiceConversation?.checked) {
    if (chatInput) chatInput.value = ''
    window.api.sendChatMessage(createRequestId('chat'), event.text)
  } else if (chatInput) {
    chatInput.value = event.text
    chatInput.focus()
  }
})
```

> 注意：`voiceConversation?.checked` 在渲染进程是即时状态，主进程持久化后也会经 `voice:state` 回填，保持同步。

- [ ] **Step 4: Build check**

Run: `node_modules/.bin/electron-vite.cmd build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/preload/api.ts src/renderer/src/global.d.ts src/renderer/control.html src/renderer/src/control.ts
git commit -m "feat: add voice dialog toggle and auto send"
```

---

### Task 5: 回归与收尾

- [ ] **Step 1: Run full tests**

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
git commit -m "chore: phase4 voice dialog regression"
```
