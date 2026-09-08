# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Electron + React desktop app ("windows11wsl2cleaner") that scans and cleans disk-space-hogging junk on a Windows 11 + WSL2 dev machine: build artifacts (`node_modules`, `target`, `build`, ...), package-manager caches, Docker/Rancher Desktop data, Windows temp/system caches, and VHDX compaction for WSL virtual disks. Runs on Windows only (shells out to `wsl.exe`, `diskpart.exe`, PowerShell).

## Commands

Package manager is **pnpm** (see `packageManager` field in `package.json`).

- `pnpm dev` — start electron-vite in dev mode (hot reload)
- `pnpm build` — production build via electron-vite
- `pnpm build:win` — build + package a Windows NSIS installer exe (electron-builder)
- `pnpm typecheck` — runs both `tsc --noEmit` projects (node + web); no separate lint script exists
- `pnpm test` — run vitest once (`vitest run`)
- Single test file: `pnpm exec vitest run src/main/orchestrator/errorPolicy.test.ts`
- Tests live next to the code they test (`*.test.ts`) and are limited to `src/main/**` and `src/shared/**` (see `vitest.config.ts`) — there is no renderer test setup.

## Architecture

Standard electron-vite three-target layout, each with its own tsconfig/path aliases (`@main/*` in main+preload, `@renderer/*` in renderer, `@shared/*` everywhere):

- `src/main` — Electron main process: check registry, orchestration, IPC handlers, OS/WSL integration.
- `src/preload` — contextBridge, exposes `window.api` typed by `ApiBridge` in `src/shared/types.ts`.
- `src/renderer/src` — React UI (zustand stores, components).
- `src/shared/types.ts` — the single source of truth for cross-process contracts: `CheckDefinition`, `ScanResult`/`CleanResult`, `MachineProfile`, the `ApiBridge` interface, and the `IPC` channel-name map. Keep this file free of runtime deps (no zod) since the renderer bundle imports it too. Any new IPC channel, event, or bridge method must be added here first, then wired in `registerIpcHandlers.ts` and `preload/index.ts`.

### The check abstraction

Everything the app can scan/clean is a `CheckEntry` (`src/main/checks/types.ts`): a `CheckDefinition` (id, category, platform, sudo/rancher/wsl-shutdown requirements) plus `scan`/`clean` handlers plus `isApplicable(profile)`. `buildRegistry()` in `src/main/checks/registry.ts` assembles the full, machine-specific list from three families and filters out inapplicable ones:

- **WSL checks** (`makeWslCheck` in `checks/wsl/genericWslCheck.ts`) — thin wrappers that all funnel through `wslRunner.ts`, which spawns `wsl.exe -d <distro> -u <user> -- bash cleaner.sh <check-id> <scan|clean>`. The *actual* per-check logic lives in `resources/wsl-scripts/` (bash), not in TypeScript — the case statement in `cleaner.sh` dispatches to `lib/build_artifacts.sh`, `lib/package_caches.sh`, `lib/docker_system.sh`. Scripts are deployed/synced into the distro on demand (`deployScripts.ts`, via UNC share with a base64-over-stdin fallback) and communicate results back over stdout as one-line-per-message NDJSON (`{"v":1,"check":...,"phase":"result"|"log",...}` — see `lib/common.sh` `emit_result`/`emit_log` and `src/main/util/ndjson.ts`). **Never** have a check script `echo` raw text to stdout; always go through `emit_log`/`emit_result`, since stdout is parsed as data.
  - `scriptId` on a `CheckDefinition` lets multiple app-level checks (e.g. one fstrim pair per registered WSL distro, built dynamically by `buildFstrimChecksForAllDistros`) share one `cleaner.sh` case-statement id.
  - sudo-requiring checks read the password from stdin (`require_sudo` in `common.sh`); it's never passed as a CLI arg or logged. Only `PROJECT_ROOTS` is forwarded from the host env into WSL, via `WSLENV`.
- **Windows checks** (`checks/windows/*`) — mostly built with `makeSimpleFolderCheck` (measure a folder, clear its contents) or bespoke handlers (DISM, registry, recycle bin).
- **VHDX checks** (`makeVhdxCheck`) — one per discovered `.vhdx` (Rancher's distro/distro-data, Store Ubuntu, ...), compacted via `diskpart.exe`. Requires WSL fully shut down first.

`MachineProfile` (detected by `src/main/profile/detectProfile.ts`, cached via `src/main/config/store.ts`) drives which checks even exist: registered WSL distros + their `bashCapable`/default-user, project roots to scan, Rancher Desktop presence, discovered VHDX paths, and misc app paths (Adobe temp, Thunderbird, JetBrains, uv). Re-run detection after any settings change that affects it (`refreshProfile()` in `src/main/state/appState.ts`).

### Orchestration ("Alles bereinigen" / clean-all)

`src/main/orchestrator/sequence.ts` (`planPhases`) buckets the enabled checks into ordered phases; `cleanAll.ts` (`runCleanAll`) executes them:

1. WSL non-sudo checks (build artifacts + caches) sequentially.
2. `wsl-docker-prune`, only if Rancher Desktop was started successfully (or was already running).
3. WSL sudo checks sequentially — **a sudo-auth failure short-circuits and skips all remaining sudo checks in that run** (retrying would just prompt-loop), see `errorPolicy.ts::looksLikeSudoAuthFailure`.
4. `wsl-fstrim` / `wsl-fstrim-timer` per distro (skipped too if sudo already failed).
5. All Windows-side checks, running **concurrently** with phases 1–4 (`Promise.all([phaseA, phaseB])`).
6. Rancher Desktop stop + full WSL shutdown (if any VHDX check is pending).
7. VHDX compaction last — Rancher-dependent VHDX checks (`isRancherDependentCheckId`) are skipped if Rancher never came up cleanly, since compacting after an unreliable shutdown is unsafe.

Individual check failures don't abort the run; only the sudo-auth and Rancher-start failure modes cause deliberate skips of dependent checks.

### State, IPC, events

`src/main/state/appState.ts` holds the single in-memory `AppState` (profile, built checks, per-check status, settings) for the main process. `src/main/ipc/registerIpcHandlers.ts` wires every `IPC.*` channel (defined in `shared/types.ts`) to this state and to `runCleanAll`/scan handlers, and rebroadcasts main-process events (`src/main/events/bus.ts`, a Node `EventEmitter`) to all renderer windows as `checks:log`, `checks:statusChanged`, `rancher:statusChanged`, `dism:progress`, `disk:overviewProgress`. The renderer never talks to Node/WSL directly — everything goes through `window.api` (preload) → IPC → these handlers.

Rancher Desktop start/stop is confirmed with the user first via a request/response round-trip (`RancherConfirmRequest`/`RancherConfirmAnswer`) rather than firing silently — see `rancherDesktop/confirm.ts`.

## UI language

User-facing strings (check names, descriptions, log/error messages surfaced in the UI) are German. Keep new user-facing text consistent with this.
