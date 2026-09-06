#!/bin/bash
set -euo pipefail

# ──────────────────────────────────────────────────────────
# clean-target-dirs.sh — Clean build artifacts from repos
#
# Usage: clean-target-dirs.sh <path> [--dry-run] [--rm]
#   --dry-run   Show what would be deleted without doing it
#   --rm        Use rm -rf instead of build-tool clean commands
# ──────────────────────────────────────────────────────────

if [ -z "${1:-}" ]; then
    echo "Usage: $0 <path> [--dry-run] [--rm]"
    exit 1
fi

search_path="$1"
dry_run=false
force_rm=false

for arg in "$@"; do
    case "$arg" in
        --dry-run) dry_run=true ;;
        --rm)      force_rm=true ;;
    esac
done

total_space=0

calculate_size() {
    du -sb "$1" 2>/dev/null | awk '{print $1}'
}

format_size() {
    numfmt --to=iec "$1" 2>/dev/null || echo "${1}B"
}

action() {
    local dir="$1" type="$2" size="$3" parent
    parent=$(dirname "$dir")

    total_space=$((total_space + size))

    if [ "$dry_run" = true ]; then
        echo "  [DRY RUN] $type: $dir ($(format_size "$size"))"
        return
    fi

    echo "  Deleting: $dir ($type, $(format_size "$size"))"
    rm -rf "$dir"
}

# Use null-delimited find to handle spaces in paths correctly
while IFS= read -r -d '' dir; do
    parent=$(dirname "$dir")
    base=$(basename "$dir")

    case "$base" in
        target)
            if [ -f "$parent/Cargo.toml" ]; then
                size=$(calculate_size "$dir")
                action "$dir" "Rust" "$size"
            elif [ -f "$parent/pom.xml" ]; then
                size=$(calculate_size "$dir")
                action "$dir" "Maven" "$size"
            fi
            ;;
        node_modules)
            if [ -f "$parent/package.json" ]; then
                size=$(calculate_size "$dir")
                action "$dir" "Node.js" "$size"
            fi
            ;;
        build)
            # Gradle build dirs
            if [ -f "$parent/build.gradle" ] || [ -f "$parent/build.gradle.kts" ]; then
                size=$(calculate_size "$dir")
                action "$dir" "Gradle" "$size"
            fi
            ;;
        .gradle)
            # Project-local .gradle caches
            if [ -f "$parent/build.gradle" ] || [ -f "$parent/build.gradle.kts" ] || [ -f "$parent/settings.gradle" ] || [ -f "$parent/settings.gradle.kts" ]; then
                size=$(calculate_size "$dir")
                action "$dir" "Gradle cache" "$size"
            fi
            ;;
        dist)
            # Frontend build output (only if package.json exists)
            if [ -f "$parent/package.json" ]; then
                size=$(calculate_size "$dir")
                # Only clean if > 10MB to avoid false positives
                if [ "$size" -gt 10485760 ]; then
                    action "$dir" "JS dist" "$size"
                fi
            fi
            ;;
    esac
done < <(find "$search_path" -type d \( \
    -name target \
    -o -name node_modules \
    -o -name build \
    -o -name .gradle \
    -o -name dist \
\) -prune -print0 2>/dev/null)

# Summary
echo ""
if [ "$dry_run" = true ]; then
    echo "  Dry run complete. Could free: $(format_size $total_space)"
else
    echo "  Done. Freed: $(format_size $total_space)"
fi
