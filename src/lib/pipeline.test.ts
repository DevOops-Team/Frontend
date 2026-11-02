import { describe, expect, it } from 'vitest';
import { DEFAULT_FORM, DEFAULT_POOL, buildPipelineRequest, isValid, modelDirectory, toParameterSpec, validateForm, validateParam, type PipelineForm } from './pipeline';

const ctx = { modelIds: ['mdl-churn'] };
const valid: PipelineForm = { ...DEFAULT_FORM, modelName: 'reviews-bert', modelInput: 'team/bert', datasetInput: 'custom://reviews' };

describe('validateForm', () => {
  it('accepts the defaults once a model name is given', () => {
    expect(validateForm(DEFAULT_FORM, ctx).model).toHaveLength(1);
    expect(isValid(validateForm(valid, ctx))).toBe(true);
  });

  it('checks managed dataset annotation set and split sum', () => {
    const e = validateForm({ ...valid, datasetId: 'ds-reviews', split: { training: 70, validation: 10, test: 10 } }, ctx).method;
    expect(e).toEqual(['주석 세트를 선택하세요', '분할 비율의 합이 100%여야 합니다 (지금 90%)']);
  });

  it('requires an existing parent model for a new version', () => {
    expect(validateForm({ ...valid, modelMode: 'version', parentModelId: 'nope' }, ctx).model).toEqual(['새 버전을 추가할 모델을 선택하세요']);
    expect(validateForm({ ...valid, modelMode: 'version', parentModelId: 'mdl-churn' }, ctx).model).toEqual([]);
  });

  it('validates container package URI, module, image and output dir', () => {
    expect(validateForm({ ...valid, packageUri: 's3://x/a.zip', pythonModule: 'trainer/task', outputDir: '/tmp/out', args: [''] }, ctx).container).toHaveLength(4);
    expect(validateForm({ ...valid, containerKind: 'custom', imageUri: 'registry.devoops.io/team/trainer:1.0' }, ctx).container).toEqual([]);
    expect(validateForm({ ...valid, containerKind: 'custom', imageUri: 'not an image' }, ctx).container).toHaveLength(1);
  });

  it('validates hyperparameter tuning settings', () => {
    const e = validateForm({ ...valid, hptEnabled: true, maxTrials: 2, parallelTrials: 3, hptParams: [] }, ctx).hpt;
    expect(e).toEqual(['매개변수를 하나 이상 추가하세요', '병렬 시도 횟수는 최대 시도 횟수보다 클 수 없습니다']);
  });

  it('requires pool 0 to have exactly one replica and checks disk size', () => {
    const e = validateForm({ ...valid, pools: [{ ...DEFAULT_POOL, replicaCount: 2 }, { ...DEFAULT_POOL, diskSizeGb: 10 }] }, ctx).compute;
    expect(e).toEqual(['작업자 풀 0(기본 복제본)의 복제본 수는 1이어야 합니다', '작업자 풀 1: 디스크 크기 100–65536GB']);
  });
});

describe('validateParam / toParameterSpec', () => {
  it('checks ranges, integers, log scale, values and grid restrictions', () => {
    expect(validateParam({ id: 'lr', type: 'DOUBLE', min: '0', max: '0.1', values: '', scale: 'LOG' }, 'DEFAULT')).toEqual(['lr: 로그 스케일은 0보다 큰 범위만 쓸 수 있습니다']);
    expect(validateParam({ id: 'lr', type: 'DOUBLE', min: '0.1', max: '0.01', values: '', scale: 'LINEAR' }, 'GRID')).toEqual([
      'lr: 최솟값은 최댓값보다 작아야 합니다',
      'lr: 그리드 검색에는 DOUBLE 매개변수를 쓸 수 없습니다',
    ]);
    expect(validateParam({ id: 'layers', type: 'INTEGER', min: '1.5', max: '4', values: '', scale: 'LINEAR' }, 'DEFAULT')).toEqual(['layers: INTEGER는 정수 범위여야 합니다']);
    expect(validateParam({ id: 'bs', type: 'DISCRETE', min: '', max: '', values: '16, x', scale: 'LINEAR' }, 'DEFAULT')).toEqual(['bs: DISCRETE 값은 숫자여야 합니다']);
    expect(validateParam({ id: 'opt', type: 'CATEGORICAL', min: '', max: '', values: '', scale: 'LINEAR' }, 'DEFAULT')).toEqual(['opt: 값을 하나 이상 입력하세요 (쉼표로 구분)']);
  });

  it('maps each type to its value spec', () => {
    expect(toParameterSpec({ id: 'lr', type: 'DOUBLE', min: '0.0001', max: '0.1', values: '', scale: 'LOG' })).toEqual({ parameterId: 'lr', doubleValueSpec: { minValue: 0.0001, maxValue: 0.1 }, scaleType: 'UNIT_LOG_SCALE' });
    expect(toParameterSpec({ id: 'n', type: 'INTEGER', min: '1', max: '8', values: '', scale: 'LINEAR' })).toEqual({ parameterId: 'n', integerValueSpec: { minValue: '1', maxValue: '8' }, scaleType: 'UNIT_LINEAR_SCALE' });
    expect(toParameterSpec({ id: 'opt', type: 'CATEGORICAL', min: '', max: '', values: 'adam, sgd', scale: 'LINEAR' })).toEqual({ parameterId: 'opt', categoricalValueSpec: { values: ['adam', 'sgd'] } });
    expect(toParameterSpec({ id: 'bs', type: 'DISCRETE', min: '', max: '', values: '16,32', scale: 'LINEAR' })).toEqual({ parameterId: 'bs', discreteValueSpec: { values: [16, 32] }, scaleType: 'UNIT_LINEAR_SCALE' });
  });
});

describe('buildPipelineRequest', () => {
  it('builds a custom-training pipeline with python package, output dir and model upload', () => {
    expect(buildPipelineRequest(valid)).toEqual({
      method: 'POST',
      path: '/v1/projects/devoops-demo/locations/kr-seoul-1/trainingPipelines',
      body: {
        displayName: 'reviews-bert-training',
        trainingTaskDefinition: 'ds://schema/trainingjob/definition/custom_task_1.0.0.yaml',
        trainingTaskInputs: {
          runner: { entrypoint: 'train.py', model: 'team/bert', dataset: 'custom://reviews', datasetSource: 'uri' },
          distributedTraining: { strategy: 'ddp', worldSize: 1 },
          workerPoolSpecs: [
            {
              machineSpec: { machineType: 'standard-8', acceleratorType: 'NVIDIA_T4', acceleratorCount: 1 },
              replicaCount: '1',
              diskSpec: { bootDiskType: 'pd-ssd', bootDiskSizeGb: 100 },
              pythonPackageSpec: {
                executorImageUri: 'registry.devoops.io/training/pytorch-gpu.2-4:latest',
                packageUris: ['ds://devoops-demo/trainer/trainer-0.1.tar.gz'],
                pythonModule: 'trainer.task',
                args: ['--epochs=10', '--model', 'team/bert', '--data', 'custom://reviews', '--strategy', 'ddp', '--gpus', '1'],
              },
            },
          ],
          baseOutputDirectory: { outputUriPrefix: 'ds://devoops-demo/training-output' },
        },
        modelToUpload: { displayName: 'reviews-bert', containerSpec: { imageUri: 'registry.devoops.io/prediction/pytorch-cpu.2-4:latest' } },
      },
    });
  });

  it('adds dataset config, SPOT scheduling, studySpec/trialJobSpec, parentModel and a custom prediction container', () => {
    const r = buildPipelineRequest(
      {
        ...valid,
        datasetId: 'ds-reviews',
        annotationSet: 'sentiment-v2',
        modelMode: 'version',
        parentModelId: 'mdl-churn',
        containerKind: 'custom',
        imageUri: 'registry.devoops.io/t/train:1',
        spot: true,
        hptEnabled: true,
        algorithm: 'RANDOM',
        pools: [{ ...DEFAULT_POOL, acceleratorType: '' }, { ...DEFAULT_POOL, replicaCount: 2 }],
        predictionKind: 'custom',
        predImageUri: 'registry.devoops.io/t/serve:1',
        predCommand: 'python serve.py --port 8080',
      },
      [{ id: 'mdl-churn', displayName: 'churn-xgb' }],
    ).body;
    expect(r.displayName).toBe('churn-xgb-training');
    expect(r.inputDataConfig).toEqual({ datasetId: 'ds-reviews', annotationsFilter: 'annotationSet="sentiment-v2"', fractionSplit: { trainingFraction: 0.8, validationFraction: 0.1, testFraction: 0.1 } });
    expect(r.trainingTaskDefinition).toMatch(/hyperparameter_tuning_task/);
    expect(r.parentModel).toBe('projects/devoops-demo/locations/kr-seoul-1/models/mdl-churn');
    expect(r.modelToUpload).toEqual({ displayName: 'churn-xgb', containerSpec: { imageUri: 'registry.devoops.io/t/serve:1', command: ['python', 'serve.py', '--port', '8080'] } });
    const inputs = r.trainingTaskInputs as Extract<typeof r.trainingTaskInputs, { studySpec: unknown }>;
    expect(inputs.studySpec.algorithm).toBe('RANDOM_SEARCH');
    expect(inputs.maxTrialCount).toBe(8);
    expect(inputs.trialJobSpec.scheduling).toEqual({ strategy: 'SPOT' });
    expect(inputs.trialJobSpec.workerPoolSpecs[0].machineSpec).toEqual({ machineType: 'standard-8' });
    expect(inputs.trialJobSpec.workerPoolSpecs[1]).toMatchObject({ replicaCount: '2', containerSpec: { imageUri: 'registry.devoops.io/t/train:1', args: ['--epochs=10', '--model', 'team/bert', '--data', 'custom://reviews', '--strategy', 'ddp', '--gpus', '2'] } });
  });

  it('omits modelToUpload without a prediction container and derives the model directory', () => {
    expect(buildPipelineRequest({ ...valid, predictionKind: 'none' }).body.modelToUpload).toBeUndefined();
    expect(modelDirectory('ds://b/out/')).toBe('ds://b/out/model/');
  });
});
