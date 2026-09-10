import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  LLMRequestCancelledError,
  OpenAICompatibleProvider
} from '../../src/main/chat/llmProvider'
import type { ChatMessage } from '../../src/shared/chat'

function streamResponse(chunks: string[]): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    }
  })
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } })
}

function jsonResponse(content: string): Response {
  return new Response(
    JSON.stringify({ choices: [{ message: { content } }] }),
    { headers: { 'Content-Type': 'application/json' } }
  )
}

const messages: ChatMessage[] = [{ role: 'user', content: '你好' }]

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('OpenAICompatibleProvider', () => {
  it('sends an OpenAI-compatible chat completions request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse('你好'))
    vi.stubGlobal('fetch', fetchMock)
    const provider = new OpenAICompatibleProvider({
      baseUrl: 'https://relay.example.com/v1/',
      apiKey: 'secret',
      model: 'deepseek v4flash',
      sessionId: 'ses_test-session',
      temperature: 0.8,
      timeoutMs: 5000
    })

    const chunks: string[] = []
    for await (const chunk of provider.chat(messages)) chunks.push(chunk)

    expect(chunks).toEqual(['你好'])
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://relay.example.com/v1/chat/completions')
    expect(init.headers).toMatchObject({
      'Content-Type': 'application/json',
      Authorization: 'Bearer secret',
      'x-opencode-session': 'ses_test-session'
    })
    const body = JSON.parse(String(init.body))
    expect(body).toMatchObject({
      model: 'deepseek v4flash',
      messages,
      stream: true,
      temperature: 0.8
    })
  })

  it('parses SSE chunks into deltas', async () => {
    const sse = [
      'data: {"choices":[{"delta":{"content":"你"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"好"}}]}\n\n',
      'data: [DONE]\n\n'
    ]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(streamResponse(sse)))
    const provider = new OpenAICompatibleProvider({
      baseUrl: 'https://relay.example.com',
      apiKey: 'secret',
      model: 'deepseek v4flash',
      sessionId: 'ses_test-session',
      temperature: 0.8,
      timeoutMs: 5000
    })

    const chunks: string[] = []
    for await (const chunk of provider.chat(messages)) chunks.push(chunk)

    expect(chunks).toEqual(['你', '好'])
  })

  it('throws on HTTP errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('unauthorized', { status: 401 })))
    const provider = new OpenAICompatibleProvider({
      baseUrl: 'https://relay.example.com',
      apiKey: 'bad',
      model: 'deepseek v4flash',
      sessionId: 'ses_test-session',
      temperature: 0.8,
      timeoutMs: 5000
    })

    await expect(async () => {
      for await (const _chunk of provider.chat(messages)) {
        // consume stream
      }
    }).rejects.toThrow('LLM HTTP 401')
  })

  it('times out when the server never responds', async () => {
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => {
        const error = new Error('aborted')
        error.name = 'AbortError'
        reject(error)
      })
    })))
    const provider = new OpenAICompatibleProvider({
      baseUrl: 'https://relay.example.com',
      apiKey: 'secret',
      model: 'deepseek v4flash',
      sessionId: 'ses_test-session',
      temperature: 0.8,
      timeoutMs: 10
    })

    await expect(async () => {
      for await (const _chunk of provider.chat(messages)) {
        // consume stream
      }
    }).rejects.toThrow(/timed out/)
  })

  it('cancels an in-flight request without reporting a timeout', async () => {
    const controller = new AbortController()
    let requestSignal!: AbortSignal
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => {
      requestSignal = init.signal as AbortSignal
      return new Promise((_resolve, reject) => {
        requestSignal.addEventListener('abort', () => {
          const error = new Error('aborted')
          error.name = 'AbortError'
          reject(error)
        })
      })
    }))
    const provider = new OpenAICompatibleProvider({
      baseUrl: 'https://relay.example.com',
      apiKey: 'secret',
      sessionId: 'ses_test-session',
      model: 'deepseek-v4-flash',
      temperature: 0.8,
      timeoutMs: 5000
    })

    const run = async () => {
      for await (const _chunk of provider.chat([], controller.signal)) {
        // consume
      }
    }
    const pending = expect(run()).rejects.toBeInstanceOf(LLMRequestCancelledError)
    controller.abort()
    await pending
  })
})
