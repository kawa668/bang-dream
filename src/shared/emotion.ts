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

const EXPRESSION_KEYWORDS: Record<Exclude<Emotion, 'neutral'>, string[]> = {
  happy: ['smile', 'happy'],
  sad: ['sad', 'cry'],
  excited: ['surprised', 'kandou', 'wink'],
  thinking: ['thinking'],
  calm: ['default', 'idle']
}

export const EMOTION_LABELS: Record<Emotion, string> = {
  neutral: '平静',
  calm: '安静',
  happy: '开心',
  sad: '难过',
  excited: '兴奋',
  thinking: '思考'
}

export function emotionLabel(emotion: Emotion): string {
  return EMOTION_LABELS[emotion]
}

export function pickExpressionAction(
  actions: string[],
  emotion: Emotion
): string | null {
  if (emotion === 'neutral') return null
  const keywords = EXPRESSION_KEYWORDS[emotion]
  const lower = actions.map((action) => action.toLowerCase())
  for (const keyword of keywords) {
    const index = lower.findIndex((action) => action.includes(keyword))
    if (index >= 0) return actions[index]
  }
  return null
}
