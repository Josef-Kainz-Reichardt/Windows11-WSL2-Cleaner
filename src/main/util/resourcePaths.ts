import { app } from 'electron'
import path from 'node:path'

/**
 * Bundled resources live at <repo>/resources/** in dev and are copied next to
 * process.resourcesPath (via electron-builder's extraResources) once packaged.
 * out/main/index.js sits two directories below the repo root in dev builds.
 */
function devResourcesRoot(): string {
  return path.join(__dirname, '../../resources')
}

export function getWslScriptsDir(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'wsl-scripts')
    : path.join(devResourcesRoot(), 'wsl-scripts')
}

export function getPsDir(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'ps')
    : path.join(devResourcesRoot(), 'ps')
}
