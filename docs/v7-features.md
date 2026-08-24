# Chess Studio v7 — entrenamiento con memoria

## Implementado

- Puzzles personales generados desde blunders detectados por la Autopsia (>= 80 cp), con deduplicación y límite de 40.
- Selector de puzzles: clásicos, “Tus crímenes” y desafío diario.
- Desafío diario determinista por fecha, con racha y mejor racha persistentes.
- Rivalidad persistente contra una única CPU: V/T/D, rachas y eventos tácticos.
- Reincidencia: los comentarios de la CPU pueden mencionar que un mismo crimen ya ocurrió varias veces.
- Marcador de rivalidad visible junto al avatar de la CPU.
- Expediente de aperturas en “Así juegas”: partidas, resultados, porcentaje y color.
- Heatmap de pecados tácticos reincidentes.
- Panel admin ampliado con puzzles personales, racha diaria, partidas de rivalidad y pecado más repetido.

## Nota sobre puzzles personales

Se generan al abrir la Autopsia, porque ahí es cuando ya existe un análisis del motor. Esto evita analizar automáticamente cada partida al terminar y cargar innecesariamente el backend/Render.
