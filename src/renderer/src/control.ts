const status = document.querySelector<HTMLParagraphElement>('#status')
const actionSelect = document.querySelector<HTMLSelectElement>('#action-select')
const playActionButton = document.querySelector<HTMLButtonElement>('#play-action')

async function loadActions(): Promise<void> {
  const manifestResponse = await fetch('./models/manifest.json')
  const manifest = await manifestResponse.json() as Array<{ modelJsonUrl: string }>
  const actions = new Set<string>()

  for (const model of manifest) {
    const modelResponse = await fetch(model.modelJsonUrl)
    const modelJson = await modelResponse.json() as { motions?: Record<string, unknown> }
    for (const key of Object.keys(modelJson.motions ?? {})) {
      if (key !== 'idle' && key !== 'tap_body') actions.add(key)
    }
  }

  for (const action of [...actions].sort()) {
    const option = document.createElement('option')
    option.value = action
    option.textContent = action
    actionSelect?.appendChild(option)
  }
}

playActionButton?.addEventListener('click', () => {
  const action = actionSelect?.value
  if (action) window.api.playAction(action)
})

void loadActions()

if (status) {
  window.api.onModelSwitch((id) => {
    status.textContent = `当前服装：${id}`
  })
  window.api.onStatus((message) => {
    status.textContent = message
  })
}
