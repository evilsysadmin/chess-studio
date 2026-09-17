import { createRequire } from 'node:module';

const requireFromE2e = createRequire(new URL('../e2e/package.json', import.meta.url));
const { chromium } = requireFromE2e('playwright');

const indexUrl = String(process.env.PAWN_SLUG_GODOT_INDEX_URL || '').trim();
if (!indexUrl) throw new Error('PAWN_SLUG_GODOT_INDEX_URL is required');

const parsedIndex = new URL(indexUrl);
if (parsedIndex.protocol !== 'https:') throw new Error(`Godot smoke requires HTTPS: ${indexUrl}`);

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.setContent(`<!doctype html>
    <meta charset="utf-8">
    <style>html,body,iframe{margin:0;width:100%;height:100%;border:0;background:#07090b}</style>
    <iframe id="godot" title="Pawn Slug Godot live smoke"></iframe>
    <script>
      const frame = document.getElementById('godot');
      const expectedOrigin = ${JSON.stringify(parsedIndex.origin)};
      window.addEventListener('message', (event) => {
        if (event.source !== frame.contentWindow || event.origin !== expectedOrigin) return;
        const message = event.data;
        if (!message || message.source !== 'pawn-slug-godot') return;
        document.body.dataset.lastGodotMessage = String(message.type || '');
        if (message.type === 'ready') document.body.dataset.godotReady = '1';
      });
      frame.src = ${JSON.stringify(indexUrl)};
    </script>`);

  await page.waitForFunction(
    () => document.body.dataset.godotReady === '1',
    null,
    { timeout: 45_000 },
  );

  const frame = page.frames().find((candidate) => candidate.url() === indexUrl);
  if (!frame) throw new Error(`Godot iframe did not navigate to ${indexUrl}`);

  const canvas = frame.locator('canvas');
  await canvas.waitFor({ state: 'visible', timeout: 5_000 });
  const box = await canvas.boundingBox();
  if (!box || box.width < 320 || box.height < 180) {
    throw new Error(`Godot canvas has invalid bounds: ${JSON.stringify(box)}`);
  }

  if (pageErrors.length) {
    throw new Error(`Godot browser page errors: ${pageErrors.join(' | ')}`);
  }

  console.log(`pawn-slug-godot browser smoke OK · ready + visible canvas · ${indexUrl}`);
} finally {
  await browser.close();
}
