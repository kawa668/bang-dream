import { groupActions } from '../../shared/actionCategories'
import { iconForCharacter } from '../../shared/characterIcons'
import { groupModelsByCharacter } from '../../shared/modelCategories'
import type { ModelDescriptor, OutfitId } from '../../shared/types'
import { createCollapseToggle } from './dom'
import { fetchModelManifest } from './models'

function simplifiedName(displayName: string): string {
  return displayName.replace(/^(若叶睦|千早爱音|丰川祥子)·/, '')
}

export class CharacterPanel {
  private manifest: ModelDescriptor[] = []
  private readonly manifestByModel = new Map<OutfitId, ModelDescriptor>()
  private readonly actionsByModel = new Map<OutfitId, string[]>()
  private currentModel: OutfitId | null = null
  private actions: string[] = []
  private renderSequence = 0

  constructor(private readonly root: HTMLElement) {
    this.root.innerHTML = `
      <section class="panel-card">
        <h2>人物</h2>
        <div id="panel-model-buttons"></div>
      </section>
      <section class="panel-card">
        <h2>动作</h2>
        <div id="panel-action-groups"></div>
      </section>
    `
    void this.refresh()
  }

  async refresh(): Promise<void> {
    try {
      this.manifest = await fetchModelManifest()
      this.manifestByModel.clear()
      for (const model of this.manifest) this.manifestByModel.set(model.id, model)
      this.renderModels()
      if (this.currentModel) await this.setCurrentModel(this.currentModel)
    } catch (error) {
      const host = this.root.querySelector('#panel-model-buttons')
      if (host) host.textContent = error instanceof Error ? error.message : String(error)
    }
  }

  async setCurrentModel(id: OutfitId): Promise<void> {
    const sequence = ++this.renderSequence
    this.currentModel = id
    for (const button of this.root.querySelectorAll<HTMLButtonElement>('[data-model-id]')) {
      button.classList.toggle('active', button.dataset.modelId === id)
    }
    const actions = await this.loadActions(id)
    if (sequence !== this.renderSequence) return
    this.actions = actions
    this.renderActions()
    window.api.reportStatus(`当前服装：${id}，可用动作 ${this.actions.length} 个`)
  }

  private renderModels(): void {
    const host = this.require('#panel-model-buttons')
    host.innerHTML = ''
    for (const character of groupModelsByCharacter(this.manifest)) {
      const content = document.createElement('div')
      content.className = 'character-models'
      const count = character.categories.reduce((sum, category) => sum + category.models.length, 0)
      host.appendChild(createCollapseToggle(
        character.character,
        count,
        content,
        iconForCharacter(character.character)
      ))
      host.appendChild(content)
      for (const category of character.categories) {
        const group = document.createElement('div')
        group.className = 'category-buttons'
        content.appendChild(createCollapseToggle(category.title, category.models.length, group))
        content.appendChild(group)
        for (const model of category.models) {
          const button = document.createElement('button')
          button.type = 'button'
          button.dataset.modelId = model.id
          button.textContent = simplifiedName(model.displayName)
          button.addEventListener('click', () => window.api.requestModelSwitch(model.id))
          group.appendChild(button)
        }
      }
    }
  }

  private async loadActions(id: OutfitId): Promise<string[]> {
    const cached = this.actionsByModel.get(id)
    if (cached) return cached
    const descriptor = this.manifestByModel.get(id)
    if (!descriptor) return []
    const response = await fetch(descriptor.modelJsonUrl)
    const json = await response.json() as { motions?: Record<string, unknown> }
    const actions = Object.keys(json.motions ?? {})
      .filter((action) => action !== 'idle' && action !== 'tap_body')
      .sort()
    this.actionsByModel.set(id, actions)
    return actions
  }

  private renderActions(): void {
    const host = this.require('#panel-action-groups')
    host.innerHTML = ''
    for (const group of groupActions(this.actions)) {
      const list = document.createElement('div')
      list.className = 'action-buttons'
      host.appendChild(createCollapseToggle(group.title, group.actions.length, list))
      host.appendChild(list)
      for (const action of group.actions) {
        const button = document.createElement('button')
        button.type = 'button'
        button.textContent = action
        button.addEventListener('click', () => window.api.playAction(action))
        list.appendChild(button)
      }
    }
  }

  private require(selector: string): HTMLElement {
    const element = this.root.querySelector<HTMLElement>(selector)
    if (!element) throw new Error(`Missing character panel element: ${selector}`)
    return element
  }
}
