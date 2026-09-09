import type { SpeechToTextProvider } from './interfaces'

export interface FasterWhisperProviderOptions {
  endpoint: string
  fetchImpl?: typeof fetch
}

export class FasterWhisperProvider implements SpeechToTextProvider {
  private readonly endpoint: string
  private readonly fetchImpl: typeof fetch

  constructor(options: FasterWhisperProviderOptions) {
    this.endpoint = options.endpoint.replace(/\/+$/, '')
    this.fetchImpl = options.fetchImpl ?? fetch
  }

  async probeReady(): Promise<boolean> {
    try {
      const response = await this.fetchImpl(`${this.endpoint}/health`)
      if (!response.ok) return false
      const json = await response.json() as { ok?: boolean }
      return json.ok === true
    } catch {
      return false
    }
  }

  async transcribe(audio: Uint8Array, language = 'auto'): Promise<string> {
    const form = new FormData()
    form.append('file', new Blob([audio], { type: 'audio/webm' }), 'audio.webm')
    form.append('language', language)
    const response = await this.fetchImpl(`${this.endpoint}/transcribe`, {
      method: 'POST',
      body: form
    })
    if (!response.ok) {
      const body = await response.text()
      throw new Error(`语音识别失败 HTTP ${response.status}: ${body.slice(0, 200)}`)
    }
    const json = await response.json() as { text?: string }
    return json.text ?? ''
  }

  async requestExit(): Promise<void> {
    try {
      await this.fetchImpl(`${this.endpoint}/control?command=exit`)
    } catch {
      // 服务已退出时忽略连接错误
    }
  }
}
