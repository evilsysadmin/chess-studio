#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'scripts/css_architecture_manifest.json'), 'utf8'));
const modules = manifest.orderedModules || [];
const globalModules = manifest.globalModules || modules;
// Route boundaries may grow as the monolith is split; only CSS forced into
// every screen consumes the global debt budget.
// Route splits may produce several physical files in one historical layer.
// The layer count captures cascade debt without penalizing safe fragmentation.
const globalLayers = new Set(globalModules.map((name) => name.slice(0, 2))).size;
const maxGlobalLayers = 26;
const expectedOwner = '28-product-resilience.css';
const failures = [];
if (globalLayers > maxGlobalLayers) failures.push(`global CSS layers ${globalLayers} > debt budget ${maxGlobalLayers}`);
if (modules.at(-1) !== expectedOwner) failures.push(`final cascade owner must remain ${expectedOwner}`);
for (const retired of ['28-viewport-action-coherence.css', '29-onboarding-game-actions.css', '30-product-polish.css']) {
  if (modules.includes(retired)) failures.push(`retired late override layer resurrected: ${retired}`);
}
if (failures.length) {
  console.error('css-debt-budget FAIL');
  failures.forEach((msg) => console.error(` - ${msg}`));
  process.exit(1);
}
console.log(`css-debt-budget OK · ${globalLayers}/${maxGlobalLayers} global layers · ${globalModules.length} physical global modules · ${modules.length - globalModules.length} lazy · one final product-resilience owner`);
