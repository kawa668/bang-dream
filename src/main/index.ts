import { appendFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { app, BrowserWindow, globalShortcut, ipcMain, screen, session } from 'electron'
import type { ChatEvent } from './chat/chatManager'
import { ChatSessionController } from './chat/chatSessionController'
import { OpenAICompatibleProvider } from './chat/llmProvider'
import { ConfigService } from './config'
import { ElectronSecretStore } from './electronSecretStore'
import {
  selectRecentChatHistory,
  type AppConfig,
  type LLMSettingsSave
} from '../shared/chat'
import { createRequestId } from '../shared/requestId'
import type { SttStateMessage, VoiceId, VoiceStateMessage } from '../shared/voice'
import { isVoiceId } from '../shared/voice'
import { detectEmotion } from '../shared/emotion'
import { GPTSoVITSProvider } from './voice/gptSoVITSProvider'
import { FasterWhisperProvider } from './voice/fasterWhisperProvider'
import { TTSManager } from './voice/ttsManager'
import { STTManager } from './voice/sttManager'
import { JSONMemoryStore } from './memory/memoryStore'
import { ElectronVoiceProcessLauncher } from './voice/electronVoiceProcessLauncher'
import { ElectronSttProcessLauncher } from './voice/electronSttProcessLauncher'
import { buildVoiceCatalog } from './voice/voiceCatalog'
import { AudioPlayer } from './voice/audioPlayer'
import { ElectronAudioSink } from './voice/electronAudioSink'
import { shouldInterceptCursor } from './windowInteraction'

const SHORTCUTS: Array<[string, string]> = [
  ['F1', 'casual'],
  ['F2', 'event'],
  ['F3', '037_casual-2023'],
  ['F4', '037_birthday_2024_ssr']
]

let outputWindow: BrowserWindow | null = null
let modelBounds: { x: number; y: number; width: number; height: number } | null = null
let panelBounds: { x: number; y: number; width: number; height: number } | null = null
let isDragging = false
let mouseInterceptEnabled = false
let chatSessionController: ChatSessionController | null = null
let configService: ConfigService | null = null
let appConfig: AppConfig | null = null
let voiceManager: TTSManager | null = null
let sttManager: STTManager | null = null
let audioPlayer: AudioPlayer | null = null
let audioSink: ElectronAudioSink | null = null
let memoryStore: JSONMemoryStore | null = null
let currentEmotion: string | null = null
let quitting = false

function resolveAppIcon(): string | undefined {
  const name = process.platform === 'win32' ? 'icon.ico' : 'icon.png'
  const candidates = [
    join(app.getAppPath(), 'resources', name),
    join(__dirname, '../../resources', name)
  ]
  return candidates.find((candidate) => existsSync(candidate))
}

function sendToOutput(channel: string, payload?: unknown): void {
  if (!outputWindow || outputWindow.isDestroyed()) return
  outputWindow.webContents.send(channel, payload)
}

function createOutputWindow(): BrowserWindow {
  const { workArea } = screen.getPrimaryDisplay()
  const icon = resolveAppIcon()
  outputWindow = new BrowserWindow({
    x: workArea.x,
    y: workArea.y,
    width: workArea.width,
    height: workArea.height,
    transparent: true,
    frame: false,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    alwaysOnTop: true,
    ...(icon ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  outputWindow.setIgnoreMouseEvents(true)

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) outputWindow.loadURL(devUrl)
  else outputWindow.loadFile(join(__dirname, '../renderer/index.html'))
  outputWindow.on('closed', () => { outputWindow = null })
  return outputWindow
}

const writeErrorLog = (error: unknown): void => {
  appendFile(join(app.getPath('userData'), 'live2d-error.log'), `${new Date().toISOString()} ${error instanceof Error ? error.stack : String(error)}\n`).catch(() => {})
}

function broadcastChatEvent(event: ChatEvent): void {
  if (event.type === 'start') sendToOutput('chat:start', event)
  if (event.type === 'delta') sendToOutput('chat:delta', event)
  if (event.type === 'complete') sendToOutput('chat:complete', event)
  if (event.type === 'error') sendToOutput('chat:error', event)
}

function handleChatEvent(event: ChatEvent): void {
  if (event.type === 'complete') {
    currentEmotion = detectEmotion(event.message)
    sendToOutput('chat:complete', { ...event, emotion: currentEmotion })
    sendToOutput('ai:expression', { emotion: currentEmotion })
    void memoryStore?.append({ role: 'assistant', content: event.message, createdAt: Date.now() })
    void voiceManager?.speak(event.message, event.requestId)
  } else {
    broadcastChatEvent(event)
  }
}

function setupVoiceSystem(): void {
  if (!configService || !appConfig) return
  const sink = new ElectronAudioSink(() => outputWindow)
  audioSink = sink
  const player = new AudioPlayer(sink)
  audioPlayer = player
  voiceManager = new TTSManager({
    voiceConfig: appConfig.voice,
    catalog: buildVoiceCatalog({
      gptSovitsDir: appConfig.voice.gptSovitsDir,
      trainingAudioDir: appConfig.voice.trainingAudioDir
    }),
    provider: new GPTSoVITSProvider({ endpoint: appConfig.voice.ttsEndpoint }),
    launcher: new ElectronVoiceProcessLauncher(),
    persist: (changes) => {
      if (!configService || !appConfig) return
      appConfig = configService.applyVoiceConfig(appConfig, changes)
      void configService.save(appConfig).catch(() => {})
    },
    onState: (message: VoiceStateMessage) => {
      sendToOutput('voice:state', message)
    },
    play: (requestId, audio) => player.enqueue(requestId, audio),
    stopPlayback: () => player.stopAll()
  })
}

function setupSttSystem(): void {
  if (!appConfig) return
  sttManager = new STTManager({
    endpoint: appConfig.voice.sttEndpoint,
    gptSovitsDir: appConfig.voice.gptSovitsDir,
    model: appConfig.voice.whisperModel,
    precision: appConfig.voice.sttPrecision,
    timeoutMs: appConfig.voice.sttTimeoutMs,
    scriptPath: join(app.getAppPath(), 'scripts', 'asr_api.py'),
    launcher: new ElectronSttProcessLauncher(),
    provider: new FasterWhisperProvider({ endpoint: appConfig.voice.sttEndpoint }),
    onState: (message: SttStateMessage) => {
      sendToOutput('stt:state', message)
    },
    onResult: (requestId, text) => {
      sendToOutput('stt:result', { requestId, text })
    }
  })
}

app.whenReady().then(async () => {
  const service = new ConfigService(
    join(app.getPath('userData'), 'config.json'),
    new ElectronSecretStore()
  )
  configService = service
  const loadedConfig = await service.load()
  appConfig = loadedConfig
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === 'media')
  })
  setupVoiceSystem()
  setupSttSystem()

  const store = new JSONMemoryStore(join(app.getPath('userData'), 'memory.json'))
  memoryStore = store
  chatSessionController = new ChatSessionController({
    config: loadedConfig,
    applyCharacter: (config, characterId) => service.applyCharacter(config, characterId),
    persist: async (config) => {
      await service.save(config)
      appConfig = config
    },
    createProvider: (config) => new OpenAICompatibleProvider({
      baseUrl: config.llm.baseUrl,
      apiKey: service.getApiKey(config),
      sessionId: config.llm.sessionId,
      model: config.llm.model,
      temperature: config.llm.temperature,
      timeoutMs: config.llm.timeoutMs
    }),
    cancelVoice: () => {
      voiceManager?.cancelSpeech()
      audioPlayer?.stopAll()
    },
    applyVoice: (voiceId) => voiceManager?.setVoice(voiceId),
    clearMemory: () => store.clear(),
    onChatEvent: handleChatEvent,
    onClear: (requestId) => {
      sendToOutput('chat:clear', { requestId })
    },
    onCharacterChanged: (character) => {
      sendToOutput('character:changed', {
        id: character.id,
        name: character.name
      })
    },
    onError: (requestId, message) => {
      sendToOutput('chat:error', { requestId, message })
    }
  })
  const past = await store.load()
  if (past.length > 0) {
    chatSessionController.restore(past.map(({ role, content }) => ({ role, content })))
  }

  createOutputWindow()

  ipcMain.on('status', (_event, status: string) => {
    sendToOutput('app:status', status)
  })

  ipcMain.on('action:play', (_event, action: string) => {
    outputWindow?.webContents.send('action:play', action)
  })

  ipcMain.on('model:changed', (_event, id: string) => {
    void chatSessionController
      ?.switchToModel(id, createRequestId('model-change'))
      .then((switched) => {
        if (switched) voiceManager?.trackModel(id)
      })
  })

  ipcMain.on('model:switch-request', (_event, id: string) => {
    outputWindow?.webContents.send('model:switch', id)
  })

  ipcMain.on('model:bounds', (_event, bounds: { x: number; y: number; width: number; height: number }) => {
    modelBounds = bounds
  })

  ipcMain.on('panel:bounds', (_event, bounds: {
    x: number
    y: number
    width: number
    height: number
  } | null) => {
    panelBounds = bounds
  })

  ipcMain.on('drag-state', (_event, dragging: boolean) => {
    isDragging = dragging
  })

  ipcMain.on('chat:send', (_event, payload: { requestId: string; text: string }) => {
    if (!payload?.requestId) return
    void memoryStore?.append({ role: 'user', content: payload.text.trim(), createdAt: Date.now() })
    void chatSessionController?.send(payload.requestId, payload.text)
  })

  ipcMain.on('chat:clear', (_event, payload: { requestId: string }) => {
    if (!payload?.requestId) return
    void chatSessionController?.clear(payload.requestId)
  })

  ipcMain.handle('chat:history', async () => {
    const entries = (await memoryStore?.load()) ?? []
    return selectRecentChatHistory(entries, appConfig?.llm.maxHistory ?? 0)
  })

  ipcMain.handle('voice:get', (_event, requestId: string) => (
    voiceManager?.stateMessage(requestId) ?? null
  ))

  ipcMain.on('stt:transcribe', (_event, payload: {
    requestId: string
    audio: Uint8Array
  }) => {
    if (!payload?.requestId) return
    void sttManager?.transcribe(payload.audio, payload.requestId)
  })

  ipcMain.handle('stt:get', (_event, requestId: string) => (
    sttManager?.stateMessage(requestId) ?? null
  ))

  ipcMain.on('voice:set-enabled', (_event, payload: {
    requestId: string
    enabled: boolean
  }) => {
    if (!payload?.requestId) return
    void voiceManager?.setEnabled(Boolean(payload.enabled), payload.requestId)
  })

  ipcMain.on('voice:set-voice', (_event, payload: {
    requestId: string
    voiceId: VoiceId
  }) => {
    if (!payload?.requestId || !isVoiceId(payload.voiceId)) return
    void chatSessionController?.switchToVoice(payload.voiceId, payload.requestId)
  })

  ipcMain.on('voice:set-conversation', (_event, payload: {
    requestId: string
    enabled: boolean
  }) => {
    if (!payload?.requestId || !configService || !appConfig) return
    appConfig = configService.applyVoiceConfig(appConfig, {
      enabled: appConfig.voice.enabled,
      selectedVoice: appConfig.voice.selectedVoice,
      voiceConversationEnabled: Boolean(payload.enabled)
    })
    void configService.save(appConfig).catch(() => {})
    voiceManager?.setVoiceConversation(Boolean(payload.enabled))
  })

  ipcMain.on('voice:playback-ended', (_event, payload: {
    requestId: string
    playbackId: string
  }) => {
    audioSink?.handlePlaybackEnded(payload.playbackId)
  })

  ipcMain.on('voice:playback-error', (_event, payload: {
    requestId: string
    playbackId: string
    message: string
  }) => {
    audioSink?.handlePlaybackError(payload.playbackId, payload.message)
  })

  ipcMain.handle('config:get', () => {
    if (!configService || !appConfig) return null
    return configService.toView(appConfig)
  })

  ipcMain.handle('config:save', async (_event, save: LLMSettingsSave) => {
    if (!configService || !appConfig) return null
    const nextConfig = configService.applySave(appConfig, save)
    await chatSessionController?.updateConfig(nextConfig)
    return appConfig ? configService.toView(appConfig) : null
  })

  setInterval(() => {
    if (!outputWindow || !modelBounds) return
    const cursor = screen.getCursorScreenPoint()
    const winBounds = outputWindow.getBounds()
    const shouldIntercept = shouldInterceptCursor({
      cursor,
      windowBounds: winBounds,
      modelBounds,
      panelBounds,
      dragging: isDragging
    })
    if (shouldIntercept !== mouseInterceptEnabled) {
      mouseInterceptEnabled = shouldIntercept
      outputWindow.setIgnoreMouseEvents(!shouldIntercept)
    }
  }, 30)

  for (const [accelerator, id] of SHORTCUTS) {
    const ok = globalShortcut.register(accelerator, () => {
      sendToOutput('model:switch', id)
    })
    if (!ok) console.warn(`shortcut registration failed: ${accelerator}`)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createOutputWindow()
    }
  })
})

app.on('before-quit', (event) => {
  if ((!voiceManager && !sttManager) || quitting) return
  event.preventDefault()
  quitting = true
  chatSessionController?.dispose()
  void Promise.all([
    voiceManager?.dispose() ?? Promise.resolve(),
    sttManager?.dispose() ?? Promise.resolve()
  ]).finally(() => {
    audioPlayer?.stopAll()
    app.quit()
  })
})

app.on('will-quit', () => globalShortcut.unregisterAll())

process.on('uncaughtException', (error) => {
  writeErrorLog(error)
  console.error('uncaughtException', error)
})

process.on('unhandledRejection', (error) => {
  writeErrorLog(error)
  console.error('unhandledRejection', error)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
