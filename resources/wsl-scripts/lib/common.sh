#!/bin/bash
# common.sh — shared helpers for all wsl2cleaner check scripts.
# Sourced by cleaner.sh; never executed directly.

# --- Toolchain PATH bootstrap -------------------------------------------------
# cleaner.sh runs as `bash cleaner.sh ...` (non-interactive, non-login), so
# .bashrc/.profile are never sourced. Version-manager shims (nvm, volta,
# standalone pnpm, uv) are only put on PATH by those files — without this,
# package-cache checks that shell out to node/pnpm/yarn/uv (package_caches.sh)
# silently no-op with "command not found" (swallowed, freed=0, no error) even
# though the tool detected gigabytes to clean during scan. Reproduce the PATH
# additions those managers' shell hooks would normally make.
if [ -s "$HOME/.nvm/nvm.sh" ]; then
    export NVM_DIR="$HOME/.nvm"
    # shellcheck disable=SC1091
    \. "$NVM_DIR/nvm.sh" >/dev/null 2>&1
fi
[ -d "$HOME/.volta/bin" ] && PATH="$HOME/.volta/bin:$PATH"
[ -d "$HOME/.local/share/pnpm" ] && PATH="$HOME/.local/share/pnpm:$PATH"
[ -d "$HOME/.local/bin" ] && PATH="$HOME/.local/bin:$PATH"
[ -d "$HOME/.cargo/bin" ] && PATH="$HOME/.cargo/bin:$PATH"
export PATH

# --- NDJSON emission ---------------------------------------------------------
# Every line printed on stdout MUST go through emit_result/emit_log so the
# Electron main process can parse it as NDJSON. Never echo raw text to stdout
# from a check implementation — use emit_log for human-readable diagnostics.

json_escape() {
    local s="$1"
    s="${s//\\/\\\\}"
    s="${s//\"/\\\"}"
    s="${s//$'\n'/\\n}"
    s="${s//$'\r'/}"
    printf '%s' "$s"
}

# emit_result <check_id> <bytes> <ok:true|false> [message]
emit_result() {
    local check="$1" bytes="$2" ok="$3" message="${4:-}"
    printf '{"v":1,"check":"%s","phase":"result","bytes":%s,"ok":%s,"message":"%s"}\n' \
        "$check" "${bytes:-0}" "$ok" "$(json_escape "$message")"
}

# emit_log <check_id> <info|warn|error> <message>
emit_log() {
    local check="$1" level="$2" message="$3"
    printf '{"v":1,"check":"%s","phase":"log","level":"%s","message":"%s"}\n' \
        "$check" "$level" "$(json_escape "$message")"
}

# --- Size helpers -------------------------------------------------------------

dir_bytes() {
    local path="$1"
    if [ -e "$path" ]; then
        du -sb "$path" 2>/dev/null | awk '{print $1}'
    else
        echo 0
    fi
}

# Parses docker's human-readable sizes ("1.23GB", "512kB", "0B") into bytes.
# Docker (go-units HumanSize) uses decimal (1000-based) multiples.
parse_docker_size() {
    local s="$1"
    awk -v s="$s" '
        BEGIN {
            n = s
            gsub(/[[:space:]]/, "", n)
            if (match(n, /^[0-9.]+/)) {
                num = substr(n, RSTART, RLENGTH)
                unit = substr(n, RSTART + RLENGTH)
            } else {
                num = 0; unit = ""
            }
            mult = 1
            if (unit ~ /^kB/) mult = 1000
            else if (unit ~ /^MB/) mult = 1000 * 1000
            else if (unit ~ /^GB/) mult = 1000 * 1000 * 1000
            else if (unit ~ /^TB/) mult = 1000 * 1000 * 1000 * 1000
            printf "%d", num * mult
        }
    '
}

# --- Sudo bootstrap ------------------------------------------------------------
# Reads exactly one line (the sudo password) from stdin and validates it with
# sudo. Subsequent `sudo -n` calls in THIS process reuse that cached timestamp.
# The password never appears as a CLI argument and is never logged.
require_sudo() {
    local check_id="$1"
    local pass
    IFS= read -r pass
    if ! printf '%s\n' "$pass" | sudo -S -p '' true 2>/dev/null; then
        emit_result "$check_id" 0 false "sudo authentication failed"
        exit 1
    fi
    unset pass
}
