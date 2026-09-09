export function createCollapseToggle(
  title: string,
  count: number,
  content: HTMLElement,
  iconUrl?: string
): HTMLButtonElement {
  const toggle = document.createElement('button')
  toggle.className = 'collapse-toggle'
  toggle.type = 'button'
  toggle.setAttribute('aria-expanded', 'false')

  if (iconUrl) {
    const icon = document.createElement('img')
    icon.className = 'toggle-icon'
    icon.src = iconUrl
    icon.alt = ''
    icon.setAttribute('aria-hidden', 'true')
    toggle.appendChild(icon)
  }

  const label = document.createElement('span')
  label.className = 'toggle-label'
  label.textContent = title

  const badge = document.createElement('span')
  badge.className = 'toggle-count'
  badge.textContent = String(count)

  const chevron = document.createElement('span')
  chevron.className = 'toggle-chevron'
  chevron.setAttribute('aria-hidden', 'true')
  chevron.innerHTML =
    '<svg viewBox="0 0 16 16" width="14" height="14" role="presentation">' +
    '<path d="M5 3l5 5-5 5z" fill="currentColor"/></svg>'

  toggle.appendChild(label)
  toggle.appendChild(badge)
  toggle.appendChild(chevron)

  const update = (open: boolean): void => {
    content.hidden = !open
    toggle.classList.toggle('open', open)
    toggle.setAttribute('aria-expanded', String(open))
  }
  update(false)
  toggle.addEventListener('click', () => update(content.hidden))
  return toggle
}
