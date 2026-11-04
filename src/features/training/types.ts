import type { CustomJobSpec, PipelineRequest, StudySpec } from './lib/pipeline';
import type { Trial } from './lib/hpt';

// 목업 저장소가 다루는 데이터 모양. 화면과 api.ts가 같이 쓴다.

export type PipelineState = 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';

export interface Point {
  step: number;
  value: number;
}

export interface Dataset {
  id: string;
  displayName: string;
  type: '표 형식' | '이미지' | '텍스트';
  annotationSets: string[];
  items: number;
  region: string;
  createdAt: string;
}

export interface TimelineEvent {
  t: number; // 생성 후 경과 초
  message: string;
  level: 'info' | 'warning' | 'error';
}

export interface Pipeline {
  id: string;
  displayName: string;
  state: PipelineState;
  region: string;
  request: PipelineRequest;
  createdAt: string;
  tick: number;
  trainTicks: number;
  failAt?: { tick: number; message: string };
  customJobId: string;
  hptJobId?: string;
  modelId?: string;
  modelVersion?: number;
  error?: string;
  events: TimelineEvent[];
  cpu: Point[];
  gpu: Point[];
  logs: string[][]; // 작업자 풀별
  seed: number;
}

export interface HptJob {
  id: string;
  displayName: string;
  pipelineId: string;
  state: PipelineState;
  region: string;
  study: StudySpec;
  maxTrials: number;
  parallel: number;
  trials: Trial[];
  createdAt: string;
  seed: number;
}

export interface ModelVersion {
  trainingInputs?: CustomJobSpec['runner'];
  versionId: number;
  createdAt: string;
  artifactUri: string;
  pipelineId: string;
  imageUri: string;
  description?: string;
}

export interface Model {
  id: string;
  displayName: string;
  description: string;
  region: string;
  createdAt: string;
  versions: ModelVersion[];
}

export interface Deployment {
  modelId: string;
  modelName: string;
  versionId: number;
  machineType: string;
  minReplicas: number;
  maxReplicas: number;
  traffic: number;
}

export interface Endpoint {
  id: string;
  displayName: string;
  region: string;
  createdAt: string;
  deployments: Deployment[];
}

export interface Store {
  datasets: Dataset[];
  pipelines: Pipeline[];
  hptJobs: HptJob[];
  models: Model[];
  endpoints: Endpoint[];
}
