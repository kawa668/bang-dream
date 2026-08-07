import type { ModelDescriptor, OutfitId } from '../../shared/types'
import type { Live2DRenderer } from './live2d'
import { fetchModelManifest } from './models'

export class ModelManager {
  private descriptors = new Map<OutfitId, ModelDescriptor>()
  private current: OutfitId | null = null

  constructor(private readonly renderer: Live2DRenderer) {}

  async init(): Promise<void> {
    const models = await fetchModelManifest()
    for (const model of models) this.descriptors.set(model.id, model)
    if (this.current === null) await this.switchModel('casual')
  }

  async switchModel(id: OutfitId): Promise<void> {
    const descriptor = this.descriptors.get(id)
    if (!descriptor) throw new Error(`Unknown model: ${id}`)
    await this.renderer.load(descriptor.modelJsonUrl)
    this.current = id
  }

  getCurrent(): OutfitId | null {
    return this.current
  }
}