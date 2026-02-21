# MVP-07 - Arquitectura modular para escalado multi-OS

## Objetivo

Separar responsabilidades para facilitar evolucion en macOS/Linux/Windows sin refactor masivo.

## Modulos definidos

1. `core-proxy` (backend Rust)
- Ubicacion: `src-tauri/src/tracer/core_proxy.rs` y `src-tauri/src/tracer/mitm.rs`.
- Responsabilidad: captura HTTP/HTTPS, parsing de request/response, interceptacion, reenvio, guardrails de payload.
- Contratos principales:
  - `start_proxy(...)`
  - `CaptureStore` / `CapturedExchange`
  - `InterceptionController` / `InterceptionSnapshot`

2. `adb-controller` (backend Rust)
- Ubicacion: `src-tauri/src/tracer/adb_controller.rs` y `src-tauri/src/tracer/adb.rs`.
- Responsabilidad: descubrir ADB, validar emulador, set/clear proxy, operaciones con certificado en emulador.
- Contratos principales:
  - `get_adb_status()`
  - `ensure_emulator_online(...)`
  - `set_emulator_proxy(...)` / `clear_emulator_proxy(...)`

3. `ui-shell` (frontend React)
- Ubicacion: `src/App.tsx`, `src/App.css`.
- Responsabilidad: estados operativos, tabla, detalle, filtros/sort, configuracion, export cURL, bandeja de interceptacion y editor.
- Contratos principales: comandos Tauri expuestos por `src-tauri/src/lib.rs`.

## Contratos entre modulos

- `ui-shell` no interactua directo con ADB/proxy: consume comandos Tauri tipados.
- `adb-controller` no conoce detalles de render/UI.
- `core-proxy` no depende de plataforma grafica ni APIs de macOS.
- `lib.rs` funciona como capa de orquestacion (adapter) entre UI y modulos backend.

## Portabilidad

- La captura/interceptacion vive en Rust puro (reutilizable cross-OS).
- La dependencia especifica del host queda acotada a empaquetado y requisitos de entorno (ADB, openssl, toolchain).

