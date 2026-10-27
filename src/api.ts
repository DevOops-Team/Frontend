// 백엔드 API (Backend 저장소 internal/api)와 같은 모양.
export type Phase = 'Pending' | 'Admitted' | 'Running' | 'Succeeded' | 'Failed';

export interface Progress {
  status: string;
  step: number;
  totalSteps: number;
  loss: number;
  lastCheckpointStep: number;
  nodeName?: string;
  updatedAt: number;
}

export interface Job {
  id: string;
  name: string;
  phase: Phase;
  cluster?: string;
  restarts: number;
  message?: string;
  createdAt: string;
  progress: Progress | null;
}

export interface JobInput {
  job: File;
  train: File;
  data: File[];
}

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8080';

async function parse<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return body as T;
}

export async function createJob(input: JobInput): Promise<{ id: string; name: string }> {
  const form = new FormData();
  form.append('job', input.job);
  form.append('train', input.train);
  input.data.forEach((f) => form.append('data', f));
  return parse(await fetch(`${API_BASE}/api/jobs`, { method: 'POST', body: form }));
}

export async function listJobs(): Promise<Job[]> {
  return parse(await fetch(`${API_BASE}/api/jobs`));
}
