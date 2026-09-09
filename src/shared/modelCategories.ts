import type { ModelDescriptor } from './types'

export interface ModelGroup {
  title: string
  models: ModelDescriptor[]
}

export interface CharacterModelGroup {
  character: string
  categories: ModelGroup[]
}

const CATEGORY_ORDER = ['基础', '校服', '活动', '演出', '特别', '其他']

function getModelCategory(id: string): string {
  if (id === 'casual' || id.includes('casual')) return '基础'
  if (id === 'school_summer' || id === 'school_winter' || id.includes('school_summer') || id.includes('school_winter')) return '校服'
  if (id === 'event' || id.includes('event')) return '活动'
  if (id.includes('live')) return '演出'
  if (id.includes('birthday') || id.includes('dream_festival') || id.includes('collabo')) return '特别'
  return '其他'
}

export function getCharacter(id: string): string {
  if (id.startsWith('341_')) return '丰川祥子'
  return id.startsWith('037_') ? '千早爱音' : '若叶睦'
}

export function groupModelsByCharacter(models: ModelDescriptor[]): CharacterModelGroup[] {
  const result: CharacterModelGroup[] = []
  const byCharacter = new Map<string, ModelDescriptor[]>()

  for (const model of models) {
    const character = getCharacter(model.id)
    const list = byCharacter.get(character) ?? []
    list.push(model)
    byCharacter.set(character, list)
  }

  for (const [character, characterModels] of byCharacter) {
    const categories: ModelGroup[] = CATEGORY_ORDER
      .map((title) => ({
        title,
        models: characterModels.filter((model) => getModelCategory(model.id) === title)
      }))
      .filter((group) => group.models.length > 0)
    result.push({ character, categories })
  }

  return result
}
