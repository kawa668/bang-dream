# 模型右键控制面板整合实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将独立控制台的全部功能整合进 Live2D 模型右键浮层，并删除控制台窗口。

**Architecture:** 输出窗口保持为唯一 BrowserWindow，新增顶部页签控制面板和按职责拆分的聊天、语音、AI、角色模块。主进程统一向输出窗口发送 IPC 事件，鼠标穿透按模型边界和面板边界精确判断。聊天历史通过现有 `memoryStore` 恢复，模型切换不再形成事件回环。

**Tech Stack:** Electron 37、TypeScript 5.7、electron-vite 3、Vitest 3、PixiJS 6、原生 DOM API

## 实施状态

- Task 1-8 已完成并提交。
- 控制面板的根焦点描边和麦克风按钮已完成视觉修正。
- Task 9 已完成 README、完整自动化验证和端到端界面复验，并已推送。

**验证记录：**

- `vitest`：20 个测试文件，103/103 测试通过。
- `tsc --noEmit`：通过。
- `electron-vite build`：通过，仅保留已知的 `vendor/live2d.min.js` 非 module 警告。
- 面板尺寸 `420×620`，根节点无焦点描边，麦克风按钮显示 SVG 图标。
- 页签控件数量：聊天 4、语音 3、AI 7、角色 103。
- 页签持久化、键盘切换、外部点击保持、`Esc` 关闭、聊天历史、语音状态、AI 设置和 26 个模型/动作列表均正常。

## Global Constraints

- 支持平台为 Windows 10/11。
- 不新增运行时或开发依赖。
- 保留现有 requestId IPC 语义。
- API Key 只能提交给主进程安全存储，禁止写入 `localStorage`。
- 面板为 `420px` 最大宽、`620px` 最大高，小视口按规格公式收缩。
- 面板打开后保持显示，直到关闭按钮或 `Esc`。
- 点击面板外部不得关闭面板，并应允许鼠标穿透到其他应用。
- 页签固定为 `聊天 / 语音 / AI / 角色`。
- 面板关闭后聊天、语音和 STT 仍继续接收事件。
- 所有自动化命令通过项目内 `node_modules\.bin` 执行，避免全局工具差异。

### Task 1: 面板定位算法

**Files:**
- Create: `src/renderer/src/panelPosition.ts`
- Test: `tests/renderer/panelPosition.test.ts`

**Interfaces:**
- Consumes: 无。
- Produces: `Point`、`Size`、`Rect`、`PanelPlacement`、`fitPanelSize(viewport)`、`calculatePanelPlacement(input)`。

- [ ] **Step 1: 写失败的定位测试**

Create `tests/renderer/panelPosition.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  calculatePanelPlacement,
  fitPanelSize
} from '../../src/renderer/src/panelPosition'

describe('panelPosition', () => {
  it('fits the default panel size inside a normal viewport', () => {
    expect(fitPanelSize({ width: 1200, height: 800 })).toEqual({
      width: 420,
      height: 620
    })
  })

  it('shrinks the panel inside a small viewport', () => {
    expect(fitPanelSize({ width: 400, height: 300 })).toEqual({
      width: 376,
      height: 276
    })
  })

  it('chooses the right side when the model is on the left', () => {
    expect(calculatePanelPlacement({
      click: { x: 360, y: 300 },
      modelBounds: { x: 220, y: 140, width: 180, height: 360 },
      viewport: { width: 1200, height: 800 }
    })).toEqual({
      x: 412,
      y: 168,
      width: 420,
      height: 620,
      side: 'right'
    })
  })

  it('chooses the left side when the model is on the right', () => {
    expect(calculatePanelPlacement({
      click: { x: 830, y: 300 },
      modelBounds: { x: 780, y: 140, width: 220, height: 360 },
      viewport: { width: 1200, height: 800 }
    })).toEqual({
      x: 348,
      y: 168,
      width: 420,
      height: 620,
      side: 'left'
    })
  })

  it('clamps the panel to viewport edges', () => {
    expect(calculatePanelPlacement({
      click: { x: 5, y: 790 },
      modelBounds: { x: 0, y: 300, width: 80, height: 300 },
      viewport: { width: 600, height: 420 }
    })).toEqual({
      x: 92,
      y: 48,
      width: 420,
      height: 360,
      side: 'right'
    })
  })

  it('falls back to the click point when model bounds are unavailable', () => {
    expect(calculatePanelPlacement({
      click: { x: 600, y: 300 },
      viewport: { width: 1200, height: 800 }
    })).toEqual({
      x: 612,
      y: 168,
      width: 420,
      height: 620,
      side: 'right'
    })
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run tests/renderer/panelPosition.test.ts
```

Expected: FAIL because `panelPosition.ts` does not exist.

- [ ] **Step 3: 实现定位算法**

Create `src/renderer/src/panelPosition.ts`:

```ts
export interface Point {
  x: number
  y: number
}

export interface Size {
  width: number
  height: number
}

export interface Rect extends Point, Size {}

export interface PanelPlacement extends Rect {
  side: 'left' | 'right'
}

export interface PanelPlacementInput {
  click: Point
  modelBounds?: Rect
  viewport: Size
  panelSize?: Size
}

const VIEWPORT_MARGIN = 12
const MODEL_GAP = 12
const MAX_PANEL_WIDTH = 420
const MAX_PANEL_HEIGHT = 620
const MIN_PANEL_HEIGHT = 360
const VERTICAL_OFFSET = 80

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max))
}

export function fitPanelSize(viewport: Size): Size {
  const availableWidth = Math.max(0, viewport.width - VIEWPORT_MARGIN * 2)
  const availableHeight = Math.max(0, viewport.height - VIEWPORT_MARGIN * 2)
  const preferredHeight = Math.max(MIN_PANEL_HEIGHT, viewport.height * 0.82)
  return {
    width: Math.min(MAX_PANEL_WIDTH, availableWidth),
    height: Math.min(MAX_PANEL_HEIGHT, preferredHeight, availableHeight)
  }
}

export function calculatePanelPlacement(input: PanelPlacementInput): PanelPlacement {
  const panelSize = input.panelSize ?? fitPanelSize(input.viewport)
  const model = input.modelBounds
  const rightSpace = model
    ? input.viewport.width - (model.x + model.width)
    : input.viewport.width - input.click.x
  const leftSpace = model ? model.x : input.click.x
  const side = rightSpace >= leftSpace ? 'right' : 'left'
  const desiredX = model
    ? side === 'right'
      ? model.x + model.width + MODEL_GAP
      : model.x - MODEL_GAP - panelSize.width
    : side === 'right'
      ? input.click.x + MODEL_GAP
      : input.click.x - MODEL_GAP - panelSize.width

  return {
    side,
    x: clamp(
      desiredX,
      VIEWPORT_MARGIN,
      input.viewport.width - panelSize.width - VIEWPORT_MARGIN
    ),
    y: clamp(
      input.click.y - VERTICAL_OFFSET,
      VIEWPORT_MARGIN,
      input.viewport.height - panelSize.height - VIEWPORT_MARGIN
    ),
    width: panelSize.width,
    height: panelSize.height
  }
}
```

- [ ] **Step 4: 运行定位测试**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run tests/renderer/panelPosition.test.ts
```

Expected: 6 tests pass.

- [ ] **Step 5: 提交**

```powershell
git add src/renderer/src/panelPosition.ts tests/renderer/panelPosition.test.ts
git commit -m "feat: add control panel placement"
```

### Task 2: 页签持久化

**Files:**
- Create: `src/renderer/src/panelTabs.ts`
- Test: `tests/renderer/panelTabs.test.ts`

**Interfaces:**
- Consumes: 无。
- Produces: `ControlTab`、`CONTROL_TABS`、`parseControlTab(value)`、`loadControlTab(storage)`、`saveControlTab(storage, tab)`。

- [ ] **Step 1: 写失败的页签测试**

Create `tests/renderer/panelTabs.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  loadControlTab,
  parseControlTab,
  saveControlTab,
  type ControlTab
} from '../../src/renderer/src/panelTabs'

function createStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) }
  }
}

describe('panelTabs', () => {
  it('accepts each supported tab', () => {
    for (const tab of ['chat', 'voice', 'ai', 'character'] as const) {
      expect(parseControlTab(tab)).toBe(tab)
    }
  })

  it('falls back to chat for invalid values', () => {
    expect(parseControlTab('unknown')).toBe('chat')
    expect(parseControlTab(null)).toBe('chat')
  })

  it('loads a persisted tab', () => {
    expect(loadControlTab(createStorage({ 'control-panel.active-tab': 'voice' }))).toBe('voice')
  })

  it('falls back when storage throws', () => {
    expect(loadControlTab({
      getItem() { throw new Error('blocked') },
      setItem() {}
    })).toBe('chat')
  })

  it('saves the selected tab', () => {
    const storage = createStorage()
    saveControlTab(storage, 'ai')
    expect(storage.getItem('control-panel.active-tab')).toBe('ai')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run tests/renderer/panelTabs.test.ts
```

Expected: FAIL because `panelTabs.ts` does not exist.

- [ ] **Step 3: 实现页签工具**

Create `src/renderer/src/panelTabs.ts`:

```ts
export const CONTROL_TABS = ['chat', 'voice', 'ai', 'character'] as const

export type ControlTab = typeof CONTROL_TABS[number]

export const ACTIVE_TAB_STORAGE_KEY = 'control-panel.active-tab'

interface TabStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export function parseControlTab(value: unknown): ControlTab {
  return typeof value === 'string'
    && (CONTROL_TABS as readonly string[]).includes(value)
    ? value as ControlTab
    : 'chat'
}

export function loadControlTab(storage: TabStorage | null = window.localStorage): ControlTab {
  if (!storage) return 'chat'
  try {
    return parseControlTab(storage.getItem(ACTIVE_TAB_STORAGE_KEY))
  } catch {
    return 'chat'
  }
}

export function saveControlTab(storage: TabStorage | null, tab: ControlTab): void {
  if (!storage) return
  try {
    storage.setItem(ACTIVE_TAB_STORAGE_KEY, tab)
  } catch {
    return
  }
}
```

- [ ] **Step 4: 运行页签测试**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run tests/renderer/panelTabs.test.ts
```

Expected: 5 tests pass.

- [ ] **Step 5: 提交**

```powershell
git add src/renderer/src/panelTabs.ts tests/renderer/panelTabs.test.ts
git commit -m "feat: persist control panel tab"
```

### Task 3: 聊天历史查询

**Files:**
- Modify: `src/shared/chat.ts`
- Modify: `src/main/memory/memoryStore.ts`
- Modify: `src/main/index.ts`
- Modify: `src/preload/api.ts`
- Modify: `src/renderer/src/global.d.ts`
- Test: `tests/shared/chatHistory.test.ts`

**Interfaces:**
- Consumes: `MemoryStore.load()`、`appConfig.llm.maxHistory`。
- Produces: `ChatHistoryEntry`、`selectRecentChatHistory(entries, maxHistory)`、`window.api.getChatHistory()`。

- [ ] **Step 1: 写失败的历史裁剪测试**

Create `tests/shared/chatHistory.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  selectRecentChatHistory,
  type ChatHistoryEntry
} from '../../src/shared/chat'

const entries: ChatHistoryEntry[] = [
  { role: 'user', content: 'one', createdAt: 1 },
  { role: 'assistant', content: 'two', createdAt: 2 },
  { role: 'user', content: 'three', createdAt: 3 }
]

describe('selectRecentChatHistory', () => {
  it('returns the latest messages without mutating the input', () => {
    const result = selectRecentChatHistory(entries, 2)
    expect(result).toEqual(entries.slice(-2))
    expect(result).not.toBe(entries)
    expect(entries).toHaveLength(3)
  })

  it('returns all messages when the limit exceeds the list', () => {
    expect(selectRecentChatHistory(entries, 10)).toEqual(entries)
  })

  it('returns an empty list for invalid limits', () => {
    expect(selectRecentChatHistory(entries, 0)).toEqual([])
    expect(selectRecentChatHistory(entries, -1)).toEqual([])
    expect(selectRecentChatHistory(entries, Number.NaN)).toEqual([])
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run tests/shared/chatHistory.test.ts
```

Expected: FAIL because `selectRecentChatHistory` is not exported.

- [ ] **Step 3: 添加共享历史类型与裁剪函数**

Append to `src/shared/chat.ts`:

```ts
export interface ChatHistoryEntry {
  role: 'user' | 'assistant'
  content: string
  createdAt: number
}

export function selectRecentChatHistory(
  entries: ChatHistoryEntry[],
  maxHistory: number
): ChatHistoryEntry[] {
  const limit = Number.isFinite(maxHistory)
    ? Math.max(0, Math.floor(maxHistory))
    : 0
  return limit === 0 ? [] : entries.slice(-limit)
}
```

In `src/main/memory/memoryStore.ts`, replace the local `MemoryEntry` interface with:

```ts
import type { ChatHistoryEntry } from '../../shared/chat'

export type MemoryEntry = ChatHistoryEntry
```

Keep the `MemoryStore` interface unchanged.

- [ ] **Step 4: 运行历史测试**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run tests/shared/chatHistory.test.ts tests/main/memory/memoryStore.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: 添加 IPC 和 preload 接口**

In `src/main/index.ts`, replace the existing `../shared/chat` type import with:

```ts
import {
  selectRecentChatHistory,
  type AppConfig,
  type LLMSettingsSave
} from '../shared/chat'
```

Add this handler after the `chat:clear` handler:

```ts
ipcMain.handle('chat:history', async () => {
  const entries = (await memoryStore?.load()) ?? []
  return selectRecentChatHistory(entries, appConfig?.llm.maxHistory ?? 0)
})
```

In `src/preload/api.ts`, import `ChatHistoryEntry` and add:

```ts
getChatHistory: (): Promise<ChatHistoryEntry[]> => ipcRenderer.invoke('chat:history'),
```

Add the matching method to the `window.api` declaration in `src/renderer/src/global.d.ts`:

```ts
getChatHistory: () => Promise<ChatHistoryEntry[]>
```

- [ ] **Step 6: 运行类型检查**

Run:

```powershell
.\node_modules\.bin\tsc.cmd --noEmit
```

Expected: PASS.

- [ ] **Step 7: 提交**

```powershell
git add src/shared/chat.ts src/main/memory/memoryStore.ts src/main/index.ts src/preload/api.ts src/renderer/src/global.d.ts tests/shared/chatHistory.test.ts
git commit -m "feat: expose recent chat history"
```

### Task 4: 精确鼠标命中

**Files:**
- Create: `src/main/windowInteraction.ts`
- Test: `tests/main/windowInteraction.test.ts`
- Modify: `src/main/index.ts`
- Modify: `src/preload/api.ts`
- Modify: `src/renderer/src/global.d.ts`

**Interfaces:**
- Consumes: `modelBounds`、`panelBounds`、窗口坐标和拖动状态。
- Produces: `shouldInterceptCursor(input)`、`window.api.reportPanelBounds(bounds | null)`。

- [ ] **Step 1: 写失败的命中测试**

Create `tests/main/windowInteraction.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { shouldInterceptCursor } from '../../src/main/windowInteraction'

const windowBounds = { x: 100, y: 50, width: 1000, height: 800 }
const modelBounds = { x: 300, y: 200, width: 200, height: 400 }
const panelBounds = { x: 520, y: 100, width: 420, height: 620 }

describe('shouldInterceptCursor', () => {
  it('intercepts the model area', () => {
    expect(shouldInterceptCursor({
      cursor: { x: 450, y: 300 },
      windowBounds,
      modelBounds,
      panelBounds: null,
      dragging: false
    })).toBe(true)
  })

  it('intercepts the panel area', () => {
    expect(shouldInterceptCursor({
      cursor: { x: 650, y: 200 },
      windowBounds,
      modelBounds,
      panelBounds,
      dragging: false
    })).toBe(true)
  })

  it('passes through outside both areas', () => {
    expect(shouldInterceptCursor({
      cursor: { x: 1050, y: 750 },
      windowBounds,
      modelBounds,
      panelBounds,
      dragging: false
    })).toBe(false)
  })

  it('intercepts everywhere while dragging', () => {
    expect(shouldInterceptCursor({
      cursor: { x: 1050, y: 750 },
      windowBounds,
      modelBounds,
      panelBounds,
      dragging: true
    })).toBe(true)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run tests/main/windowInteraction.test.ts
```

Expected: FAIL because `windowInteraction.ts` does not exist.

- [ ] **Step 3: 实现命中函数**

Create `src/main/windowInteraction.ts`:

```ts
export interface Point {
  x: number
  y: number
}

export interface Rect extends Point {
  width: number
  height: number
}

export interface WindowInteractionInput {
  cursor: Point
  windowBounds: Rect
  modelBounds: Rect | null
  panelBounds: Rect | null
  dragging: boolean
}

function isInsideWindowPoint(point: Point, origin: Point, bounds: Rect): boolean {
  const left = origin.x + bounds.x
  const top = origin.y + bounds.y
  return point.x >= left
    && point.x <= left + bounds.width
    && point.y >= top
    && point.y <= top + bounds.height
}

export function shouldInterceptCursor(input: WindowInteractionInput): boolean {
  if (input.dragging) return true
  if (
    input.modelBounds
    && isInsideWindowPoint(input.cursor, input.windowBounds, input.modelBounds)
  ) {
    return true
  }
  return Boolean(
    input.panelBounds
    && isInsideWindowPoint(input.cursor, input.windowBounds, input.panelBounds)
  )
}
```

- [ ] **Step 4: 运行命中测试**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run tests/main/windowInteraction.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 5: 接入面板边界 IPC**

In `src/main/index.ts`, import `shouldInterceptCursor` and add:

```ts
let panelBounds: { x: number; y: number; width: number; height: number } | null = null

function sendToOutput(channel: string, payload?: unknown): void {
  if (!outputWindow || outputWindow.isDestroyed()) return
  outputWindow.webContents.send(channel, payload)
}
```

Add the listener after `model:bounds`:

```ts
ipcMain.on('panel:bounds', (_event, bounds: {
  x: number
  y: number
  width: number
  height: number
} | null) => {
  panelBounds = bounds
})
```

Replace the cursor hit-test block in `setInterval` with:

```ts
const shouldIntercept = shouldInterceptCursor({
  cursor,
  windowBounds: winBounds,
  modelBounds,
  panelBounds,
  dragging: isDragging
}) || isMenuOpen
```

The `isMenuOpen` fallback remains until the old context menu is removed.

In `src/preload/api.ts`, add:

```ts
reportPanelBounds: (bounds: {
  x: number
  y: number
  width: number
  height: number
} | null): void => {
  ipcRenderer.send('panel:bounds', bounds)
},
```

Add the same signature to `src/renderer/src/global.d.ts`.

- [ ] **Step 6: 运行测试和类型检查**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run tests/main/windowInteraction.test.ts
.\node_modules\.bin\tsc.cmd --noEmit
```

Expected: PASS.

- [ ] **Step 7: 提交**

```powershell
git add src/main/windowInteraction.ts tests/main/windowInteraction.test.ts src/main/index.ts src/preload/api.ts src/renderer/src/global.d.ts
git commit -m "feat: track precise panel hit area"
```

### Task 5: 面板壳与聊天页

**Files:**
- Create: `src/renderer/src/controlPanel.ts`
- Create: `src/renderer/src/chatPanel.ts`
- Create: `src/renderer/src/panel.css`
- Modify: `src/renderer/index.html`

**Interfaces:**
- Consumes: `calculatePanelPlacement()`、`fitPanelSize()`、`loadControlTab()`、`saveControlTab()`、`window.api.getChatHistory()`。
- Produces: `ControlPanel`、`ChatPanel`，以及四页签面板 DOM。

- [ ] **Step 1: 替换输出页面的面板标记**

In `src/renderer/index.html`, keep the canvas, audio, and existing context menu elements unchanged while the new panel is built. Add the new panel markup after the existing context menu:

```html
<div
  id="control-panel"
  class="control-panel"
  role="dialog"
  aria-modal="false"
  aria-label="Live2D 控制面板"
  tabindex="-1"
  hidden
>
  <header class="panel-header">
    <div class="panel-identity">
      <strong id="panel-character-name">若叶睦</strong>
      <span id="panel-model">便装</span>
    </div>
    <span id="panel-voice-summary" class="panel-summary">语音已关闭</span>
    <button id="panel-close" class="icon-button" type="button" aria-label="关闭控制面板">
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
    </button>
  </header>

  <div id="panel-tabs" class="panel-tabs" role="tablist" aria-label="控制面板页签">
    <button id="tab-chat" type="button" role="tab" data-tab="chat" aria-controls="panel-chat" aria-selected="true">聊天</button>
    <button id="tab-voice" type="button" role="tab" data-tab="voice" aria-controls="panel-voice" aria-selected="false">语音</button>
    <button id="tab-ai" type="button" role="tab" data-tab="ai" aria-controls="panel-ai" aria-selected="false">AI</button>
    <button id="tab-character" type="button" role="tab" data-tab="character" aria-controls="panel-character" aria-selected="false">角色</button>
  </div>

  <div class="panel-body">
    <section id="panel-chat" class="panel-view" role="tabpanel" data-panel="chat" aria-labelledby="tab-chat"></section>
    <section id="panel-voice" class="panel-view" role="tabpanel" data-panel="voice" aria-labelledby="tab-voice" hidden></section>
    <section id="panel-ai" class="panel-view" role="tabpanel" data-panel="ai" aria-labelledby="tab-ai" hidden></section>
    <section id="panel-character" class="panel-view" role="tabpanel" data-panel="character" aria-labelledby="tab-character" hidden></section>
  </div>

  <footer class="panel-footer">
    <p id="panel-global-status" class="status" role="status">正在启动...</p>
  </footer>
</div>
```

Add `tabindex="-1"` to `#live2d-canvas`. The old `#context-menu` markup and styles remain until Task 8 removes them during the final cutover.

- [ ] **Step 2: 创建面板样式**

Create `src/renderer/src/panel.css` with the existing mint/indigo/blush tokens and these layout rules:

```css
:root {
  --panel-ink: #2b3446;
  --panel-ink-soft: #5b6678;
  --panel-bg: #f6f5f1;
  --panel-surface: #ffffff;
  --panel-muted: #eef1ea;
  --panel-border: #dfe3d9;
  --panel-mint: #6f9573;
  --panel-mint-soft: #e3eee2;
  --panel-indigo: #3a4a63;
  --panel-blush: #d98a9d;
  --panel-focus: #3b6ef0;
}

.control-panel {
  position: fixed;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--panel-border);
  border-radius: 10px;
  background: var(--panel-bg);
  color: var(--panel-ink);
  box-shadow: 0 18px 44px rgba(43, 52, 70, 0.24);
  font-family: system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
}

.control-panel[hidden] {
  display: none;
}

.panel-header,
.panel-footer {
  flex: none;
  background: var(--panel-surface);
}

.panel-header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto 36px;
  align-items: center;
  gap: 8px;
  padding: 9px 10px;
  border-bottom: 1px solid var(--panel-border);
}

.panel-identity {
  display: flex;
  align-items: baseline;
  gap: 7px;
  min-width: 0;
}

.panel-summary {
  overflow: hidden;
  color: var(--panel-ink-soft);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.panel-tabs {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 4px;
  padding: 7px;
  border-bottom: 1px solid var(--panel-border);
  background: var(--panel-muted);
}

.panel-tabs button {
  min-height: 44px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--panel-ink-soft);
  cursor: pointer;
}

.panel-tabs button[aria-selected="true"] {
  background: var(--panel-indigo);
  color: #fff;
  font-weight: 700;
}

.panel-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.panel-view {
  height: 100%;
  overflow-y: auto;
  padding: 10px;
}

.panel-footer {
  flex: none;
  padding: 7px 10px;
  border-top: 1px solid var(--panel-border);
}

.icon-button {
  width: 44px;
  height: 44px;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  color: var(--panel-ink-soft);
  cursor: pointer;
}

.icon-button:hover {
  border-color: var(--panel-border);
  background: var(--panel-muted);
}

.control-panel :focus-visible {
  outline: 2px solid var(--panel-focus);
  outline-offset: 2px;
}

.control-panel button,
.control-panel input,
.control-panel select {
  min-height: 44px;
}

@media (prefers-reduced-motion: reduce) {
  .control-panel * {
    transition-duration: 0ms !important;
    animation-duration: 0ms !important;
  }
}
```

Add the chat, voice, AI, character component styles from `control.html`, replacing `#chat-window` with `.chat-window`, and `.panel` selectors with `.panel-card`.

- [ ] **Step 3: 实现面板壳**

Create `src/renderer/src/controlPanel.ts`:

```ts
import {
  calculatePanelPlacement,
  type Rect
} from './panelPosition'
import {
  CONTROL_TABS,
  loadControlTab,
  saveControlTab,
  type ControlTab
} from './panelTabs'

interface ControlPanelOptions {
  onClose(): void
  onBoundsChange(bounds: Rect | null): void
}

export class ControlPanel {
  private readonly tabs: HTMLButtonElement[]
  private readonly views: HTMLElement[]
  private activeTab: ControlTab
  private openState = false
  private lastAnchor: { x: number; y: number } | null = null
  private lastModelBounds: Rect | null = null
  private readonly resizeObserver: ResizeObserver

  constructor(
    private readonly root: HTMLElement,
    private readonly options: ControlPanelOptions
  ) {
    this.tabs = [...root.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
    this.views = [...root.querySelectorAll<HTMLElement>('[role="tabpanel"]')]
    this.activeTab = loadControlTab()
    this.resizeObserver = new ResizeObserver(() => this.reportBounds())

    root.querySelector<HTMLButtonElement>('#panel-close')?.addEventListener('click', () => this.close())
    for (const tab of this.tabs) {
      tab.addEventListener('click', () => this.showTab(tab.dataset.tab as ControlTab))
      tab.addEventListener('keydown', (event) => this.onTabKeydown(event))
    }
    window.addEventListener('keydown', (event) => {
      if (this.openState && event.key === 'Escape') {
        event.preventDefault()
        this.close()
      }
    })
    window.addEventListener('resize', () => this.reposition())
    this.showTab(this.activeTab)
  }

  get isOpen(): boolean {
    return this.openState
  }

  open(click: { x: number; y: number }, modelBounds: Rect | null): void {
    this.lastAnchor = click
    this.lastModelBounds = modelBounds
    this.root.hidden = false
    this.openState = true
    this.reposition()
    this.resizeObserver.observe(this.root)
    requestAnimationFrame(() => {
      this.root.focus({ preventScroll: true })
      this.reportBounds()
    })
  }

  close(): void {
    if (!this.openState) return
    this.openState = false
    this.root.hidden = true
    this.resizeObserver.unobserve(this.root)
    this.options.onBoundsChange(null)
    this.options.onClose()
  }

  setCharacterName(name: string): void {
    const element = this.root.querySelector<HTMLElement>('#panel-character-name')
    if (element) element.textContent = name
  }

  setModelLabel(label: string): void {
    const element = this.root.querySelector<HTMLElement>('#panel-model')
    if (element) element.textContent = label
  }

  setVoiceSummary(summary: string): void {
    const element = this.root.querySelector<HTMLElement>('#panel-voice-summary')
    if (element) element.textContent = summary
  }

  setGlobalStatus(status: string): void {
    const element = this.root.querySelector<HTMLElement>('#panel-global-status')
    if (element) element.textContent = status
  }

  private reposition(): void {
    if (!this.openState || !this.lastAnchor) return
    const placement = calculatePanelPlacement({
      click: this.lastAnchor,
      modelBounds: this.lastModelBounds ?? undefined,
      viewport: { width: window.innerWidth, height: window.innerHeight }
    })
    this.root.style.left = `${placement.x}px`
    this.root.style.top = `${placement.y}px`
    this.root.style.width = `${placement.width}px`
    this.root.style.height = `${placement.height}px`
  }

  private reportBounds(): void {
    if (!this.openState) return
    const rect = this.root.getBoundingClientRect()
    this.options.onBoundsChange({
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height
    })
  }

  private showTab(tab: ControlTab): void {
    if (!(CONTROL_TABS as readonly string[]).includes(tab)) tab = 'chat'
    this.activeTab = tab
    saveControlTab(window.localStorage, tab)
    for (const button of this.tabs) {
      const selected = button.dataset.tab === tab
      button.setAttribute('aria-selected', String(selected))
      button.tabIndex = selected ? 0 : -1
    }
    for (const view of this.views) view.hidden = view.dataset.panel !== tab
  }

  private onTabKeydown(event: KeyboardEvent): void {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const index = this.tabs.indexOf(event.currentTarget as HTMLButtonElement)
    const delta = event.key === 'ArrowRight' ? 1 : -1
    const next = this.tabs[(index + delta + this.tabs.length) % this.tabs.length]
    next.focus()
    this.showTab(next.dataset.tab as ControlTab)
  }
}
```

- [ ] **Step 4: 实现聊天页**

Create `src/renderer/src/chatPanel.ts`:

```ts
import type { OutfitId } from '../../shared/types'
import { createRequestId } from '../../shared/requestId'
import { iconForModel } from '../../shared/characterIcons'

interface ChatPanelOptions {
  getCurrentModel(): OutfitId
  isVoiceConversationEnabled(): boolean
}

const USER_AVATAR_SVG =
  '<svg viewBox="0 0 24 24" width="14" height="14" role="presentation">' +
  '<circle cx="12" cy="8" r="4" fill="currentColor"/>' +
  '<path d="M4 21c0-4 4-6.5 8-6.5s8 2.5 8 6.5" fill="currentColor"/></svg>'

const STT_STATE_LABELS: Record<string, string> = {
  idle: '语音识别就绪',
  starting: '正在启动识别服务（首次可能下载模型）...',
  transcribing: '正在识别...',
  error: '语音识别错误'
}

export class ChatPanel {
  private assistantContent: HTMLDivElement | null = null
  private mediaRecorder: MediaRecorder | null = null
  private recordingStream: MediaStream | null = null
  private sttChunks: Blob[] = []

  constructor(
    private readonly root: HTMLElement,
    private readonly options: ChatPanelOptions
  ) {
    this.renderShell()
    this.bindEvents()
    void this.loadHistory()
  }

  setCurrentModel(model: OutfitId): void {
    const source = iconForModel(model)
    for (const avatar of this.root.querySelectorAll<HTMLImageElement>('.chat-avatar--assistant')) {
      avatar.src = source
    }
  }

  clear(): void {
    this.require<HTMLElement>('#chat-messages').innerHTML = ''
    this.assistantContent = null
    this.updateEmptyState()
  }

  private renderShell(): void {
    this.root.innerHTML = `
      <div class="chat-window">
        <div id="chat-messages" class="chat-messages"></div>
        <div class="chat-input-row">
          <input id="chat-input" type="text" placeholder="和宠物说话..." />
          <button id="stt-button" class="btn ghost mic" type="button" aria-label="按住说话">麦克风</button>
          <button id="chat-send" class="btn primary" type="button">发送</button>
          <button id="chat-clear" class="btn ghost" type="button">清空</button>
        </div>
      </div>
      <p id="chat-status" class="status" role="status"></p>
      <p id="stt-status" class="status" role="status"></p>
    `
  }

  private async loadHistory(): Promise<void> {
    try {
      const history = await window.api.getChatHistory()
      for (const entry of history) this.appendMessage(entry.role, entry.content)
      this.updateEmptyState()
    } catch (error) {
      this.setChatStatus(error instanceof Error ? error.message : String(error))
      this.updateEmptyState()
    }
  }

  private appendMessage(
    role: 'user' | 'assistant' | 'system',
    text: string
  ): HTMLDivElement {
    const message = document.createElement('div')
    message.className = `chat-message chat-${role}`

    if (role === 'assistant') {
      const avatar = document.createElement('img')
      avatar.className = 'chat-avatar chat-avatar--assistant'
      avatar.src = iconForModel(this.options.getCurrentModel())
      avatar.alt = ''
      avatar.setAttribute('aria-hidden', 'true')
      message.appendChild(avatar)
    } else if (role === 'user') {
      const avatar = document.createElement('span')
      avatar.className = 'chat-avatar chat-avatar--user'
      avatar.setAttribute('aria-hidden', 'true')
      avatar.innerHTML = USER_AVATAR_SVG
      message.appendChild(avatar)
    }

    const body = document.createElement('div')
    body.className = 'chat-body'
    const author = document.createElement('span')
    author.className = 'chat-author'
    author.textContent = role === 'user' ? '你' : role === 'assistant' ? '宠物' : '系统'
    const content = document.createElement('div')
    content.className = 'chat-content'
    content.textContent = text
    body.appendChild(author)
    body.appendChild(content)
    message.appendChild(body)

    const messages = this.require<HTMLElement>('#chat-messages')
    messages.appendChild(message)
    messages.scrollTop = messages.scrollHeight
    this.updateEmptyState()
    return message
  }

  private updateEmptyState(): void {
    const messages = this.require<HTMLElement>('#chat-messages')
    const existing = messages.querySelector('.chat-empty')
    if (messages.childElementCount === 0 && !existing) {
      const empty = document.createElement('div')
      empty.className = 'chat-empty'
      empty.textContent = '和宠物说点什么吧'
      messages.appendChild(empty)
    } else if (messages.childElementCount > 0 && existing) {
      existing.remove()
    }
  }

  private bindEvents(): void {
    this.require<HTMLButtonElement>('#chat-send').addEventListener('click', () => {
      void this.sendMessage()
    })
    this.require<HTMLInputElement>('#chat-input').addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return
      event.preventDefault()
      void this.sendMessage()
    })
    this.require<HTMLButtonElement>('#chat-clear').addEventListener('click', () => {
      window.api.clearChat(createRequestId('chat-clear'))
      this.clear()
    })

    const mic = this.require<HTMLButtonElement>('#stt-button')
    mic.addEventListener('pointerdown', (event) => {
      event.preventDefault()
      void this.startRecording()
    })
    mic.addEventListener('pointerup', () => this.stopRecording())
    mic.addEventListener('pointerleave', () => this.stopRecording())

    window.api.onChatStart(() => {
      const message = this.appendMessage('assistant', '')
      this.assistantContent = message.querySelector<HTMLDivElement>('.chat-content')
      this.setChatStatus('正在回复...')
    })
    window.api.onChatDelta((event) => {
      if (!this.assistantContent) return
      this.assistantContent.textContent += event.delta
      const messages = this.require<HTMLElement>('#chat-messages')
      messages.scrollTop = messages.scrollHeight
    })
    window.api.onChatComplete((event) => {
      if (this.assistantContent) this.assistantContent.textContent = event.message
      this.assistantContent = null
      this.setChatStatus('')
    })
    window.api.onChatError((event) => {
      if (this.assistantContent) {
        this.assistantContent.textContent += `\n[${event.message}]`
      } else {
        this.appendMessage('system', event.message)
      }
      this.assistantContent = null
      this.setChatStatus('')
    })
    window.api.onChatClear(() => this.clear())
    window.api.onSttState((message) => {
      const label = STT_STATE_LABELS[message.state.runtimeState] ?? message.state.runtimeState
      this.setSttStatus(
        message.state.message && message.state.runtimeState === 'error'
          ? `${label}：${message.state.message}`
          : label
      )
    })
    window.api.onSttResult((event) => {
      const input = this.require<HTMLInputElement>('#chat-input')
      if (this.options.isVoiceConversationEnabled()) {
        input.value = ''
        window.api.sendChatMessage(createRequestId('chat'), event.text)
      } else {
        input.value = event.text
        input.focus()
      }
    })
  }

  private async sendMessage(): Promise<void> {
    const input = this.require<HTMLInputElement>('#chat-input')
    const text = input.value.trim()
    if (!text) return
    this.appendMessage('user', text)
    input.value = ''
    window.api.sendChatMessage(createRequestId('chat'), text)
  }

  private async startRecording(): Promise<void> {
    if (this.mediaRecorder) return
    const mic = this.require<HTMLButtonElement>('#stt-button')
    mic.classList.add('recording')
    try {
      this.recordingStream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(this.recordingStream)
      this.mediaRecorder = recorder
      this.sttChunks = []
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) this.sttChunks.push(event.data)
      }
      recorder.onstop = async () => {
        const type = this.mediaRecorder?.mimeType ?? 'audio/webm'
        const blob = new Blob(this.sttChunks, { type })
        const audio = new Uint8Array(await blob.arrayBuffer())
        this.cleanupRecording()
        window.api.transcribeAudio(createRequestId('stt'), audio)
      }
      recorder.start()
    } catch (error) {
      this.setSttStatus(error instanceof Error ? error.message : String(error))
      this.cleanupRecording()
    }
  }

  private stopRecording(): void {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop()
    }
  }

  private cleanupRecording(): void {
    this.mediaRecorder = null
    this.recordingStream?.getTracks().forEach((track) => track.stop())
    this.recordingStream = null
    this.sttChunks = []
    this.require<HTMLButtonElement>('#stt-button').classList.remove('recording')
  }

  private setChatStatus(text: string): void {
    this.require<HTMLElement>('#chat-status').textContent = text
  }

  private setSttStatus(text: string): void {
    this.require<HTMLElement>('#stt-status').textContent = text
  }

  private require<T extends Element>(selector: string): T {
    const element = this.root.querySelector<T>(selector)
    if (!element) throw new Error(`Missing chat panel element: ${selector}`)
    return element
  }
}
```

- [ ] **Step 5: 引入样式并构建**

Add `import './panel.css'` to `src/renderer/src/main.ts`.

Run:

```powershell
.\node_modules\.bin\tsc.cmd --noEmit
.\node_modules\.bin\electron-vite.cmd build
```

Expected: PASS. The new modules are not yet wired into `main.ts`, so runtime behavior remains unchanged.

- [ ] **Step 6: 提交**

```powershell
git add src/renderer/index.html src/renderer/src/panel.css src/renderer/src/controlPanel.ts src/renderer/src/chatPanel.ts src/renderer/src/main.ts
git commit -m "feat: add model control panel shell and chat"
```

### Task 6: 语音页与 AI 设置页

**Files:**
- Create: `src/renderer/src/voicePanel.ts`
- Create: `src/renderer/src/settingsPanel.ts`
- Modify: `src/renderer/src/panel.css`

**Interfaces:**
- Consumes: `VOICE_OPTIONS`、`VoiceStateMessage`、`LLMSettingsView`、`LLMSettingsSave`、现有 voice/config IPC。
- Produces: `VoicePanel`、`SettingsPanel`，以及 `VoicePanel.getConversationEnabled()`。

- [ ] **Step 1: 实现语音模块**

Create `src/renderer/src/voicePanel.ts`:

```ts
import { createRequestId } from '../../shared/requestId'
import { VOICE_OPTIONS, type VoiceStateMessage } from '../../shared/voice'

const VOICE_STATE_LABELS: Record<string, string> = {
  off: '语音回复已关闭',
  idle: '语音服务空闲',
  starting: '正在启动 GPT-SoVITS...',
  'loading-voice': '正在加载音色...',
  synthesizing: '正在合成语音...',
  playing: '正在播放语音...',
  stopping: '正在停止语音服务...',
  error: '语音服务错误'
}

interface VoicePanelOptions {
  onSummaryChange(summary: string): void
}

export class VoicePanel {
  private readonly enabled: HTMLInputElement
  private readonly conversation: HTMLInputElement
  private readonly voice: HTMLSelectElement
  private readonly status: HTMLParagraphElement

  constructor(
    private readonly root: HTMLElement,
    private readonly options: VoicePanelOptions
  ) {
    this.root.innerHTML = `
      <section class="panel-card">
        <label class="switch">
          <input id="voice-enabled" type="checkbox" />
          <span class="switch-track" aria-hidden="true"></span>
          <span>语音回复</span>
        </label>
        <label class="switch">
          <input id="voice-conversation" type="checkbox" />
          <span class="switch-track" aria-hidden="true"></span>
          <span>语音对话</span>
        </label>
        <label class="field-inline">
          <span>音色</span>
          <select id="voice-select"></select>
        </label>
        <p id="voice-status" class="status" role="status"></p>
      </section>
    `
    this.enabled = this.require<HTMLInputElement>('#voice-enabled')
    this.conversation = this.require<HTMLInputElement>('#voice-conversation')
    this.voice = this.require<HTMLSelectElement>('#voice-select')
    this.status = this.require<HTMLParagraphElement>('#voice-status')

    for (const option of VOICE_OPTIONS) {
      const element = document.createElement('option')
      element.value = option.id
      element.textContent = option.displayName
      this.voice.appendChild(element)
    }
    this.enabled.addEventListener('change', () => {
      window.api.setVoiceEnabled(createRequestId('voice-enabled'), this.enabled.checked)
    })
    this.conversation.addEventListener('change', () => {
      const enabled = this.conversation.checked
      window.api.setVoiceConversation(createRequestId('voice-conversation'), enabled)
      if (enabled && !this.enabled.checked) {
        window.api.setVoiceEnabled(createRequestId('voice-enabled'), true)
      }
    })
    this.voice.addEventListener('change', () => {
      const selected = VOICE_OPTIONS.find((option) => option.id === this.voice.value)
      if (selected) window.api.setVoiceId(createRequestId('voice-select'), selected.id)
    })
    window.api.onVoiceState((message) => this.applyState(message))
    void this.load()
  }

  getConversationEnabled(): boolean {
    return this.conversation.checked
  }

  private async load(): Promise<void> {
    try {
      const message = await window.api.getVoiceState(createRequestId('voice-get'))
      if (message) this.applyState(message)
    } catch (error) {
      this.status.textContent = error instanceof Error ? error.message : String(error)
    }
  }

  private applyState(message: VoiceStateMessage): void {
    const state = message.state
    this.enabled.checked = state.enabled
    this.conversation.checked = state.voiceConversationEnabled
    this.voice.value = state.selectedVoice
    const label = VOICE_STATE_LABELS[state.runtimeState] ?? state.runtimeState
    const text = state.message && state.runtimeState === 'error'
      ? `语音服务错误：${state.message}`
      : label
    this.status.textContent = text
    this.options.onSummaryChange(label)
  }

  private require<T extends Element>(selector: string): T {
    const element = this.root.querySelector<T>(selector)
    if (!element) throw new Error(`Missing voice control: ${selector}`)
    return element
  }
}
```

- [ ] **Step 2: 实现 AI 设置模块**

Create `src/renderer/src/settingsPanel.ts`:

```ts
import type { LLMSettingsSave, LLMSettingsView } from '../../shared/chat'

export class SettingsPanel {
  private readonly baseUrl: HTMLInputElement
  private readonly apiKey: HTMLInputElement
  private readonly model: HTMLInputElement
  private readonly character: HTMLParagraphElement
  private readonly temperature: HTMLInputElement
  private readonly timeout: HTMLInputElement
  private readonly maxHistory: HTMLInputElement
  private readonly status: HTMLParagraphElement

  constructor(private readonly root: HTMLElement) {
    this.root.innerHTML = `
      <section class="panel-card settings-form">
        <label class="field"><span>Base URL</span><input id="llm-base-url" type="url" /></label>
        <label class="field"><span>API Key</span><input id="llm-api-key" type="password" placeholder="留空表示不修改" /></label>
        <label class="field"><span>模型</span><input id="llm-model" type="text" /></label>
        <div class="field"><span>当前角色</span><p id="llm-current-character" class="status"></p></div>
        <label class="field"><span>Temperature</span><input id="llm-temperature" type="number" min="0" max="2" step="0.1" /></label>
        <label class="field"><span>超时（毫秒）</span><input id="llm-timeout" type="number" min="1000" /></label>
        <label class="field"><span>历史消息数</span><input id="llm-max-history" type="number" min="1" /></label>
        <button id="config-save" class="btn primary" type="button">保存设置</button>
        <p id="config-status" class="status" role="status"></p>
      </section>
    `
    this.baseUrl = this.require<HTMLInputElement>('#llm-base-url')
    this.apiKey = this.require<HTMLInputElement>('#llm-api-key')
    this.model = this.require<HTMLInputElement>('#llm-model')
    this.character = this.require<HTMLParagraphElement>('#llm-current-character')
    this.temperature = this.require<HTMLInputElement>('#llm-temperature')
    this.timeout = this.require<HTMLInputElement>('#llm-timeout')
    this.maxHistory = this.require<HTMLInputElement>('#llm-max-history')
    this.status = this.require<HTMLParagraphElement>('#config-status')
    this.require<HTMLButtonElement>('#config-save')
      .addEventListener('click', () => void this.save())
    void this.load()
  }

  setCharacterName(name: string): void {
    this.character.textContent = `当前角色：${name}`
  }

  private async load(): Promise<void> {
    const view = await window.api.getConfig()
    if (!view) return
    this.applyView(view)
  }

  private applyView(view: LLMSettingsView): void {
    this.baseUrl.value = view.baseUrl
    this.model.value = view.model
    this.temperature.value = String(view.temperature)
    this.timeout.value = String(view.timeoutMs)
    this.maxHistory.value = String(view.maxHistory)
    this.apiKey.value = ''
    this.character.textContent = `当前角色：${view.characterName}`
    this.status.textContent = view.hasApiKey ? 'API Key 已保存' : '尚未保存 API Key'
  }

  private async save(): Promise<void> {
    const settings: LLMSettingsSave = {
      baseUrl: this.baseUrl.value,
      apiKey: this.apiKey.value,
      model: this.model.value,
      temperature: Number(this.temperature.value),
      timeoutMs: Number(this.timeout.value),
      maxHistory: Number(this.maxHistory.value)
    }
    if (!settings.baseUrl.trim() || !settings.model.trim()) {
      this.status.textContent = '请填写 Base URL 和模型名'
      return
    }
    try {
      const view = await window.api.saveConfig(settings)
      if (view) this.applyView({ ...view, hasApiKey: view.hasApiKey })
      this.status.textContent = '设置已保存'
    } catch (error) {
      this.status.textContent = error instanceof Error ? error.message : String(error)
    }
  }

  private require<T extends Element>(selector: string): T {
    const element = this.root.querySelector<T>(selector)
    if (!element) throw new Error(`Missing settings control: ${selector}`)
    return element
  }
}
```

- [ ] **Step 3: 实现表单与语音样式**

Move the existing `.switch`、`.field`、`.field-inline`、`.btn`、`select` styles from `control.html` into `panel.css`. Replace all `#voice-*` and `#llm-*` selectors with classes where possible.

- [ ] **Step 4: 构建验证**

Run:

```powershell
.\node_modules\.bin\tsc.cmd --noEmit
.\node_modules\.bin\electron-vite.cmd build
```

Expected: PASS.

- [ ] **Step 5: 提交**

```powershell
git add src/renderer/src/panel.css src/renderer/src/voicePanel.ts src/renderer/src/settingsPanel.ts
git commit -m "feat: add voice and settings panel views"
```

### Task 7: 角色与动作页

**Files:**
- Create: `src/renderer/src/characterPanel.ts`
- Modify: `src/renderer/src/panel.css`

**Interfaces:**
- Consumes: `groupModelsByCharacter()`、`groupActions()`、`fetchModelManifest()`、`createCollapseToggle()`、`window.api.requestModelSwitch()`、`window.api.playAction()`。
- Produces: `CharacterPanel.setCurrentModel(id)`、`CharacterPanel.refresh()`。

- [ ] **Step 1: 实现角色模块**

Create `src/renderer/src/characterPanel.ts`:

```ts
import { groupActions } from '../../shared/actionCategories'
import { iconForCharacter } from '../../shared/characterIcons'
import { groupModelsByCharacter } from '../../shared/modelCategories'
import type { ModelDescriptor, OutfitId } from '../../shared/types'
import { createCollapseToggle } from './dom'
import { fetchModelManifest } from './models'

function simplifiedName(displayName: string): string {
  return displayName.replace(/^(若叶睦|千早爱音|丰川祥子)·/, '')
}

export class CharacterPanel {
  private manifest: ModelDescriptor[] = []
  private readonly manifestByModel = new Map<OutfitId, ModelDescriptor>()
  private readonly actionsByModel = new Map<OutfitId, string[]>()
  private currentModel: OutfitId | null = null
  private actions: string[] = []
  private renderSequence = 0

  constructor(private readonly root: HTMLElement) {
    this.root.innerHTML = `
      <section class="panel-card">
        <h2>人物</h2>
        <div id="panel-model-buttons"></div>
      </section>
      <section class="panel-card">
        <h2>动作</h2>
        <div id="panel-action-groups"></div>
      </section>
    `
    void this.refresh()
  }

  async refresh(): Promise<void> {
    try {
      this.manifest = await fetchModelManifest()
      this.manifestByModel.clear()
      for (const model of this.manifest) this.manifestByModel.set(model.id, model)
      this.renderModels()
      if (this.currentModel) await this.setCurrentModel(this.currentModel)
    } catch (error) {
      const host = this.root.querySelector('#panel-model-buttons')
      if (host) host.textContent = error instanceof Error ? error.message : String(error)
    }
  }

  async setCurrentModel(id: OutfitId): Promise<void> {
    const sequence = ++this.renderSequence
    this.currentModel = id
    for (const button of this.root.querySelectorAll<HTMLButtonElement>('[data-model-id]')) {
      button.classList.toggle('active', button.dataset.modelId === id)
    }
    const actions = await this.loadActions(id)
    if (sequence !== this.renderSequence) return
    this.actions = actions
    this.renderActions()
    window.api.reportStatus(`当前服装：${id}，可用动作 ${this.actions.length} 个`)
  }

  private renderModels(): void {
    const host = this.require('#panel-model-buttons')
    host.innerHTML = ''
    for (const character of groupModelsByCharacter(this.manifest)) {
      const content = document.createElement('div')
      content.className = 'character-models'
      const count = character.categories.reduce((sum, category) => sum + category.models.length, 0)
      host.appendChild(createCollapseToggle(
        character.character,
        count,
        content,
        iconForCharacter(character.character)
      ))
      host.appendChild(content)
      for (const category of character.categories) {
        const group = document.createElement('div')
        group.className = 'category-buttons'
        content.appendChild(createCollapseToggle(category.title, category.models.length, group))
        content.appendChild(group)
        for (const model of category.models) {
          const button = document.createElement('button')
          button.type = 'button'
          button.dataset.modelId = model.id
          button.textContent = simplifiedName(model.displayName)
          button.addEventListener('click', () => window.api.requestModelSwitch(model.id))
          group.appendChild(button)
        }
      }
    }
  }

  private async loadActions(id: OutfitId): Promise<string[]> {
    const cached = this.actionsByModel.get(id)
    if (cached) return cached
    const descriptor = this.manifestByModel.get(id)
    if (!descriptor) return []
    const response = await fetch(descriptor.modelJsonUrl)
    const json = await response.json() as { motions?: Record<string, unknown> }
    const actions = Object.keys(json.motions ?? {})
      .filter((action) => action !== 'idle' && action !== 'tap_body')
      .sort()
    this.actionsByModel.set(id, actions)
    return actions
  }

  private renderActions(): void {
    const host = this.require('#panel-action-groups')
    host.innerHTML = ''
    for (const group of groupActions(this.actions)) {
      const list = document.createElement('div')
      list.className = 'action-buttons'
      host.appendChild(createCollapseToggle(group.title, group.actions.length, list))
      host.appendChild(list)
      for (const action of group.actions) {
        const button = document.createElement('button')
        button.type = 'button'
        button.textContent = action
        button.addEventListener('click', () => window.api.playAction(action))
        list.appendChild(button)
      }
    }
  }

  private require(selector: string): HTMLElement {
    const element = this.root.querySelector<HTMLElement>(selector)
    if (!element) throw new Error(`Missing character panel element: ${selector}`)
    return element
  }
}
```

- [ ] **Step 2: 实现角色和动作样式**

Move the existing `.collapse-toggle`、`.category-buttons`、`.action-buttons`、`.character-models`、`.toggle-*` and active-model styles from `control.html` into `panel.css`.

- [ ] **Step 3: 构建验证**

Run:

```powershell
.\node_modules\.bin\tsc.cmd --noEmit
.\node_modules\.bin\electron-vite.cmd build
```

Expected: PASS.

- [ ] **Step 4: 提交**

```powershell
git add src/renderer/src/characterPanel.ts src/renderer/src/panel.css
git commit -m "feat: add character and action panel view"
```

### Task 8: 输出窗口切换到控制面板

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/renderer/src/main.ts`
- Modify: `src/preload/api.ts`
- Modify: `src/renderer/src/global.d.ts`
- Delete: `src/renderer/control.html`
- Delete: `src/renderer/src/control.ts`
- Modify: `electron.vite.config.ts`

**Interfaces:**
- Consumes: `ControlPanel`、`ChatPanel`、`VoicePanel`、`SettingsPanel`、`CharacterPanel`、`sendToOutput()`、`shouldInterceptCursor()`。
- Produces: 启动时只有输出窗口；右键模型打开完整控制面板。

- [ ] **Step 1: 删除旧控制台构建入口**

In `electron.vite.config.ts`, change the renderer input to:

```ts
build: {
  rollupOptions: {
    input: {
      index: resolve(__dirname, 'src/renderer/index.html')
    }
  }
}
```

Delete:

```text
src/renderer/control.html
src/renderer/src/control.ts
```

- [ ] **Step 2: 完成主进程单窗口切换**

In `src/main/index.ts`:

- Remove the `controlWindow` variable and `createControlWindow()`.
- Remove `isMenuOpen`.
- Remove `ipcMain.on('menu-state', ...)`.
- Replace every `controlWindow?.webContents.send(channel, payload)` with `sendToOutput(channel, payload)`.
- In `ipcMain.on('model:changed', ...)`, remove the outbound `model:switch` send. Keep `chatSessionController.switchToModel()` and `voiceManager.trackModel()`.
- In `app.whenReady()`, replace:

```ts
createOutputWindow()
createControlWindow()
```

with:

```ts
createOutputWindow()
```

- In `app.on('activate')`, create only the output window:

```ts
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createOutputWindow()
})
```

- In the cursor interval, remove the `|| isMenuOpen` fallback:

```ts
const shouldIntercept = shouldInterceptCursor({
  cursor,
  windowBounds: winBounds,
  modelBounds,
  panelBounds,
  dragging: isDragging
})
```

- Keep `ipcMain.on('panel:bounds', ...)` as the source of `panelBounds`.

After this step, `controlWindow` must not appear anywhere in `src/main/index.ts`.

- [ ] **Step 3: 删除旧 preload 菜单上报**

In `src/preload/api.ts` and `src/renderer/src/global.d.ts`, remove `reportMenuOpen`. Keep `reportPanelBounds`.

- [ ] **Step 4: 重写输出窗口渲染入口**

In `src/renderer/src/main.ts`:

1. Remove the old context menu builder, `closeContextMenu`, `showContextMenu`, `contextMenuOpen`, model/action grouping imports, and `createCollapseToggle` import.
2. In `src/renderer/index.html`, remove the old `#context-menu` element and all `#context-menu` CSS rules.
3. Import the panel classes:

```ts
import { ControlPanel } from './controlPanel'
import { ChatPanel } from './chatPanel'
import { VoicePanel } from './voicePanel'
import { SettingsPanel } from './settingsPanel'
import { CharacterPanel } from './characterPanel'
```

4. After `ModelManager.init()`, create the panel and child views:

```ts
const panelRoot = document.querySelector<HTMLElement>('#control-panel')
const chatRoot = document.querySelector<HTMLElement>('#panel-chat')
const voiceRoot = document.querySelector<HTMLElement>('#panel-voice')
const settingsRoot = document.querySelector<HTMLElement>('#panel-ai')
const characterRoot = document.querySelector<HTMLElement>('#panel-character')
if (!panelRoot || !chatRoot || !voiceRoot || !settingsRoot || !characterRoot) {
  throw new Error('control panel root not found')
}

const panel = new ControlPanel(panelRoot, {
  onClose: () => canvas.focus({ preventScroll: true }),
  onBoundsChange: (bounds) => window.api.reportPanelBounds(bounds)
})
const voicePanel = new VoicePanel(voiceRoot, {
  onSummaryChange: (summary) => panel.setVoiceSummary(summary)
})
const chatPanel = new ChatPanel(chatRoot, {
  getCurrentModel: () => modelManager.getCurrent() ?? 'casual',
  isVoiceConversationEnabled: () => voicePanel.getConversationEnabled()
})
const settingsPanel = new SettingsPanel(settingsRoot)
const characterPanel = new CharacterPanel(characterRoot)
```

5. Replace the context menu listener with:

```ts
canvas.addEventListener('contextmenu', (event) => {
  if (!renderer.hitTest(event.clientX, event.clientY)) return
  event.preventDefault()
  panel.open(
    { x: event.clientX, y: event.clientY },
    renderer.getModelBounds()
  )
})
```

6. Replace random-action `contextMenuOpen` with `panel.isOpen`.
7. Replace `switchModel()` with:

```ts
const switchModel = (id: OutfitId): void => {
  void modelManager.switchModel(id)
    .then(async () => {
      window.api.reportModel(id)
      panel.setModelLabel(id)
      chatPanel.setCurrentModel(id)
      await characterPanel.setCurrentModel(id)
    })
    .catch((error) => console.error(error))
}
```

8. Wire the existing events:

```ts
window.api.onCharacterChanged((character) => {
  panel.setCharacterName(character.name)
  settingsPanel.setCharacterName(character.name)
})

window.api.onStatus((message) => {
  panel.setGlobalStatus(message)
})
```

Keep the existing `onActionPlay`、`onAiExpression`、voice playback listeners unchanged.

9. After initial model initialization, call:

```ts
const initialModel = modelManager.getCurrent() ?? 'casual'
panel.setModelLabel(initialModel)
void characterPanel.setCurrentModel(initialModel)
chatPanel.setCurrentModel(initialModel)
```

- [ ] **Step 5: 为模型边界补充渲染接口**

In `src/renderer/src/live2d.ts`, add:

```ts
getModelBounds(): { x: number; y: number; width: number; height: number } | null {
  if (!this.model) return null
  const bounds = this.model.getBounds()
  return {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height
  }
}
```

Use this method inside `reportBounds()` and `isInsideModel()` while preserving existing behavior.

- [ ] **Step 6: 运行测试、类型检查和构建**

Run:

```powershell
npm test
.\node_modules\.bin\tsc.cmd --noEmit
npm run build
```

Expected: all tests pass，TypeScript 无错误，electron-vite 构建成功。

- [ ] **Step 7: 手动验证核心切换**

Run:

```powershell
npm run dev
```

Verify:

- 只打开 Live2D 输出窗口。
- 右键模型出现顶部页签面板。
- 点击面板外部不会关闭面板。
- 关闭按钮和 `Esc` 能关闭面板。
- 拖动模型仍可工作。

- [ ] **Step 8: 提交**

```powershell
git add -A
git commit -m "feat: replace console with model context panel"
```

### Task 9: 文档与端到端验证

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: 已完成的控制面板。
- Produces: 更新后的用户文档和最终验证记录。

- [ ] **Step 1: 更新 README**

Replace the control-window description with:

```markdown
- 模型右键控制面板，集成聊天、语音、AI 设置、人物和动作切换。
```

Replace the “控制台可以配置” paragraph with:

```markdown
右键 Live2D 模型打开控制面板，可以配置：

- LLM 地址、模型、温度、超时和最大历史条数。
- TTS 和 STT 服务地址。
- GPT-SoVITS 安装目录和参考音频目录。
- 当前角色、服装、音色以及连续语音对话。
```

Update the project structure line from “控制台” to “模型右键控制面板”.

- [ ] **Step 2: 执行完整自动化验证**

Run:

```powershell
npm test
.\node_modules\.bin\tsc.cmd --noEmit
npm run build
```

Expected: 所有命令成功。

- [ ] **Step 3: 执行聊天与历史验证**

Run:

```powershell
npm run dev
```

Verify:

- 发送消息后消息流正常。
- 关闭面板后回复继续，重新打开能看到完整回复。
- 重启应用后聊天上下文与面板显示一致。
- 清空和角色切换后历史同步清空。

- [ ] **Step 4: 执行语音、设置和角色验证**

Verify:

- 语音回复和语音对话开关同步。
- 音色切换后状态更新。
- 按住说话能填入文本或自动发送。
- LLM 设置保存后重新打开值仍正确，API Key 输入框为空。
- 人物切换后当前高亮和动作列表立即更新。

- [ ] **Step 5: 执行穿透、尺寸和页签验证**

Verify:

- 面板在模型左右不同位置都能选择空间更大的一侧。
- 屏幕边角右键时面板不越界。
- 点击面板外部可操作下层应用，面板保持打开。
- 四个页签键盘切换正常。
- 修改页签后重启仍恢复到该页签。

- [ ] **Step 6: 提交**

```powershell
git add README.md
git commit -m "docs: document model context control panel"
```

## 计划自检

### 规格覆盖

- 面板布局、页签、定位和尺寸：Task 1、Task 5。
- 页签持久化和聊天历史：Task 2、Task 3。
- 精确鼠标穿透：Task 4、Task 8。
- 聊天页：Task 5、Task 8。
- 语音页和 AI 页：Task 6、Task 8。
- 角色与动作页：Task 7、Task 8。
- 删除控制台和主进程事件路由：Task 8。
- README 与端到端验证：Task 9。

### 类型和接口一致性

- `Rect` 在渲染定位和主进程命中模块中各自定义，避免跨进程导入 Electron 上下文代码。
- `ControlTab` 值固定为 `chat / voice / ai / character`。
- `ChatHistoryEntry` 的字段与 `MemoryEntry` 一致。
- `reportPanelBounds` 是前后端唯一的面板边界通道。
- `sendToOutput` 是所有主进程到渲染进程事件的统一出口。
