import { describe, expect, it } from 'vitest'
import { buildVoiceCatalog } from '../../src/main/voice/voiceCatalog'

describe('buildVoiceCatalog', () => {
  it('maps each voice to the current training audio directory', () => {
    const catalog = buildVoiceCatalog({
      gptSovitsDir: 'D:/GPT-SOVITS/model',
      trainingAudioDir: 'D:/GPT-SOVITS/训练音频'
    })

    expect(catalog['若叶睦'].referenceAudioPath).toBe(
      'D:\\GPT-SOVITS\\训练音频\\若叶睦\\ごめんなさい。バンド壊して、ギター下手で、ずっと謝りたかった.wav'
    )
    expect(catalog['千早爱音'].referenceAudioPath).toBe(
      'D:\\GPT-SOVITS\\训练音频\\千早爱音\\そう！今度の朝活はおしゃれなカフェで美味しいモーニングをいっぱい食べるんだ～！.mp3'
    )
    expect(catalog['白祥'].referenceAudioPath).toBe(
      'D:\\GPT-SOVITS\\训练音频\\白祥\\(A)あなたと空を見上げるのは、いつも夏でしたわね.wav'
    )
    expect(catalog['黑祥'].referenceAudioPath).toBe(
      'D:\\GPT-SOVITS\\训练音频\\黑祥\\(A)今後は発言にプロとしての自覚をお持ちになって.wav'
    )
    expect(catalog['墨提斯'].referenceAudioPath).toBe(
      'D:\\GPT-SOVITS\\训练音频\\mortis\\(A)なんで？解散なんて話になってなかったじゃない、どうしてそうなるの？.wav'
    )
  })
})
