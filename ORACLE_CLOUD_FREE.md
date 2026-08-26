# Oracle Cloud Free · propuesta para Chess Studio

## Qué ofrece ahora

La documentación específica de Always Free indica para Ampere A1 un cupo total de **2 OCPU y 12 GB de RAM**, utilizable como una VM o dos VMs, más **200 GB de Block Volume** compartido con el resto de instancias gratuitas. La máquina es ARM64. La capacidad gratuita puede agotarse temporalmente en la región elegida.

Fuentes:

- https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm
- https://www.oracle.com/cloud/free/faq/

## Arquitectura recomendada

No hace falta abandonar GitHub Pages para quitar `github.io`: Pages admite dominio propio y HTTPS. La migración de menor riesgo es:

- `jugar.tudominio.com` → GitHub Pages (frontend estático, con dominio personalizado).
- `api.tudominio.com` → VM Ampere A1 de Oracle (FastAPI en contenedor ARM64 y proxy HTTPS).
- MongoDB Atlas continúa como autoridad persistente durante la primera fase.
- Workers AI continúa detrás del Worker actual.

Así el usuario sólo ve tu DNS, el frontend conserva despliegue inmutable y barato, y mover el backend no mezcla en un día API, base de datos, copias y recuperación.

GitHub documenta el dominio personalizado aquí: https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site

## Fase posterior, si compensa

Se puede servir frontend y backend desde la misma VM con Caddy y Docker Compose. No recomiendo alojar Mongo en esa misma VM como primer paso: convierte una caída o un disco roto en caída de aplicación **y** pérdida de la autoridad de datos. Si se hace más adelante, requiere al menos backup cifrado externo, prueba de restauración y monitor de espacio.

## Checklist de prueba

1. Crear una A1 Flex ARM64 de 2 OCPU / 12 GB en la región con mejor capacidad.
2. Reservar IP pública y abrir sólo 80/443; SSH restringido por IP o Bastion.
3. Construir imagen `linux/arm64`, fijar versiones y ejecutar como usuario sin privilegios.
4. Publicar `api.tudominio.com`, TLS automático y `/api/ready` como healthcheck.
5. Probar login, perfil, partida activa, feedback, admin y Workers AI.
6. Cambiar `VITE_API_URL`; conservar Render durante una ventana de rollback.
7. Medir una semana antes de retirar el backend anterior.

La decisión recomendada es **Pages con dominio propio + API en Oracle**, no un big-bang de toda la pila.
