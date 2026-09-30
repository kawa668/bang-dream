# 模型右键控制面板整合设计

日期：2026-09-30
状态：设计已确认，待用户评审规格

## 背景

当前应用同时存在两个控制入口：

- Live2D 输出窗口中的模型右键菜单，只提供人物切换和动作播放。
- 独立控制台窗口，提供聊天、语音、LLM 设置、人物、动作和运行状态。

本次目标是将控制台的全部功能整合进模型右键 UI，并彻底取消独立控制台窗口。整合后的控制面板仍由 Live2D 输出窗口承载，不创建第二个窗口，也不使用嵌套 `WebContentsView`。

## 已确认决策

- 输出窗口是唯一控制入口。
- 采用顶部页签布局：`聊天 / 语音 / AI / 角色`。
- 面板打开后持续显示，直到点击关闭按钮或按 `Esc`。
- 点击面板外部不关闭面板，鼠标在模型和面板之外可以穿透到其他应用。
- 面板采用智能侧边定位，根据模型左右可用空间选择位置。
- 面板尺寸固定并自适应视口，不支持用户手动缩放。
- 应用运行期间及重启后恢复上次页签；首次打开时默认进入“聊天”。
- 应用重启后恢复聊天上下文，并在聊天页显示持久化历史。
- “角色”页中人物在上、动作在下，共用一个滚动区。
- 面板关闭后聊天继续运行，输入草稿、滚动位置和页签状态保留。

## 非目标

- 不修改 LLM、TTS、STT 和记忆系统的核心协议。
- 不新增联网账户、云同步或跨设备配置。
- 不为面板增加拖动、缩放和多窗口模式。
- 不改变 OBS 使用输出窗口进行捕获的现有方式。
- 不继续保留隐藏的控制台窗口作为兜底入口。

## 交互设计

### 打开与关闭

右键事件只有在 `Live2DRenderer.hitTest()` 命中模型时才被处理。打开面板时阻止默认右键菜单，并根据模型边界和右键位置计算面板坐标。

面板包含显式关闭按钮，同时监听 `Esc`。点击模型、画布空白区或其他应用不会关闭面板。面板关闭后，聊天流、语音状态和 STT 结果仍会被渲染进程接收并更新内部状态。

### 定位

新增纯函数 `calculatePanelPosition()`，输入为：

```ts
interface PanelPositionInput {
  click: { x: number; y: number }
  modelBounds: { x: number; y: number; width: number; height: number }
  panelSize: { width: number; height: number }
  viewport: { width: number; height: number }
}
```

定位规则：

1. 比较模型左侧和右侧可用于放下面板的宽度。
2. 优先选择可用空间更大的一侧。
3. 面板与模型之间保留 `12px` 间距。
4. 垂直位置靠近右键点，并限制在视口上下 `12px` 边界内。
5. 水平位置限制在视口左右 `12px` 边界内。
6. 模型边界缺失时，以右键点作为锚点，并使用相同的边界限制。

面板打开后不跟随模型拖动。窗口尺寸变化时重新计算并修正位置。

### 尺寸

- 宽度：`min(420px, viewportWidth - 24px)`。
- 高度：`min(620px, max(360px, viewportHeight * 0.82), viewportHeight - 24px)`。
- 面板内部页签内容独立滚动。
- 当视口高度不足 `384px` 时，高度固定为 `viewportHeight - 24px`，内容通过滚动访问。

### 顶部区域

顶部固定显示：

- 当前角色名。
- 当前服装。
- 当前语音运行状态。
- 关闭按钮。

顶部下方是四个一级页签：

1. 聊天
2. 语音
3. AI
4. 角色

页签使用 `tablist / tab / tabpanel` 语义。左右方向键切换页签，当前页签写入 `localStorage`。读取失败或值无效时回退到“聊天”。

### 聊天页

聊天页包含：

- 持久化历史消息。
- 用户和助手头像、作者、消息内容。
- 文本输入框。
- 按住说话按钮。
- 发送按钮。
- 清空按钮。
- 聊天状态。
- STT 状态。

行为：

- `Enter` 发送，`Shift + Enter` 不在当前单行输入框中引入换行。
- 面板隐藏时仍接收 `chat:start / delta / complete / error`。
- 面板重新打开后保留输入草稿和滚动位置。
- 清空聊天后立即清空界面，主进程完成记忆清空后发送 `chat:clear` 作为确认。
- 切换角色或模型触发现有会话重建时，聊天页同步清空。

### 语音页

语音页保留控制台现有功能：

- 语音回复开关。
- 语音对话开关。
- 音色下拉框。
- 语音运行状态。

语音状态由 `voice:state` 驱动，开关操作继续通过现有 requestId IPC 调用。

### AI 页

AI 页保留控制台现有字段：

- Base URL。
- API Key。
- 模型名。
- 当前角色。
- Temperature。
- 超时时间。
- 最大历史消息数。
- 保存按钮。
- 保存状态。

API Key 保存成功后立即清空输入框。界面不显示密钥明文，也不把密钥写入浏览器存储。

### 角色页

角色页分为上下两个区域：

1. 人物：按角色和模型分类折叠，显示当前模型高亮。
2. 动作：显示当前模型可用动作，按现有动作分类折叠。

切换模型后，角色页立即更新当前高亮和动作列表。两个区域共用同一个滚动容器。

### 底部状态

面板底部保留全局运行状态，显示主进程发送的 `app:status`。聊天、语音和 STT 的详细状态仍留在对应页签内，避免不同状态互相覆盖。

### 键盘与焦点

- 打开面板时聚焦面板容器，不自动聚焦文本输入框。
- `Esc` 关闭面板。
- `Tab` 在面板内按正常 DOM 顺序移动焦点，不建立焦点陷阱。
- 关闭面板后将焦点返回 Live2D 画布。
- 所有交互控件保留可见 `:focus-visible` 样式。

## 架构设计

### 主进程

`src/main/index.ts` 移除 `controlWindow` 及其创建、关闭和事件转发逻辑。输出窗口成为唯一 BrowserWindow。

新增统一发送函数：

```ts
function sendToOutput(channel: string, payload?: unknown): void
```

该函数检查输出窗口和 `webContents` 是否仍然可用，避免窗口关闭时的发送错误。

以下事件全部发送给输出窗口：

- `chat:start`
- `chat:delta`
- `chat:complete`
- `chat:error`
- `chat:clear`
- `character:changed`
- `voice:state`
- `stt:state`
- `stt:result`
- `app:status`
- `model:switch`
- `action:play`
- `ai:expression`

`model:changed` 的职责保持为“输出窗口已完成模型加载”。该事件用于主进程同步角色、聊天会话和语音跟踪，不再反向发送 `model:switch`，避免输出窗口形成切换循环。

全局快捷键仍由主进程直接向输出窗口发送 `model:switch`。模型加载完成后，输出窗口发送 `model:changed`，主进程再完成角色和会话同步。

### 预加载与共享类型

`src/preload/api.ts` 和 `src/renderer/src/global.d.ts` 做以下调整：

- 将 `reportMenuOpen(open)` 替换为 `reportPanelBounds(bounds | null)`。
- 新增 `getChatHistory(): Promise<ChatHistoryEntry[]>`。
- 复用现有聊天、语音、STT、配置和模型 IPC。

`ChatHistoryEntry` 包含：

```ts
interface ChatHistoryEntry {
  role: 'user' | 'assistant'
  content: string
  createdAt: number
}
```

主进程新增 `chat:history` 查询，直接读取现有 `memoryStore`，再按 `appConfig.llm.maxHistory` 截取最近消息。该查询不修改聊天上下文，返回范围与 `ChatSessionController.restore()` 恢复的运行时上下文一致。

### 输出渲染进程

`src/renderer/src/main.ts` 保留应用级编排职责：

- 初始化 Live2D。
- 初始化 ModelManager。
- 初始化 ControlPanel。
- 将模型切换、动作和 AI 表情事件路由到对应渲染组件。
- 维持音频播放。

控制面板拆分为以下模块：

| 模块 | 职责 |
| --- | --- |
| `controlPanel.ts` | 面板壳、页签、显隐、定位、尺寸观测、焦点和页签持久化 |
| `chatPanel.ts` | 历史、消息流、输入、发送、清空、录音和聊天状态 |
| `voicePanel.ts` | 语音开关、音色、语音状态 |
| `settingsPanel.ts` | LLM 配置读取、填写、校验、保存和状态 |
| `characterPanel.ts` | 模型清单、人物分组、动作分组和当前状态 |
| `panelPosition.ts` | 无 DOM 依赖的面板定位计算 |
| `panel.css` | 控制面板样式 |

删除 `src/renderer/control.html` 和 `src/renderer/src/control.ts`。

### 鼠标穿透

主进程保存两组渲染坐标：

- `modelBounds`
- `panelBounds`

鼠标拦截条件改为：

```text
光标位于模型边界内
或光标位于面板边界内
或正在拖动模型
```

面板打开本身不再让整个全屏输出窗口拦截鼠标。面板关闭时立即上报 `reportPanelBounds(null)`。

面板通过 `ResizeObserver` 或等价机制在尺寸变化后更新边界。主进程保留当前约 `30ms` 的光标位置检查节奏。

## 数据流

### 启动和历史恢复

```text
主进程读取 memoryStore
  -> ChatSessionController.restore()
  -> 创建输出窗口
  -> 聊天页调用 getChatHistory()
  -> 渲染与运行时上下文一致的最近历史消息
```

历史恢复只读取现有记录，不产生新的用户或助手消息。

### 发送聊天

```text
聊天页
  -> chat:send
  -> 主进程持久化用户消息并调用 ChatSessionController
  -> chat:start / delta / complete / error
  -> sendToOutput
  -> 聊天页更新消息
```

### 切换模型

```text
角色页或全局快捷键
  -> model:switch
  -> Live2DRenderer.load()
  -> model:changed
  -> 主进程同步聊天会话、角色和音色
  -> character:changed
  -> 面板更新角色和状态
```

`model:changed` 不触发第二轮 `model:switch`。

### 语音与 STT

```text
语音页操作
  -> voice:set-*
  -> TTSManager
  -> voice:state
  -> sendToOutput
  -> 语音页更新

聊天页按住说话
  -> stt:transcribe
  -> STTManager
  -> stt:state / stt:result
  -> sendToOutput
  -> 聊天页更新或自动发送
```

## 状态管理

- 主进程拥有配置、聊天上下文、持久化历史和语音服务生命周期。
- `memoryStore` 是持久化文本历史的唯一来源。
- `ChatSessionController` 是当前运行时聊天上下文的唯一来源。
- 渲染层拥有当前页签、面板显隐、输入草稿、滚动位置和消息 DOM。
- 页签键使用固定字符串，例如 `chat`、`voice`、`ai`、`character`。
- 应用重启后若页签值无效，默认回到 `chat`。

## 容错

- 历史读取失败：聊天页显示空状态和非阻塞错误。
- 配置加载或保存失败：AI 页显示错误，不改动现有配置。
- 模型清单失败：角色页显示错误，当前 Live2D 模型保持运行。
- 语音或 STT 失败：对应页签显示状态，不关闭面板，不影响聊天。
- 面板边界上报失败：模型原有鼠标穿透和拖动继续工作。
- 窗口尺寸变化后无法维持原位置：面板被修正到视口内，不超出屏幕。
- 输出窗口销毁：所有发送通过 `sendToOutput()` 安全检查。

## 可访问性

- 面板使用非模态 `role="dialog"` 语义。
- 页签使用标准 `tablist / tab / tabpanel` 关系。
- 页签通过 `aria-selected` 和 `aria-controls` 表达状态。
- 状态文本使用 `aria-live`。
- 关闭按钮提供明确的无障碍名称。
- 点击目标不小于 `44px`。
- 保留键盘焦点环和 `prefers-reduced-motion`。
- 选中状态同时使用颜色和字重，不依赖单一颜色。

## 测试

### 自动化测试

新增 `panelPosition` 单元测试，覆盖：

- 模型在左侧时选择右侧。
- 模型在右侧时选择左侧。
- 点击靠近顶部时向下修正。
- 点击靠近底部时向上修正。
- 小视口下收缩尺寸并保证边界。
- 缺少模型边界时使用右键点回退。

新增页签偏好测试，覆盖：

- 合法值正常读取。
- 无效值回退到聊天。
- 存储读取异常时回退到聊天。

执行现有完整测试和构建：

```powershell
npm test
.\node_modules\.bin\tsc.cmd --noEmit
npm run build
```

### 手动验证

- 启动后只有一个输出窗口，不再出现控制台。
- 在模型左右不同位置右键，面板选择空间较大的一侧并保持在视口内。
- 点击面板外部时面板保持打开，鼠标可操作下层应用。
- 点击模型仍可拖动，面板和模型交互不互相抢占事件。
- 四个页签均可操作，键盘切换和重启恢复有效。
- 聊天流式回复正常，关闭面板后回复继续，重新打开能看到完整结果。
- 重启应用后聊天上下文和聊天页历史一致。
- 清空聊天和切换角色后，界面与主进程上下文同步清空。
- 语音回复、语音对话、音色切换和按住说话正常。
- LLM 设置保存成功，API Key 不回填、不进入浏览器存储。
- 人物切换后动作列表立即更新。

## 明确取舍

面板位于 Live2D 输出窗口内，因此面板打开时会被 OBS 窗口捕获一并录制或直播；关闭面板后不显示。该行为与当前模型右键菜单一致，是采用同一输出渲染进程后的确定结果。

## 完成标准

- 独立控制台窗口及源码入口被移除。
- 控制台原有功能全部可以从模型右键面板访问。
- 面板关闭后聊天、语音和 STT 不中断。
- 智能定位、外部点击穿透、页签恢复和历史恢复通过验证。
- 自动化测试、类型检查和构建通过。
- 除输出窗口右键入口相关行为外，不改变现有聊天、语音和角色语义。
