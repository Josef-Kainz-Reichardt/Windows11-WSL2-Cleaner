#!/bin/bash
# docker_system.sh — docker prune, apt/journal/snap sudo cleanup, fstrim.
# Ported from docs/hd-laptop/cleanup-wsl-dev-env.ps1 and docs/razer-laptop/cleanup.sh.

# check_docker_prune <mode> <dry_run>
check_docker_prune() {
    local mode="$1" dry_run="$2"

    if ! command -v docker >/dev/null 2>&1 || ! docker info >/dev/null 2>&1; then
        emit_result "wsl-docker-prune" 0 false "docker daemon not reachable (Rancher/Docker not running?)"
        return
    fi

    if [ "$mode" = "scan" ]; then
        local total=0 line
        while IFS= read -r line; do
            [ -z "$line" ] && continue
            total=$((total + $(parse_docker_size "$line")))
        done < <(docker system df --format '{{.Reclaimable}}' 2>/dev/null)
        emit_result "wsl-docker-prune" "$total" true
        return
    fi

    if [ "$dry_run" = "1" ]; then
        local total=0 line
        while IFS= read -r line; do
            [ -z "$line" ] && continue
            total=$((total + $(parse_docker_size "$line")))
        done < <(docker system df --format '{{.Reclaimable}}' 2>/dev/null)
        emit_result "wsl-docker-prune" "$total" true "dry-run: nothing pruned"
        return
    fi

    local out freed=0
    out=$(docker system prune --all --force --volumes 2>&1) || true
    emit_log "wsl-docker-prune" "info" "$out"
    freed=$(echo "$out" | grep -i "Total reclaimed space" | tail -1 | sed -E 's/.*:\s*//' )
    freed=$(parse_docker_size "$freed")

    out=$(docker builder prune --all --force 2>&1) || true
    emit_log "wsl-docker-prune" "info" "$out"
    local builder_freed
    builder_freed=$(echo "$out" | grep -i "Total:" | tail -1 | sed -E 's/.*:\s*//')
    builder_freed=$(parse_docker_size "$builder_freed")
    freed=$((freed + builder_freed))

    emit_result "wsl-docker-prune" "$freed" true
}

# check_sudo_system_cleanup <mode> <dry_run>
# Batch: apt autoremove/autoclean/clean, journalctl vacuum (3d), old snap revisions.
# All sudo calls after require_sudo reuse the same process's cached timestamp.
check_sudo_system_cleanup() {
    local mode="$1" dry_run="$2"
    local apt_cache="/var/cache/apt"

    if [ "$mode" = "scan" ]; then
        local apt_size
        apt_size=$(dir_bytes "$apt_cache")
        emit_result "wsl-sudo-system-cleanup" "$apt_size" true "estimate: apt cache only, journal/snap savings vary"
        return
    fi

    require_sudo "wsl-sudo-system-cleanup"

    if [ "$dry_run" = "1" ]; then
        local apt_size
        apt_size=$(dir_bytes "$apt_cache")
        emit_result "wsl-sudo-system-cleanup" "$apt_size" true "dry-run: nothing cleaned"
        return
    fi

    local apt_before apt_after apt_freed
    apt_before=$(dir_bytes "$apt_cache")
    sudo -n apt-get autoremove -y >/dev/null 2>&1 || true
    sudo -n apt-get autoclean -y >/dev/null 2>&1 || true
    sudo -n apt-get clean >/dev/null 2>&1 || true
    apt_after=$(dir_bytes "$apt_cache")
    apt_freed=$((apt_before - apt_after))
    [ "$apt_freed" -lt 0 ] && apt_freed=0

    local journal_freed=0
    if command -v journalctl >/dev/null 2>&1; then
        local jout
        jout=$(sudo -n journalctl --vacuum-time=3d 2>&1) || true
        emit_log "wsl-sudo-system-cleanup" "info" "$jout"
        local jsize
        jsize=$(echo "$jout" | grep -oE 'freed [0-9.]+[A-Za-z]+' | tail -1 | sed -E 's/freed //')
        [ -n "$jsize" ] && journal_freed=$(parse_docker_size "$jsize")
    fi

    local snap_freed=0
    if command -v snap >/dev/null 2>&1; then
        local name rev size
        while read -r name rev; do
            [ -z "$name" ] && continue
            size=$(du -sb "/var/lib/snapd/snaps/${name}_${rev}.snap" 2>/dev/null | awk '{print $1}')
            snap_freed=$((snap_freed + ${size:-0}))
            sudo -n snap remove "$name" --revision="$rev" >/dev/null 2>&1 || true
        done < <(snap list --all 2>/dev/null | awk '/disabled/ {print $1, $3}')
    fi

    local total=$((apt_freed + journal_freed + snap_freed))
    emit_result "wsl-sudo-system-cleanup" "$total" true
}

# check_fstrim <mode> <dry_run>
check_fstrim() {
    local mode="$1" dry_run="$2"

    if [ "$mode" = "scan" ]; then
        emit_result "wsl-fstrim" null true "not estimable ahead of time"
        return
    fi

    require_sudo "wsl-fstrim"

    if [ "$dry_run" = "1" ]; then
        emit_result "wsl-fstrim" 0 true "dry-run: fstrim not executed"
        return
    fi

    local out bytes
    out=$(sudo -n fstrim -v / 2>&1) || true
    emit_log "wsl-fstrim" "info" "$out"
    bytes=$(echo "$out" | grep -oE '\([0-9]+ bytes\)' | grep -oE '[0-9]+' | tail -1)
    emit_result "wsl-fstrim" "${bytes:-0}" true
}

# check_fstrim_timer <mode> <dry_run>
# Enables the systemd fstrim.timer so periodic TRIM keeps happening between
# manual cleanup runs (a prerequisite for effective VHDX auto-shrink / manual
# compaction alike). No-op (informational only) when the distro isn't running
# systemd as PID 1 — enabling it there requires editing /etc/wsl.conf and a
# distro restart, which this check does not do automatically.
check_fstrim_timer() {
    local mode="$1" dry_run="$2"

    if [ "$(ps -p 1 -o comm= 2>/dev/null)" != "systemd" ]; then
        emit_result "wsl-fstrim-timer" 0 true "systemd nicht aktiv (PID 1) - manuell in /etc/wsl.conf aktivieren: [boot] systemd=true, dann Distro neu starten"
        return
    fi

    if [ "$mode" = "scan" ]; then
        if systemctl is-enabled --quiet fstrim.timer 2>/dev/null; then
            emit_result "wsl-fstrim-timer" 0 true "fstrim.timer bereits aktiviert"
        else
            emit_result "wsl-fstrim-timer" 0 true "fstrim.timer nicht aktiviert"
        fi
        return
    fi

    require_sudo "wsl-fstrim-timer"

    if [ "$dry_run" = "1" ]; then
        emit_result "wsl-fstrim-timer" 0 true "dry-run: fstrim.timer würde aktiviert"
        return
    fi

    local out
    out=$(sudo -n systemctl enable --now fstrim.timer 2>&1) || true
    emit_log "wsl-fstrim-timer" "info" "$out"
    if systemctl is-enabled --quiet fstrim.timer 2>/dev/null; then
        emit_result "wsl-fstrim-timer" 0 true "fstrim.timer aktiviert"
    else
        emit_result "wsl-fstrim-timer" 0 false "fstrim.timer konnte nicht aktiviert werden"
    fi
}
