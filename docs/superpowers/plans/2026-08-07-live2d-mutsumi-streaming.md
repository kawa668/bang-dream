# 若叶睦 Live2D 直播动捕应用 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个 Electron 桌面应用，加载四套若叶睦 Live2D 模型，通过摄像头驱动面部/手部动作，并用热键切换服装。

**Architecture:** Electron 主进程管理窗口、全局热键和 IPC；渲染输出窗口使用 PixiJS + Live2D Cubism 2.1 渲染透明模型；MediaPipe 从摄像头读取面部与双手关键点，经平滑后写入 Live2D 参数。模型资源由脚本从原始下载目录复制到应用公共目录，并生成 Cubism 2 格式的 `model.json`。

**Tech Stack:** Electron 37、electron-vite 3、TypeScript 5、PixiJS 6.5、pixi-live2d-display 0.4、MediaPipe Tasks Vision 0.10、Vitest 3、tsx。

## Global Constraints

- 目标平台：Windows 11；本机 Node 24.18+、npm 12.0.1。
- PixiJS 必须固定为 6.x；pixi-live2d-display 使用 `0.4.0`，不要升级到要求 PixiJS 7/8 的版本。
- Cubism 2.1 的 `live2d.min.js` 必须作为本地文件在渲染器模块代码执行前加载，不能依赖运行时 CDN。
- MediaPipe wasm 和 `.task` 模型文件必须复制到本地 `src/renderer/public/vendor/`，不能依赖运行时外网。
- 模型源目录默认是 `D:\codex\模型下载\live2d\338`，脚本只读取，不修改原始文件。
- `buildData.asset` 中的 `.bytes` 后缀要换算成实际文件后缀；只注册目录中真实存在的文件。
- 夏季/冬季校服缺少 `texture_00.png` 时，`model.json` 只注册存在的贴图；若 `.moc` 加载失败，标记该模型缺资源并保留其他模型可用。
- 直播输出窗口只渲染模型，不显示控制界面、调试信息或摄像头画面。
- 不发布、不传播解包模型资源。

---

### Task 1: 项目脚手架与本地依赖

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `electron.vite.config.ts`
- Create: `tsconfig.json`
- Create: `src/main/index.ts`
- Create: `src/preload/index.ts`
- Create: `src/renderer/index.html`
- Create: `src/renderer/src/main.ts`

**Interfaces:**
- Consumes: 无
- Produces: `npm run dev` 可启动 Electron 空窗口；`npm run test` 可运行 Vitest；`src/renderer/public/vendor/` 包含 `live2d.min.js`、MediaPipe wasm 与两个 `.task` 模型文件。

- [ ] **Step 1: 写 package.json**

```json
{
  "name": "live2d-mutsumi-streaming",
  "version": "0.1.0",
  "private": true,
  "main": "out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "test": "vitest run",
    "prepare:models": "tsx scripts/prepare-models.ts"
  },
  "dependencies": {
    "@mediapipe/tasks-vision": "^0.10.11",
    "pixi-live2d-display": "0.4.0",
    "pixi.js": "^6.5.10"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "electron": "^37.0.0",
    "electron-vite": "^3.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 2: 安装依赖**

Run: `npm install`
Expected: 安装完成，`package-lock.json` 生成。

- [ ] **Step 3: 写基础配置**

Create `.gitignore`:

```gitignore
node_modules/
out/
dist/
*.log
```

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "types": ["node"]
  },
  "include": ["src", "scripts", "tests", "electron.vite.config.ts"]
}
```

Create `electron.vite.config.ts`:

```ts
import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: { input: resolve(__dirname, 'src/main/index.ts') }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: { input: resolve(__dirname, 'src/preload/index.ts') }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    base: './',
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
          control: resolve(__dirname, 'src/renderer/control.html')
        }
      }
    }
  }
})
```

- [ ] **Step 4: 下载本地运行依赖**

Run:

```powershell
New-Item -ItemType Directory -Force -Path 'src/renderer/public/vendor'
Invoke-WebRequest -Uri 'https://cdn.jsdelivr.net/gh/dylanNew/live2d/webgl/Live2D/lib/live2d.min.js' -OutFile 'src/renderer/public/vendor/live2d.min.js'
Invoke-WebRequest -Uri 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task' -OutFile 'src/renderer/public/vendor/face_landmarker.task'
Invoke-WebRequest -Uri 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task' -OutFile 'src/renderer/public/vendor/hand_landmarker.task'
Copy-Item -Recurse -Force 'node_modules/@mediapipe/tasks-vision/wasm' 'src/renderer/public/vendor/mediapipe-wasm'
```

Expected: 四个本地资源均存在，且 `mediapipe-wasm` 目录包含 `.wasm` 文件。

- [ ] **Step 5: 写最小 Electron 入口**

Create `src/main/index.ts`:

```ts
import { join } from 'node:path'
import { app, BrowserWindow } from 'electron'

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    win.loadURL(devUrl)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}

app.whenReady().then(() => {
  createMainWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
```

Create `src/preload/index.ts`:

```ts
import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('api', {})
```

Create `src/renderer/index.html`:

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <title>若叶睦 Live2D</title>
  </head>
  <body>
    <canvas id="live2d-canvas"></canvas>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

Create `src/renderer/src/main.ts`:

```ts
console.log('renderer ready')
```- [ ] **Step 6: 运行开发窗口并提交**

Run: `npm run dev`
Expected: Electron 窗口打开，DevTools 控制台输出 `renderer ready`。

```bash
git add package.json package-lock.json .gitignore electron.vite.config.ts tsconfig.json src
git commit -m "feat: scaffold electron live2d app"
```

---

### Task 2: 模型配置生成与资源复制

**Files:**
- Create: `src/shared/types.ts`
- Create: `src/model/buildModelConfig.ts`
- Create: `scripts/prepare-models.ts`
- Create: `tests/model/buildModelConfig.test.ts`

**Interfaces:**
- Consumes: `D:\codex\模型下载\live2d\338` 下四个模型目录。
- Produces:
  - `type OutfitId = 'casual' | 'event' | 'school_summer' | 'school_winter'`
  - `interface ModelDescriptor { id: OutfitId; displayName: string; modelJsonUrl: string }`
  - `interface Cubism2ModelJson { model: string; textures: string[]; physics?: string; motions?: Record<string, Array<{ file: string }>>; expressions?: Array<{ file: string }> }`
  - `function createCubism2ModelJson(data: BuildDataAsset, existingFiles: ReadonlySet<string>): Cubism2ModelJson`
  - `src/renderer/public/models/<id>/model.json` 与模型资源
  - `src/renderer/public/models/manifest.json`

- [ ] **Step 1: 写共享类型**

Create `src/shared/types.ts`:

```ts
export type OutfitId = 'casual' | 'event' | 'school_summer' | 'school_winter'

export interface ModelDescriptor {
  id: OutfitId
  displayName: string
  modelJsonUrl: string
}

export interface AssetRef {
  bundleName: string
  fileName: string
}

export interface BuildDataAsset {
  Base: {
    model: AssetRef
    physics: AssetRef
    textures: AssetRef[]
    motions: AssetRef[]
    expressions: AssetRef[]
  }
}

export interface Cubism2ModelJson {
  model: string
  textures: string[]
  physics?: string
  motions?: Record<string, Array<{ file: string }>>
  expressions?: Array<{ file: string }>
}
```

- [ ] **Step 2: 写生成函数**

Create `src/model/buildModelConfig.ts`:

```ts
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
    if (tapBody.length > 0) result.motions.tap_body = tapBody.map((file) => ({ file }))
  }

  const expressions = data.Base.expressions
    .map((expression) => stripBytes(expression.fileName))
    .filter((name) => existingFiles.has(name))

  if (expressions.length > 0) {
    result.expressions = expressions.map((file) => ({ file }))
  }

  return result
}
```

- [ ] **Step 3: 写失败测试**

Create `tests/model/buildModelConfig.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createCubism2ModelJson } from '../../src/model/buildModelConfig'
import type { BuildDataAsset } from '../../src/shared/types'

const fixture: BuildDataAsset = {
  Base: {
    model: { bundleName: 'test', fileName: 'test.moc.bytes' },
    physics: { bundleName: 'test', fileName: 'test.physics.json' },
    textures: [
      { bundleName: 'test', fileName: 'texture_00.png' },
      { bundleName: 'test', fileName: 'texture_01.png' }
    ],
    motions: [
      { bundleName: 'test', fileName: 'idle01.mtn.bytes' },
      { bundleName: 'test', fileName: 'missing.mtn.bytes' }
    ],
    expressions: [{ bundleName: 'test', fileName: 'smile.exp.json' }]
  }
}

describe('createCubism2ModelJson', () => {
  it('registers only files that exist locally', () => {
    const files = new Set([
      'test.moc',
      'test.physics.json',
      'texture_00.png',
      'texture_01.png',
      'idle01.mtn',
      'smile.exp.json'
    ])

    const result = createCubism2ModelJson(fixture, files)

    expect(result.model).toBe('test.moc')
    expect(result.textures).toEqual(['texture_00.png', 'texture_01.png'])
    expect(result.physics).toBe('test.physics.json')
    expect(result.motions?.idle).toEqual([{ file: 'idle01.mtn' }])
    expect(result.motions?.tap_body).toBeUndefined()
    expect(result.expressions).toEqual([{ file: 'smile.exp.json' }])
  })

  it('throws when the moc file is missing', () => {
    expect(() => createCubism2ModelJson(fixture, new Set())).toThrow('Missing model file')
  })
})
```

- [ ] **Step 4: 运行测试确认失败**

Run: `npm test`
Expected: 测试因 `createCubism2ModelJson` 不存在而失败。

- [ ] **Step 5: 运行测试确认通过**

Run: `npm test`
Expected: 两个测试全部通过。

- [ ] **Step 6: 写模型复制脚本**

Create `scripts/prepare-models.ts`:

```ts
import { copyFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createCubism2ModelJson } from '../src/model/buildModelConfig'
import type { BuildDataAsset, Cubism2ModelJson, OutfitId } from '../src/shared/types'

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
  const descriptors = []

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
    descriptors.push({ id: outfit.id, displayName: outfit.displayName, modelJsonUrl: `models/${outfit.id}/model.json` })
  }

  await writeFile(join(DEST_ROOT, 'manifest.json'), JSON.stringify(descriptors, null, 2), 'utf8')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
```

- [ ] **Step 7: 运行脚本并验证**

Run: `npm run prepare:models`
Expected: 四个 `model.json` 和 `manifest.json` 生成；便装/活动装/夏季/冬季目录内只包含实际存在的资源；夏季/冬季如缺少 `texture_00.png`，`model.json.textures` 不包含它。

- [ ] **Step 8: 提交**

```bash
git add src/shared/types.ts src/model/buildModelConfig.ts scripts/prepare-models.ts tests/model/buildModelConfig.test.ts src/renderer/public/models
git commit -m "feat: generate cubism2 model configs"
```---

### Task 3: 渲染器加载 Cubism 2.1 模型

**Files:**
- Modify: `src/renderer/index.html`
- Create: `src/renderer/src/live2d.ts`
- Modify: `src/renderer/src/main.ts`
- Create: `src/renderer/src/models.ts`

**Interfaces:**
- Consumes: `./models/manifest.json`、`./models/<id>/model.json`
- Produces:
  - `class Live2DRenderer { constructor(canvas: HTMLCanvasElement); async load(modelJsonUrl: string): Promise<void>; setParams(frame: Record<string, number>): void; destroy(): void }`
  - `async function fetchModelManifest(): Promise<ModelDescriptor[]>`

- [ ] **Step 1: 更新 HTML 引入 Cubism 2.1 运行时**

Modify `src/renderer/index.html`:

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <title>若叶睦 Live2D</title>
    <style>
      html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; background: transparent; }
      #live2d-canvas { width: 100%; height: 100%; display: block; }
    </style>
  </head>
  <body>
    <script src="./vendor/live2d.min.js"></script>
    <canvas id="live2d-canvas"></canvas>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 2: 写模型清单读取**

Create `src/renderer/src/models.ts`:

```ts
import type { ModelDescriptor } from '../../shared/types'

export async function fetchModelManifest(): Promise<ModelDescriptor[]> {
  const response = await fetch('./models/manifest.json')
  if (!response.ok) throw new Error(`manifest failed: ${response.status}`)
  return (await response.json()) as ModelDescriptor[]
}
```

- [ ] **Step 3: 写 Live2D 渲染器**

Create `src/renderer/src/live2d.ts`:

```ts
import * as PIXI from 'pixi.js'
import { Live2DModel } from 'pixi-live2d-display/cubism2'

declare global {
  interface Window { PIXI: typeof PIXI }
}

export class Live2DRenderer {
  private app: PIXI.Application
  private model: Live2DModel | null = null

  constructor(canvas: HTMLCanvasElement) {
    window.PIXI = PIXI
    this.app = new PIXI.Application({
      view: canvas,
      transparent: true,
      backgroundAlpha: 0,
      antialias: true,
      autoDensity: true,
      resolution: window.devicePixelRatio || 1
    })
    window.addEventListener('resize', () => this.resize())
    this.resize()
  }

  async load(modelJsonUrl: string): Promise<void> {
    const model = await Live2DModel.from(modelJsonUrl, { autoInteract: false })
    model.anchor.set(0.5, 0.5)
    if (this.model) this.model.destroy()
    this.model = model
    this.app.stage.addChild(model)
    this.resize()
  }

  setParams(params: Record<string, number>): void {
    const core = this.model?.internalModel.coreModel as { setParamFloat?: (id: string, value: number) => void } | null
    if (!core?.setParamFloat) return
    for (const [id, value] of Object.entries(params)) {
      core.setParamFloat(id, value)
    }
  }

  private resize(): void {
    const width = window.innerWidth
    const height = window.innerHeight
    this.app.renderer.resize(width, height)
    if (this.model) {
      const bounds = this.model.getBounds()
      const scale = Math.min(width / Math.max(bounds.width, 1), height / Math.max(bounds.height, 1)) * 0.9
      this.model.scale.set(scale)
      this.model.position.set(width / 2, height / 2)
    }
  }

  destroy(): void {
    this.model?.destroy()
    this.app.destroy(true)
  }
}
```

- [ ] **Step 4: 写渲染器入口**

Modify `src/renderer/src/main.ts`:

```ts
import { Live2DRenderer } from './live2d'
import { fetchModelManifest } from './models'

async function main(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>('#live2d-canvas')
  if (!canvas) throw new Error('canvas not found')

  const manifest = await fetchModelManifest()
  const renderer = new Live2DRenderer(canvas)
  await renderer.load(manifest[0].modelJsonUrl)
}

main().catch((error) => {
  console.error(error)
})
```

- [ ] **Step 5: 运行验证**

Run: `npm run prepare:models && npm run dev`
Expected: 默认加载便装模型，窗口内能看到模型，无控制台报错；若 `model.json` 或资源缺失，控制台输出具体错误。

- [ ] **Step 6: 提交**

```bash
git add src/renderer/index.html src/renderer/src/live2d.ts src/renderer/src/models.ts src/renderer/src/main.ts
git commit -m "feat: render cubism2 models"
```---

### Task 4: MediaPipe 面部与手势追踪

**Files:**
- Create: `src/shared/tracking.ts`
- Create: `src/renderer/src/tracking/mediapipeTracker.ts`

**Interfaces:**
- Consumes: `src/renderer/public/vendor/mediapipe-wasm`、`face_landmarker.task`、`hand_landmarker.task`
- Produces:
  - `interface LandmarkPoint { x: number; y: number; z: number }`
  - `interface TrackingFrame { face?: { landmarks: LandmarkPoint[]; blendshapes: Record<string, number> }; hands?: LandmarkPoint[][] }`
  - `interface TrackingOptions { enableFace: boolean; enableHands: boolean; inputWidth: number; inputHeight: number }`
  - `class MediaPipeTracker { async start(video: HTMLVideoElement, onFrame: (frame: TrackingFrame) => void, options: TrackingOptions): Promise<void>; stop(): void }`

- [ ] **Step 1: 写追踪类型**

Create `src/shared/tracking.ts`:

```ts
export interface LandmarkPoint {
  x: number
  y: number
  z: number
}

export interface TrackingFrame {
  face?: {
    landmarks: LandmarkPoint[]
    blendshapes: Record<string, number>
  }
  hands?: LandmarkPoint[][]
}

export interface TrackingOptions {
  enableFace: boolean
  enableHands: boolean
  inputWidth: number
  inputHeight: number
}
```

- [ ] **Step 2: 写 MediaPipe 追踪器**

Create `src/renderer/src/tracking/mediapipeTracker.ts`:

```ts
import {
  FaceLandmarker,
  FilesetResolver,
  HandLandmarker,
  type NormalizedLandmark
} from '@mediapipe/tasks-vision'
import type { LandmarkPoint, TrackingFrame, TrackingOptions } from '../../../shared/tracking'

function toPoint(landmark: NormalizedLandmark): LandmarkPoint {
  return { x: landmark.x, y: landmark.y, z: landmark.z }
}

function blendshapeMap(categories?: Array<{ categoryName: string; score: number }>): Record<string, number> {
  const result: Record<string, number> = {}
  for (const category of categories ?? []) result[category.categoryName] = category.score
  return result
}

export class MediaPipeTracker {
  private faceLandmarker: FaceLandmarker | null = null
  private handLandmarker: HandLandmarker | null = null
  private rafId = 0
  private running = false

  async start(
    video: HTMLVideoElement,
    onFrame: (frame: TrackingFrame) => void,
    options: TrackingOptions
  ): Promise<void> {
    const vision = await FilesetResolver.forVisionTasks('./vendor/mediapipe-wasm')

    if (options.enableFace) {
      this.faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: './vendor/face_landmarker.task',
          delegate: 'GPU'
        },
        runningMode: 'VIDEO',
        numFaces: 1
      })
    }

    if (options.enableHands) {
      this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: './vendor/hand_landmarker.task',
          delegate: 'GPU'
        },
        runningMode: 'VIDEO',
        numHands: 2
      })
    }

    this.running = true
    const tick = (): void => {
      if (!this.running) return
      const timestamp = performance.now()
      const frame: TrackingFrame = {}

      const faceResult = this.faceLandmarker?.detectForVideo(video, timestamp)
      if (faceResult?.faceLandmarks.length) {
        frame.face = {
          landmarks: faceResult.faceLandmarks[0].map(toPoint),
          blendshapes: blendshapeMap(faceResult.faceBlendshapes?.[0]?.categories)
        }
      }

      const handResult = this.handLandmarker?.detectForVideo(video, timestamp)
      if (handResult?.landmarks.length) {
        frame.hands = handResult.landmarks.map((hand) => hand.map(toPoint))
      }

      onFrame(frame)
      this.rafId = requestAnimationFrame(tick)
    }

    this.rafId = requestAnimationFrame(tick)
  }

  stop(): void {
    this.running = false
    cancelAnimationFrame(this.rafId)
    this.faceLandmarker?.close()
    this.handLandmarker?.close()
    this.faceLandmarker = null
    this.handLandmarker = null
  }
}
```

- [ ] **Step 3: 接入摄像头**

Modify `src/renderer/src/main.ts`:

```ts
import { Live2DRenderer } from './live2d'
import { fetchModelManifest } from './models'
import { MediaPipeTracker } from './tracking/mediapipeTracker'
import type { OutfitId } from '../../shared/types'

async function startCamera(): Promise<HTMLVideoElement> {
  const video = document.createElement('video')
  video.autoplay = true
  video.muted = true
  video.playsInline = true
  video.style.display = 'none'
  document.body.appendChild(video)
  const startCameraWithRetry = async (): Promise<void> => {
    while (true) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }
        })
        video.srcObject = stream
        await video.play()
        return
      } catch (error) {
        console.error('camera unavailable, retry in 5s', error)
        await new Promise((resolve) => setTimeout(resolve, 5000))
      }
    }
  }

  await startCameraWithRetry()
  return video
}

async function main(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>('#live2d-canvas')
  if (!canvas) throw new Error('canvas not found')

  const manifest = await fetchModelManifest()
  const renderer = new Live2DRenderer(canvas)
  await renderer.load(manifest[0].modelJsonUrl)

  const video = await startCamera()
  const tracker = new MediaPipeTracker()
  tracker.start(video, (frame) => {
    console.log('tracking frame', frame.face?.landmarks.length, frame.hands?.length)
  }, { enableFace: true, enableHands: true, inputWidth: 1280, inputHeight: 720 })
}

main().catch((error) => {
  console.error(error)
})
```

- [ ] **Step 4: 运行验证**

Run: `npm run dev`
Expected: 摄像头权限弹窗出现；控制台持续输出 `tracking frame`，有脸时 `face.landmarks.length` 为 478，有手时 `hands.length` 为 1 或 2。

- [ ] **Step 5: 提交**

```bash
git add src/shared/tracking.ts src/renderer/src/tracking/mediapipeTracker.ts src/renderer/src/main.ts
git commit -m "feat: add mediapipe face and hand tracking"
```---

### Task 5: 参数映射与平滑

**Files:**
- Create: `src/renderer/src/tracking/paramMapper.ts`
- Create: `src/renderer/src/tracking/smoother.ts`
- Create: `tests/tracking/paramMapper.test.ts`
- Create: `tests/tracking/smoother.test.ts`

**Interfaces:**
- Consumes: `TrackingFrame`、`LandmarkPoint`
- Produces:
  - `function mapTrackingToParams(frame: TrackingFrame): Record<string, number>`
  - `class ParamSmoother { constructor(alpha?: number); update(next: Record<string, number>): Record<string, number>; reset(): void }`

- [ ] **Step 1: 写参数映射器**

Create `src/renderer/src/tracking/paramMapper.ts`:

```ts
import type { LandmarkPoint, TrackingFrame } from '../../../shared/tracking'

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

const distance = (a: LandmarkPoint, b: LandmarkPoint): number =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)

export function mapTrackingToParams(frame: TrackingFrame): Record<string, number> {
  const params: Record<string, number> = {}

  if (frame.face) {
    const { landmarks, blendshapes } = frame.face
    const leftEye = landmarks[33]
    const rightEye = landmarks[263]
    const nose = landmarks[1]
    const chin = landmarks[152]

    params['PARAM_ANGLE_Y'] = clamp((nose.x - 0.5) * 60, -30, 30)
    params['PARAM_ANGLE_X'] = clamp((leftEye.y - rightEye.y) * 120, -30, 30)
    params['PARAM_ANGLE_Z'] = clamp((leftEye.x - rightEye.x) * 120, -15, 15)
    params['PARAM_BODY_ANGLE_X'] = params['PARAM_ANGLE_X'] * 0.4
    params['PARAM_BODY_ANGLE_Y'] = params['PARAM_ANGLE_Y'] * 0.4
    params['PARAM_BODY_ANGLE_Z'] = params['PARAM_ANGLE_Z'] * 0.4

    params['PARAM_EYE_L_OPEN'] = 1 - clamp(blendshapes['eyeBlinkLeft'] ?? 0, 0, 1)
    params['PARAM_EYE_R_OPEN'] = 1 - clamp(blendshapes['eyeBlinkRight'] ?? 0, 0, 1)
    params['PARAM_BROW_L_FORM'] = clamp(blendshapes['browDownLeft'] ?? 0, 0, 1) * 30
    params['PARAM_BROW_R_FORM'] = clamp(blendshapes['browDownRight'] ?? 0, 0, 1) * 30
    params['PARAM_MOUTH_OPEN_Y'] = clamp(blendshapes['jawOpen'] ?? 0, 0, 1) * 40
    params['PARAM_MOUTH_FORM_Y'] = clamp(blendshapes['mouthSmileLeft'] ?? 0, 0, 1) * 20

    const faceHeight = distance(leftEye, chin)
    params['PARAM_POSITION_Y'] = clamp(((nose.y - 0.5) / Math.max(faceHeight, 0.01)) * 0.5, -0.5, 0.5)
  }

  if (frame.hands && frame.hands.length > 0) {
    frame.hands.forEach((hand, index) => {
      const side = index === 0 ? 'L' : 'R'
      const wrist = hand[0]
      const middleTip = hand[12]
      const thumbTip = hand[4]
      const pinkyTip = hand[20]
      const open = clamp((distance(middleTip, wrist) + distance(thumbTip, wrist) + distance(pinkyTip, wrist)) / 3 * 2, 0, 1)
      const raise = clamp((0.5 - wrist.y) * 2, -1, 1)

      params[`PARAM_ARM_${side}_01_001`] = clamp(raise * 30, -30, 30)
      params[`PARAM_HAND_${side}_01_001`] = open
      params[`PARAM_HAND_${side}_02_001`] = open
      params[`PARAM_HAND_${side}_03_001`] = open
      params[`PARAM_HAND_${side}_04_001`] = open
      params[`PARAM_HAND_${side}_05_001`] = open
    })
  }

  return params
}
```

- [ ] **Step 2: 写平滑器**

Create `src/renderer/src/tracking/smoother.ts`:

```ts
export class ParamSmoother {
  private previous = new Map<string, number>()

  constructor(private readonly alpha = 0.35) {}

  update(next: Record<string, number>): Record<string, number> {
    const result: Record<string, number> = {}
    for (const [key, value] of Object.entries(next)) {
      const previousValue = this.previous.get(key)
      const smoothed = previousValue === undefined ? value : previousValue + this.alpha * (value - previousValue)
      this.previous.set(key, smoothed)
      result[key] = smoothed
    }
    return result
  }

  reset(): void {
    this.previous.clear()
  }
}
```

- [ ] **Step 3: 写失败测试**

Create `tests/tracking/paramMapper.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { mapTrackingToParams } from '../../src/renderer/src/tracking/paramMapper'
import type { TrackingFrame } from '../../src/shared/tracking'

describe('mapTrackingToParams', () => {
  it('maps face blendshapes to eye and mouth params', () => {
    const frame: TrackingFrame = {
      face: {
        landmarks: [
          { x: 0.5, y: 0.5, z: 0 },
          { x: 0.5, y: 0.6, z: 0 },
          { x: 0.5, y: 0.5, z: 0 }
        ],
        blendshapes: { eyeBlinkLeft: 1, eyeBlinkRight: 0, jawOpen: 0.5 }
      }
    }

    const params = mapTrackingToParams(frame)

    expect(params['PARAM_EYE_L_OPEN']).toBe(0)
    expect(params['PARAM_EYE_R_OPEN']).toBe(1)
    expect(params['PARAM_MOUTH_OPEN_Y']).toBe(20)
  })
})
```

Create `tests/tracking/smoother.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { ParamSmoother } from '../../src/renderer/src/tracking/smoother'

describe('ParamSmoother', () => {
  it('keeps first value and converges on later updates', () => {
    const smoother = new ParamSmoother(0.5)
    expect(smoother.update({ PARAM_ANGLE_X: 10 })).toEqual({ PARAM_ANGLE_X: 10 })
    expect(smoother.update({ PARAM_ANGLE_X: 20 }).PARAM_ANGLE_X).toBe(15)
    expect(smoother.update({ PARAM_ANGLE_X: 20 }).PARAM_ANGLE_X).toBe(17.5)
  })

  it('resets stored values', () => {
    const smoother = new ParamSmoother(0.5)
    smoother.update({ PARAM_ANGLE_X: 10 })
    smoother.reset()
    expect(smoother.update({ PARAM_ANGLE_X: 20 })).toEqual({ PARAM_ANGLE_X: 20 })
  })
})
```

- [ ] **Step 4: 运行测试确认失败**

Run: `npm test`
Expected: `mapTrackingToParams` 和 `ParamSmoother` 相关测试因模块不存在而失败。

- [ ] **Step 5: 运行测试确认通过**

Run: `npm test`
Expected: 全部通过。

- [ ] **Step 6: 接入渲染参数流**

Modify `src/renderer/src/main.ts`:

```ts
import { Live2DRenderer } from './live2d'
import { fetchModelManifest } from './models'
import { mapTrackingToParams } from './tracking/paramMapper'
import { ParamSmoother } from './tracking/smoother'
import { MediaPipeTracker } from './tracking/mediapipeTracker'
import type { OutfitId } from '../../shared/types'

async function main(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>('#live2d-canvas')
  if (!canvas) throw new Error('canvas not found')

  const manifest = await fetchModelManifest()
  const renderer = new Live2DRenderer(canvas)
  await renderer.load(manifest[0].modelJsonUrl)

  const video = document.createElement('video')
  video.autoplay = true
  video.muted = true
  video.playsInline = true
  video.style.display = 'none'
  document.body.appendChild(video)
  const startCameraWithRetry = async (): Promise<void> => {
    while (true) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }
        })
        video.srcObject = stream
        await video.play()
        return
      } catch (error) {
        console.error('camera unavailable, retry in 5s', error)
        await new Promise((resolve) => setTimeout(resolve, 5000))
      }
    }
  }

  await startCameraWithRetry()

  const tracker = new MediaPipeTracker()
  const smoother = new ParamSmoother(0.35)
  tracker.start(
    video,
    (frame) => renderer.setParams(smoother.update(mapTrackingToParams(frame))),
    { enableFace: true, enableHands: true, inputWidth: 1280, inputHeight: 720 }
  )
}

main().catch((error) => {
  console.error(error)
})
```

- [ ] **Step 7: 运行验证**

Run: `npm run dev`
Expected: 转头、眨眼、张嘴、抬手时模型参数产生响应；画面无明显抖动。

- [ ] **Step 8: 提交**

```bash
git add src/renderer/src/tracking/paramMapper.ts src/renderer/src/tracking/smoother.ts tests/tracking
git add src/renderer/src/main.ts
git commit -m "feat: map and smooth tracking params"
```---

### Task 6: 全局热键与模型切换

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`
- Create: `src/preload/api.ts`
- Create: `src/renderer/src/modelManager.ts`
- Modify: `src/renderer/src/main.ts`

**Interfaces:**
- Consumes: `ModelDescriptor`、`Live2DRenderer`
- Produces:
  - `interface StreamerApi { onModelSwitch(callback: (id: OutfitId) => void): () => void }`
  - `class ModelManager { constructor(renderer: Live2DRenderer); async init(): Promise<void>; async switchModel(id: OutfitId): Promise<void> }`

- [ ] **Step 1: 写预加载 API**

Create `src/preload/api.ts`:

```ts
import { contextBridge, ipcRenderer } from 'electron'
import type { OutfitId } from '../shared/types'

const api = {
  onModelSwitch: (callback: (id: OutfitId) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, id: OutfitId): void => callback(id)
    ipcRenderer.on('model:switch', listener)
    return () => ipcRenderer.removeListener('model:switch', listener)
  }
}

contextBridge.exposeInMainWorld('api', api)
```

Replace `src/preload/index.ts` content with:

```ts
import './api'
```

Add type declaration `src/renderer/src/global.d.ts`:

```ts
import type { OutfitId } from '../../shared/types'

declare global {
  interface Window {
    api: {
      onModelSwitch
      onModelSwitch: (callback: (id: OutfitId) => void) => () => void
    }
  }
}

export {}
```

- [ ] **Step 2: 写模型管理器**

Create `src/renderer/src/modelManager.ts`:

```ts
import type { ModelDescriptor, OutfitId } from '../../shared/types'
import type { Live2DRenderer } from './live2d'
import { fetchModelManifest } from './models'

export class ModelManager {
  private descriptors = new Map<OutfitId, ModelDescriptor>()
  private current: OutfitId | null = null

  constructor(private readonly renderer: Live2DRenderer) {}

  async init(): Promise<void> {
    const models = await fetchModelManifest()
    for (const model of models) this.descriptors.set(model.id, model)
    if (this.current === null) await this.switchModel('casual')
  }

  async switchModel(id: OutfitId): Promise<void> {
    const descriptor = this.descriptors.get(id)
    if (!descriptor) throw new Error(`Unknown model: ${id}`)
    await this.renderer.load(descriptor.modelJsonUrl)
    this.current = id
  }

  getCurrent(): OutfitId | null {
    return this.current
  }
}
```

- [ ] **Step 3: 主进程提供模型列表和热键**

Modify `src/main/index.ts`:

```ts
import { appendFile } from 'node:fs/promises'
import { join } from 'node:path'

import { app, BrowserWindow, globalShortcut } from 'electron'


const SHORTCUTS: Array<[string, string]> = [
  ['F1', 'casual'],
  ['F2', 'event'],
  ['F3', 'school_summer'],
  ['F4', 'school_winter']
]

let outputWindow: BrowserWindow | null = null
function createMainWindow(): BrowserWindow {
  outputWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    transparent: true,
    frame: false,
    backgroundColor: '#00000000',
    hasShadow: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) outputWindow.loadURL(devUrl)
  else outputWindow.loadFile(join(__dirname, '../renderer/index.html'))
  outputWindow.on('closed', () => { outputWindow = null })
  return outputWindow
}

app.whenReady().then(async () => {
  createMainWindow()

  
  for (const [accelerator, id] of SHORTCUTS) {
    const ok = globalShortcut.register(accelerator, () => {
      outputWindow?.webContents.send('model:switch', id)
    })
    if (!ok) console.warn(`shortcut registration failed: ${accelerator}`)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('will-quit', () => globalShortcut.unregisterAll())

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
```

- [ ] **Step 4: 渲染器接入切换**

Modify `src/renderer/src/main.ts`:

```ts
import { Live2DRenderer } from './live2d'
import { ModelManager } from './modelManager'
import { mapTrackingToParams } from './tracking/paramMapper'
import { ParamSmoother } from './tracking/smoother'
import { MediaPipeTracker } from './tracking/mediapipeTracker'
import type { OutfitId } from '../../shared/types'

async function main(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>('#live2d-canvas')
  if (!canvas) throw new Error('canvas not found')

  const renderer = new Live2DRenderer(canvas)
  const modelManager = new ModelManager(renderer)
  await modelManager.init()

  const video = document.createElement('video')
  video.autoplay = true
  video.muted = true
  video.playsInline = true
  video.style.display = 'none'
  document.body.appendChild(video)
  const startCameraWithRetry = async (): Promise<void> => {
    while (true) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }
        })
        video.srcObject = stream
        await video.play()
        return
      } catch (error) {
        console.error('camera unavailable, retry in 5s', error)
        await new Promise((resolve) => setTimeout(resolve, 5000))
      }
    }
  }

  await startCameraWithRetry()

  const tracker = new MediaPipeTracker()
  const smoother = new ParamSmoother(0.35)
  tracker.start(
    video,
    (frame) => renderer.setParams(smoother.update(mapTrackingToParams(frame))),
    { enableFace: true, enableHands: true, inputWidth: 1280, inputHeight: 720 }
  )

  const localShortcutIds: OutfitId[] = ['casual', 'event', 'school_summer', 'school_winter']
  window.addEventListener('keydown', (event) => {
    const index = ['1', '2', '3', '4'].indexOf(event.key)
    if (index >= 0) modelManager.switchModel(localShortcutIds[index]).catch((error) => console.error(error))
  })

  window.api.onModelSwitch((id) => {
    modelManager.switchModel(id).catch((error) => console.error(error))
  })
}

main().catch((error) => {
  console.error(error)
})
```

- [ ] **Step 5: 运行验证**

Run: `npm run dev`
Expected: 按 `F1-F4` 可在四套模型间切换；切换后摄像头动捕继续生效。

- [ ] **Step 6: 提交**

```bash
git add src/main/index.ts src/preload src/renderer/src/modelManager.ts src/renderer/src/main.ts
git commit -m "feat: add global hotkeys and model switching"
```---

### Task 7: 透明输出、控制窗口与容错

**Files:**
- Modify: `src/main/index.ts`
- Create: `src/renderer/src/control.ts`
- Create: `src/renderer/control.html`
- Modify: `src/renderer/src/main.ts`

**Interfaces:**
- Consumes: `ModelManager`、`MediaPipeTracker`
- Produces:
  - `function openControlWindow(): BrowserWindow`
  - `window.api.onStatus(callback: (status: string) => void)`

- [ ] **Step 1: 主进程拆分窗口**

Modify `src/main/index.ts`:

```ts
import { appendFile } from 'node:fs/promises'
import { join } from 'node:path'

import { app, BrowserWindow, globalShortcut } from 'electron'


const SHORTCUTS: Array<[string, string]> = [
  ['F1', 'casual'],
  ['F2', 'event'],
  ['F3', 'school_summer'],
  ['F4', 'school_winter']
]

let outputWindow: BrowserWindow | null = null
function createOutputWindow(): BrowserWindow {
  outputWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    transparent: true,
    frame: false,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) outputWindow.loadURL(devUrl)
  else outputWindow.loadFile(join(__dirname, '../renderer/index.html'))
  outputWindow.on('closed', () => { outputWindow = null })
  return outputWindow
}

function createControlWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 320,
    height: 420,
    title: '若叶睦控制台',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) win.loadURL(${devUrl}/control.html)
  else win.loadFile(join(__dirname, '../renderer/control.html'))
  return win
}

app.whenReady().then(async () => {
  createOutputWindow()
  createControlWindow()

  
  for (const [accelerator, id] of SHORTCUTS) {
    const ok = globalShortcut.register(accelerator, () => {
      outputWindow?.webContents.send('model:switch', id)
    })
    if (!ok) console.warn(`shortcut registration failed: ${accelerator}`)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createOutputWindow()
      createControlWindow()
    }
  })
})

app.on('will-quit', () => globalShortcut.unregisterAll())

const writeErrorLog = (error: unknown): void => {
  appendFile(join(app.getPath('userData'), 'live2d-error.log'), `${new Date().toISOString()} ${error instanceof Error ? error.stack : String(error)}\n`).catch(() => {})
}

process.on('uncaughtException', (error) => {
  writeErrorLog(error)
  console.error('uncaughtException', error)
})

process.on('unhandledRejection', (error) => {
  writeErrorLog(error)
  console.error('unhandledRejection', error)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
```

- [ ] **Step 2: 写控制窗口页面**

Create `src/renderer/control.html`:

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <title>若叶睦控制台</title>
    <style>
      body { font-family: system-ui, sans-serif; padding: 16px; }
      #status { white-space: pre-wrap; }
    </style>
  </head>
  <body>
    <h1>若叶睦控制台</h1>
    <p>热键：F1-F4 切换服装</p>
    <p id="status">正在启动...</p>
    <script type="module" src="/src/control.ts"></script>
  </body>
</html>
```

Create `src/renderer/src/control.ts`:

```ts
const status = document.querySelector<HTMLParagraphElement>('#status')
if (status) {
  window.api.onModelSwitch((id) => {
    status.textContent = `当前服装：${id}`
  })
}
```

- [ ] **Step 3: 渲染器上报状态**

Modify `src/renderer/src/main.ts`:

```ts
import { Live2DRenderer } from './live2d'
import { ModelManager } from './modelManager'
import { mapTrackingToParams } from './tracking/paramMapper'
import { ParamSmoother } from './tracking/smoother'
import { MediaPipeTracker } from './tracking/mediapipeTracker'
import type { OutfitId } from '../../shared/types'

async function main(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>('#live2d-canvas')
  if (!canvas) throw new Error('canvas not found')

  const renderer = new Live2DRenderer(canvas)
  const modelManager = new ModelManager(renderer)
  await modelManager.init()

  const video = document.createElement('video')
  video.autoplay = true
  video.muted = true
  video.playsInline = true
  video.style.display = 'none'
  document.body.appendChild(video)

  const startCameraWithRetry = async (): Promise<void> => {
    while (true) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }
        })
        video.srcObject = stream
        await video.play()
        return
      } catch (error) {
        console.error('camera unavailable, retry in 5s', error)
        await new Promise((resolve) => setTimeout(resolve, 5000))
      }
    }
  }

  await startCameraWithRetry()

  const tracker = new MediaPipeTracker()
  const smoother = new ParamSmoother(0.35)
  tracker.start(
    video,
    (frame) => renderer.setParams(smoother.update(mapTrackingToParams(frame))),
    { enableFace: true, enableHands: true, inputWidth: 1280, inputHeight: 720 }
  )

  const localShortcutIds: OutfitId[] = ['casual', 'event', 'school_summer', 'school_winter']
  window.addEventListener('keydown', (event) => {
    const index = ['1', '2', '3', '4'].indexOf(event.key)
    if (index >= 0) modelManager.switchModel(localShortcutIds[index]).catch((error) => console.error(error))
  })

  window.api.onModelSwitch((id) => {
    modelManager.switchModel(id).catch((error) => console.error(error))
  })
}

main().catch((error) => {
  console.error(error)
})
```

- [ ] **Step 4: 运行验证**

Run: `npm run dev`
Expected: 输出窗口透明且只有模型；控制窗口可打开并显示当前服装；摄像头不可用时输出窗口仍显示模型。

- [ ] **Step 5: OBS 捕获验证**

Run: `npm run dev`
Expected: OBS 新建“窗口捕获”，选择应用输出窗口，透明背景正常、无黑底。

- [ ] **Step 6: 提交**

```bash
git add src/main/index.ts src/renderer/control.html src/renderer/src/control.ts src/renderer/src/main.ts
git commit -m "feat: add control window and error handling"
```---

### Task 8: 性能档位、文档与最终验收

**Files:**
- Create: `src/renderer/src/tracking/quality.ts`
- Create: `tests/tracking/quality.test.ts`
- Modify: `src/renderer/src/main.ts`
- Create: `README.md`

**Interfaces:**
- Consumes: `MediaPipeTracker`、`TrackingOptions`
- Produces:
  - `type QualityLevel = 'full' | 'lite' | 'face-only' | 'minimal'`
  - `class QualityController { update(fps: number): QualityLevel; getLevel(): QualityLevel }`

- [ ] **Step 1: 写性能状态机**

Create `src/renderer/src/tracking/quality.ts`:

```ts
export type QualityLevel = 'full' | 'lite' | 'face-only' | 'minimal'

const ORDER: QualityLevel[] = ['full', 'lite', 'face-only', 'minimal']

export class QualityController {
  private level: QualityLevel = 'full'
  private lowFrames = 0
  private highFrames = 0

  update(fps: number): QualityLevel {
    if (fps < 24) {
      this.lowFrames += 1
      this.highFrames = 0
      if (this.lowFrames >= 30) {
        this.lowFrames = 0
        const index = ORDER.indexOf(this.level)
        if (index < ORDER.length - 1) this.level = ORDER[index + 1]
      }
    } else {
      this.highFrames += 1
      this.lowFrames = 0
      if (this.highFrames >= 180) {
        this.highFrames = 0
        const index = ORDER.indexOf(this.level)
        if (index > 0) this.level = ORDER[index - 1]
      }
    }
    return this.level
  }

  getLevel(): QualityLevel {
    return this.level
  }
}
```

- [ ] **Step 2: 写失败测试**

Create `tests/tracking/quality.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { QualityController } from '../../src/renderer/src/tracking/quality'

describe('QualityController', () => {
  it('downgrades after 30 low-fps frames', () => {
    const controller = new QualityController()
    for (let i = 0; i < 30; i += 1) controller.update(20)
    expect(controller.getLevel()).toBe('lite')
  })

  it('upgrades after 180 high-fps frames', () => {
    const controller = new QualityController()
    for (let i = 0; i < 30; i += 1) controller.update(20)
    for (let i = 0; i < 180; i += 1) controller.update(60)
    expect(controller.getLevel()).toBe('full')
  })
})
```

- [ ] **Step 3: 运行测试确认失败**

Run: `npm test`
Expected: 因 `quality.ts` 不存在而失败。

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test`
Expected: 全部通过。

- [ ] **Step 5: 接入自动降级**

Modify `src/renderer/src/main.ts`:

```ts
import { Live2DRenderer } from './live2d'
import { ModelManager } from './modelManager'
import { mapTrackingToParams } from './tracking/paramMapper'
import { ParamSmoother } from './tracking/smoother'
import { MediaPipeTracker } from './tracking/mediapipeTracker'
import type { OutfitId } from '../../shared/types'
import { QualityController, type QualityLevel } from './tracking/quality'
import type { OutfitId } from '../../shared/types'

function optionsForLevel(level: QualityLevel) {
  if (level === 'minimal') {
    return { enableFace: false, enableHands: false, inputWidth: 320, inputHeight: 180 }
  }
  if (level === 'face-only') {
    return { enableFace: true, enableHands: false, inputWidth: 480, inputHeight: 270 }
  }
  if (level === 'lite') {
    return { enableFace: true, enableHands: true, inputWidth: 480, inputHeight: 270 }
  }
  return { enableFace: true, enableHands: true, inputWidth: 1280, inputHeight: 720 }
}

async function main(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>('#live2d-canvas')
  if (!canvas) throw new Error('canvas not found')

  const renderer = new Live2DRenderer(canvas)
  const modelManager = new ModelManager(renderer)
  await modelManager.init()

  const video = document.createElement('video')
  video.autoplay = true
  video.muted = true
  video.playsInline = true
  video.style.display = 'none'
  document.body.appendChild(video)

  const startCameraWithRetry = async (): Promise<void> => {
    while (true) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }
        })
        video.srcObject = stream
        await video.play()
        return
      } catch (error) {
        console.error('camera unavailable, retry in 5s', error)
        await new Promise((resolve) => setTimeout(resolve, 5000))
      }
    }
  }

  await startCameraWithRetry()

  const tracker = new MediaPipeTracker()
  const smoother = new ParamSmoother(0.35)
  const quality = new QualityController()
  const onFrame = (frame) => renderer.setParams(smoother.update(mapTrackingToParams(frame)))
  let currentLevel = quality.getLevel()
  let currentOptions = optionsForLevel(currentLevel)
  tracker.start(video, onFrame, currentOptions)

  let lastTime = performance.now()
  let fps = 60
  const tick = (): void => {
    const now = performance.now()
    fps = 1000 / Math.max(now - lastTime, 1)
    lastTime = now
    const level = quality.update(fps)
    if (level !== currentLevel) {
      currentLevel = level
      currentOptions = optionsForLevel(level)
      tracker.stop()
      tracker.start(video, onFrame, currentOptions)
    }
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)

  const localShortcutIds: OutfitId[] = ['casual', 'event', 'school_summer', 'school_winter']
  window.addEventListener('keydown', (event) => {
    const index = ['1', '2', '3', '4'].indexOf(event.key)
    if (index >= 0) modelManager.switchModel(localShortcutIds[index]).catch((error) => console.error(error))
  })

  window.api.onModelSwitch((id) => {
    modelManager.switchModel(id).catch((error) => console.error(error))
  })
}

main().catch((error) => {
  console.error(error)
})
```

- [ ] **Step 6: 写 README**

Create `README.md`:

````markdown
# 若叶睦 Live2D 直播动捕

## 启动

```powershell
npm install
npm run prepare:models
npm run dev
```

## 热键

- F1：便装
- F2：活动剧情装
- F3：夏季校服
- F4：冬季校服

## OBS

1. 新建窗口捕获。
2. 选择“若叶睦 Live2D”输出窗口。
3. 确认背景透明。

## 抖音/B 站直播伴侣

1. 在 OBS 中把输出窗口加入场景。
2. 开启 OBS VirtualCam。
3. 直播伴侣的摄像头选择 OBS Virtual Camera。
````

- [ ] **Step 7: 最终验收**

Run: `npm run prepare:models && npm test && npm run dev`
Expected: 四套模型可通过 F1-F4 切换；面部、头部、手部动作有响应；OBS 窗口捕获透明正常；长时间运行无崩溃。

- [ ] **Step 8: 提交**

```bash
git add src/renderer/src/tracking/quality.ts tests/tracking/quality.test.ts src/renderer/src/main.ts README.md
git commit -m "feat: add adaptive quality and usage docs"
```