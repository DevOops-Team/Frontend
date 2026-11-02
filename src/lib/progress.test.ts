import { describe, expect, it } from 'vitest';
import { seedStore } from '../mock/seed';
import { runProgress } from './progress';

describe('execution progress', () => {
  const base = seedStore().pipelines[0];
  it('shows waiting, preparing and training as distinct stages', () => {
    expect(runProgress({ ...base, state: 'PENDING', tick: 0 })).toMatchObject({ percent: 0, active: 0 });
    expect(runProgress({ ...base, state: 'RUNNING', tick: 1 })).toMatchObject({ percent: 10, active: 1 });
    expect(runProgress({ ...base, state: 'RUNNING', tick: 5, trainTicks: 8 })).toMatchObject({ percent: 50, active: 2 });
  });
  it('only marks every stage complete after success', () => {
    const done = runProgress({ ...base, state: 'SUCCEEDED' });
    expect(done.percent).toBe(100);
    expect(done.stages.every((s) => s.state === 'done')).toBe(true);
    for (const state of ['FAILED', 'CANCELLED'] as const) {
      const stopped = runProgress({ ...base, state, tick: 3 });
      expect(stopped.percent).toBeLessThan(100);
      expect(stopped.stages[stopped.active].state).toBe(state === 'FAILED' ? 'error' : 'stopped');
      expect(stopped.stages.at(-1)?.state).toBe('waiting');
    }
  });
});
