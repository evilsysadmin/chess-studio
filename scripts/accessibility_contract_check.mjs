#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const failures = [];
const must = (condition, message) => { if (!condition) failures.push(message); };

const app = read('frontend/src/App.jsx');
const focus = read('frontend/src/useModalFocusManager.js');
const smoke = read('e2e/smoke.spec.js');
const workflow = read('.github/workflows/cicd.yml');
const focusCss = read('frontend/src/styles/18-account-menu.css');

must(/useModalFocusManager/.test(app), 'App must install the global modal focus manager');
must(/event\.key !== 'Tab'/.test(focus) && /Shift\+Tab|shiftKey/.test(focus), 'modal focus manager must trap Tab and Shift+Tab');
must(/focusin/.test(focus), 'modal focus manager must prevent focus escaping behind a modal');
must(/restoreTarget/.test(focus), 'modal focus manager must restore focus after the last modal closes');
must(/accesibilidad · un modal atrapa el foco/.test(smoke), 'Playwright must cover modal focus trapping/restoration');
must(/accesibilidad · un modal atrapa el foco/.test(workflow), 'blocking browser smoke must execute the modal focus test');
must(/golden journey/.test(workflow), 'blocking browser smoke must execute the golden journey');
must(/:where\(button, a, input, select, textarea, summary\):focus-visible/.test(focusCss), 'global keyboard focus ring contract is missing');

const componentDir = path.join(root, 'frontend/src/components');
for (const name of fs.readdirSync(componentDir).filter((name) => name.endsWith('.jsx'))) {
  const source = fs.readFileSync(path.join(componentDir, name), 'utf8');
  if (!source.includes('modal-backdrop')) continue;
  must(/role="dialog"/.test(source) && /aria-modal="true"/.test(source), `${name} mounts a modal backdrop without an aria-modal dialog`);
}

if (failures.length) {
  console.error('accessibility-contract FAIL');
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}
console.log('accessibility-contract OK · modal semantics + focus trap/restore + blocking browser coverage');
