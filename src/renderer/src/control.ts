import { groupActions } from '../../shared/actionCategories'
import { groupModelsByCharacter } from '../../shared/modelCategories'
import type { ModelDescriptor, OutfitId } from '../../shared/types'
import type { LLMSettingsSave, LLMSettingsView } from '../../shared/chat'
import { createRequestId } from '../../shared/requestId'

const status = document.querySelector<HTMLParagraphElement>('#status')
const modelButtons = document.querySelector<HTMLDivElement>('#model-buttons')
const actionGroups = document.querySelector<HTMLDivElement>('#action-groups')
const chatMessages = document.querySelector<HTMLDivElement>('#chat-messages')
const chatInput = document.querySelector<HTMLInputElement>('#chat-input')
const chatSend = document.querySelector<HTMLButtonElement>('#chat-send')
const chatClearButton = document.querySelector<HTMLButtonElement>('#chat-clear')
const chatStatus = document.querySelector<HTMLParagraphElement>('#chat-status')
const baseUrlInput = document.querySelector<HTMLInputElement>('#llm-base-url')
const apiKeyInput = document.querySelector<HTMLInputElement>('#llm-api-key')
const modelInput = document.querySelector<HTMLInputElement>('#llm-model')
const systemPromptInput = document.querySelector<HTMLTextAreaElement>('#llm-system-prompt')
const temperatureInput = document.querySelector<HTMLInputElement>('#llm-temperature')
const timeoutInput = document.querySelector<HTMLInputElement>('#llm-timeout')
const maxHistoryInput = document.querySelector<HTMLInputElement>('#llm-max-history')
const configSave = document.querySelector<HTMLButtonElement>('#config-save')
const configStatus = document.querySelector<HTMLParagraphElement>('#config-status')

let assistantContent: HTMLDivElement | null = null

const manifestByModel = new Map<OutfitId, ModelDescriptor>()
const actionsByModel = new Map<OutfitId, string[]>()
let renderSequence = 0
let currentModel: OutfitId = 'casual'

function appendChatMessage(role: 'user' | 'assistant' | 'system', text: string): HTMLDivElement {
  const message = document.createElement('div')
  message.className = `chat-message chat-${role}`
  const author = document.createElement('span')
  author.className = 'chat-author'
  author.textContent = role === 'user' ? '你' : role === 'assistant' ? '宠物' : '系统'
  const content = document.createElement('div')
  content.className = 'chat-content'
  content.textContent = text
  message.appendChild(author)
  message.appendChild(content)
  chatMessages?.appendChild(message)
  if (chatMessages) chatMessages.scrollTop = chatMessages.scrollHeight
  return message
}

function clearChatMessages(): void {
  if (chatMessages) chatMessages.innerHTML = ''
  assistantContent = null
}

async function sendChatMessage(): Promise<void> {
  if (!chatInput) return
  const text = chatInput.value
  if (!text.trim()) return
  appendChatMessage('user', text.trim())
  chatInput.value = ''
  window.api.sendChatMessage(createRequestId('chat'), text)
}

async function loadConfig(): Promise<void> {
  try {
    const view: LLMSettingsView | null = await window.api.getConfig()
    if (!view) return
    if (baseUrlInput) baseUrlInput.value = view.baseUrl
    if (modelInput) modelInput.value = view.model
    if (systemPromptInput) systemPromptInput.value = view.systemPrompt
    if (temperatureInput) temperatureInput.value = String(view.temperature)
    if (timeoutInput) timeoutInput.value = String(view.timeoutMs)
    if (maxHistoryInput) maxHistoryInput.value = String(view.maxHistory)
    if (apiKeyInput) apiKeyInput.value = ''
    if (configStatus) {
      configStatus.textContent = view.hasApiKey ? 'API Key 已保存' : '尚未保存 API Key'
    }
  } catch (error) {
    if (configStatus) configStatus.textContent = error instanceof Error ? error.message : String(error)
  }
}

async function saveConfig(): Promise<void> {
  const settings: LLMSettingsSave = {
    baseUrl: baseUrlInput?.value ?? '',
    apiKey: apiKeyInput?.value ?? '',
    model: modelInput?.value ?? '',
    systemPrompt: systemPromptInput?.value ?? '',
    temperature: Number(temperatureInput?.value ?? 0.8),
    timeoutMs: Number(timeoutInput?.value ?? 30000),
    maxHistory: Number(maxHistoryInput?.value ?? 20)
  }
  if (!settings.baseUrl.trim() || !settings.model.trim()) {
    if (configStatus) configStatus.textContent = '请填写 Base URL 和模型名'
    return
  }
  try {
    const view = await window.api.saveConfig(settings)
    if (view) {
      if (apiKeyInput) apiKeyInput.value = ''
      if (configStatus) configStatus.textContent = '设置已保存'
    }
  } catch (error) {
    if (configStatus) configStatus.textContent = error instanceof Error ? error.message : String(error)
  }
}

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

window.api.onChatStart((_event) => {
  const message = appendChatMessage('assistant', '')
  assistantContent = message.querySelector<HTMLDivElement>('.chat-content')
  if (chatStatus) chatStatus.textContent = '正在回复...'
})

window.api.onChatDelta((event) => {
  if (assistantContent) assistantContent.textContent += event.delta
  if (chatMessages) chatMessages.scrollTop = chatMessages.scrollHeight
})

window.api.onChatComplete((event) => {
  if (assistantContent) assistantContent.textContent = event.message
  assistantContent = null
  if (chatStatus) chatStatus.textContent = ''
})

window.api.onChatError((event) => {
  if (assistantContent) {
    assistantContent.textContent += `\n[${event.message}]`
  } else {
    appendChatMessage('system', event.message)
  }
  assistantContent = null
  if (chatStatus) chatStatus.textContent = ''
})

window.api.onChatClear((_event) => {
  clearChatMessages()
})

chatSend?.addEventListener('click', () => {
  void sendChatMessage()
})

chatInput?.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    void sendChatMessage()
  }
})

chatClearButton?.addEventListener('click', () => {
  window.api.clearChat(createRequestId('chat-clear'))
  clearChatMessages()
})

configSave?.addEventListener('click', () => {
  void saveConfig()
})

void loadConfig()
void renderActions('casual')
void renderModelButtons()

if (status) {
  window.api.onStatus((message) => {
    status.textContent = message
  })
}
