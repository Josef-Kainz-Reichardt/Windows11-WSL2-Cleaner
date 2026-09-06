import { app, safeStorage } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { registerSecret, clearSecrets } from '@main/util/redact'

/**
 * The WSL sudo password is the one genuinely sensitive piece of state this
 * app holds. It is encrypted at rest via Electron's safeStorage (backed by
 * Windows DPAPI, tied to the current Windows user account) and kept
 * completely separate from the electron-store config file used for
 * everything else (machine profile, scan results).
 */

function secretFilePath(): string {
  return path.join(app.getPath('userData'), 'sudo-secret.bin')
}

let decryptedCache: string | null = null

export function hasSudoPassword(): boolean {
  return fs.existsSync(secretFilePath())
}

export function setSudoPassword(password: string): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('OS-level secret encryption is not available on this machine.')
  }
  const encrypted = safeStorage.encryptString(password)
  fs.mkdirSync(path.dirname(secretFilePath()), { recursive: true })
  fs.writeFileSync(secretFilePath(), encrypted)
  decryptedCache = password
  registerSecret(password)
}

/** Returns the decrypted password, or null if none has been stored yet. */
export function getSudoPasswordPlain(): string | null {
  if (decryptedCache !== null) return decryptedCache
  const file = secretFilePath()
  if (!fs.existsSync(file)) return null
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('OS-level secret encryption is not available on this machine.')
  }
  const encrypted = fs.readFileSync(file)
  const password = safeStorage.decryptString(encrypted)
  decryptedCache = password
  registerSecret(password)
  return password
}

export function clearSudoPassword(): void {
  const file = secretFilePath()
  if (fs.existsSync(file)) fs.rmSync(file)
  decryptedCache = null
  clearSecrets()
}
