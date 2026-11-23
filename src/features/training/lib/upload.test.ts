import { describe, expect, it } from 'vitest';
import { checkpointInterval, checkpointWriters, formatDuration, pickData, pickModel, pickTrain, readTensorShapes, savedParams } from './upload';

const LIMITS = { maxModelBytes: 2 * 2 ** 30, maxDataBytes: 2 ** 30, maxTrainBytes: 2 ** 20, maxFiles: 200 };
const CKPT = { bytesPerParam: 12, writeBytesPerSecond: 100e6, mtbfSeconds: 21600, minIntervalSeconds: 300 };
const QLORA = { r: 16, alpha: 32, dropout: 0.05, target_modules: ['q_proj', 'k_proj', 'v_proj', 'o_proj', 'gate_proj', 'up_proj', 'down_proj'] };

// 헤더만 있는 safetensors 파일 (앞 8바이트 = 헤더 길이, little-endian)
function safetensors(shapes: Record<string, number[]>): Blob {
  const header = new TextEncoder().encode(JSON.stringify({ __metadata__: { format: 'pt' }, ...Object.fromEntries(
    Object.entries(shapes).map(([k, shape]) => [k, { dtype: 'BF16', shape, data_offsets: [0, 0] }])) }));
  const len = new DataView(new ArrayBuffer(8));
  len.setBigUint64(0, BigInt(header.byteLength), true);
  return new Blob([len.buffer, header, 'weights']);
}

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

describe('pickTrain', () => {
  it('accepts exactly one non-empty .py file under the limit', () => {
    expect(pickTrain([{ path: 'my_train.py', size: 100 }], LIMITS)).toEqual({ file: { path: 'my_train.py', size: 100 }, errors: [] });
    expect(pickTrain([], LIMITS).errors[0]).toContain('하나');
    expect(pickTrain([{ path: 'a.py', size: 1 }, { path: 'b.py', size: 1 }], LIMITS).errors[0]).toContain('하나');
    expect(pickTrain([{ path: 'train.sh', size: 1 }], LIMITS).errors[0]).toContain('train.sh');
    expect(pickTrain([{ path: 'train.py', size: 0 }], LIMITS).errors[0]).toContain('비어');
    expect(pickTrain([{ path: 'train.py', size: 2 ** 20 + 1 }], LIMITS).errors[0]).toContain('너무 큽니다');
  });
});

describe('checkpointInterval', () => {
  it('matches the backend Young/Daly computation', () => {
    // Backend ckptpolicy 테스트와 같은 값: 1.5B Full · FSDP 4 → 46.3 s · 1414 s, SmolLM2 DDP 2 → 16.1 s · 835 s
    expect(checkpointInterval(1_543_714_304, checkpointWriters('fsdp', 4), CKPT)).toEqual({ intervalSeconds: 1414, saveSeconds: 46.3 });
    expect(checkpointInterval(134_515_008, checkpointWriters('ddp', 2), CKPT)).toEqual({ intervalSeconds: 835, saveSeconds: 16.1 });
    // 14B QLoRA 어댑터 6,880만 → 2.1 s, 하한 300 s
    expect(checkpointInterval(68_812_800, 4, CKPT)).toEqual({ intervalSeconds: 300, saveSeconds: 2.1 });
  });

  it('counts the parameters a checkpoint saves', () => {
    const shapes = { 'l.0.self_attn.q_proj.weight': [64, 64], 'l.0.self_attn.q_proj.bias': [64], 'l.0.mlp.down_proj.weight': [64, 128], 'embed.weight': [1000, 64] };
    expect(savedParams(shapes, null)).toBe(4096 + 64 + 8192 + 64000);
    expect(savedParams(shapes, QLORA)).toBe(16 * 128 + 16 * 192);
  });

  it('reads tensor shapes from safetensors headers only', async () => {
    const shapes = await readTensorShapes([safetensors({ 'a.q_proj.weight': [4, 8] }), safetensors({ 'b.weight': [3] })]);
    expect(shapes).toEqual({ 'a.q_proj.weight': [4, 8], 'b.weight': [3] });
    expect(await readTensorShapes([new Blob(['not safetensors'])])).toBeNull();
    expect(await readTensorShapes([])).toBeNull();
  });

  it('formats durations for people', () => {
    expect(formatDuration(45)).toBe('45초');
    expect(formatDuration(844)).toBe('14분');
    expect(formatDuration(5400)).toBe('1시간 30분');
  });
});
