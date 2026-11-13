import type { TrainingOptions } from '../types';

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

// 백엔드와 같은 계산 (Young/Daly): τ = √(2 · C · M), C = 모델 바이트 · sizeFactor / 쓰기 속도, 최소 minIntervalSeconds.
export function checkpointInterval(modelBytes: number, c: TrainingOptions['checkpoint']): { intervalSeconds: number; saveSeconds: number } {
  const save = (modelBytes * c.sizeFactor) / c.writeBytesPerSecond;
  const interval = Math.max(c.minIntervalSeconds, Math.sqrt(2 * save * c.mtbfSeconds));
  return { intervalSeconds: Math.round(interval), saveSeconds: Math.round(save * 10) / 10 };
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}초`;
  const m = Math.round(seconds / 60);
  return m < 60 ? `${m}분` : `${Math.floor(m / 60)}시간 ${m % 60}분`;
}
