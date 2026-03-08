# SPIKE-05 - TLS pinning y trust model

Fecha: 2026-02-19

## Resumen

El tracer usa MITM local con una CA propia (`Matecode HTTP Tracer Local CA`).
Para inspeccion HTTPS, el cliente Android debe confiar esa CA.

## Casos soportados

- Trafico HTTP sin cifrado.
- Trafico HTTPS de apps que confian en el trust store del sistema/usuario donde se instala la CA.
- Inspeccion local desde emulador Android con proxy configurado via ADB.

## Casos no soportados o parcialmente soportados

- Apps con TLS pinning estricto:
  - Validan certificado/clave publica esperada.
  - Rechazan certificados MITM aunque la CA local este instalada.
- Apps que ignoran user CAs por Network Security Config o politicas propias.
- Tramas protegidas fuera de HTTP/S (canales propietarios o cifrado app-layer).

## Implicancias practicas para el MVP

- El flujo funciona bien para QA/debug en apps internas o apps de prueba sin pinning estricto.
- En apps productivas de terceros con pinning, la captura HTTPS puede fallar.
- El producto debe comunicar esto en UI y docs para evitar expectativas incorrectas.

## Recomendaciones de UX/documentacion

- Mostrar mensaje claro:
  - "HTTPS requiere instalar y confiar la CA local en el emulador."
  - "La identidad visible del certificado es Matecode; eso no reemplaza el paso de trust."
  - "Apps con TLS pinning pueden no ser interceptables."
- Agregar checklist guiado en onboarding:
  1. Preparar e instalar CA.
  2. Iniciar tracing.
  3. Validar con request conocida.
- Exponer errores ADB/cert de forma accionable en pantalla.
