import type { CreatedJob, FilePreview, Job, JobEvent, JobFile, JobStatus, SubmitSpec, TrainedModel, TrainingOptions, UploadTicket } from './types';
import { sha256Hex } from './lib/sha256';

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

// 학습 완료 모델. 학습 중이면 409 NOT_FINISHED, 승인 체크포인트가 없으면 404.
// 파일 링크는 백엔드가 누를 때마다 S3 presigned URL을 만들어 302로 보내므로, 브라우저가 S3에서 직접 받는다.
export const getTrainedModel = (id: string) => request<TrainedModel>(`/api/jobs/${seg(id)}/model`);
export const modelFileUrl = (id: string, name: string) => `/api/jobs/${seg(id)}/model/files/${seg(name)}`;

export const getOptions = () => request<TrainingOptions>('/api/training/options');

// 끝난 학습 삭제 (GPU-196): S3의 체크포인트 · 최종 모델 · 올린 파일을 모든 버전까지 영구 삭제한 뒤 목록에서 뺀다. 성공은 204.
export async function deleteJob(id: string): Promise<void> {
  const res = await fetch(`/api/jobs/${seg(id)}`, { method: 'DELETE' });
  if (!res.ok) throw await failure(res);
}

// 학습 중단 (GPU-204): 대기 · 실행 중인 학습의 JobSet을 지운다. 성공은 202이고 상태는 STOPPING → CANCELLED로 바뀐다.
// 복구 중이면 409 RECOVERING, 이미 끝났으면 409 FINISHED.
export async function stopJob(id: string): Promise<void> {
  const res = await fetch(`/api/jobs/${seg(id)}/stop`, { method: 'POST' });
  if (!res.ok) throw await failure(res);
}

// 학습 다시 시작 (GPU-240): 중단한(CANCELLED) 학습을 새 세대로 다시 제출해 마지막 승인 체크포인트부터 이어서 학습한다.
// 성공은 202이고 상태는 다시 QUEUED부터. 아직 중단 중이면 409 STOPPING, 중단한 학습이 아니면 409 NOT_STOPPED · FINISHED.
export async function restartJob(id: string): Promise<void> {
  const res = await fetch(`/api/jobs/${seg(id)}/restart`, { method: 'POST' });
  if (!res.ok) throw await failure(res);
}

// 업로드할 파일 하나. path는 모델 폴더 안 경로(폴더명/...) 또는 데이터 · 학습 코드 파일 이름이다.
export interface UploadFile {
  path: string;
  file: Blob;
}

export interface Upload {
  done: Promise<CreatedJob>;
  abort: () => void;
}

// POST /api/jobs (multipart). 첫 파트는 spec(JSON), 이어서 model/<폴더>/<경로> · data/<파일> · train/<파일>.py.
// train.py는 학습 환경 이미지에 없고, 올린 파일이 학습 Pod의 /data/code/train.py로 들어간다.
// 경로는 파트 이름에 넣는다: 서버가 파일명은 기본 이름만 쓰기 때문이다.
// 진행률을 보여 주려고 fetch 대신 XMLHttpRequest를 쓴다 (fetch는 업로드 진행 이벤트가 없다).
// spec.dataset(S3 고정 데이터셋)으로 낼 때는 파일 없이 spec만 보낸다 (model · data 빈 배열, train null).
export function createJob(spec: SubmitSpec, model: UploadFile[], data: UploadFile[], train: UploadFile | null, onProgress: (sent: number, total: number) => void): Upload {
  const form = new FormData();
  form.append('spec', new Blob([JSON.stringify(spec)], { type: 'application/json' }), 'spec.json');
  for (const f of model) form.append(`model/${f.path}`, f.file, f.path.split('/').pop());
  for (const f of data) form.append(`data/${f.path}`, f.file, f.path);
  if (train) form.append(`train/${train.path}`, train.file, train.path);

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
  finetune?: string; // full · qlora (GPU-262)
  gpus: number;
}

// 입력하지 않은 값: 이름은 백엔드가 {모델 폴더}-{id}로 짓고, 바꾸지 않은 hyperparameters는 기본값을 쓴다.
export function buildSpec(f: JobForm, hyperparameters: Record<string, number | null> = {}): SubmitSpec {
  const name = f.name.trim();
  return { ...(name ? { name } : {}), strategy: f.strategy, ...(f.finetune ? { finetune: f.finetune } : {}), gpus: f.gpus, hyperparameters };
}

// 화면이 더 읽지 않아도 되는 상태. STOPPING은 곧 CANCELLED가 되므로 계속 읽는다.
export function isTerminal(s: JobStatus): boolean {
  return s === 'SUCCEEDED' || s === 'FAILED' || s === 'CANCELLED';
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// 학습 제출: 브라우저 → S3 직접 업로드 (GPU-278).
// devoops.site는 Cloudflare 프록시(요청 본문 100MB 제한)를 거치므로 모델 폴더를 /api/jobs multipart로 보낼 수 없다.
// ① 파일마다 SHA-256 → ② POST /api/uploads(파일 목록)로 presigned PUT URL → ③ S3에 PUT(크기 · sha256이 서명돼 S3가 검증)
// → ④ POST /api/jobs에 spec.upload.id만. 진행률은 해시 + 업로드 두 번 읽는 양(파일 크기 × 2) 기준이다.
// /api/uploads가 없는 옛 백엔드(404)면 예전 multipart로 보낸다. 파일이 없으면(S3 고정 데이터셋) spec만 보낸다.
export function submitJob(spec: SubmitSpec, model: UploadFile[], data: UploadFile[], train: UploadFile | null, onProgress: (sent: number, total: number) => void): Upload {
  let aborted = false;
  let current: { abort: () => void } | null = null;
  const files = [
    ...model.map((f) => ({ path: `model/${f.path}`, file: f.file })),
    ...data.map((f) => ({ path: `data/${f.path}`, file: f.file })),
    ...(train ? [{ path: `train/${train.path}`, file: train.file }] : []),
  ];
  const bytes = files.reduce((n, f) => n + f.file.size, 0);
  const total = Math.max(1, bytes * 2);
  const stop = () => { if (aborted) throw new ApiError('업로드를 취소했습니다.', 0, 'ABORTED'); };
  const run = <T,>(h: { done: Promise<T>; abort: () => void }) => { current = h; return h.done; };

  const done = (async (): Promise<CreatedJob> => {
    if (files.length === 0) return run(createJob(spec, [], [], null, () => {}));
    let hashed = 0;
    const sums: string[] = [];
    for (const f of files) {
      try {
        sums.push(await sha256Hex(f.file, (n) => { hashed += n; onProgress(hashed, total); }, () => aborted));
      } catch (e) {
        stop();
        throw e;
      }
    }
    stop();
    const res = await fetch('/api/uploads', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: files.map((f, i) => ({ path: f.path, size: f.file.size, sha256: sums[i] })) }),
    });
    if (res.status === 404 || res.status === 405) return run(createJob(spec, model, data, train, onProgress)); // 옛 백엔드
    if (!res.ok) throw await failure(res);
    const ticket = (await res.json()) as UploadTicket;
    const byPath = new Map(files.map((f) => [f.path, f.file]));
    let sent = 0;
    for (const t of ticket.files) {
      stop();
      const file = byPath.get(t.path);
      if (!file) throw new ApiError(`업로드 목록에 없는 파일: ${t.path}`, 0);
      await run(putObject(t.url, t.headers, file, (loaded) => onProgress(bytes + sent + loaded, total)));
      sent += file.size;
    }
    stop();
    onProgress(total, total);
    return run(createJob({ ...spec, upload: { id: ticket.id } }, [], [], null, () => {}));
  })();
  return { done, abort: () => { aborted = true; current?.abort(); } };
}

// S3 presigned PUT 하나. 진행률 때문에 XMLHttpRequest. 서명된 헤더(x-amz-checksum-sha256)를 그대로 보낸다.
function putObject(url: string, headers: Record<string, string>, file: Blob, onProgress: (loaded: number) => void): { done: Promise<void>; abort: () => void } {
  const xhr = new XMLHttpRequest();
  const done = new Promise<void>((resolve, reject) => {
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded); };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) { resolve(); return; }
      const code = /<Code>([^<]+)<\/Code>/.exec(xhr.responseText)?.[1];
      reject(new ApiError(`S3 업로드 실패 (HTTP ${xhr.status}${code ? `, ${code}` : ''}). URL이 만료됐으면 다시 시도하세요.`, xhr.status, code));
    };
    xhr.onerror = () => reject(new ApiError('S3에 연결할 수 없습니다 (네트워크 또는 버킷 CORS).', 0));
    xhr.onabort = () => reject(new ApiError('업로드를 취소했습니다.', 0, 'ABORTED'));
  });
  xhr.open('PUT', url);
  for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
  xhr.send(file);
  return { done, abort: () => xhr.abort() };
}
