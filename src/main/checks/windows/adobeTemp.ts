import { makeSimpleFolderCheck } from './simpleFolderCheck'

export const winAdobeTempCheck = makeSimpleFolderCheck(
  {
    id: 'win-adobe-temp',
    name: 'Adobe Temp (C:\\adobeTemp)',
    category: 'windows-cache',
    platform: 'windows',
    requiresSudo: false,
    description: 'Temporäre Render-/Cache-Dateien von Adobe-Anwendungen, nur falls der Ordner existiert.'
  },
  (profile) => profile.adobeTempPath
)
