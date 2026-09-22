# Blender pipelines — scoped AGENTS

Este archivo complementa el `AGENTS.md` raíz para `scripts/blender/`.

Lee según el área:

- Home: `skills/home-blender/SKILL.md` y `skills/local-gpu-rendering/SKILL.md`;
- War Room v2: `docs/operations/war-room-blender-pipeline.md`, `docs/operations/war-room-visual-freeze.md` y `skills/local-gpu-rendering/SKILL.md`;
- R2/promoción: `docs/visual-assets-r2-flow.md`.

## Contrato

- Blender se usa para Home 3D, War Room v2 y assets 3D explícitos; nunca para sprites runtime de Pawn Slug.
- Preferir builders/scripts reproducibles sobre retoques GUI irrepetibles. Seeds, nombres de nodos y anchors consumidos por runtime deben ser estables.
- Cada iteración visual produce PNG de Blender y, cuando existe consumo en app, PNG runtime del GLB exacto. Uno no sustituye al otro.
- En local usa GPU real de extremo a extremo cuando esté disponible; confirma que Chromium no cayó a SwiftShader antes de sacar conclusiones de rendimiento/visual.
- La War Room v1 permanece restaurable y aislada mientras v2 no esté validada en visual, móvil, rendimiento y runtime.
- Board/playability mandan sobre decoración. En Home, hotspots y destinos deben seguir alineados con la escena real.
- Publicar un GLB en R2 no equivale a promocionarlo: el manifest debe apuntar al hash exacto y la app debe demostrar que lo cargó.
- No aceptes una iteración sólo porque Blender acabó o CI está verde; revisa artifacts y corrige regresiones antes de integrar.
