import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

/**
 * Visual proof must consume exactly the immutable bytes the application will
 * request after merge. Blender rebuilds may generate different GLB hashes even
 * when authored geometry is unchanged; never treat staging/current or the last
 * PR revision as interchangeable with the manifest-pinned runtime asset.
 */
export async function installManifestPinnedV4Model(page) {
  const manifestPath = new URL('../frontend/src/assets/r2-assets-manifest.json', import.meta.url);
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const asset = manifest.assets?.['warRoom.v4.runtime'];
  if (!asset?.url || !asset?.sha256 || !asset?.key) {
    throw new Error('Missing pinned War Room V4 immutable asset manifest');
  }
  if (!asset.key.endsWith('/war-room-v4-shell-' + asset.sha256.slice(0, 16) + '.glb')) {
    throw new Error('War Room V4 manifest SHA and immutable R2 object key disagree');
  }

  const response = await page.request.get(asset.url, {
    headers: { 'cache-control': 'no-cache' },
    timeout: 30000,
  });
  if (!response.ok()) throw new Error('Pinned War Room V4 GLB could not be loaded: ' + response.status());
  const bytes = await response.body();
  const digest = createHash('sha256').update(bytes).digest('hex');
  if (digest !== asset.sha256 || bytes.length !== asset.bytes) {
    throw new Error('Pinned War Room V4 GLB bytes do not match the manifest');
  }
  await page.route('**/war-room/v4/runtime/*.glb*', (route) => route.fulfill({
    status: 200, contentType: 'model/gltf-binary', body: bytes,
    headers: { 'cache-control': 'no-store' },
  }));
  console.log('WAR_ROOM_V4_IMMUTABLE_SHA256 ' + digest + ' bytes=' + bytes.length);
  return { sha256: digest, url: asset.url, bytes: bytes.length };
}
