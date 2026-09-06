# cleanup.ps1 — Windows + WSL cleanup wrapper
# Requires: run as Administrator
# Usage:
#   .\cleanup.ps1                    # full cleanup
#   .\cleanup.ps1 -DryRun            # show what would happen
#   .\cleanup.ps1 -SkipCompact       # skip VHDX compaction (faster)
#   .\cleanup.ps1 -SkipWindows       # skip Windows-side cleanup
#   .\cleanup.ps1 -SkipLinux         # skip Ubuntu cleanup
#   .\cleanup.ps1 -SkipThunderbird   # skip Thunderbird cache cleanup

param(
    [switch]$DryRun,
    [switch]$SkipCompact,
    [switch]$SkipWindows,
    [switch]$SkipLinux,
    [switch]$SkipThunderbird
)

$ErrorActionPreference = 'Continue'

# --- Config ------------------------------------------------------------------
$UbuntuDistro       = 'Ubuntu'
$UbuntuUser         = 'cpts'
$RancherVhdx        = "$env:LOCALAPPDATA\rancher-desktop\distro-data\ext4.vhdx"
$RancherDistroVhdx  = "$env:LOCALAPPDATA\rancher-desktop\distro\ext4.vhdx"
$UbuntuVhdx         = "$env:LOCALAPPDATA\Packages\CanonicalGroupLimited.Ubuntu_79rhkp1fndgsc\LocalState\ext4.vhdx"
$RdCtl              = "C:\Program Files\Rancher Desktop\resources\resources\win32\bin\rdctl.exe"
$IntelliJCache      = "$env:LOCALAPPDATA\JetBrains"
$AdobeTempPath      = "C:\adobeTemp"
$UvCache            = "$env:LOCALAPPDATA\uv\cache"
$ScriptPath         = $PSScriptRoot

# --- Helpers -----------------------------------------------------------------
function Write-Section($text) {
    Write-Host ""
    Write-Host "── $text ──" -ForegroundColor Cyan
}

function Write-Ok($text)   { Write-Host "  ✓ $text" -ForegroundColor Green }
function Write-Warn($text) { Write-Host "  ! $text" -ForegroundColor Yellow }
function Write-Err($text)  { Write-Host "  ✗ $text" -ForegroundColor Red }
function Write-Info($text) { Write-Host "  $text" -ForegroundColor DarkGray }

function Get-FreeSpaceGB {
    $vol = Get-Volume -DriveLetter C -ErrorAction SilentlyContinue
    if ($vol) { [math]::Round($vol.SizeRemaining / 1GB, 2) } else { 0 }
}

function Get-FolderSizeGB($path) {
    if (-not (Test-Path $path)) { return 0 }
    try {
        $sum = (Get-ChildItem $path -Recurse -Force -ErrorAction SilentlyContinue |
                Measure-Object -Property Length -Sum).Sum
        [math]::Round(($sum / 1GB), 2)
    } catch { 0 }
}

function Remove-FolderContent($path, $label) {
    if (-not (Test-Path $path)) {
        Write-Warn "$label : path not found ($path)"
        return
    }
    $size = Get-FolderSizeGB $path
    Write-Info "$label : $size GB"
    if ($DryRun) {
        Write-Info "DRY RUN: would clear $path"
        return
    }
    try {
        Get-ChildItem $path -Force -ErrorAction SilentlyContinue |
            Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
        Write-Ok "$label cleared"
    } catch {
        Write-Err "$label : $_"
    }
}

# Starts Rancher Desktop via rdctl and waits until Docker daemon is ready.
function Start-RancherDesktop($TimeoutSec = 180) {
    if (-not (Test-Path $RdCtl)) {
        Write-Warn "rdctl not found — cannot start Rancher Desktop automatically"
        return $false
    }

    $status = & $RdCtl status 2>&1 | Out-String
    if ($status -match '"state"\s*:\s*"started"') {
        Write-Info "Rancher Desktop already running"
        return $true
    }

    Write-Info "Starting Rancher Desktop via rdctl..."
    if ($DryRun) {
        Write-Info "DRY RUN: would run rdctl start"
        return $true
    }

    # rdctl start blocks until done — launch detached, poll separately
    Start-Process -FilePath $RdCtl -ArgumentList 'start' -WindowStyle Hidden -ErrorAction SilentlyContinue

    $elapsed = 0
    while ($elapsed -lt $TimeoutSec) {
        Start-Sleep -Seconds 5
        $elapsed += 5
        # Check Docker daemon ready (not just Rancher state — daemon can lag behind)
        wsl -d $UbuntuDistro -u $UbuntuUser -- docker info 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Ok "Rancher Desktop ready, Docker available (${elapsed}s)"
            return $true
        }
        Write-Info "  waiting for Docker daemon... ${elapsed}s"
    }
    Write-Warn "Rancher Desktop did not become ready within ${TimeoutSec}s"
    return $false
}

# Stops Rancher Desktop via rdctl and waits until Docker daemon is gone (mirror of Start-RancherDesktop).
function Stop-RancherDesktop($TimeoutSec = 180) {
    if (-not (Test-Path $RdCtl)) {
        Write-Warn "rdctl not found — cannot stop Rancher Desktop automatically"
        return
    }

    # Check if already stopped (Docker not reachable = backend down)
    wsl -d $UbuntuDistro -u $UbuntuUser -- docker info 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Info "Rancher Desktop already stopped (Docker not reachable)"
        return
    }

    # rdctl stop doesn't work from Administrator context (different user session / API credentials).
    # CloseMainWindow() sends WM_CLOSE to the Rancher Desktop GUI — triggers graceful shutdown
    # from within the correct user session.
    Write-Info "Requesting Rancher Desktop shutdown via CloseMainWindow..."
    if (-not $DryRun) {
        $closed = $false
        Get-Process -Name 'Rancher Desktop' -ErrorAction SilentlyContinue | ForEach-Object {
            $_.CloseMainWindow() | Out-Null
            $closed = $true
        }
        if (-not $closed) {
            Write-Warn "No 'Rancher Desktop' process found — may already be stopped"
        }
    }

    # Poll until Docker daemon is unreachable = Rancher backend fully down = VHDXs released
    $elapsed = 0
    while ($elapsed -lt 180) {
        Start-Sleep -Seconds 5
        $elapsed += 5
        wsl -d $UbuntuDistro -u $UbuntuUser -- docker info 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) {
            Write-Ok "Rancher Desktop stopped, Docker daemon gone (${elapsed}s)"
            return
        }
        Write-Info "  waiting for Rancher to shut down... ${elapsed}s"
    }
    Write-Warn "Rancher Desktop did not stop within 180s — VHDX compact may fail"
}

# --- Admin check -------------------------------------------------------------
$isAdmin = ([Security.Principal.WindowsPrincipal] `
           [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
           [Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Err "This script must be run as Administrator (diskpart & DISM require it)."
    exit 1
}

# --- Banner ------------------------------------------------------------------
Write-Host ""
Write-Host "Cleanup Script — Windows + WSL/Ubuntu" -ForegroundColor White -BackgroundColor DarkBlue
if ($DryRun)           { Write-Host "[DRY RUN MODE]" -ForegroundColor Yellow }
if ($SkipCompact)      { Write-Host "[Skipping VHDX compact]" -ForegroundColor Yellow }
if ($SkipWindows)      { Write-Host "[Skipping Windows cleanup]" -ForegroundColor Yellow }
if ($SkipLinux)        { Write-Host "[Skipping Linux cleanup]" -ForegroundColor Yellow }
if ($SkipThunderbird)  { Write-Host "[Skipping Thunderbird cleanup]" -ForegroundColor Yellow }

$startFreeGB = Get-FreeSpaceGB
Write-Info "Free on C: before: $startFreeGB GB"

# =============================================================================
# PHASE 1: Linux cleanup (inside WSL, before we shut it down)
# =============================================================================
if (-not $SkipLinux) {
    Write-Section "Phase 1 — Linux cleanup (inside WSL)"

    # Ensure Rancher Desktop is running so Docker prune works
    if (-not $SkipCompact) {
        Write-Info "Checking Rancher Desktop status for Docker cleanup..."
        $rancherWasStarted = Start-RancherDesktop -TimeoutSec 180
    }

    $linuxScript = Join-Path $ScriptPath 'cleanup.sh'
    if (-not (Test-Path $linuxScript)) {
        Write-Err "cleanup.sh not found at $linuxScript"
        Write-Warn "Skipping Linux phase. Make sure cleanup.sh is in the same directory."
    } else {
        $wslPath = $linuxScript `
            -replace '^([A-Za-z]):', { "/mnt/$($_.Groups[1].Value.ToLower())" } `
            -replace '\\', '/'

        $bashArgs = ''
        if ($DryRun) { $bashArgs = '--dry-run' }

        Write-Info "Running: wsl -d $UbuntuDistro -u $UbuntuUser -- bash $wslPath $bashArgs"
        Write-Info "(sudo steps will prompt for your WSL password)"
        Write-Host ""

        wsl -d $UbuntuDistro -u $UbuntuUser -- bash "$wslPath" $bashArgs
        if ($LASTEXITCODE -eq 0) {
            Write-Ok "Linux cleanup finished"
        } else {
            Write-Warn "Linux cleanup exited with code $LASTEXITCODE (continuing)"
        }
    }
} else {
    Write-Section "Phase 1 — Linux cleanup [SKIPPED]"
}

# =============================================================================
# PHASE 2: Windows-side cleanup
# =============================================================================
if (-not $SkipWindows) {
    Write-Section "Phase 2 — Windows cleanup"

    # 2a. adobeTemp
    Remove-FolderContent $AdobeTempPath 'C:\adobeTemp'

    # 2b. User + system Temp
    Remove-FolderContent $env:TEMP 'User Temp'
    Remove-FolderContent 'C:\Windows\Temp' 'Windows Temp'

    # 2c. uv cache (Windows-native uv, separate from WSL)
    if (Test-Path $UvCache) {
        $sz = Get-FolderSizeGB $UvCache
        Write-Info "uv cache (Windows): $sz GB"
        if (-not $DryRun) {
            Remove-Item $UvCache -Recurse -Force -ErrorAction SilentlyContinue
            Write-Ok "uv cache cleared"
        } else {
            Write-Info "DRY RUN: would clear $UvCache"
        }
    }

    # 2d. Thunderbird cache (cache2, *.msf index files, global search db)
    if (-not $SkipThunderbird) {
        $tbProfiles = "$env:APPDATA\Thunderbird\Profiles"
        if (Test-Path $tbProfiles) {
            Write-Info "Thunderbird profiles found — cleaning cache/index files"
            Get-ChildItem $tbProfiles -Directory -ErrorAction SilentlyContinue | ForEach-Object {
                $profile = $_.FullName
                $targets = @(
                    (Join-Path $profile 'cache2'),
                    (Join-Path $profile 'startupCache')
                )
                foreach ($t in $targets) {
                    if (Test-Path $t) {
                        $sz = Get-FolderSizeGB $t
                        Write-Info "  $(Split-Path $t -Leaf) in $($_.Name): $sz GB"
                        if (-not $DryRun) {
                            Remove-Item $t -Recurse -Force -ErrorAction SilentlyContinue
                            Write-Ok "  $(Split-Path $t -Leaf) cleared"
                        } else {
                            Write-Info "  DRY RUN: would clear $t"
                        }
                    }
                }
                # *.msf = message summary/index files — safe to delete, Thunderbird rebuilds them
                if (-not $DryRun) {
                    Get-ChildItem $profile -Recurse -Filter '*.msf' -Force -ErrorAction SilentlyContinue |
                        Remove-Item -Force -ErrorAction SilentlyContinue
                    Write-Ok "  *.msf index files cleared in $($_.Name)"
                } else {
                    $msfCount = (Get-ChildItem $profile -Recurse -Filter '*.msf' -Force -ErrorAction SilentlyContinue).Count
                    Write-Info "  DRY RUN: would remove $msfCount *.msf files"
                }
            }
        } else {
            Write-Warn "Thunderbird profiles not found — skipping"
        }
    } else {
        Write-Info "Thunderbird cleanup skipped (-SkipThunderbird)"
    }

    # 2e. IntelliJ caches
    if (Test-Path $IntelliJCache) {
        $sz = Get-FolderSizeGB $IntelliJCache
        Write-Info "JetBrains caches: $sz GB"
        if (-not $DryRun) {
            Get-ChildItem $IntelliJCache -Directory -ErrorAction SilentlyContinue | ForEach-Object {
                foreach ($sub in @('caches', 'index', 'log', 'tmp')) {
                    $target = Join-Path $_.FullName $sub
                    if (Test-Path $target) {
                        Remove-Item $target -Recurse -Force -ErrorAction SilentlyContinue
                    }
                }
            }
            Write-Ok "JetBrains caches cleared (will re-index on next start)"
        } else {
            Write-Info "DRY RUN: would clear caches/index/log/tmp in JetBrains IDE folders"
        }
    }

    # 2f. Recycle Bin
    Write-Info "Emptying Recycle Bin..."
    if (-not $DryRun) {
        try {
            Clear-RecycleBin -Force -ErrorAction SilentlyContinue
            Write-Ok "Recycle Bin emptied"
        } catch {
            Write-Warn "Recycle Bin: $_"
        }
    } else {
        Write-Info "DRY RUN: would empty Recycle Bin"
    }

    # 2g. DISM Component Cleanup (Windows Update residue)
    Write-Info "Running DISM component cleanup (can take several minutes)..."
    if (-not $DryRun) {
        $dismOutput = & dism.exe /Online /Cleanup-Image /StartComponentCleanup /ResetBase 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Ok "DISM component cleanup done"
        } else {
            Write-Warn "DISM exited with $LASTEXITCODE"
            $dismOutput | Select-Object -Last 5 | ForEach-Object { Write-Info $_ }
        }
    } else {
        Write-Info "DRY RUN: would run DISM /StartComponentCleanup /ResetBase"
    }
} else {
    Write-Section "Phase 2 — Windows cleanup [SKIPPED]"
}

# =============================================================================
# PHASE 3: Stop Rancher Desktop & shut down WSL
# =============================================================================
if (-not $SkipCompact) {
    Write-Section "Phase 3 — Stop Rancher Desktop & WSL"
    Write-Info "(fstrim ran in Phase 1 — now shutting down WSL so diskpart can compact VHDXs)"

    Stop-RancherDesktop -TimeoutSec 180

    Write-Info "Running wsl --shutdown..."
    if (-not $DryRun) {
        wsl --shutdown
        # Wait for vmmemWSL to exit — it holds VHDXs open
        $elapsed = 0
        while ($elapsed -lt 60) {
            $vmem = Get-Process -Name 'vmmemWSL' -ErrorAction SilentlyContinue
            if (-not $vmem) { break }
            Start-Sleep -Seconds 2
            $elapsed += 2
            Write-Info "  waiting for vmmemWSL to exit... ${elapsed}s"
        }
        if (Get-Process -Name 'vmmemWSL' -ErrorAction SilentlyContinue) {
            Write-Warn "vmmemWSL still running — VHDX compact may fail"
        } else {
            Write-Ok "WSL fully shut down (vmmemWSL gone)"
        }
    } else {
        Write-Ok "WSL shut down (dry run)"
    }

    # =========================================================================
    # PHASE 4: Compact VHDX files
    # =========================================================================
    Write-Section "Phase 4 — Compact VHDX files"

    function Invoke-DiskpartCompact($vhdxPath, $label) {
        if (-not (Test-Path $vhdxPath)) {
            Write-Warn "$label : not found at $vhdxPath"
            return
        }
        $before = (Get-Item $vhdxPath).Length / 1GB
        Write-Info "$label : $([math]::Round($before, 2)) GB before compact"

        if ($DryRun) {
            Write-Info "DRY RUN: would compact $vhdxPath"
            return
        }

        $script = @"
select vdisk file="$vhdxPath"
attach vdisk readonly
compact vdisk
detach vdisk
exit
"@
        $tmp = [IO.Path]::GetTempFileName()
        Set-Content -Path $tmp -Value $script -Encoding ASCII
        try {
            $output = & diskpart.exe /s $tmp 2>&1
            $after = (Get-Item $vhdxPath).Length / 1GB
            $saved = $before - $after
            if ($saved -gt 0.01) {
                Write-Ok "$label : $([math]::Round($after, 2)) GB after (saved $([math]::Round($saved, 2)) GB)"
            } elseif ($LASTEXITCODE -ne 0) {
                Write-Err "$label : diskpart returned $LASTEXITCODE"
                $output | Select-Object -Last 8 | ForEach-Object { Write-Info $_ }
            } else {
                Write-Info "$label : no size change (was already compact, or fstrim didn't run)"
            }
        } finally {
            Remove-Item $tmp -ErrorAction SilentlyContinue
        }
    }

    Invoke-DiskpartCompact $RancherVhdx       'Rancher distro-data VHDX'
    Invoke-DiskpartCompact $RancherDistroVhdx 'Rancher distro VHDX'
    Invoke-DiskpartCompact $UbuntuVhdx        'Ubuntu VHDX'
} else {
    Write-Section "Phase 3+4 — WSL shutdown & VHDX compact [SKIPPED]"
}

# =============================================================================
# Summary
# =============================================================================
$endFreeGB = Get-FreeSpaceGB
$freedGB   = [math]::Round($endFreeGB - $startFreeGB, 2)

Write-Host ""
Write-Host "── Summary ──" -ForegroundColor Cyan
Write-Info "Free on C: before: $startFreeGB GB"
Write-Info "Free on C: after:  $endFreeGB GB"
if ($freedGB -gt 0) {
    Write-Host "  Freed: $freedGB GB" -ForegroundColor Green
} elseif ($freedGB -lt 0) {
    Write-Host "  Delta: $freedGB GB (C: filled up during run)" -ForegroundColor Yellow
} else {
    Write-Info "No change detected"
}
Write-Host ""
Write-Host "Done. Rancher Desktop was NOT restarted — start it manually if needed." -ForegroundColor White
