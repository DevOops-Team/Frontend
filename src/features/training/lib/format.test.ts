import { describe, expect, it } from 'vitest';
import { formatClock, formatDateTime } from './format';

describe('event time', () => {
  it('uses fixed-width 24-hour local time', () => {
    expect(formatClock(new Date(2026, 10, 5, 12, 5, 8).toISOString())).toBe('12:05:08');
  });

  it('shows midnight as 00, not 24', () => {
    expect(formatClock(new Date(2026, 10, 5, 0, 0, 3).toISOString())).toBe('00:00:03');
  });

  it('keeps the date for the full form', () => {
    expect(formatDateTime(new Date(2026, 10, 5, 9, 1, 2).toISOString())).toBe('2026-11-05 09:01:02');
  });
});
