import { ApiError, errorMessage, type Upload, type UploadFile } from '../api';
import type { SubmitSpec } from '../types';

// 제출한 학습의 업로드를 화면이 아니라 앱 단위로 들고 있는다 (GPU-195).
// Backend POST /api/jobs는 multipart 파트를 받는 대로 S3로 흘려보내므로 브라우저가 보낸 양이 곧 S3로 간 양이고,
// 요청을 끊으면(abort) Backend 요청 context가 취소되어 S3 업로드도 멈춘다.
// job id는 Backend가 업로드를 다 받고 201을 돌려줄 때 생기므로, 그 전까지는 여기 있는 key로 구분한다.

// uploading: 파일을 보내는 중 · submitting: 다 보냈고 Backend가 S3 저장을 마무리하고 학습을 제출하는 중
export type UploadState = 'uploading' | 'submitting' | 'done' | 'failed' | 'cancelled';

export interface UploadRequest {
  name: string; // 목록에 보일 이름. 비워 둔 이름은 Backend가 정하므로 "{폴더}-(자동)"
  spec: SubmitSpec;
  model: { folder: string; files: UploadFile[] };
  data: UploadFile[];
  train: UploadFile;
}

export interface UploadSummary {
  name: string;
  strategy: string;
  gpus: number;
  model: { folder: string; count: number; bytes: number };
  data: { count: number; bytes: number };
  train: { name: string; bytes: number };
}

// 화면에 넘기는 모양. 파일 내용(Blob)은 넣지 않는다.
export interface PendingUpload {
  key: string;
  summary: UploadSummary;
  state: UploadState;
  loaded: number;
  total: number;
  startedAt: number;
  updatedAt: number;
  error?: string;
  jobId?: string;
}

export type Send = (spec: SubmitSpec, model: UploadFile[], data: UploadFile[], train: UploadFile, onProgress: (sent: number, total: number) => void) => Upload;

const sum = (files: UploadFile[]) => files.reduce((n, f) => n + f.file.size, 0);

function summarize(r: UploadRequest): UploadSummary {
  return {
    name: r.name,
    strategy: r.spec.strategy,
    gpus: r.spec.gpus,
    model: { folder: r.model.folder, count: r.model.files.length, bytes: sum(r.model.files) },
    data: { count: r.data.length, bytes: sum(r.data) },
    train: { name: r.train.path, bytes: r.train.file.size },
  };
}

export const isActive = (s: UploadState) => s === 'uploading' || s === 'submitting';

export const UPLOAD_LABEL: Record<UploadState, string> = {
  uploading: 'S3 업로드 중',
  submitting: '학습 제출 중',
  done: '제출 완료',
  failed: '업로드 실패',
  cancelled: '업로드 취소됨',
};

// StateBadge 색: 보내는 중은 실행 중과 같은 색, 실패 · 취소는 학습과 같은 색.
export const uploadUiState = (s: UploadState) => (isActive(s) ? 'RUNNING' : s === 'done' ? 'SUCCEEDED' : s === 'failed' ? 'FAILED' : 'CANCELLED');

export function createUploadQueue(send: Send, now: () => number = Date.now) {
  let items: PendingUpload[] = [];
  const requests = new Map<string, UploadRequest>(); // 다시 시도용. 끝나면 지워 파일 참조를 놓는다
  const handles = new Map<string, Upload>();
  const listeners = new Set<() => void>();
  let seq = 0;

  function patch(key: string, change: Partial<PendingUpload>) {
    items = items.map((u) => (u.key === key ? { ...u, ...change, updatedAt: now() } : u));
    listeners.forEach((l) => l());
  }

  function run(key: string, request: UploadRequest) {
    const handle = send(request.spec, request.model.files, request.data, request.train, (loaded, total) => {
      if (handles.get(key) !== handle) return;
      patch(key, { loaded, total, state: loaded >= total ? 'submitting' : 'uploading' });
    });
    handles.set(key, handle);
    handle.done.then(
      (created) => {
        handles.delete(key);
        requests.delete(key);
        const u = items.find((i) => i.key === key);
        patch(key, { state: 'done', jobId: created.id, loaded: u?.total ?? 0 });
      },
      (e: unknown) => {
        if (handles.get(key) !== handle) return;
        handles.delete(key);
        if (e instanceof ApiError && e.code === 'ABORTED') patch(key, { state: 'cancelled' });
        else patch(key, { state: 'failed', error: errorMessage(e) });
      },
    );
  }

  return {
    start(request: UploadRequest): string {
      const key = `u${++seq}-${now().toString(36)}`;
      const summary = summarize(request);
      const total = summary.model.bytes + summary.data.bytes + summary.train.bytes;
      const t = now();
      items = [...items, { key, summary, state: 'uploading', loaded: 0, total, startedAt: t, updatedAt: t }];
      requests.set(key, request);
      run(key, request);
      listeners.forEach((l) => l());
      return key;
    },
    cancel(key: string) {
      handles.get(key)?.abort();
    },
    retry(key: string) {
      const u = items.find((i) => i.key === key);
      const request = requests.get(key);
      if (!u || !request || isActive(u.state) || u.state === 'done') return;
      patch(key, { state: 'uploading', loaded: 0, startedAt: now(), error: undefined });
      run(key, request);
    },
    // 끝난(완료 · 실패 · 취소) 업로드만 목록에서 지운다.
    dismiss(key: string) {
      const u = items.find((i) => i.key === key);
      if (!u || isActive(u.state)) return;
      requests.delete(key);
      items = items.filter((i) => i.key !== key);
      listeners.forEach((l) => l());
    },
    get: (key: string) => items.find((u) => u.key === key),
    list: () => items,
    hasActive: () => items.some((u) => isActive(u.state)),
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}

export type UploadQueue = ReturnType<typeof createUploadQueue>;

// 평균 속도로 남은 시간을 어림한다. 처음 1초는 속도를 말하지 않는다.
export function uploadStats(u: Pick<PendingUpload, 'loaded' | 'total' | 'startedAt'>, at: number) {
  const elapsedSeconds = Math.max(0, (at - u.startedAt) / 1000);
  const percent = u.total > 0 ? Math.min(100, Math.floor((u.loaded / u.total) * 100)) : 0;
  const bytesPerSecond = elapsedSeconds >= 1 ? u.loaded / elapsedSeconds : null;
  const remainingSeconds = bytesPerSecond ? Math.max(0, (u.total - u.loaded) / bytesPerSecond) : null;
  return { percent, bytesPerSecond, remainingSeconds, elapsedSeconds };
}
