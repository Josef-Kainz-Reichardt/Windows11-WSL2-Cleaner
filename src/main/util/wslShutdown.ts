import { execFile } from 'node:child_process'

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function processRunning(imageName: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile('tasklist.exe', ['/FI', `IMAGENAME eq ${imageName}`, '/NH'], { windowsHide: true }, (_error, stdout) => {
      resolve(stdout.toString().toLowerCase().includes(imageName.toLowerCase()))
    })
  })
}

/** Runs `wsl --shutdown` and waits for vmmemWSL to actually release the VHDX files. */
export async function shutdownWsl(timeoutMs = 60_000): Promise<boolean> {
  await new Promise<void>((resolve) => {
    execFile('wsl.exe', ['--shutdown'], { windowsHide: true }, () => resolve())
  })

  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (!(await processRunning('vmmemWSL.exe'))) return true
    await sleep(2_000)
  }
  return !(await processRunning('vmmemWSL.exe'))
}
