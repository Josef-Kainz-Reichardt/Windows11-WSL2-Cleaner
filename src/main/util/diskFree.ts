import fs from 'node:fs'

export function freeBytes(drivePath = 'C:\\'): number {
  const stats = fs.statfsSync(drivePath)
  return stats.bavail * stats.bsize
}

export function totalBytes(drivePath = 'C:\\'): number {
  const stats = fs.statfsSync(drivePath)
  return stats.blocks * stats.bsize
}
