# close-main-window.ps1 — single-purpose helper.
#
# Node has no equivalent of .NET's Process.CloseMainWindow(), which is needed
# to gracefully shut down Rancher Desktop from an elevated (Administrator)
# process: rdctl stop doesn't work from Administrator context because it
# talks to a different user-session API. Sending WM_CLOSE to the GUI's main
# window triggers a graceful shutdown from within the correct user session.
#
# Rancher Desktop (like many tray apps) only *hides* its window on WM_CLOSE
# instead of quitting — the process (and tray icon) stays alive, the docker
# backend keeps running, and a later `wsl --shutdown` / diskpart compact can
# fail because the process still holds the distro/VHDX open. So: request a
# graceful close, give it GraceSeconds to actually exit on its own, then
# force-kill anything still standing.
#
# Usage: powershell -NoProfile -NonInteractive -File close-main-window.ps1 -ProcessName "Rancher Desktop" [-GraceSeconds 20]

param(
    [Parameter(Mandatory = $true)]
    [string]$ProcessName,
    [int]$GraceSeconds = 20
)

$procs = Get-Process -Name $ProcessName -ErrorAction SilentlyContinue
if (-not $procs) {
    Write-Output "NOT_FOUND"
    exit 0
}

foreach ($p in $procs) {
    $null = $p.CloseMainWindow()
}

$deadline = (Get-Date).AddSeconds($GraceSeconds)
while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 1
    if (-not (Get-Process -Name $ProcessName -ErrorAction SilentlyContinue)) {
        Write-Output "CLOSED_GRACEFULLY"
        exit 0
    }
}

Stop-Process -Name $ProcessName -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
if (Get-Process -Name $ProcessName -ErrorAction SilentlyContinue) {
    Write-Output "FORCE_KILL_FAILED"
} else {
    Write-Output "FORCE_KILLED"
}
