import { groupActions } from '../../shared/actionCategories'
import { groupModelsByCharacter } from '../../shared/modelCategories'
import type { ModelDescriptor, OutfitId } from '../../shared/types'

const status = document.querySelector<HTMLParagraphElement>('#status')
const modelButtons = document.querySelector<HTMLDivElement>('#model-buttons')
const actionGroups = document.querySelector<HTMLDivElement>('#action-groups')

const manifestByModel = new Map<OutfitId, ModelDescriptor>()
const actionsByModel = new Map<OutfitId, string[]>()
let renderSequence = 0
let currentModel: OutfitId = 'casual'

function createCollapseToggle(title: string, count: number, content: HTMLElement): HTMLButtonElement {
  const toggle = document.createElement('button')
  toggle.className = 'collapse-toggle'
  const update = (open: boolean): void => {
    content.hidden = !open
    toggle.textContent = `${open ? '▾' : '▸'} ${title} (${count})`
  }
  update(false)
  toggle.addEventListener('click', () => update(content.hidden))
  return toggle
}

async function ensureManifest(): Promise<void> {
  if (manifestByModel.size > 0) return
  const manifestResponse = await fetch('./models/manifest.json')
  const manifest = await manifestResponse.json() as ModelDescriptor[]
  for (const model of manifest) manifestByModel.set(model.id, model)
}

async function renderModelButtons(): Promise<void> {
  await ensureManifest()
  if (!modelButtons) return
  modelButtons.innerHTML = ''
  const personTitle = document.createElement('h2')
  personTitle.textContent = '人物'
  modelButtons.appendChild(personTitle)

  for (const characterGroup of groupModelsByCharacter([...manifestByModel.values()])) {
    const characterContent = document.createElement('div')
    characterContent.className = 'character-models'
    const modelCount = characterGroup.categories.reduce((sum, group) => sum + group.models.length, 0)
    modelButtons.appendChild(createCollapseToggle(characterGroup.character, modelCount, characterContent))
    modelButtons.appendChild(characterContent)

    for (const category of characterGroup.categories) {
      const buttonGroup = document.createElement('div')
      buttonGroup.className = 'category-buttons'
      const toggle = createCollapseToggle(category.title, category.models.length, buttonGroup)
      characterContent.appendChild(toggle)
      characterContent.appendChild(buttonGroup)

      for (const model of category.models) {
        const button = document.createElement('button')
        button.dataset.modelId = model.id
        button.textContent = model.displayName.replace(/^(若叶睦|千早爱音|丰川祥子)·/, '')
        button.addEventListener('click', () => window.api.requestModelSwitch(model.id))
        buttonGroup.appendChild(button)
      }
    }
  }
  for (const button of modelButtons.querySelectorAll<HTMLButtonElement>('button')) {
    button.classList.toggle('active', button.dataset.modelId === currentModel)
  }
}

async function loadActions(id: OutfitId): Promise<string[]> {
  const cached = actionsByModel.get(id)
  if (cached) return cached

  await ensureManifest()
  const descriptor = manifestByModel.get(id)
  if (!descriptor) return []
  const modelResponse = await fetch(descriptor.modelJsonUrl)
  const modelJson = await modelResponse.json() as { motions?: Record<string, unknown> }
  const actions = Object.keys(modelJson.motions ?? {})
    .filter((key) => key !== 'idle' && key !== 'tap_body')
    .sort()
  actionsByModel.set(id, actions)
  return actions
}

async function renderActions(id: OutfitId): Promise<void> {
  const sequence = ++renderSequence
  currentModel = id
  const actions = await loadActions(id)
  if (sequence !== renderSequence || !actionGroups) return

  for (const button of modelButtons?.querySelectorAll<HTMLButtonElement>('button') ?? []) {
    button.classList.toggle('active', button.dataset.modelId === id)
  }

  actionGroups.innerHTML = ''
  const actionTitle = document.createElement('h2')
  actionTitle.textContent = '动作'
  actionGroups.appendChild(actionTitle)

  for (const group of groupActions(actions)) {
    const list = document.createElement('div')
    list.className = 'action-buttons'
    const toggle = createCollapseToggle(group.title, group.actions.length, list)
    actionGroups.appendChild(toggle)
    actionGroups.appendChild(list)

    for (const action of group.actions) {
      const button = document.createElement('button')
      button.textContent = action
      button.addEventListener('click', () => window.api.playAction(action))
      list.appendChild(button)
    }
  }

  if (status) {
    status.textContent = `当前服装：${id}，可用动作 ${actions.length} 个`
  }
}

window.api.onModelSwitch((id) => {
  void renderActions(id)
})

void renderActions('casual')
void renderModelButtons()

if (status) {
  window.api.onStatus((message) => {
    status.textContent = message
  })
}
