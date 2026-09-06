#!/bin/bash
set -euo pipefail

# ──────────────────────────────────────────────────────────
# clean-caches.sh — Clean package manager and IDE caches
#
# Usage: clean-caches.sh [--dry-run]
# ──────────────────────────────────────────────────────────

DRY_RUN=false
for arg in "$@"; do
    [ "$arg" = "--dry-run" ] && DRY_RUN=true
done

TOTAL_FREED=0

report() { echo "  $1"; }

dir_bytes() {
    local result
    result=$(du -sb "$1" 2>/dev/null | awk '{print $1}')
    echo "${result:-0}"
}

fmt() {
    numfmt --to=iec "$1" 2>/dev/null || echo "${1}B"
}

# ── Yarn cache clean ──
if command -v yarn &>/dev/null && [ -d "$HOME/.cache/yarn" ]; then
    BEFORE_BYTES=$(dir_bytes "$HOME/.cache/yarn")
    if [ "$DRY_RUN" = true ]; then
        report "[DRY RUN] Would run: yarn cache clean ($(fmt "$BEFORE_BYTES") currently)"
        TOTAL_FREED=$((TOTAL_FREED + BEFORE_BYTES))
    else
        report "Cleaning yarn cache ($(fmt "$BEFORE_BYTES")) ..."
        yarn cache clean 2>&1 | tail -1 | sed 's/^/    /'
        AFTER_BYTES=$(dir_bytes "$HOME/.cache/yarn")
        DELTA=$((BEFORE_BYTES - AFTER_BYTES))
        [ "$DELTA" -gt 0 ] && TOTAL_FREED=$((TOTAL_FREED + DELTA))
        report "  -> freed $(fmt "$DELTA")"
    fi
fi

# ── npm cache clean ──
if command -v npm &>/dev/null && [ -d "$HOME/.npm" ]; then
    BEFORE_BYTES=$(dir_bytes "$HOME/.npm")
    if [ "$DRY_RUN" = true ]; then
        report "[DRY RUN] Would run: npm cache clean --force ($(fmt "$BEFORE_BYTES") currently)"
        TOTAL_FREED=$((TOTAL_FREED + BEFORE_BYTES))
    else
        report "Cleaning npm cache ($(fmt "$BEFORE_BYTES")) ..."
        npm cache clean --force 2>&1 | tail -1 | sed 's/^/    /'
        AFTER_BYTES=$(dir_bytes "$HOME/.npm")
        DELTA=$((BEFORE_BYTES - AFTER_BYTES))
        [ "$DELTA" -gt 0 ] && TOTAL_FREED=$((TOTAL_FREED + DELTA))
        report "  -> freed $(fmt "$DELTA")"
    fi
fi

# ── pnpm store prune ──
if command -v pnpm &>/dev/null; then
    PNPM_STORE="$HOME/.local/share/pnpm"
    if [ -d "$PNPM_STORE" ]; then
        BEFORE_BYTES=$(dir_bytes "$PNPM_STORE")
        if [ "$DRY_RUN" = true ]; then
            report "[DRY RUN] Would run: pnpm store prune ($(fmt "$BEFORE_BYTES") currently)"
        else
            report "Pruning pnpm store ($(fmt "$BEFORE_BYTES")) ..."
            pnpm store prune 2>&1 | sed 's/^/    /'
            AFTER_BYTES=$(dir_bytes "$PNPM_STORE")
            DELTA=$((BEFORE_BYTES - AFTER_BYTES))
            [ "$DELTA" -gt 0 ] && TOTAL_FREED=$((TOTAL_FREED + DELTA))
            report "  -> freed $(fmt "$DELTA")"
        fi
    fi
fi

# ── Cypress: keep only the newest version ──
CYPRESS_DIR="$HOME/.cache/Cypress"
if [ -d "$CYPRESS_DIR" ] && [ "$(ls -1 "$CYPRESS_DIR" 2>/dev/null | wc -l)" -gt 0 ]; then
    NEWEST=$(ls -1 "$CYPRESS_DIR" | sort -V | tail -1)
    for ver in $(ls -1 "$CYPRESS_DIR" | sort -V); do
        if [ "$ver" != "$NEWEST" ]; then
            SIZE=$(dir_bytes "$CYPRESS_DIR/$ver")
            if [ "$DRY_RUN" = true ]; then
                report "[DRY RUN] Would delete Cypress $ver ($(fmt "$SIZE"))"
                TOTAL_FREED=$((TOTAL_FREED + SIZE))
            else
                report "Deleting old Cypress $ver ($(fmt "$SIZE")) ..."
                rm -rf "$CYPRESS_DIR/$ver"
                TOTAL_FREED=$((TOTAL_FREED + SIZE))
            fi
        else
            report "Keeping Cypress $ver (newest)"
        fi
    done
fi

# ── JetBrains cache: keep only current year ──
JB_CACHE="$HOME/.cache/JetBrains"
if [ -d "$JB_CACHE" ]; then
    CURRENT_YEAR=$(date +%Y)
    for dir in "$JB_CACHE"/*/; do
        [ -d "$dir" ] || continue
        dirname=$(basename "$dir")
        if echo "$dirname" | grep -qE "(${CURRENT_YEAR}|RemoteDev|acp-agents)"; then
            report "Keeping JetBrains cache: $dirname"
        else
            SIZE=$(dir_bytes "$dir")
            if [ "$DRY_RUN" = true ]; then
                report "[DRY RUN] Would delete JetBrains cache $dirname ($(fmt "$SIZE"))"
                TOTAL_FREED=$((TOTAL_FREED + SIZE))
            else
                report "Deleting old JetBrains cache $dirname ($(fmt "$SIZE")) ..."
                rm -rf "$dir"
                TOTAL_FREED=$((TOTAL_FREED + SIZE))
            fi
        fi
    done
fi

# ── Maven: delete old snapshots and metadata ──
M2_REPO="$HOME/.m2/repository"
if [ -d "$M2_REPO" ]; then
    M2_BEFORE=$(dir_bytes "$M2_REPO")
    if [ "$DRY_RUN" = true ]; then
        SNAP_SIZE=$(find "$M2_REPO" -type d -name "*SNAPSHOT*" -exec du -sb {} + 2>/dev/null | awk '{s+=$1} END {print s+0}')
        report "[DRY RUN] Would delete Maven SNAPSHOTs + metadata (~$(fmt "$SNAP_SIZE"))"
        TOTAL_FREED=$((TOTAL_FREED + SNAP_SIZE))
    else
        report "Cleaning Maven SNAPSHOT artifacts ..."
        find "$M2_REPO" -type d -name "*SNAPSHOT*" -exec rm -rf {} + 2>/dev/null || true
        report "Cleaning Maven metadata files ..."
        find "$M2_REPO" -name "*.lastUpdated" -delete 2>/dev/null || true
        find "$M2_REPO" -name "_remote.repositories" -delete 2>/dev/null || true
        M2_AFTER=$(dir_bytes "$M2_REPO")
        DELTA=$((M2_BEFORE - M2_AFTER))
        [ "$DELTA" -gt 0 ] && TOTAL_FREED=$((TOTAL_FREED + DELTA))
        report "  -> freed $(fmt "$DELTA")"
    fi
fi

# ── Rust: remove old toolchains (keep stable & nightly) ──
if command -v rustup &>/dev/null; then
    for tc in $(rustup toolchain list | grep -vE '(stable|nightly|default)' | awk '{print $1}'); do
        TC_DIR="$HOME/.rustup/toolchains/$tc"
        SIZE=$(dir_bytes "$TC_DIR")
        if [ "$DRY_RUN" = true ]; then
            report "[DRY RUN] Would uninstall Rust toolchain: $tc ($(fmt "$SIZE"))"
            TOTAL_FREED=$((TOTAL_FREED + SIZE))
        else
            report "Uninstalling old Rust toolchain: $tc ($(fmt "$SIZE")) ..."
            rustup toolchain uninstall "$tc"
            TOTAL_FREED=$((TOTAL_FREED + SIZE))
        fi
    done
fi

# ── APT cache ──
APT_BEFORE=$(dir_bytes /var/cache/apt)
if [ "$DRY_RUN" = true ]; then
    report "[DRY RUN] Would clean APT cache ($(fmt "$APT_BEFORE"))"
    TOTAL_FREED=$((TOTAL_FREED + APT_BEFORE))
else
    report "Cleaning APT cache ..."
    sudo apt-get clean 2>/dev/null || true
    sudo apt-get autoremove -y 2>/dev/null || true
    APT_AFTER=$(dir_bytes /var/cache/apt)
    DELTA=$((APT_BEFORE - APT_AFTER))
    [ "$DELTA" -gt 0 ] && TOTAL_FREED=$((TOTAL_FREED + DELTA))
    report "  -> freed $(fmt "$DELTA")"
fi

# ── Summary ──
echo ""
if [ "$DRY_RUN" = true ]; then
    echo "  Cache cleanup could free: ~$(fmt "$TOTAL_FREED")"
else
    echo "  Cache cleanup freed: $(fmt "$TOTAL_FREED")"
fi
