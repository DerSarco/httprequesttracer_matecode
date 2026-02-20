# SPIKE-06 - Baseline de estabilidad y performance

Fecha: 2026-02-19

## Estado actual

- Backend Rust compila y corre con proxy MITM local.
- Bundle macOS `.app` generado correctamente.
- Se ejecuto una corrida base de 5 minutos del proceso desktop con muestreo cada 10s.

## Resultado de corrida (2026-02-19)

- Proceso medido: `http-request-tracer` (bundle macOS local).
- Ventana temporal: 21:21:06 a 21:25:57 (5 minutos).
- Archivo de evidencia: `/tmp/spike06_metrics_20260219_212106.csv`.

Resumen:

- `samples=30`
- `cpu_avg=0.07%`
- `cpu_max=2.10%`
- `rss_avg_kb=35105` (~34.3 MB)
- `rss_max_kb=50448` (~49.3 MB)
- `vsz_avg_kb=440284557`
- `vsz_max_kb=440292304`

Conclusiones de baseline:

- Consumo de CPU en reposo/carga ligera muy bajo.
- Memoria RSS estable sin crecimiento progresivo en la ventana medida.
- No se observaron sintomas de inestabilidad del proceso durante la corrida.

## Riesgos identificados

- Si el volumen es alto, la tabla de UI puede degradarse por render completo de filas.
- El buffer en memoria (cap de 1500 requests) evita crecimiento infinito, pero puede perder historial en sesiones largas.
- Dependencia de ADB estable (daemon/dispositivo) para experiencia confiable.

## Mitigaciones implementadas

- Buffer circular en memoria para capturas (tope fijo).
- Polling moderado de requests en UI (1.2s).
- Stop con shutdown del proxy y limpieza del proxy en emulador.

## Plan de medicion reproducible (siguiente iteracion con carga alta)

1. Escenario:
   - Emulador Android online con trafico sostenido.
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
