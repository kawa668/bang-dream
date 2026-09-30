import type { OutfitId } from '../../shared/types'
import { pickExpressionAction } from '../../shared/emotion'
import type { Emotion } from '../../shared/emotion'
import { Live2DRenderer } from './live2d'
import { ModelManager } from './modelManager'
import { ControlPanel } from './controlPanel'
import { ChatPanel } from './chatPanel'
import { VoicePanel } from './voicePanel'
import { SettingsPanel } from './settingsPanel'
import { CharacterPanel } from './characterPanel'
import './panel.css'

let manualActionUntil = 0
let currentVoiceUrl: string | null = null

async function main(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>('#live2d-canvas')
  if (!canvas) throw new Error('canvas not found')

  const renderer = new Live2DRenderer(canvas)
  const modelManager = new ModelManager(renderer)
  await modelManager.init()

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

  canvas.addEventListener('contextmenu', (event) => {
    if (!renderer.hitTest(event.clientX, event.clientY)) return
    event.preventDefault()
    panel.open(
      { x: event.clientX, y: event.clientY },
      renderer.getModelBounds()
    )
  })

  setInterval(() => {
    if (Date.now() < manualActionUntil || panel.isOpen) return
    const action = renderer.playRandomMotion()
    if (action) window.api.reportStatus(`动作：${action}`)
  }, 15000)

  const localShortcutIds: OutfitId[] = ['casual', 'event', 'school_summer', 'school_winter']
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

  window.addEventListener('keydown', (event) => {
    const index = ['1', '2', '3', '4'].indexOf(event.key)
    if (index >= 0) switchModel(localShortcutIds[index])
  })

  window.api.onModelSwitch((id) => {
    switchModel(id)
  })

  window.api.onActionPlay((action) => {
    manualActionUntil = Date.now() + 8000
    const played = renderer.playMotion(action)
    window.api.reportStatus(played ? `动作：${action}` : `当前模型没有动作：${action}`)
  })

  window.api.onAiExpression(({ emotion }) => {
    const action = pickExpressionAction(
      renderer.getAvailableActions(),
      emotion as Emotion
    )
    if (!action) return
    manualActionUntil = Date.now() + 8000
    renderer.playMotion(action)
    window.api.reportStatus(`情绪动作：${action}`)
  })

  window.api.onCharacterChanged((character) => {
    panel.setCharacterName(character.name)
    settingsPanel.setCharacterName(character.name)
  })

  window.api.onStatus((message) => {
    panel.setGlobalStatus(message)
  })

  const voiceAudio = document.querySelector<HTMLAudioElement>('#voice-audio')
  if (voiceAudio) {
    window.api.onVoicePlay(({ requestId, playbackId, audio }) => {
      if (currentVoiceUrl) URL.revokeObjectURL(currentVoiceUrl)
      const arrayBuffer = audio.buffer.slice(
        audio.byteOffset,
        audio.byteOffset + audio.byteLength
      ) as ArrayBuffer
      const blob = new Blob([arrayBuffer], { type: 'audio/wav' })
      currentVoiceUrl = URL.createObjectURL(blob)
      voiceAudio.src = currentVoiceUrl
      voiceAudio.onended = () => window.api.reportVoiceEnded(requestId, playbackId)
      voiceAudio.onerror = () => {
        window.api.reportVoiceError(requestId, playbackId, '音频播放失败')
      }
      void voiceAudio.play().catch((error) => {
        window.api.reportVoiceError(requestId, playbackId, String(error))
      })
    })

    window.api.onVoiceStop(() => {
      voiceAudio.pause()
      voiceAudio.currentTime = 0
      voiceAudio.onended = null
      voiceAudio.onerror = null
      if (currentVoiceUrl) {
        URL.revokeObjectURL(currentVoiceUrl)
        currentVoiceUrl = null
      }
    })
  }

  const initialModel = modelManager.getCurrent() ?? 'casual'
  panel.setModelLabel(initialModel)
  chatPanel.setCurrentModel(initialModel)
  void characterPanel.setCurrentModel(initialModel)
  window.api.reportStatus('随机动作模式')
  window.api.reportModel(initialModel)
}

main().catch((error) => {
  console.error(error)
})
