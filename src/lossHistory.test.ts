import { describe, expect, it } from 'vitest';
import type { Job } from './api';
import { appendHistory } from './lossHistory';

function job(id: string, step: number, loss: number): Job {
  return {
    id, name: `job-${id}`, phase: 'Running', restarts: 0, createdAt: '2026-10-27T10:00:00Z',
    progress: { status: 'RUNNING', step, totalSteps: 5000, loss, lastCheckpointStep: 0, updatedAt: 0 },
  };
}

describe('appendHistory', () => {
  it('collects one point per new step for each job', () => {
    let h = appendHistory({}, [job('a', 10, 1.0), job('b', 5, 2.0)]);
    h = appendHistory(h, [job('a', 20, 0.8), job('b', 5, 2.0)]);
    expect(h.a).toEqual([{ step: 10, loss: 1.0 }, { step: 20, loss: 0.8 }]);
    expect(h.b).toEqual([{ step: 5, loss: 2.0 }]);
  });

  it('returns the same object when nothing changed', () => {
    const h = appendHistory({}, [job('a', 10, 1.0)]);
    expect(appendHistory(h, [job('a', 10, 1.0)])).toBe(h);
  });

  it('keeps only the last N points', () => {
    let h = {};
    for (let s = 1; s <= 5; s++) h = appendHistory(h, [job('a', s, 1 / s)], 3);
    expect((h as Record<string, unknown[]>).a).toHaveLength(3);
    expect((h as Record<string, { step: number }[]>).a[0].step).toBe(3);
  });

  it('drops points past the resume step after a restart', () => {
    let h = appendHistory({}, [job('a', 1000, 0.5)]);
    h = appendHistory(h, [job('a', 1500, 0.4)]);
    h = appendHistory(h, [job('a', 1100, 0.45)]);
    expect(h.a.map((p) => p.step)).toEqual([1000, 1100]);
  });

  it('ignores jobs without progress', () => {
    expect(appendHistory({}, [{ ...job('a', 0, 0), progress: null }])).toEqual({});
  });
});
