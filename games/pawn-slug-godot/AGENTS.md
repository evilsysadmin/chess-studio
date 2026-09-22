# Pawn Slug Godot — scoped AGENTS

Este archivo complementa el `AGENTS.md` raíz para `games/pawn-slug-godot/`.

Lee siempre:

- `docs/pawnslug-sprites.md`;
- `skills/godot-spritesheets/SKILL.md`;
- `skills/pawn-slug-runtime-smoke/SKILL.md`;
- `scripts/art/README.md`.

## Límites

- Pawn Slug es 2D puro. Las herramientas de authoring 3D no forman parte de sprites runtime.
- Godot posee movimiento, combate, colisiones, spawn safety, selección de animación y projectile/muzzle origins. React sólo hospeda/orquesta el export.
- La escala corporal canónica de Matthias es común a todas las armas. Un arma larga nunca puede encoger al actor para caber: si no cabe, el build falla.
- Cambiar de arma debe ser un swap de recursos ya calentados; la carga foreground es sólo red de seguridad excepcional.
- Mientras un banco nuevo carga/falla, nunca enseñes el sprite del arma anterior como si fuera el correcto.

## Sprite/runtime acceptance

Un cambio de sprites no termina con slicing correcto. Requiere gates offline, Godot headless y captura runtime real. Revisa todas las armas afectadas y, como mínimo, idle, locomoción, run+fire, direccionales, crouch, hurt/die y transiciones relevantes.

El `0..7`/texto debajo del sprite, componentes huérfanos, armas duplicadas, jitter, escalas divergentes, halos y recortes son regresiones fail-closed.

## Enemigos

Los enemigos usan el mismo contrato técnico: frame source 2D, pack determinista, manifest, QA, Godot y artifact visual. Una posición runtime movida reemplaza cualquier spawn authored para colisión/targeting cuando el juego lo modele así.
