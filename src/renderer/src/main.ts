import { Live2DRenderer } from './live2d'
import { fetchModelManifest } from './models'
import { MediaPipeTracker } from './tracking/mediapipeTracker'

async function startCamera(): Promise<HTMLVideoElement> {
  const video = document.createElement('video')
  video.autoplay = true
  video.muted = true
  video.playsInline = true
  video.style.display = 'none'
  document.body.appendChild(video)
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }
  })
  video.srcObject = stream
  await video.play()
  return video
}

async function main(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>('#live2d-canvas')
  if (!canvas) throw new Error('canvas not found')

  const manifest = await fetchModelManifest()
  const renderer = new Live2DRenderer(canvas)
  await renderer.load(manifest[0].modelJsonUrl)

  const video = await startCamera()
  const tracker = new MediaPipeTracker()
  tracker.start(video, (frame) => {
    console.log('tracking frame', frame.face?.landmarks.length, frame.hands?.length)
  }, {
    enableFace: true,
    enableHands: true,
    inputWidth: 1280,
    inputHeight: 720
  })
}

main().catch((error) => {
  console.error(error)
})