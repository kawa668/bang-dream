# 若叶睦 AI 桌面 Live2D

Windows 桌面 Live2D 角色应用，集成多角色聊天、GPT-SoVITS 语音合成、Faster Whisper 语音识别、表情联动和 OBS 直播输出。

## 功能

- 26 套 Live2D 模型：若叶睦 4 套、千早爱音 17 套、丰川祥子 5 套。
- 五个全局角色人设：若叶睦、千早爱音、白祥、黑祥、墨提斯。
- OpenAI 兼容接口聊天，支持流式回复、历史记录和会话内记忆。
- GPT-SoVITS v2Pro 语音合成，支持五套音色和自动切换。
- Faster Whisper 语音输入，可选择时自动开启连续语音对话。
- 根据回复内容自动切换 Live2D 表情。
- 透明、置顶、鼠标穿透的 Live2D 输出窗口，适合 OBS 窗口捕获。
- 控制台支持角色切换、服装选择、动作播放、聊天和 AI 参数配置。

## 环境要求

- Windows 10/11。
- Node.js LTS 和 npm。
- 可选：本地 GPT-SoVITS v2Pro 安装，用于语音合成和语音识别运行时。

Node 依赖安装在仓库的 `node_modules` 中。仓库不包含 GPT-SoVITS 权重、Whisper 模型、参考音频或 API Key。

## 快速启动

双击 `start-live2d.bat`。脚本会：

1. 检查 Node.js/npm。
2. 缺少 `node_modules` 时执行 `npm install`。
3. 缺少模型清单时执行 `npm run prepare:models`。
4. 通过 `npm run dev` 启动应用。

也可以手动启动：

```powershell
npm install
npm run dev
```

只有在替换或重新生成 Live2D 模型资源时，才需要执行：

```powershell
npm run prepare:models
```

该脚本默认从 `D:\codex\模型下载\live2d` 读取源模型，可通过 `LIVE2D_SOURCE_ROOT` 修改。

## 测试与构建

```powershell
npm run test
npm run build
```

生产构建输出到 `out/`，该目录可随时重新生成。

如果全局 `npx` 或 `npm` 启动异常，可以直接使用项目内命令：

```powershell
.\node_modules\.bin\vitest.cmd run
.\node_modules\.bin\tsc.cmd --noEmit
.\node_modules\.bin\electron-vite.cmd build
```

## 配置

运行配置保存在：

```text
%APPDATA%\live2d-mutsumi-streaming\config.json
```

聊天历史保存在同目录的 `memory.json`。API Key 使用系统安全存储加密，不会以明文写入配置。

控制台可以配置：

- LLM 地址、模型、温度、超时和最大历史条数。
- TTS 服务和 STT 服务地址。
- GPT-SoVITS 安装目录和参考音频目录。
- 当前角色、服装、音色以及连续语音对话。

## 语音服务

### GPT-SoVITS

默认 TTS 地址为 `http://127.0.0.1:9880`。服务未运行时，应用会尝试通过配置的 `voice.gptSovitsDir` 自动启动。

语音合成需要：

- `GPT_weights_v2Pro\*.ckpt`
- `SoVITS_weights_v2Pro\*.pth`
- `voice.trainingAudioDir` 下对应的参考音频

当前默认参考音频目录：

```text
D:\GPT-SOVITS\训练音频
```

音色和参考文本定义在 `src/main/voice/voiceCatalog.ts`。

### Faster Whisper

默认 STT 地址为 `http://127.0.0.1:9881`。服务未运行时，应用会使用 GPT-SoVITS 自带 Python 启动 `scripts/asr_api.py`。

默认模型目录：

```text
<gptSovitsDir>\tools\asr\models\faster-whisper-large-v3-turbo
```

完整的 `large-v3-turbo` 模型必须包含 `model.bin`。首次启动可能需要加载数秒到十几秒。

## 角色与提示词

五个角色的名称、系统提示词和默认音色定义在：

```text
src/shared/characterProfiles.ts
```

修改角色性格、语气或回复要求时编辑对应角色的 `systemPrompt`。修改语音参考文本时编辑 `voiceCatalog.ts` 中的 `promptText`。

## 热键

- `F1`：若叶睦便装
- `F2`：若叶睦活动剧情装
- `F3`：千早爱音常服
- `F4`：千早爱音生日 2024

输出窗口聚焦时也可以使用数字键 `1-4` 切换。

## OBS

1. 新建“窗口捕获”。
2. 选择“若叶睦 Live2D”输出窗口。
3. 开启透明通道。
4. 如需给直播伴侣使用，再开启 OBS Virtual Camera。

## 项目结构

```text
src/main/       Electron 主进程、聊天、配置、TTS、STT、记忆
src/preload/    IPC 桥接
src/renderer/   Live2D 输出窗口和控制台
src/shared/     角色、音色、模型、表情和共享类型
scripts/        Live2D 模型整理和 ASR API
tests/          Vitest 测试
docs/           设计和实施记录
resources/      应用图标
```

## 常见问题

### TTS 提示参考音频不存在

检查 `voice.trainingAudioDir`，并确认对应角色的目录和参考文件实际存在。路径错误会在启动音色前直接显示完整缺失路径。

### 语音识别一直停在“正在启动”

检查 `model.bin` 和其他 Whisper 模型文件是否完整。应用现在会在 Python 子进程退出时立即显示错误，不再等待完整超时。

### F1-F4 注册失败

其他程序可能占用了快捷键。关闭冲突程序后重启应用，或使用控制台切换模型。

### 输出窗口不响应鼠标

窗口默认点击穿透；鼠标移动到模型区域后会自动恢复交互，离开时重新穿透。
