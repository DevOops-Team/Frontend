import type { TaskId } from '../mock/catalog';
import type { ColumnMapping } from './mapping';
import type { GpuChoice, Hyperparameters, PresetId } from './estimate';
import type { DatasetFormat } from './parse';

export type DatasetSource = 'upload' | 'huggingface' | 'sample';

// 화면이 만든 값을 그대로 담는 API 요청 본문(제안 스키마). 백엔드로 보내지는 않는다.
export interface TrainingRequest {
  name: string;
  task: TaskId;
  base_model: string;
  dataset: {
    source: DatasetSource;
    uri: string;
    format: DatasetFormat | 'hf';
    columns: Record<string, string>;
    split: { train: number; validation: number; seed: number };
  };
  hyperparameters: {
    preset: PresetId | 'custom';
    epochs: number;
    learning_rate: number;
    batch_size: number;
    lora: { enabled: true; rank: number } | { enabled: false };
  };
  compute: { gpu: string; gpu_count: number; auto: boolean };
}

export interface RequestInput {
  name: string;
  task: TaskId;
  baseModel: string;
  source: DatasetSource;
  datasetRef: string; // 업로드 파일 이름, HF ID, 샘플 ID
  format: DatasetFormat | 'hf';
  mapping: ColumnMapping;
  trainPercent: number;
  preset: PresetId | 'custom';
  hyper: Hyperparameters;
  gpu: GpuChoice;
  gpuAuto: boolean;
}

const URI_PREFIX: Record<DatasetSource, string> = { upload: 'upload://', huggingface: 'hf://', sample: 'sample://' };

function round(n: number, digits: number) {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

export function buildRequest(i: RequestInput): TrainingRequest {
  const ref = i.source === 'sample' ? i.datasetRef.replace(/^sample\//, '') : i.datasetRef;
  return {
    name: i.name,
    task: i.task,
    base_model: i.baseModel,
    dataset: {
      source: i.source,
      uri: `${URI_PREFIX[i.source]}${ref}`,
      format: i.format,
      // 매핑하지 않은 선택 역할은 뺀다.
      columns: Object.fromEntries(Object.entries(i.mapping).filter(([, col]) => col !== '')),
      split: { train: round(i.trainPercent / 100, 2), validation: round(1 - i.trainPercent / 100, 2), seed: 42 },
    },
    hyperparameters: {
      preset: i.preset,
      epochs: i.hyper.epochs,
      learning_rate: i.hyper.learningRate,
      batch_size: i.hyper.batchSize,
      lora: i.hyper.lora ? { enabled: true, rank: i.hyper.loraRank } : { enabled: false },
    },
    compute: { gpu: i.gpu.gpuId, gpu_count: i.gpu.count, auto: i.gpuAuto },
  };
}

// 모델·데이터셋 이름으로 기본 작업 이름을 만든다: 소문자·숫자·하이픈, 40자 이하.
export function defaultRunName(baseModel: string, datasetRef: string): string {
  const slug = (s: string) =>
    s
      .split('/')
      .pop()!
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  const name = [slug(baseModel), slug(datasetRef.replace(/\.(csv|jsonl|json|ndjson)$/i, ''))].filter(Boolean).join('-');
  return (name || 'run').slice(0, 40).replace(/-+$/, '');
}

export function validateRunName(name: string): string | null {
  if (!/^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$/.test(name)) return '소문자·숫자·하이픈, 1–40자 (하이픈으로 시작·끝 불가)';
  return null;
}
