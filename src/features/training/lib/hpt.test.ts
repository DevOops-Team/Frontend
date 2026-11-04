import { describe, expect, it } from 'vitest';
import { bestTrial, gridValues, planTrial, sampleParams, type Trial } from './hpt';
import type { StudySpec } from './pipeline';

const study: StudySpec = {
  metrics: [{ metricId: 'accuracy', goal: 'MAXIMIZE' }],
  parameters: [
    { parameterId: 'lr', doubleValueSpec: { minValue: 1e-5, maxValue: 1e-2 }, scaleType: 'UNIT_LOG_SCALE' },
    { parameterId: 'bs', discreteValueSpec: { values: [16, 32, 64] } },
    { parameterId: 'opt', categoricalValueSpec: { values: ['adam', 'sgd'] } },
  ],
  algorithm: 'RANDOM_SEARCH',
};

describe('hpt', () => {
  it('samples values inside the search space, deterministically', () => {
    for (let i = 0; i < 20; i++) {
      const p = sampleParams(study, i, 42);
      expect(p.lr).toBeGreaterThanOrEqual(1e-5);
      expect(p.lr).toBeLessThanOrEqual(1e-2);
      expect([16, 32, 64]).toContain(p.bs);
      expect(['adam', 'sgd']).toContain(p.opt);
    }
    expect(sampleParams(study, 3, 42)).toEqual(sampleParams(study, 3, 42));
  });

  it('enumerates the grid for GRID_SEARCH', () => {
    const grid: StudySpec = { ...study, algorithm: 'GRID_SEARCH', parameters: [study.parameters[1], { parameterId: 'n', integerValueSpec: { minValue: '1', maxValue: '2' } }] };
    expect(gridValues(grid.parameters[1])).toEqual([1, 2]);
    expect([0, 1, 2, 3].map((i) => sampleParams(grid, i, 1))).toEqual([
      { bs: 16, n: 1 },
      { bs: 32, n: 1 },
      { bs: 64, n: 1 },
      { bs: 16, n: 2 },
    ]);
  });

  it('plans trials with a metric in range', () => {
    const t = planTrial(study, 0, 7);
    expect(t).toMatchObject({ id: '1', state: 'REQUESTED' });
    expect(t.planned.metric).toBeGreaterThan(0.6);
    expect(t.planned.metric).toBeLessThan(1);
  });

  it('picks the best succeeded trial by goal', () => {
    const tr = (id: string, metric: number, state: Trial['state'] = 'SUCCEEDED'): Trial => ({ id, params: {}, state, metric, planned: { metric, infeasible: false } });
    const trials = [tr('1', 0.8), tr('2', 0.9), tr('3', 0.95, 'INFEASIBLE'), tr('4', 0.7)];
    expect(bestTrial(trials, 'MAXIMIZE')?.id).toBe('2');
    expect(bestTrial(trials, 'MINIMIZE')?.id).toBe('4');
    expect(bestTrial([], 'MAXIMIZE')).toBeUndefined();
  });
});
