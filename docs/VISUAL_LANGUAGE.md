# Chess Studio · lenguaje visual

Documento corto de dirección visual. No es un catálogo de componentes ni una excusa para añadir decoración: fija el vocabulario para que Home, War Room, aprendizaje, postpartida y Combat parezcan lugares del mismo mundo.

## Principio

**Ajedrez primero; castillo después.** La interfaz común debe entenderse a primera vista. La ambientación existe para dar identidad y profundidad, nunca para esconder una acción básica o competir con el tablero.

Progressive disclosure sigue siendo ley: jugar, continuar, torneo y las acciones necesarias permanecen obvias. La profundidad opcional puede ser rica, pero no invade el camino principal.

## Materiales

Usar una familia reducida y reconocible:

- **Piedra / hierro oscuro**: superficies estructurales, fondos y marcos de estancia. Gris carbón cálido; evitar negro puro salvo profundidad.
- **Latón envejecido**: jerarquía, foco, líneas finas, estados nobles y detalles. Nunca convertir toda la pantalla en dorado.
- **Madera oscura**: matiz cálido en mesas, zócalos o superficies secundarias. Debe sentirse como material, no como degradado naranja.
- **Terciopelo borgoña**: acento ambiental para cortinas, tapicería y momentos ceremoniales. Uso escaso.
- **Pergamino / marfil cálido**: texto primario. El texto secundario debe seguir siendo legible; gris barro sobre negro no es sofisticación.

Regla práctica: una pantalla puede usar todos los materiales, pero sólo uno debe dominar y como máximo dos actuar como acento.

## Iluminación

- Fuente principal cálida y localizada; sombra ambiental fría muy discreta.
- Nada de glow uniforme alrededor de cada tarjeta.
- Las superficies importantes pueden tener un filo superior suave y una sombra de contacto.
- La profundidad debe venir de luz, escala y solape; no de veinte `box-shadow` distintos.
- El tablero conserva siempre el máximo contraste funcional de la estancia.

## Tipografía

- **Display**: títulos de estancia, nombres de modos y momentos ceremoniales.
- **Mono**: instrumentación, labels cortos, metadata y estados técnicos.
- **Texto normal**: descripción, coaching y narrativa.

Contratos:

- texto narrativo o explicativo móvil: objetivo >= 12.8 px;
- CTA y metadata pueden ser menores sólo si son secundarios y conservan contraste;
- evitar tracking extremo en frases largas;
- una fuente bonita que obliga a acercar la cara a la pantalla está fallando.

## Geometría

- Radios contenidos: 6–14 px en superficies de producto; círculos sólo para iconos/avatares/control explícitamente circular.
- Bordes finos y poco contrastados; latón sólo donde explica jerarquía.
- Botones de una misma familia comparten altura y radio.
- No crear una tarjeta si una línea, una sección o el propio espacio de la habitación resuelve la jerarquía.

## Matthias

Matthias es un habitante, no un chatbot pegado encima.

- Su avatar, rey y versiones compactas deben conservar cara clara, ceño, silueta y carácter reconocibles.
- El bocadillo debe tener un origen físico inequívoco en Matthias; nada de texto flotando junto al tablero o apuntando a una estatua.
- Quieto: microvida rara y discreta.
- Hablando: atención breve; después quietud para leer.
- Reacciones intensas sólo cuando el hecho de partida las justifica.
- Puede exagerar el tono, nunca inventar hechos.

## Movimiento

- Entradas de estancia: 150–250 ms, 2–4 px como máximo.
- Hover: microdesplazamiento de 1–2 px o cambio de luz, no ambos a lo bestia.
- Ambientación: ciclos largos, amplitud mínima y coste de render conocido.
- `prefers-reduced-motion` y el ajuste interno de Chess Studio anulan cualquier movimiento puramente decorativo.
- Si todo se mueve, nada parece vivo: parece un parque temático.

## Home

Home es la antesala del castillo, no un dashboard.

- **Jugar** domina visualmente.
- Daily, recomendaciones y novedades informan; no compiten con los modos principales.
- Las tarjetas principales parecen placas/puertas de una misma sala, no tiles de aplicaciones distintas.
- Matthias aparece como anfitrión lateral o inline en móvil y nunca tapa contenido.
- El fondo puede sugerir arquitectura/material, pero no necesita una ilustración literal de castillo.

## War Room

War Room es la referencia de profundidad visual del producto.

- El tablero manda.
- Decoración alrededor, nunca delante.
- Piedra, mármol, metal, madera, fuego y textiles siguen la misma familia de Home.
- Selección, movimientos posibles, último movimiento, jaque y mate son estados funcionales: deben leerse antes que cualquier efecto ambiental.
- Móvil no intenta reproducir todo el decorado desktop; conserva identidad, tablero, Matthias y controles.

## Pantallas densas

Admin, Así juegas, autopsias y datos pueden ser más sobrios. Coherencia no significa convertir tablas en salones medievales: se heredan color, tipografía, bordes, jerarquía y materiales, no decorado literal.

## Checklist para una nueva visual

Antes de mergear:

1. ¿La acción principal se entiende sin conocer Chess Studio?
2. ¿Hay una sola jerarquía clara o varias cosas gritando?
3. ¿El texto se lee en 360/390/430 px?
4. ¿El cambio pertenece a piedra/latón/madera/terciopelo/pergamino o introduce un sexto idioma?
5. ¿Reduced motion queda limpio?
6. ¿No añade un nuevo loop/renderer/luz/textura sin necesidad?
7. ¿En móvil no hay overflow horizontal ni overlays tapando acciones?
8. Si Matthias habla, ¿es obvio que habla Matthias?

Si falla varias, no es polish: es deuda técnica disfrazada de purpurina.
