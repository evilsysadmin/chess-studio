#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST_INDEX = path.join(ROOT, 'frontend', 'dist', 'index.html');

export const FRONTEND_CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-src 'self' https://assets.chess-studio.shadowops.dpdns.org",
  // Cloudflare Web Analytics is provisioned on purpose (scripts/cloudflare_staging_pages.py)
  // and Cloudflare injects its beacon from this single host. Without it the beacon is
  // blocked on every page load and the analytics we configured never report.
  "script-src 'self' 'wasm-unsafe-eval' https://static.cloudflareinsights.com",
  "script-src-attr 'none'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "media-src 'self' data: blob: https:",
  // blob: is required because GLTFLoader decodes embedded glTF textures through
  // ImageBitmapLoader, which fetch()es a blob: URL. Without it every textured GLB
  // (such as the Home runtime scene) has its textures blocked.
  "connect-src 'self' blob: http: https: ws: wss:",
  "worker-src 'self' blob:",
  "child-src 'self' blob:",
  "manifest-src 'self'",
  "form-action 'self'",
].join('; ');

export function applyFrontendCsp(html) {
  const source = String(html || '');
  if (!source) throw new Error('index.html vacío; no se puede aplicar CSP');
  if (/http-equiv=["']Content-Security-Policy["']/i.test(source)) {
    throw new Error('index.html ya contiene CSP; evita políticas duplicadas');
  }
  if (/<script(?![^>]*\bsrc=)[^>]*>/i.test(source)) {
    throw new Error('el build contiene JavaScript inline; CSP estricta lo bloquearía');
  }

  const charset = /<meta\s+charset=["']UTF-8["']\s*\/?\s*>/i;
  if (!charset.test(source)) throw new Error('no se encontró <meta charset="UTF-8"> en el build');
  const meta = `<meta http-equiv="Content-Security-Policy" content="${FRONTEND_CSP}" />`;
  return source.replace(charset, (match) => `${match}\n    ${meta}`);
}

export function applyFrontendCspFile(indexPath = DIST_INDEX) {
  const html = fs.readFileSync(indexPath, 'utf8');
  const secured = applyFrontendCsp(html);
  fs.writeFileSync(indexPath, secured, 'utf8');
  return indexPath;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const output = applyFrontendCspFile();
    console.log(`frontend-csp OK · ${path.relative(ROOT, output)}`);
  } catch (error) {
    console.error(`frontend-csp ERROR · ${error?.message || error}`);
    process.exit(1);
  }
}
