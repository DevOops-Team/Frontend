// 백엔드 API (Backend 저장소 internal/model · api/openapi.yaml)와 같은 모양.
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

// 작업에 올린 파일. code = job.yaml·train.py, data = 학습 데이터.
export interface JobFile {
  kind: 'code' | 'data';
  name: string;
  size: number;
}

// 백엔드는 파일 앞 64KiB만 준다. 잘렸으면 truncated, 전체 크기는 totalSize.
export interface FileContent {
  text: string;
  truncated: boolean;
  totalSize: number;
}

// 작업이 GPU까지 가는 동안 거친 단계 하나 (DynamoDB devoops-job-events).
// k3s 단계는 백엔드가, EKS 단계는 각 워커의 job-watcher가 쓴다.
export interface JobEvent {
  jobId: string;
  key: string;
  time: string;
  lastTime: string;
  cluster: string; // "k3s" 또는 EKS 워커 이름
  source: string; // backend, kueue-admission, multikueue, jobset, default-scheduler, karpenter, kubelet ...
  reason: string;
  message: string;
  type: string; // Normal | Warning
  object: string;
  count: number;
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

export async function listEvents(jobId: string): Promise<JobEvent[]> {
  return parse(await fetch(`${API_BASE}/api/jobs/${encodeURIComponent(jobId)}/events`));
}

export async function listFiles(jobId: string): Promise<JobFile[]> {
  return parse(await fetch(`${API_BASE}/api/jobs/${encodeURIComponent(jobId)}/files`));
}

export async function getFile(jobId: string, kind: JobFile['kind'], name: string): Promise<FileContent> {
  const res = await fetch(
    `${API_BASE}/api/jobs/${encodeURIComponent(jobId)}/files/${kind}/${encodeURIComponent(name)}`,
  );
  if (!res.ok) {
    await parse(res);
  }
  return {
    text: await res.text(),
    truncated: res.headers.get('X-Truncated') === 'true',
    totalSize: Number(res.headers.get('X-Total-Size') ?? 0),
  };
}
