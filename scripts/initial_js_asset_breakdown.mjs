// Pure size accounting shared by the build gate and its regression test.
// Keep the input paths unchanged so CI logs identify exact emitted assets.
export function summarizeInitialJsAssets(assets, gzipSizeForAsset) {
  const rows = assets.map((path) => ({ path, bytes: gzipSizeForAsset(path) }));
  const totalBytes = rows.reduce((total, row) => total + row.bytes, 0);
  return {
    totalBytes,
    rows: [...rows].sort((a, b) => b.bytes - a.bytes || a.path.localeCompare(b.path)),
  };
}
