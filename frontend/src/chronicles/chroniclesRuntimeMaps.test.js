import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_CHRONICLES_MAP_ID,
  chroniclesClearRuntimeMapDefinitions,
  chroniclesInstallRuntimeMapDefinition,
  chroniclesMapById,
} from './chroniclesMapCatalog.js';

afterEach(() => chroniclesClearRuntimeMapDefinitions());

describe('Chronicles runtime map overrides', () => {
  it('uses a validated remote definition while preserving the bundled fallback', () => {
    const local = chroniclesMapById(DEFAULT_CHRONICLES_MAP_ID);
    const remote = JSON.parse(JSON.stringify(local));
    remote.title = 'Cripta desde Game Director';

    const installed = chroniclesInstallRuntimeMapDefinition(remote);
    expect(installed.title).toBe('Cripta desde Game Director');
    expect(chroniclesMapById(DEFAULT_CHRONICLES_MAP_ID)).toBe(installed);

    chroniclesClearRuntimeMapDefinitions();
    expect(chroniclesMapById(DEFAULT_CHRONICLES_MAP_ID)).toBe(local);
  });

  it('will not install a remote map that has no bundled fail-open fallback', () => {
    const local = chroniclesMapById(DEFAULT_CHRONICLES_MAP_ID);
    const unknown = { ...JSON.parse(JSON.stringify(local)), id: 'server-only-room' };

    expect(() => chroniclesInstallRuntimeMapDefinition(unknown)).toThrow(/no bundled fallback/i);
    expect(chroniclesMapById(DEFAULT_CHRONICLES_MAP_ID)).toBe(local);
  });
});
