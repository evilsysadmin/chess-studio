import { describe, expect, it, vi } from 'vitest';
import { createAsyncCommitGuard } from './asyncLifecycle.js';

describe('async lifecycle guard', () => {
  it('allows commits while active and blocks late commits after dispose', () => {
    const guard = createAsyncCommitGuard();
    const commit = vi.fn();

    expect(guard.commit(commit)).toBe(true);
    expect(commit).toHaveBeenCalledTimes(1);

    guard.dispose();
    expect(guard.isActive()).toBe(false);
    expect(guard.commit(commit)).toBe(false);
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it('keeps dispose idempotent and ignores non-callable commits', () => {
    const guard = createAsyncCommitGuard();

    expect(guard.commit(null)).toBe(false);
    guard.dispose();
    guard.dispose();

    expect(guard.isActive()).toBe(false);
  });
});
