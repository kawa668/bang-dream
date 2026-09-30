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
      ? `${label}：${state.message}`
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
