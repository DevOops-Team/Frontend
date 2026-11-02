import { describe, expect, it } from 'vitest';
import { STAGES, advance, evaluation, overallProgress, predict, stageState, tick } from './runs';
import { seedRuns } from './seed';

describe('mock runs', () => {
  const seeds = seedRuns(Date.parse('2026-11-02T00:00:00Z'));

  it('seeds five runs in varied states, one failed during data validation', () => {
    expect(seeds).toHaveLength(5);
    expect(new Set(seeds.map((r) => r.status))).toEqual(new Set(['Succeeded', 'Running', 'Failed']));
    const failed = seeds.find((r) => r.status === 'Failed')!;
    expect(failed.failure?.stage).toBe(0);
    expect(failed.failure?.reason).toMatch(/빈 값 132개/);
    expect(stageState(failed, 0)).toBe('failed');
  });

  it('progresses through every stage to Succeeded, recording loss and metric', () => {
    const queued = { ...seeds[2], status: 'Queued' as const, stage: 0, stageProgress: 0, step: 0, loss: [], metric: [] };
    const running = tick(queued);
    expect(running.status).toBe('Running');
    const done = advance(running, 40);
    expect(done.status).toBe('Succeeded');
    expect(done.stage).toBe(STAGES.length);
    expect(done.step).toBe(done.totalSteps);
    expect(done.loss.length).toBeGreaterThan(5);
    expect(done.loss[done.loss.length - 1].value).toBeLessThan(done.loss[0].value);
    expect(overallProgress(done)).toBe(1);
    expect(tick(done)).toBe(done);
  });

  it('gives a confusion matrix for classification and samples for generation', () => {
    const cls = seeds.find((r) => r.request.task === 'text-classification')!;
    const ev = evaluation(cls);
    expect(ev.confusion?.labels).toEqual(['0', '1']);
    expect(ev.metrics.map((m) => m.name)).toContain('F1');
    const sft = advance(seeds.find((r) => r.request.task === 'instruction-sft')!, 40);
    expect(evaluation(sft).samples?.length).toBeGreaterThan(0);
  });

  it('predicts in the playground', () => {
    const cls = seeds.find((r) => r.request.task === 'text-classification')!;
    const p = predict(cls, '정말 재밌고 최고였어요');
    expect(p.scores?.[0].label).toBe('1');
    expect(p.scores!.reduce((n, s) => n + s.p, 0)).toBeCloseTo(1);
    expect(predict(cls, '   ')).toEqual({});
  });
});
