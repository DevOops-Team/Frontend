// 백엔드 API 응답 모양. 정본은 Backend api/openapi.yaml(Swagger)이다.
// 필드 이름은 camelCase이고, config.json 키만 snake_case 그대로다.

export type JobStatus = 'QUEUED' | 'ADMITTED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';

export interface HyperparameterDef {
  key: string;
  level: 'basic' | 'advanced';
  type: 'integer' | 'number';
  nullable?: boolean;
  default: number | null;
  min?: number;
  exclusiveMin?: number;
  max?: number;
}

// GET /api/training/options. 어떤 Hugging Face 모델 폴더든 받으므로 기본값 · 범위는 하나다.
export interface TrainingOptions {
  strategies: { name: string; minGpus: number; checkpointFormat: string }[];
  defaultStrategy: string;
  gpus: { min: number; max: number; default: number; options: number[] };
  datasetFormat: string;
  hyperparameters: HyperparameterDef[];
  limits: { maxModelBytes: number; maxDataBytes: number; maxFiles: number };
  checkpoint: { sizeFactor: number; writeBytesPerSecond: number; mtbfSeconds: number; minIntervalSeconds: number };
}

export interface CheckpointPolicy {
  interval_seconds: number;
  estimated_save_seconds: number;
  mtbf_seconds: number;
  warmup_measure_steps: number;
}

export interface TrainConfig {
  schema_version: number;
  model: string;
  training_mode: string;
  checkpoint_format: string;
  dataset: { uri: string; format: string; manifest_sha256: string };
  epochs: number;
  max_steps: number | null;
  batch_size_per_gpu: number;
  learning_rate: number;
  warmup_steps: number;
  seed: number;
  world_size: number;
  checkpoint_policy: CheckpointPolicy;
}

export interface Progress {
  status: string;
  generation: number;
  step: number;
  totalSteps: number;
  loss: number;
  lastCheckpointStep: number;
  nodeName?: string;
  updatedAt: string;
}

export interface Job {
  id: string;
  name: string;
  model: string;
  strategy: string;
  gpus: number;
  status: JobStatus;
  statusMessage?: string;
  generation: number;
  jobsetName: string;
  queue: string;
  cluster?: string;
  phase: string;
  dataset?: { id: string; version: number; format?: string; manifestSha256?: string };
  hyperparameters?: Record<string, unknown>;
  configSha256?: string;
  recoveryCount: number;
  createdAt: string;
  updatedAt: string;
  config?: TrainConfig;
  images?: Record<string, string>;
  progress: Progress | null;
}

export interface JobEvent {
  jobId: string;
  key: string;
  time: string;
  lastTime: string;
  cluster: string;
  source: string;
  reason: string;
  message: string;
  type: 'Normal' | 'Warning';
  object: string;
  count: number;
}

export interface JobFile {
  kind: 'code' | 'data';
  name: string;
  size: number;
}

// POST /api/jobs의 첫 파트 "spec". 모델 폴더와 학습 데이터는 파일 파트로 따로 보낸다.
export interface SubmitSpec {
  name?: string;
  strategy: string;
  gpus: number;
  hyperparameters: Record<string, number | null>;
}

export interface CreatedJob {
  id: string;
  name: string;
  status: JobStatus;
  generation: number;
  jobsetName: string;
  queue: string;
  config: TrainConfig;
  configSha256: string;
  createdAt: string;
}

export interface FilePreview {
  text: string;
  truncated: boolean;
  totalSize: number;
}
