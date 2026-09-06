#!/bin/bash
# cleanup.sh — Ubuntu/WSL cleanup
# Called either standalone or from cleanup.ps1 (Windows wrapper)

set -u

# --- Options ------------------------------------------------------------------
DRY_RUN=false
SKIP_SUDO=false
for arg in "$@"; do
    case "$arg" in
        --dry-run) DRY_RUN=true ;;
        --skip-sudo) SKIP_SUDO=true ;;
    esac
done

# --- Helpers ------------------------------------------------------------------
BOLD='\033[1m'
DIM='\033[2m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
RESET='\033[0m'

section() { echo -e "\n${BOLD}── $* ──${RESET}"; }
info()    { echo -e "${DIM}  $*${RESET}"; }
ok()      { echo -e "  ${GREEN}✓${RESET} $*"; }
warn()    { echo -e "  ${YELLOW}!${RESET} $*"; }
err()     { echo -e "  ${RED}✗${RESET} $*"; }

bytes_free() { df -B1 --output=avail / | tail -1; }
human()      { numfmt --to=iec-i --suffix=B "$1" 2>/dev/null || echo "$1"; }

run() {
    if $DRY_RUN; then
        info "DRY RUN: $*"
    else
        eval "$@"
    fi
}

size_of() {
    local path="$1"
    if [ -e "$path" ]; then
        du -sb "$path" 2>/dev/null | awk '{print $1}'
    else
        echo 0
    fi
}

START_FREE=$(bytes_free)

echo -e "${BOLD}Linux Cleanup${RESET}"
$DRY_RUN && echo -e "${YELLOW}[DRY RUN MODE — nothing will actually be deleted]${RESET}"
echo -e "${DIM}Free space before: $(human $START_FREE)${RESET}"

# --- 1. Projects: target/ and node_modules (from clean-target-dirs.sh) --------
section "Project build artifacts (~/projects)"

if [ -d "$HOME/projects" ]; then
    total_projects=0
    while IFS= read -r dir; do
        [ -z "$dir" ] && continue
        parent=$(dirname "$dir")
        basename=$(basename "$dir")
        sz=$(size_of "$dir")

        handled=false
        if [ "$basename" = "target" ] && [ -f "$parent/Cargo.toml" ]; then
            info "Rust:  $dir ($(human $sz))"
            run "rm -rf \"$dir\""
            handled=true
        elif [ "$basename" = "target" ] && [ -f "$parent/pom.xml" ]; then
            info "Maven: $dir ($(human $sz))"
            run "rm -rf \"$dir\""
            handled=true
        elif [ "$basename" = "node_modules" ] && [ -f "$parent/package.json" ]; then
            info "Node:  $dir ($(human $sz))"
            run "rm -rf \"$dir\""
            handled=true
        fi

        if $handled; then
            total_projects=$((total_projects + sz))
        fi
    done < <(find "$HOME/projects" -type d \( -name target -o -name node_modules \) -prune 2>/dev/null)

    ok "Cleaned build artifacts: $(human $total_projects)"
else
    warn "~/projects does not exist, skipping"
fi

# --- 2. Package manager caches ------------------------------------------------
section "Package manager caches"

# npm
if [ -d "$HOME/.npm" ]; then
    sz=$(size_of "$HOME/.npm")
    info "npm cache: $(human $sz)"
    if command -v npm >/dev/null 2>&1; then
        run "npm cache clean --force >/dev/null 2>&1"
    else
        run "rm -rf \"$HOME/.npm\"/_cacache \"$HOME/.npm\"/_logs"
    fi
    ok "npm cache cleaned"
fi

# pnpm
if command -v pnpm >/dev/null 2>&1; then
    run "pnpm store prune >/dev/null 2>&1 || true"
    ok "pnpm store pruned"
fi

# yarn
if command -v yarn >/dev/null 2>&1; then
    run "yarn cache clean >/dev/null 2>&1 || true"
    ok "yarn cache cleaned"
fi

# uv (Python)
if command -v uv >/dev/null 2>&1; then
    run "uv cache clean >/dev/null 2>&1 || true"
    ok "uv cache cleaned"
fi

# pip
if [ -d "$HOME/.cache/pip" ]; then
    run "rm -rf \"$HOME/.cache/pip\"/*"
    ok "pip cache cleaned"
fi

# bun
if [ -d "$HOME/.bun/install/cache" ]; then
    run "rm -rf \"$HOME/.bun/install/cache\"/*"
    ok "bun cache cleaned"
fi

# cargo
if [ -d "$HOME/.cargo/registry/cache" ]; then
    run "rm -rf \"$HOME/.cargo/registry/cache\"/*"
    run "rm -rf \"$HOME/.cargo/registry/src\"/*"
    ok "cargo registry cache cleaned"
fi

# --- 3. ~/.cache (everything except browser profiles we might want) -----------
section "User cache (~/.cache)"

if [ -d "$HOME/.cache" ]; then
    sz=$(size_of "$HOME/.cache")
    info "Size: $(human $sz)"
    run "find \"$HOME/.cache\" -mindepth 1 -maxdepth 1 -exec rm -rf {} +"
    ok "~/.cache cleaned"
fi

# --- 4. Thumbnails & trash ----------------------------------------------------
section "Thumbnails and trash"

[ -d "$HOME/.local/share/Trash" ] && run "rm -rf \"$HOME/.local/share/Trash\"/*" && ok "Trash emptied"
[ -d "$HOME/.thumbnails" ] && run "rm -rf \"$HOME/.thumbnails\"/*" && ok "Thumbnails cleaned"

# --- 5. Docker / Rancher ------------------------------------------------------
section "Docker / Rancher"

if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
    run "docker system prune --all --force --volumes"
    ok "Docker pruned"
else
    warn "Docker not available or daemon not running — skipping (Rancher may be stopped already)"
fi

# --- 6. System-level (needs sudo) ---------------------------------------------
if ! $SKIP_SUDO; then
    section "System-level cleanup (sudo)"

    run "sudo apt-get autoremove -y >/dev/null 2>&1"
    ok "apt autoremove"
    run "sudo apt-get autoclean -y >/dev/null 2>&1"
    ok "apt autoclean"
    run "sudo apt-get clean >/dev/null 2>&1"
    ok "apt clean"

    # Journal logs: keep only last 3 days
    if command -v journalctl >/dev/null 2>&1; then
        run "sudo journalctl --vacuum-time=3d >/dev/null 2>&1 || true"
        ok "Journal vacuumed (3d)"
    fi

    # Old snap revisions
    if command -v snap >/dev/null 2>&1; then
        run "sudo sh -c 'snap list --all | awk \"/disabled/ {print \\\$1, \\\$3}\" | while read name rev; do snap remove \"\$name\" --revision=\"\$rev\"; done' >/dev/null 2>&1 || true"
        ok "Old snap revisions removed"
    fi
else
    warn "Skipping sudo-requiring steps (--skip-sudo)"
fi

# --- 7. fstrim ---------------------------------------------------------------
if ! $SKIP_SUDO; then
    section "fstrim (release freed blocks to host)"
    run "sudo fstrim -v / 2>&1 | sed 's/^/  /'"
fi

# --- Summary -----------------------------------------------------------------
END_FREE=$(bytes_free)
DIFF=$((END_FREE - START_FREE))

echo ""
echo -e "${BOLD}── Summary ──${RESET}"
echo -e "  Free before: $(human $START_FREE)"
echo -e "  Free after:  $(human $END_FREE)"
if [ $DIFF -gt 0 ]; then
    echo -e "  ${GREEN}Freed: $(human $DIFF)${RESET}"
elif [ $DIFF -lt 0 ]; then
    echo -e "  ${YELLOW}Delta: -$(human ${DIFF#-}) (normal during active use)${RESET}"
else
    echo -e "  No change"
fi
