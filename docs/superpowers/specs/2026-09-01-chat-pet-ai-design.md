# 聊天宠物 AI 模块设计

日期：2026-09-01
修订：2026-09-02
状态：已按评审意见修订，待实施计划

## 背景

现有项目是一个基于 Electron 的 Live2D 桌面宠物/直播应用，支持加载 26 套模型、切换角色、随机播放动作、全屏透明输出和拖动。本次目标是在现有项目基础上逐步增加 AI 聊天和语音能力，最终形成完整的桌面聊天宠物。

Phase 1 只做文字聊天最小实现：不启动 GPT-SoVITS，不创建 VoiceManager，不做语音合成、语音识别和表现层联动。

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
- 没有正式事件/消息抽象，但现有 IPC 模式可以继续沿用，不需要引入新框架。

## 推荐的新架构

Phase 1 采用主进程 AI 服务层，不引入 Voice 模块：

```text
Electron 主进程
├── ConfigService             读取/保存 userData/config.json
│                              API Key 使用 safeStorage 加密存储
├── ChatManager               聊天编排、消息管理、错误处理
│   ├── LLMProvider           OpenAI-compatible 请求
│   └── ConversationManager   会话历史、System Prompt、上下文策略
└── 现有窗口 / IPC / 快捷键

渲染进程
├── 输出窗口                   Live2D 渲染保持不变
└── 控制台                     新增聊天面板和 LLM 设置
```

Phase 2 及以后的语音模块按以下边界实现，不在 Phase 1 创建任何语音文件或子进程：

```text
Voice
├── TTSManager
│   └── GPTSoVITSProvider
├── STTManager
│   └── FasterWhisperProvider
└── AudioPlayer
```

TTS 和 STT 生命周期不同，AudioPlayer 从 Phase 2 起作为独立概念存在。

## 数据流

### Phase 1 文字聊天

```text
控制台输入框
  → preload IPC chat:send
  → 主进程 ChatManager
  → LLMProvider（异步 HTTP，不阻塞 UI）
  → chat:start / chat:delta* / chat:complete
  → 控制台聊天面板显示
```

### 聊天与语音的解耦约定

```text
ChatManager ──> chat:complete（只负责产生回复）
                          │
                          ↓
Phase 2 的 Voice 监听该事件，决定是否播放
```

ChatManager 不直接调用 TTS，也不决定回复是否要说出来。

### 语音链路（Phase 2 起，按需启动）

```text
用户开启语音回复
  → TTSManager 检测 GPT-SoVITS
  → 未启动则自动拉起 api_v2.py
  → 等待 127.0.0.1:9880 就绪
  → synthesize(text) → wav
  → AudioPlayer 播放
```

## Chat 模块设计

### LLMProvider

```ts
interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

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

- 架构只依赖 OpenAI-compatible 接口，不绑定供应商。
- 默认配置模型为 `deepseek v4flash`，可以通过配置随时换成任意 OpenAI-compatible 模型。
- 兼容流式 SSE 和非流式 JSON 两种响应。
- 所有请求在主进程异步执行。

### ConversationManager

- 保存 `system`、`user`、`assistant` 消息。
- 上下文裁剪作为可配置策略处理，Phase 1 默认 `maxHistory = 20`，由配置传入，不做架构硬限制。
- 后续可扩展为按 token 数、模型上下文窗口或 Memory 内容裁剪。
- 提供 `append()`、`clear()`、`snapshot()`。

### ChatManager

- `sendUserMessage(text)` 流程：
  1. 追加用户消息。
  2. 发 `chat:start`。
  3. 调用 LLMProvider，逐段发 `chat:delta`。
  4. 成功后追加助手消息并发 `chat:complete`。
- 失败时发 `chat:error`，不把坏回复写入历史。
- 流式中断时保留已显示部分并标记中断，历史只保存完整回复。
- 提供清空会话能力。
- 只负责聊天，不感知语音和 Live2D 状态。

## 配置系统

配置文件：Electron `userData/config.json`，位于仓库外，不会进入 Git。

```json
{
  "llm": {
    "baseUrl": "",
    "apiKeyEncrypted": "",
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

- `voice` 字段在 Phase 1 只作为预留配置存在，不读取、不展示、不启动任何服务。
- API Key 使用 Electron `safeStorage.encryptString()` 加密后写入 `apiKeyEncrypted`，解密只在主进程内存中完成。
- `safeStorage` 不可用时，API Key 只保留在当前会话内存，提示用户重新输入，不落盘明文。
- API Key 不硬编码进源码，不提交 Git。
- 渲染进程不保存明文 API Key，只通过 IPC 提交给主进程保存。
- 后续角色系统扩展时，把 `systemPrompt`、`defaultVoice`、`model` 收拢到 `CharacterProfile`，Phase 1 不引入新抽象。

## 语音模块规划（Phase 2 起）

Phase 1 不创建语音模块，不启动 GPT-SoVITS，不占用显存和内存。

Phase 2 建议文件：

- `src/main/voice/ttsManager.ts`
- `src/main/voice/gptSoVITSProvider.ts`
- `src/main/voice/sttManager.ts`
- `src/main/voice/fasterWhisperProvider.ts`
- `src/main/voice/audioPlayer.ts`
- `src/main/voice/interfaces.ts`

接口方向：

```ts
interface TextToSpeech {
  synthesize(text: string): Promise<{ audioPath: string }>
}

interface SpeechToText {
  transcribe(audioPath: string): Promise<string>
}
```

启动策略采用 lazy start：用户第一次开启语音回复时才启动 GPT-SoVITS，失败只影响语音，不影响聊天。

## 控制台界面

保持现有模型/动作折叠结构，Phase 1 新增：

- 聊天区：消息列表、输入框、发送按钮、清空会话按钮。
- LLM 设置折叠区：baseUrl、apiKey、model。
- 聊天状态：等待中、生成中、错误信息。

声音选择和语音服务状态属于 Phase 2，不在 Phase 1 界面中出现。

## IPC 通道

Phase 1 新增：

- `chat:send`：渲染进程 → 主进程，发送用户消息。
- `chat:start`：主进程 → 渲染进程，回复开始。
- `chat:delta`：主进程 → 渲染进程，流式片段。
- `chat:complete`：主进程 → 渲染进程，完整回复结束。
- `chat:error`：主进程 → 渲染进程，错误信息。
- `chat:clear`：清空会话。
- `config:get` / `config:save`：配置读取和保存。

## 第一阶段文件清单

新增：

- `src/shared/chat.ts`：ChatMessage 等共享类型。
- `src/main/config.ts`：ConfigService。
- `src/main/chat/llmProvider.ts`：OpenAICompatibleProvider。
- `src/main/chat/conversationManager.ts`：ConversationManager。
- `src/main/chat/chatManager.ts`：ChatManager。
- `tests/chat/conversationManager.test.ts`
- `tests/chat/llmProvider.test.ts`
- `tests/chat/chatManager.test.ts`

修改：

- `src/main/index.ts`：挂载 ChatManager，不挂载任何语音模块。
- `src/preload/api.ts`：新增聊天和配置 IPC。
- `src/renderer/control.html`：聊天和设置界面。
- `src/renderer/control.ts`：聊天逻辑。
- `src/renderer/src/global.d.ts`：API 类型。

## 容错策略

- LLM 未配置：控制台提示，不崩溃。
- 请求超时 / 中转站报错：聊天区显示错误，不写入历史。
- 流式中断：保留已显示部分并标记中断，历史只保存完整回复。
- safeStorage 不可用：API Key 只留在内存，提示重新输入。
- 所有耗时任务异步执行，不阻塞 UI。

## 测试与验收

单元测试：

- ConversationManager：追加、清空、超长历史裁剪。
- LLMProvider：请求 URL/header/body、SSE 解析、超时和 HTTP 错误。
- ChatManager：成功时 user/assistant 都写入历史；Provider 失败时 assistant 不写入历史。
- 现有 `npm test` 和 `npm run build` 必须保持通过。

手动验证：

- 配置 baseUrl / apiKey / model 后发送消息，能看到 start、delta、complete 的流式回复。
- 重启应用后配置仍在，API Key 不以明文出现在 `config.json` 或 Git 中。
- 未配置 LLM 时聊天区给出提示，不崩溃。
- Phase 1 不启动任何 GPT-SoVITS 子进程。

## 第一阶段不做

- 不创建 VoiceManager，不启动 GPT-SoVITS，不调用语音合成。
- 不做 Faster-Whisper 识别。
- 不做长期记忆、RAG、情绪系统、动作联动、多角色聊天。
- 不做唇形同步、语音打断、Wake Word。

## 开发路线

- Phase 1：文字聊天。
- Phase 2：TTSManager + GPTSoVITSProvider + AudioPlayer，按需启动 GPT-SoVITS。
- Phase 3：STTManager + FasterWhisperProvider，麦克风录音转文字。
- Phase 4：完整语音对话。
- Phase 5：CharacterProfile、状态和记忆接口。
- Phase 6：AI 状态与 Live2D 动作/表情联动。

## 风险

- 中转站 SSE 格式差异：Provider 需兼容流式/非流式。
- 主进程职责增长：保持模块单一职责，避免 `index.ts` 膨胀。
- safeStorage 依赖系统凭据：不可用时提供内存态降级，不写明文。
- Phase 2 GPT-SoVITS 启动慢：采用 lazy start，异步等待，失败不影响聊天。
- 后续音频播放冲突：AudioPlayer 作为独立模块，在 Phase 2 设计播放队列和打断规则。
- 未来角色/模型绑定：通过 `CharacterProfile` 收拢 systemPrompt、voice、model，避免 Phase 1 写死架构。
