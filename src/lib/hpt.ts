import type { ParameterSpec, StudySpec } from './pipeline';

// 초매개변수 조정 시도(trial) 목업: studySpec으로 매개변수 값을 뽑고 측정항목 값을 정한다. 결정적이다(같은 seed → 같은 결과).

export type TrialState = 'REQUESTED' | 'ACTIVE' | 'SUCCEEDED' | 'INFEASIBLE';

export interface Trial {
  id: string;
  params: Record<string, number | string>;
  state: TrialState;
  metric?: number;
  startTick?: number;
  // 끝나면 공개할 값
  planned: { metric: number; infeasible: boolean };
}

export function rand(seed: number, a: number, b = 0): number {
  const x = Math.sin(seed * 12.9898 + a * 78.233 + b * 37.719) * 43758.5453;
  return x - Math.floor(x);
}

function sig(n: number): number {
  return Number(n.toPrecision(3));
}

// 그리드 검색용 후보 값. INTEGER는 범위가 작으면 전부, 크면 5개로 나눈다.
export function gridValues(p: ParameterSpec): (number | string)[] {
  if (p.categoricalValueSpec) return p.categoricalValueSpec.values;
  if (p.discreteValueSpec) return p.discreteValueSpec.values;
  if (p.integerValueSpec) {
    const [lo, hi] = [Number(p.integerValueSpec.minValue), Number(p.integerValueSpec.maxValue)];
    if (hi - lo <= 9) return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
    return Array.from({ length: 5 }, (_, i) => Math.round(lo + ((hi - lo) * i) / 4));
  }
  return [];
}

function fromUnit(p: ParameterSpec, u: number): number | string {
  const log = p.scaleType === 'UNIT_LOG_SCALE';
  if (p.doubleValueSpec) {
    const { minValue: lo, maxValue: hi } = p.doubleValueSpec;
    return sig(log ? Math.exp(Math.log(lo) + u * (Math.log(hi) - Math.log(lo))) : lo + u * (hi - lo));
  }
  if (p.integerValueSpec) {
    const [lo, hi] = [Number(p.integerValueSpec.minValue), Number(p.integerValueSpec.maxValue)];
    return Math.round(log ? Math.exp(Math.log(lo) + u * (Math.log(hi) - Math.log(lo))) : lo + u * (hi - lo));
  }
  const values = gridValues(p);
  return values[Math.min(values.length - 1, Math.floor(u * values.length))];
}

// 값 → 0–1 위치. 측정항목 목업은 각 매개변수가 0.4 근처일 때 가장 좋다.
function toUnit(p: ParameterSpec, v: number | string): number {
  const log = p.scaleType === 'UNIT_LOG_SCALE';
  if (p.doubleValueSpec || p.integerValueSpec) {
    const lo = p.doubleValueSpec ? p.doubleValueSpec.minValue : Number(p.integerValueSpec!.minValue);
    const hi = p.doubleValueSpec ? p.doubleValueSpec.maxValue : Number(p.integerValueSpec!.maxValue);
    const n = Number(v);
    return log ? (Math.log(n) - Math.log(lo)) / (Math.log(hi) - Math.log(lo) || 1) : (n - lo) / (hi - lo || 1);
  }
  const values = gridValues(p);
  return values.length > 1 ? values.indexOf(v) / (values.length - 1) : 0.4;
}

export function sampleParams(study: StudySpec, index: number, seed: number): Record<string, number | string> {
  const out: Record<string, number | string> = {};
  if (study.algorithm === 'GRID_SEARCH') {
    let k = index;
    for (const p of study.parameters) {
      const values = gridValues(p);
      out[p.parameterId] = values[k % values.length];
      k = Math.floor(k / values.length);
    }
    return out;
  }
  study.parameters.forEach((p, j) => {
    let u = rand(seed, index, j);
    // 기본 알고리즘(베이지안 최적화 흉내): 몇 번 시도한 뒤에는 좋은 영역(0.4 근처) 주변을 더 찾는다.
    if (study.algorithm === 'ALGORITHM_UNSPECIFIED' && index >= 3) u = 0.4 + (u - 0.5) * 0.3;
    out[p.parameterId] = fromUnit(p, Math.min(1, Math.max(0, u)));
  });
  return out;
}

export function trialMetric(study: StudySpec, params: Record<string, number | string>, seed: number, index: number): number {
  const ps = study.parameters;
  const dist = ps.length ? ps.reduce((n, p) => n + Math.abs(toUnit(p, params[p.parameterId]) - 0.4), 0) / ps.length : 0.3;
  const closeness = Math.max(0, 1 - dist * 1.6) + (rand(seed, index, 99) - 0.5) * 0.06;
  const goal = study.metrics[0]?.goal ?? 'MAXIMIZE';
  const v = goal === 'MAXIMIZE' ? 0.7 + 0.25 * closeness : 0.15 + 0.4 * (1 - closeness);
  return Math.round(v * 10000) / 10000;
}

export function planTrial(study: StudySpec, index: number, seed: number): Trial {
  const params = sampleParams(study, index, seed);
  return {
    id: String(index + 1),
    params,
    state: 'REQUESTED',
    planned: { metric: trialMetric(study, params, seed, index), infeasible: rand(seed, index, 7) < 0.1 },
  };
}

export function bestTrial(trials: Trial[], goal: 'MAXIMIZE' | 'MINIMIZE'): Trial | undefined {
  const done = trials.filter((t) => t.state === 'SUCCEEDED' && t.metric !== undefined);
  if (done.length === 0) return undefined;
  return done.reduce((best, t) => ((goal === 'MAXIMIZE' ? t.metric! > best.metric! : t.metric! < best.metric!) ? t : best));
}
