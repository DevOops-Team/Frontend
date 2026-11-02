import { describe, expect, it } from 'vitest';
import exampleYaml from './examples/job.yaml?raw';
import { DEFAULT_OPTIONS, HARDWARE, buildJobYaml, totalGpus, validateOptions, type JobOptions } from './jobTemplate';

// 주석을 뺀 의미 있는 줄만 비교한다 (예시 job.yaml은 설명 주석이 많다).
function meaningful(yaml: string) {
  return yaml
    .split('\n')
    .map((l) => l.replace(/\s+#.*$/, '').trimEnd())
    .filter((l) => l.trim() !== '' && !l.trim().startsWith('#'));
}

function opts(over: Partial<JobOptions> = {}): JobOptions {
  return { ...DEFAULT_OPTIONS, ...over };
}

describe('buildJobYaml', () => {
  it('reproduces the example DDP JobSet with the default options (except the name)', () => {
    const generated = meaningful(buildJobYaml(opts({ name: 'ddp-example' })));
    expect(generated).toEqual(meaningful(exampleYaml));
  });

  it('uses the node count for parallelism, completions and torchrun --nnodes', () => {
    const yaml = buildJobYaml(opts({ nodes: 4 }));
    expect(yaml).toContain('parallelism: 4\n');
    expect(yaml).toContain('completions: 4\n');
    expect(yaml).toContain('--nnodes=4 --nproc-per-node=1');
  });

  it('passes total steps and checkpoint interval to train.py', () => {
    const yaml = buildJobYaml(opts({ totalSteps: 12000, ckptEvery: 500 }));
    expect(yaml).toContain('"${CODE_DIR}/train.py" --total-steps 12000 --ckpt-every 500');
  });

  it('writes maxRestarts, name and image', () => {
    const yaml = buildJobYaml(opts({ maxRestarts: 0, name: 'my-run', image: 'repo/img:1.0' }));
    expect(yaml).toContain('maxRestarts: 0');
    expect(yaml).toContain('  name: my-run');
    expect(yaml).toContain('image: repo/img:1.0');
  });

  it('sizes resources and processes per node from the hardware', () => {
    const multi = HARDWARE.find((h) => h.gpus > 1)!;
    const yaml = buildJobYaml(opts({ hardwareId: multi.id, nodes: 2 }));
    expect(yaml).toContain(`--nproc-per-node=${multi.gpus}`);
    expect(yaml).toContain(`cpu: "${multi.cpu}"`);
    expect(yaml).toContain(`memory: ${multi.memory}`);
    expect(yaml.match(new RegExp(`nvidia.com/gpu: ${multi.gpus}\\n`, 'g'))).toHaveLength(2);
    expect(yaml).toContain(multi.instanceType);
  });

  it('records Spot only as a comment so the JobSet stays valid', () => {
    const onDemand = buildJobYaml(opts({ spot: false }));
    const spot = buildJobYaml(opts({ spot: true }));
    expect(spot).toMatch(/^# .*Spot/m);
    expect(meaningful(spot)).toEqual(meaningful(onDemand));
  });

  it('quotes an image that YAML would otherwise misread', () => {
    expect(buildJobYaml(opts({ image: 'reg:5000/a b' }))).toContain('image: "reg:5000/a b"');
  });
});

describe('totalGpus', () => {
  it('multiplies nodes by GPUs per node', () => {
    const multi = HARDWARE.find((h) => h.gpus > 1)!;
    expect(totalGpus(opts({ nodes: 3 }))).toBe(3);
    expect(totalGpus(opts({ nodes: 2, hardwareId: multi.id }))).toBe(2 * multi.gpus);
  });
});

describe('validateOptions', () => {
  it('accepts the defaults', () => {
    expect(validateOptions(DEFAULT_OPTIONS)).toEqual({});
  });

  it('rejects names that are not DNS labels', () => {
    expect(validateOptions(opts({ name: 'My_Run' })).name).toBeDefined();
    expect(validateOptions(opts({ name: '' })).name).toBeDefined();
  });

  it('rejects out-of-range numbers', () => {
    const errors = validateOptions(opts({ nodes: 5, totalSteps: 0, ckptEvery: 0, maxRestarts: -1 }));
    expect(Object.keys(errors).sort()).toEqual(['ckptEvery', 'maxRestarts', 'nodes', 'totalSteps']);
  });

  it('rejects a checkpoint interval longer than the run', () => {
    expect(validateOptions(opts({ totalSteps: 100, ckptEvery: 200 })).ckptEvery).toBeDefined();
  });

  it('rejects an empty image', () => {
    expect(validateOptions(opts({ image: '  ' })).image).toBeDefined();
  });
});
