import type { BrowserWindow } from 'electron'
import type { RequestId } from '../../shared/requestId'
import type { PlaybackSink } from './audioPlayer'

interface PendingPlayback {
  resolve: () => void
  reject: (error: Error) => void
  timer: NodeJS.Timeout
}

export class ElectronAudioSink implements PlaybackSink {
  private readonly pending = new Map<string, PendingPlayback>()

  constructor(
    private readonly getWindow: () => BrowserWindow | null,
    private readonly timeoutMs = 30000
  ) {}

  play(requestId: RequestId, playbackId: string, audio: Uint8Array): Promise<void> {
    const window = this.getWindow()
    if (!window || window.isDestroyed()) {
      return Promise.reject(new Error('输出窗口不可用，无法播放语音'))
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(playbackId)
        reject(new Error('音频播放超时'))
      }, this.timeoutMs)
      this.pending.set(playbackId, { resolve, reject, timer })
      window.webContents.send('voice:play', {
        requestId,
        playbackId,
        audio
      })
    })
  }

  stop(playbackId: string): void {
    const window = this.getWindow()
    if (window && !window.isDestroyed()) {
      window.webContents.send('voice:stop', { playbackId })
    }
    this.settle(playbackId, new Error('语音播放已停止'))
  }

  handlePlaybackEnded(requestId: RequestId, playbackId: string): void {
    const pending = this.pending.get(playbackId)
    if (!pending) return
    this.pending.delete(playbackId)
    clearTimeout(pending.timer)
    pending.resolve()
  }

  handlePlaybackError(
    requestId: RequestId,
    playbackId: string,
    message: string
  ): void {
    const pending = this.pending.get(playbackId)
    if (!pending) return
    this.pending.delete(playbackId)
    clearTimeout(pending.timer)
    pending.reject(new Error(message))
  }

  private settle(playbackId: string, error: Error): void {
    const pending = this.pending.get(playbackId)
    if (!pending) return
    this.pending.delete(playbackId)
    clearTimeout(pending.timer)
    pending.reject(error)
  }
}
