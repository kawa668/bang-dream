import { createRequestId } from '../../shared/requestId'
import type { RequestId } from '../../shared/requestId'

export interface PlaybackSink {
  play(requestId: RequestId, playbackId: string, audio: Uint8Array): Promise<void>
  stop(playbackId: string): void
}

interface QueueItem {
  requestId: RequestId
  playbackId: string
  audio: Uint8Array
  resolve: () => void
  reject: (error: Error) => void
}

export class AudioPlayer {
  private queue: QueueItem[] = []
  private current: QueueItem | null = null

  constructor(private readonly sink: PlaybackSink) {}

  enqueue(requestId: RequestId, audio: Uint8Array): Promise<void> {
    return new Promise((resolve, reject) => {
      this.queue.push({
        requestId,
        playbackId: createRequestId('playback'),
        audio,
        resolve,
        reject
      })
      void this.pump()
    })
  }

  stopAll(): void {
    this.queue = []
    if (this.current) {
      const current = this.current
      this.current = null
      this.sink.stop(current.playbackId)
      current.reject(new Error('语音播放已停止'))
    }
  }

  private async pump(): Promise<void> {
    if (this.current || this.queue.length === 0) return
    const item = this.queue.shift()
    if (!item) return
    this.current = item
    try {
      await this.sink.play(item.requestId, item.playbackId, item.audio)
      item.resolve()
    } catch (error) {
      item.reject(error instanceof Error ? error : new Error(String(error)))
    } finally {
      if (this.current === item) this.current = null
      void this.pump()
    }
  }
}
