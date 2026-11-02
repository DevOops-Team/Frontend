import { DISK_TYPES, SPOT_DISCOUNT, acceleratorOf, machineOf } from '../mock/catalog';

export interface WorkerPoolForm {
  machineType: string;
  acceleratorType: string; // '' = 없음
  acceleratorCount: number;
  replicaCount: number;
  diskType: string;
  diskSizeGb: number;
}

export interface PoolPrice {
  machine: number;
  accelerator: number;
  disk: number;
  perReplica: number;
  total: number;
}

const HOURS_PER_MONTH = 730;
const round = (n: number) => Math.round(n * 1000) / 1000;

// 작업자 풀 하나의 시간당 예상 가격(목업). Spot은 머신·가속기에만 할인이 붙고 디스크는 그대로다.
export function poolPrice(pool: WorkerPoolForm, spot: boolean): PoolPrice {
  const factor = spot ? 1 - SPOT_DISCOUNT : 1;
  const machine = machineOf(pool.machineType).pricePerHour * factor;
  const acc = acceleratorOf(pool.acceleratorType);
  const accelerator = acc ? acc.pricePerHour * pool.acceleratorCount * factor : 0;
  const diskRate = DISK_TYPES.find((d) => d.id === pool.diskType)?.pricePerGbMonth ?? 0;
  const disk = (diskRate * pool.diskSizeGb) / HOURS_PER_MONTH;
  const perReplica = machine + accelerator + disk;
  return { machine: round(machine), accelerator: round(accelerator), disk: round(disk), perReplica: round(perReplica), total: round(perReplica * pool.replicaCount) };
}

// 전체 시간당 가격. 초매개변수 조정이면 동시에 도는 시도 수만큼 곱한다.
export function totalHourly(pools: WorkerPoolForm[], spot: boolean, parallelTrials = 1): number {
  const sum = pools.reduce((n, p) => n + poolPrice(p, spot).total, 0);
  return Math.round(sum * parallelTrials * 100) / 100;
}

export function totalGpus(pools: WorkerPoolForm[]): number {
  return pools.reduce((n, p) => n + (p.acceleratorType ? p.acceleratorCount * p.replicaCount : 0), 0);
}
