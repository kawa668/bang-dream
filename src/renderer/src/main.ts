import { groupModelsByCharacter } from '../../shared/modelCategories'
import type { OutfitId } from '../../shared/types'
import { Live2DRenderer } from './live2d'
import { ModelManager } from './modelManager'
import { fetchModelManifest } from './models'

function simplifiedName(displayName: string): string {
  return displayName.replace(/^(若叶睦|千早爱音)·/, '')
}

function closeContextMenu(menu: HTMLDivElement): void {
  menu.classList.remove('visible')
  window.api.reportMenuOpen(false)
}

async function showContextMenu(clientX: number, clientY: number, renderer: Live2DRenderer): Promise<void> {
  const menu = document.querySelector<HTMLDivElement>('#context-menu')
  if (!menu) return

  const models = await fetchModelManifest()
  const actions = renderer.getAvailableActions()
  menu.innerHTML = ''

  const modelTitle = document.createElement('h3')
  modelTitle.textContent = '切换模型'
  menu.appendChild(modelTitle)

  for (const characterGroup of groupModelsByCharacter(models)) {
    const characterTitle = document.createElement('h3')
    characterTitle.textContent = characterGroup.character
    menu.appendChild(characterTitle)

    for (const category of characterGroup.categories) {
      const categoryTitle = document.createElement('div')
      categoryTitle.textContent = category.title
      categoryTitle.style.fontSize = '12px'
      categoryTitle.style.color = '#666'
      menu.appendChild(categoryTitle)

      for (const model of category.models) {
        const button = document.createElement('button')
        button.className = 'menu-item'
        button.textContent = simplifiedName(model.displayName)
        button.addEventListener('click', () => {
          window.api.requestModelSwitch(model.id)
          closeContextMenu(menu)
        })
        menu.appendChild(button)
      }
    }
  }

  const actionSection = document.createElement('div')
  actionSection.className = 'menu-section'
  const actionTitle = document.createElement('h3')
  actionTitle.textContent = '切换动作'
  actionSection.appendChild(actionTitle)
  for (const action of actions) {
    const button = document.createElement('button')
    button.className = 'menu-item'
    button.textContent = action
    button.addEventListener('click', () => {
      renderer.playMotion(action)
      window.api.reportStatus(`动作：${action}`)
      closeContextMenu(menu)
    })
    actionSection.appendChild(button)
  }
  menu.appendChild(actionSection)

  menu.style.left = `${Math.min(clientX, window.innerWidth - 240)}px`
  menu.style.top = `${Math.min(clientY, window.innerHeight - 300)}px`
  menu.classList.add('visible')
  window.api.reportMenuOpen(true)

  const close = (): void => {
    closeContextMenu(menu)
    window.removeEventListener('pointerdown', onPointerDown)
    window.removeEventListener('keydown', onKey)
  }
  const onPointerDown = (event: PointerEvent): void => {
    if (!menu.contains(event.target as Node)) close()
  }
  const onKey = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') close()
  }
  window.addEventListener('pointerdown', onPointerDown)
  window.addEventListener('keydown', onKey)
}

async function main(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>('#live2d-canvas')
  if (!canvas) throw new Error('canvas not found')

  const renderer = new Live2DRenderer(canvas)
  const modelManager = new ModelManager(renderer)
  await modelManager.init()
  window.api.reportStatus('随机动作模式')
  window.api.reportModel(modelManager.getCurrent() ?? 'casual')

  canvas.addEventListener('contextmenu', (event) => {
    if (!renderer.hitTest(event.clientX, event.clientY)) return
    event.preventDefault()
    void showContextMenu(event.clientX, event.clientY, renderer)
  })

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
