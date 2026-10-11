# Chronicles · Atlas y campaña «El rey desaparecido»

**Estado: diseño de contenido; NO integrado en el runtime.** Se conserva la entrada actual de Swordhaven, las once definiciones canónicas de `backend-python/chronicles_maps/`, el generador de runs y las partidas guardadas. Estos nuevos mapas son un contrato de autoría para próximas PRs, no un selector jugable aún.

## Contrato de archivos
- `world.json`: única fuente del grafo de regiones, destinos, enlaces y gates narrativos.
- `maps/<id>.json`: **un fichero por localización**, con layout fijo de tiles, leyenda, posición inicial, portales con destinos recíprocos, puntos de interés y amenaza. Las cuadrículas son primera topología editable; requieren arte/QA antes de pasar a producción.
- `quests/main.json`: premisa, antagonista, actos, eventos únicos y tres resoluciones posibles.
- `quests/side.json`: encargos finitos vinculados al tema y a lugares reales.
- `scripts/validate_chronicles_campaign.py`: verificaciones automáticas de referencias, alcance, portales bidireccionales, objetivos y desenlaces.

No editar a mano los mirrors de `chronicles_maps/` para esta campaña. **Cuando se materialice como runtime**: generar manifiestos de área autoritativos en `backend-python/chronicles_maps/`, ejecutar `make chronicles-contracts` y preservar equivalencia Go/Python/frontend. El catálogo legacy de niveles de mazmorra no representa regiones geográficas.

## Mitología y misterio
El Silencio no mata: elimina el recuerdo de quienes existieron. Hace siglos el Primer Pacto distribuyó entre Corona, Abadía y ciudades la responsabilidad de mantenerlo sellado. El Rey halló el sello debilitado y se confinó voluntariamente en el Trono Bajo la Piedra; el Canciller Varren falsificó las órdenes de búsqueda y encargó una corona hueca con la que apropiarse del juramento. La Dama permanece en la Corte para evitar una guerra sucesoria y envía a Matthias a reunir pruebas y testigos. El Rey no es un villano, pero su decisión de ocultar la verdad ha causado sufrimiento.

## Estructura del mundo
Las seis regiones son Tierras de la Corona (origen y Corte), Marismas de Sal (voces y supervivientes), Litoral de Hollín (contrabando y campana), Montes de Escoria (forja de la corona falsa), Marcas del Norte (Primer Pacto) y Bajo la Corona (resolución). Los 24 lugares incluyen 6 asentamientos, 7 zonas exteriores, 10 mazmorras y una cámara final. Hay 27 enlaces bidireccionales.

Swordhaven es el pueblo inicial y su plaza actual es el primer punto concreto de integración. La Corte de Bronce será centro político, Vado de Sal lugar de curación y transporte, Puerto de Hollín mercado de rumores, Ascuafria centro de herrería, y Vigilia del Norte centro de estudios y juramentos. Las puertas de ciudad son zonas transitables, no menús de dashboards; posadas, templos y comerciantes se activarán contextualmente.

## Cadencia dramática
1. **El trono vacío:** un sobre sellado, la insignia del caballero y el libro de rutas adulterado. El jugador entiende que la desaparición fue encubierta.
2. **Voces bajo el agua:** dos de tres pistas independientes (testimonio, eco, campana) revelan que el Rey sigue vivo y bajo tierra.
3. **La Corona de Vidrio:** los documentos del norte prueban el pacto original; forja y espejo aportan pruebas alternativas sobre la falsificación.
4. **Las tres campanas:** restaurar el santuario y lograr apoyo de al menos dos de tres facciones. Las facciones dan consecuencias, no obligan a limpiar todo el mapa.
5. **El último turno:** encuentro con el Rey; elegir Corona Compartida (rescate y juramento colectivo), Última Guardia (continuidad del sello con sacrificio) o Juramento Roto (liberación con daño irreversible).

La exploración es libre desde temprano; sólo los accesos al santuario y al trono exigen pistas/rituales explícitos. Los gates usan **eventos verificables**, no el «nivel requerido». Las bandas de peligro son locales y no escalan 1:1 con el PJ; el jugador puede entrar en una región peligrosa y retirarse.

## Alcance y persistencia
- Primera fase jugable: Swordhaven ↔ Camino de los Estandartes ↔ Cripta ↔ Swordhaven, con misión, marcador de descubrimiento, guardado y regreso seguro.
- Fases siguientes: segunda ciudad, bosque, marismas y pistas; añadir regiones una a una sin exigir completar todas las mazmorras.
- Una transición tiene dos portales recíprocos y destino explícito; un portal cerrado debe indicar su condición, no esconder blockers invisibles.
- Eventos narrativos y recompensas idempotentes; checkpoint CAS/versionado de localización, entradas/visitas, decisiones y banderas de historia. XP/skills permanecen bajo el perfil compartido; no crear otra progresión por run.
- Restaurar guardados legacy sin reubicación automática. Un mundo nuevo usa campaign schema/version explícitos.
- Separación estricta de Chronicles frente a Tactics: pueden compartir perfil de PJ, nunca mapa narrativo, gates, world flags o deuda visual.
- Grillas compatibles con exploración por tiles; girar/leer/interactuar no consume tick enemigo. Iniciar combate congela la exploración y aplica AGI+1d8.
- Validar desktop/móvil, conexiones bidireccionales, bloqueos, F5, guardado cruzado, combate, legibilidad y PNG reales **antes** de promover mapas a gameplay.

## Runtime promotion of the authored world (candidate pipeline)

The source of truth remains `world.json` and `maps/<id>.json`. A new,
standard-library-only compiler in `runtime_manifests.py` produces
**candidate** manifests in the existing Chronicles runtime schema.

For the first reversible slice:

```bash
python3 -m chronicles_campaign.runtime_manifests swordhaven-square banner-road --write /tmp/chronicles-map-candidates
```

Run the command with `PYTHONPATH=backend-python` from repository root.
`swordhaven-square` becomes the new opt-in `swordhaven-campaign` runtime
identity: the historical `swordhaven-square` remains untouched for existing
runs. The new road remains `banner-road`. Only reciprocal exits whose two
areas have been selected are emitted. A legacy dungeon such as
`crypt-eight-squares` **cannot** be auto-compiled from the simplified atlas:
it requires a deliberate adapter preserving its tactical content.

The command without `--write` prints the candidate JSON; the write mode
uses exclusive creation and refuses to overwrite existing files. The generated
manifest is **not shipped automatically**. Promote selected, visually
accepted candidates into `backend-python/chronicles_maps/` only together
with the Go/frontend mirrors and refreshed cross-runtime corpora via
`make chronicles-contracts`; then update the opt-in entry route, test
checkpoints, and review real desktop/mobile gameplay PNGs.

## Estructura del juego: historia principal + side quests

**Chronicles es un tributo a Might and Magic III.** Ante cualquier duda de diseño (reglas, progresión, economía, botín, magia, interfaz), la referencia es cómo lo resolvía MM3, adaptado a este mundo. El equipo bueno no se compra en el pueblo inicial: se saquea en mazmorras, cae de enemigos o se vende en pueblos posteriores.

Chronicles no se divide en «libros» ni capítulos cerrados. Hay **una historia
principal** («El rey desaparecido», que arranca con el sobre de la Dama) y
**muchísimas side quests** repartidas por el mundo abierto: cada región,
pueblo o PNJ puede dar side quests opcionales, finitas y con recompensa
propia. El diario las separa en Historia (♛) y Side quest (◆). En textos de
juego y documentación se llaman «side quest», no «encargo secundario».

El sufijo `-first-book` de los ids de mapa (`swordhaven-first-book`,
`banner-road-first-book`, `rookwood-first-book`) es un nombre interno
histórico: se conserva porque las partidas guardadas y los checkpoints
referencian esos ids. No debe aparecer en textos del juego ni usarse como
concepto de diseño; los mapas nuevos no lo llevan.

## Side quest jugable: «Los nombres del bosque»

`names-in-wood` («Los nombres del bosque», `quests/side.json`) es la primera
side quest materializada: `rookwood-first-book` (wilderness) se abre
desde `banner-road-first-book` por una salida recíproca
(`to-banner-road-rookwood` ↔ `to-rookwood-banner-road`). Edda da el encargo,
tres placas `rookwood-name-plaque` aparecen sólo con la quest activa (una tras
un sabueso de hueso opcional) y el Roble de los Nombres paga 15 oro mediante
`claim-reward` (`rookwood:names-in-wood:v1`, una vez por run, F5/CAS-safe).
El atlas sigue siendo la fuente de diseño; el manifiesto de runtime se edita en
`backend-python/chronicles_maps/` y se sincroniza con `make chronicles-contracts`.

## Side quests de Swordhaven

- **Bandidos del Camino** (`road-bandits`): la da el sargento Brask en el cuartel (4,6). Hay que derrotar al bandido desertor (`banner-road-deserter`, `road-bandit`) y a Garrah, jefe de los desertores (`banner-road-bandit-captain`, `bandit-captain`), en el Camino de los Estandartes. Las flags de derrota habilitan la entrega en el cuartel, que paga 12 oro una sola vez (`swordhaven:road-bandits:v1`).
- **Seda para las vendas** (`weaver-silk`): la da la sacerdotisa Ilse en el templo (14,6). La tejedora de la hondonada de Rookwood (`rookwood-weaver`, `weaver-spider`) suelta `weaver-silk` al morir. La entrega en el templo consume la seda, paga 8 oro (`swordhaven:weaver-silk:v1`) y cura a la compañía.

Los tres enemigos nuevos son opcionales y en primera persona se dibujan como billboards 2.5D generados con SpriteCook. En Tactics usan un modelo 3D procedural equivalente.

## Hilo principal en el mundo abierto (estructura MM3)

Regla de producto: **nunca «¿y ahora qué?»**. Desde el primer minuto hay una
quest de Historia activa (♛) cuyo objetivo nombra a una persona o un lugar
concreto. Cada pueblo tiene quien da el siguiente paso de la Historia y dos
o tres side quests (◆). Explorar siempre suma (oro, botín, XP, rumores),
pero nunca es la única pista. Cada paso de la Historia paga oro y XP a toda
la compañía (efecto `award-xp` dentro de `claim-reward`, una vez por run).

La Historia se llama `lost-king` («El rey desaparecido») y avanza por etapas
con `advance-quest`. Como en MM3, la Historia lleva de pueblo en pueblo y
cada pueblo tiene su mazmorra; las mazmorras históricas del catálogo se
reaprovechan como mazmorra del pueblo que les toque.

### Acto I · El trono vacío (Swordhaven y alrededores) — materializado
1. **Llegada** (`arrivalAction` de `swordhaven-first-book`): la carta de la
   Dama abre la Historia. Objetivo: preséntate al alcalde Aldric en el
   ayuntamiento (puerta en (11,10), al sur de la fuente).
2. **El alcalde** te da la llave de la reja y el primer trabajo: limpiar las
   **Alcantarillas de Swordhaven** (`swordhaven-sewers`, la mazmorra del
   pueblo; reja en (13,13)). También señala a Brask, Ilse y el tablón.
3. **Alcantarillas**: ratas de cloaca, arañas y el contrabandista Tobías. Hay
   que cerrar la compuerta del desagüe y acabar con Tobías, que suelta el
   **libro de contrabando**: un carro con el sello de la Dama salió por el
   Camino y Garrah lo asaltó. El alcalde paga 25 oro y 40 XP por cabeza.
4. **Garrah** (Camino de los Estandartes; se cruza con la side quest de
   Brask) suelta la **hoja de ruta adulterada**.
5. **Informe al alcalde**: la hoja de ruta prueba que alguien desvió a los
   caballeros hacia las Marismas de Sal. 30 oro y 60 XP por cabeza. Objetivo
   siguiente: viajar a Vado de Sal.

### Siguientes tramos (diseño, no materializado)
| Tramo | Pueblo | Quién mueve la Historia | Mazmorra del pueblo | Pista |
| --- | --- | --- | --- | --- |
| Acto II | Vado de Sal (Marismas de Sal) | la barquera Nela | Cisterna de los Ecos (`echo-cistern`) | testimonio de los supervivientes |
| Acto II | Puerto de Hollín (Litoral) | el campanero mudo | Torre de la Campana Hueca (`hollow-bell-tower`) | el eco de la campana |
| Acto III | Ascuafría (Montes de Escoria) | la maestra fundidora | Fundición de Hierro (`iron-foundry`) | molde de la corona hueca |
| Acto III | Vigilia del Norte (Marcas) | el archivero ciego | Archivo del Rey Ciego (`blind-king-archive`) | el Primer Pacto |
| Acto IV | Corte de Bronce | la Dama | Basílica de Cadenas (`chain-basilica`) | apoyos de facciones |
| Acto V | Bajo la Corona | — | Trono Bajo la Piedra | desenlace |

Cada tramo se entrega en su PR: pueblo jugable con quien da la Historia, dos
side quests locales, su mazmorra y un camino recíproco desde el tramo anterior.
