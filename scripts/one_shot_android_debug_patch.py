from pathlib import Path

path = Path('frontend/src/warRoomPointerCapture.js')
text = path.read_text()
old = """function diagnosticEnabled(root) {
  const view = root?.defaultView || globalThis.window;
  const hostname = String(view?.location?.hostname || '');
  const search = String(view?.location?.search || '');
  return /(^|\\.)staging\\./i.test(hostname) || /(?:^|[?&])warroomDiag=1(?:&|$)/.test(search);
}
"""
new = """function diagnosticEnabled(root) {
  const view = root?.defaultView || globalThis.window;
  const search = String(view?.location?.search || '');
  const coarsePointer = Boolean(view?.matchMedia?.('(pointer: coarse)')?.matches);
  // Never paint the diagnostic HUD over touch/mobile play. Desktop debugging
  // remains opt-in via ?warroomDiag=1 instead of leaking into staging by default.
  return !coarsePointer && /(?:^|[?&])warroomDiag=1(?:&|$)/.test(search);
}
"""
if old not in text:
    raise SystemExit('diagnosticEnabled pattern not found')
path.write_text(text.replace(old, new, 1))

path = Path('frontend/src/warRoomPointerCapture.test.js')
text = path.read_text()
needle = """  it('no duplica fallback si Android ya entregó pointerdown touch', () => {
"""
insert = """  it('no muestra el HUD de diagnóstico en Android aunque se solicite por query', async () => {
    const { canvas, shell } = fakeCanvas();
    const root = {
      defaultView: {
        location: { hostname: 'staging.example.test', search: '?warroomDiag=1' },
        matchMedia: vi.fn(() => ({ matches: true })),
        requestAnimationFrame: vi.fn((fn) => fn()),
      },
      getElementById: vi.fn(() => null),
      createElement: vi.fn(() => ({ setAttribute: vi.fn(), style: {}, textContent: '' })),
    };

    captureWarRoomPointer(touchEvent(canvas), { root });
    await Promise.resolve();
    expect(shell.appendChild).not.toHaveBeenCalled();
  });

  it('mantiene el HUD sólo como opt-in explícito en escritorio', async () => {
    const { canvas, shell } = fakeCanvas();
    const hud = { setAttribute: vi.fn(), style: {}, textContent: '' };
    const root = {
      defaultView: {
        location: { hostname: 'example.test', search: '?warroomDiag=1' },
        matchMedia: vi.fn(() => ({ matches: false })),
        requestAnimationFrame: vi.fn((fn) => fn()),
        devicePixelRatio: 1,
      },
      getElementById: vi.fn(() => null),
      createElement: vi.fn(() => hud),
    };

    captureWarRoomPointer(touchEvent(canvas), { root });
    await Promise.resolve();
    expect(shell.appendChild).toHaveBeenCalledWith(hud);
    expect(hud.textContent).toContain('WAR ROOM · TOUCH DIAG');
  });

"""
if needle not in text:
    raise SystemExit('pointer capture test insertion point not found')
path.write_text(text.replace(needle, insert + needle, 1))
