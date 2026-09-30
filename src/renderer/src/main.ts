import { groupActions } from '../../shared/actionCategories'
import { groupModelsByCharacter } from '../../shared/modelCategories'
import type { ModelDescriptor, OutfitId } from '../../shared/types'
import { iconForCharacter } from '../../shared/characterIcons'
import { pickExpressionAction } from '../../shared/emotion'
import type { Emotion } from '../../shared/emotion'
import { Live2DRenderer } from './live2d'
import { ModelManager } from './modelManager'
import { fetchModelManifest } from './models'
import { createCollapseToggle } from './dom'
import './panel.css'

let manualActionUntil = 0
let contextMenuOpen = false
let modelManifestCache: ModelDescriptor[] | null = null
let currentVoiceUrl: string | null = null

function simplifiedName(displayName: string): string {
  return displayName.replace(/^(若叶睦|千早爱音|丰川祥子)·/, '')
}

async function getModelManifest(): Promise<ModelDescriptor[]> {
  if (!modelManifestCache) modelManifestCache = await fetchModelManifest()
  return modelManifestCache
}

function closeContextMenu(menu: HTMLDivElement): void {
  menu.classList.remove('visible')
  contextMenuOpen = false
  window.api.reportMenuOpen(false)
}

async function showContextMenu(clientX: number, clientY: number, renderer: Live2DRenderer): Promise<void> {
  const menu = document.querySelector<HTMLDivElement>('#context-menu')
  if (!menu) return

  const models = await getModelManifest()
  const actions = renderer.getAvailableActions()
  menu.innerHTML = ''

  const modelTitle = document.createElement('h3')
  modelTitle.textContent = '人物'
  menu.appendChild(modelTitle)

  for (const characterGroup of groupModelsByCharacter(models)) {
    const characterContent = document.createElement('div')
    characterContent.className = 'menu-group'
    const modelCount = characterGroup.categories.reduce((sum, group) => sum + group.models.length, 0)
    menu.appendChild(
      createCollapseToggle(
        characterGroup.character,
        modelCount,
        characterContent,
        iconForCharacter(characterGroup.character)
      )
    )
    menu.appendChild(characterContent)

    for (const category of characterGroup.categories) {
      const group = document.createElement('div')
      group.className = 'menu-group'
      characterContent.appendChild(createCollapseToggle(category.title, category.models.length, group))
      characterContent.appendChild(group)

      for (const model of category.models) {
        const button = document.createElement('button')
        button.className = 'menu-item'
        button.textContent = simplifiedName(model.displayName)
        button.addEventListener('click', () => {
          window.api.requestModelSwitch(model.id)
          closeContextMenu(menu)
        })
        group.appendChild(button)
      }
    }
  }

  const actionSection = document.createElement('div')
  actionSection.className = 'menu-section'
  const actionTitle = document.createElement('h3')
  actionTitle.textContent = '动作'
  actionSection.appendChild(actionTitle)
  for (const group of groupActions(actions)) {
    const groupElement = document.createElement('div')
    groupElement.className = 'menu-group'
    actionSection.appendChild(createCollapseToggle(group.title, group.actions.length, groupElement))
    actionSection.appendChild(groupElement)
    for (const action of group.actions) {
      const button = document.createElement('button')
      button.className = 'menu-item'
      button.textContent = action
      button.addEventListener('click', () => {
        manualActionUntil = Date.now() + 8000
        renderer.playMotion(action)
        window.api.reportStatus(`动作：${action}`)
        closeContextMenu(menu)
      })
      groupElement.appendChild(button)
    }
  }
  menu.appendChild(actionSection)

  menu.style.left = `${Math.min(clientX, window.innerWidth - 240)}px`
  menu.style.top = `${Math.min(clientY, window.innerHeight - 300)}px`
  menu.classList.add('visible')
  contextMenuOpen = true
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

  setInterval(() => {
    if (Date.now() < manualActionUntil || contextMenuOpen) return
    const action = renderer.playRandomMotion()
    if (action) window.api.reportStatus(`动作：${action}`)
  }, 15000)

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

  window.api.onAiExpression(({ emotion }) => {
    const action = pickExpressionAction(
      renderer.getAvailableActions(),
      emotion as Emotion
    )
    if (!action) return
    manualActionUntil = Date.now() + 8000
    renderer.playMotion(action)
    window.api.reportStatus(`情绪动作：${action}`)
  })

  const voiceAudio = document.querySelector<HTMLAudioElement>('#voice-audio')
  if (voiceAudio) {
    window.api.onVoicePlay(({ requestId, playbackId, audio }) => {
      if (currentVoiceUrl) URL.revokeObjectURL(currentVoiceUrl)
      const arrayBuffer = audio.buffer.slice(
        audio.byteOffset,
        audio.byteOffset + audio.byteLength
      ) as ArrayBuffer
      const blob = new Blob([arrayBuffer], { type: 'audio/wav' })
      currentVoiceUrl = URL.createObjectURL(blob)
      voiceAudio.src = currentVoiceUrl
      voiceAudio.onended = () => window.api.reportVoiceEnded(requestId, playbackId)
      voiceAudio.onerror = () => {
        window.api.reportVoiceError(requestId, playbackId, '音频播放失败')
      }
      void voiceAudio.play().catch((error) => {
        window.api.reportVoiceError(requestId, playbackId, String(error))
      })
    })

    window.api.onVoiceStop(() => {
      voiceAudio.pause()
      voiceAudio.currentTime = 0
      voiceAudio.onended = null
      voiceAudio.onerror = null
      if (currentVoiceUrl) {
        URL.revokeObjectURL(currentVoiceUrl)
        currentVoiceUrl = null
      }
    })
  }
}

main().catch((error) => {
  console.error(error)
})
