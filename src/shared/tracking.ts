export interface LandmarkPoint {
  x: number
  y: number
  z: number
}

export interface TrackingFrame {
  face?: {
    landmarks: LandmarkPoint[]
    blendshapes: Record<string, number>
  }
  hands?: LandmarkPoint[][]
  body?: LandmarkPoint[]
}

export interface TrackingOptions {
  enableFace: boolean
  enableHands: boolean
  enableBody: boolean
  inputWidth: number
  inputHeight: number
}
