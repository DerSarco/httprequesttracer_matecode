# SPIKE-06 - Baseline de estabilidad y performance

Fecha: 2026-02-19

## Estado actual

- Backend Rust compila y corre con proxy MITM local.
- Bundle macOS `.app` generado correctamente.
- En este entorno, el emulador aparece como `offline`, por lo que no se pudo ejecutar una sesion real de 5 minutos desde Android.

## Riesgos identificados

- Si el volumen es alto, la tabla de UI puede degradarse por render completo de filas.
- El buffer en memoria (cap de 1500 requests) evita crecimiento infinito, pero puede perder historial en sesiones largas.
- Dependencia de ADB estable (daemon/dispositivo) para experiencia confiable.

## Mitigaciones implementadas

- Buffer circular en memoria para capturas (tope fijo).
- Polling moderado de requests en UI (1.2s).
- Stop con shutdown del proxy y limpieza del proxy en emulador.

## Plan de medicion reproducible (pendiente ejecutar con emulador online)

1. Escenario:
   - Emulador Android online.
   - Tracing activo por 5 minutos.
   - Navegacion en app de prueba con endpoints HTTP/HTTPS.
2. Metricas:
   - Requests totales capturadas.
   - Requests/seg promedio.
   - p50/p95 de `durationMs` capturada.
   - RSS del proceso app cada 30s.
3. Criterios iniciales:
   - UI usable sin bloqueos perceptibles.
   - Memoria estable sin crecimiento sin limite.
   - Stop/rollback sin dejar proxy residual.

## Comandos sugeridos para corrida local

- Arrancar app:
  - `npm run tauri dev`
- Verificar ADB:
  - `adb devices`
- Build release:
  - `npm run tauri build`
