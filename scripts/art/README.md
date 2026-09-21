# Pawn Slug art tooling handoff

La autoridad canónica para sprites runtime de Pawn Slug es [`docs/pawnslug-sprites.md`](../../docs/pawnslug-sprites.md), complementada por [`skills/godot-spritesheets/SKILL.md`](../../skills/godot-spritesheets/SKILL.md).

## Regla de autoridad

- Pawn Slug sprites runtime son 2D puros.
- Una salida generada es un **candidato**, no un asset aceptado.
- El objetivo de migración es un único compiler/validator Sprite Forge data-driven; no crear otra familia `pack_*_vNN.py` para nuevas iteraciones.
- Los packers/validators versionados existentes son historia/migración hasta que sus bancos se absorban en Sprite Forge.
- CI debe reconstruir y verificar; el authoring/regeneración ocurre antes de PR.

## Master canónico histórico

El master aprobado de Matthias sigue siendo inmutable fuera de Git mientras dure la migración. Su logical R2 ID es `pawnSlug.matthias.canonicalMaster` y su SHA-256 es `9c21264274777d012a2941073f6cbae94df090db0459624e6031207c0a288c5f`.

El flujo legacy de derivación de pistol puede reproducirse explícitamente con:

```bash
python3 scripts/art/derive_pawn_slug_canonical.py \
  --master /path/to/matthias_canonical_sprite_sheet_v1.png
```

Este derivador verifica el SHA antes y después y no retoca el master. **Sus dimensiones/celdas legacy no definen el contrato global actual de sprites.** No copiar valores históricos de 192 px/768x960 a nuevos bancos strict.

## Runtime actual durante la migración

Los bancos strict modernos de Godot usan sus manifests/contratos específicos hasta ser absorbidos por Sprite Forge. Otras armas siguen resolviéndose mediante los logical IDs de R2 documentados en `frontend/src/assets/pawnSlug/README.md` y `docs/visual-assets-r2-flow.md`.

Compatibilidad histórica, crops y conversiones pertenecen a la trituradora/migradores. No añadir nuevas rutas de fallback o repack al game loop.
