# Chat Pet Phase 2 GPT-SoVITS 语音回复设计

日期：2026-09-02
状态：已确认，待用户审阅

## 背景

Phase 1 已完成文字聊天：Electron 主进程通过 OpenAI-compatible Provider 调用中转站，控制台显示流式回复，API Key 使用 safeStorage 加密保存。当前开始 Phase 2，为聊天宠物增加 GPT-SoVITS 语音回复。

Phase 2 只做 TTS 输出。不实现 Faster-Whisper 语音识别、完整语音对话、情绪、动作联动、长期记忆、唇形同步或 Wake Word。

## 已确认的产品决策

- 语音回复默认关闭；控制台提供“语音回复”开关。
- 打开语音回复后才按需启动 GPT-SoVITS，应用启动和文字聊天不启动、不占用 GPT-SoVITS 显存。
- 控制台可选择 5 个音色：若叶睦、千早爱音、白祥、黑祥、墨提斯。
- 每次切换 Live2D 模型时，音色自动跟随角色：
  - 非 `037_`/`341_` 模型：若叶睦。
  - `037_*` 模型：千早爱音。
  - `341_*` 模型：按用户确认的 A 方案默认白祥。
  - 墨提斯没有对应 Live2D 模型，只能手动选择。
- 手动选择的音色保留到下一次模型切换；模型切换后由联动规则覆盖。
- 语音启动或合成失败只影响语音状态，不影响文字聊天和 LLM 历史。
- 关闭“语音回复”时，若 GPT-SoVITS 是本应用启动的，则停止该子进程以释放显存；若端口上本来就是用户手动启动的服务，则不关闭外部进程。

## GPT-SoVITS 资源

- 项目根目录：`D:\GPT-SOVITS\GPT-SoVITS-v2pro-20250604-nvidia50\GPT-SoVITS-v2pro-20250604-nvidia50`
- Python：根目录 `runtime\python.exe`
- API 脚本：根目录 `api_v2.py`
- 启动方式：`runtime\python.exe api_v2.py -a 127.0.0.1 -p 9880 -c GPT_SoVITS/configs/tts_infer.yaml`
- 权重目录：`GPT_weights_v2Pro`、`SoVITS_weights_v2Pro`
- 训练/参考音频：工作区 `训练音频\`

### 音色资料表

| 音色 | GPT 权重 | SoVITS 权重 | 参考音频 | Prompt |
| --- | --- | --- | --- | --- |
| 若叶睦 | `Mujica_若葉睦_v2pp.ckpt` | `Mujica_若葉睦_v2pp.pth` | `训练音频\若叶睦\(A)ごめんなさい。バンド壊して、ギター下手で、ずっと謝りたかった.wav` | ごめんなさい。バンド壊して、ギター下手で、ずっと謝りたかった |
| 千早爱音 | `MyGO_千早爱音_v2pp.ckpt` | `MyGO_千早爱音_v2pp.pth` | `训练音频\千早爱音\训练集\そう！今度の朝活はおしゃれなカフェで美味しいモーニングをいっぱい食べるんだ～！.mp3` | そう！今度の朝活はおしゃれなカフェで美味しいモーニングをいっぱい食べるんだ～！ |
| 白祥 | `Mujica_豊川祥子_白_v2pp.ckpt` | `Mujica_豊川祥子_白_v2pp.pth` | `训练音频\丰川祥子（白祥）\(A)あなたと空を見上げるのは、いつも夏でしたわね.wav` | あなたと空を見上げるのは、いつも夏でしたわね |
| 黑祥 | `Mujica_豊川祥子_黒_v2pp.ckpt` | `Mujica_豊川祥子_黒_v2pp.pth` | `训练音频\丰川祥子（黑祥）\(A)今後は発言にプロとしての自覚をお持ちになって.wav` | 今後は発言にプロとしての自覚をお持ちになって |
| 墨提斯 | `Mujica_Mortis_v2pp.ckpt` | `Mujica_Mortis_v2pp.pth` | `训练音频\墨提斯\(A)なんで？解散なんて話になってなかったじゃない、どうしてそうなるの？.wav` | なんで？解散なんて話になってなかったじゃない、どうしてそうなるの？ |

参考音频和 Prompt 是首轮联调的可用配置；冒烟发现音色或发音不理想时只调整资料表，不改架构。

## 配置扩展

`userData/config.json` 中新增 `voice` 配置，并把旧的 `defaultVoice` 作为迁移来源：

```json
{
  "voice": {
    "enabled": false,
    "selectedVoice": "若叶睦",
    "ttsEndpoint": "http://127.0.0.1:9880",
    "gptSovitsDir": "D:\\GPT-SOVITS\\GPT-SoVITS-v2pro-20250604-nvidia50\\GPT-SoVITS-v2pro-20250604-nvidia50",
    "trainingAudioDir": "D:\\AGENT\\live\\训练音频",
    "startupTimeoutMs": 300000
  }
}
```

- `enabled`：语音回复开关，默认 false。
- `selectedVoice`：当前选中音色。
- 加载旧配置时，若没有 `selectedVoice` 但有 `defaultVoice`，则用 `defaultVoice` 迁移。
- API Key、LLM 设置和语音配置互不影响。

## 主进程模块

新增 `src/main/voice/`，继续沿用现有主进程服务层模式：

```text
src/main/voice/
├── interfaces.ts          TextToSpeech、AudioSink、VoiceManagerOptions 等接口
├── gptSoVITSProvider.ts   启动就绪探测、权重切换、/tts 合成
├── ttsManager.ts          生命周期、音色联动、说话编排
├── voiceCatalog.ts        音色资料表与路径解析
└── audioPlayer.ts         播放队列，通过输出窗口隐藏 <audio> 播放
```

`ChatManager` 不直接调用语音。主进程收到 `chat:complete` 后作为编排层调用 `TTSManager.speak()`，保持聊天与语音解耦。

### GPTSoVITSProvider

- `ensureStarted()`：先 GET `{endpoint}/tts` 探测端口。能收到 HTTP 400/422 等结构化响应即视为已就绪；连接失败则用 `runtime\python.exe api_v2.py ...` 启动，cwd 为 GPT-SoVITS 根目录。
- 就绪探测轮询间隔 2 秒，超时使用 `voice.startupTimeoutMs`。启动失败后终止本应用拉起的子进程并抛出错误。
- `setVoice(profile)`：依次 GET `/set_gpt_weights`、`/set_sovits_weights`，两次都成功才更新当前音色缓存。
- `synthesize(text, profile)`：POST `/tts`，`text_lang=auto`、`ref_audio_path`、`prompt_text`、`prompt_lang=ja`、`streaming_mode=0`，非流式返回完整 WAV 字节。
- HTTP 错误读取响应体并转成中文错误；解析失败时提供原始摘要，便于排查。

### TTSManager

- 记录 `enabled`、`selectedVoice`、当前 Live2D 模型和已加载音色。
- `setModel(modelId)`：调用共享映射函数得到目标音色；若与当前 `selectedVoice` 不同则更新并保存。
- `setVoice(voiceId)`：手动选择音色；墨提斯同样允许。
- `setEnabled(true)`：如果端口未就绪则懒启动；就绪后加载当前音色。`setEnabled(false)`：若 GPT-SoVITS 是本应用拉起的子进程，则调用 `/control?command=exit` 并在超时后强杀；外部服务不杀。
- `speak(text)`：仅在 `enabled` 时运行。等待启动完成和当前音色加载完成，再调用 Provider 合成并交给 `AudioPlayer`。
- 所有语音流程异步执行并捕获错误，错误只发 `voice:state`，不向聊天区抛错。
- 应用退出时若 GPT-SoVITS 是本应用拉起的子进程，则一并终止，避免遗留 `9880` 服务。

### AudioPlayer

- 持有一个 FIFO 队列，逐条播放。
- 播放依赖现有透明输出窗口：输出窗口新增隐藏 `<audio>` 元素。
- 主进程向输出窗口发送 WAV 字节，渲染进程用 `Blob` + `URL.createObjectURL()` 播放。
- 播放结束或失败后由输出窗口回报主进程，队列继续处理下一条。
- 关闭语音或应用退出时清空队列并通知输出窗口停止当前播放。
- 输出窗口不可用时放弃当前语音并发状态错误，不影响聊天。
- 不引入新 npm 依赖，不调用系统外部播放器。

### voiceCatalog

- 集中保存 5 个音色的权重文件名、参考音频文件名和 Prompt。
- 运行时根据 `gptSovitsDir` 与 `trainingAudioDir` 解析成绝对路径再传给 Provider，路径变更只改配置不散落在各模块。

## 音色与模型联动

共享层新增 `src/shared/voice.ts`：

- `VoiceId`：`若叶睦 | 千早爱音 | 白祥 | 黑祥 | 墨提斯`
- `VoiceOption`：显示名和 ID。
- `VOICE_OPTIONS`：5 个音色的固定顺序。
- `voiceIdForModel(modelId)`：
  - `341_*` → `白祥`
  - `037_*` → `千早爱音`
  - 其他 → `若叶睦`
- 联动只在模型切换时触发；手动选择音色不反向改 Live2D 模型。

## 数据流

```text
控制台发送消息
  → ChatManager 流式回复
  → chat:complete（控制台继续正常显示文字）
  → 主进程编排层：语音开启？→ TTSManager.speak(reply)
  → 确保 GPT-SoVITS 已启动
  → 确保当前音色已加载
  → POST /tts 获取 WAV
  → AudioPlayer 队列
  → 输出窗口隐藏 <audio> 播放
  → voice:state 更新控制台状态
```

## 控制台 UI

聊天区附近新增语音设置行：

- 复选框“语音回复”：默认不勾选。
- 下拉“音色”：固定 5 个音色，默认若叶睦。
- 状态文本：关闭、空闲、启动中、加载音色、合成中、播放中、错误原因。

切换模型后控制台自动刷新音色下拉为联动音色；手动下拉仍可临时选择其他音色。

## IPC 通道

新增：

- `voice:get`：控制台 invoke 获取状态视图。
- `voice:set-enabled`：控制台 → 主进程，开启或关闭语音回复。
- `voice:set-voice`：控制台 → 主进程，手动选择音色。
- `voice:state`：主进程 → 控制台，推送状态。
- `voice:play`：主进程 → 输出窗口，携带 WAV 字节。
- `voice:stop`：主进程 → 输出窗口，停止当前播放并释放 Blob URL。
- `voice:playback-ended`：输出窗口 → 主进程，播放完成。
- `voice:playback-error`：输出窗口 → 主进程，播放失败。

`src/preload/api.ts`、`src/renderer/src/global.d.ts` 同步补齐类型。

## 文件改动清单

新增：

- `src/shared/voice.ts`
- `src/main/voice/interfaces.ts`
- `src/main/voice/gptSoVITSProvider.ts`
- `src/main/voice/ttsManager.ts`
- `src/main/voice/voiceCatalog.ts`
- `src/main/voice/audioPlayer.ts`
- `tests/voice/modelVoiceMapping.test.ts`
- `tests/voice/gptSoVITSProvider.test.ts`
- `tests/voice/ttsManager.test.ts`
- `tests/voice/audioPlayer.test.ts`

修改：

- `src/shared/chat.ts`：扩展 VoiceConfig。
- `src/main/config.ts`：voice 配置加载、迁移和保存。
- `src/main/index.ts`：挂载 TTSManager、AudioPlayer 和相关 IPC。
- `src/preload/api.ts`、`src/renderer/src/global.d.ts`：语音 API。
- `src/renderer/control.html`、`src/renderer/src/control.ts`：语音开关、音色选择和状态。
- `src/renderer/index.html`、`src/renderer/src/main.ts`：隐藏音频播放。
- `tests/chat/configService.test.ts`：更新 voice 默认配置断言。

## 测试与验收

单元测试：

- 模型 ID → 音色映射，包括任意 `341_*` 返回白祥。
- ConfigService：默认值、旧 `defaultVoice` 迁移、保存语音配置。
- GPTSoVITSProvider：启动探测、HTTP 请求体、非 200 错误、返回音频字节。
- TTSManager：关闭时不启动服务、开启后懒启动、切换音色触发权重切换、语音失败不抛出到聊天、关闭时终止自启动进程。
- AudioPlayer：FIFO 顺序和下一首推进。

验证命令：

- `node_modules/.bin/vitest.cmd run`
- `node_modules/.bin/electron-vite.cmd build`

手动冒烟：

1. 应用启动不占用 `9880`。
2. 打开“语音回复”后 GPT-SoVITS 开始懒启动，状态正确更新。
3. 发送消息，文字流式出现后能听到当前音色朗读回复。
4. 切换模型到 `341_*`，音色自动变为白祥。
5. 手动选墨提斯后发送消息能朗读；切一次模型后音色恢复联动。
6. 关闭“语音回复”后本应用拉起的 GPT-SoVITS 退出，`9880` 释放。
7. GPT-SoVITS 未配置或启动失败时聊天仍正常，只显示语音错误状态。

## Phase 2 不做

- 不做 Faster-Whisper、麦克风录音或语音打断。
- 不做 GPT-SoVITS 流式边生成边播放。
- 不做 Live2D 口型、情绪或动作联动。
- 不做多角色系统、长期记忆或 RAG。
- 不在 Phase 2 引入 CharacterProfile 抽象。
