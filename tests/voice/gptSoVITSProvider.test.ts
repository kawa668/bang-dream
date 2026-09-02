import { afterEach, describe, expect, it, vi } from 'vitest'
import { GPTSoVITSProvider } from '../../src/main/voice/gptSoVITSProvider'
import type { VoiceProfile } from '../../src/main/voice/interfaces'

const profile: VoiceProfile = {
  voiceId: '白祥',
  gptWeightsPath: 'D:/gpt/GPT_weights_v2Pro/white.ckpt',
  sovitsWeightsPath: 'D:/gpt/SoVITS_weights_v2Pro/white.pth',
  referenceAudioPath: 'D:/audio/ref.wav',
  promptText: 'あなたと空を見上げるのは、いつも夏でしたわね',
  promptLang: 'ja'
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('GPTSoVITSProvider', () => {
  it('probeReady accepts the observed JSON validation message', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ message: 'ref_audio_path is required' }),
      { status: 400 }
    ))
    const provider = new GPTSoVITSProvider({
      endpoint: 'http://127.0.0.1:9880',
      fetchImpl: fetchMock
    })

    await expect(provider.probeReady()).resolves.toBe(true)

    const [url] = fetchMock.mock.calls[0] as [string]
    expect(url).toBe('http://127.0.0.1:9880/tts?text_lang=auto&prompt_lang=ja')
  })

  it('probeReady rejects text/plain 500 responses', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('Internal Server Error', { status: 500 })
    )
    const provider = new GPTSoVITSProvider({
      endpoint: 'http://127.0.0.1:9880',
      fetchImpl: fetchMock
    })

    await expect(provider.probeReady()).resolves.toBe(false)
  })

  it('loadVoice switches gpt and sovits weights in order', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('success'))
    const provider = new GPTSoVITSProvider({
      endpoint: 'http://127.0.0.1:9880',
      fetchImpl: fetchMock
    })

    await provider.loadVoice(profile)

    const urls = fetchMock.mock.calls.map((call) => call[0] as string)
    expect(urls[0]).toContain('/set_gpt_weights?weights_path=')
    expect(urls[0]).toContain(encodeURIComponent(profile.gptWeightsPath))
    expect(urls[1]).toContain('/set_sovits_weights?weights_path=')
    expect(urls[1]).toContain(encodeURIComponent(profile.sovitsWeightsPath))
  })

  it('synthesize posts text and returns audio bytes', async () => {
    const audio = new Uint8Array([1, 2, 3, 4])
    const fetchMock = vi.fn().mockResolvedValue(new Response(audio, {
      status: 200,
      headers: { 'Content-Type': 'audio/wav' }
    }))
    const provider = new GPTSoVITSProvider({
      endpoint: 'http://127.0.0.1:9880',
      fetchImpl: fetchMock
    })

    const result = await provider.synthesize(profile, '你好')

    expect(Array.from(result)).toEqual([1, 2, 3, 4])
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://127.0.0.1:9880/tts')
    const body = JSON.parse(String(init.body))
    expect(body).toMatchObject({
      text: '你好',
      text_lang: 'auto',
      ref_audio_path: profile.referenceAudioPath,
      prompt_text: profile.promptText,
      prompt_lang: 'ja',
      media_type: 'wav',
      streaming_mode: 0
    })
  })
})
