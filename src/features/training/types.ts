// 백엔드 API 응답 모양. 정본은 Backend api/openapi.yaml(Swagger)이다.
// 필드 이름은 camelCase이고, config.json 키만 snake_case 그대로다.

// Backend가 Kafka job.lifecycle 사건으로 정한다 (GPU-146). RECOVERING: 재배치로 다음 세대 대기, CANCELLED: 중지.
// STOPPING: 사용자가 중단해 JobSet은 지웠고 종료 사건(job.cancelled)을 기다리는 중 (GPU-204).
export type JobStatus = 'QUEUED' | 'ADMITTED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'RECOVERING' | 'CANCELLED' | 'STOPPING';

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
  // 학습 방식 (GPU-262). 옛 백엔드는 이 칸이 없다 → 화면은 full만 보여 준다
  finetunes?: FinetuneOption[];
  defaultFinetune?: string;
  gpus: { min: number; max: number; default: number; options: number[] };
  datasetFormat: string;
  hyperparameters: HyperparameterDef[];
  limits: { maxModelBytes: number; maxDataBytes: number; maxTrainBytes: number; maxFiles: number };
  // 저장 간격 계산 입력 (GPU-261): C = 저장 파라미터 수 · bytesPerParam ÷ 쓰는 Pod 수 ÷ writeBytesPerSecond
  checkpoint: { bytesPerParam: number; writeBytesPerSecond: number; mtbfSeconds: number; minIntervalSeconds: number };
  // 학습 이름 → S3 고정 데이터셋 (GPU-160). 이 이름을 적으면 모델 · 데이터 · 학습 코드를 올리지 않고 spec.dataset으로 제출한다.
  // 옛 백엔드는 이 칸이 없다
  namedDatasets?: NamedDataset[];
}

export interface NamedDataset { name: string; id: string; version: number }

export interface LoraConfig {
  r: number;
  alpha: number;
  dropout: number;
  target_modules: string[];
}

export interface FinetuneOption {
  name: string; // full · qlora
  strategies: string[]; // 이 학습 방식을 쓸 수 있는 분산 방식 (QLoRA는 fsdp만)
  lora?: LoraConfig;
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
  finetune?: { method: string; lora: LoraConfig | null }; // schema 3 (GPU-262)
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
  finetune?: string; // GPU-262 전에 제출한 학습은 없음 = full
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
  finetune?: string; // full · qlora (GPU-262). 없으면 백엔드 기본값
  gpus: number;
  hyperparameters: Record<string, number | null>;
  // S3 고정 데이터셋 datasets/<id>/v<version>/ (GPU-200 · GPU-160). 있으면 파일 파트를 보내지 않는다
  dataset?: { id: string; version: number };
  // POST /api/uploads로 S3에 직접 올린 업로드 (GPU-278). 있으면 파일 파트를 보내지 않는다
  upload?: { id: string };
}

// POST /api/uploads (GPU-278): 파일마다 presigned PUT. headers는 서명된 값이라 그대로 보낸다
export interface UploadTicket {
  id: string;
  expiresAt: string;
  files: { path: string; url: string; headers: Record<string, string> }[];
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

// GET /api/jobs/{id}/model: 학습이 끝난 작업의 최종 모델 = 마지막 승인 체크포인트 (ADR-30).
export interface TrainedModelFile {
  name: string;
  size: number;
  sha256: string;
}

export interface TrainedModel {
  jobId: string;
  generation: number;
  step: number;
  format: string; // fsdp-dcp · ddp-pt
  worldSize: number;
  sizeBytes: number;
  approvedAt: string;
  files: TrainedModelFile[];
}
