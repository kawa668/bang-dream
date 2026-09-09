# Chat Pet Phase 6 Expression Linking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `detectEmotion` 产出的情绪接到 Live2D：回复产生情绪时，宠物播放匹配的表情/动作，并抑制随机动作 8 秒。

**Architecture:** 主进程在 `chat:complete` 时向输出窗口发 `ai:expression`，输出窗口用 `pickExpressionAction(getAvailableActions(), emotion)` 选动作并 `playMotion`。

**Tech Stack:** Electron 37 + electron-vite 3 + TypeScript 5 + Vitest + pixi-live2d-display。

## Global Constraints

- 不新增 npm 依赖。
- 情绪→动作按关键词匹配；`neutral`/无匹配返回 `null` 不打断。
- 情绪动作播放后 `manualActionUntil = now + 8000`。
- 不改 Live2D 核心与 TTS/STT。
- 验证命令：`vitest run`、`tsc --noEmit`、`electron-vite build` 全部通过。

---

### Task 1: pickExpressionAction 纯函数

**Files:**
- Modify: `src/shared/emotion.ts`
- Test: `tests/shared/emotion.test.ts`

**Interfaces:**
- Produces: `pickExpressionAction(actions: string[], emotion: Emotion): string | null`；`emotionLabel(emotion: Emotion): string`。

- [ ] **Step 1: Write failing tests**

在 `tests/shared/emotion.test.ts` 加：

```ts
import { detectEmotion, pickExpressionAction } from '../../src/shared/emotion'

it('picks a matching expression action by emotion', () => {
  expect(pickExpressionAction(['smile01', 'sad01'], 'happy')).toBe('smile01')
  expect(pickExpressionAction(['angry01', 'cry02'], 'sad')).toBe('cry02')
  expect(pickExpressionAction(['thinking01'], 'thinking')).toBe('thinking01')
})

it('returns null for neutral or no match', () => {
  expect(pickExpressionAction(['smile01'], 'neutral')).toBeNull()
  expect(pickExpressionAction(['kime01'], 'excited')).toBeNull()
})
```

Run to verify it fails (`pickExpressionAction` is not a function).

- [ ] **Step 2: Implement**

`src/shared/emotion.ts` 追加：

```ts
const EXPRESSION_KEYWORDS: Record<Exclude<Emotion, 'neutral'>, string[]> = {
  happy: ['smile', 'happy'],
  sad: ['sad', 'cry'],
  excited: ['surprised', 'kandou', 'wink'],
  thinking: ['thinking'],
  calm: ['default', 'idle']
}

export const EMOTION_LABELS: Record<Emotion, string> = {
  neutral: '平静',
  calm: '安静',
  happy: '开心',
  sad: '难过',
  excited: '兴奋',
  thinking: '思考'
}

export function emotionLabel(emotion: Emotion): string {
  return EMOTION_LABELS[emotion]
}

export function pickExpressionAction(actions: string[], emotion: Emotion): string | null {
  if (emotion === 'neutral') return null
  const keywords = EXPRESSION_KEYWORDS[emotion]
  const lower = actions.map((action) => action.toLowerCase())
  for (const keyword of keywords) {
    const index = lower.findIndex((action) => action.includes(keyword))
    if (index >= 0) return actions[index]
  }
  return null
}
```

Run tests to verify they pass.

- [ ] **Step 3: Commit**

```bash
git add src/shared/emotion.ts tests/shared/emotion.test.ts
git commit -m "feat: add emotion to expression action mapping"
```

---

### Task 2: 主进程发送 ai:expression + preload/类型

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/preload/api.ts`
- Modify: `src/renderer/src/global.d.ts`

- [ ] **Step 1: index.ts**

在 `handleChatEvent` 的 `complete` 分支中，在 `chat:complete` 发送之后加：

```ts
outputWindow?.webContents.send('ai:expression', { emotion: currentEmotion })
```

- [ ] **Step 2: preload + types**

`src/preload/api.ts` 在 voice/stt API 附近加：

```ts
onAiExpression: (callback: (payload: { emotion: string }) => void): (() => void) => {
  const listener = (_event: Electron.IpcRendererEvent, payload: { emotion: string }): void => callback(payload)
  ipcRenderer.on('ai:expression', listener)
  return () => ipcRenderer.removeListener('ai:expression', listener)
}
```

`src/renderer/src/global.d.ts` 同步补 `onAiExpression` 类型。

- [ ] **Step 3: Build check**

Run: `node_modules/.bin/electron-vite.cmd build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/main/index.ts src/preload/api.ts src/renderer/src/global.d.ts
git commit -m "feat: emit ai expression to output window"
```

---

### Task 3: 输出窗口播放表情动作

**Files:**
- Modify: `src/renderer/src/main.ts`

- [ ] **Step 1: Implement**

导入 `pickExpressionAction`：

```ts
import { pickExpressionAction } from '../../shared/emotion'
```

在 `window.api.onActionPlay(...)` 之后、`voiceAudio` 处理之前加：

```ts
window.api.onAiExpression(({ emotion }) => {
  const action = pickExpressionAction(renderer.getAvailableActions(), emotion as Parameters<typeof pickExpressionAction>[1])
  if (!action) return
  manualActionUntil = Date.now() + 8000
  renderer.playMotion(action)
  window.api.reportStatus(`情绪动作：${action}`)
})
```

> 使用 `as` 断言只为了把 `string` 收窄为 `Emotion`；也可在 `shared` 用 `isEmotion` 校验。

- [ ] **Step 2: Build + tests**

Run: `node_modules/.bin/electron-vite.cmd build` 与 `node_modules/.bin/vitest.cmd run`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/main.ts
git commit -m "feat: play live2d expression from ai emotion"
```

---

### Task 4: 回归与收尾

- [ ] **Step 1: Full suite**

Run: `node_modules/.bin/vitest.cmd run`
Expected: all pass.

- [ ] **Step 2: tsc + build**

Run: `node_modules/.bin/tsc.cmd --noEmit` 与 `node_modules/.bin/electron-vite.cmd build`
Expected: PASS.

- [ ] **Step 3: Commit any missed files**

```bash
git add -A
git commit -m "chore: phase6 expression regression"
```
