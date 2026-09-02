import { describe, expect, it, vi } from 'vitest'
import { AudioPlayer } from '../../src/main/voice/audioPlayer'
import type { PlaybackSink } from '../../src/main/voice/audioPlayer'

describe('AudioPlayer', () => {
  it('plays queued audio in FIFO order', async () => {
    const deferred = new Map<string, { resolve: () => void; reject: (error: Error) => void }>()
    const order: string[] = []
    const sink: PlaybackSink = {
      play: (_requestId, playbackId, _audio) => new Promise<void>((resolve, reject) => {
        order.push(playbackId)
        deferred.set(playbackId, { resolve, reject })
      }),
      stop: vi.fn()
    }
    const player = new AudioPlayer(sink)

    const first = player.enqueue('req-1', new Uint8Array([1]))
    const second = player.enqueue('req-2', new Uint8Array([2]))

    await Promise.resolve()
    expect(order).toHaveLength(1)
    const firstPlaybackId = order[0]
    deferred.get(firstPlaybackId)?.resolve()
    await first
    await Promise.resolve()
    expect(order).toHaveLength(2)

    const secondPlaybackId = order[1]
    deferred.get(secondPlaybackId)?.resolve()
    await second
  })

  it('rejects a queued item when the sink fails', async () => {
    const sink: PlaybackSink = {
      play: () => Promise.reject(new Error('sink down')),
      stop: vi.fn()
    }
    const player = new AudioPlayer(sink)

    await expect(player.enqueue('req-1', new Uint8Array([1]))).rejects.toThrow('sink down')
  })
})
