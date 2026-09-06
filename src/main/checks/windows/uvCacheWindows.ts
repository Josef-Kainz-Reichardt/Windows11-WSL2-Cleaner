import { makeSimpleFolderCheck } from './simpleFolderCheck'

export const winUvCacheCheck = makeSimpleFolderCheck(
  {
    id: 'win-uv-cache',
    name: 'uv Cache (Windows)',
    category: 'windows-cache',
    platform: 'windows',
    requiresSudo: false,
    description: 'Cache des nativen Windows-uv (Python-Paketmanager), getrennt vom WSL-uv-Cache.'
  },
  (profile) => profile.uvCacheWindowsPath
)
