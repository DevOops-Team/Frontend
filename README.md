# DevOops Frontend · Material 디자인

PyTorch DDP 또는 FSDP로 모델 학습을 만들고 진행 상태를 보는 클릭 가능한 목업입니다. Vite + React + TypeScript로 만들었습니다. 백엔드를 부르지 않고 브라우저 안의 목업 데이터로만 동작하며(상단 `목업 데이터` 표시), 실제 GPU 자원을 만들지 않습니다. 새로고침하면 처음 상태로 돌아갑니다.

## 화면

- **개요:** 전체·완료·진행 중 학습 수, DDP/FSDP 안내, 내 학습 표(방식·GPU 수·상태).
- **새 학습:** 스크롤 없는 한 화면에서 모델 → 데이터 → 방식·GPU → 최종 확인 4단계로 진행합니다. 이전·다음·시작 버튼 위치는 고정입니다.
  - 모델명·모델 경로는 자유 입력이고, 데이터는 경로/URI 또는 파일 선택으로 받습니다.
  - **GPU 설정** 모달에서 학습 방식, 총 GPU 수(1·2·4·8개), GPU 종류를 고릅니다. GPU 한 개를 노드 한 대에 배정하고, FSDP는 GPU 2개 이상이 필요합니다.
  - GPU 수는 요약, 목업 예상 비용, 생성 요청의 `distributedTraining.worldSize`에 반영됩니다.
- **실행 상세:** 전체 진행률 바, 4단계 상태 표시, 학습 입력 요약, 페이지로 넘기는 실행 기록 타임라인.
- **화면 모드:** 상단 **화이트 / 다크** 버튼으로 바꿉니다. 선택은 localStorage에 저장되고, 저장된 값이 없으면 화이트로 시작합니다. 바꾸는 중에도 작성하던 입력은 유지됩니다.

## 구조

기능(feature) 단위로 나눕니다. 다른 기능이나 공용 코드는 `@/`(= `src/`) 경로로 가져오고, 기능 안에서는 상대 경로를 씁니다. 기능 바깥에서는 그 기능의 `index.ts`가 내보내는 것만 씁니다.

```
src/
├── App.tsx                       사이드 내비·상단 바, 1.5초 tick 타이머, 개요/새 학습/상세 전환
├── main.tsx  index.css  test-setup.ts
├── features/
│   ├── training/                 학습 생성·실행
│   │   ├── index.ts              공개 API
│   │   ├── api.ts                목업 백엔드: submit·tick·cancel·deploy 시뮬레이션
│   │   ├── types.ts              Pipeline·Store 등 데이터 모양
│   │   ├── catalog.ts            머신·GPU·디스크·프레임워크 목록
│   │   ├── seed.ts               시드 데이터
│   │   ├── components/
│   │   │   ├── CreatePipeline.tsx  4단계 학습 생성 화면, GPU 모달
│   │   │   └── RunOverview.tsx     실행 상세
│   │   └── lib/
│   │       ├── pipeline.ts       폼 기본값·검증, 생성 요청 본문(buildPipelineRequest)
│   │       ├── pricing.ts        목업 시간당 비용·GPU 합계
│   │       ├── progress.ts       실행 진행률·단계 계산
│   │       └── hpt.ts            하이퍼파라미터 조정 시뮬레이션
│   └── theme/
│       ├── index.ts
│       └── hooks/useTheme.ts     화이트/다크 모드와 저장
└── shared/
    ├── ui/                       Icon, StateBadge(+ stateLabel)
    └── lib/                      format(formatUsd)
nginx.conf                        index.html은 no-cache, 해시가 붙은 assets는 장기 캐시
```

## 실행과 테스트

```sh
npm install
npm run dev -- --host 127.0.0.1 --port 5173
npm run lint      # eslint
npm run typecheck # tsc --noEmit
npm test          # vitest run (Vitest + Testing Library)
npm run build
```

- `lib/pipeline`: 폼 검증, 파라미터 범위·스케일, 생성 요청 본문 모양
- `lib/distributed`: DDP/FSDP만 허용, FSDP 최소 2 GPU, 선택한 방식·GPU 수가 요청에 들어가는지
- `lib/pricing`, `lib/hpt`, `lib/progress`: 비용 공식, 탐색 공간 샘플링, 진행 단계 계산
- `api`: 시드 상태, 제출부터 성공까지 진행, 취소, 배포
- `RunOverview`: 진행률·입력 요약·타임라인, 성공/실패 표시
- `App`, `theme`: 마법사를 끝까지 진행해 제출, 화면 모드 전환과 저장
