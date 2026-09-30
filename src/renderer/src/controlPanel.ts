import {
  calculatePanelPlacement,
  type Rect
} from './panelPosition'
import {
  CONTROL_TABS,
  loadControlTab,
  saveControlTab,
  type ControlTab
} from './panelTabs'

interface ControlPanelOptions {
  onClose(): void
  onBoundsChange(bounds: Rect | null): void
}

export class ControlPanel {
  private readonly tabs: HTMLButtonElement[]
  private readonly views: HTMLElement[]
  private activeTab: ControlTab
  private openState = false
  private lastAnchor: { x: number; y: number } | null = null
  private lastModelBounds: Rect | null = null
  private readonly resizeObserver: ResizeObserver

  constructor(
    private readonly root: HTMLElement,
    private readonly options: ControlPanelOptions
  ) {
    this.tabs = [...root.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
    this.views = [...root.querySelectorAll<HTMLElement>('[role="tabpanel"]')]
    this.activeTab = loadControlTab()
    this.resizeObserver = new ResizeObserver(() => this.reportBounds())

    root.querySelector<HTMLButtonElement>('#panel-close')?.addEventListener('click', () => this.close())
    for (const tab of this.tabs) {
      tab.addEventListener('click', () => this.showTab(tab.dataset.tab as ControlTab))
      tab.addEventListener('keydown', (event) => this.onTabKeydown(event))
    }
    window.addEventListener('keydown', (event) => {
      if (this.openState && event.key === 'Escape') {
        event.preventDefault()
        this.close()
      }
    })
    window.addEventListener('resize', () => this.reposition())
    this.showTab(this.activeTab)
  }

  get isOpen(): boolean {
    return this.openState
  }

  open(click: { x: number; y: number }, modelBounds: Rect | null): void {
    this.lastAnchor = click
    this.lastModelBounds = modelBounds
    this.root.hidden = false
    this.openState = true
    this.reposition()
    this.resizeObserver.observe(this.root)
    requestAnimationFrame(() => {
      this.root.focus({ preventScroll: true })
      this.reportBounds()
    })
  }

  close(): void {
    if (!this.openState) return
    this.openState = false
    this.root.hidden = true
    this.resizeObserver.unobserve(this.root)
    this.options.onBoundsChange(null)
    this.options.onClose()
  }

  setCharacterName(name: string): void {
    const element = this.root.querySelector<HTMLElement>('#panel-character-name')
    if (element) element.textContent = name
  }

  setModelLabel(label: string): void {
    const element = this.root.querySelector<HTMLElement>('#panel-model')
    if (element) element.textContent = label
  }

  setVoiceSummary(summary: string): void {
    const element = this.root.querySelector<HTMLElement>('#panel-voice-summary')
    if (element) element.textContent = summary
  }

  setGlobalStatus(status: string): void {
    const element = this.root.querySelector<HTMLElement>('#panel-global-status')
    if (element) element.textContent = status
  }

  private reposition(): void {
    if (!this.openState || !this.lastAnchor) return
    const placement = calculatePanelPlacement({
      click: this.lastAnchor,
      modelBounds: this.lastModelBounds ?? undefined,
      viewport: { width: window.innerWidth, height: window.innerHeight }
    })
    this.root.style.left = `${placement.x}px`
    this.root.style.top = `${placement.y}px`
    this.root.style.width = `${placement.width}px`
    this.root.style.height = `${placement.height}px`
  }

  private reportBounds(): void {
    if (!this.openState) return
    const rect = this.root.getBoundingClientRect()
    this.options.onBoundsChange({
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height
    })
  }

  private showTab(tab: ControlTab): void {
    if (!(CONTROL_TABS as readonly string[]).includes(tab)) tab = 'chat'
    this.activeTab = tab
    saveControlTab(window.localStorage, tab)
    for (const button of this.tabs) {
      const selected = button.dataset.tab === tab
      button.setAttribute('aria-selected', String(selected))
      button.tabIndex = selected ? 0 : -1
    }
    for (const view of this.views) view.hidden = view.dataset.panel !== tab
  }

  private onTabKeydown(event: KeyboardEvent): void {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const index = this.tabs.indexOf(event.currentTarget as HTMLButtonElement)
    const delta = event.key === 'ArrowRight' ? 1 : -1
    const next = this.tabs[(index + delta + this.tabs.length) % this.tabs.length]
    next.focus()
    this.showTab(next.dataset.tab as ControlTab)
  }
}
