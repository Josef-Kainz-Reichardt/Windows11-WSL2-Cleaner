#Requires -RunAsAdministrator

param(
    [switch]$DryRun,
    [switch]$SkipDocker
)

$ErrorActionPreference = "Continue"

function Write-Section($title) {
    Write-Output ""
    Write-Output "=========================================="
    Write-Output "  $title"
    Write-Output "=========================================="
}

function Format-Size($bytes) {
    if ($bytes -ge 1GB) { return "{0:N2} GB" -f ($bytes / 1GB) }
    if ($bytes -ge 1MB) { return "{0:N1} MB" -f ($bytes / 1MB) }
    return "{0:N0} KB" -f ($bytes / 1KB)
}

# ──────────────────────────────────────────────
# Show current disk usage
# ──────────────────────────────────────────────
Write-Section "Disk Usage Before Cleanup"
$vol = Get-Volume -DriveLetter C
$freeGB = [math]::Round($vol.SizeRemaining / 1GB, 1)
$totalGB = [math]::Round($vol.Size / 1GB, 1)
Write-Output "  C: $freeGB GB free / $totalGB GB total"

if ($DryRun) {
    Write-Output ""
    Write-Output "  *** DRY RUN MODE - no changes will be made ***"
}

# ──────────────────────────────────────────────
# Start Rancher Desktop if Docker cleanup needed
# ──────────────────────────────────────────────
if (-not $SkipDocker) {
    Write-Section "Starting Rancher Desktop"
    kubectl get nodes 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Output "  Kubernetes is not running, starting Rancher Desktop ..."
        rdctl start
    }
    while (!(kubectl get nodes --no-headers 2>$null | Select-String "Ready")) {
        Write-Output "  Waiting for Kubernetes to be ready ..."
        Start-Sleep -Seconds 2
    }
    Write-Output "  Kubernetes is running."
    Start-Sleep -Seconds 2
}

# ──────────────────────────────────────────────
# WSL Cleanup: Build Artifacts
# ──────────────────────────────────────────────
Write-Section "WSL Cleanup: Build Artifacts"
if ($DryRun) {
    wsl bash -lc '$HOME/bin/clean-target-dirs.sh $HOME/work --dry-run'
} else {
    wsl bash -lc '$HOME/bin/clean-target-dirs.sh $HOME/work --rm'
}

# ──────────────────────────────────────────────
# WSL Cleanup: Package Manager & IDE Caches
# ──────────────────────────────────────────────
Write-Section "WSL Cleanup: Package Manager Caches"
if ($DryRun) {
    wsl bash -lc '$HOME/bin/clean-caches.sh --dry-run'
} else {
    wsl bash -lc '$HOME/bin/clean-caches.sh'
}

# ──────────────────────────────────────────────
# Docker Cleanup
# ──────────────────────────────────────────────
if (-not $SkipDocker) {
    Write-Section "Docker Cleanup"
    if ($DryRun) {
        Write-Output "  [DRY RUN] Would run: docker system prune --all --force --volumes"
        wsl bash -lc 'docker system df'
    } else {
        Write-Output "  Pruning Docker system (images, containers, volumes, build cache) ..."
        wsl bash -lc 'docker system prune --all --force --volumes'
        wsl bash -lc 'docker builder prune --all --force 2>/dev/null || true'
    }
}

# ──────────────────────────────────────────────
# fstrim inside WSL
# ──────────────────────────────────────────────
Write-Section "WSL fstrim"
if ($DryRun) {
    Write-Output "  [DRY RUN] Would run: fstrim -v /"
} else {
    wsl bash -c 'sudo fstrim -v /'
}

# ──────────────────────────────────────────────
# Shutdown WSL & Rancher
# ──────────────────────────────────────────────
Write-Section "Shutting Down WSL"
if (-not $DryRun) {
    if (-not $SkipDocker) {
        rdctl shutdown
    }
    wsl --shutdown
    Start-Sleep -Seconds 3
} else {
    Write-Output "  [DRY RUN] Would shutdown Rancher Desktop and WSL"
}

# ──────────────────────────────────────────────
# Optimize VHDXs (requires WSL to be stopped)
# ──────────────────────────────────────────────
Write-Section "Optimizing VHDX Files"

$vhdxPaths = @(
    "C:\Users\reichardt\AppData\Local\rancher-desktop\distro-data\ext4.vhdx",
    "C:\Users\reichardt\AppData\Local\Packages\CanonicalGroupLimited.UbuntuonWindows_79rhkp1fndgsc\LocalState\ext4.vhdx"
)

foreach ($vhdx in $vhdxPaths) {
    if (Test-Path $vhdx) {
        $sizeBefore = (Get-Item $vhdx).Length
        $label = Split-Path (Split-Path $vhdx) -Leaf
        if ($DryRun) {
            Write-Output "  [DRY RUN] Would optimize: $label ($(Format-Size $sizeBefore))"
        } else {
            Write-Output "  Optimizing $label ..."
            Write-Output "    Before: $(Format-Size $sizeBefore)"
            Optimize-VHD -Path $vhdx -Mode Full
            $sizeAfter = (Get-Item $vhdx).Length
            $saved = $sizeBefore - $sizeAfter
            Write-Output "    After:  $(Format-Size $sizeAfter) (saved $(Format-Size $saved))"
        }
    } else {
        Write-Output "  VHDX not found: $vhdx"
    }
}

# ──────────────────────────────────────────────
# Final Report
# ──────────────────────────────────────────────
Write-Section "Done!"
$volAfter = Get-Volume -DriveLetter C
$freeAfterGB = [math]::Round($volAfter.SizeRemaining / 1GB, 1)
$freedGB = [math]::Round($freeAfterGB - $freeGB, 1)

Write-Output "  C: $freeAfterGB GB free (was $freeGB GB, freed ~$freedGB GB)"
Write-Output ""
