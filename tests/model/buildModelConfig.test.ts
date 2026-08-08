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
      { bundleName: 'test', fileName: 'angry01.mtn.bytes' },
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
      'angry01.mtn',
      'smile.exp.json'
    ])

    const result = createCubism2ModelJson(fixture, files)

    expect(result.model).toBe('test.moc')
    expect(result.textures).toEqual(['texture_00.png', 'texture_01.png'])
    expect(result.physics).toBe('test.physics.json')
    expect(result.motions?.idle).toEqual([{ file: 'idle01.mtn' }])
    expect(result.motions?.angry01).toEqual([{ file: 'angry01.mtn' }])
    expect(result.expressions).toEqual([{ file: 'smile.exp.json' }])
  })

  it('throws when the moc file is missing', () => {
    expect(() => createCubism2ModelJson(fixture, new Set())).toThrow('Missing model file')
  })
})
