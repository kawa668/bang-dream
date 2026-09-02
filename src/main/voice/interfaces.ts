import type { VoiceId } from '../../shared/voice'

export interface VoiceProfile {
  voiceId: VoiceId
  gptWeightsPath: string
  sovitsWeightsPath: string
  referenceAudioPath: string
  promptText: string
  promptLang: 'ja'
}

export interface TextToSpeechProvider {
  probeReady(): Promise<boolean>
  loadVoice(profile: VoiceProfile): Promise<void>
  synthesize(profile: VoiceProfile, text: string): Promise<Uint8Array>
}

export interface GptSoVITSProcess {
  kill(): void
}

export interface VoiceProcessLauncher {
  launch(options: { gptSovitsDir: string; port: number }): GptSoVITSProcess
}
