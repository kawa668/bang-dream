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
