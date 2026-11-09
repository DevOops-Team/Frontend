import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeJob, stubApi } from '@/test-api';
import { ApiError, buildJobRequest, createJob, getDataset, getJob, listJobs, listModels, modelFile } from './api';

afterEach(() => { vi.unstubAllGlobals(); });

describe('backend client', () => {
  it('unwraps item lists', async () => {
    stubApi({ jobs: [makeJob()] });
    expect((await listJobs())[0].id).toBe('3f9a1c2e');
    expect((await listModels())[0].name).toBe('gpt2');
  });

  it('encodes path segments', async () => {
    const api = stubApi();
    await getDataset('ds a/b');
    expect(api.urls()).toContain('GET /api/datasets/ds%20a%2Fb');
  });

  it('posts JSON and returns the created job', async () => {
    const api = stubApi();
    const created = await createJob({ model: 'gpt2', strategy: 'fsdp', gpus: 2, dataset: { id: 'ds-x', version: 1 }, hyperparameters: {} });
    expect(created.jobsetName).toBe('job-3f9a1c2e-g0001');
    expect(api.fetch.mock.calls[0][1].headers).toEqual({ 'Content-Type': 'application/json' });
  });

  it('turns error bodies into ApiError with field reasons', async () => {
    stubApi({ fail: { '/api/jobs/x': { status: 400, body: { error: 'bad', code: 'VALIDATION', fields: [{ field: 'gpus', message: '2~2' }] } } } });
    const err = await getJob('x').catch((e: unknown) => e) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(400);
    expect(err.code).toBe('VALIDATION');
    expect(err.message).toContain('gpus: 2~2');
  });

  it('reports a non-JSON failure such as the dev proxy with no backend', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('Bad Gateway', { status: 502 })));
    await expect(getJob('x')).rejects.toThrow('502');
  });

  it('reads previews with their truncation headers', async () => {
    stubApi();
    const p = await modelFile('gpt2', 'config.json');
    expect(p).toEqual({ text: 'preview of config.json', truncated: true, totalSize: 70000 });
  });
});

describe('buildJobRequest', () => {
  const form = { name: '', model: 'gpt2', strategy: 'fsdp', gpus: 2, datasetId: 'ds-x', datasetVersion: 1 };

  it('omits an empty name and leaves hyperparameters to the backend defaults', () => {
    expect(buildJobRequest(form)).toEqual({ model: 'gpt2', strategy: 'fsdp', gpus: 2, dataset: { id: 'ds-x', version: 1 }, hyperparameters: {} });
  });

  it('passes only the changed hyperparameters', () => {
    expect(buildJobRequest(form, { epochs: 3 }).hyperparameters).toEqual({ epochs: 3 });
  });

  it('trims a typed name', () => {
    expect(buildJobRequest({ ...form, name: ' my-run ' }).name).toBe('my-run');
  });
});
