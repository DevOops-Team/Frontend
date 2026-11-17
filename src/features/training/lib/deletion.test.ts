import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api';
import { deleteJobs, isDeletable } from './deletion';

describe('isDeletable', () => {
  it('allows only finished jobs', () => {
    expect(['SUCCEEDED', 'FAILED', 'CANCELLED'].every((s) => isDeletable(s as never))).toBe(true);
    expect(['QUEUED', 'ADMITTED', 'RUNNING', 'RECOVERING'].some((s) => isDeletable(s as never))).toBe(false);
  });
});

describe('deleteJobs', () => {
  it('deletes every job and reports each failure with its message', async () => {
    const del = vi.fn((id: string) => id === 'b' ? Promise.reject(new ApiError('delete s3://jobs/b/ failed: AccessDenied', 502)) : Promise.resolve());
    const r = await deleteJobs(['a', 'b', 'c'], del);
    expect(del).toHaveBeenCalledTimes(3);
    expect(r.deleted).toEqual(['a', 'c']);
    expect(r.failed).toEqual([{ id: 'b', message: 'delete s3://jobs/b/ failed: AccessDenied' }]);
  });

  it('runs at most a few deletes at once', async () => {
    let running = 0;
    let peak = 0;
    const del = async () => { running++; peak = Math.max(peak, running); await new Promise((r) => setTimeout(r, 5)); running--; };
    const r = await deleteJobs(Array.from({ length: 10 }, (_, i) => `j${i}`), del, 3);
    expect(r.deleted).toHaveLength(10);
    expect(peak).toBe(3);
  });
});
