# Art pipeline — scoped AGENTS

Este archivo complementa el `AGENTS.md` raíz para `scripts/art/`.

La autoridad detallada vive en `docs/pawnslug-sprites.md`, `skills/godot-spritesheets/SKILL.md` y `scripts/art/README.md`.

## Contrato

- Image generation produce candidatos/frames 2D, nunca el atlas runtime final.
- Flujo: source aprobado → frames atómicos → cuarentena/raw lint → normalización fail-closed → QA geométrica/temporal → pack determinista → manifest → Godot → artifacts de review → runtime/staging.
- Misma entrada + toolchain fijado debe producir la misma salida. No escondas aleatoriedad ni heurísticas que elijan silenciosamente "la que permite continuar".
- El actor conserva pivote, footline y escala corporal canónica entre armas. El footprint del arma no puede reducir al personaje.
- Detecta antes de normalizar texto/números, componentes huérfanos y contaminación de worksheet. Mantén el fixture de regresión `0..7`.
- Si sólo falla un frame, corrige/regenera ese frame; no destruyas una animación entera sin causa sistémica.
- Review humano queda ligado al hash del frame/asset. Cambiar bytes invalida el PASS previo.

## Disciplina operativa con artifacts

- Trabaja **local-first** con artifacts ya descargados/materializados. Si un ZIP/PNG/JSON de CI ya está en el sandbox, reutilízalo; no vuelvas a descargarlo desde GitHub.
- Evita descargar artifacts grandes completos para inspecciones que puedan resolverse con el material local. En especial, no encadenes ZIPs de decenas de MB ni logs completos de Actions durante iteraciones visuales.
- Usa GitHub en modo mínimo: metadata de PR, filenames, SHA y estado/check concreto; lee sólo el step/log fallido cuando haga falta.
- Prepara y valida localmente el fix y los PNG de review antes de escribir. Haz las mínimas escrituras posibles para commit/PR y después comprueba CI con consultas pequeñas y dirigidas.
- Para iteraciones visuales, conserva y revisa los PNG de evidencia localmente antes de promover el asset runtime.

## Publicación

PR valida y produce evidencia; no publica assets runtime finales. Tras merge, publicar objetos R2 inmutables/content-addressed, actualizar logical IDs y comprobar que staging consume exactamente ese objeto.
