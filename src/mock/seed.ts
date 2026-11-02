import { gpuOf, modelOf, type TaskId } from './catalog';
import { advance, createRun, type Run } from './runs';
import { estimate, presetHyper, recommendGpu, type PresetId } from '../lib/estimate';
import { buildRequest, type DatasetSource } from '../lib/request';

interface SeedSpec {
  id: string;
  name: string;
  task: TaskId;
  model: string;
  source: DatasetSource;
  datasetRef: string;
  datasetTitle: string;
  format: 'csv' | 'jsonl' | 'hf';
  columns: Record<string, string>;
  rows: number;
  labels: string[];
  preset: PresetId;
  minutesAgo: number;
  ticks: number;
  failAt?: Run['failAt'];
}

const SPECS: SeedSpec[] = [
  {
    id: 'run-7f3a', name: 'bert-nsmc-sentiment', task: 'text-classification', model: 'klue/bert-base',
    source: 'huggingface', datasetRef: 'e9t/nsmc', datasetTitle: 'NSMC 네이버 영화 리뷰', format: 'hf',
    columns: { text: 'document', label: 'label' }, rows: 150000, labels: ['0', '1'], preset: 'balanced', minutesAgo: 190, ticks: 40,
  },
  {
    id: 'run-8c21', name: 'koalpaca-cs-bot', task: 'instruction-sft', model: 'beomi/KoAlpaca-Polyglot-5.8B',
    source: 'upload', datasetRef: 'cs_qa_2026.jsonl', datasetTitle: 'cs_qa_2026.jsonl', format: 'jsonl',
    columns: { instruction: 'question', output: 'answer' }, rows: 3400, labels: [], preset: 'balanced', minutesAgo: 24, ticks: 8,
  },
  {
    id: 'run-91d0', name: 'qwen-news-summary', task: 'summarization', model: 'Qwen/Qwen2.5-7B',
    source: 'huggingface', datasetRef: 'daekeun-ml/naver-news-summarization-ko', datasetTitle: '네이버 뉴스 요약', format: 'hf',
    columns: { document: 'document', summary: 'summary' }, rows: 22194, labels: [], preset: 'fast', minutesAgo: 3, ticks: 1,
  },
  {
    id: 'run-a4be', name: 'vit-pcb-defects', task: 'image-classification', model: 'google/vit-base-patch16-224',
    source: 'upload', datasetRef: 'pcb_labels.csv', datasetTitle: 'pcb_labels.csv', format: 'csv',
    columns: { image: 'image_path', label: 'label' }, rows: 2400, labels: ['정상', '스크래치', '납땜불량'], preset: 'balanced', minutesAgo: 75, ticks: 10,
    failAt: { stage: 0, reason: '데이터셋 라벨 컬럼(label)에 빈 값 132개가 있습니다. 빈 행을 지우거나 라벨을 채운 뒤 다시 실행하세요.' },
  },
  {
    id: 'run-b552', name: 'xgboost-telecom-churn', task: 'tabular', model: 'xgboost',
    source: 'sample', datasetRef: 'sample/telecom-churn', datasetTitle: '통신사 고객 이탈', format: 'csv',
    columns: { target: 'churn', id: 'customer_id' }, rows: 7043, labels: ['no', 'yes'], preset: 'fast', minutesAgo: 320, ticks: 40,
  },
];

// 상태가 서로 다른 목업 실행 5개: 성공 2, 학습 중 1, 막 시작 1, 데이터 검증 실패 1.
export function seedRuns(now = Date.now()): Run[] {
  return SPECS.map((s) => {
    const model = modelOf(s.model)!;
    const hyper = presetHyper(s.preset, model);
    const gpu = recommendGpu(model, hyper.lora);
    const request = buildRequest({
      name: s.name, task: s.task, baseModel: s.model, source: s.source, datasetRef: s.datasetRef, format: s.format,
      mapping: s.columns, trainPercent: 90, preset: s.preset, hyper, gpu, gpuAuto: true,
    });
    const run = createRun(
      request,
      {
        datasetTitle: s.datasetTitle, rows: s.rows, labels: s.labels, gpuLabel: `${gpuOf(gpu.gpuId).label} × ${gpu.count}`,
        estimate: estimate({ model, gpu, trainRows: Math.round(s.rows * 0.9), hyper }),
      },
      { id: s.id, createdAt: new Date(now - s.minutesAgo * 60_000).toISOString(), failAt: s.failAt },
    );
    return advance(run, s.ticks);
  });
}
