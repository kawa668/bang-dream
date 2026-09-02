import { spawn } from 'node:child_process'
import { join } from 'node:path'
import type { GptSoVITSProcess, VoiceProcessLauncher } from './interfaces'

export class ElectronVoiceProcessLauncher implements VoiceProcessLauncher {
  launch(options: { gptSovitsDir: string; port: number }): GptSoVITSProcess {
    const pythonPath = join(options.gptSovitsDir, 'runtime', 'python.exe')
    const scriptPath = join(options.gptSovitsDir, 'api_v2.py')
    const child = spawn(pythonPath, [
      scriptPath,
      '-a', '127.0.0.1',
      '-p', String(options.port),
      '-c', 'GPT_SoVITS/configs/tts_infer.yaml'
    ], {
      cwd: options.gptSovitsDir,
      windowsHide: true,
      stdio: 'ignore'
    })
    return {
      kill: () => {
        if (!child.killed) child.kill()
      }
    }
  }
}
