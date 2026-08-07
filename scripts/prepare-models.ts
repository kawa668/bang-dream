import { copyFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createCubism2ModelJson } from '../src/model/buildModelConfig'
import type { BuildDataAsset, Cubism2ModelJson, ModelDescriptor, OutfitId } from '../src/shared/types'

const SOURCE_ROOT = process.env['LIVE2D_SOURCE_ROOT'] ?? 'D:\\codex\\模型下载\\live2d\\338'
const DEST_ROOT = process.env['LIVE2D_DEST_ROOT'] ?? 'src/renderer/public/models'

const OUTFITS: Array<{ id: OutfitId; displayName: string; dir: string }> = [
  { id: 'casual', displayName: '便装', dir: '338_casual-2023' },
  { id: 'event', displayName: '活动剧情装', dir: '338_event_297_story_01' },
  { id: 'school_summer', displayName: '夏季校服', dir: '338_school_summer-2023' },
  { id: 'school_winter', displayName: '冬季校服', dir: '338_school_winter-2023' }
]

async function copyAsset(sourceDir: string, destDir: string, name: string): Promise<void> {
  await copyFile(join(sourceDir, name), join(destDir, name))
}

function registeredFiles(json: Cubism2ModelJson): string[] {
  const files = new Set<string>([json.model, ...json.textures])
  if (json.physics) files.add(json.physics)
  for (const group of Object.values(json.motions ?? {})) {
    for (const motion of group) files.add(motion.file)
  }
  for (const expression of json.expressions ?? []) files.add(expression.file)
  return [...files]
}

async function main(): Promise<void> {
  await mkdir(DEST_ROOT, { recursive: true })
  const descriptors: ModelDescriptor[] = []

  for (const outfit of OUTFITS) {
    const sourceDir = join(SOURCE_ROOT, outfit.dir)
    const destDir = join(DEST_ROOT, outfit.id)
    await mkdir(destDir, { recursive: true })

    const buildDataRaw = await readFile(join(sourceDir, 'buildData.asset'), 'utf8')
    const buildData = JSON.parse(buildDataRaw) as BuildDataAsset
    const existingFiles = new Set(await readdir(sourceDir))
    const json = createCubism2ModelJson(buildData, existingFiles)

    for (const file of registeredFiles(json)) {
      await copyAsset(sourceDir, destDir, file)
    }

    await writeFile(join(destDir, 'model.json'), JSON.stringify(json, null, 2), 'utf8')
    descriptors.push({
      id: outfit.id,
      displayName: outfit.displayName,
      modelJsonUrl: `models/${outfit.id}/model.json`
    })
  }

  await writeFile(join(DEST_ROOT, 'manifest.json'), JSON.stringify(descriptors, null, 2), 'utf8')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
