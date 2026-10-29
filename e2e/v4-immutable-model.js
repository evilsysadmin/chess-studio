import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

/**
 * PR visual proof uses the GLB built by the render job in the same workflow
 * (immutable artifact bytes), not a previous manifest-pinned production GLB.
 * Other/local tests still verify and load the exact production manifest asset.
 */
export async function installManifestPinnedV4Model(page) {
  const manifestPath = resolve(
    process.cwd(),
    basename(process.cwd()) === 'e2e' ? '../frontend/src/assets/r2-assets-manifest.json' : 'frontend/src/assets/r2-assets-manifest.json',
  );
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const asset = manifest.assets?.['warRoom.v4.runtime'];
  if (!asset?.url || !asset?.sha256 || !asset?.key) {
    throw new Error('Missing pinned War Room V4 immutable asset manifest');
  }
  if (!asset.key.endsWith('/war-room-v4-shell-' + asset.sha256.slice(0, 16) + '.glb')) {
    throw new Error('War Room V4 manifest SHA and immutable R2 object key disagree');
  }

  const authoredPath = String(process.env.APP_VISUAL_AUTHORED_WAR_ROOM_V4_GLB || '').trim();
  let bytes;
  let digest;
  let source;
  if (authoredPath) {
    // Fail closed. A visual PR must not silently fall back to an older GLB.
    if (!String(process.env.APP_VISUAL_EXPECTED_WAR_ROOM_V4_REVISION || '').trim()) {
      throw new Error('Authored War Room V4 GLB requires an exact PR revision');
    }
    bytes = await readFile(resolve(authoredPath));
    if (bytes.length < 60_000 || bytes.subarray(0, 4).toString('ascii') !== 'glTF'
      || bytes.readUInt32LE(8) !== bytes.length) {
      throw new Error('Authored War Room V4 GLB artifact is missing or corrupt');
    }
    const chunkLength = bytes.readUInt32LE(12);
    if (bytes.readUInt32LE(16) !== 0x4E4F534A || chunkLength + 20 > bytes.length) {
      throw new Error('Authored War Room V4 GLB has an invalid JSON chunk');
    }
    const gltf = JSON.parse(bytes.subarray(20, 20 + chunkLength).toString('utf8').trim());
    const names = new Set((gltf.nodes || []).map((node) => node.name));
    for (const name of ['WR_HANS_door_leaf', 'WR_ANCHOR_hans_door', 'WR_ANCHOR_hans_hearth']) {
      if (!names.has(name)) throw new Error('Authored War Room V4 GLB missing ' + name);
    }
    digest = createHash('sha256').update(bytes).digest('hex');
    source = 'pr-render-artifact';
  } else {
    const response = await page.request.get(asset.url, {
      headers: { 'cache-control': 'no-cache' },
      timeout: 30000,
    });
    if (!response.ok()) throw new Error('Pinned War Room V4 GLB could not be loaded: ' + response.status());
    bytes = await response.body();
    digest = createHash('sha256').update(bytes).digest('hex');
    if (digest !== asset.sha256 || bytes.length !== asset.bytes) {
      throw new Error('Pinned War Room V4 GLB bytes do not match the manifest');
    }
    source = 'production-manifest';
  }

  let served = 0;
  await page.route('**/war-room/v4/runtime/*.glb*', async (route) => {
    served += 1;
    await route.fulfill({
      status: 200, contentType: 'model/gltf-binary', body: bytes,
      headers: { 'cache-control': 'no-store' },
    });
  });
  const label = authoredPath ? 'WAR_ROOM_V4_AUTHORED_SHA256' : 'WAR_ROOM_V4_IMMUTABLE_SHA256';
  console.log(label + ' ' + digest + ' bytes=' + bytes.length
    + ' revision=' + String(process.env.APP_VISUAL_EXPECTED_WAR_ROOM_V4_REVISION || 'none'));
  return {
    sha256: digest, url: authoredPath || asset.url, bytes: bytes.length, source,
    get servedRequests() { return served; },
  };
}
