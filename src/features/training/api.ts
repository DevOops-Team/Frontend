import type { CreatedJob, FilePreview, Job, JobEvent, JobFile, JobStatus, SubmitSpec, TrainingOptions } from './types';

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

export const getOptions = () => request<TrainingOptions>('/api/training/options');

// 업로드할 파일 하나. path는 모델 폴더 안 경로(폴더명/...) 또는 데이터 파일 이름이다.
export interface UploadFile {
  path: string;
  file: Blob;
}

export interface Upload {
  done: Promise<CreatedJob>;
  abort: () => void;
}

// POST /api/jobs (multipart). 첫 파트는 spec(JSON), 이어서 model/<폴더>/<경로> · data/<파일>.
// 경로는 파트 이름에 넣는다: 서버가 파일명은 기본 이름만 쓰기 때문이다.
// 진행률을 보여 주려고 fetch 대신 XMLHttpRequest를 쓴다 (fetch는 업로드 진행 이벤트가 없다).
export function createJob(spec: SubmitSpec, model: UploadFile[], data: UploadFile[], onProgress: (sent: number, total: number) => void): Upload {
  const form = new FormData();
  form.append('spec', new Blob([JSON.stringify(spec)], { type: 'application/json' }), 'spec.json');
  for (const f of model) form.append(`model/${f.path}`, f.file, f.path.split('/').pop());
  for (const f of data) form.append(`data/${f.path}`, f.file, f.path);

  const xhr = new XMLHttpRequest();
  const done = new Promise<CreatedJob>((resolve, reject) => {
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded, e.total); };
    xhr.onload = () => {
      let body: { error?: string; code?: string; fields?: { field: string; message: string }[] } & Partial<CreatedJob> = {};
      try { body = JSON.parse(xhr.responseText) as typeof body; } catch { /* 프록시 HTML 등 */ }
      if (xhr.status === 201) { resolve(body as CreatedJob); return; }
      const fields = body.fields?.map((f) => `${f.field}: ${f.message}`).join(', ');
      const base = body.error ?? `백엔드 응답 오류 (HTTP ${xhr.status})`;
      reject(new ApiError(fields ? `${base} (${fields})` : base, xhr.status, body.code));
    };
    xhr.onerror = () => reject(new ApiError('업로드 중 연결이 끊겼습니다.', 0));
    xhr.onabort = () => reject(new ApiError('업로드를 취소했습니다.', 0, 'ABORTED'));
  });
  xhr.open('POST', '/api/jobs');
  xhr.send(form);
  return { done, abort: () => xhr.abort() };
}

export interface JobForm {
  name: string;
  strategy: string;
  gpus: number;
}

// 입력하지 않은 값: 이름은 백엔드가 {모델 폴더}-{id}로 짓고, 바꾸지 않은 hyperparameters는 기본값을 쓴다.
export function buildSpec(f: JobForm, hyperparameters: Record<string, number | null> = {}): SubmitSpec {
  const name = f.name.trim();
  return { ...(name ? { name } : {}), strategy: f.strategy, gpus: f.gpus, hyperparameters };
}

export function isTerminal(s: JobStatus): boolean {
  return s === 'SUCCEEDED' || s === 'FAILED' || s === 'CANCELLED';
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
