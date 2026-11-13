import { describe, expect, it } from 'vitest';
import type { Job } from '../types';
import { isTerminal } from '../api';
import { STATUS_LABEL, runProgress, uiState } from './progress';

function job(over: Partial<Job>): Job {
  return {
    id: '0cb3b0c3', name: 'gpt2', model: 'gpt2', strategy: 'fsdp', gpus: 2, status: 'RUNNING', generation: 1,
    jobsetName: 'job-0cb3b0c3-g0001', queue: 'queue-light', cluster: 'eks-a', phase: 'Running', recoveryCount: 0,
    createdAt: '2026-11-13T00:14:03Z', updatedAt: '2026-11-13T00:14:58Z', progress: null, ...over,
  };
}

describe('statuses from Kafka job.lifecycle (GPU-146)', () => {
  it('shows a relocation as recovering, still in progress', () => {
    const j = job({ status: 'RECOVERING', statusMessage: 'relocation rr-1 (MIGRATE)' });
    expect(STATUS_LABEL.RECOVERING).toBe('복구 중');
    expect(uiState(j.status)).toBe('PENDING');
    expect(isTerminal(j.status)).toBe(false);
    const p = runProgress(j);
    expect(p.active).toBe(1);
    expect(p.interrupted).toBe(false);
    expect(p.headline).toContain('다른 GPU');
  });

  it('shows a stopped job as cancelled and stops polling', () => {
    const j = job({ status: 'CANCELLED', progress: { status: 'RUNNING', generation: 1, step: 50, totalSteps: 208, loss: 3, lastCheckpointStep: 0, updatedAt: '2026-11-13T00:15:00Z' } });
    expect(uiState(j.status)).toBe('CANCELLED');
    expect(isTerminal(j.status)).toBe(true);
    const p = runProgress(j);
    expect(p.interrupted).toBe(true);
    expect(p.stages[p.active].state).toBe('stopped');
    expect(p.headline).toBe('학습이 중지됐어요');
  });

  it('keeps progress from job.progress for a running job', () => {
    const p = runProgress(job({ progress: { status: 'RUNNING', generation: 1, step: 104, totalSteps: 208, loss: 3, lastCheckpointStep: 69, updatedAt: '2026-11-13T00:16:00Z' } }));
    expect(p.percent).toBe(50);
    expect(p.active).toBe(2);
  });
});
