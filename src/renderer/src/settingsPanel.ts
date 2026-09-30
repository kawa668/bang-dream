import type { LLMSettingsSave, LLMSettingsView } from '../../shared/chat'

export class SettingsPanel {
  private readonly baseUrl: HTMLInputElement
  private readonly apiKey: HTMLInputElement
  private readonly model: HTMLInputElement
  private readonly character: HTMLParagraphElement
  private readonly temperature: HTMLInputElement
  private readonly timeout: HTMLInputElement
  private readonly maxHistory: HTMLInputElement
  private readonly status: HTMLParagraphElement

  constructor(private readonly root: HTMLElement) {
    this.root.innerHTML = `
      <section class="panel-card settings-form">
        <label class="field"><span>Base URL</span><input id="llm-base-url" type="url" /></label>
        <label class="field"><span>API Key</span><input id="llm-api-key" type="password" placeholder="留空表示不修改" /></label>
        <label class="field"><span>模型</span><input id="llm-model" type="text" /></label>
        <div class="field"><span>当前角色</span><p id="llm-current-character" class="status"></p></div>
        <label class="field"><span>Temperature</span><input id="llm-temperature" type="number" min="0" max="2" step="0.1" /></label>
        <label class="field"><span>超时（毫秒）</span><input id="llm-timeout" type="number" min="1000" /></label>
        <label class="field"><span>历史消息数</span><input id="llm-max-history" type="number" min="1" /></label>
        <button id="config-save" class="btn primary" type="button">保存设置</button>
        <p id="config-status" class="status" role="status"></p>
      </section>
    `
    this.baseUrl = this.require<HTMLInputElement>('#llm-base-url')
    this.apiKey = this.require<HTMLInputElement>('#llm-api-key')
    this.model = this.require<HTMLInputElement>('#llm-model')
    this.character = this.require<HTMLParagraphElement>('#llm-current-character')
    this.temperature = this.require<HTMLInputElement>('#llm-temperature')
    this.timeout = this.require<HTMLInputElement>('#llm-timeout')
    this.maxHistory = this.require<HTMLInputElement>('#llm-max-history')
    this.status = this.require<HTMLParagraphElement>('#config-status')
    this.require<HTMLButtonElement>('#config-save')
      .addEventListener('click', () => void this.save())
    void this.load()
  }

  setCharacterName(name: string): void {
    this.character.textContent = `当前角色：${name}`
  }

  private async load(): Promise<void> {
    try {
      const view = await window.api.getConfig()
      if (!view) return
      this.applyView(view)
    } catch (error) {
      this.status.textContent = error instanceof Error ? error.message : String(error)
    }
  }

  private applyView(view: LLMSettingsView): void {
    this.baseUrl.value = view.baseUrl
    this.model.value = view.model
    this.temperature.value = String(view.temperature)
    this.timeout.value = String(view.timeoutMs)
    this.maxHistory.value = String(view.maxHistory)
    this.apiKey.value = ''
    this.character.textContent = `当前角色：${view.characterName}`
    this.status.textContent = view.hasApiKey ? 'API Key 已保存' : '尚未保存 API Key'
  }

  private async save(): Promise<void> {
    const settings: LLMSettingsSave = {
      baseUrl: this.baseUrl.value,
      apiKey: this.apiKey.value,
      model: this.model.value,
      temperature: Number(this.temperature.value),
      timeoutMs: Number(this.timeout.value),
      maxHistory: Number(this.maxHistory.value)
    }
    if (!settings.baseUrl.trim() || !settings.model.trim()) {
      this.status.textContent = '请填写 Base URL 和模型名'
      return
    }
    try {
      const view = await window.api.saveConfig(settings)
      this.apiKey.value = ''
      if (view) this.applyView(view)
      this.status.textContent = '设置已保存'
    } catch (error) {
      this.status.textContent = error instanceof Error ? error.message : String(error)
    }
  }

  private require<T extends Element>(selector: string): T {
    const element = this.root.querySelector<T>(selector)
    if (!element) throw new Error(`Missing settings control: ${selector}`)
    return element
  }
}
