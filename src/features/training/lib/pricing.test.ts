import { describe, expect, it } from 'vitest';
import { poolPrice, totalGpus, totalHourly } from './pricing';

const pool = { machineType: 'standard-8', acceleratorType: 'NVIDIA_T4', acceleratorCount: 2, replicaCount: 1, diskType: 'ssd', diskSizeGb: 100 };

describe('pricing', () => {
  it('adds machine, accelerators and disk per replica', () => {
    // 0.38 + 0.35×2 + 0.17×100/730
    expect(poolPrice(pool, false)).toEqual({ machine: 0.38, accelerator: 0.7, disk: 0.023, perReplica: 1.103, total: 1.103 });
    expect(poolPrice({ ...pool, replicaCount: 3 }, false).total).toBe(3.31);
  });

  it('discounts machine and accelerator (not disk) for Spot', () => {
    expect(poolPrice(pool, true)).toMatchObject({ machine: 0.152, accelerator: 0.28, disk: 0.023 });
  });

  it('sums pools and multiplies by parallel trials', () => {
    const cpu = { ...pool, acceleratorType: '', acceleratorCount: 0, replicaCount: 2 };
    expect(totalHourly([pool, cpu], false)).toBe(1.91);
    expect(totalHourly([pool], false, 3)).toBe(3.31);
    expect(totalGpus([pool, { ...pool, replicaCount: 2 }, cpu])).toBe(6);
  });
});
