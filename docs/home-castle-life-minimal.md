# Home · castillo vivo mínimo

Primer slice pequeño del backlog de Home vivo.

## Qué hace
- deriva cuatro estados ambientales suaves a partir de la hora local del navegador: amanecer, día, atardecer y noche;
- no usa polling, backend ni progreso offline simulado;
- muestra como máximo un recuerdo diegético en la Home canónica y sólo cuando existe un hito real de rivalidad persistido;
- prioriza una racha real de 5+ victorias y, en su defecto, 10+ victorias registradas contra Matthias;
- el objeto no enseña un panel por defecto: sólo revela contexto al hover/focus y abre Historia al interactuar;
- en móvil no añade otro target flotante en esta primera iteración;
- `prefers-reduced-motion` elimina las transiciones del objeto.

## Dirección canónica de interacción

- Los hotspots/objetos interactivos de Home deben reaccionar al hover y al focus de forma diegética y breve: luz, glow, microdesplazamiento, parallax o una animación equivalente integrada en la escena. Un tooltip estático por sí solo no es suficiente cuando el propio objeto puede comunicar que es interactivo.
- Excepción: JUGAR/CONTINUAR, COMBAT CHESS, TORNEOS y MAZMORRAS mantienen su título/detalle siempre visible (no ocultos hasta hover/focus), porque son los destinos primarios de Home y necesitan quedar legibles sin depender de una pasada de ratón. El resto del refuerzo diegético (halo, icono, chevron atenuados) sigue reservado al hover/focus/active.
- La misma intención debe existir con teclado/focus. En touch, la acción no puede depender de un estado hover imposible; el primer tap/foco debe seguir dejando claro qué objeto se puede activar.
- `prefers-reduced-motion` elimina el movimiento decorativo, pero conserva una señal visual accesible mediante luz, contraste o estado.
- La Home principal se mantiene limpia. Los modos secundarios o de mayor profundidad se agrupan detrás de una transición diegética explícita hacia un **Dungeon/zona secundaria**.
- Esa transición debe leerse como parte física del espacio —preferentemente una escalera integrada en la escena— y ser un hotspot real, no decorado muerto ni un botón flotante disfrazado.
- El Dungeon no duplica los CTA principales de Home: sirve para descargar complejidad del camino común y concentrar allí modos adicionales.

## No cambia
- navegación principal;
- hotspots canónicos;
- arte base de Home;
- lógica de partidas/rating;
- War Room, iluminación o footer;
- frecuencia de Matthias ni telemetría.

## Siguiente slice posible
Añadir un segundo tipo de objeto ligado a otro hito verificable y una rare sighting muy infrecuente, manteniendo un presupuesto global de ruido visual.
