import { describe, expect, it } from 'vitest';
import { DEFAULT_FORM, buildPipelineRequest } from './lib/pipeline';
import { seedStore } from './seed';
import { advanceStore, cancelPipeline, deployModel, submitPipeline, tickStore } from './api';

const NOW = Date.parse('2026-11-02T00:00:00Z');

describe('mock store', () => {
  const seed = seedStore(NOW);

  it('seeds pipelines in every state, an HP tuning job with 8 trials and a model with two versions', () => {
    expect(seed.pipelines.map((p) => [p.id, p.state])).toEqual([
      ['pl-reviews', 'RUNNING'],
      ['pl-pcbdist', 'FAILED'],
      ['pl-revhpt', 'SUCCEEDED'],
      ['pl-churn2', 'SUCCEEDED'],
      ['pl-cancel', 'CANCELLED'],
    ]);
    expect(seed.pipelines.find((p) => p.id === 'pl-pcbdist')!.error).toMatch(/CUDA out of memory/);
    const hpt = seed.hptJobs.find((j) => j.id === 'hpt-revhpt')!;
    expect(hpt.state).toBe('SUCCEEDED');
    expect(hpt.trials).toHaveLength(8);
    expect(seed.models.find((m) => m.id === 'mdl-churn')!.versions.map((v) => v.versionId)).toEqual([1, 2]);
    const reviews = seed.models.find((m) => m.displayName === 'reviews-bert')!;
    expect(reviews.versions[0].artifactUri).toMatch(/^ds:\/\/devoops-demo\/reviews\/hpt-01\/\d+\/model\/$/);
    expect(seed.models.some((m) => m.displayName === 'pcb-vit')).toBe(false);
  });

  it('runs a submitted pipeline to success and uploads a model from <outputDir>/model/', () => {
    const form = { ...DEFAULT_FORM, modelName: 'my-model', outputDir: 'ds://b/out' };
    const { store, id } = submitPipeline(seed, buildPipelineRequest(form), { id: 'pl-test' });
    expect(store.pipelines[0]).toMatchObject({ id, state: 'PENDING' });
    expect(tickStore(store).pipelines[0].state).toBe('RUNNING');
    const done = advanceStore(store, 12);
    const p = done.pipelines[0];
    expect(p.state).toBe('SUCCEEDED');
    expect(p.cpu.length).toBeGreaterThan(3);
    expect(p.gpu.length).toBeGreaterThan(3);
    expect(p.logs[0].some((l) => l.includes('loss='))).toBe(true);
    const m = done.models.find((x) => x.id === p.modelId)!;
    expect(m).toMatchObject({ displayName: 'my-model', versions: [{ versionId: 1, artifactUri: 'ds://b/out/model/', pipelineId: 'pl-test' }] });
  });

  it('cancels a running pipeline', () => {
    const c = cancelPipeline(seed, 'pl-reviews');
    expect(c.pipelines[0].state).toBe('CANCELLED');
    expect(tickStore(c).pipelines[0]).toBe(c.pipelines[0]);
  });

  it('deploys a model version to a new or existing endpoint', () => {
    const a = deployModel(seed, { modelId: 'mdl-churn', versionId: 2, endpointId: '', endpointName: 'churn-v2', machineType: 'standard-4', minReplicas: 1, maxReplicas: 2 });
    expect(a.store.endpoints[0]).toMatchObject({ id: a.endpointId, displayName: 'churn-v2', deployments: [{ versionId: 2, traffic: 100 }] });
    const b = deployModel(seed, { modelId: 'mdl-churn', versionId: 2, endpointId: 'ep-churn', endpointName: '', machineType: 'standard-4', minReplicas: 1, maxReplicas: 2 });
    expect(b.store.endpoints.find((e) => e.id === 'ep-churn')!.deployments.map((d) => [d.versionId, d.traffic])).toEqual([
      [1, 0],
      [2, 100],
    ]);
  });
});
