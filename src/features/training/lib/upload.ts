import type { LoraConfig, TrainingOptions } from '../types';

// 업로드 전에 화면에서 확인하는 것. 최종 검증은 백엔드가 다시 한다.

export interface PickedFile {
  path: string; // 모델: webkitRelativePath(폴더명/...), 데이터: 파일 이름
  size: number;
}

export interface ModelPick {
  folder: string;
  files: PickedFile[];
  bytes: number;
  errors: string[];
}

// 숨김 파일 · 폴더(.git, .cache 등)는 모델이 아니므로 올리지 않는다.
const hidden = (path: string) => path.split('/').some((part) => part.startsWith('.'));

export function pickModel(files: PickedFile[], limits: TrainingOptions['limits']): ModelPick {
  const kept = files.filter((f) => !hidden(f.path));
  const folder = kept[0]?.path.split('/')[0] ?? '';
  const bytes = kept.reduce((sum, f) => sum + f.size, 0);
  const errors: string[] = [];
  if (kept.length === 0) errors.push('모델 폴더를 선택해 주세요.');
  else if (!kept.some((f) => f.path === `${folder}/config.json`)) errors.push('Hugging Face 모델 폴더가 아닙니다 (config.json이 없습니다).');
  if (bytes > limits.maxModelBytes) errors.push(`모델 폴더가 너무 큽니다 (최대 ${Math.round(limits.maxModelBytes / 2 ** 30)}GiB).`);
  return { folder, files: kept, bytes, errors };
}

export interface DataPick {
  files: PickedFile[];
  bytes: number;
  errors: string[];
}

export function pickData(files: PickedFile[], limits: TrainingOptions['limits']): DataPick {
  const bytes = files.reduce((sum, f) => sum + f.size, 0);
  const errors: string[] = [];
  if (files.length === 0) errors.push('학습 데이터(.jsonl)를 선택해 주세요.');
  const wrong = files.filter((f) => !f.path.endsWith('.jsonl')).map((f) => f.path);
  if (wrong.length > 0) errors.push(`.jsonl 파일만 올릴 수 있습니다: ${wrong.join(', ')}`);
  if (bytes > limits.maxDataBytes) errors.push(`학습 데이터가 너무 큽니다 (최대 ${Math.round(limits.maxDataBytes / 2 ** 30)}GiB).`);
  return { files, bytes, errors };
}

export interface TrainPick {
  file: PickedFile | null;
  errors: string[];
}

// 학습 코드: .py 파일 하나. 서버에서 train.py로 이름을 바꿔 학습 Pod의 /data/code/train.py로 넣는다.
export function pickTrain(files: PickedFile[], limits: TrainingOptions['limits']): TrainPick {
  const errors: string[] = [];
  const file = files[0] ?? null;
  if (files.length !== 1) errors.push('학습 코드(.py) 파일 하나를 선택해 주세요.');
  else if (!file?.path.endsWith('.py')) errors.push(`.py 파일만 올릴 수 있습니다: ${file?.path}`);
  else if (file.size === 0) errors.push('학습 코드 파일이 비어 있습니다.');
  else if (file.size > limits.maxTrainBytes) errors.push(`학습 코드가 너무 큽니다 (최대 ${Math.round(limits.maxTrainBytes / 2 ** 10)}KiB).`);
  return { file: files.length === 1 ? file : null, errors };
}

// 백엔드와 같은 계산 (Young/Daly, GPU-261): τ = √(2 · C · M), 최소 minIntervalSeconds.
// C = 저장 파라미터 수 · bytesPerParam(12: fp32 가중치 + Adam 모멘트) ÷ 동시에 쓰는 Pod 수 ÷ 쓰기 속도.
export function checkpointInterval(savedParams: number, writers: number, c: TrainingOptions['checkpoint']): { intervalSeconds: number; saveSeconds: number } {
  const save = (savedParams * c.bytesPerParam) / Math.max(1, writers) / c.writeBytesPerSecond;
  const interval = Math.max(c.minIntervalSeconds, Math.sqrt(2 * save * c.mtbfSeconds));
  return { intervalSeconds: Math.round(interval), saveSeconds: Math.round(save * 10) / 10 };
}

// 체크포인트를 동시에 쓰는 Pod 수: FSDP는 모든 GPU가 자기 조각을, DDP는 rank 0 혼자 전체를 쓴다.
export function checkpointWriters(strategy: string, gpus: number): number {
  return strategy === 'fsdp' ? gpus : 1;
}

// 체크포인트에 저장되는 파라미터 수 (백엔드 ckptpolicy.SavedParams와 같은 규칙).
// full은 모든 파라미터, qlora는 대상 층의 2차원 weight마다 LoRA 어댑터 r · (in + out).
export function savedParams(shapes: Record<string, number[]>, lora: LoraConfig | null): number {
  let n = 0;
  for (const [name, shape] of Object.entries(shapes)) {
    if (!lora) {
      n += shape.reduce((a, d) => a * d, 1);
      continue;
    }
    if (shape.length !== 2) continue;
    if (lora.target_modules.some((t) => name.endsWith(`.${t}.weight`))) n += lora.r * (shape[0] + shape[1]);
  }
  return n;
}

const MAX_HEADER_BYTES = 100 * 2 ** 20;

// 고른 모델 폴더의 safetensors 헤더(앞 8바이트 길이 + JSON)만 읽어 텐서 이름 → 모양. 가중치는 읽지 않는다.
// safetensors가 없거나 헤더가 깨졌으면 null (백엔드도 같은 경우 full은 폴더 크기로, qlora는 제출을 거절한다).
export async function readTensorShapes(files: Blob[]): Promise<Record<string, number[]> | null> {
  if (files.length === 0) return null;
  const shapes: Record<string, number[]> = {};
  try {
    for (const f of files) {
      const head = new DataView(await f.slice(0, 8).arrayBuffer());
      if (head.byteLength < 8) return null;
      const n = Number(head.getBigUint64(0, true));
      if (n <= 0 || n > MAX_HEADER_BYTES || 8 + n > f.size) return null;
      const header = JSON.parse(await f.slice(8, 8 + n).text()) as Record<string, { shape?: number[] }>;
      for (const [name, t] of Object.entries(header)) {
        if (name !== '__metadata__' && Array.isArray(t.shape)) shapes[name] = t.shape;
      }
    }
  } catch {
    return null;
  }
  return shapes;
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}초`;
  const m = Math.round(seconds / 60);
  return m < 60 ? `${m}분` : `${Math.floor(m / 60)}시간 ${m % 60}분`;
}
