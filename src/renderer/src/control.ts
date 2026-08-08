import type { ModelDescriptor, OutfitId } from '../../shared/types'

const status = document.querySelector<HTMLParagraphElement>('#status')
const actionSelect = document.querySelector<HTMLSelectElement>('#action-select')
const playActionButton = document.querySelector<HTMLButtonElement>('#play-action')
const modelButtons = document.querySelector<HTMLDivElement>('#model-buttons')

const manifestByModel = new Map<OutfitId, ModelDescriptor>()
const actionsByModel = new Map<OutfitId, string[]>()
let renderSequence = 0
let currentModel: OutfitId = 'casual'

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
  for (const model of manifestByModel.values()) {
    const button = document.createElement('button')
    button.dataset.modelId = model.id
    button.textContent = model.displayName
    button.addEventListener('click', () => window.api.requestModelSwitch(model.id))
    modelButtons.appendChild(button)
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
  if (sequence !== renderSequence || !actionSelect) return

  for (const button of modelButtons?.querySelectorAll<HTMLButtonElement>('button') ?? []) {
    button.classList.toggle('active', button.dataset.modelId === id)
  }

  actionSelect.innerHTML = ''
  const placeholder = document.createElement('option')
  placeholder.value = ''
  placeholder.textContent = '选择动作'
  actionSelect.appendChild(placeholder)

  for (const action of actions) {
    const option = document.createElement('option')
    option.value = action
    option.textContent = action
    actionSelect.appendChild(option)
  }

  if (status) {
    status.textContent = `当前服装：${id}，可用动作 ${actions.length} 个`
  }
}

playActionButton?.addEventListener('click', () => {
  const action = actionSelect?.value
  if (action) window.api.playAction(action)
})

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
