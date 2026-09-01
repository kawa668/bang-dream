# 聊天宠物 AI 模块设计

日期：2026-09-01
状态：设计已确认，待实施计划

## 背景

现有项目是一个基于 Electron 的 Live2D 桌面宠物/直播应用，支持加载 26 套模型、切换角色、随机播放动作、全屏透明输出和拖动。本次目标是在现有项目基础上逐步增加 AI 聊天和语音能力，最终形成完整的桌面聊天宠物。

第一阶段只做项目分析、架构设计和文字聊天的最小实现，不实现语音合成、语音识别和表现层联动。

## 外部资源现状

- GPT-SoVITS：`D:\GPT-SOVITS\GPT-SoVITS-v2pro-20250604-nvidia50\GPT-SoVITS-v2pro-20250604-nvidia50`
  - 已训练权重：若叶睦、千早爱音、丰川祥子（白/黑）、墨提斯
  - API 入口：`api_v2.py`，默认监听 `127.0.0.1:9880`
- Faster-Whisper：位于 GPT-SoVITS 的 `runtime\Lib\site-packages\faster_whisper`
- 训练音频：工作区 `训练音频\`，按角色分目录存放

## 当前项目架构分析

### 技术栈

- Electron 37 + electron-vite 3 + TypeScript 5
- PixiJS 6.5 + pixi-live2d-display 0.4 + Live2D Cubism 2.1 本地运行时
- Vitest 3 + tsx

### 目录和入口

- 主进程入口：`src/main/index.ts`
- 渲染进程入口：`src/renderer/src/main.ts`
- 控制台入口：`src/renderer/src/control.ts`
- Live2D 渲染：`src/renderer/src/live2d.ts`
- 模型管理：`src/renderer/src/modelManager.ts`
- 模型清单：`src/renderer/public/models/manifest.json`
- 模型生成脚本：`scripts/prepare-models.ts`

### 核心模块现状

- 模型加载与渲染：`Live2DRenderer` 使用 PixiJS 渲染透明 Live2D 模型。
- 模型切换：主进程注册 `F1-F4` 全局快捷键，控制台通过 IPC 请求切模型。
- 动作系统：`getAvailableActions()`、`playMotion()`、`playRandomMotion()`，每 15 秒随机播放。
- UI 系统：输出窗口只显示模型和右键菜单；控制台显示模型按钮、动作列表和状态。
- 事件系统：没有独立事件总线，使用 Electron IPC 通道和 preload 封装。
- 异步机制：渲染进程使用 `setInterval`；主进程使用异步 IPC 和定时器；没有 Worker/线程机制。
- 音频代码：当前不存在。
- 网络请求代码：当前不存在。
- 配置系统：当前不存在，所有路径和快捷键写死在源码中。

### 可复用组件

- preload API 封装（`src/preload/api.ts`）
- 模型/动作分类逻辑（`src/shared/modelCategories.ts`、`src/shared/actionCategories.ts`）
- 模型清单缓存
- 现有错误日志写盘逻辑

## 当前架构存在的问题

- 主进程 `index.ts` 集中了窗口、快捷键、IPC 和定时器，继续加聊天/语音会继续膨胀。
- 没有统一配置系统，API Key、模型、系统提示词等没有落点。
- 没有网络请求层，渲染进程也不适合直接持有 API Key。
- 没有音频和子进程管理，GPT-SoVITS 生命周期需要新增模块。
- 没有正式事件/消息抽象，但现有 IPC 模式可以继续沿用，不需要引入新框架。

## 推荐的新架构

采用主进程统一 AI/Voice 服务层：

```text
Electron 主进程
├── ConfigService             读取/保存 userData/config.json
├── ChatManager               聊天编排、消息管理、错误处理
│   ├── LLMProvider           OpenAI-compatible 请求
│   └── ConversationManager   会话历史、System Prompt、上下文裁剪
├── VoiceManager              Phase 1 只做接口和生命周期骨架
│   ├── TTS                   GPT-SoVITS 调用接口预留
│   └── STT                   Faster-Whisper 调用接口预留
└── 现有窗口 / IPC / 快捷键

渲染进程
├── 输出窗口                   Live2D 渲染保持不变
└── 控制台                     新增聊天面板、LLM 设置、声音选择
```

### 数据流（Phase 1 文字聊天）

```text
控制台输入框
  → preload IPC chat:send
  → 主进程 ChatManager
  → LLMProvider（异步 HTTP，不阻塞 UI）
  → 流式回复逐段回 IPC
  → 控制台聊天面板显示
```

### 语音链路（本阶段只留接口）

```text
AI 回复文本
  → TTS.synthesize(text)（接口已定义，不实际调用）
  → 后续 Phase 2 接 GPT-SoVITS / 9880
```

## Chat 模块设计

### LLMProvider

```ts
interface LLMProvider {
  chat(messages: ChatMessage[]): Promise<AsyncIterable<string>>
}

class OpenAICompatibleProvider implements LLMProvider {
  baseUrl: string
  apiKey: string
  model: string
  timeoutMs: number
}
```

- 只实现 OpenAI-compatible API，默认模型 `deepseek v4flash`。
- 兼容流式 SSE 和非流式 JSON 两种响应。
- 所有请求在主进程异步执行。

### ConversationManager

- 保存 `system`、`user`、`assistant` 消息。
- 默认保留最近 20 条消息，超出后裁剪最旧消息。
- 提供 `append()`、`clear()`、`snapshot()`。

### ChatManager

- `sendUserMessage(text)`：追加用户消息、调用 LLM、流式回传、追加助手消息。
- 错误处理：失败时回传 `chat:error`，不把坏回复写入历史。
- 提供清空会话能力。

## 配置系统

配置文件：Electron `userData/config.json`，位于仓库外，不会进入 Git。

```json
{
  "llm": {
    "baseUrl": "",
    "apiKey": "",
    "model": "deepseek v4flash",
    "systemPrompt": "你是若叶睦，说话温柔克制，用中文简短回复。",
    "temperature": 0.8,
    "timeoutMs": 30000,
    "maxHistory": 20
  },
  "voice": {
    "ttsEndpoint": "http://127.0.0.1:9880",
    "gptSovitsDir": "D:\\GPT-SOVITS\\GPT-SoVITS-v2pro-20250604-nvidia50\\GPT-SoVITS-v2pro-20250604-nvidia50",
    "defaultVoice": "若叶睦"
  }
}
```

- API Key 不硬编码进源码，不提交 Git。
- 渲染进程不保存明文 API Key，只通过 IPC 提交给主进程保存。

## VoiceManager 骨架

Phase 1 只实现接口和生命周期，不实际调用 GPT-SoVITS 合成。

```ts
interface TextToSpeech {
  synthesize(text: string): Promise<{ audioPath: string }>
}

interface SpeechToText {
  transcribe(audioPath: string): Promise<string>
}
```

`VoiceManager` 职责：

- 应用启动时自动拉起 GPT-SoVITS API 子进程。
- 使用 GPT-SoVITS 自带 `runtime\python.exe` 运行 `api_v2.py -a 127.0.0.1 -p 9880`。
- 轮询 `127.0.0.1:9880` 端口直到就绪。
- 启动失败只更新“语音服务”状态，不影响聊天。
- 应用退出时关闭子进程。

## 控制台界面

保持现有模型/动作折叠结构，新增：

- 聊天区：消息列表、输入框、发送按钮、清空会话按钮。
- LLM 设置折叠区：baseUrl、apiKey、model。
- 声音选择折叠区：若叶睦 / 千早爱音 / 丰川祥子 / 墨提斯，默认若叶睦。
- 语音服务状态：启动中 / 已就绪 / 失败。

## IPC 通道

新增：

- `chat:send`：渲染进程 → 主进程，发送用户消息。
- `chat:message`：主进程 → 渲染进程，流式或完整回复。
- `chat:error`：主进程 → 渲染进程，错误信息。
- `chat:clear`：清空会话。
- `config:get` / `config:save`：配置读取和保存。
- `voice:status`：语音服务状态。

## 第一阶段文件清单

新增：

- `src/main/config.ts`
- `src/main/chat/llmProvider.ts`
- `src/main/chat/conversationManager.ts`
- `src/main/chat/chatManager.ts`
- `src/main/voice/voiceManager.ts`
- `src/main/voice/interfaces.ts`
- `tests/chat/conversationManager.test.ts`
- `tests/chat/llmProvider.test.ts`

修改：

- `src/main/index.ts`：挂载 ChatManager / VoiceManager。
- `src/preload/api.ts`：新增聊天、配置、语音状态 IPC。
- `src/renderer/control.html`：聊天和设置界面。
- `src/renderer/control.ts`：聊天逻辑。
- `src/renderer/src/global.d.ts`：API 类型。

## 容错策略

- LLM 未配置：控制台提示，不崩溃。
- 请求超时 / 中转站报错：聊天区显示错误，不写入历史。
- 流式中断：保留已显示部分并标记中断，历史只保存完整回复。
- GPT-SoVITS 启动失败：只影响语音状态。
- 所有耗时任务异步执行，不阻塞 UI。

## 测试与验收

单元测试：

- ConversationManager：追加、清空、超长历史裁剪。
- LLMProvider：请求 URL/header/body、SSE 解析、超时和 HTTP 错误。
- 现有 `npm test` 和 `npm run build` 必须保持通过。

手动验证：

- 配置 baseUrl / apiKey / model 后发送消息能看到流式回复。
- 重启应用后配置仍在。
- Git 中不出现 apiKey。
- 语音服务状态能显示启动/失败，且不阻塞聊天。

## 第一阶段不做

- 不调用 GPT-SoVITS 合成，不做 Faster-Whisper 识别。
- 不做长期记忆、RAG、情绪系统、动作联动、多角色聊天。
- 不做唇形同步、语音打断、Wake Word。

## 开发路线

- Phase 1：文字聊天。
- Phase 2：AI 回复 → GPT-SoVITS → 语音播放。
- Phase 3：麦克风 → Faster-Whisper → 文字 → AI。
- Phase 4：完整语音对话。
- Phase 5：人格、状态、记忆接口。
- Phase 6：AI 状态与 Live2D 动作/表情联动。

## 风险

- 中转站 SSE 格式差异：Provider 需兼容流式/非流式。
- 主进程职责增长：保持模块单一职责，避免 `index.ts` 膨胀。
- GPT-SoVITS 启动慢：异步启动，允许失败。
- API Key 明文存 userData：后续可用 Electron safeStorage 加密。
- 后续音频播放冲突：在 Phase 2 单独设计 AudioPlayer 队列。
