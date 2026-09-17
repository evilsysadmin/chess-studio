# K3s bootstrap bundle · OCI staging

Esta carpeta define únicamente los inputs y el instalador **offline** del futuro K3s single-node de staging. Todavía no cambia `cloud-init`, no arranca K3s y no hace cutover del backend actual.

## Contrato zero-cost

- No se usan OCI Custom Images ni builders A1 temporales.
- CI descarga artefactos oficiales ARM64 de K3s, verifica SHA-256 y tamaño exactos, y produce un tar reproducible.
- La versión queda fijada en `versions.env`; un bump es un cambio explícito y revisable.
- El bundle no contiene secretos, tokens de cluster, kubeconfig, credenciales OCI/GitHub/Cloudflare ni configuración de aplicación.
- `install-k3s-airgap.sh` sólo materializa el binario y el archive de imágenes en sus rutas de K3s. No usa red, no crea identidad de nodo y no inicia `k3s`.
- El staging actual sigue siendo la ruta de fallback hasta que K3s + Flux superen destroy/recreate y smoke de extremo a extremo.

## Versión inicial

Se fija `v1.36.4+k3s1` para empezar la exploración con una release parcheada y no saltar directamente al minor recién publicado. Sus hashes/tamaños se fijan junto al código para que una mutación upstream o descarga incompleta falle cerrada.

El bundle contiene:

```text
bin/k3s
images/k3s-airgap-images-arm64.tar.zst
bootstrap/install-k3s-airgap.sh
manifest.json
```

El empaquetado normaliza orden, timestamps, UID/GID y modos para que los mismos inputs produzcan los mismos bytes.

## Secuencia prevista, aún no activa

`CI bundle -> OCI Object Storage privado -> first boot descarga 1 bundle + verifica hash -> instala assets -> inicializa K3s -> bootstrap Flux -> Flux reconcilia workloads -> Headlamp/Cloudflare Tunnel después`.

La publicación en Object Storage y el consumo desde `cloud-init` pertenecen a PRs posteriores. Esta fase sólo fabrica y valida el ladrillo.