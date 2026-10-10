# Chess Football — mandatory merge gate

The stable GitHub Actions check is **`Football · required visual gate`** in
[`chess-football-godot-poc.yml`](../../.github/workflows/chess-football-godot-poc.yml).
Its workflow runs on every pull request so the check never disappears because
of `pull_request.paths`.

## Behavior

- When a PR changes `games/chess-football-godot/**`, the canonical football art
  scripts, the Godot bundle publisher or the Football CI workflow, run **both**
  the Godot validation (including the camera/tonal capture) and real Chromium
  WebAssembly boot. Both must succeed.
- For unrelated PRs, the lightweight changed-file detector succeeds and
  Godot/Chromium are **skipped**; the stable final check is successful.
- On diff-discovery errors, truncated PR lists, cancelled, skipped, pending or
  failing Football tests, the final gate **fails closed**.

## Regla operativa de repositorio (sin exigir cambios de ruleset)

Por decisión de producto, este contrato se aplica como **regla explícita de
trabajo del repositorio**, en lugar de solicitar ahora nuevos checks obligatorios
en `Protect main`. El workflow y su check `Football · required visual gate`
se conservan porque ayudan a verificar las iteraciones, pero **si GitHub no
los exige en su ruleset, un fallo o un job pendiente NO bloquea por sí mismo
el merge**.

Para toda PR que afecte a Football, incluyendo scripts de arte canónico,
export o su workflow:

1. Empezar en **Draft**; no usar automerge prematuro ni fusionar manualmente
   mientras falten Godot `validate`, capturas visuales o arranque Chromium.
2. Esperar el resultado **success** del check estable
   `Football · required visual gate` sobre el SHA exacto que se fusionará.
   Si falla, se cancela, queda omitido inesperadamente o no aparece,
   corregir e iterar en la **misma PR**.
3. Inspeccionar los PNG de comparación y juzgar tamaño aparente,
   luminosidad entre orientaciones, alineación de botas/sombras y ausencia
   de regresión visual. No basta con un test verde.
4. Sólo entonces pasar a **Ready** y permitir el merge/automerge; comprobar
   el resultado después de fusionar. Un commit posterior invalida la revisión
   anterior y obliga a mirar los checks del nuevo SHA.
5. Una PR ajena a Football debe recibir el gate verde sin ejecutar Godot ni
   Chromium; no castigar otros productos por este criterio visual.

Estas instrucciones complementan
[`AGENTS.md`](../../AGENTS.md) y
[`docs/operations/chess-football-product.md`](../operations/chess-football-product.md).
**No afirmar protección automática del branch** donde no existe. La
incidencia histórica #5320 motivó el workflow, pero la preferencia actual
es calidad operacional documentada y no aumentar las condiciones del ruleset.
