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
  requestExit(): Promise<void>
}

export interface GptSoVITSProcess {
  kill(): void
  hasExited?(): boolean
  errorOutput?(): string
}

export interface VoiceProcessLauncher {
  launch(options: { gptSovitsDir: string; port: number }): GptSoVITSProcess
}

export interface SpeechToTextProvider {
  probeReady(): Promise<boolean>
  transcribe(audio: Uint8Array, language?: string): Promise<string>
  requestExit(): Promise<void>
}

export interface SttProcessLauncher {
  launch(options: {
    gptSovitsDir: string
    port: number
    model: string
    precision: string
    scriptPath: string
  }): GptSoVITSProcess
}
