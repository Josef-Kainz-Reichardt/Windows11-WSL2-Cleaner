import type { CheckCategory } from '@shared/types'

export const CATEGORY_LABELS: Record<CheckCategory, string> = {
  'wsl-build-artifacts': 'WSL Build-Artefakte',
  'wsl-package-caches': 'WSL Paket-/IDE-Caches',
  'wsl-system-sudo': 'WSL System (sudo)',
  docker: 'Docker',
  'windows-cache': 'Windows Caches',
  'windows-system': 'Windows System',
  'vhdx-compaction': 'VHDX-Kompaktierung'
}

export const CATEGORY_ORDER: CheckCategory[] = [
  'wsl-build-artifacts',
  'wsl-package-caches',
  'docker',
  'wsl-system-sudo',
  'windows-cache',
  'windows-system',
  'vhdx-compaction'
]
