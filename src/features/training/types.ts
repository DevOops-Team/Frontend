// 백엔드 API 응답 모양. 정본은 Backend api/openapi.yaml(Swagger)이다.
// 필드 이름은 camelCase이고, config.json 키만 snake_case 그대로다.

export type JobStatus = 'QUEUED' | 'ADMITTED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';

export interface StoredFile {
  name: string;
  size: number;
  sha256?: string;
}

export interface HyperparameterDef {
  key: string;
  level: 'basic' | 'advanced';
  type: 'integer' | 'number';
  default: number;
  min?: number;
  exclusiveMin?: number;
  max?: number;
}

export interface Model {
  name: string;
  displayName: string;
  strategies: string[];
  defaultStrategy: string;
  strategyMinGpus: Record<string, number>;
  gpus: { min: number; max: number; default: number; options: number[] };
  datasetFormats: string[];
  hyperparameters: HyperparameterDef[];
  uri: string;
  files: StoredFile[];
}

export interface DatasetVersion {
  version: number;
  source: string;
  uri: string;
  fileCount: number;
  totalBytes: number;
  manifestSha256: string;
  files: StoredFile[];
}

export interface Dataset {
  id: string;
  name: string;
  format: string;
  latestVersion: number;
  versions?: DatasetVersion[];
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
  checkpoint_every_steps: number | null;
  seed: number;
  world_size: number;
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

export interface JobRequest {
  name?: string;
  model: string;
  strategy: string;
  gpus: number;
  dataset: { id: string; version: number };
  hyperparameters: Record<string, unknown>;
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
