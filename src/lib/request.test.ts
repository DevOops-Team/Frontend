import { describe, expect, it } from 'vitest';
import { buildRequest, defaultRunName, validateRunName } from './request';

describe('buildRequest', () => {
  it('builds the API request body and drops unmapped optional roles', () => {
    expect(
      buildRequest({
        name: 'koalpaca-cs',
        task: 'instruction-sft',
        baseModel: 'beomi/KoAlpaca-Polyglot-5.8B',
        source: 'upload',
        datasetRef: 'cs.jsonl',
        format: 'jsonl',
        mapping: { instruction: 'q', input: '', output: 'a' },
        trainPercent: 85,
        preset: 'balanced',
        hyper: { epochs: 3, learningRate: 1e-4, batchSize: 16, lora: true, loraRank: 16 },
        gpu: { gpuId: 't4', count: 1 },
        gpuAuto: true,
      }),
    ).toEqual({
      name: 'koalpaca-cs',
      task: 'instruction-sft',
      base_model: 'beomi/KoAlpaca-Polyglot-5.8B',
      dataset: { source: 'upload', uri: 'upload://cs.jsonl', format: 'jsonl', columns: { instruction: 'q', output: 'a' }, split: { train: 0.85, validation: 0.15, seed: 42 } },
      hyperparameters: { preset: 'balanced', epochs: 3, learning_rate: 0.0001, batch_size: 16, lora: { enabled: true, rank: 16 } },
      compute: { gpu: 't4', gpu_count: 1, auto: true },
    });
  });

  it('uses hf:// and sample:// URIs and omits rank when LoRA is off', () => {
    const base = {
      name: 'x', task: 'text-classification' as const, baseModel: 'klue/bert-base', format: 'hf' as const,
      mapping: { text: 'document', label: 'label' }, trainPercent: 90, preset: 'custom' as const,
      hyper: { epochs: 1, learningRate: 2e-5, batchSize: 32, lora: false, loraRank: 8 }, gpu: { gpuId: 'a10g', count: 2 }, gpuAuto: false,
    };
    const hf = buildRequest({ ...base, source: 'huggingface', datasetRef: 'e9t/nsmc' });
    expect(hf.dataset.uri).toBe('hf://e9t/nsmc');
    expect(hf.hyperparameters.lora).toEqual({ enabled: false });
    expect(hf.compute).toEqual({ gpu: 'a10g', gpu_count: 2, auto: false });
    expect(buildRequest({ ...base, source: 'sample', datasetRef: 'sample/ko-shopping-reviews' }).dataset.uri).toBe('sample://ko-shopping-reviews');
  });
});

describe('run name', () => {
  it('derives a slug from model and dataset', () => {
    expect(defaultRunName('klue/bert-base', 'e9t/nsmc')).toBe('bert-base-nsmc');
    expect(defaultRunName('Qwen/Qwen2.5-7B', 'My Data_v2.CSV')).toBe('qwen2-5-7b-my-data-v2');
    expect(validateRunName('bert-base-nsmc')).toBeNull();
    expect(validateRunName('-bad')).not.toBeNull();
    expect(validateRunName('Upper')).not.toBeNull();
  });
});
