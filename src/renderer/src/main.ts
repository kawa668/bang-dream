import { Live2DRenderer } from './live2d'
import { fetchModelManifest } from './models'

async function main(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>('#live2d-canvas')
  if (!canvas) throw new Error('canvas not found')

  const manifest = await fetchModelManifest()
  const renderer = new Live2DRenderer(canvas)
  await renderer.load(manifest[0].modelJsonUrl)
}

main().catch((error) => {
  console.error(error)
})