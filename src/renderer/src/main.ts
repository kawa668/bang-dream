import type { OutfitId } from '../../shared/types'
import { Live2DRenderer } from './live2d'
import { ModelManager } from './modelManager'

async function main(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>('#live2d-canvas')
  if (!canvas) throw new Error('canvas not found')

  const renderer = new Live2DRenderer(canvas)
  const modelManager = new ModelManager(renderer)
  await modelManager.init()
  window.api.reportStatus('随机动作模式')
  window.api.reportModel(modelManager.getCurrent() ?? 'casual')

  let manualActionUntil = 0
  setInterval(() => {
    if (Date.now() < manualActionUntil) return
    const action = renderer.playRandomMotion()
    if (action) window.api.reportStatus(`动作：${action}`)
  }, 6000)

  const localShortcutIds: OutfitId[] = ['casual', 'event', 'school_summer', 'school_winter']
  const switchModel = (id: OutfitId): void => {
    modelManager.switchModel(id)
      .then(() => {
        window.api.reportModel(id)
        window.api.reportStatus(`当前服装：${id}`)
      })
      .catch((error) => console.error(error))
  }

  window.addEventListener('keydown', (event) => {
    const index = ['1', '2', '3', '4'].indexOf(event.key)
    if (index >= 0) switchModel(localShortcutIds[index])
  })

  window.api.onModelSwitch((id) => {
    switchModel(id)
  })

  window.api.onActionPlay((action) => {
    manualActionUntil = Date.now() + 8000
    const played = renderer.playMotion(action)
    window.api.reportStatus(played ? `动作：${action}` : `当前模型没有动作：${action}`)
  })
}

main().catch((error) => {
  console.error(error)
})
