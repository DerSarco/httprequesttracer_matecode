# MVP-01 - Apartado de configuracion y preferencias de usuario

Fecha: 2026-02-20
Milestone: MVP

## Objetivo

Agregar una seccion de configuracion para centralizar preferencias de usuario y habilitar personalizacion de la aplicacion.

## Alcance inicial

- Modo visual:
  - Claro/Oscuro (conmutador manual).
- Accesibilidad y lectura:
  - Tamano de fuente configurable (por ejemplo: chico/medio/grande).
- Internacionalizacion:
  - Selector de idioma para la UI (base inicial: ES/EN).
- Escalabilidad:
  - Estructura preparada para sumar nuevas preferencias sin refactors grandes.

## Criterios de aceptacion

1. Existe una pantalla o panel de "Configuracion" accesible desde la UI principal.
2. El cambio de tema (claro/oscuro) se aplica en toda la app sin recargar.
3. El tamano de fuente seleccionado impacta componentes principales y se mantiene consistente.
4. El idioma seleccionado cambia textos visibles de la UI (al menos en flujo principal).
5. Las preferencias se persisten localmente y se restauran al reiniciar la app.
6. Se define un valor default seguro para cada preferencia.

## Consideraciones tecnicas

- Definir un modelo de `UserPreferences` tipado en frontend.
- Persistencia local (por ejemplo, almacenamiento local) con versionado simple del schema.
- Centralizar el estado de preferencias para evitar duplicacion.
- Incluir estrategia de fallback para keys de traduccion faltantes.

## Notas

- Esta tarea habilita futuras preferencias (notificaciones, formato de fecha, densidad visual, atajos, etc.).
