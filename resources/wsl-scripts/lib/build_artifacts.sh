#!/bin/bash
# build_artifacts.sh — generic scan/clean for build-output directories
# (target/, node_modules/, build/, .gradle/, dist/) across configured project roots.
# Ported from docs/hd-laptop/wsl/clean-target-dirs.sh, split into one check per kind.

# find_build_dirs <root> <basename>
find_build_dirs() {
    local root="$1" name="$2"
    [ -d "$root" ] || return 0
    find "$root" -type d -name "$name" -prune -print0 2>/dev/null
}

# parent_has_any <dir> <file1> [file2] ...
parent_has_any() {
    local dir="$1"; shift
    local parent
    parent=$(dirname "$dir")
    local f
    for f in "$@"; do
        [ -f "$parent/$f" ] && return 0
    done
    return 1
}

# run_build_check <check_id> <mode> <dry_run> <basename> <min_size_bytes> <parent_file...>
# Reads PROJECT_ROOTS (colon-separated) from the environment.
run_build_check() {
    local check_id="$1" mode="$2" dry_run="$3" basename="$4" min_size="$5"
    shift 5
    local parent_files=("$@")
    local total=0
    local IFS_OLD="$IFS"
    IFS=':' read -r -a roots <<< "${PROJECT_ROOTS:-}"
    IFS="$IFS_OLD"

    local root dir
    for root in "${roots[@]}"; do
        [ -n "$root" ] || continue
        while IFS= read -r -d '' dir; do
            parent_has_any "$dir" "${parent_files[@]}" || continue
            local size
            size=$(dir_bytes "$dir")
            if [ -n "$min_size" ] && [ "$min_size" -gt 0 ] && [ "$size" -le "$min_size" ]; then
                continue
            fi
            total=$((total + size))
            if [ "$mode" = "clean" ] && [ "$dry_run" != "1" ]; then
                rm -rf "$dir"
            fi
        done < <(find_build_dirs "$root" "$basename")
    done

    emit_result "$check_id" "$total" true
}
