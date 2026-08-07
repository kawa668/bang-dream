export type OutfitId = 'casual' | 'event' | 'school_summer' | 'school_winter'

export interface ModelDescriptor {
  id: OutfitId
  displayName: string
  modelJsonUrl: string
}

export interface AssetRef {
  bundleName: string
  fileName: string
}

export interface BuildDataAsset {
  Base: {
    model: AssetRef
    physics: AssetRef
    textures: AssetRef[]
    motions: AssetRef[]
    expressions: AssetRef[]
  }
}

export interface Cubism2ModelJson {
  model: string
  textures: string[]
  physics?: string
  motions?: Record<string, Array<{ file: string }>>
  expressions?: Array<{ file: string }>
}
