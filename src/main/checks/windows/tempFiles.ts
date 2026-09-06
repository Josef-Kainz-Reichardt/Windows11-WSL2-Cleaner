import { makeSimpleFolderCheck } from './simpleFolderCheck'

export const winUserTempCheck = makeSimpleFolderCheck(
  {
    id: 'win-user-temp',
    name: 'Windows Benutzer-Temp (%TEMP%)',
    category: 'windows-cache',
    platform: 'windows',
    requiresSudo: false,
    description: 'Temporäre Dateien im Benutzerprofil (%TEMP%).'
  },
  () => process.env.TEMP || process.env.TMP,
  () => true
)

export const winSystemTempCheck = makeSimpleFolderCheck(
  {
    id: 'win-system-temp',
    name: 'Windows System-Temp (C:\\Windows\\Temp)',
    category: 'windows-cache',
    platform: 'windows',
    requiresSudo: false,
    description: 'Temporäre Dateien des Betriebssystems.'
  },
  () => 'C:\\Windows\\Temp',
  () => true
)
