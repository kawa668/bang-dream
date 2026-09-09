export type Emotion = 'neutral' | 'calm' | 'happy' | 'sad' | 'excited' | 'thinking'

const EXCITED = ['哇', '！！', '太激动']
const HAPPY = ['开心', '哈哈', '太棒', '好耶', '高兴', '喜欢']
const SAD = ['难过', '对不起', '哭', '伤心', '遗憾']
const THINKING = ['嗯', '思考', '想想', '也许', '可能']
const CALM = ['没事', '平静', '放心', '别担心']

export function detectEmotion(text: string): Emotion {
  if (EXCITED.some((keyword) => text.includes(keyword))) return 'excited'
  if (HAPPY.some((keyword) => text.includes(keyword))) return 'happy'
  if (SAD.some((keyword) => text.includes(keyword))) return 'sad'
  if (THINKING.some((keyword) => text.includes(keyword))) return 'thinking'
  if (CALM.some((keyword) => text.includes(keyword))) return 'calm'
  return 'neutral'
}
