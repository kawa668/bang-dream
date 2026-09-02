import type { TextToSpeechProvider, VoiceProfile } from './interfaces'

export interface GPTSoVITSProviderOptions {
  endpoint: string
  fetchImpl?: typeof fetch
}

export class GPTSoVITSProvider implements TextToSpeechProvider {
  private readonly endpoint: string
  private readonly fetchImpl: typeof fetch

  constructor(options: GPTSoVITSProviderOptions) {
    this.endpoint = options.endpoint.replace(/\/+$/, '')
    this.fetchImpl = options.fetchImpl ?? fetch
  }

  async probeReady(): Promise<boolean> {
    const url = `${this.endpoint}/tts?text_lang=auto&prompt_lang=ja`
    let response: Response
    try {
      response = await this.fetchImpl(url)
    } catch {
      return false
    }
    const text = await response.text()
    try {
      const json = JSON.parse(text) as { message?: string }
      return typeof json.message === 'string'
        && json.message.includes('ref_audio_path is required')
    } catch {
      return false
    }
  }

  async loadVoice(profile: VoiceProfile): Promise<void> {
    await this.getCommand('/set_gpt_weights', { weights_path: profile.gptWeightsPath })
    await this.getCommand('/set_sovits_weights', { weights_path: profile.sovitsWeightsPath })
  }

  async synthesize(profile: VoiceProfile, text: string): Promise<Uint8Array> {
    const response = await this.fetchImpl(`${this.endpoint}/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        text_lang: 'auto',
        ref_audio_path: profile.referenceAudioPath,
        prompt_text: profile.promptText,
        prompt_lang: profile.promptLang,
        media_type: 'wav',
        streaming_mode: 0
      })
    })
    if (!response.ok) {
      const body = await response.text()
      throw new Error(`语音合成失败 HTTP ${response.status}: ${body.slice(0, 200)}`)
    }
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.byteLength === 0) throw new Error('语音服务返回空音频')
    return bytes
  }

  private async getCommand(
    path: string,
    params: Record<string, string>
  ): Promise<void> {
    const query = new URLSearchParams(params).toString()
    const response = await this.fetchImpl(`${this.endpoint}${path}?${query}`)
    if (!response.ok) {
      const body = await response.text()
      throw new Error(`语音服务切换失败 HTTP ${response.status}: ${body.slice(0, 200)}`)
    }
  }
}
