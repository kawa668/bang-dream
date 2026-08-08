import {
  FaceLandmarker,
  FilesetResolver,
  HandLandmarker,
  PoseLandmarker,
  type NormalizedLandmark
} from '@mediapipe/tasks-vision'
import type { LandmarkPoint, TrackingFrame, TrackingOptions } from '../../../shared/tracking'

function toPoint(landmark: NormalizedLandmark): LandmarkPoint {
  return { x: landmark.x, y: landmark.y, z: landmark.z }
}

function blendshapeMap(categories?: Array<{ categoryName: string; score: number }>): Record<string, number> {
  const result: Record<string, number> = {}
  for (const category of categories ?? []) result[category.categoryName] = category.score
  return result
}

export class MediaPipeTracker {
  private faceLandmarker: FaceLandmarker | null = null
  private handLandmarker: HandLandmarker | null = null
  private poseLandmarker: PoseLandmarker | null = null
  private rafId = 0
  private running = false

  async start(
    video: HTMLVideoElement,
    onFrame: (frame: TrackingFrame) => void,
    options: TrackingOptions
  ): Promise<void> {
    const vision = await FilesetResolver.forVisionTasks('./vendor/mediapipe-wasm')

    if (options.enableFace) {
      this.faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: './vendor/face_landmarker.task',
          delegate: 'GPU'
        },
        runningMode: 'VIDEO',
        numFaces: 1
      })
    }

    if (options.enableHands) {
      this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: './vendor/hand_landmarker.task',
          delegate: 'GPU'
        },
        runningMode: 'VIDEO',
        numHands: 2
      })
    }

    if (options.enableBody) {
      this.poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: './vendor/pose_landmarker_full.task',
          delegate: 'GPU'
        },
        runningMode: 'VIDEO',
        numPoses: 1
      })
    }

    this.running = true
    const tick = (): void => {
      if (!this.running) return
      const timestamp = performance.now()
      const frame: TrackingFrame = {}

      const faceResult = this.faceLandmarker?.detectForVideo(video, timestamp)
      if (faceResult?.faceLandmarks.length) {
        frame.face = {
          landmarks: faceResult.faceLandmarks[0].map(toPoint),
          blendshapes: blendshapeMap(faceResult.faceBlendshapes?.[0]?.categories)
        }
      }

      const handResult = this.handLandmarker?.detectForVideo(video, timestamp)
      if (handResult?.landmarks.length) {
        frame.hands = handResult.landmarks.map((hand) => hand.map(toPoint))
      }

      const poseResult = this.poseLandmarker?.detectForVideo(video, timestamp)
      if (poseResult?.landmarks.length) {
        frame.body = poseResult.landmarks[0].map(toPoint)
      }

      onFrame(frame)
      this.rafId = requestAnimationFrame(tick)
    }

    this.rafId = requestAnimationFrame(tick)
  }

  stop(): void {
    this.running = false
    cancelAnimationFrame(this.rafId)
    this.faceLandmarker?.close()
    this.handLandmarker?.close()
    this.poseLandmarker?.close()
    this.faceLandmarker = null
    this.handLandmarker = null
    this.poseLandmarker = null
  }
}
