import { afterEach, describe, expect, it, vi } from 'vitest'
import { FasterWhisperProvider } from '../../src/main/voice/fasterWhisperProvider'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('FasterWhisperProvider', () => {
  it('probeReady accepts /health ok', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    )
    const provider = new FasterWhisperProvider({
      endpoint: 'http://127.0.0.1:9881',
      fetchImpl: fetchMock
    })

    await expect(provider.probeReady()).resolves.toBe(true)

    const [url] = fetchMock.mock.calls[0] as [string]
    expect(url).toBe('http://127.0.0.1:9881/health')
  })

  it('probeReady returns false when not ready', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('conn refused'))
    const provider = new FasterWhisperProvider({
      endpoint: 'http://127.0.0.1:9881',
      fetchImpl: fetchMock
    })

    await expect(provider.probeReady()).resolves.toBe(false)
  })

  it('transcribe posts multipart audio and returns text', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ text: '你好呀' }), { status: 200 })
    )
    const provider = new FasterWhisperProvider({
      endpoint: 'http://127.0.0.1:9881',
      fetchImpl: fetchMock
    })

    const result = await provider.transcribe(new Uint8Array([1, 2, 3]), 'auto')
    expect(result).toBe('你好呀')

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://127.0.0.1:9881/transcribe')
    expect(init.method).toBe('POST')
    expect(init.body).toBeInstanceOf(FormData)
  })

  it('transcribe throws a readable error on non-2xx', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('boom', { status: 500 }))
    const provider = new FasterWhisperProvider({
      endpoint: 'http://127.0.0.1:9881',
      fetchImpl: fetchMock
    })

    await expect(provider.transcribe(new Uint8Array([1]))).rejects.toThrow(/HTTP 500/)
  })

  it('transcribe returns empty string when service returns empty text', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ text: '' }), { status: 200 })
    )
    const provider = new FasterWhisperProvider({
      endpoint: 'http://127.0.0.1:9881',
      fetchImpl: fetchMock
    })

    await expect(provider.transcribe(new Uint8Array([1]))).resolves.toBe('')
  })

  it('requestExit hits /control without throwing when service already stopped', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('conn refused'))
    const provider = new FasterWhisperProvider({
      endpoint: 'http://127.0.0.1:9881',
      fetchImpl: fetchMock
    })

    await expect(provider.requestExit()).resolves.toBeUndefined()
  })
})
