import { vi } from 'vitest';
import type { CreatedJob, Dataset, Job, JobEvent, JobFile, Model, TrainConfig } from '@/features/training';

// 테스트용 가짜 백엔드. 응답 모양은 Backend api/openapi.yaml과 같다.

export const CONFIG: TrainConfig = {
  schema_version: 1, model: 'gpt2', training_mode: 'fsdp', checkpoint_format: 'fsdp-dcp',
  dataset: { uri: 's3://b/datasets/ds-tiny-shakespeare/v1/', format: 'text-jsonl', manifest_sha256: 'aa' },
  epochs: 10, max_steps: null, batch_size_per_gpu: 4, learning_rate: 3e-5, warmup_steps: 100,
  checkpoint_every_steps: 250, seed: 42, world_size: 2,
};

export const MODEL: Model = {
  name: 'gpt2', displayName: 'GPT-2 small', strategies: ['fsdp', 'ddp'], defaultStrategy: 'fsdp', strategyMinGpus: { fsdp: 2, ddp: 1 },
  gpus: { min: 1, max: 2, default: 2, options: [1, 2, 4] }, datasetFormats: ['text-jsonl'],
  hyperparameters: [
    { key: 'epochs', level: 'basic', type: 'integer', default: 10, min: 1, max: 20 },
    { key: 'batch_size_per_gpu', level: 'advanced', type: 'integer', default: 4, min: 1, max: 8 },
    { key: 'learning_rate', level: 'advanced', type: 'number', default: 3e-5, exclusiveMin: 0, max: 0.01 },
  ],
  uri: 's3://b/datasets/_shared/models/gpt2/',
  files: [{ name: 'config.json', size: 665 }, { name: 'model.safetensors', size: 548105171 }],
};

export const DATASET: Dataset = {
  id: 'ds-tiny-shakespeare', name: 'Tiny Shakespeare', format: 'text-jsonl', latestVersion: 1,
  versions: [{
    version: 1, source: 'seed', uri: 's3://b/datasets/ds-tiny-shakespeare/v1/', fileCount: 1, totalBytes: 1115394,
    manifestSha256: 'aa', files: [{ name: 'train-000.jsonl', size: 1115394, sha256: 'bb' }],
  }],
};

export function makeJob(over: Partial<Job> = {}): Job {
  return {
    id: '3f9a1c2e', name: 'gpt2-3f9a1c2e', model: 'gpt2', strategy: 'fsdp', gpus: 2, status: 'RUNNING', generation: 1,
    jobsetName: 'job-3f9a1c2e-g0001', queue: 'queue-auto', cluster: 'devoops-a', phase: 'Running',
    dataset: { id: 'ds-tiny-shakespeare', version: 1 }, recoveryCount: 0,
    createdAt: '2026-11-05T02:00:00.000Z', updatedAt: '2026-11-05T02:01:00.000Z',
    progress: { status: 'RUNNING', generation: 1, step: 100, totalSteps: 400, loss: 2.41, lastCheckpointStep: 0, updatedAt: '2026-11-05T02:01:00.000Z' },
    config: CONFIG, ...over,
  };
}

export const EVENTS: JobEvent[] = [
  { jobId: '3f9a1c2e', key: 'k1', time: '2026-11-05T02:00:01.000Z', lastTime: '2026-11-05T02:00:01.000Z', cluster: 'k3s', source: 'backend', reason: 'Submitted', message: 'JobSet created', type: 'Normal', object: 'JobSet/x', count: 1 },
  { jobId: '3f9a1c2e', key: 'k2', time: '2026-11-05T02:00:30.000Z', lastTime: '2026-11-05T02:00:30.000Z', cluster: 'devoops-a', source: 'karpenter', reason: 'Nominated', message: 'node nominated', type: 'Warning', object: 'Pod/x', count: 1 },
];

export const FILES: JobFile[] = [
  { kind: 'code', name: 'config.json', size: 300 },
  { kind: 'code', name: 'jobset.json', size: 9000 },
  { kind: 'data', name: 'manifest.json', size: 200 },
];

export interface ApiOptions {
  jobs?: Job[];
  job?: Job;
  models?: Model[];
  datasets?: Dataset[];
  created?: Partial<CreatedJob>;
  fail?: Record<string, { status: number; body: unknown }>;
}

export interface FakeApi {
  fetch: ReturnType<typeof vi.fn>;
  posted: () => unknown[];
  urls: () => string[];
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export function stubApi(options: ApiOptions = {}): FakeApi {
  const job = options.job ?? makeJob();
  const posted: unknown[] = [];
  const urls: string[] = [];
  const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
    const url = String(input);
    urls.push(`${init?.method ?? 'GET'} ${url}`);
    const failure = options.fail?.[url];
    if (failure) return json(failure.body, failure.status);
    if (init?.method === 'POST' && url === '/api/jobs') {
      posted.push(JSON.parse(String(init.body)));
      return json({
        id: job.id, name: job.name, status: 'QUEUED', generation: 1, jobsetName: job.jobsetName, queue: 'queue-auto',
        config: CONFIG, configSha256: 'cc', createdAt: job.createdAt, ...options.created,
      }, 201);
    }
    if (url === '/api/jobs') return json({ items: options.jobs ?? [], nextCursor: null });
    if (url === '/api/models') return json({ items: options.models ?? [MODEL], nextCursor: null });
    if (url === '/api/datasets') {
      const items = (options.datasets ?? [DATASET]).map((d) => ({ ...d, versions: undefined }));
      return json({ items, nextCursor: null });
    }
    if (url.startsWith('/api/datasets/') && !url.includes('/files/')) return json(DATASET);
    if (url.endsWith('/events')) return json(EVENTS);
    if (url.endsWith('/files')) return json(FILES);
    if (url.includes('/files/')) {
      return new Response(`preview of ${url.split('/').pop()}`, { headers: { 'X-Truncated': 'true', 'X-Total-Size': '70000' } });
    }
    if (url.startsWith('/api/jobs/')) return json(job);
    return json({ error: `unexpected ${url}` }, 500);
  });
  vi.stubGlobal('fetch', fetchMock);
  return { fetch: fetchMock, posted: () => posted, urls: () => urls };
}
