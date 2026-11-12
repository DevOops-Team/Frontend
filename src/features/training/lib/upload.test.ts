import { describe, expect, it } from 'vitest';
import { checkpointInterval, formatDuration, pickData, pickModel } from './upload';

const LIMITS = { maxModelBytes: 2 * 2 ** 30, maxDataBytes: 2 ** 30, maxFiles: 200 };
const CKPT = { sizeFactor: 3, writeBytesPerSecond: 100e6, mtbfSeconds: 21600, minIntervalSeconds: 300 };

describe('pickModel', () => {
  it('keeps one Hugging Face folder and skips hidden files', () => {
    const p = pickModel([
      { path: 'gpt2/config.json', size: 10 },
      { path: 'gpt2/model.safetensors', size: 1000 },
      { path: 'gpt2/.cache/huggingface/lock', size: 5 },
      { path: 'gpt2/.gitattributes', size: 1 },
    ], LIMITS);
    expect(p.folder).toBe('gpt2');
    expect(p.files.map((f) => f.path)).toEqual(['gpt2/config.json', 'gpt2/model.safetensors']);
    expect(p.bytes).toBe(1010);
    expect(p.errors).toEqual([]);
  });

  it('needs config.json and stays under the limit', () => {
    expect(pickModel([{ path: 'x/model.bin', size: 1 }], LIMITS).errors[0]).toContain('config.json');
    expect(pickModel([{ path: 'x/config.json', size: 3 * 2 ** 30 }], LIMITS).errors[0]).toContain('너무 큽니다');
    expect(pickModel([], LIMITS).errors[0]).toContain('선택');
  });
});

describe('pickData', () => {
  it('accepts jsonl only', () => {
    expect(pickData([{ path: 'a.jsonl', size: 5 }], LIMITS).errors).toEqual([]);
    expect(pickData([{ path: 'a.csv', size: 5 }], LIMITS).errors[0]).toContain('a.csv');
    expect(pickData([], LIMITS).errors[0]).toContain('.jsonl');
  });
});

describe('checkpointInterval', () => {
  it('matches the backend Young/Daly computation', () => {
    // GPT-2 small 550 MB → C 16.5 s, τ ≈ 844 s (Backend ckptpolicy 테스트와 같은 값)
    expect(checkpointInterval(550_000_000, CKPT)).toEqual({ intervalSeconds: 844, saveSeconds: 16.5 });
    expect(checkpointInterval(10_000_000, CKPT).intervalSeconds).toBe(300);
  });

  it('formats durations for people', () => {
    expect(formatDuration(45)).toBe('45초');
    expect(formatDuration(844)).toBe('14분');
    expect(formatDuration(5400)).toBe('1시간 30분');
  });
});
