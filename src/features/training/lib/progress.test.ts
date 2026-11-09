import { describe, expect, it } from 'vitest';
import { CONFIG, makeJob } from '@/test-api';
import { runProgress, stepsPerEpoch } from './progress';

const running = (step: number, totalSteps: number) => ({ status: 'RUNNING', generation: 1, step, totalSteps, loss: 2, lastCheckpointStep: 0, updatedAt: '' });

describe('runProgress', () => {
  it('waits at the first stage while queued', () => {
    const p = runProgress(makeJob({ status: 'QUEUED', progress: null }));
    expect(p.percent).toBe(0);
    expect(p.active).toBe(0);
    expect(p.stages[0].state).toBe('active');
    expect(p.headline).toContain('기다리');
  });

  it('prepares GPUs after admission and until train.py reports steps', () => {
    expect(runProgress(makeJob({ status: 'ADMITTED', progress: null })).active).toBe(1);
    expect(runProgress(makeJob({ status: 'RUNNING', progress: null })).active).toBe(1);
    expect(runProgress(makeJob({ status: 'RUNNING', progress: running(0, 0) })).active).toBe(1);
  });

  it('uses real steps for the percentage while training', () => {
    const p = runProgress(makeJob({ status: 'RUNNING', progress: running(100, 400) }));
    expect(p.percent).toBe(25);
    expect(p.active).toBe(2);
    expect(p.stages.map((s) => s.state)).toEqual(['done', 'done', 'active', 'waiting']);
  });

  it('moves to saving after the last step, before the job completes', () => {
    const p = runProgress(makeJob({ status: 'RUNNING', progress: running(400, 400) }));
    expect(p.active).toBe(3);
    expect(p.percent).toBe(99);
  });

  it('reaches 100% only when the job succeeded', () => {
    const p = runProgress(makeJob({ status: 'SUCCEEDED', progress: running(400, 400) }));
    expect(p.percent).toBe(100);
    expect(p.complete).toBe(true);
    expect(p.stages.every((s) => s.state === 'done')).toBe(true);
  });

  it('marks the stage it failed at and stays below 100%', () => {
    const late = runProgress(makeJob({ status: 'FAILED', progress: running(400, 400) }));
    expect(late.percent).toBe(99);
    expect(late.interrupted).toBe(true);
    expect(late.headline).toContain('문제');
    expect(late.stages[3].state).toBe('error');
    const early = runProgress(makeJob({ status: 'FAILED', cluster: undefined, progress: null }));
    expect(early.stages[0].state).toBe('error');
  });
});

describe('stepsPerEpoch', () => {
  it('divides total steps by epochs', () => {
    expect(stepsPerEpoch(makeJob({ config: CONFIG, progress: running(100, 400) }))).toBe(40);
  });

  it('is unknown before train.py reports total steps', () => {
    expect(stepsPerEpoch(makeJob({ config: CONFIG, progress: null }))).toBeNull();
    expect(stepsPerEpoch(makeJob({ config: CONFIG, progress: running(0, 0) }))).toBeNull();
    expect(stepsPerEpoch(makeJob({ config: undefined, progress: running(1, 400) }))).toBeNull();
  });

  it('is unknown when max_steps may have cut the total short', () => {
    expect(stepsPerEpoch(makeJob({ config: { ...CONFIG, max_steps: 100 }, progress: running(1, 100) }))).toBeNull();
  });
});
