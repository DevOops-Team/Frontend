import { describe, expect, it } from 'vitest';
import { modelOf } from '../mock/catalog';
import { estimate, formatMinutes, presetHyper, recommendGpu, requiredMemoryGb, validateHyper } from './estimate';

const bert = modelOf('klue/bert-base')!;
const llama = modelOf('meta-llama/Llama-3.1-8B')!;
const xgb = modelOf('xgboost')!;

describe('presets', () => {
  it('turns LoRA off for models that cannot use it', () => {
    expect(presetHyper('balanced', llama)).toEqual({ epochs: 3, learningRate: 1e-4, batchSize: 16, lora: true, loraRank: 16 });
    expect(presetHyper('balanced', bert).lora).toBe(false);
    expect(presetHyper('best', llama).lora).toBe(false);
  });

  it('validates hyperparameters', () => {
    expect(validateHyper(presetHyper('fast', llama))).toEqual({});
    expect(Object.keys(validateHyper({ epochs: 0, learningRate: 0, batchSize: 1.5, lora: true, loraRank: 0 }))).toEqual(['epochs', 'learningRate', 'batchSize', 'loraRank']);
  });
});

describe('recommendGpu', () => {
  it('picks the smallest GPU that fits, multiple A100s, or CPU for trees', () => {
    expect(requiredMemoryGb(llama, true)).toBe(20);
    expect(recommendGpu(llama, true)).toEqual({ gpuId: 'l4', count: 1 });
    expect(recommendGpu(llama, false)).toEqual({ gpuId: 'a100', count: 2 });
    expect(recommendGpu(bert, false)).toEqual({ gpuId: 't4', count: 1 });
    expect(recommendGpu(xgb, false)).toEqual({ gpuId: 'cpu', count: 1 });
  });
});

describe('estimate', () => {
  const hyper = presetHyper('balanced', bert);

  it('computes time and cost with the mock formula', () => {
    // 0.0053s × 10800행 × 3 epoch ÷ T4(1) = 171.7초 → 3분 + 오버헤드 3분 = 6분, 6/60 × $0.53 = $0.05
    expect(estimate({ model: bert, gpu: { gpuId: 't4', count: 1 }, trainRows: 10800, hyper })).toEqual({ minutes: 6, costUsd: 0.05 });
  });

  it('gets faster with a faster GPU and more expensive with more rows', () => {
    const base = estimate({ model: llama, gpu: { gpuId: 'l4', count: 1 }, trainRows: 50000, hyper: presetHyper('balanced', llama) });
    const fast = estimate({ model: llama, gpu: { gpuId: 'a100', count: 1 }, trainRows: 50000, hyper: presetHyper('balanced', llama) });
    const more = estimate({ model: llama, gpu: { gpuId: 'l4', count: 1 }, trainRows: 100000, hyper: presetHyper('balanced', llama) });
    expect(fast.minutes).toBeLessThan(base.minutes);
    expect(more.costUsd).toBeGreaterThan(base.costUsd);
  });

  it('formats minutes', () => {
    expect(formatMinutes(45)).toBe('약 45분');
    expect(formatMinutes(120)).toBe('약 2시간');
    expect(formatMinutes(135)).toBe('약 2시간 15분');
  });
});
