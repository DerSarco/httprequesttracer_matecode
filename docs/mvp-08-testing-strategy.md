# MVP-08 - Estrategia de tests y smoke

## Cobertura automatizada base

1. Frontend (`src/App.test.tsx`, `src/App.additional.test.tsx`)
- Helpers de formato y normalizacion de errores.
- Flujo Start/Stop basico.
- Render de detalle request/response.
- Filtros combinables + limpiar filtros.
- Limpieza de sesion (`Clear Session`).
- Smoke UI adicional para configuracion de interceptacion, export cURL, install flow y salida controlada.

2. Shared modules
- `src/shared/utils/requestHelpers.test.ts`: parsing/canonizacion de headers, params, cookies, filtros, masking y export cURL.
- `src/shared/api/tauriClient.test.ts`: contratos de comandos Tauri.
- `src/shared/preferences.test.ts`: defaults/persistencia robusta.
- `src/shared/utils/clipboard.test.ts`: clipboard nativo y fallback.

3. Backend (`src-tauri/src/tracer/mitm.rs`, `src-tauri/src/tracer/cert.rs`)
- Comportamiento de buffer circular de captura.
- Limpieza de store en memoria.
- Clamp de timeout y normalizacion de reglas de interceptacion.
- Timeout/fallback de requests interceptadas y limite de cola pendiente.
- Truncado seguro de payload editable + fallback para body binario/encoding invalido.
- Identidad visible del certificado Matecode y path de instalacion consistente.

## Smoke test manual recomendado

1. `npm run tauri dev`
2. Confirmar estado `ADB missing` o `No emulator` segun entorno.
3. Con emulador online, ejecutar:
- `Prepare CA Install`
- Instalar CA en emulador y marcar confianza.
- `Start Tracing`
4. Generar trafico HTTP/HTTPS desde app de prueba.
5. Validar en UI:
- Tabla en tiempo real.
- Filtros/sort.
- Tabs de detalle y copiado.
- Export cURL.
6. Interceptacion:
- Activar modo interceptacion.
- Reenviar una request con cambios.
- Descartar otra request.
7. `Stop Tracing` y confirmar rollback de proxy en emulador.

## CI/local

- CI: `.github/workflows/ci.yml` ejecuta `npm test` y `cargo test`.
- Local recomendado:
- `npm test -- --run`
- `cargo test`
- `npm run tauri build`
