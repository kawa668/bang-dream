# Chat Pet Phase 6 AI 状态与 Live2D 动作/表情联动设计

日期：2026-09-09
状态：确认方向，进入实施

## 背景

Phase 1-5 已完成文字聊天、TTS、STT、语音对话、CharacterProfile/情绪探测/记忆。当前主进程在 `chat:complete` 时已由 `detectEmotion` 产出情绪，但尚未驱动 Live2D。Phase 6 把该情绪接到 Live2D 表情/动作：聊天回复产生情绪后，宠物播放对应的表情动作。

## 已确认的产品决策

- 依据主设计：Phase 6 为“AI 状态与 Live2D 动作/表情联动”。
- 情绪→动作采用关键词匹配：在**当前模型可用的动作**（`getAvailableActions()`）里挑选包含匹配关键词的第一个动作，无匹配则不打断。
- 情绪动作播放后同样抑制随机动作 8 秒（与人手点选动作一致）。
- 控制台不新增专门情绪面板；`chat:complete` 已携带 `emotion`，可在后续复用。Phase 6 只做 Live2D 联动。
- 不改 Live2D 渲染逻辑核心，只新增一个“按情绪挑动作并播放”的钩子。

## 情绪→动作匹配规则

`shared/emotion.ts` 新增纯函数：

```ts
export function pickExpressionAction(actions: string[], emotion: Emotion): string | null
```

匹配关键词（动作名小写包含即命中，取第一个）：

- `happy` → `smile`, `happy`
- `sad` → `sad`, `cry`
- `excited` → `surprised`, `kandou`, `wink`
- `thinking` → `thinking`
- `calm` → `default`, `idle`（命中则用，但一般随机/默认无动作）
- `neutral` → 无（返回 null）

无匹配或 `neutral` 返回 `null`，不播放、不打断。

## 架构

```text
ChatManager / chat:complete
  → detectEmotion(text) → emotion
  → index.ts: outputWindow.webContents.send('ai:expression', { emotion })
  → 输出窗口 renderer main.ts: onAiExpression
      → pickExpressionAction(getAvailableActions(), emotion)
      → renderer.playMotion(action)  +  manualActionUntil = now + 8000
```

`handleChatEvent` 的 `complete` 分支已计算 `currentEmotion`；在此分支额外向输出窗口发送 `ai:expression`。控制台已有的 `chat:complete`（带 emotion）不变。

## 文件改动清单

修改：

- `src/shared/emotion.ts`：新增 `pickExpressionAction`、`emotionLabel`。
- `src/main/index.ts`：`complete` 分支向输出窗口发送 `ai:expression`。
- `src/preload/api.ts`、`src/renderer/src/global.d.ts`：新增 `onAiExpression`。
- `src/renderer/src/main.ts`：监听 `ai:expression`，挑选动作并播放。
- `tests/shared/emotion.test.ts`：`pickExpressionAction` 行为。

## 测试与验收

单元测试：

- `pickExpressionAction(['smile01','sad01'],'happy')` → `'smile01'`；`[...],'neutral'` → `null`；无匹配 → `null`。

验证命令：

- `node_modules/.bin/vitest.cmd run`
- `node_modules/.bin/tsc.cmd --noEmit`
- `node_modules/.bin/electron-vite.cmd build`

手动冒烟：

1. 发送消息让回复包含“开心/哈哈”，观察宠物播放 `smile` 类表情动作。
2. 回复含“难过/对不起”，播放 `sad/cry` 动作。
3. 回复含“嗯/想想”，播放 `thinking` 动作。
4. 情绪为 `neutral` 时不打断、不播放。
5. 播放情绪动作后 8 秒内暂停随机动作。

## Phase 6 不做

- 不做口型同步（唇形不随语音）。
- 不做语音打断。
- 不做 Wake Word、VAD。
- 不做多角色/记忆增强（Phase 5 边界）。
- 不新增控制台情绪面板。
