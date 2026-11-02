import { PROJECT, TASK_DEFINITION, predictionImage, resourceName, trainingImage } from '../mock/catalog';
import { totalGpus, type WorkerPoolForm } from './pricing';

// "새 모델 학습" 폼 값 → 검증 → REST 요청 본문(trainingPipelines.create와 같은 구조).

export type ParamType = 'DOUBLE' | 'INTEGER' | 'CATEGORICAL' | 'DISCRETE';
export type Scale = 'LINEAR' | 'LOG';
export type Algorithm = 'DEFAULT' | 'GRID' | 'RANDOM';

export interface HptParamForm {
  id: string;
  type: ParamType;
  min: string;
  max: string;
  values: string; // 쉼표로 구분
  scale: Scale;
}

export type Strategy = 'ddp' | 'fsdp';

export interface PipelineForm {
  strategy: Strategy;
  modelInput: string;
  datasetInput: string;
  datasetSource: 'uri' | 'upload';
  // 1 학습 방법
  datasetId: string; // '' = 관리형 데이터셋 없음
  annotationSet: string;
  split: { training: number; validation: number; test: number }; // %
  // 2 모델 세부정보
  modelMode: 'new' | 'version';
  parentModelId: string;
  modelName: string;
  description: string;
  // 3 학습 컨테이너
  containerKind: 'prebuilt' | 'custom';
  framework: string;
  frameworkVersion: string;
  packageUri: string;
  pythonModule: string;
  imageUri: string;
  outputDir: string;
  args: string[];
  // 4 초매개변수 조정
  hptEnabled: boolean;
  hptParams: HptParamForm[];
  metricId: string;
  goal: 'MAXIMIZE' | 'MINIMIZE';
  maxTrials: number;
  parallelTrials: number;
  algorithm: Algorithm;
  // 5 컴퓨팅 및 가격
  region: string;
  pools: WorkerPoolForm[];
  spot: boolean;
  // 6 예측 컨테이너
  predictionKind: 'none' | 'prebuilt' | 'custom';
  predFramework: string;
  predVersion: string;
  predGpu: boolean;
  predImageUri: string;
  predCommand: string;
}

export const DEFAULT_POOL: WorkerPoolForm = { machineType: 'standard-8', acceleratorType: 'NVIDIA_T4', acceleratorCount: 1, replicaCount: 1, diskType: 'ssd', diskSizeGb: 100 };

export const DEFAULT_FORM: PipelineForm = {
  strategy: 'ddp',
  modelInput: '',
  datasetInput: '',
  datasetSource: 'uri',
  datasetId: '',
  annotationSet: '',
  split: { training: 80, validation: 10, test: 10 },
  modelMode: 'new',
  parentModelId: '',
  modelName: '',
  description: '',
  containerKind: 'prebuilt',
  framework: 'pytorch',
  frameworkVersion: '2.4',
  packageUri: 'ds://devoops-demo/trainer/trainer-0.1.tar.gz',
  pythonModule: 'trainer.task',
  imageUri: '',
  outputDir: 'ds://devoops-demo/training-output',
  args: ['--epochs=10'],
  hptEnabled: false,
  hptParams: [{ id: 'learning_rate', type: 'DOUBLE', min: '0.00001', max: '0.01', values: '', scale: 'LOG' }],
  metricId: 'accuracy',
  goal: 'MAXIMIZE',
  maxTrials: 8,
  parallelTrials: 2,
  algorithm: 'DEFAULT',
  region: 'kr-seoul-1',
  pools: [DEFAULT_POOL],
  spot: false,
  predictionKind: 'prebuilt',
  predFramework: 'pytorch',
  predVersion: '2.4',
  predGpu: false,
  predImageUri: '',
  predCommand: '',
};

export const SECTIONS = [
  { id: 'method', title: '학습 방법', optional: false },
  { id: 'model', title: '모델 세부정보', optional: false },
  { id: 'container', title: '학습 컨테이너', optional: false },
  { id: 'hpt', title: '초매개변수 조정', optional: true },
  { id: 'compute', title: '컴퓨팅 및 가격', optional: false },
  { id: 'prediction', title: '예측 컨테이너', optional: true },
] as const;

export type SectionId = (typeof SECTIONS)[number]['id'];
export type FormErrors = Record<SectionId, string[]>;

const STORAGE_URI = /^ds:\/\/[a-z0-9][a-z0-9._-]*(\/[^\s]*)?$/;
const PACKAGE_URI = /^ds:\/\/[a-z0-9][a-z0-9._-]*\/[^\s]+\.(tar\.gz|whl)$/;
const PY_MODULE = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/;
const IMAGE_URI = /^[a-z0-9.-]+(:[0-9]+)?\/[a-z0-9._/-]+(:[A-Za-z0-9._-]+|@sha256:[a-f0-9]{64})?$/;
const NAME = /^[A-Za-z0-9][A-Za-z0-9_-]{0,62}$/;
const PARAM_ID = /^[A-Za-z_][A-Za-z0-9_]*$/;

function num(s: string): number {
  return s.trim() === '' ? NaN : Number(s);
}

export function splitValues(s: string): string[] {
  return s
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

export function validateParam(p: HptParamForm, algorithm: Algorithm): string[] {
  const e: string[] = [];
  const label = p.id || '(이름 없음)';
  if (!PARAM_ID.test(p.id)) e.push(`매개변수 이름 '${p.id}'은 영문·숫자·밑줄만 쓸 수 있습니다`);
  if (p.type === 'DOUBLE' || p.type === 'INTEGER') {
    const [min, max] = [num(p.min), num(p.max)];
    if (!Number.isFinite(min) || !Number.isFinite(max)) e.push(`${label}: 최솟값과 최댓값을 숫자로 입력하세요`);
    else {
      if (min >= max) e.push(`${label}: 최솟값은 최댓값보다 작아야 합니다`);
      if (p.type === 'INTEGER' && (!Number.isInteger(min) || !Number.isInteger(max))) e.push(`${label}: INTEGER는 정수 범위여야 합니다`);
      if (p.scale === 'LOG' && min <= 0) e.push(`${label}: 로그 스케일은 0보다 큰 범위만 쓸 수 있습니다`);
    }
    if (p.type === 'DOUBLE' && algorithm === 'GRID') e.push(`${label}: 그리드 검색에는 DOUBLE 매개변수를 쓸 수 없습니다`);
  } else {
    const values = splitValues(p.values);
    if (values.length === 0) e.push(`${label}: 값을 하나 이상 입력하세요 (쉼표로 구분)`);
    if (new Set(values).size !== values.length) e.push(`${label}: 값이 중복됩니다`);
    if (p.type === 'DISCRETE' && values.some((v) => !Number.isFinite(Number(v)))) e.push(`${label}: DISCRETE 값은 숫자여야 합니다`);
  }
  return e;
}

export function validateForm(f: PipelineForm, ctx: { modelIds: string[] }): FormErrors {
  const errors: FormErrors = { method: [], model: [], container: [], hpt: [], compute: [], prediction: [] };

  if (!f.modelInput.trim()) errors.method.push('학습 모델을 입력하세요');
  if (!f.datasetInput.trim()) errors.method.push('학습 데이터를 입력하세요');
  if (!['ddp', 'fsdp'].includes(f.strategy)) errors.method.push('DDP 또는 FSDP를 선택하세요');
  if (f.framework !== 'pytorch') errors.container.push('DDP·FSDP 학습에는 PyTorch를 사용하세요');
  if (f.pools.some((p) => !p.acceleratorType || !Number.isInteger(p.acceleratorCount) || p.acceleratorCount < 1)) errors.compute.push('모든 노드에 GPU를 1개 이상 선택하세요');
  if (f.strategy === 'fsdp' && totalGpus(f.pools) < 2) errors.compute.push('FSDP는 GPU 2개 이상이 필요합니다');

  if (f.datasetId) {
    if (!f.annotationSet) errors.method.push('주석 세트를 선택하세요');
    const { training, validation, test } = f.split;
    if ([training, validation, test].some((v) => !Number.isFinite(v) || v < 0)) errors.method.push('분할 비율은 0 이상이어야 합니다');
    else if (training + validation + test !== 100) errors.method.push(`분할 비율의 합이 100%여야 합니다 (지금 ${training + validation + test}%)`);
    else if (training === 0) errors.method.push('학습 비율은 0보다 커야 합니다');
  }

  if (f.modelMode === 'new') {
    if (!NAME.test(f.modelName)) errors.model.push('모델 이름: 영문·숫자로 시작, 영문·숫자·-·_ 최대 63자');
  } else if (!ctx.modelIds.includes(f.parentModelId)) errors.model.push('새 버전을 추가할 모델을 선택하세요');

  if (f.containerKind === 'prebuilt') {
    if (!PACKAGE_URI.test(f.packageUri)) errors.container.push('패키지 위치: ds://버킷/경로/파일.tar.gz 형식이어야 합니다');
    if (!PY_MODULE.test(f.pythonModule)) errors.container.push('Python 모듈: 예) trainer.task');
  } else if (!IMAGE_URI.test(f.imageUri)) errors.container.push('컨테이너 이미지 URI: 예) registry.devoops.io/team/trainer:1.0');
  if (!STORAGE_URI.test(f.outputDir)) errors.container.push('모델 출력 디렉터리: ds://버킷/경로 형식이어야 합니다');
  if (f.args.some((a) => a.trim() === '')) errors.container.push('빈 인수가 있습니다');

  if (f.hptEnabled) {
    if (f.hptParams.length === 0) errors.hpt.push('매개변수를 하나 이상 추가하세요');
    const ids = f.hptParams.map((p) => p.id);
    if (new Set(ids).size !== ids.length) errors.hpt.push('매개변수 이름이 중복됩니다');
    for (const p of f.hptParams) errors.hpt.push(...validateParam(p, f.algorithm));
    if (!PARAM_ID.test(f.metricId)) errors.hpt.push('최적화할 측정항목 이름을 입력하세요');
    if (!Number.isInteger(f.maxTrials) || f.maxTrials < 1 || f.maxTrials > 100) errors.hpt.push('최대 시도 횟수: 1–100');
    if (!Number.isInteger(f.parallelTrials) || f.parallelTrials < 1) errors.hpt.push('병렬 시도 횟수: 1 이상');
    else if (f.parallelTrials > f.maxTrials) errors.hpt.push('병렬 시도 횟수는 최대 시도 횟수보다 클 수 없습니다');
  }

  if (f.pools.length < 1 || f.pools.length > 4) errors.compute.push('작업자 풀은 1–4개입니다');
  f.pools.forEach((p, i) => {
    if (i === 0 && p.replicaCount !== 1) errors.compute.push('작업자 풀 0(기본 복제본)의 복제본 수는 1이어야 합니다');
    if (!Number.isInteger(p.replicaCount) || p.replicaCount < 1 || p.replicaCount > 32) errors.compute.push(`작업자 풀 ${i}: 복제본 수 1–32`);
    if (!Number.isInteger(p.diskSizeGb) || p.diskSizeGb < 100 || p.diskSizeGb > 65536) errors.compute.push(`작업자 풀 ${i}: 디스크 크기 100–65536GB`);
  });

  if (f.predictionKind === 'custom' && !IMAGE_URI.test(f.predImageUri)) errors.prediction.push('예측 컨테이너 이미지 URI를 입력하세요');

  return errors;
}

export function isValid(errors: FormErrors): boolean {
  return Object.values(errors).every((e) => e.length === 0);
}

// ── REST 요청 본문 ──────────────────────────────────────────────

export interface MachineSpec {
  machineType: string;
  acceleratorType?: string;
  acceleratorCount?: number;
}

export interface WorkerPoolSpec {
  machineSpec: MachineSpec;
  replicaCount: string;
  diskSpec: { bootDiskType: string; bootDiskSizeGb: number };
  pythonPackageSpec?: { executorImageUri: string; packageUris: string[]; pythonModule: string; args: string[] };
  containerSpec?: { imageUri: string; args: string[] };
}

export interface ParameterSpec {
  parameterId: string;
  doubleValueSpec?: { minValue: number; maxValue: number };
  integerValueSpec?: { minValue: string; maxValue: string };
  categoricalValueSpec?: { values: string[] };
  discreteValueSpec?: { values: number[] };
  scaleType?: 'UNIT_LINEAR_SCALE' | 'UNIT_LOG_SCALE';
}

export interface StudySpec {
  metrics: { metricId: string; goal: 'MAXIMIZE' | 'MINIMIZE' }[];
  parameters: ParameterSpec[];
  algorithm: 'ALGORITHM_UNSPECIFIED' | 'GRID_SEARCH' | 'RANDOM_SEARCH';
}

export interface CustomJobSpec {
  runner: { entrypoint: 'train.py'; model: string; dataset: string; datasetSource: 'uri' | 'upload' };
  distributedTraining: { strategy: Strategy; worldSize: number };
  workerPoolSpecs: WorkerPoolSpec[];
  baseOutputDirectory: { outputUriPrefix: string };
  scheduling?: { strategy: 'SPOT' };
}

export interface TrainingPipelineBody {
  displayName: string;
  inputDataConfig?: {
    datasetId: string;
    annotationsFilter: string;
    fractionSplit: { trainingFraction: number; validationFraction: number; testFraction: number };
  };
  trainingTaskDefinition: string;
  trainingTaskInputs: CustomJobSpec | { studySpec: StudySpec; maxTrialCount: number; parallelTrialCount: number; trialJobSpec: CustomJobSpec };
  parentModel?: string;
  modelToUpload?: {
    displayName: string;
    description?: string;
    containerSpec: { imageUri: string; command?: string[] };
  };
}

export interface PipelineRequest {
  method: 'POST';
  path: string;
  body: TrainingPipelineBody;
}

const ALGORITHM: Record<Algorithm, StudySpec['algorithm']> = { DEFAULT: 'ALGORITHM_UNSPECIFIED', GRID: 'GRID_SEARCH', RANDOM: 'RANDOM_SEARCH' };

export function toParameterSpec(p: HptParamForm): ParameterSpec {
  const scaleType = p.scale === 'LOG' ? 'UNIT_LOG_SCALE' : 'UNIT_LINEAR_SCALE';
  switch (p.type) {
    case 'DOUBLE':
      return { parameterId: p.id, doubleValueSpec: { minValue: num(p.min), maxValue: num(p.max) }, scaleType };
    case 'INTEGER':
      return { parameterId: p.id, integerValueSpec: { minValue: String(num(p.min)), maxValue: String(num(p.max)) }, scaleType };
    case 'CATEGORICAL':
      return { parameterId: p.id, categoricalValueSpec: { values: splitValues(p.values) } };
    case 'DISCRETE':
      return { parameterId: p.id, discreteValueSpec: { values: splitValues(p.values).map(Number) }, scaleType };
  }
}

export function trimSlash(uri: string): string {
  return uri.replace(/\/+$/, '');
}

// 학습 코드가 모델을 저장해야 하는 위치(<출력 디렉터리>/model/). 예측 컨테이너의 모델 디렉터리로 자동으로 쓴다.
export function modelDirectory(outputDir: string): string {
  return `${trimSlash(outputDir)}/model/`;
}

export function displayModelName(f: PipelineForm, models: { id: string; displayName: string }[]): string {
  return f.modelMode === 'new' ? f.modelName : (models.find((m) => m.id === f.parentModelId)?.displayName ?? f.parentModelId);
}

export function buildPipelineRequest(f: PipelineForm, models: { id: string; displayName: string }[] = []): PipelineRequest {
  const gpu = f.pools[0]?.acceleratorType !== '';
  const runnerArgs = [...f.args, '--model', f.modelInput.trim(), '--data', f.datasetInput.trim(), '--strategy', f.strategy, '--gpus', String(totalGpus(f.pools))];
  const code =
    f.containerKind === 'prebuilt'
      ? { pythonPackageSpec: { executorImageUri: trainingImage(f.framework, f.frameworkVersion, gpu), packageUris: [f.packageUri], pythonModule: f.pythonModule, args: runnerArgs } }
      : { containerSpec: { imageUri: f.imageUri, args: runnerArgs } };

  const job: CustomJobSpec = {
    runner: { entrypoint: 'train.py', model: f.modelInput.trim(), dataset: f.datasetInput.trim(), datasetSource: f.datasetSource },
    distributedTraining: { strategy: f.strategy, worldSize: totalGpus(f.pools) },
    workerPoolSpecs: f.pools.map((p) => ({
      machineSpec: { machineType: p.machineType, ...(p.acceleratorType ? { acceleratorType: p.acceleratorType, acceleratorCount: p.acceleratorCount } : {}) },
      replicaCount: String(p.replicaCount),
      diskSpec: { bootDiskType: p.diskType === 'ssd' ? 'pd-ssd' : 'pd-standard', bootDiskSizeGb: p.diskSizeGb },
      ...code,
    })),
    baseOutputDirectory: { outputUriPrefix: trimSlash(f.outputDir) },
    ...(f.spot ? { scheduling: { strategy: 'SPOT' as const } } : {}),
  };

  const name = displayModelName(f, models);
  const body: TrainingPipelineBody = {
    displayName: `${name}-training`,
    ...(f.datasetId
      ? {
          inputDataConfig: {
            datasetId: f.datasetId,
            annotationsFilter: `annotationSet="${f.annotationSet}"`,
            fractionSplit: { trainingFraction: f.split.training / 100, validationFraction: f.split.validation / 100, testFraction: f.split.test / 100 },
          },
        }
      : {}),
    trainingTaskDefinition: f.hptEnabled ? TASK_DEFINITION.hpt : TASK_DEFINITION.custom,
    trainingTaskInputs: f.hptEnabled
      ? {
          studySpec: { metrics: [{ metricId: f.metricId, goal: f.goal }], parameters: f.hptParams.map(toParameterSpec), algorithm: ALGORITHM[f.algorithm] },
          maxTrialCount: f.maxTrials,
          parallelTrialCount: f.parallelTrials,
          trialJobSpec: job,
        }
      : job,
  };
  if (f.modelMode === 'version') body.parentModel = resourceName(f.region, 'models', f.parentModelId);
  if (f.predictionKind !== 'none') {
    const command = f.predCommand.trim() ? f.predCommand.trim().split(/\s+/) : undefined;
    body.modelToUpload = {
      displayName: name,
      ...(f.description.trim() ? { description: f.description.trim() } : {}),
      containerSpec:
        f.predictionKind === 'prebuilt'
          ? { imageUri: predictionImage(f.predFramework, f.predVersion, f.predGpu) }
          : { imageUri: f.predImageUri, ...(command ? { command } : {}) },
    };
  }
  return { method: 'POST', path: `/v1/projects/${PROJECT}/locations/${f.region}/trainingPipelines`, body };
}
