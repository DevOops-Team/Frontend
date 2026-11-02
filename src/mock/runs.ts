import { taskOf, type TaskId } from './catalog';
import type { Estimate } from '../lib/estimate';
import type { TrainingRequest } from '../lib/request';

// 목업 실행: 타이머로 tick()을 부르면 단계가 진행되고 loss·평가 지표가 쌓인다. 백엔드 호출 없음.

export type RunStatus = 'Queued' | 'Running' | 'Succeeded' | 'Failed';
export const STAGES = ['데이터 검증', '토크나이즈', '학습', '평가', '모델 등록'] as const;
export const TRAIN_STAGE = 2;
export const TICK_MS = 1500; // 화면이 tick()을 부르는 간격
const TRAIN_TICKS = 12; // 학습 단계를 몇 번의 tick으로 끝낼지

export interface Point {
  step: number;
  value: number;
}

export interface RunMeta {
  datasetTitle: string;
  rows: number;
  labels: string[];
  estimate: Estimate;
  gpuLabel: string;
}

export interface Run extends RunMeta {
  id: string;
  request: TrainingRequest;
  status: RunStatus;
  stage: number; // 지금 단계(0–4). 모두 끝나면 STAGES.length
  stageProgress: number; // 지금 단계 안의 진행률 0–1
  step: number;
  totalSteps: number;
  loss: Point[];
  metric: Point[];
  createdAt: string;
  failure?: { stage: number; reason: string };
  // 시드 실행이 일부러 실패할 지점
  failAt?: { stage: number; reason: string };
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// 결정적 노이즈 [-0.5, 0.5)
function noise(seed: number, n: number): number {
  const x = Math.sin(seed * 0.001 + n * 78.233) * 43758.5453;
  return x - Math.floor(x) - 0.5;
}

export function metricName(task: TaskId): string {
  return taskOf(task).metric;
}

export function trainRows(run: Pick<Run, 'rows' | 'request'>): number {
  return Math.round(run.rows * run.request.dataset.split.train);
}

function finalMetric(run: Run): number {
  const r = (hash(run.id) % 1000) / 1000;
  return taskOf(run.request.task).metricKind === 'classification' ? 0.86 + r * 0.07 : 0.38 + r * 0.08;
}

function lossAt(run: Run, step: number): number {
  const x = step / run.totalSteps;
  const generation = taskOf(run.request.task).metricKind === 'generation';
  const [start, floor] = generation ? [2.4, 0.9] : [1.1, 0.18];
  const v = floor + (start - floor) * Math.exp(-3.5 * x) + noise(hash(run.id), step) * 0.06 * (1 - x / 2);
  return Math.round(v * 10000) / 10000;
}

function metricAt(run: Run, step: number): number {
  const x = step / run.totalSteps;
  const generation = taskOf(run.request.task).metricKind === 'generation';
  const start = generation ? 0.15 : 0.45;
  const v = start + (finalMetric(run) - start) * (1 - Math.exp(-4 * x)) + noise(hash(run.id) + 7, step) * 0.012;
  return Math.round(v * 10000) / 10000;
}

let counter = 0;
export function newRunId(): string {
  counter += 1;
  return `run-${(Date.now() % 46656).toString(36).padStart(3, '0')}${counter.toString(36)}`;
}

export function createRun(request: TrainingRequest, meta: RunMeta, opts: { id?: string; createdAt?: string; failAt?: Run['failAt'] } = {}): Run {
  const rows = Math.round(meta.rows * request.dataset.split.train);
  const totalSteps = Math.max(10, Math.ceil(rows / request.hyperparameters.batch_size) * request.hyperparameters.epochs);
  return {
    ...meta,
    id: opts.id ?? newRunId(),
    request,
    status: 'Queued',
    stage: 0,
    stageProgress: 0,
    step: 0,
    totalSteps,
    loss: [],
    metric: [],
    createdAt: opts.createdAt ?? new Date().toISOString(),
    failAt: opts.failAt,
  };
}

// 한 번 진행한다. 끝난 실행은 그대로 돌려준다.
export function tick(run: Run): Run {
  if (run.status === 'Succeeded' || run.status === 'Failed') return run;
  if (run.status === 'Queued') return { ...run, status: 'Running' };

  if (run.failAt && run.failAt.stage === run.stage && run.stageProgress >= 0.5) {
    return { ...run, status: 'Failed', failure: run.failAt };
  }

  if (run.stage === TRAIN_STAGE) {
    const step = Math.min(run.totalSteps, run.step + Math.ceil(run.totalSteps / TRAIN_TICKS));
    const next = {
      ...run,
      step,
      loss: [...run.loss, { step, value: lossAt(run, step) }],
      metric: [...run.metric, { step, value: metricAt(run, step) }],
      stageProgress: step / run.totalSteps,
    };
    return step >= run.totalSteps ? { ...next, stage: run.stage + 1, stageProgress: 0 } : next;
  }

  const stageProgress = run.stageProgress + (run.stage === STAGES.length - 1 ? 1 : 0.5);
  if (stageProgress < 1) return { ...run, stageProgress };
  const stage = run.stage + 1;
  if (stage >= STAGES.length) return { ...run, stage, stageProgress: 0, status: 'Succeeded' };
  return { ...run, stage, stageProgress: 0 };
}

export function advance(run: Run, ticks: number): Run {
  let r = run;
  for (let i = 0; i < ticks; i++) r = tick(r);
  return r;
}

export function overallProgress(run: Run): number {
  if (run.status === 'Succeeded') return 1;
  return Math.min(1, (run.stage + run.stageProgress) / STAGES.length);
}

export function stageState(run: Run, i: number): 'done' | 'active' | 'failed' | 'todo' {
  if (run.failure && run.failure.stage === i) return 'failed';
  if (i < run.stage || run.status === 'Succeeded') return 'done';
  if (i === run.stage && run.status === 'Running') return 'active';
  return 'todo';
}

export function registryName(run: Run): string {
  return `devoops/${run.request.name}:v1`;
}

// ── 평가 결과 (목업) ───────────────────────────────────────────

export interface Evaluation {
  metrics: { name: string; value: number }[];
  confusion?: { labels: string[]; matrix: number[][] };
  samples?: { input: string; reference: string; prediction: string }[];
}

const GENERATION_SAMPLES: Record<string, Evaluation['samples']> = {
  'instruction-sft': [
    { input: '환불은 며칠 걸리나요?', reference: '카드 결제는 취소 후 영업일 기준 3–5일 안에 환불됩니다.', prediction: '카드 결제 취소 후 보통 영업일 3–5일 안에 환불이 완료됩니다.' },
    { input: '회원 탈퇴는 어떻게 하나요?', reference: '마이페이지 > 설정 > 회원 탈퇴에서 진행할 수 있습니다.', prediction: '마이페이지의 설정 메뉴에서 회원 탈퇴를 선택하시면 됩니다.' },
    { input: '해외 배송 되나요?', reference: '현재는 국내 배송만 지원합니다.', prediction: '죄송하지만 지금은 국내 배송만 가능합니다.' },
  ],
  summarization: [
    { input: '정부는 내년부터 청년 월세 지원 대상을 소득 기준 중위 60%에서 100%로 확대한다고 밝혔다…', reference: '청년 월세 지원 대상이 중위소득 100%로 확대된다.', prediction: '내년부터 청년 월세 지원이 중위소득 100%까지 늘어난다.' },
    { input: '국내 반도체 수출이 석 달 연속 증가했다. 산업부는 AI 서버용 메모리 수요가…', reference: '반도체 수출이 석 달 연속 늘었다.', prediction: 'AI 메모리 수요로 반도체 수출이 3개월 연속 증가했다.' },
    { input: '기상청은 이번 주말 중부 지방에 첫눈이 올 수 있다고 예보했다…', reference: '주말 중부 지방에 첫눈이 예상된다.', prediction: '이번 주말 중부에 첫눈과 영하권 추위가 온다.' },
  ],
};

export function evaluation(run: Run): Evaluation {
  const m = run.metric.length ? run.metric[run.metric.length - 1].value : finalMetric(run);
  const r3 = (x: number) => Math.round(x * 1000) / 1000;
  if (taskOf(run.request.task).metricKind === 'generation') {
    return {
      metrics: [
        { name: 'ROUGE-1', value: r3(m + 0.08) },
        { name: 'ROUGE-2', value: r3(m - 0.14) },
        { name: 'ROUGE-L', value: r3(m) },
        { name: 'BLEU', value: r3(m - 0.19) },
      ],
      samples: GENERATION_SAMPLES[run.request.task],
    };
  }
  const labels = run.labels.length >= 2 ? run.labels.slice(0, 5) : ['0', '1'];
  const valRows = run.rows - trainRows(run);
  const per = Math.max(1, Math.round(valRows / labels.length));
  const seed = hash(run.id);
  const matrix = labels.map((_, i) => {
    const correct = Math.round(per * (m + noise(seed, i) * 0.04));
    const wrong = per - correct;
    const others = labels.length - 1;
    return labels.map((__, j) => (i === j ? correct : Math.floor(wrong / others) + (j === (i + 1) % labels.length ? wrong % others : 0)));
  });
  return {
    metrics: [
      { name: '정확도', value: r3(m + 0.01) },
      { name: '정밀도', value: r3(m - 0.005) },
      { name: '재현율', value: r3(m - 0.012) },
      { name: 'F1', value: r3(m) },
    ],
    confusion: { labels, matrix },
  };
}

// ── 플레이그라운드 (목업 추론) ────────────────────────────────────

export interface Prediction {
  text?: string;
  scores?: { label: string; p: number }[];
}

const POSITIVE = /(좋|최고|추천|만족|재밌|재미있|훌륭|빠르|great|good|love)/i;
const NEGATIVE = /(별로|최악|환불|고장|느리|짜증|실망|아깝|bad|worst|hate)/i;

function isPositiveLabel(l: string) {
  return /^(긍정|positive|pos|1|yes|정상|healthy)$/i.test(l);
}

export function predict(run: Run, input: string): Prediction {
  const text = input.trim();
  if (!text) return {};
  const task = run.request.task;
  if (task === 'instruction-sft') {
    return { text: `요청하신 "${text.slice(0, 40)}"에 대해 안내드립니다. 고객센터 정책에 따라 마이페이지에서 바로 처리하실 수 있으며, 추가 도움이 필요하면 1:1 문의를 남겨 주세요. (목업 응답)` };
  }
  if (task === 'summarization') {
    const first = text.split(/(?<=[.!?。])\s+|\n/)[0];
    return { text: first.length > 60 ? `${first.slice(0, 60)}…` : first };
  }
  const labels = run.labels.length >= 2 ? run.labels.slice(0, 5) : ['0', '1'];
  const pos = POSITIVE.test(text);
  const neg = NEGATIVE.test(text);
  const raw = labels.map((l, i) => {
    let s = ((hash(text + l) % 100) / 100) * 1.5 + (i === 0 ? 0.2 : 0);
    if (pos && isPositiveLabel(l)) s += 3;
    if (neg && !isPositiveLabel(l) && !/중립/.test(l)) s += 3;
    return Math.exp(s);
  });
  const sum = raw.reduce((a, b) => a + b, 0);
  return {
    scores: labels.map((label, i) => ({ label, p: raw[i] / sum })).sort((a, b) => b.p - a.p),
  };
}
