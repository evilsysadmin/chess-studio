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
