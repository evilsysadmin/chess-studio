#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'scripts/css_architecture_manifest.json'), 'utf8'));
const modules = manifest.orderedModules || [];
const maxModules = 27;
const expectedOwner = '28-product-resilience.css';
const failures = [];
if (modules.length > maxModules) failures.push(`CSS modules ${modules.length} > debt budget ${maxModules}`);
if (modules.at(-1) !== expectedOwner) failures.push(`final cascade owner must remain ${expectedOwner}`);
for (const retired of ['28-viewport-action-coherence.css', '29-onboarding-game-actions.css', '30-product-polish.css']) {
  if (modules.includes(retired)) failures.push(`retired late override layer resurrected: ${retired}`);
}
if (failures.length) {
  console.error('css-debt-budget FAIL');
  failures.forEach((msg) => console.error(` - ${msg}`));
  process.exit(1);
}
console.log(`css-debt-budget OK · ${modules.length}/${maxModules} modules · one final product-resilience owner`);
