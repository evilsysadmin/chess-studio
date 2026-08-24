// STATIC CONTRACT: conserva sólo el wiring de arranque que no cubren los tests puros de resiliencia.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (relative) => fs.readFileSync(path.resolve(process.cwd(), relative), 'utf8');

describe('wiring de continuidad entre releases', () => {
  it('instala recuperación de chunks y un ErrorBoundary exterior antes de App', () => {
    const main = read('src/main.jsx');
    expect(main).toContain("import { installReleaseContinuity } from './releaseContinuity.js'");
    expect(main).toContain('installReleaseContinuity();');
    expect(main).toContain("import AppRootErrorBoundary from './components/AppRootErrorBoundary.jsx'");
    expect(main).toContain('<AppRootErrorBoundary>');
    expect(main).toContain('<App />');
  });

  it('App mantiene conectados los tres mecanismos de continuidad probados por comportamiento', () => {
    const app = read('src/App.jsx');
    expect(app).toContain('useActiveSessionRestore({');
    expect(app).toContain('useActiveGameSessionPersistence({');
    expect(app).toContain('useGameReconnect({');
    expect(app).toContain('<ReleaseUpdateNotice deferReload={isBoardGameView} />');
  });
});
