import type { CreatedJob, Dataset, FilePreview, Job, JobEvent, JobFile, JobRequest, JobStatus, Model } from './types';

// 백엔드 API 클라이언트. 개발 서버에서는 Vite 프록시가 /api를 백엔드로 넘긴다(vite.config.ts).
// 실패를 가짜 데이터로 덮지 않고 ApiError로 화면까지 올린다.

export const JOB_LIST_POLL_MS = 5000; // 서비스 API 명세 §1: 목록 5초, 상세 3초
export const JOB_DETAIL_POLL_MS = 3000;

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
    this.name = 'ApiError';
  }
}

interface ErrorBody {
  error?: string;
  code?: string;
  fields?: { field: string; message: string }[];
}

async function failure(res: Response): Promise<ApiError> {
  let body: ErrorBody = {};
  try {
    body = (await res.json()) as ErrorBody;
  } catch {
    // 프록시가 돌려준 HTML 등 JSON이 아닌 응답
  }
  const fields = body.fields?.map((f) => `${f.field}: ${f.message}`).join(', ');
  const base = body.error ?? `백엔드 응답 오류 (HTTP ${res.status})`;
  return new ApiError(fields ? `${base} (${fields})` : base, res.status, body.code);
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = init ? await fetch(url, init) : await fetch(url);
  if (!res.ok) throw await failure(res);
  return (await res.json()) as T;
}

async function items<T>(url: string): Promise<T[]> {
  return (await request<{ items: T[] }>(url)).items;
}

async function preview(url: string): Promise<FilePreview> {
  const res = await fetch(url);
  if (!res.ok) throw await failure(res);
  return {
    text: await res.text(),
    truncated: res.headers.get('X-Truncated') === 'true',
    totalSize: Number(res.headers.get('X-Total-Size') ?? 0),
  };
}

const seg = encodeURIComponent;

export const listJobs = () => items<Job>('/api/jobs');
export const getJob = (id: string) => request<Job>(`/api/jobs/${seg(id)}`);
export const jobEvents = (id: string) => request<JobEvent[]>(`/api/jobs/${seg(id)}/events`);
export const jobFiles = (id: string) => request<JobFile[]>(`/api/jobs/${seg(id)}/files`);
export const jobFile = (id: string, kind: string, name: string) => preview(`/api/jobs/${seg(id)}/files/${seg(kind)}/${seg(name)}`);

export const listModels = () => items<Model>('/api/models');
export const modelFile = (name: string, file: string) => preview(`/api/models/${seg(name)}/files/${seg(file)}`);

export const listDatasets = () => items<Dataset>('/api/datasets');
export const getDataset = (id: string) => request<Dataset>(`/api/datasets/${seg(id)}`);
export const datasetFile = (id: string, version: number, name: string) => preview(`/api/datasets/${seg(id)}/versions/${version}/files/${seg(name)}`);

export function createJob(body: JobRequest): Promise<CreatedJob> {
  return request<CreatedJob>('/api/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

export interface JobForm {
  name: string;
  model: string;
  strategy: string;
  gpus: number;
  datasetId: string;
  datasetVersion: number;
}

// 입력하지 않은 값: 이름은 백엔드가 {model}-{id}로 짓고, 바꾸지 않은 hyperparameters는 프로파일 기본값을 쓴다.
export function buildJobRequest(f: JobForm, hyperparameters: Record<string, number> = {}): JobRequest {
  const name = f.name.trim();
  return {
    ...(name ? { name } : {}),
    model: f.model,
    strategy: f.strategy,
    gpus: f.gpus,
    dataset: { id: f.datasetId, version: f.datasetVersion },
    hyperparameters,
  };
}

export function isTerminal(s: JobStatus): boolean {
  return s === 'SUCCEEDED' || s === 'FAILED';
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
