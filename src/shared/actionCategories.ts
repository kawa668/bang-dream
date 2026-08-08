export interface ActionGroup {
  title: string
  actions: string[]
}

const CATEGORY_ORDER = ['日常', '表情', '情绪', '互动', '姿势', '思考', '其他']

function getActionCategory(action: string): string {
  const name = action.toLowerCase()
  if (name.includes('idle') || name.includes('nf') || name.includes('nnf')) return '日常'
  if (name.includes('smile') || name.includes('wink')) return '表情'
  if (name.includes('angry') || name.includes('sad') || name.includes('cry') || name.includes('surprised') || name.includes('odoodo') || name.includes('serious') || name.includes('shame') || name.includes('kandou')) return '情绪'
  if (name.includes('bow') || name.includes('bye')) return '互动'
  if (name.includes('kime')) return '姿势'
  if (name.includes('thinking')) return '思考'
  return '其他'
}

export function groupActions(actions: string[]): ActionGroup[] {
  return CATEGORY_ORDER
    .map((title) => ({
      title,
      actions: actions.filter((action) => getActionCategory(action) === title)
    }))
    .filter((group) => group.actions.length > 0)
}
