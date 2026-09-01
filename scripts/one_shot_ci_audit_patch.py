from pathlib import Path

path = Path('scripts/test_suite_audit.mjs')
text = path.read_text()
start_marker = "  for (const qualityJob of ['frontend', 'backend', 'security', 'e2e']) {"
end_marker = "  for (const required of [\n    'name: Production · promote',"
start = text.find(start_marker)
end = text.find(end_marker, start)
if start < 0 or end < 0:
    raise SystemExit(f'CI audit boundaries not found: start={start}, end={end}')
new = """  for (const qualityJob of ['frontend', 'backend', 'e2e']) {
    const start = mainCiSource.indexOf(`\n  ${qualityJob}:\n`);
    if (start < 0) fail(`Falta job paralelo ${qualityJob}`);
    const tail = mainCiSource.slice(start + 1);
    const nextJobOffset = tail.slice(tail.indexOf('\n') + 1).search(/^  [A-Za-z0-9_-]+:\n/m);
    const block = nextJobOffset >= 0
      ? tail.slice(0, tail.indexOf('\n') + 1 + nextJobOffset)
      : tail;
    if (!block.includes('\n    needs: preflight\n')) fail(`${qualityJob} debe depender sólo del preflight y poder correr en paralelo`);
  }
  const securityStart = mainCiSource.indexOf('\n  security:\n');
  const securityTail = mainCiSource.slice(securityStart + 1);
  const securityNextJobOffset = securityTail.slice(securityTail.indexOf('\n') + 1).search(/^  [A-Za-z0-9_-]+:\n/m);
  const securityBlock = securityNextJobOffset >= 0
    ? securityTail.slice(0, securityTail.indexOf('\n') + 1 + securityNextJobOffset)
    : securityTail;
  if (!mainCiSource.includes('\n  changes:\n') || !mainCiSource.includes('dorny/paths-filter@v3')) {
    fail('CI debe detectar cambios Docker/dependencias antes del gate caro de seguridad');
  }
  if (!securityBlock.includes('\n    needs: [preflight, changes]\n')) {
    fail('security debe depender de preflight + detector de cambios');
  }
  if (!securityBlock.includes("needs.changes.outputs.security == 'true'")) {
    fail('security debe saltarse cuando no cambian Dockerfiles/dependencias');
  }
  for (const securityInput of [
    "'**/Dockerfile'",
    "'docker-compose*.yml'",
    "'frontend/package-lock.json'",
    "'backend-python/requirements*.txt'",
  ]) {
    if (!mainCiSource.includes(securityInput)) fail(`Detector de seguridad incompleto: falta ${securityInput}`);
  }
"""
path.write_text(text[:start] + new + text[end:])
