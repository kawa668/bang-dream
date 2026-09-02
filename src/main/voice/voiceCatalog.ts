import { join } from 'node:path'
import type { VoiceId } from '../../shared/voice'
import type { VoiceProfile } from './interfaces'

interface VoiceProfileSpec {
  voiceId: VoiceId
  gptFileName: string
  sovitsFileName: string
  referenceDir: string
  referenceFile: string
  promptText: string
}

const VOICE_SPECS: VoiceProfileSpec[] = [
  {
    voiceId: '若叶睦',
    gptFileName: 'Mujica_若葉睦_v2pp.ckpt',
    sovitsFileName: 'Mujica_若葉睦_v2pp.pth',
    referenceDir: '若叶睦',
    referenceFile: '(A)ごめんなさい。バンド壊して、ギター下手で、ずっと謝りたかった.wav',
    promptText: 'ごめんなさい。バンド壊して、ギター下手で、ずっと謝りたかった'
  },
  {
    voiceId: '千早爱音',
    gptFileName: 'MyGO_千早爱音_v2pp.ckpt',
    sovitsFileName: 'MyGO_千早爱音_v2pp.pth',
    referenceDir: '千早爱音',
    referenceFile: '训练集/そう！今度の朝活はおしゃれなカフェで美味しいモーニングをいっぱい食べるんだ～！.mp3',
    promptText: 'そう！今度の朝活はおしゃれなカフェで美味しいモーニングをいっぱい食べるんだ～！'
  },
  {
    voiceId: '白祥',
    gptFileName: 'Mujica_豊川祥子_白_v2pp.ckpt',
    sovitsFileName: 'Mujica_豊川祥子_白_v2pp.pth',
    referenceDir: '丰川祥子（白祥）',
    referenceFile: '(A)あなたと空を見上げるのは、いつも夏でしたわね.wav',
    promptText: 'あなたと空を見上げるのは、いつも夏でしたわね'
  },
  {
    voiceId: '黑祥',
    gptFileName: 'Mujica_豊川祥子_黒_v2pp.ckpt',
    sovitsFileName: 'Mujica_豊川祥子_黒_v2pp.pth',
    referenceDir: '丰川祥子（黑祥）',
    referenceFile: '(A)今後は発言にプロとしての自覚をお持ちになって.wav',
    promptText: '今後は発言にプロとしての自覚をお持ちになって'
  },
  {
    voiceId: '墨提斯',
    gptFileName: 'Mujica_Mortis_v2pp.ckpt',
    sovitsFileName: 'Mujica_Mortis_v2pp.pth',
    referenceDir: '墨提斯',
    referenceFile: '(A)なんで？解散なんて話になってなかったじゃない、どうしてそうなるの？.wav',
    promptText: 'なんで？解散なんて話になってなかったじゃない、どうしてそうなるの？'
  }
]

export function buildVoiceCatalog(options: {
  gptSovitsDir: string
  trainingAudioDir: string
}): Record<VoiceId, VoiceProfile> {
  return Object.fromEntries(
    VOICE_SPECS.map((spec) => [
      spec.voiceId,
      {
        voiceId: spec.voiceId,
        gptWeightsPath: join(options.gptSovitsDir, 'GPT_weights_v2Pro', spec.gptFileName),
        sovitsWeightsPath: join(options.gptSovitsDir, 'SoVITS_weights_v2Pro', spec.sovitsFileName),
        referenceAudioPath: join(options.trainingAudioDir, spec.referenceDir, spec.referenceFile),
        promptText: spec.promptText,
        promptLang: 'ja'
      }
    ])
  ) as Record<VoiceId, VoiceProfile>
}
