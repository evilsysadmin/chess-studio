import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const recoveryScript = readFileSync(new URL('../public/moduleRecovery.js', import.meta.url), 'utf8');

describe('frontend CSP baseline', () => {
  it('loads no inline scripts and applies CSP before executable content', () => {
    const cspIndex = indexHtml.indexOf('http-equiv="Content-Security-Policy"');
    const firstScript = indexHtml.indexOf('<script');

    expect(cspIndex).toBeGreaterThan(0);
    expect(firstScript).toBeGreaterThan(cspIndex);
    expect(indexHtml).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/i);
    expect(indexHtml).toContain('<script src="%BASE_URL%moduleRecovery.js"></script>');
  });

  it('blocks inline/eval JavaScript while preserving workers and WebAssembly', () => {
    expect(indexHtml).toContain("script-src 'self' 'wasm-unsafe-eval'");
    expect(indexHtml).toContain("script-src-attr 'none'");
    expect(indexHtml).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    expect(indexHtml).not.toMatch(/script-src[^;]*'unsafe-eval'/);
    expect(indexHtml).toContain("worker-src 'self' blob:");
    expect(indexHtml).toContain("object-src 'none'");
    expect(indexHtml).toContain("base-uri 'self'");
  });

  it('keeps stale-module recovery behavior in the external bootstrap', () => {
    expect(recoveryScript).toContain("const RECOVERY_KEY = 'chess-studio-module-recovery-v1'");
    expect(recoveryScript).toContain("window.addEventListener('vite:preloadError'");
    expect(recoveryScript).toContain('navigator.serviceWorker.getRegistrations()');
    expect(recoveryScript).toContain("key.startsWith('chess-studio-shell-')");
  });
});
