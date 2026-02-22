# HTTP Request Tracer {{TAG}} (macOS)

## Build info
- Version: `{{VERSION}}`
- Release date: `{{DATE}}`
- Platform: macOS only (`Apple Silicon` + `Intel`)

## What is included
- Desktop app bundle (`.app`) packaged as zip for both architectures.
- ADB-based local proxy tracing flow for Android emulators.
- Request/response inspection with current MVP UX improvements.

## Install
1. Download the zip that matches your Mac architecture.
2. Unzip and move `HTTP Request Tracer.app` to `Applications`.
3. Open the app and allow execution in macOS Security settings if prompted.

## Known limitations
- Certificate install in Android emulator still requires user interaction.
- Project is in MVP stage; report edge cases in Issues.

## Validation checklist
- App starts and detects ADB + emulator.
- Start/stop tracing works and proxy reset is applied on stop.
- Request and response bodies render when textual.
