# Chat Pet Phase 3 Faster-Whisper 语音输入（STT）设计

日期：2026-09-09
状态：确认方向，进入实施

## 背景

Phase 1 已完成文字聊天，Phase 2 已完成 GPT-SoVITS 语音回复（TTS，文字进、语音出）。当前开始 Phase 3，为聊天宠物增加麦克风语音输入：录音后经 Faster-Whisper 转成文字，填入聊天输入框。

Phase 3 只做“语音进、文字出”。不实现完整语音对话闭环（说→听→答→播）、不实现语音打断、不做 Live2D 口型/情绪/动作联动、不做角色档案与长期记忆、不引入 Wake Word。

## 已确认的产品决策

- STT 模型采用 Faster-Whisper，与主设计文档 Phase 3 的 `STTManager + FasterWhisperProvider` 一致（路线 A）。
- 首次启用语音输入时需要联网下载 Faster-Whisper 模型；下载成功后缓存复用。默认 `large-v3-turbo`（约 1.5GB），下载到 GPT-SoVITS 的 `tools/asr/models` 目录。
- 服务端口 `9881`（与 TTS 的 `9880` 区分）。服务懒启动：第一次触发识别时才拉起，之后常驻直到应用退出，避免频繁重载大模型。
- 交互：控制台聊天输入框旁增加“按住说话”按钮。按住开始录音，松开结束并转写；识别结果**填入聊天输入框**（不自动发送），由用户决定是否发送。
- 麦克风权限被拒、模型下载失败、服务启动失败、识别为空：只更新 STT 状态并在控制台提示，不影响文字聊天与 TTS。
- 如果 `9881` 端口上本来就是用户手动启动的 STT 服务，则当作外部服务使用，应用退出时不关闭该外部进程。

## GPT-SoVITS 资源与 STT 能力

- Python：GPT-SoVITS 根目录 `runtime\python.exe`，已验证可导入 `faster_whisper` 1.1.1、`fastapi`、`uvicorn`。
- Faster-Whisper 模型：位于 `tools\asr\models`，首次需下载 ctranslate2 格式模型；`tools/asr/fasterwhisper_asr.py` 的 `download_model(model_size)` 可复用，模型下载到 `tools/asr/models/faster-whisper-<size>`。
- 本地 `tools/asr/models` 当前仅含 FunASR 中文模型，无 Faster-Whisper 模型；本阶段不依赖 FunASR，统一走 Faster-Whisper。
- ASR 脚本参考：`tools/asr/fasterwhisper_asr.py`，但它是“整目录批量转 `.list`”模式，不适合实时单文件，因此本阶段新建一个单文件 HTTP 服务脚本。

## 架构

沿用 Phase 2 的“主进程服务层 + 懒启动子进程 + HTTP 服务”模式，新增 STT 分支，TTS/STT 相互独立：

```text
Electron 主进程
├── ChatManager / LLMProvider / ConversationManager（Phase 1，不变）
├── TTSManager / GPTSoVITSProvider / AudioPlayer（Phase 2，不变）
├── STTManager                        新增：生命周期、状态、转写编排
│   └── FasterWhisperProvider         新增：HTTP 客户端（/health 探测、/transcribe）
└── ElectronSttProcessLauncher        新增：spawn asr_api.py

渲染进程（控制台）
├── 聊天区新增“按住说话”录音按钮
└── STT 状态展示（空闲/启动中/识别中/错误）
```

`ChatManager` 不感知 STT。录音转写结果只回填输入框，不直接进入 ChatManager；是否发送由用户操作决定。这样 Phase 3 的 STT 是一个纯工具性入口，为 Phase 4 的完整对话预留解耦。

## Python STT 服务脚本 `scripts/asr_api.py`

新增 `scripts/asr_api.py`，用 GPT-SoVITS 的 `runtime\python.exe` 启动。命令行参数：

```text
python asr_api.py --gpt-sovits-dir <目录> -a 127.0.0.1 --port 9881 -s large-v3-turbo -l auto --precision float16
```

- `--gpt-sovits-dir`：GPT-SoVITS 根目录，脚本将其加入 `sys.path`，用于复用 `tools.asr.fasterwhisper_asr.download_model` 与模型目录解析；`cwd` 设为该目录，保证相对路径 `tools/asr/models/...` 正确。
- `-s/--model-size`：默认 `large-v3-turbo`，选项与 `tools/asr/config.py` 的 `get_models()` 一致。
- `-l/--language`：默认 `auto`。
- `--precision`：默认 `auto`；有 CUDA 用 `float16`，否则 `int8/float32`（由脚本根据 `torch.cuda.is_available()` 自动降级，无法用 `float16` 时用 `int8`）。
- 启动时加载模型到内存（`WhisperModel(model_path, device, compute_type)`），若 `tools/asr/models/faster-whisper-<size>` 不存在，先调用 `download_model(model_size)` 下载。

接口：

```text
GET  /health  → 200 {"ok": true}          # 就绪探测
POST /transcribe (multipart: file) → 200 {"text": "..."}
GET  /control?command=exit → 200            # 进程退出
```

- `/health` 返回 JSON，可用作自启动后的就绪判据。
- `/transcribe` 接收上传的音频文件（渲染进程录音产物，webm/wav），保存到临时文件，交给 `WhisperModel.transcribe(audio=path, language=..., beam_size=5, vad_filter=True)`，拼接 segments 为文本，返回 `{"text": text}`。
- `/control?command=exit` 触发进程正常退出，供主进程停止自启动服务；外部服务不调用。
- 空音频或识别为空时返回 `200 {"text": ""}`，由主进程判定为空结果。
- 服务进程长期驻留，不随单次请求退出；应用退出时由主进程终止自启动的 STT 子进程。

## 配置扩展

`userData/config.json` 的 `voice` 新增字段，并在 `config.ts` 的 `DEFAULT_CONFIG` 与归一化逻辑中同步：

```json
{
  "voice": {
    "ttsEndpoint": "http://127.0.0.1:9880",
    "sttEndpoint": "http://127.0.0.1:9881",
    "whisperModel": "large-v3-turbo",
    "sttPrecision": "auto",
    "sttTimeoutMs": 600000,
    "gptSovitsDir": "D:\\GPT-SOVITS\\...",
    "trainingAudioDir": "D:\\AGENT\\live\\训练音频",
    "startupTimeoutMs": 300000,
    "enabled": false,
    "selectedVoice": "若叶睦"
  }
}
```

- `sttEndpoint`：STT 服务地址，默认 `http://127.0.0.1:9881`。
- `whisperModel`：Faster-Whisper 模型尺寸，默认 `large-v3-turbo`。
- `sttPrecision`：`auto | float16 | int8 | float32`，默认 `auto`（`auto` 由服务端按 CUDA 决定）。
- `sttTimeoutMs`：模型下载/启动超时，默认 `600000`（10 分钟，覆盖首次下载）。
- 旧配置加载时缺省字段回填默认值；STT 字段可不展示在 LLM 设置面板，仅作为配置落点。

> STT 没有独立的“启用”开关：它是“即用即启”的工具入口，由“按住说话”触发。配置中 `enabled` 仍只作用于 TTS 语音回复，不影响 STT。

## 主进程模块

新增 `src/main/voice/`：

### interfaces.ts（扩展）

- `SpeechToTextProvider`：
  ```ts
  interface SpeechToTextProvider {
    probeReady(): Promise<boolean>
    transcribe(audioPath: string, language?: string): Promise<string>
    requestExit(): Promise<void>
  }
  ```
- `SttProcessLauncher`：
  ```ts
  interface SttProcessLauncher {
    launch(options: { gptSovitsDir: string; port: number; model: string; precision: string }): GptSoVITSProcess
  }
  ```
  > `GptSoVITSProcess` 复用现有只含 `kill()` 的进程接口，避免重复定义。

### fasterWhisperProvider.ts

`FasterWhisperProvider` 实现 `SpeechToTextProvider`：

- `probeReady()`：`GET {endpoint}/health`，能返回 `ok: true` 视为就绪；连接失败返回 false。
- `transcribe(audioPath, language?)`：`POST {endpoint}/transcribe`，`multipart/form-data`，字段 `file`；返回 JSON 的 `text`。HTTP 非 2xx 时读取响应体抛中文错误。
- `requestExit()`：`GET {endpoint}/control?command=exit`，捕获连接错误忽略（服务已退出）。
- 支持注入 `fetchImpl` 便于测试（与 `GPTSoVITSProvider` 一致）。

### sttManager.ts

`STTManager` 组成：

- 字段：`endpoint`、`model`、`precision`、`gptSovitsDir`、`timeoutMs`、`pollIntervalMs`。
- `transcribe(audioBytes: Uint8Array, requestId: string)`：仅在收到调用时运行。
  1. 写临时音频文件（`os.tmpdir` + requestId）。
  2. `ensureStarted()`：`probeReady` 失败则用 launcher 启动子进程，轮询 `/health` 直到就绪或超时；成功则 `managed=true`。
  3. 调用 provider `transcribe(path)`，得到文本。
  4. 删除临时文件，返回文本，并发出 `stt:result`。
- 状态机：`idle | starting | transcribing | error`。`starting` 覆盖首次模型下载与进程启动；只影响 `stt:state`，不向聊天区抛错。
- `dispose()`：应用退出时若 `managed` 为真则终止自启动子进程。
- `stateMessage(requestId?)` 返回 `SttStateMessage`。

### index.ts（修改）

- 新增 `setupSttSystem()`，构建 `STTManager`、`FasterWhisperProvider`、`ElectronSttProcessLauncher`。
- 新增 IPC：
  - `stt:transcribe`：渲染进程 → 主进程 `{ requestId, audio }`。
  - `stt:state`：主进程 → 控制台 `{ requestId?, state }`。
  - `stt:result`：主进程 → 控制台 `{ requestId, text }`。
- `before-quit` 中先 `voiceManager.dispose()` 再 `sttManager.dispose()`，最后 `app.quit()`。
- 渲染进程麦克风权限：给 `controlWindow` 对应的 session 设置 `setPermissionRequestHandler`，对 `media` 权限直接授权（仅对本应用），否则 `getUserMedia` 会因权限被拒而不能录音。

## 共享类型 `src/shared/voice.ts`（扩展）或 `src/shared/stt.ts`

沿用 Phase 2 把类型集中在 `shared/voice.ts` 的做法，在本文件补：

```ts
export type SttRuntimeState = 'idle' | 'starting' | 'transcribing' | 'error'

export interface SttStateView {
  runtimeState: SttRuntimeState
  message?: string
}

export interface SttStateMessage {
  requestId?: string
  state: SttStateView
}
```

## 数据流

```text
控制台按住说话
  → getUserMedia + MediaRecorder → Blob → ArrayBuffer
  → IPC stt:transcribe { requestId, audio }
  → 主进程 STTManager.transcribe
  → 确保 ASR 服务已启动（懒启动 + /health 探测）
  → 写临时音频文件
  → FasterWhisperProvider POST /transcribe
  → asr_api.py WhisperModel.transcribe → text
  → stt:result { requestId, text }
  → 控制台填入聊天输入框；状态回到 idle
```

## 控制台 UI

- 聊天输入行新增“按住说话”麦克风按钮（图标 `mic` 语义，用 SVG/按钮）。按住停留时录音中，松开结束并转写。
- 依据：按住说话需要 `navigator.mediaDevices.getUserMedia` 与 `MediaRecorder`；mimeType 采用浏览器默认（webm/opus）。
- 状态文本展示在聊天区附近：空闲 / 启动识别服务（首次可能下载模型）/ 识别中 / 错误原因（如权限被拒、识别为空）。`starting` 文案需包含“首次可能下载模型”提示。
- 识别为空或权限被拒时通过 `stt:state` 用 `message` 给出可读提示。

## IPC 通道

新增：

- `stt:transcribe`：控制台 → 主进程 `{ requestId, audio }`。
- `stt:state`：主进程 → 控制台 `{ requestId?, state }`。
- `stt:result`：主进程 → 控制台 `{ requestId, text }`。

`src/preload/api.ts`、`src/renderer/src/global.d.ts` 同步补齐类型。

## 文件改动清单

新增：

- `scripts/asr_api.py`
- `src/main/voice/fasterWhisperProvider.ts`
- `src/main/voice/sttManager.ts`
- `src/main/voice/electronSttProcessLauncher.ts`
- `tests/voice/fasterWhisperProvider.test.ts`
- `tests/voice/sttManager.test.ts`

修改：

- `src/shared/voice.ts`：新增 Stt 类型。
- `src/shared/chat.ts`：`VoiceConfig` 增补 STT 字段。
- `src/main/config.ts`：STT 默认值与归一化。
- `src/main/index.ts`：挂载 STTManager、IPC、权限处理、退出清理。
- `src/main/voice/interfaces.ts`：`SpeechToTextProvider` / `SttProcessLauncher`。
- `src/preload/api.ts`、`src/renderer/src/global.d.ts`：STT API。
- `src/renderer/control.html`、`src/renderer/src/control.ts`：录音按钮、状态与结果回填。
- `tests/chat/configService.test.ts`：更新 voice 默认值断言。

## 测试与验收

单元测试：

- `FasterWhisperProvider`：`/health` 就绪探测、`/transcribe` 请求体（multipart 含 file）、非 2xx 错误、空文本返回空字符串。
- `STTManager`：写临时文件并删除；懒启动逻辑（探测失败则 spawn）；识别失败不向聊天抛错、只发状态；`dispose` 终止自启动子进程。
- `ConfigService`：新增 STT 默认值、旧配置缺省回填。

验证命令：

- `node_modules/.bin/vitest.cmd run`
- `node_modules/.bin/electron-vite.cmd build`

手动冒烟：

1. 应用启动不占用 `9881`，不启动 STT 子进程。
2. 点击/按住“说话”，首次触发模型下载与启动，状态正确显示“启动中/识别中”。
3. 录音完成，识别文本回填到聊天输入框；不自动发送。
4. 发送后聊天与 TTS 回复流程不受影响。
5. 麦克风权限被拒时给出可读错误，聊天与语音回复正常。
6. 识别为空时提示“未识别到内容”，不崩溃。
7. 应用退出时结束本应用拉起的 STT 子进程，`9881` 释放。

## Phase 3 不做

- 不做完整语音对话闭环（说→听→答→播）。
- 不做语音打断、Wake Word。
- 不做 Live2D 口型、情绪或动作联动。
- 不做多角色系统、长期记忆或 RAG。
- 不引入 CharacterProfile 抽象。
- 不在本阶段实现后台常驻“随时可唤醒”的免按键模式；仅保留“按住说话”入口。
