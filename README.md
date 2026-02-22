# HTTP Request Tracer

Open source desktop HTTP/HTTPS tracer for Android emulators, focused on a clean UI and local-first workflows.

Built with Tauri + Rust + React, and co-developed with OpenAI Codex.

## Why this project exists

Inspecting Android emulator traffic is still painful if you want a modern UX and no paywall.  
HTTP Request Tracer aims to provide a practical, free, local desktop alternative for development teams.

## Main features

- Clean request explorer with details for headers, params, cookies, and bodies.
- Start/stop tracing directly from the app by managing emulator proxy settings over ADB.
- HTTPS support through local CA generation + guided certificate install flow.
- Interception mode with pending queue, edit, forward, and drop actions.
- Sort and filter captured requests for high-volume sessions.
- ES/EN language support, theme settings, and basic privacy masking.
- Local-only ephemeral sessions: no backend, no cloud sync, no request storage outside memory.

## Design principles

- Local first: everything runs on your machine.
- No host proxy takeover: only emulator proxy settings are changed.
- Developer ergonomics over enterprise overhead.
- Open source and extensible roadmap.

## Current platform support

- macOS first-class support (current release focus).
- Linux/Windows support planned after MVP stabilization.

## Prerequisites

- macOS
- Xcode Command Line Tools (or full Xcode)
- Rust toolchain (`rustup`, `cargo`, `rustc`)
- Node.js `20.19+` or `22.12+`
- Android Platform Tools (`adb`) in `PATH`
- Running Android Emulator

## Local development

```bash
npm install
npm run tauri dev
```

## Build executable

```bash
npm run tauri build
```

Bundle output:

- `src-tauri/target/release/bundle/`

## Release process (macOS)

- Branch-based release workflow: `.github/workflows/release-from-branch.yml`
- Detailed guide: `docs/release-macos-playbook.md`
- Packaging notes: `docs/mvp-09-packaging-guide.md`

## Security and trust notes

- HTTPS capture requires trusting the generated local CA in the emulator.
- Apps with TLS pinning can still block interception.
- Optional ADB override: set `ADB_PATH` to force a specific binary.
- Common ADB fallback paths:
  - `/opt/homebrew/bin/adb`
  - `/opt/local/bin/adb`
  - `/usr/local/bin/adb`
  - `/usr/bin/adb`

## Architecture highlights

- Frontend: React + Vite + TypeScript.
- Desktop/runtime: Tauri v2.
- Core tracer: Rust + `hudsucker`.
- Data lifecycle: in-memory session state only.

## Third-party software notices

This project depends on third-party open source packages under their own licenses.

- Full notices: `THIRD_PARTY_NOTICES.md`

## Documentation

- `docs/mvp-01-configuracion-preferencias.md`
- `docs/mvp-05-sesiones-efimeras-privacidad.md`
- `docs/mvp-07-arquitectura-modular.md`
- `docs/mvp-08-testing-strategy.md`
- `docs/mvp-09-packaging-guide.md`
- `docs/mvp-15-guardrails-interceptacion.md`
- `docs/spike-05-tls-pinning-trust-model.md`
- `docs/spike-06-performance-baseline.md`

## License

MIT License. See `LICENSE`.
