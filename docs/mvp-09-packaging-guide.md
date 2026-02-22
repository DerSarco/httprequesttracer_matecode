# MVP-09 - Packaging macOS (.app) y guia para testers

## Build ejecutable

```bash
npm install
npm run tauri build
```

Salida principal:

- `src-tauri/target/release/bundle/macos/HTTP Request Tracer.app`

## Prerequisitos en maquina limpia

1. macOS con permisos de ejecucion de apps locales.
2. Android Platform Tools (`adb`) instalado y en PATH.
3. Al menos un emulador Android funcional.
4. OpenSSL disponible (requerido para generar CA local).

## Flujo de instalacion para testers

1. Copiar `HTTP Request Tracer.app` a `Applications`.
2. Abrir la app (si Gatekeeper bloquea, permitir desde Security & Privacy).
3. Verificar `ADB disponible` en panel inicial.
4. Ejecutar `Prepare CA Install`.
5. Instalar certificado CA en el emulador.
6. Iniciar tracing y validar captura en tabla.

## Checklist rapido de validacion

- La app abre sin requerir entorno de desarrollo.
- `Refresh` detecta ADB y emuladores.
- `Start Tracing` aplica proxy y captura requests.
- `Stop Tracing` revierte proxy del emulador.

## Release desde GitHub (macOS)

El workflow de release esta en:

- `.github/workflows/release-from-branch.yml`

Reglas actuales:

- Se dispara al pushear una rama `release/vX.Y.Z` (o manual con `workflow_dispatch`).
- Valida que la version coincida en:
  - `package.json`
  - `src-tauri/Cargo.toml`
  - `src-tauri/tauri.conf.json`
- Genera release draft en GitHub y sube artefactos:
  - `HTTP-Request-Tracer-<version>-macos-aarch64.zip`
  - `HTTP-Request-Tracer-<version>-macos-x64.zip`

Playbook operativo detallado:

- `docs/release-macos-playbook.md`
