#!/bin/bash
# cleaner.sh — single entry point for all WSL-side checks of windows11wsl2cleaner.
#
# Usage: cleaner.sh <check-id> <scan|clean> [--dry-run]
#
# Reads PROJECT_ROOTS (colon-separated) from the environment for build-artifact
# checks. If the check requires sudo, exactly one line (the password) is read
# from stdin before anything else happens (see lib/common.sh:require_sudo).
#
# Every line written to stdout is NDJSON (see lib/common.sh emit_result/emit_log).
# stderr is never parsed as data — only surfaced as diagnostic text.

set -u
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"
# shellcheck source=lib/build_artifacts.sh
source "$SCRIPT_DIR/lib/build_artifacts.sh"
# shellcheck source=lib/package_caches.sh
source "$SCRIPT_DIR/lib/package_caches.sh"
# shellcheck source=lib/docker_system.sh
source "$SCRIPT_DIR/lib/docker_system.sh"

CHECK_ID="${1:-}"
MODE="${2:-scan}"
DRY_RUN=0
for arg in "$@"; do
    [ "$arg" = "--dry-run" ] && DRY_RUN=1
done

if [ -z "$CHECK_ID" ]; then
    echo '{"v":1,"check":"_","phase":"result","bytes":0,"ok":false,"message":"missing check id"}'
    exit 1
fi

case "$CHECK_ID" in
    # --- build artifacts -----------------------------------------------------
    wsl-build-rust-target)
        run_build_check "$CHECK_ID" "$MODE" "$DRY_RUN" target 0 Cargo.toml ;;
    wsl-build-maven-target)
        run_build_check "$CHECK_ID" "$MODE" "$DRY_RUN" target 0 pom.xml ;;
    wsl-build-node-modules)
        run_build_check "$CHECK_ID" "$MODE" "$DRY_RUN" node_modules 0 package.json ;;
    wsl-build-gradle-build)
        run_build_check "$CHECK_ID" "$MODE" "$DRY_RUN" build 0 build.gradle build.gradle.kts ;;
    wsl-build-gradle-cache)
        run_build_check "$CHECK_ID" "$MODE" "$DRY_RUN" .gradle 0 build.gradle build.gradle.kts settings.gradle settings.gradle.kts ;;
    wsl-build-js-dist)
        run_build_check "$CHECK_ID" "$MODE" "$DRY_RUN" dist 10485760 package.json ;;

    # --- simple package caches ------------------------------------------------
    wsl-cache-yarn)
        run_cache_check "$CHECK_ID" "$MODE" "$DRY_RUN" "$HOME/.cache/yarn" "yarn cache clean" ;;
    wsl-cache-npm)
        check_npm_cache "$MODE" "$DRY_RUN" ;;
    wsl-cache-pnpm-store)
        check_pnpm_store "$MODE" "$DRY_RUN" ;;
    wsl-cache-pip)
        run_rm_contents_check "$CHECK_ID" "$MODE" "$DRY_RUN" "$HOME/.cache/pip" ;;
    wsl-cache-bun)
        run_rm_contents_check "$CHECK_ID" "$MODE" "$DRY_RUN" "$HOME/.bun/install/cache" ;;
    wsl-cache-cargo-registry)
        check_cargo_registry "$MODE" "$DRY_RUN" ;;
    wsl-cache-uv)
        run_cache_check "$CHECK_ID" "$MODE" "$DRY_RUN" "$HOME/.cache/uv" "uv cache clean" ;;
    wsl-trash)
        run_rm_contents_check "$CHECK_ID" "$MODE" "$DRY_RUN" "$HOME/.local/share/Trash" ;;
    wsl-thumbnails)
        run_rm_contents_check "$CHECK_ID" "$MODE" "$DRY_RUN" "$HOME/.thumbnails" ;;

    # --- version-pruning caches -------------------------------------------------
    wsl-cache-cypress-old)
        check_cypress_old "$MODE" "$DRY_RUN" ;;
    wsl-cache-jetbrains-old)
        check_jetbrains_old "$MODE" "$DRY_RUN" ;;
    wsl-cache-maven-snapshots)
        check_maven_snapshots "$MODE" "$DRY_RUN" ;;
    wsl-toolchain-rust-old)
        check_rust_toolchain_old "$MODE" "$DRY_RUN" ;;
    wsl-cache-misc-dotcache)
        check_misc_dotcache "$MODE" "$DRY_RUN" ;;

    # --- docker / system (sudo) -------------------------------------------------
    wsl-docker-prune)
        check_docker_prune "$MODE" "$DRY_RUN" ;;
    wsl-sudo-system-cleanup)
        check_sudo_system_cleanup "$MODE" "$DRY_RUN" ;;
    wsl-fstrim)
        check_fstrim "$MODE" "$DRY_RUN" ;;
    wsl-fstrim-timer)
        check_fstrim_timer "$MODE" "$DRY_RUN" ;;

    *)
        emit_result "$CHECK_ID" 0 false "unknown check id"
        exit 1
        ;;
esac
