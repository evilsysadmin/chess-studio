import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FRONTEND_CSP, applyFrontendCsp } from '../../scripts/apply_frontend_csp.mjs';

const sourceIndex = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const recoveryScript = readFileSync(new URL('../public/moduleRecovery.js', import.meta.url), 'utf8');
const securedIndex = applyFrontendCsp(sourceIndex);

describe('frontend CSP baseline', () => {
  it('keeps dev source CSP-free but injects production CSP before executable content', () => {
    expect(sourceIndex).not.toContain('Content-Security-Policy');
    const cspIndex = securedIndex.indexOf('http-equiv="Content-Security-Policy"');
    const firstScript = securedIndex.indexOf('<script');

    expect(cspIndex).toBeGreaterThan(0);
    expect(firstScript).toBeGreaterThan(cspIndex);
    expect(sourceIndex).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/i);
    expect(sourceIndex).toContain('<script src="%BASE_URL%moduleRecovery.js"></script>');
  });

  it('blocks inline/eval JavaScript while preserving workers, preview APIs and WebAssembly', () => {
    expect(FRONTEND_CSP).toContain("script-src 'self' 'wasm-unsafe-eval'");
    expect(FRONTEND_CSP).toContain("script-src-attr 'none'");
    expect(FRONTEND_CSP).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    expect(FRONTEND_CSP).not.toMatch(/script-src[^;]*'unsafe-eval'/);
    expect(FRONTEND_CSP).toContain("connect-src 'self' http: https: ws: wss:");
    expect(FRONTEND_CSP).toContain("worker-src 'self' blob:");
    expect(FRONTEND_CSP).toContain("object-src 'none'");
    expect(FRONTEND_CSP).toContain("base-uri 'self'");
  });

  it('rejects any future inline script before producing a deployable build', () => {
    expect(() => applyFrontendCsp('<meta charset="UTF-8"><script>alert(1)</script>')).toThrow(/JavaScript inline/);
    expect(() => applyFrontendCsp(securedIndex)).toThrow(/CSP/);
  });

  it('keeps stale-module recovery behavior in the external bootstrap', () => {
    expect(recoveryScript).toContain("const RECOVERY_KEY = 'chess-studio-module-recovery-v1'");
    expect(recoveryScript).toContain("window.addEventListener('vite:preloadError'");
    expect(recoveryScript).toContain('navigator.serviceWorker.getRegistrations()');
    expect(recoveryScript).toContain("key.startsWith('chess-studio-shell-')");
  });
});
