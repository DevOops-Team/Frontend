import { describe, expect, it } from 'vitest';
import { isStoppable, showsStop } from './stop';

describe('isStoppable', () => {
  it('allows only queued, admitted and running jobs', () => {
    expect(['QUEUED', 'ADMITTED', 'RUNNING'].every((s) => isStoppable(s as never))).toBe(true);
    expect(['RECOVERING', 'STOPPING', 'SUCCEEDED', 'FAILED', 'CANCELLED'].some((s) => isStoppable(s as never))).toBe(false);
  });

  it('shows a disabled button while recovering and none once stopping or finished', () => {
    expect(showsStop('RECOVERING')).toBe(true);
    expect(['STOPPING', 'SUCCEEDED', 'FAILED', 'CANCELLED'].some((s) => showsStop(s as never))).toBe(false);
  });
});
