import type { OutfitId } from '../../shared/types'
import { Live2DRenderer } from './live2d'
import { ModelManager } from './modelManager'
import { mapTrackingToParams } from './tracking/paramMapper'
import { ParamSmoother } from './tracking/smoother'
import { MediaPipeTracker } from './tracking/mediapipeTracker'

async function main(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>('#live2d-canvas')
  if (!canvas) throw new Error('canvas not found')

  const renderer = new Live2DRenderer(canvas)
  const modelManager = new ModelManager(renderer)
  await modelManager.init()
  window.api.reportStatus('模型已加载')

  const video = document.createElement('video')
  video.autoplay = true
  video.muted = true
  video.playsInline = true
  video.style.display = 'none'
  document.body.appendChild(video)

  const startCameraWithRetry = async (): Promise<void> => {
    while (true) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }
        })
        video.srcObject = stream
        await video.play()
        window.api.reportStatus('摄像头已启动')
        return
      } catch (error) {
        console.error('camera unavailable, retry in 5s', error)
        window.api.reportStatus('摄像头不可用，5 秒后重试')
        await new Promise((resolve) => setTimeout(resolve, 5000))
      }
    }
  }
  await startCameraWithRetry()

  const tracker = new MediaPipeTracker()
  const smoother = new ParamSmoother(0.35)
  tracker.start(
    video,
    (frame) => renderer.setParams(smoother.update(mapTrackingToParams(frame))),
    {
      enableFace: true,
      enableHands: true,
      inputWidth: 1280,
      inputHeight: 720
    }
  )
  window.api.reportStatus('动捕运行中')

  const localShortcutIds: OutfitId[] = ['casual', 'event', 'school_summer', 'school_winter']
  window.addEventListener('keydown', (event) => {
    const index = ['1', '2', '3', '4'].indexOf(event.key)
    if (index >= 0) modelManager.switchModel(localShortcutIds[index]).catch((error) => console.error(error))
  })

  window.api.onModelSwitch((id) => {
    modelManager.switchModel(id)
      .then(() => window.api.reportStatus(`当前服装：${id}`))
      .catch((error) => console.error(error))
  })
}

main().catch((error) => {
  console.error(error)
})