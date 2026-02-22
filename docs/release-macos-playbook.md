# Release Playbook (macOS only)

## Scope de esta primera release

- Plataforma: macOS.
- Arquitecturas: `Apple Silicon (arm64)` y `Intel (x64)`.
- Canal recomendado inicial: `beta` (`v0.1.0-beta.N`) con release en modo draft hasta finalizar QA.

## Prerrequisitos

1. Tener `master` actualizado y estable.
2. Versiones sincronizadas en:
   - `package.json`
   - `src-tauri/Cargo.toml`
   - `src-tauri/tauri.conf.json`
3. Pipeline de CI en verde.

## Flujo de release

1. Crear rama de release desde `master`:

```bash
git checkout master
git pull --ff-only origin master
git checkout -b release/v0.1.0
git push -u origin release/v0.1.0
```

2. Esperar workflow:
   - GitHub Actions `Release From Branch`.
   - Genera/actualiza un release draft y sube zips macOS.

3. Validar artefactos:
   - `HTTP-Request-Tracer-0.1.0-macos-aarch64.zip`
   - `HTTP-Request-Tracer-0.1.0-macos-x64.zip`

4. Ejecutar smoke QA en ambos targets (si aplica):
   - App abre correctamente.
   - `Refresh` detecta ADB y emulador.
   - `Prepare CA Install` copia certificado y abre pantalla objetivo.
   - `Start Tracing` captura requests.
   - `Stop Tracing` revierte proxy (`:0`).
   - `Cmd + Q` muestra confirmacion y guia de cleanup.

5. Publicar release:
   - Revisar notas en draft (plantilla en `.github/release-notes-template.md`).
   - Completar `Known limitations` reales de la version.
   - Presionar `Publish release` en GitHub.

## Criterio de hotfix

- Si aparece bug bloqueante post-release:
  1. Crear branch `hotfix/<descripcion>` desde `master`.
  2. Merge a `master`.
  3. Crear nueva rama `release/vX.Y.Z+1`.
  4. Repetir este playbook.
