import { GPUS, gpuOf, supportsLora, type Model } from '../mock/catalog';

export type PresetId = 'fast' | 'balanced' | 'best';

export interface Hyperparameters {
  epochs: number;
  learningRate: number;
  batchSize: number;
  lora: boolean;
  loraRank: number;
}

export const PRESETS: { id: PresetId; label: string; description: string; hyper: Hyperparameters }[] = [
  { id: 'fast', label: '빠르게', description: '1 epoch · 결과를 빨리 확인', hyper: { epochs: 1, learningRate: 2e-4, batchSize: 32, lora: true, loraRank: 8 } },
  { id: 'balanced', label: '균형', description: '3 epoch · 대부분의 경우 추천', hyper: { epochs: 3, learningRate: 1e-4, batchSize: 16, lora: true, loraRank: 16 } },
  { id: 'best', label: '최고 품질', description: '5 epoch · 전체 미세조정', hyper: { epochs: 5, learningRate: 5e-5, batchSize: 8, lora: false, loraRank: 64 } },
];

// 프리셋 값을 모델에 맞춘다. LoRA를 못 쓰는 모델(작은 인코더·트리)은 끈다.
export function presetHyper(id: PresetId, model: Model | undefined): Hyperparameters {
  const h = PRESETS.find((p) => p.id === id)!.hyper;
  return { ...h, lora: h.lora && !!model && supportsLora(model) };
}

export function validateHyper(h: Hyperparameters): Partial<Record<keyof Hyperparameters, string>> {
  const e: Partial<Record<keyof Hyperparameters, string>> = {};
  if (!Number.isInteger(h.epochs) || h.epochs < 1 || h.epochs > 20) e.epochs = '1–20 사이 정수';
  if (!Number.isFinite(h.learningRate) || h.learningRate <= 0 || h.learningRate > 0.01) e.learningRate = '0보다 크고 0.01 이하';
  if (!Number.isInteger(h.batchSize) || h.batchSize < 1 || h.batchSize > 256) e.batchSize = '1–256 사이 정수';
  if (h.lora && (!Number.isInteger(h.loraRank) || h.loraRank < 1 || h.loraRank > 256)) e.loraRank = '1–256 사이 정수';
  return e;
}

export interface GpuChoice {
  gpuId: string;
  count: number;
}

// 학습에 필요한 GPU 메모리(GB, 목업): LoRA는 파라미터당 약 2GB/B, 전체 미세조정은 약 18GB/B + 여유 4GB.
export function requiredMemoryGb(model: Model, lora: boolean): number {
  if (model.params === 0) return 0;
  return Math.round((model.params * (lora ? 2 : 18) + 4) * 10) / 10;
}

// 메모리가 들어가는 가장 작은 GPU를 고른다. 한 장으로 안 되면 A100을 여러 장 쓴다. 트리 모델은 CPU.
export function recommendGpu(model: Model, lora: boolean): GpuChoice {
  const need = requiredMemoryGb(model, lora);
  if (need === 0) return { gpuId: 'cpu', count: 1 };
  const fit = GPUS.find((g) => g.memoryGb >= need);
  if (fit) return { gpuId: fit.id, count: 1 };
  const big = GPUS[GPUS.length - 1];
  return { gpuId: big.id, count: Math.ceil(need / big.memoryGb) };
}

export interface EstimateInput {
  model: Model;
  gpu: GpuChoice;
  trainRows: number;
  hyper: Hyperparameters;
}

export interface Estimate {
  minutes: number;
  costUsd: number;
}

const OVERHEAD_MIN = 3; // 데이터 검증·평가·등록

// 목업 공식: 샘플 하나를 T4에서 처리하는 시간(초) × 행 수 × epoch ÷ (GPU 속도 × 장 수) + 고정 오버헤드.
export function estimate({ model, gpu, trainRows, hyper }: EstimateInput): Estimate {
  const g = gpuOf(gpu.gpuId);
  const perSample = model.params === 0 ? 0.0002 : 0.002 + model.params * 0.03 * (hyper.lora ? 0.6 : 1);
  const seconds = (perSample * trainRows * hyper.epochs) / (g.speed * gpu.count);
  const minutes = Math.ceil(seconds / 60) + OVERHEAD_MIN;
  const costUsd = Math.round((minutes / 60) * g.pricePerHour * gpu.count * 100) / 100;
  return { minutes, costUsd };
}

export function formatMinutes(min: number): string {
  if (min < 60) return `약 ${min}분`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `약 ${h}시간 ${m}분` : `약 ${h}시간`;
}
