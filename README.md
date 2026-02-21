# HTTP Request Tracer (macOS MVP seed)

Desktop app (Tauri + Rust + React) for Android emulator HTTP tracing.

## Current scope

- Desktop shell running on macOS.
- ADB detection and emulator listing.
- Local MITM proxy for HTTP/HTTPS capture (hudsucker).
- Start/Stop tracing session by applying/removing emulator proxy through ADB.
- Prepare CA certificate installation into emulator (push + installer intent).
- Captured request list and detail panel (request/response, headers, cookies, params, timing) in memory.
- Interception mode (pending queue, edit, forward, drop, timeout fallback).
- Request export to cURL + copy actions in detail tabs.
- Config/preferences panel (ES/EN, light/dark, font size, sensitive-data masking).
- Sort + filter controls for high-volume sessions.

This seed currently covers `SPIKE-01` to `SPIKE-04`.

## Prerequisites

- macOS
- Xcode Command Line Tools or Xcode installed
- Rust toolchain (`rustup`, `cargo`, `rustc`)
- Node.js `20.19+` or `22.12+` recommended (project can warn if version is out of range)
- Android Platform Tools (`adb`) in PATH
- Android Emulator running

## Run in development

```bash
npm install
npm run tauri dev
```

## Build desktop executable

```bash
npm run tauri build
```

The bundle output is generated under:

- `src-tauri/target/release/bundle/`

## Backend commands exposed to UI

- `get_adb_status`
- `get_session_state`
- `get_captured_requests`
- `clear_captured_requests`
- `get_interception_state`
- `configure_interception`
- `decide_intercept_request`
- `prepare_certificate_install`
- `start_tracing`
- `stop_tracing`

## Notes

- Host OS proxy is not modified.
- Only emulator proxy settings are changed.
- Data is kept local in memory only (no persistence of captured traffic).
- No external backend integration is used to send captured requests/responses.
- HTTPS capture requires the local CA certificate to be trusted in the emulator.
- Apps with TLS pinning may still reject interception even with trusted CA.
- ADB lookup fallback paths: `/opt/homebrew/bin/adb`, `/opt/local/bin/adb`, `/usr/local/bin/adb`, `/usr/bin/adb`.
- Optional override: set `ADB_PATH` to force a specific adb binary.

## Spike docs

- `docs/spike-05-tls-pinning-trust-model.md`
- `docs/spike-06-performance-baseline.md`

## MVP docs

- `docs/mvp-01-configuracion-preferencias.md`
- `docs/mvp-05-sesiones-efimeras-privacidad.md`
- `docs/mvp-07-arquitectura-modular.md`
- `docs/mvp-08-testing-strategy.md`
- `docs/mvp-09-packaging-guide.md`
- `docs/mvp-15-guardrails-interceptacion.md`
