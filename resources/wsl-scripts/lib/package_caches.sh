#!/bin/bash
# package_caches.sh — package manager / IDE / trash cache checks.
# Ported from docs/hd-laptop/wsl/clean-caches.sh and docs/razer-laptop/cleanup.sh.

# run_cache_check <check_id> <mode> <dry_run> <path> <clean_cmd>
# Generic "measure a directory, optionally run a clean command, measure again" check.
# clean_cmd is a fixed (non-user-controlled) shell command string.
run_cache_check() {
    local check_id="$1" mode="$2" dry_run="$3" path="$4" clean_cmd="$5"
    local before
    before=$(dir_bytes "$path")

    if [ "$mode" = "scan" ]; then
        emit_result "$check_id" "$before" true
        return
    fi

    if [ "$dry_run" = "1" ]; then
        emit_result "$check_id" "$before" true "dry-run: nothing deleted"
        return
    fi

    # Nothing there is not a failure — e.g. ~/.cache/pip when pip was never
    # used in this distro. Skip running clean_cmd (a bare `find` on a missing
    # path exits non-zero) instead of reporting a spurious error.
    if [ ! -e "$path" ]; then
        emit_result "$check_id" 0 true
        return
    fi

    local clean_err clean_status
    clean_err=$(eval "$clean_cmd" 2>&1 >/dev/null)
    clean_status=$?
    local after freed
    after=$(dir_bytes "$path")
    freed=$((before - after))
    [ "$freed" -lt 0 ] && freed=0
    if [ "$clean_status" -ne 0 ] && [ "$freed" -eq 0 ]; then
        emit_result "$check_id" 0 false "clean command failed (exit $clean_status): $clean_err"
    else
        emit_result "$check_id" "$freed" true
    fi
}

# run_rm_contents_check <check_id> <mode> <dry_run> <path>
# Convenience wrapper for "delete everything inside this directory".
run_rm_contents_check() {
    local check_id="$1" mode="$2" dry_run="$3" path="$4"
    run_cache_check "$check_id" "$mode" "$dry_run" "$path" \
        "find \"$path\" -mindepth 1 -maxdepth 1 -exec rm -rf {} +"
}

# check_npm_cache <mode> <dry_run>
# Resolves the actual npm cache directory via `npm config get cache` instead of
# assuming the default ~/.npm — same class of bug as the pnpm store: a custom
# cache dir (via ~/.npmrc `cache=...`) would make before/after measure the
# WRONG folder, reporting 0 bytes freed forever even though `npm cache clean
# --force` genuinely ran and cleaned the real cache.
check_npm_cache() {
    local mode="$1" dry_run="$2"
    local cache_dir
    cache_dir=$(npm config get cache 2>/dev/null | tr -d '\r')
    [ -z "$cache_dir" ] && cache_dir="$HOME/.npm"
    run_cache_check "wsl-cache-npm" "$mode" "$dry_run" "$cache_dir" "npm cache clean --force"
}

# check_pnpm_store <mode> <dry_run>
# Resolves the actual pnpm store directory via `pnpm store path` instead of
# assuming the default ~/.local/share/pnpm. A custom store-dir (global .npmrc
# or PNPM_HOME-based setup) would otherwise make before/after measure the
# WRONG folder — always reporting 0 bytes freed even though `pnpm store
# prune` genuinely ran and cleaned the real store.
check_pnpm_store() {
    local mode="$1" dry_run="$2"
    local store_dir
    store_dir=$(pnpm store path 2>/dev/null | tr -d '\r')
    [ -z "$store_dir" ] && store_dir="$HOME/.local/share/pnpm"
    run_cache_check "wsl-cache-pnpm-store" "$mode" "$dry_run" "$store_dir" "pnpm store prune"
}

# check_cargo_registry <mode> <dry_run>
# cargo registry has two subdirs to clear (cache + src); reported as one check.
check_cargo_registry() {
    local mode="$1" dry_run="$2"
    local cache_dir="$HOME/.cargo/registry/cache" src_dir="$HOME/.cargo/registry/src"
    local before after freed total_before=0 total_after=0

    before=$(dir_bytes "$cache_dir"); total_before=$((total_before + before))
    before=$(dir_bytes "$src_dir"); total_before=$((total_before + before))

    if [ "$mode" = "scan" ]; then
        emit_result "wsl-cache-cargo-registry" "$total_before" true
        return
    fi

    if [ "$dry_run" = "1" ]; then
        emit_result "wsl-cache-cargo-registry" "$total_before" true "dry-run: nothing deleted"
        return
    fi

    [ -d "$cache_dir" ] && find "$cache_dir" -mindepth 1 -maxdepth 1 -exec rm -rf {} + 2>/dev/null
    [ -d "$src_dir" ] && find "$src_dir" -mindepth 1 -maxdepth 1 -exec rm -rf {} + 2>/dev/null

    after=$(dir_bytes "$cache_dir"); total_after=$((total_after + after))
    after=$(dir_bytes "$src_dir"); total_after=$((total_after + after))
    freed=$((total_before - total_after))
    [ "$freed" -lt 0 ] && freed=0
    emit_result "wsl-cache-cargo-registry" "$freed" true
}

# check_cypress_old <mode> <dry_run>
# Keeps the newest (sort -V) version under ~/.cache/Cypress, reports/removes the rest.
check_cypress_old() {
    local mode="$1" dry_run="$2"
    local dir="$HOME/.cache/Cypress"
    local total=0
    if [ -d "$dir" ] && [ "$(ls -1 "$dir" 2>/dev/null | wc -l)" -gt 0 ]; then
        local newest
        newest=$(ls -1 "$dir" | sort -V | tail -1)
        local ver
        for ver in $(ls -1 "$dir" | sort -V); do
            [ "$ver" = "$newest" ] && continue
            local size
            size=$(dir_bytes "$dir/$ver")
            total=$((total + size))
            if [ "$mode" = "clean" ] && [ "$dry_run" != "1" ]; then
                rm -rf "$dir/$ver"
            fi
        done
    fi
    emit_result "wsl-cache-cypress-old" "$total" true
}

# check_jetbrains_old <mode> <dry_run>
# Keeps current-year / RemoteDev / acp-agents cache dirs, reports/removes the rest.
check_jetbrains_old() {
    local mode="$1" dry_run="$2"
    local dir="$HOME/.cache/JetBrains"
    local total=0
    local year
    year=$(date +%Y)
    if [ -d "$dir" ]; then
        local sub name size
        for sub in "$dir"/*/; do
            [ -d "$sub" ] || continue
            name=$(basename "$sub")
            if echo "$name" | grep -qE "(${year}|RemoteDev|acp-agents)"; then
                continue
            fi
            size=$(dir_bytes "$sub")
            total=$((total + size))
            if [ "$mode" = "clean" ] && [ "$dry_run" != "1" ]; then
                rm -rf "$sub"
            fi
        done
    fi
    emit_result "wsl-cache-jetbrains-old" "$total" true
}

# check_maven_snapshots <mode> <dry_run>
check_maven_snapshots() {
    local mode="$1" dry_run="$2"
    local repo="$HOME/.m2/repository"
    local total=0
    if [ -d "$repo" ]; then
        total=$(find "$repo" -type d -name "*SNAPSHOT*" -exec du -sb {} + 2>/dev/null | awk '{s+=$1} END {print s+0}')
        if [ "$mode" = "clean" ] && [ "$dry_run" != "1" ]; then
            find "$repo" -type d -name "*SNAPSHOT*" -exec rm -rf {} + 2>/dev/null || true
            find "$repo" -name "*.lastUpdated" -delete 2>/dev/null || true
            find "$repo" -name "_remote.repositories" -delete 2>/dev/null || true
        fi
    fi
    emit_result "wsl-cache-maven-snapshots" "$total" true
}

# check_rust_toolchain_old <mode> <dry_run>
check_rust_toolchain_old() {
    local mode="$1" dry_run="$2"
    local total=0
    if command -v rustup >/dev/null 2>&1; then
        local tc dir size
        for tc in $(rustup toolchain list 2>/dev/null | grep -vE '(stable|nightly|default)' | awk '{print $1}'); do
            dir="$HOME/.rustup/toolchains/$tc"
            size=$(dir_bytes "$dir")
            total=$((total + size))
            if [ "$mode" = "clean" ] && [ "$dry_run" != "1" ]; then
                rustup toolchain uninstall "$tc" >/dev/null 2>&1 || true
            fi
        done
    fi
    emit_result "wsl-toolchain-rust-old" "$total" true
}

# check_misc_dotcache <mode> <dry_run>
# Everything directly under ~/.cache EXCEPT the subdirs already covered by
# their own dedicated checks (yarn, pip, Cypress, JetBrains, uv).
check_misc_dotcache() {
    local mode="$1" dry_run="$2"
    local dir="$HOME/.cache"
    local exclude=(yarn pip Cypress JetBrains uv)
    local total=0
    if [ -d "$dir" ]; then
        local entry name skip e
        for entry in "$dir"/*; do
            [ -e "$entry" ] || continue
            name=$(basename "$entry")
            skip=false
            for e in "${exclude[@]}"; do
                [ "$name" = "$e" ] && skip=true && break
            done
            $skip && continue
            local size
            size=$(dir_bytes "$entry")
            total=$((total + size))
            if [ "$mode" = "clean" ] && [ "$dry_run" != "1" ]; then
                rm -rf "$entry"
            fi
        done
    fi
    emit_result "wsl-cache-misc-dotcache" "$total" true
}
