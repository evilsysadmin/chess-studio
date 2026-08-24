# V14 — Expediente total (sin más nigromancia)

## Juego y presión
- Sudden Death opcional en Partida rápida: 3 incidentes tácticos graves del humano terminan la partida. No afecta al ELO.
- Control táctico opcional: ante un incidente grave, la CPU espera hasta que el jugador haga conscientemente el chequeo de jaques/capturas/amenazas.
- Seguimiento de errores bajo 40 segundos y FX discreto al entrar bajo 30 segundos.
- Predicción prepartida basada únicamente en precedentes comparables por dificultad/ritmo.
- Confianza de la CPU derivada del marcador y la racha real; no cambia la fuerza del motor.
- Copa personal de 8 partidas, además de Racha y Boss Run.

## Autopsia
- Accuracy propia 0–100 derivada de pérdida media; se etiqueta explícitamente como métrica propia.
- Jugada de la partida: movimiento humano analizado más cercano a la primera elección del motor.
- Punto de no retorno heurístico usando evaluación de línea sugerida vs. evaluación jugada y recuperación posterior.
- Explicación algorítmica “¿por qué?” basada en mate, jaque, captura y magnitud de la pérdida.
- Resumen de 30 segundos.
- Compartir el incidente concreto (enlace + tarjeta PNG), sin sesión/JWT/perfil.
- Archivo de autopsias sincronizado en perfil para estadísticas longitudinales.

## Centro de Operaciones
- Informe semanal y comparación con la semana anterior.
- Índice de reincidencia.
- Hall of Fame y Hall of Shame.
- Conversión de posiciones ≥ +3 y defensa desde ≤ −3, sólo en partidas con autopsia disponible.
- Material total perdido en capturas, expresado en puntos de pieza.
- Rivalidad por aperturas y Clínica de aperturas (mínimo 3 muestras, score < 50%).
- Crónica de rivalidad de largo plazo.
- Tableros cosméticos desbloqueables por hitos de carrera.
- Cementerio: archivo de derrotas para revisar y reproducir. La resurrección directa desde el Cementerio se retiró posteriormente; el Replay conserva «Jugar desde aquí» como entrenamiento sin ELO.

## Laboratorio libre
- Editor visual simple de posición.
- Brocha de piezas blancas/negras y borrador.
- Pegar FEN.
- Elegir turno y dificultad.
- Jugar la posición contra CPU como entrenamiento sin ELO.

## Contratos nuevos
- Enrocar antes del turno 13.
- No sacar la dama en los primeros 6 turnos propios.
- No cometer incidentes graves bajo 40 segundos.
- Ganar Sudden Death.

## Admin
- Accuracy media y número de autopsias V14.
- Apuros de tiempo e incidencia.
- Ventajas no convertidas.
- Defensas desesperadas.
- Material donado.
- Mejor Copa personal.
- Victorias en Sudden Death.

## Deuda V13 corregida
V13 importaba `saveSpecialRun`, `clearSpecialRun` y `loadBoardTheme` sin que `career.js` los exportara. V14 implementa esas funciones y hace funcional la persistencia de runs y temas de tablero.
