# MVP-15 - Guardrails y seguridad para interceptacion

## Guardrails implementados

1. Timeout de decision
- Toda request interceptada tiene timeout configurable (1s a 120s).
- Fallback por defecto: reenviar request original para evitar bloqueo indefinido.

2. Limites de payload
- Limite de body editable/interceptable en memoria: 256 KB.
- Si supera limite, se recorta para edicion segura y se actualiza `content-length`.

3. Manejo de payload no textual
- Si no es textual/decodificable, la UI muestra mensaje claro de fallback.
- Se evita render de binario crudo en panel de detalle.

4. Politica de datos sensibles
- Vista de headers/cookies sensible con modo oculto por defecto.
- Valores sensibles (Authorization/Cookie/tokens) se enmascaran en UI.
- Export cURL puede excluir secretos cuando `showSensitiveData` esta desactivado.

5. Privacidad
- Sesion en memoria (buffer circular), sin envio a backend externo.
- `Clear Session` elimina capturas activas en UI/backend.

## Cobertura automatizada relevante

- Frontend:
- masking de headers/cookies y export cURL sin secretos por defecto.
- smoke de configuracion de reglas, edicion y reenvio de request interceptada.
- Backend:
- timeout/fallback de interceptacion sin bloqueo indefinido.
- limite de cola pendiente para sesiones largas.
- truncado seguro de payload editable y fallback de preview para binario/encoding invalido.

## Riesgos conocidos

- TLS pinning estricto puede impedir MITM aun con CA confiada.
- Interceptacion de payload muy grande puede truncar body editable.

## Operacion recomendada

- Usar interceptacion solo en entornos QA/debug.
- Mantener `showSensitiveData` en modo oculto salvo necesidad puntual.
- Configurar timeout conservador (10s-20s) para evitar friccion.
