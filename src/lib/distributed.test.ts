import { describe, expect, it } from 'vitest';
import { DEFAULT_FORM, DEFAULT_POOL, buildPipelineRequest, validateForm } from './pipeline';
import { seedStore } from '../mock/seed';
import { jobSpec } from '../mock/store';
import type { PipelineForm } from './pipeline';

describe('supported distributed training', () => {
  it('rejects unsupported strategies and non-GPU configurations', () => {
    const invalid = { ...DEFAULT_FORM, strategy: 'deepspeed' } as unknown as PipelineForm;
    expect(validateForm(invalid, { modelIds: [] }).method.join()).toContain('DDP 또는 FSDP');
    expect(validateForm({ ...DEFAULT_FORM, pools: [{ ...DEFAULT_POOL, acceleratorType: '' }] }, { modelIds: [] }).compute.join()).toContain('GPU');
  });
  it('keeps seed examples consistent with supported PyTorch training', () => {
    const seed = seedStore();
    expect(seed.pipelines.some((p) => /xgb/i.test(p.displayName))).toBe(false);
    for (const pipeline of seed.pipelines) {
      const job = jobSpec(pipeline);
      expect(['ddp', 'fsdp']).toContain(job.distributedTraining.strategy);
      expect(job.workerPoolSpecs.every((pool) => pool.machineSpec.acceleratorType)).toBe(true);
      expect(pipeline.request.body.modelToUpload?.containerSpec.imageUri ?? '').not.toMatch(/xgboost/);
    }
  });
  it('requires at least two GPUs for FSDP', () => {
    expect(validateForm({ ...DEFAULT_FORM, strategy: 'fsdp', pools: [{ ...DEFAULT_POOL, acceleratorCount: 1 }] }, { modelIds: [] }).compute.join()).toContain('2개');
  });
  it('carries the selected strategy and world size into the generated job', () => {
    const request = buildPipelineRequest({ ...DEFAULT_FORM, strategy: 'fsdp', pools: [{ ...DEFAULT_POOL, acceleratorCount: 4 }] });
    expect(request.body.trainingTaskInputs).toMatchObject({ distributedTraining: { strategy: 'fsdp', worldSize: 4 } });
  });
});
