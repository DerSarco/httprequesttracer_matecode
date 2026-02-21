# MVP-08 - Estrategia de tests y smoke

## Cobertura automatizada base

1. Frontend (`src/App.test.tsx`)
- Helpers de formato y normalizacion de errores.
- Flujo Start/Stop basico.
- Render de detalle request/response.
- Filtros combinables + limpiar filtros.
- Limpieza de sesion (`Clear Session`).

2. Backend (`src-tauri/src/tracer/mitm.rs`)
- Comportamiento de buffer circular de captura.
- Limpieza de store en memoria.

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

- CI: `.github/workflows/ci.yml` ejecuta checks de frontend.
- Local recomendado:
- `npm test -- --run`
- `cargo test`
- `npm run tauri build`

