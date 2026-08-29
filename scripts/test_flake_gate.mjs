import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const src = path.join(root, 'frontend', 'src');
const failures = [];

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

for (const file of walk(src).filter((f) => /\.test\.(?:js|jsx|mjs)$/.test(f))) {
  const text = fs.readFileSync(file, 'utf8');
  const rel = path.relative(root, file);

  // Unit tests must never intentionally wait on real throttle delays.
  if (/throttleMs\s*:\s*[1-9]\d*/.test(text)) {
    failures.push(`${rel}: usa throttleMs > 0; en tests unitarios debe ser 0 o reloj falso.`);
  }

  // Fake timers are global to the Vitest worker. Cleanup must be unconditional,
  // not a line at the end of a test that is skipped when an assertion throws.
  if (/vi\.useFakeTimers\s*\(/.test(text)) {
    const afterEachAt = text.search(/afterEach\s*\(/);
    const hasAfterEachCleanup = afterEachAt >= 0 && text.slice(afterEachAt, afterEachAt + 700).includes('vi.useRealTimers(');
    if (!hasAfterEachCleanup) {
      failures.push(`${rel}: activa vi.useFakeTimers() sin restaurarlo desde afterEach().`);
    }
  }

  // Real sleeps in unit tests are almost always runner-speed dependent.
  if (/\b(?:setTimeout|setInterval)\s*\(/.test(text) && !/vi\.useFakeTimers\s*\(/.test(text)) {
    failures.push(`${rel}: usa timer real en test unitario sin vi.useFakeTimers().`);
  }
}

if (failures.length) {
  console.error('Test flake gate: FAIL');
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}
console.log('Test flake gate: OK — sin sleeps reales, fake timers sin fuga ni throttles dependientes del runner.');
