const status = document.querySelector<HTMLParagraphElement>('#status')
if (status) {
  window.api.onModelSwitch((id) => {
    status.textContent = `当前服装：${id}`
  })
  window.api.onStatus((message) => {
    status.textContent = message
  })
}