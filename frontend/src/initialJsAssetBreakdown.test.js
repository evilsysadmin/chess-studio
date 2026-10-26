import { describe, expect, it } from 'vitest';
import { summarizeInitialJsAssets } from '../../scripts/initial_js_asset_breakdown.mjs';

describe('initial JS gzip budget diagnostics', () => {
  it('preserves the exact total and ranks emitted assets by compressed size', () => {
    const sizes = { '/assets/index.js': 2200, '/assets/vendor.js': 1700, '/assets/tiny.js': 100 };
    const assets = ['/assets/tiny.js', '/assets/vendor.js', '/assets/index.js'];
    const result = summarizeInitialJsAssets(assets, (asset) => sizes[asset]);
    expect(result.totalBytes).toBe(4000);
    expect(result.rows).toEqual([
      { path: '/assets/index.js', bytes: 2200 },
      { path: '/assets/vendor.js', bytes: 1700 },
      { path: '/assets/tiny.js', bytes: 100 },
    ]);
    expect(assets).toEqual(['/assets/tiny.js', '/assets/vendor.js', '/assets/index.js']);
  });

  it('sorts ties deterministically and handles an empty asset list', () => {
    expect(summarizeInitialJsAssets([], () => { throw new Error('not called'); })).toEqual({ totalBytes: 0, rows: [] });
    expect(summarizeInitialJsAssets(['b.js', 'a.js'], () => 128).rows.map((row) => row.path)).toEqual(['a.js', 'b.js']);
  });
});
