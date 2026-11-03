# Pawn Action — extracción desde Chess Studio

**Estado: migración en curso; no se ha efectuado el cutover de producción.**

El juego anteriormente denominado **Pawn Slug** pasa a desarrollarse como **Pawn Action** en [evilsysadmin/pawn-action](https://github.com/evilsysadmin/pawn-action), empezando por [la PR de extracción #1](https://github.com/evilsysadmin/pawn-action/pull/1).

## Autoridad de código

- Pawn Action posee el proyecto Godot 2D, combate, movimiento, IA de enemigos, cuatro mapas, sprites, contratos, herramientas de authoring y tests. Crear y evolucionar allí las nuevas funciones.
- Chess Studio deja de ser el destino para nuevas funciones de Pawn Action; conserva temporalmente `games/pawn-slug-godot/`, `scripts/pawn_slug_*`, sus workflows y el componente host únicamente para compatibilidad, comprobación y rollback.
- No retirar las copias ni el host mientras el nuevo Web export no pueda iniciarse desde una URL externa validada, con input real, continuidad y revisión visual satisfactoria.

## Contrato de compatibilidad y R2

- Mantener inicialmente el identificador `pawn-slug-godot` del bridge y los logical IDs / URLs R2. **El rebranding público no implica migrar ni borrar keys inmutables.**
- El pointer compartido `pawn-slug-godot/current.json` sigue gobernado por el publicador actual de Chess Studio hasta traspaso expreso. No autorizar doble publicador escribiendo ese alias.
- Conservar los objetos R2 activos y política de retención; proteger cualquier nuevo prefijo de Pawn Action antes de activar otro publicador.
- No migrar bases de datos, identidad, perfiles, secretos ni historial de usuarios de manera implícita.

## Criterios para finalizar el cutover

1. CI Godot / Web del repo nuevo verde sobre el SHA exacto (incluye parsers, gameplay, maps, test de sprites y export).
2. Prueba Web real con keyboard/touch, ready/exit bridge, cambio de armas, captura PNG en desktop y móvil, comparada con baseline aceptado.
3. Publisher R2 y rollback propios acreditados en el repo destino, con secretos y permisos limitados, sin dos writers concurrentes del mismo pointer.
4. URL independiente estable (Pages, Cloudflare u otra infraestructura revisada). Lab cambia de host embebido a enlace externo, preservando la navegación.
5. Solo después, retirar por PR pequeñas y verificables la fuente Godot y los workflows legacy. Mantener los recursos y referencias del bucket protegidos hasta que la retención pueda justificadamente retirarlos.

La PR de extracción es deliberadamente Draft hasta acreditar todas estas fases. Este documento **no** marca la migración como completada.
