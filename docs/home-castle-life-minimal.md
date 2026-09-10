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

## No cambia
- navegación principal;
- hotspots canónicos;
- arte base de Home;
- lógica de partidas/rating;
- War Room, iluminación o footer;
- frecuencia de Matthias ni telemetría.

## Siguiente slice posible
Añadir un segundo tipo de objeto ligado a otro hito verificable y una rare sighting muy infrecuente, manteniendo un presupuesto global de ruido visual.
