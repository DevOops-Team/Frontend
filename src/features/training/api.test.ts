import { describe, expect, it } from 'vitest';
import { JOB_DETAIL_POLL_MS, JOB_FAILED_POLL_MS, detailPollDelay } from './api';

describe('detail page polling (GPU-300)', () => {
  it('keeps reading a failed job, since recovery can submit the next generation', () => {
    expect(detailPollDelay('FAILED')).toBe(JOB_FAILED_POLL_MS);
    expect(JOB_FAILED_POLL_MS).toBeGreaterThan(JOB_DETAIL_POLL_MS);
  });

  it('stops for jobs that cannot change any more', () => {
    expect(detailPollDelay('SUCCEEDED')).toBeNull();
    expect(detailPollDelay('CANCELLED')).toBeNull();
  });

  it('reads running jobs at the normal rate', () => {
    for (const s of ['QUEUED', 'ADMITTED', 'RUNNING', 'RECOVERING', 'STOPPING'] as const) {
      expect(detailPollDelay(s)).toBe(JOB_DETAIL_POLL_MS);
    }
  });
});
