# Chess Football — reglas de producto y dirección futura

## Producto actual: fútbol jugable

Chess Football es un juego de fútbol **jugable**, construido sobre el runtime
Godot Web existente. Su identidad visual y el control directo del partido
son un activo del producto, no una demo desechable.

Reglas de aceptación para cualquier iteración de partido:

- **Tamaño aparente consistente**: jugadores de ambos equipos y porteros
  mantienen una estatura comparable al recorrer distintas profundidades del
  campo y cambiar de orientación. La perspectiva no crea gigantes en primer
  plano ni miniaturas al fondo.
- **Luz y arte consistentes**: girar no oscurece ni aclara bruscamente una
  camiseta. Se conserva el sombreado dibujado en cada personaje; no se
  homogenizan colores de equipación, piel ni identidad.
- **Atlas canónicos aprobados intactos** salvo revisión visual explícita de
  nuevos assets. Se conserva el contacto de las botas y las sombras de
  contacto con el césped.
- **Jugabilidad independiente del render**: los ajustes visuales no alteran
  colisiones, velocidades, porteros, IA, controles ni resultados de partido.
- **QA de producto, no sólo tests**: revisar capturas reales y comparativas
  (profundidad, direcciones, porteros, acciones, táctico, móvil) además de
  Godot y arranque Web en Chromium. No aprobar una regresión visible porque
  un smoke test haya terminado verde.

El procedimiento de entrega de Football vive en
[`docs/ci/football-required-merge-gate.md`](../ci/football-required-merge-gate.md).
Estas normas son un **contrato operativo y de producto**, no sustituyen
técnicamente un required status check del ruleset de GitHub.

## Dirección futura: «Despacho del míster» (inspiración PC Fútbol)

**Backlog conceptual; no implementado.** Añadir una capa de mánager de clubes,
con sabor a simulador clásico de gestión futbolística y sin copiar interfaces,
marcas, plantillas o contenido protegido de terceros. El partido jugable
actual sigue disponible de forma independiente.

### Bucle de juego

1. Elegir un club ficticio y empezar la temporada con objetivos deportivos
   y financieros visibles.
2. Gestionar una plantilla con posiciones, atributos, forma, cansancio,
   estado físico, moral, potencial, edad, contratos y salarios.
3. Preparar alineación, banquillo, táctica y entrenamientos; decidir
   fichajes, ventas y renovaciones dentro de un presupuesto real.
4. Avanzar un calendario con liga, clasificación, resultados, sanciones,
   lesiones y evolución de jugadores; premios/pérdidas justificados por
   hechos simulados, no eventos inventados tras el resultado.
5. Para cada encuentro, **jugar** con el motor actual, **ver** el partido
   o **simularlo** y recibir una crónica basada en los eventos reales.
6. Cobrar ingresos, pagar nóminas, responder a objetivos de directiva y
   afrontar el mercado siguiente; nueva temporada con persistencia.

### Economía y simulación

- Moneda única clara, balances explicables, ingresos de taquilla,
  patrocinio y premios, gastos de plantilla y traspasos, deuda/límites
  y prohibición de dinero infinito generado por trucos de UI.
- El motor de simulación de resultados debe usar atributos, tácticas,
  fatiga, localía y azar controlado. No presentar resultados aleatorios
  puros como si respondieran a las decisiones tácticas del usuario.
- Historial y estadísticas de jugadores/clubes sólo cuando existan datos
  calculados o persistidos; rankings y narrativas nunca se inventan.
- Los partidos **jugados** reportarán un resultado final al calendario
  una única vez (idempotencia); los **simulados** no fingirán que hubo
  acciones del jugador. Evitar que dos modelos otorguen recompensas
  o actualicen la clasificación dos veces.
- Guardados versionados, recuperación tras F5, sin cambios destructivos
  sobre partidas rápidas o partidas de Football preexistentes.

### Progresión incremental (alineada con el backlog vivo #34)

- **Slice 0 · El veneno de «una jornada más»**: seis clubes ficticios,
  calendario de ida/vuelta reproducible, motor estadístico con seed
  inyectable, resultados y clasificación. Sin backend, Web Storage,
  economía o plantillas persistentes todavía. Primero demostrar que el
  calendario y la tabla ya enganchan **sin render de partidos**.
- **Slice 1 · Plantillas y decisiones**: futbolistas con atributos
  estrictamente futbolísticos, forma, fatiga, moral, edad y potencial;
  alineaciones y tácticas con consecuencias medibles. Las piezas de
  ajedrez sólo dan identidad y arquetipos: nunca reglas de movimiento.
- **Slice 2 · Carrera del mánager**: mercado, contratos, cantera,
  salarios, economía y temporadas encadenadas sólo después de
  validar los dos slices anteriores.
- **Integración Godot en HOLD para el mánager**: el partido Godot ya
  existe como experiencia separada; enlazarlo al calendario
  (Jugar/Ver/Simular y un `MatchResult` único) sólo cuando el motor
  estadístico sea la autoridad y el loop de gestión esté validado.
- **Profundidad opcional posterior**: divisiones, ascensos/descensos,
  directiva, patrocinadores e instalaciones; evitar complejidad
  antes de que las decisiones básicas sean divertidas.

El diseño y la prioridad de estos slices ya viven en
[Backlog vivo · Chess Studio #34](https://github.com/evilsysadmin/chess-studio/issues/34).
Este documento precisa el contrato de producto, **no crea una segunda
hoja de ruta ni autoriza implementarlo todo de golpe**.

### Límites de UX y arquitectura

- No convertir la pantalla actual de partido en un menú de contabilidad:
  el acceso al despacho será un **modo separado y opcional**.
- Mostrar primero las decisiones de la jornada y los indicadores
  esenciales. Estadísticas densas, libro mayor, scouting e historial
  detrás de vistas de detalle. Legible en móvil.
- Un solo calendario y una única autoridad de estado por temporada.
  Mantener el render 3D, el núcleo deportivo y la gestión desacoplados.
- Los clubes/jugadores ficticios evitan dependencia de licencias deportivas.
- Entregar en PR pequeñas: contrato de datos → simulación verificable →
  interfaz → vínculo con partidos → profundidad económica. No arrancar
  directamente con una gran reescritura.
