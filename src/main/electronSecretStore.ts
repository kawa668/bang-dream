import { safeStorage } from 'electron'
import type { SecretStore } from './config'

export class ElectronSecretStore implements SecretStore {
  isAvailable(): boolean {
    return safeStorage.isEncryptionAvailable()
  }

  encrypt(plain: string): string {
    return safeStorage.encryptString(plain).toString('base64')
  }

  decrypt(encrypted: string): string {
    return safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
  }
}
