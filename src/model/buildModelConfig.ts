import type { BuildDataAsset, Cubism2ModelJson } from '../shared/types'

const stripBytes = (name: string): string => name.replace(/\.bytes$/, '')

export function createCubism2ModelJson(
  data: BuildDataAsset,
  existingFiles: ReadonlySet<string>
): Cubism2ModelJson {
  const model = stripBytes(data.Base.model.fileName)
  if (!existingFiles.has(model)) {
    throw new Error(`Missing model file: ${model}`)
  }

  const textures = data.Base.textures
    .map((texture) => stripBytes(texture.fileName))
    .filter((name) => existingFiles.has(name))

  if (textures.length === 0) {
    throw new Error(`No textures found for model: ${model}`)
  }

  const physics = stripBytes(data.Base.physics.fileName)
  const result: Cubism2ModelJson = { model, textures }
  if (existingFiles.has(physics)) result.physics = physics

  const motionFiles = data.Base.motions
    .map((motion) => stripBytes(motion.fileName))
    .filter((name) => existingFiles.has(name))

  if (motionFiles.length > 0) {
    const idle = motionFiles.filter((name) => name.includes('idle'))
    const tapBody = motionFiles.filter((name) => !name.includes('idle'))
    result.motions = {}
    if (idle.length > 0) result.motions.idle = idle.map((file) => ({ file }))
    if (tapBody.length > 0) {
      result.motions.tap_body = tapBody.map((file) => ({ file }))
      for (const file of tapBody) {
        const group = file.replace(/\.mtn$/, '')
        result.motions[group] = [{ file }]
      }
    }
  }

  const expressions = data.Base.expressions
    .map((expression) => stripBytes(expression.fileName))
    .filter((name) => existingFiles.has(name))

  if (expressions.length > 0) {
    result.expressions = expressions.map((file) => ({ file }))
  }

  return result
}
