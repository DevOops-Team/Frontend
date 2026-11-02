// 목업 카탈로그: 태스크, 베이스 모델, GPU. 실제 백엔드와 연결되지 않는다.

export type TaskId = 'text-classification' | 'instruction-sft' | 'summarization' | 'image-classification' | 'tabular';
export type MetricKind = 'classification' | 'generation';

export interface Role {
  key: string;
  label: string;
  required: boolean;
  hint: string;
  synonyms: string[];
}

export interface Task {
  id: TaskId;
  name: string;
  description: string;
  example: string;
  icon: string;
  metricKind: MetricKind;
  metric: string;
  roles: Role[];
  // 분포를 그릴 라벨 역할(없으면 분포 표시 안 함)
  labelRole?: string;
}

export const TASKS: Task[] = [
  {
    id: 'text-classification',
    name: '텍스트 분류',
    description: '문장을 정해진 라벨로 나눕니다.',
    example: '리뷰 감성, 문의 유형, 스팸 분류',
    icon: 'Aa',
    metricKind: 'classification',
    metric: 'F1',
    labelRole: 'label',
    roles: [
      { key: 'text', label: '텍스트', required: true, hint: '분류할 문장', synonyms: ['text', 'document', 'sentence', 'review', 'content', '문장', '본문'] },
      { key: 'label', label: '라벨', required: true, hint: '정답 클래스', synonyms: ['label', 'labels', 'class', 'category', 'target', '라벨'] },
    ],
  },
  {
    id: 'instruction-sft',
    name: '지시 따르기 (LLM SFT)',
    description: '지시문과 모범 답변으로 LLM을 미세조정합니다.',
    example: '고객 상담 챗봇, 사내 Q&A 어시스턴트',
    icon: '✦',
    metricKind: 'generation',
    metric: 'ROUGE-L',
    roles: [
      { key: 'instruction', label: '지시문', required: true, hint: '모델에게 주는 요청', synonyms: ['instruction', 'prompt', 'question', 'query', '질문'] },
      { key: 'input', label: '추가 입력', required: false, hint: '선택: 지시에 딸린 맥락', synonyms: ['input', 'context'] },
      { key: 'output', label: '모범 답변', required: true, hint: '모델이 배울 답', synonyms: ['output', 'response', 'answer', 'completion', '답변'] },
    ],
  },
  {
    id: 'summarization',
    name: '요약',
    description: '긴 글을 짧게 요약하도록 학습합니다.',
    example: '뉴스 요약, 회의록 요약',
    icon: '≡',
    metricKind: 'generation',
    metric: 'ROUGE-L',
    roles: [
      { key: 'document', label: '원문', required: true, hint: '요약할 글', synonyms: ['document', 'article', 'text', 'content', '본문'] },
      { key: 'summary', label: '요약문', required: true, hint: '정답 요약', synonyms: ['summary', 'abstract', 'highlights', '요약'] },
    ],
  },
  {
    id: 'image-classification',
    name: '이미지 분류',
    description: '이미지 경로와 라벨로 이미지 분류기를 학습합니다.',
    example: '제품 불량 검사, 작물 병해 분류',
    icon: '▣',
    metricKind: 'classification',
    metric: '정확도',
    labelRole: 'label',
    roles: [
      { key: 'image', label: '이미지 경로', required: true, hint: 'S3 경로 또는 URL', synonyms: ['image', 'image_path', 'image_file_path', 'path', 'file', 'url', 'img'] },
      { key: 'label', label: '라벨', required: true, hint: '정답 클래스', synonyms: ['label', 'labels', 'class', 'category'] },
    ],
  },
  {
    id: 'tabular',
    name: '표 데이터 회귀/분류',
    description: '표의 나머지 열로 목표 열을 예측합니다.',
    example: '고객 이탈 예측, 수요 예측',
    icon: '⊞',
    metricKind: 'classification',
    metric: '정확도',
    labelRole: 'target',
    roles: [
      { key: 'target', label: '목표 열', required: true, hint: '예측할 값. 나머지 열은 특성으로 씁니다', synonyms: ['target', 'label', 'y', 'churn', 'class'] },
      { key: 'id', label: 'ID 열 (제외)', required: false, hint: '선택: 학습에서 뺄 식별자', synonyms: ['id', 'customer_id', 'user_id'] },
    ],
  },
];

export function taskOf(id: TaskId): Task {
  return TASKS.find((t) => t.id === id)!;
}

export interface Model {
  id: string;
  task: TaskId[];
  params: number; // 십억(B) 단위. 트리 모델은 0
  paramsLabel: string;
  license: string;
  description: string;
  language: string;
}

export const MODELS: Model[] = [
  { id: 'klue/bert-base', task: ['text-classification'], params: 0.11, paramsLabel: '110M', license: 'CC-BY-SA-4.0', description: 'KLUE 한국어 BERT. 빠르고 가벼운 분류 기본값', language: '한국어' },
  { id: 'klue/roberta-large', task: ['text-classification'], params: 0.34, paramsLabel: '337M', license: 'CC-BY-SA-4.0', description: '더 높은 정확도가 필요할 때', language: '한국어' },
  { id: 'xlm-roberta-base', task: ['text-classification'], params: 0.28, paramsLabel: '278M', license: 'MIT', description: '다국어 분류', language: '다국어' },
  { id: 'beomi/KoAlpaca-Polyglot-5.8B', task: ['instruction-sft'], params: 5.8, paramsLabel: '5.8B', license: 'Apache-2.0', description: '한국어 지시 따르기 모델', language: '한국어' },
  { id: 'meta-llama/Llama-3.1-8B', task: ['instruction-sft', 'summarization'], params: 8, paramsLabel: '8B', license: 'Llama 3.1', description: '범용 LLM. 상업 이용 조건 확인 필요', language: '다국어' },
  { id: 'Qwen/Qwen2.5-7B', task: ['instruction-sft', 'summarization'], params: 7.6, paramsLabel: '7.6B', license: 'Apache-2.0', description: '긴 문맥과 다국어에 강함', language: '다국어' },
  { id: 'Qwen/Qwen2.5-0.5B', task: ['instruction-sft'], params: 0.5, paramsLabel: '0.5B', license: 'Apache-2.0', description: '실험용 초소형 LLM', language: '다국어' },
  { id: 'gogamza/kobart-summarization', task: ['summarization'], params: 0.12, paramsLabel: '124M', license: 'MIT', description: '한국어 뉴스 요약 KoBART', language: '한국어' },
  { id: 'google/vit-base-patch16-224', task: ['image-classification'], params: 0.086, paramsLabel: '86M', license: 'Apache-2.0', description: 'ViT-base. 일반 이미지 분류', language: '—' },
  { id: 'microsoft/resnet-50', task: ['image-classification'], params: 0.026, paramsLabel: '26M', license: 'Apache-2.0', description: 'ResNet-50. 가볍고 빠름', language: '—' },
  { id: 'xgboost', task: ['tabular'], params: 0, paramsLabel: '트리', license: 'Apache-2.0', description: 'XGBoost 그래디언트 부스팅', language: '—' },
  { id: 'lightgbm', task: ['tabular'], params: 0, paramsLabel: '트리', license: 'MIT', description: 'LightGBM. 큰 표에서 빠름', language: '—' },
];

export function modelOf(id: string): Model | undefined {
  return MODELS.find((m) => m.id === id);
}

export function searchModels(task: TaskId, query: string): Model[] {
  const q = query.trim().toLowerCase();
  return MODELS.filter((m) => m.task.includes(task) && (!q || `${m.id} ${m.description} ${m.license}`.toLowerCase().includes(q)));
}

// LoRA는 10억 파라미터 이상 LLM에서만 켤 수 있다.
export function supportsLora(m: Model): boolean {
  return m.params >= 1;
}

export interface Gpu {
  id: string;
  label: string;
  memoryGb: number;
  pricePerHour: number; // USD, 목업
  speed: number; // T4 = 1 기준 상대 처리량
}

export const GPUS: Gpu[] = [
  { id: 'cpu', label: 'CPU 8 vCPU', memoryGb: 0, pricePerHour: 0.34, speed: 0.6 },
  { id: 't4', label: 'NVIDIA T4 16GB', memoryGb: 16, pricePerHour: 0.53, speed: 1 },
  { id: 'l4', label: 'NVIDIA L4 24GB', memoryGb: 24, pricePerHour: 0.8, speed: 1.7 },
  { id: 'a10g', label: 'NVIDIA A10G 24GB', memoryGb: 24, pricePerHour: 1.01, speed: 2 },
  { id: 'a100', label: 'NVIDIA A100 80GB', memoryGb: 80, pricePerHour: 4.1, speed: 6 },
];

export function gpuOf(id: string): Gpu {
  return GPUS.find((g) => g.id === id) ?? GPUS[1];
}
