# WSL2 Cleaner

> **Use at your own risk.** This tool deletes files, prunes Docker/Rancher data, runs `sudo`
> commands inside WSL, and compacts virtual disks. Nothing here is undoable. Review what a
> check does before running it, and keep backups of anything you can't afford to lose.
>
> The application UI is **German only**. This README is provided in English for GitHub, but
> the app itself is not localized.

A Windows 11 + WSL2 desktop cleanup tool for developer machines. It scans for disk-space
hogs that pile up during day-to-day development — and lets you reclaim the space with one
click each, or all at once.

## What it does

WSL2 Cleaner is an Electron + React app that runs on Windows and talks to your WSL
distros, Docker/Rancher Desktop, and Windows itself to find and remove:

- **Build artifacts** — `node_modules`, `target`, `build`, and similar directories left
  behind under your configured project roots (inside WSL).
- **Package-manager caches** — npm/pnpm/yarn/pip/cargo/... caches inside WSL.
- **Docker / Rancher Desktop data** — dangling images, containers, volumes, build cache.
- **Windows temp & system caches** — Windows Temp, DISM component store, recycle bin, and
  other app-specific caches (Adobe, Thunderbird, JetBrains, uv, ...).
- **WSL virtual disk compaction (VHDX)** — reclaims space from WSL/Rancher's growing
  virtual disk files via `diskpart`, after fully shutting down WSL.

## How it works

Every cleanup target is a self-contained "check" with a *scan* (measure reclaimable space)
and a *clean* (actually remove it) step:

- Checks that run **inside WSL** shell out to `wsl.exe`, which runs a bash script deployed
  into the distro. Sudo-requiring checks (e.g. `apt` cache cleanup) prompt for your WSL
  password once per run.
- Checks that run **on Windows** use PowerShell, DISM, or direct filesystem access.
- **VHDX compaction** requires WSL to be fully shut down first, so it always runs last.

On first launch, the app detects your machine profile (registered WSL distros, project
roots, whether Rancher Desktop is installed, discovered `.vhdx` files) and only shows the
checks that apply to your setup. You can scan and clean checks individually, or run
"Alles bereinigen" (clean everything) to work through all enabled checks in a safe order —
non-destructive scans first, sudo-requiring steps grouped together (and skipped entirely
if a sudo prompt fails, to avoid a prompt loop), Windows-side and WSL-side checks running
concurrently, and disk compaction last.

## Requirements

- Windows 11
- WSL2 with at least one registered distro
- Administrator rights (the app requests elevation — several operations, like DISM and
  disk compaction, require it)
- [Rancher Desktop](https://rancherdesktop.io/) only if you want Docker-related cleanup

## Installation

Download the latest installer (`WSL2-Cleaner-<version>-setup.exe`) from the
[Releases](../../releases) page and run it. The app checks for and installs updates
automatically in the background.

### Building from source

```bash
pnpm install
pnpm dev            # start in dev mode with hot reload
pnpm build           # production build
pnpm build:win        # production build + packaged Windows installer (.exe)
```

Requires [pnpm](https://pnpm.io/) and Node.js 20+.

## Usage

1. Launch the app (accept the UAC elevation prompt).
2. Let it detect your machine profile, or adjust project roots / settings first.
3. Scan individual checks, or click "Alles bereinigen" to scan and clean everything.
4. Enter your WSL sudo password when prompted, if any sudo-requiring checks are enabled.
5. Review the results and freed disk space.

## Development

See [`CLAUDE.md`](./CLAUDE.md) for architecture notes, the check abstraction, IPC/event
wiring, and test commands — useful context whether you're a human contributor or an AI
coding assistant.

## Releases & versioning

Releases are automated with [semantic-release](https://semantic-release.gitbook.io/):
every push to `main` is analyzed against
[Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`,
`BREAKING CHANGE:`, ...), which determines the next version, builds the Windows
installer, and publishes it as a GitHub Release automatically — see
[`.github/workflows/release.yml`](./.github/workflows/release.yml).

## License

No license has been chosen yet — all rights reserved by default. Ask before reusing this
code elsewhere.
