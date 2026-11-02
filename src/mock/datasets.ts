import type { TaskId } from './catalog';

// 목업 데이터셋: 내장 샘플과 Hugging Face ID 미리보기. 행은 미리보기용 일부이고 totalRows는 전체 행 수(목업)다.
export interface MockDataset {
  id: string;
  title: string;
  task: TaskId;
  columns: string[];
  rows: Record<string, string>[];
  totalRows: number;
}

function table(columns: string[], data: string[][]): Record<string, string>[] {
  return data.map((r) => Object.fromEntries(columns.map((c, i) => [c, r[i] ?? ''])));
}

const reviews = table(
  ['document', 'label'],
  [
    ['배송 빠르고 포장도 꼼꼼해요', '긍정'],
    ['한 번 쓰고 고장났습니다. 환불 원해요', '부정'],
    ['가격 대비 괜찮은 편', '긍정'],
    ['색상이 사진이랑 너무 달라요', '부정'],
    ['재구매 의사 있습니다', '긍정'],
    ['그냥 그래요. 특별한 건 없음', '중립'],
    ['설명서가 부실해서 조립이 어려웠어요', '부정'],
    ['아이가 너무 좋아해요', '긍정'],
    ['배송이 일주일 걸렸네요', '부정'],
    ['무난하게 쓰고 있습니다', '중립'],
    ['품질 최고! 강력 추천', '긍정'],
    ['사이즈가 생각보다 작아요', '부정'],
  ],
);

const support = table(
  ['instruction', 'input', 'output'],
  [
    ['주문을 취소하고 싶어요', '주문번호 2024-1182', '주문번호 2024-1182 건은 아직 출고 전이라 바로 취소해 드렸습니다. 결제 취소는 영업일 기준 3일 안에 반영됩니다.'],
    ['배송이 언제 오나요?', '', '마이페이지 > 주문 내역에서 운송장 번호로 실시간 위치를 확인하실 수 있습니다. 보통 출고 후 1–2일 안에 도착합니다.'],
    ['비밀번호를 잊어버렸어요', '', '로그인 화면의 "비밀번호 찾기"에서 가입한 이메일로 재설정 링크를 받으실 수 있습니다.'],
    ['교환 기간이 어떻게 되나요?', '의류', '의류는 수령 후 7일 이내, 태그를 떼지 않은 상태라면 무료로 교환해 드립니다.'],
    ['쿠폰이 적용되지 않아요', '쿠폰코드 WELCOME10', 'WELCOME10은 3만 원 이상 주문에만 적용됩니다. 장바구니 금액을 확인해 주세요.'],
    ['영수증을 다시 받고 싶어요', '', '마이페이지 > 주문 내역 > 영수증 출력에서 언제든 다시 받으실 수 있습니다.'],
  ],
);

const news = table(
  ['article', 'summary'],
  [
    ['정부는 내년부터 청년 월세 지원 대상을 소득 기준 중위 60%에서 100%로 확대한다고 밝혔다. 지원 금액은 월 최대 20만 원으로 유지되며, 신청은 3월부터 온라인으로 받는다.', '청년 월세 지원 대상이 내년부터 중위소득 100%로 확대된다.'],
    ['서울시는 한강 공원 5곳에 야간 러닝 코스를 새로 만들고 조명을 늘리기로 했다. 코스는 다음 달 개장하며 안전 요원도 배치된다.', '서울시가 한강 공원 5곳에 야간 러닝 코스를 만든다.'],
    ['국내 반도체 수출이 석 달 연속 증가했다. 산업부는 AI 서버용 메모리 수요가 늘어난 덕분이라고 분석했다.', '반도체 수출이 AI 메모리 수요로 석 달 연속 늘었다.'],
    ['기상청은 이번 주말 중부 지방에 첫눈이 올 수 있다고 예보했다. 아침 기온은 영하 3도까지 떨어질 전망이다.', '이번 주말 중부 지방에 첫눈과 영하권 추위가 예상된다.'],
  ],
);

const defects = table(
  ['image_path', 'label'],
  [
    ['s3://devoops-samples/pcb/0001.jpg', '정상'],
    ['s3://devoops-samples/pcb/0002.jpg', '스크래치'],
    ['s3://devoops-samples/pcb/0003.jpg', '정상'],
    ['s3://devoops-samples/pcb/0004.jpg', '납땜불량'],
    ['s3://devoops-samples/pcb/0005.jpg', '정상'],
    ['s3://devoops-samples/pcb/0006.jpg', '스크래치'],
    ['s3://devoops-samples/pcb/0007.jpg', '정상'],
    ['s3://devoops-samples/pcb/0008.jpg', '정상'],
    ['s3://devoops-samples/pcb/0009.jpg', '납땜불량'],
    ['s3://devoops-samples/pcb/0010.jpg', '정상'],
  ],
);

const churn = table(
  ['customer_id', 'tenure_months', 'monthly_fee', 'support_calls', 'plan', 'churn'],
  [
    ['C-1001', '3', '59000', '4', 'basic', 'yes'],
    ['C-1002', '28', '39000', '0', 'family', 'no'],
    ['C-1003', '14', '49000', '1', 'basic', 'no'],
    ['C-1004', '1', '69000', '6', 'premium', 'yes'],
    ['C-1005', '40', '39000', '0', 'family', 'no'],
    ['C-1006', '7', '59000', '3', 'basic', 'yes'],
    ['C-1007', '22', '49000', '1', 'premium', 'no'],
    ['C-1008', '11', '49000', '2', 'basic', 'no'],
  ],
);

export const SAMPLE_DATASETS: MockDataset[] = [
  { id: 'sample/ko-shopping-reviews', title: '쇼핑몰 리뷰 감성 (긍정/중립/부정)', task: 'text-classification', columns: ['document', 'label'], rows: reviews, totalRows: 12000 },
  { id: 'sample/cs-instructions', title: '고객 상담 지시·답변', task: 'instruction-sft', columns: ['instruction', 'input', 'output'], rows: support, totalRows: 3400 },
  { id: 'sample/ko-news-summary', title: '한국어 뉴스 요약', task: 'summarization', columns: ['article', 'summary'], rows: news, totalRows: 8000 },
  { id: 'sample/pcb-defects', title: 'PCB 불량 이미지', task: 'image-classification', columns: ['image_path', 'label'], rows: defects, totalRows: 2400 },
  { id: 'sample/telecom-churn', title: '통신사 고객 이탈', task: 'tabular', columns: ['customer_id', 'tenure_months', 'monthly_fee', 'support_calls', 'plan', 'churn'], rows: churn, totalRows: 7043 },
];

// Hugging Face 데이터셋 ID → 목업 미리보기. 실제 허브를 조회하지 않는다.
const HF: Record<string, Omit<MockDataset, 'id'>> = {
  'e9t/nsmc': {
    title: 'NSMC 네이버 영화 리뷰',
    task: 'text-classification',
    columns: ['id', 'document', 'label'],
    rows: table(
      ['id', 'document', 'label'],
      [
        ['9976970', '아 더빙.. 진짜 짜증나네요 목소리', '0'],
        ['3819312', '흠...포스터보고 초딩영화줄....오버연기조차 가볍지 않구나', '1'],
        ['10265843', '너무재밓었다그래서보는것을추천한다', '0'],
        ['9045019', '교도소 이야기구먼 ..솔직히 재미는 없다..평점 조정', '0'],
        ['6483659', '사이몬페그의 익살스런 연기가 돋보였던 영화!', '1'],
        ['5403919', '막 걸음마 뗀 3세부터 초등학교 1학년생인 8살용영화', '0'],
        ['7797314', '원작의 긴장감을 제대로 살려내지못했다.', '0'],
        ['9443947', '별 반개도 아깝다 욕나온다', '0'],
        ['7156791', '액션이 없는데도 재미 있는 몇안되는 영화', '1'],
        ['5912145', '왜케 평점이 낮은건데? 꽤 볼만한데..', '1'],
      ],
    ),
    totalRows: 150000,
  },
  'beomi/KoAlpaca-v1.1a': {
    title: 'KoAlpaca v1.1a',
    task: 'instruction-sft',
    columns: ['instruction', 'output', 'url'],
    rows: table(
      ['instruction', 'output', 'url'],
      [
        ['양파는 어떤 식물 부위인가요?', '양파는 잎이 아닌 비늘줄기(인경)입니다. 땅속에서 잎이 두껍게 겹쳐 자란 부분을 먹습니다.', 'https://kin.naver.com/1'],
        ['스웨터의 유래는?', '스웨터는 원래 운동선수가 땀을 흘리게 하려고 입던 두꺼운 니트에서 이름이 나왔습니다.', 'https://kin.naver.com/2'],
        ['토마토는 과일인가요 채소인가요?', '식물학적으로는 과일이지만 요리와 법률상으로는 보통 채소로 분류합니다.', 'https://kin.naver.com/3'],
      ],
    ),
    totalRows: 21155,
  },
  'daekeun-ml/naver-news-summarization-ko': {
    title: '네이버 뉴스 요약',
    task: 'summarization',
    columns: ['date', 'category', 'document', 'summary'],
    rows: table(
      ['date', 'category', 'document', 'summary'],
      [
        ['2022-07-03', 'economy', '금융당국이 가계부채 관리를 위해 DSR 규제를 단계적으로 강화한다. 7월부터 총대출 1억 원 초과 차주에게 적용된다.', 'DSR 규제가 7월부터 1억 원 초과 차주로 확대된다.'],
        ['2022-07-03', 'IT', '국내 통신 3사가 5G 중간 요금제를 이달 출시한다. 데이터 24~30GB 구간이 새로 생긴다.', '통신 3사가 5G 중간 요금제를 출시한다.'],
      ],
    ),
    totalRows: 22194,
  },
  'beans': {
    title: 'Beans 잎 병해',
    task: 'image-classification',
    columns: ['image_file_path', 'labels'],
    rows: table(
      ['image_file_path', 'labels'],
      [
        ['train/angular_leaf_spot/0001.jpg', 'angular_leaf_spot'],
        ['train/bean_rust/0002.jpg', 'bean_rust'],
        ['train/healthy/0003.jpg', 'healthy'],
        ['train/bean_rust/0004.jpg', 'bean_rust'],
        ['train/healthy/0005.jpg', 'healthy'],
      ],
    ),
    totalRows: 1034,
  },
};

export const HF_SUGGESTIONS = Object.keys(HF);

export function lookupHfDataset(id: string): MockDataset | null {
  const key = Object.keys(HF).find((k) => k.toLowerCase() === id.trim().toLowerCase());
  return key ? { id: key, ...HF[key] } : null;
}
