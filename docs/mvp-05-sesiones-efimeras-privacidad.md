# MVP-05: Sesiones efimeras y privacidad local

## Objetivo

Asegurar que el tracer MVP funciona solo en local y que los datos de trafico capturado no se persisten despues de cerrar la aplicacion.

## Implementacion actual

1. Buffer circular en memoria
- El store de capturas usa un buffer circular en memoria (`CaptureStore` en `src-tauri/src/tracer/mitm.rs`).
- Limite por defecto: `1_500` requests.
- Al superar el limite, se elimina la captura mas antigua y se conserva la ventana mas reciente.

2. Limpieza manual de sesion
- La UI expone el boton `Clear Session`.
- Este boton invoca `clear_captured_requests` y limpia inmediatamente la tabla y el panel de detalle.

3. Sin persistencia de trafico en disco
- No existe escritura de requests/responses capturadas en archivos o base de datos.
- El estado vive en memoria del proceso Tauri (`AppState`).
- Al cerrar la app, el proceso termina y la memoria se libera.

4. Sin envio remoto de datos capturados
- No hay integracion con backend propio, API externa ni upload de trafico.
- La app solo:
  - habla con `adb` local,
  - corre un proxy local,
  - renderiza datos en la UI local.

5. Revision de logs
- El proyecto no registra bodies capturados en logs de aplicacion.
- Los errores expuestos en UI se limitan a mensajes operativos (ADB/proxy/certificados).

## Checklist MVP-05 (estado)

- [x] Almacenamiento en memoria (buffer circular).
- [x] Accion `Clear session`.
- [x] Confirmacion de no envio remoto en documentacion.
- [x] Revision de logs para evitar datos sensibles persistentes.

