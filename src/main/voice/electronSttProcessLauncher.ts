import { spawn } from 'node:child_process'
import { join } from 'node:path'
import type { GptSoVITSProcess, SttProcessLauncher } from './interfaces'

export class ElectronSttProcessLauncher implements SttProcessLauncher {
  launch(options: {
    gptSovitsDir: string
    port: number
    model: string
    precision: string
    scriptPath: string
  }): GptSoVITSProcess {
    const pythonPath = join(options.gptSovitsDir, 'runtime', 'python.exe')
    let exited = false
    let stderr = ''
    const child = spawn(pythonPath, [
      options.scriptPath,
      '--gpt-sovits-dir', options.gptSovitsDir,
      '-a', '127.0.0.1',
      '--port', String(options.port),
      '-s', options.model,
      '--precision', options.precision
    ], {
      cwd: options.gptSovitsDir,
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe']
    })
    child.once('exit', () => {
      exited = true
    })
    child.once('error', (error) => {
      exited = true
      stderr = error.message
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr = `${stderr}${chunk.toString()}`.slice(-4000)
    })
    return {
      kill: () => {
        if (!child.killed) child.kill()
      },
      hasExited: () => exited,
      errorOutput: () => stderr.trim()
    }
  }
}
