import { bestTrial, planTrial, rand, type Trial } from '../lib/hpt';
import { modelDirectory, type CustomJobSpec, type PipelineRequest, type StudySpec } from '../lib/pipeline';
import { resourceName } from './catalog';

// 목업 저장소와 시뮬레이션. 화면이 TICK_MS마다 tickStore()를 부르면 파이프라인·조정 작업이 진행되고,
// 성공한 파이프라인은 <출력 디렉터리>/model/의 아티팩트로 모델 레지스트리에 모델(또는 새 버전)을 올린다.

export const TICK_MS = 1500;
export const TICK_SECONDS = 30; // tick 하나가 나타내는 목업 경과 시간
const TRAIN_TICKS = 8;
const TRIAL_TICKS = 2;
const LOG_LIMIT = 200;

export type PipelineState = 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';

export interface Point {
  step: number;
  value: number;
}

export interface Dataset {
  id: string;
  displayName: string;
  type: '표 형식' | '이미지' | '텍스트';
  annotationSets: string[];
  items: number;
  region: string;
  createdAt: string;
}

export interface TimelineEvent {
  t: number; // 생성 후 경과 초
  message: string;
  level: 'info' | 'warning' | 'error';
}

export interface Pipeline {
  id: string;
  displayName: string;
  state: PipelineState;
  region: string;
  request: PipelineRequest;
  createdAt: string;
  tick: number;
  trainTicks: number;
  failAt?: { tick: number; message: string };
  customJobId: string;
  hptJobId?: string;
  modelId?: string;
  modelVersion?: number;
  error?: string;
  events: TimelineEvent[];
  cpu: Point[];
  gpu: Point[];
  logs: string[][]; // 작업자 풀별
  seed: number;
}

export interface HptJob {
  id: string;
  displayName: string;
  pipelineId: string;
  state: PipelineState;
  region: string;
  study: StudySpec;
  maxTrials: number;
  parallel: number;
  trials: Trial[];
  createdAt: string;
  seed: number;
}

export interface ModelVersion {
  trainingInputs?: CustomJobSpec['runner'];
  versionId: number;
  createdAt: string;
  artifactUri: string;
  pipelineId: string;
  imageUri: string;
  description?: string;
}

export interface Model {
  id: string;
  displayName: string;
  description: string;
  region: string;
  createdAt: string;
  versions: ModelVersion[];
}

export interface Deployment {
  modelId: string;
  modelName: string;
  versionId: number;
  machineType: string;
  minReplicas: number;
  maxReplicas: number;
  traffic: number;
}

export interface Endpoint {
  id: string;
  displayName: string;
  region: string;
  createdAt: string;
  deployments: Deployment[];
}

export interface Store {
  datasets: Dataset[];
  pipelines: Pipeline[];
  hptJobs: HptJob[];
  models: Model[];
  endpoints: Endpoint[];
}

export function isTerminal(s: PipelineState): boolean {
  return s === 'SUCCEEDED' || s === 'FAILED' || s === 'CANCELLED';
}

export function jobSpec(p: Pipeline): CustomJobSpec {
  const inputs = p.request.body.trainingTaskInputs;
  return 'trialJobSpec' in inputs ? inputs.trialJobSpec : inputs;
}

let counter = 0;
function newId(prefix: string): string {
  counter += 1;
  return `${prefix}-${((Date.now() % 1679616) + counter * 7919).toString(36).padStart(4, '0')}`;
}

function hashSeed(s: string): number {
  let h = 7;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 100000;
  return h;
}

export interface SubmitOptions {
  id?: string;
  createdAt?: string;
  failAt?: Pipeline['failAt'];
}

export function submitPipeline(store: Store, request: PipelineRequest, opts: SubmitOptions = {}): { store: Store; id: string } {
  const id = opts.id ?? newId('pl');
  const region = request.path.split('/locations/')[1].split('/')[0];
  const createdAt = opts.createdAt ?? new Date().toISOString();
  const seed = hashSeed(id);
  const inputs = request.body.trainingTaskInputs;
  const spec = 'trialJobSpec' in inputs ? inputs.trialJobSpec : inputs;
  const pools = spec.workerPoolSpecs.length;
  const pipeline: Pipeline = {
    id,
    displayName: request.body.displayName,
    state: 'PENDING',
    region,
    request,
    createdAt,
    tick: 0,
    trainTicks: TRAIN_TICKS,
    failAt: opts.failAt,
    customJobId: `cj-${id.slice(3)}`,
    events: [{ t: 0, message: `준비된 ${spec.runner.entrypoint}에 모델 '${spec.runner.model}', 데이터 '${spec.runner.dataset}' 전달 (목업)`, level: 'info' }, { t: 0, message: `${('trialJobSpec' in inputs ? inputs.trialJobSpec : inputs).distributedTraining.strategy.toUpperCase()} 학습 요청을 받았습니다`, level: 'info' }],
    cpu: [],
    gpu: [],
    logs: Array.from({ length: pools }, () => []),
    seed,
  };
  let hptJobs = store.hptJobs;
  if ('studySpec' in inputs) {
    pipeline.hptJobId = `hpt-${id.slice(3)}`;
    hptJobs = [
      {
        id: pipeline.hptJobId,
        displayName: `${request.body.displayName}-hpt`,
        pipelineId: id,
        state: 'PENDING',
        region,
        study: inputs.studySpec,
        maxTrials: inputs.maxTrialCount,
        parallel: inputs.parallelTrialCount,
        trials: [],
        createdAt,
        seed,
      },
      ...hptJobs,
    ];
  }
  return { store: { ...store, pipelines: [pipeline, ...store.pipelines], hptJobs }, id };
}

function logLine(p: Pipeline, pool: number, replica: number, text: string): string {
  return `[workerpool${pool}-${replica}] ${text}`;
}

function appendLogs(p: Pipeline, lines: (pool: number) => string[]): string[][] {
  return p.logs.map((l, i) => [...l, ...lines(i)].slice(-LOG_LIMIT));
}

function sampleUtil(p: Pipeline, tick: number): { cpu: Point[]; gpu: Point[] } {
  const hasGpu = jobSpec(p).workerPoolSpecs.some((w) => w.machineSpec.acceleratorType);
  const cpu = [...p.cpu, { step: tick, value: Math.round(42 + rand(p.seed, tick, 1) * 35) }];
  const gpu = hasGpu ? [...p.gpu, { step: tick, value: Math.round(82 + rand(p.seed, tick, 2) * 16) }] : p.gpu;
  return { cpu, gpu };
}

// 모델 레지스트리에 업로드: parentModel이 있으면 새 버전, 없으면 새 모델.
function uploadModel(models: Model[], p: Pipeline, artifactUri: string, now: string): { models: Model[]; modelId: string; version: number } | null {
  const upload = p.request.body.modelToUpload;
  if (!upload) return null;
  const parent = p.request.body.parentModel?.split('/').pop();
  const existing = parent ? models.find((m) => m.id === parent) : undefined;
  if (existing) {
    const version = Math.max(...existing.versions.map((v) => v.versionId)) + 1;
    const v: ModelVersion = { versionId: version, createdAt: now, artifactUri, pipelineId: p.id, trainingInputs: jobSpec(p).runner, imageUri: upload.containerSpec.imageUri, description: upload.description };
    return { models: models.map((m) => (m.id === existing.id ? { ...m, versions: [...m.versions, v] } : m)), modelId: existing.id, version };
  }
  const id = `mdl-${p.id.slice(3)}`;
  const model: Model = {
    id,
    displayName: upload.displayName,
    description: upload.description ?? '',
    region: p.region,
    createdAt: now,
    versions: [{ versionId: 1, createdAt: now, artifactUri, pipelineId: p.id, trainingInputs: jobSpec(p).runner, imageUri: upload.containerSpec.imageUri, description: upload.description }],
  };
  return { models: [model, ...models], modelId: id, version: 1 };
}

function finish(p: Pipeline, store: Store, artifactUri: string, t: number, now: string): { p: Pipeline; models: Model[] } {
  const events: TimelineEvent[] = [...p.events, { t, message: `학습 완료: 모델 아티팩트 저장 → ${artifactUri}`, level: 'info' }];
  const up = uploadModel(store.models, p, artifactUri, now);
  if (up) events.push({ t, message: `모델 레지스트리에 업로드: ${p.request.body.modelToUpload!.displayName} 버전 ${up.version}`, level: 'info' });
  else events.push({ t, message: '예측 컨테이너가 없어 모델을 업로드하지 않았습니다', level: 'warning' });
  events.push({ t, message: '학습 파이프라인 성공', level: 'info' });
  return { p: { ...p, state: 'SUCCEEDED', events, modelId: up?.modelId, modelVersion: up?.version }, models: up ? up.models : store.models };
}

function tickPipeline(p: Pipeline, store: Store, now: string): Store {
  const tick = p.tick + 1;
  const t = tick * TICK_SECONDS;
  const spec = jobSpec(p);
  const replace = (np: Pipeline, extra: Partial<Store> = {}): Store => ({ ...store, ...extra, pipelines: store.pipelines.map((x) => (x.id === p.id ? np : x)) });

  if (p.state === 'PENDING') {
    const replicas = spec.workerPoolSpecs.reduce((n, w) => n + Number(w.replicaCount), 0);
    const events: TimelineEvent[] = [
      ...p.events,
      p.hptJobId ? { t, message: `초매개변수 조정 작업 ${p.hptJobId} 생성`, level: 'info' } : { t, message: `커스텀 작업 ${p.customJobId} 생성`, level: 'info' },
      { t, message: `작업자 풀 ${spec.workerPoolSpecs.length}개 · 복제본 ${replicas}개 프로비저닝${spec.scheduling ? ' (Spot)' : ''}`, level: 'info' },
    ];
    const hptJobs = store.hptJobs.map((j) => (j.id === p.hptJobId ? { ...j, state: 'RUNNING' as const } : j));
    return replace({ ...p, state: 'RUNNING', tick, events }, { hptJobs });
  }

  if (p.failAt && tick >= p.failAt.tick) {
    const events: TimelineEvent[] = [...p.events, { t, message: p.failAt.message, level: 'error' }, { t, message: '학습 파이프라인 실패', level: 'error' }];
    const logs = appendLogs(p, (i) => (i === p.logs.length - 1 ? [logLine(p, i, 0, `ERROR ${p.failAt!.message}`)] : []));
    const hptJobs = store.hptJobs.map((j) => (j.id === p.hptJobId ? { ...j, state: 'FAILED' as const } : j));
    return replace({ ...p, state: 'FAILED', tick, error: p.failAt.message, events, logs }, { hptJobs });
  }

  const util = sampleUtil(p, tick);
  const out = spec.baseOutputDirectory.outputUriPrefix;

  if (p.hptJobId) {
    const job = store.hptJobs.find((j) => j.id === p.hptJobId)!;
    const metricId = job.study.metrics[0].metricId;
    const events = [...p.events];
    // 끝날 때가 된 시도를 마치고, 빈자리만큼 새 시도를 시작한다.
    let trials = job.trials.map((tr) => {
      if (tr.state !== 'ACTIVE' || tick - (tr.startTick ?? tick) < TRIAL_TICKS) return tr;
      const done: Trial = tr.planned.infeasible ? { ...tr, state: 'INFEASIBLE' } : { ...tr, state: 'SUCCEEDED', metric: tr.planned.metric };
      events.push({ t, message: done.state === 'SUCCEEDED' ? `시도 ${tr.id} 완료: ${metricId}=${done.metric}` : `시도 ${tr.id} 실행 불가(INFEASIBLE)`, level: done.state === 'SUCCEEDED' ? 'info' : 'warning' });
      return done;
    });
    let active = trials.filter((tr) => tr.state === 'ACTIVE').length;
    while (active < job.parallel && trials.length < job.maxTrials) {
      trials = [...trials, { ...planTrial(job.study, trials.length, job.seed), state: 'ACTIVE', startTick: tick }];
      active++;
    }
    const logs = appendLogs(p, (i) => trials.filter((tr) => tr.state === 'ACTIVE').map((tr) => logLine(p, i, 0, `trial ${tr.id} ${JSON.stringify(tr.params)} running`)));
    const allDone = trials.length >= job.maxTrials && active === 0;
    if (!allDone) {
      const hptJobs = store.hptJobs.map((j) => (j.id === job.id ? { ...j, trials } : j));
      return replace({ ...p, tick, events, logs, ...util }, { hptJobs });
    }
    const best = bestTrial(trials, job.study.metrics[0].goal);
    const hptJobs = store.hptJobs.map((j) => (j.id === job.id ? { ...j, trials, state: 'SUCCEEDED' as const } : j));
    events.push({ t, message: best ? `최적 시도: ${best.id} (${metricId}=${best.metric})` : '성공한 시도가 없습니다', level: best ? 'info' : 'warning' });
    const base = { ...p, tick, events, logs, ...util };
    if (!best) return replace({ ...base, state: 'FAILED', error: '성공한 시도가 없습니다' }, { hptJobs });
    const f = finish(base, store, modelDirectory(`${out}/${best.id}`), t, now);
    return replace(f.p, { hptJobs, models: f.models });
  }

  const step = tick - 1;
  const total = p.trainTicks;
  const loss = (0.25 + 0.9 * Math.exp((-3 * step) / total) + (rand(p.seed, step, 3) - 0.5) * 0.04).toFixed(4);
  const events = step === 1 ? [...p.events, { t, message: '학습 시작 (모든 복제본 준비됨)', level: 'info' as const }] : p.events;
  const logs = appendLogs(p, (i) =>
    Array.from({ length: Number(spec.workerPoolSpecs[i].replicaCount) }, (_, r) =>
      logLine(p, i, r, i === 0 && r === 0 ? `train.py model=${spec.runner.model} data=${spec.runner.dataset} strategy=${spec.distributedTraining.strategy} gpus=${spec.distributedTraining.worldSize} epoch ${step}/${total} loss=${loss}` : `epoch ${step}/${total} ${spec.distributedTraining.strategy === 'fsdp' ? 'FSDP sharded parameters synced' : 'DDP allreduce ok'}`),
    ),
  );
  const base = { ...p, tick, events, logs, ...util };
  if (step < total) return replace(base);
  const f = finish(base, store, modelDirectory(out), t, now);
  return replace(f.p, { models: f.models });
}

export function tickStore(store: Store, now = new Date().toISOString()): Store {
  let s = store;
  for (const p of store.pipelines) if (!isTerminal(p.state)) s = tickPipeline(s.pipelines.find((x) => x.id === p.id)!, s, now);
  return s;
}

export function advanceStore(store: Store, ticks: number, now?: string): Store {
  let s = store;
  for (let i = 0; i < ticks; i++) s = tickStore(s, now);
  return s;
}

export function cancelPipeline(store: Store, id: string): Store {
  return {
    ...store,
    pipelines: store.pipelines.map((p) =>
      p.id === id && !isTerminal(p.state)
        ? { ...p, state: 'CANCELLED', events: [...p.events, { t: (p.tick + 1) * TICK_SECONDS, message: '사용자가 학습 파이프라인을 취소했습니다', level: 'warning' }] }
        : p,
    ),
    hptJobs: store.hptJobs.map((j) => (j.pipelineId === id && !isTerminal(j.state) ? { ...j, state: 'CANCELLED' } : j)),
  };
}

export interface DeployInput {
  modelId: string;
  versionId: number;
  endpointId: string; // '' = 새 엔드포인트
  endpointName: string;
  machineType: string;
  minReplicas: number;
  maxReplicas: number;
}

// 엔드포인트에 배포(목업). 새 배포가 트래픽 100%를 받는다.
export function deployModel(store: Store, d: DeployInput, now = new Date().toISOString()): { store: Store; endpointId: string } {
  const model = store.models.find((m) => m.id === d.modelId)!;
  const dep: Deployment = { modelId: model.id, modelName: model.displayName, versionId: d.versionId, machineType: d.machineType, minReplicas: d.minReplicas, maxReplicas: d.maxReplicas, traffic: 100 };
  if (d.endpointId) {
    return {
      store: { ...store, endpoints: store.endpoints.map((e) => (e.id === d.endpointId ? { ...e, deployments: [...e.deployments.map((x) => ({ ...x, traffic: 0 })), dep] } : e)) },
      endpointId: d.endpointId,
    };
  }
  const id = newId('ep');
  return { store: { ...store, endpoints: [{ id, displayName: d.endpointName, region: model.region, createdAt: now, deployments: [dep] }, ...store.endpoints] }, endpointId: id };
}

export function modelResource(m: Model): string {
  return resourceName(m.region, 'models', m.id);
}
