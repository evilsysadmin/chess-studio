# Resiliencia y modos degradados

Este contrato fija cómo debe comportarse Chess Studio cuando una dependencia, almacenamiento, red, audio, IA o renderer no está disponible.

## Principio

Fallar de forma explícita y recuperable es mejor que fabricar una falsa sensación de éxito.

Un fallback puede reducir calidad o funcionalidad, pero no puede cambiar silenciosamente la autoridad del estado ni afirmar que una operación persistió cuando no lo hizo.

## Persistencia local

- Web Storage bloqueado, SecurityError o QuotaExceeded degrada mediante la capa segura existente; no debe tumbar la app.
- Un write/delete fallido sigue siendo autoritativo dentro de la pestaña si la capa segura lo modela así; un valor nativo stale no puede reaparecer después y deshacer la intención del usuario.
- Migraciones son versionadas y no degradan/limpian datos de una versión futura desconocida.
- Un fallback in-memory es temporal y scoped al documento/sesión; nunca se presenta como persistencia cross-session.

## Red y backend

- Reintentos sólo son automáticos cuando la operación es idempotente o lleva idempotency/CAS suficiente.
- Reconnect reconcilia con la autoridad server-side; no crea dos sesiones/juegos/runs divergentes.
- Una respuesta stale no pisa estado más nuevo.
- Un fallo inesperado de servidor no se relabela como error de regla/validación del usuario.

## Providers / IA / engines

- Si un provider externo falla, el estado de partida no se corrompe.
- No aceptar puzzles, coaching, intel o decisiones críticas mediante una heurística más débil sólo para que el flujo 'continúe'.
- Cuando el gate objetivo es obligatorio, el artefacto/resultado queda pending/quarantined hasta poder validarse.

## Audio y capacidades del navegador

- Ausencia de Web Audio/autoplay permission es una capacidad esperable, no una excepción fatal.
- Ajustar volumen, ducking o detener voz no debe crear un AudioContext sólo para poder operar.
- Fallback sin audio conserva gameplay y UI funcional.

## Visual / renderer

- Un renderer premium puede degradar efectos no esenciales según capability/performance.
- La degradación no cambia reglas, input semántico, legalidad, clocks ni estado persistente.
- Fallback 2D/lite debe seguir siendo funcional cuando exista como contrato, pero no puede ocultar una regresión de la ruta premium en dispositivos que deberían soportarla.

## Mensajes al usuario

- Distinguir 'no guardado', 'sin conexión', 'provider no disponible' y 'acción inválida'.
- No mostrar 'Guardado' si no existe confirmación del snapshot/persistencia que el contrato exige.
- Evitar detalles internos/secretos en errores visibles.

## Recovery

Recovery elige una fuente autoritativa explícita y documentada. Snapshots/caches sólo ayudan a reconstruir; no compiten indefinidamente con backend/domain state.

## Acceptance

Cuando se añade un fallback:
- probar la dependencia ausente;
- probar recuperación posterior;
- probar retry/duplicado;
- comprobar que no cambia el owner del estado;
- comprobar que no se afirma éxito falso;
- comprobar que no quedan side effects duplicados tras remount/reconnect.
