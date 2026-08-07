import type { ModelDescriptor } from '../../shared/types'

export async function fetchModelManifest(): Promise<ModelDescriptor[]> {
  const response = await fetch('./models/manifest.json')
  if (!response.ok) throw new Error(`manifest failed: ${response.status}`)
  return (await response.json()) as ModelDescriptor[]
}