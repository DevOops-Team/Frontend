// 목업 카탈로그: 리전, 머신, 가속기, 디스크, 사전 빌드 컨테이너. 가격은 모두 목업(USD/시간)이다.

export const PROJECT = 'devoops-demo';

export const REGIONS = [
  { id: 'kr-seoul-1', label: 'kr-seoul-1 (서울)' },
  { id: 'kr-busan-1', label: 'kr-busan-1 (부산)' },
  { id: 'us-west-1', label: 'us-west-1 (오리건)' },
];

export interface MachineType {
  id: string;
  vcpu: number;
  memoryGb: number;
  pricePerHour: number;
}

export const MACHINE_TYPES: MachineType[] = [
  { id: 'standard-4', vcpu: 4, memoryGb: 15, pricePerHour: 0.19 },
  { id: 'standard-8', vcpu: 8, memoryGb: 30, pricePerHour: 0.38 },
  { id: 'standard-16', vcpu: 16, memoryGb: 60, pricePerHour: 0.76 },
  { id: 'highmem-16', vcpu: 16, memoryGb: 104, pricePerHour: 0.95 },
  { id: 'highgpu-12', vcpu: 12, memoryGb: 85, pricePerHour: 1.12 },
];

export interface Accelerator {
  id: string;
  label: string;
  pricePerHour: number;
}

export const ACCELERATORS: Accelerator[] = [
  { id: 'NVIDIA_T4', label: 'NVIDIA T4', pricePerHour: 0.35 },
  { id: 'NVIDIA_L4', label: 'NVIDIA L4', pricePerHour: 0.7 },
  { id: 'NVIDIA_A100_80GB', label: 'NVIDIA A100 80GB', pricePerHour: 3.93 },
];

export const ACCELERATOR_COUNTS = [1, 2, 4, 8];

export const DISK_TYPES = [
  { id: 'ssd', label: 'SSD 영구 디스크', pricePerGbMonth: 0.17 },
  { id: 'standard', label: '표준 영구 디스크', pricePerGbMonth: 0.04 },
];

export const SPOT_DISCOUNT = 0.6; // 머신·가속기 비용 60% 할인

export function machineOf(id: string): MachineType {
  return MACHINE_TYPES.find((m) => m.id === id) ?? MACHINE_TYPES[0];
}

export function acceleratorOf(id: string): Accelerator | undefined {
  return ACCELERATORS.find((a) => a.id === id);
}

export interface Framework {
  id: string;
  label: string;
  versions: string[];
  gpu: boolean; // GPU 이미지가 있는지
}

export const TRAINING_FRAMEWORKS: Framework[] = [
  { id: 'pytorch', label: 'PyTorch', versions: ['2.4', '2.3', '2.2'], gpu: true },
];

export const PREDICTION_FRAMEWORKS: Framework[] = TRAINING_FRAMEWORKS;

export function frameworkOf(id: string): Framework {
  return TRAINING_FRAMEWORKS.find((f) => f.id === id) ?? TRAINING_FRAMEWORKS[0];
}

const REGISTRY = 'registry.devoops.io';

// 사전 빌드 학습 이미지: 프레임워크·버전·GPU 여부로 정해진다.
export function trainingImage(framework: string, version: string, gpu: boolean): string {
  const device = gpu && frameworkOf(framework).gpu ? 'gpu' : 'cpu';
  return `${REGISTRY}/training/${framework}-${device}.${version.replace('.', '-')}:latest`;
}

export function predictionImage(framework: string, version: string, gpu: boolean): string {
  const device = gpu && frameworkOf(framework).gpu ? 'gpu' : 'cpu';
  return `${REGISTRY}/prediction/${framework}-${device}.${version.replace('.', '-')}:latest`;
}

export const TASK_DEFINITION = {
  custom: 'ds://schema/trainingjob/definition/custom_task_1.0.0.yaml',
  hpt: 'ds://schema/trainingjob/definition/hyperparameter_tuning_task_1.0.0.yaml',
};

export function resourceName(region: string, kind: string, id: string): string {
  return `projects/${PROJECT}/locations/${region}/${kind}/${id}`;
}
