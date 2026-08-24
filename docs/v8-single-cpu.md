# Chess Studio v8 — una CPU, una enemistad

- Eliminado el selector de personalidades CPU.
- Identidad fija: **CPU**, sin etiqueta de personalidad.
- Comentarios siempre desde el repertorio sarcástico fijo.
- Rivalidad consolidada en un único marcador persistente.
- Migración automática de perfiles V7: suma V/T/D y conserva mejores rachas e incidentes de todas las antiguas personalidades.
- La racha actual se reinicia durante la migración porque no puede reconstruirse cronológicamente al mezclar marcadores antiguos.
- El panel “Así juegas” muestra una única rivalidad.
- Se elimina `chess-study-cpu-personality` del perfil sincronizado; cualquier valor local antiguo se ignora y se limpia al restaurar/cambiar de perfil.
