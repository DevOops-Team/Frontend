import { DEFAULT_FORM, DEFAULT_POOL, buildPipelineRequest, type PipelineForm } from './lib/pipeline';
import { advanceStore, cancelPipeline, submitPipeline } from './api';
import type { Dataset, Model, Store } from './types';

const ago = (now: number, min: number) => new Date(now - min * 60_000).toISOString();

export const SEED_DATASETS = (now: number): Dataset[] => [
  { id: 'ds-reviews', displayName: 'shopping-reviews', type: '텍스트', annotationSets: ['sentiment-v1', 'sentiment-v2'], items: 12000, region: 'kr-seoul-1', createdAt: ago(now, 60 * 24 * 9) },
  { id: 'ds-pcb', displayName: 'pcb-defect-images', type: '이미지', annotationSets: ['defect-labels', 'defect-boxes'], items: 2400, region: 'kr-seoul-1', createdAt: ago(now, 60 * 24 * 5) },
  { id: 'ds-churn', displayName: 'telecom-churn', type: '표 형식', annotationSets: ['default'], items: 7043, region: 'kr-seoul-1', createdAt: ago(now, 60 * 24 * 20) },
];

function form(over: Partial<PipelineForm>): PipelineForm {
  return { ...DEFAULT_FORM, modelInput: over.modelName ?? (over.parentModelId ? 'team/churn-mlp' : 'team/bert-base'), datasetInput: `s3://team-data/${over.datasetId ?? 'training'}`, ...over };
}

// 시드: 성공(새 버전) · 학습 중 · 분산 학습 실패 · HP 조정 8회 성공 · 취소 · 엔드포인트 1개.
export function seedStore(now = Date.now()): Store {
  const churnModel: Model = {
    id: 'mdl-churn',
    displayName: 'churn-mlp',
    description: '통신사 고객 이탈 예측 (PyTorch MLP)',
    region: 'kr-seoul-1',
    createdAt: ago(now, 60 * 24 * 14),
    versions: [
      { versionId: 1, createdAt: ago(now, 60 * 24 * 14), artifactUri: 'ds://devoops-demo/churn/run-0412/model/', pipelineId: 'pl-churn0', imageUri: 'registry.devoops.io/prediction/pytorch-cpu.2-4:latest' },
    ],
  };
  let store: Store = {
    datasets: SEED_DATASETS(now),
    pipelines: [],
    hptJobs: [],
    models: [churnModel],
    endpoints: [
      {
        id: 'ep-churn',
        displayName: 'churn-online',
        region: 'kr-seoul-1',
        createdAt: ago(now, 60 * 24 * 13),
        deployments: [{ modelId: 'mdl-churn', modelName: 'churn-mlp', versionId: 1, machineType: 'standard-4', minReplicas: 1, maxReplicas: 3, traffic: 100 }],
      },
    ],
  };
  const models = store.models;

  const specs: { id: string; minutesAgo: number; ticks: number; form: PipelineForm; failAt?: { tick: number; message: string } }[] = [
    {
      id: 'pl-cancel',
      minutesAgo: 60 * 26,
      ticks: 3,
      form: form({
        modelName: 'pcb-vit', containerKind: 'custom', imageUri: 'registry.devoops.io/vision/vit-trainer:0.3', args: ['--epochs=30'],
        outputDir: 'ds://devoops-demo/pcb/vit', datasetId: 'ds-pcb', annotationSet: 'defect-labels', predictionKind: 'none',
        pools: [{ ...DEFAULT_POOL, acceleratorType: 'NVIDIA_L4' }],
      }),
    },
    {
      id: 'pl-churn2',
      minutesAgo: 60 * 6,
      ticks: 20,
      form: form({
        modelMode: 'version', parentModelId: 'mdl-churn', description: 'tenure 특성 추가', framework: 'pytorch', frameworkVersion: '2.4',
        packageUri: 'ds://devoops-demo/churn/trainer-0.4.tar.gz', outputDir: 'ds://devoops-demo/churn/run-1031', args: ['--hidden-size=256', '--epochs=10'],
        datasetId: 'ds-churn', annotationSet: 'default', pools: [{ ...DEFAULT_POOL, machineType: 'standard-4', acceleratorType: 'NVIDIA_T4', acceleratorCount: 1 }],
        predFramework: 'pytorch', predVersion: '2.4',
      }),
    },
    {
      id: 'pl-revhpt',
      minutesAgo: 60 * 3,
      ticks: 30,
      form: form({
        modelName: 'reviews-bert', description: '리뷰 감성 분류 (HP 조정 최적 시도)', datasetId: 'ds-reviews', annotationSet: 'sentiment-v2',
        outputDir: 'ds://devoops-demo/reviews/hpt-01', args: ['--epochs=3'], hptEnabled: true,
        hptParams: [
          { id: 'learning_rate', type: 'DOUBLE', min: '0.00001', max: '0.001', values: '', scale: 'LOG' },
          { id: 'batch_size', type: 'DISCRETE', min: '', max: '', values: '16, 32, 64', scale: 'LINEAR' },
          { id: 'dropout', type: 'DOUBLE', min: '0.0', max: '0.5', values: '', scale: 'LINEAR' },
        ],
        metricId: 'accuracy', goal: 'MAXIMIZE', maxTrials: 8, parallelTrials: 2,
      }),
    },
    {
      id: 'pl-pcbdist',
      minutesAgo: 75,
      ticks: 6,
      failAt: { tick: 5, message: "작업자 풀 1의 복제본 workerpool1-1이 종료 코드 1로 끝났습니다: RuntimeError: CUDA out of memory (15.2GiB / 16GiB 사용). 배치 크기를 줄이거나 메모리가 더 큰 가속기를 고르세요." },
      form: form({
        modelName: 'pcb-resnet', datasetId: 'ds-pcb', annotationSet: 'defect-labels', outputDir: 'ds://devoops-demo/pcb/resnet-dist',
        args: ['--epochs=20', '--batch-size=256'], spot: true,
        pools: [DEFAULT_POOL, { ...DEFAULT_POOL, replicaCount: 2 }],
      }),
    },
    {
      id: 'pl-reviews',
      minutesAgo: 4,
      ticks: 5,
      form: form({ strategy: 'fsdp', modelName: 'reviews-bert-large', datasetId: 'ds-reviews', annotationSet: 'sentiment-v2', outputDir: 'ds://devoops-demo/reviews/large-01', pools: [{ ...DEFAULT_POOL, acceleratorType: 'NVIDIA_L4' }, { ...DEFAULT_POOL, acceleratorType: 'NVIDIA_L4', replicaCount: 3 }] }),
    },
  ];

  // 오래된 것부터 올리고 각자 tick 수만큼 진행한다(다른 파이프라인은 건드리지 않도록 따로 진행).
  for (const s of specs) {
    const res = submitPipeline(store, buildPipelineRequest(s.form, models), { id: s.id, createdAt: ago(now, s.minutesAgo), failAt: s.failAt });
    const others = res.store.pipelines.filter((p) => p.id !== s.id);
    const solo = advanceStore({ ...res.store, pipelines: res.store.pipelines.filter((p) => p.id === s.id) }, s.ticks, ago(now, Math.max(0, s.minutesAgo - 20)));
    store = { ...solo, pipelines: [...solo.pipelines, ...others] };
    if (s.id === 'pl-cancel') store = cancelPipeline(store, 'pl-cancel');
  }
  return store;
}
