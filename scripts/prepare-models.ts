import { copyFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createCubism2ModelJson } from '../src/model/buildModelConfig'
import type { BuildDataAsset, Cubism2ModelJson, ModelDescriptor, OutfitId } from '../src/shared/types'

const SOURCE_ROOT = process.env['LIVE2D_SOURCE_ROOT'] ?? 'D:\\codex\\模型下载\\live2d'
const DEST_ROOT = process.env['LIVE2D_DEST_ROOT'] ?? 'src/renderer/public/models'

const CHARACTERS = [
  { prefix: '338', displayName: '若叶睦', legacyIds: true },
  { prefix: '037', displayName: '千早爱音', legacyIds: false },
  { prefix: '341', displayName: '丰川祥子', legacyIds: false }
]

function legacy338Id(dir: string): OutfitId | null {
  const map: Record<string, OutfitId> = {
    '338_casual-2023': 'casual',
    '338_event_297_story_01': 'event',
    '338_school_summer-2023': 'school_summer',
    '338_school_winter-2023': 'school_winter'
  }
  return map[dir] ?? null
}

function prettyName(dir: string): string {
  return dir.replace(/^(338|037|341)_/, '').replace(/[-_]/g, ' ')
}

async function collectOutfits(): Promise<Array<{ id: OutfitId; displayName: string; sourceDir: string; generalDir: string }>> {
  const outfits = []
  for (const character of CHARACTERS) {
    const characterRoot = join(SOURCE_ROOT, character.prefix)
    const entries = await readdir(characterRoot, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === `${character.prefix}_general`) continue
      const id = character.legacyIds ? (legacy338Id(entry.name) ?? entry.name) : entry.name
      outfits.push({
        id,
        displayName: `${character.displayName}·${prettyName(entry.name)}`,
        sourceDir: join(characterRoot, entry.name),
        generalDir: join(characterRoot, `${character.prefix}_general`)
      })
    }
  }
  return outfits
}

async function copyAsset(sourceDirs: string[], destDir: string, name: string): Promise<void> {
  for (const sourceDir of sourceDirs) {
    try {
      await copyFile(join(sourceDir, name), join(destDir, name))
      return
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }
  throw new Error(`Missing asset: ${name}`)
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

  for (const outfit of await collectOutfits()) {
    const sourceDir = outfit.sourceDir
    const destDir = join(DEST_ROOT, outfit.id)
    const generalDir = outfit.generalDir
    const sourceDirs = [sourceDir, generalDir]
    await mkdir(destDir, { recursive: true })

    const buildDataRaw = await readFile(join(sourceDir, 'buildData.asset'), 'utf8')
    const buildData = JSON.parse(buildDataRaw) as BuildDataAsset
    const generalFiles = await readdir(generalDir).catch(() => [] as string[])
    const existingFiles = new Set([...(await readdir(sourceDir)), ...generalFiles])
    const json = createCubism2ModelJson(buildData, existingFiles)

    for (const file of registeredFiles(json)) {
      await copyAsset(sourceDirs, destDir, file)
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
