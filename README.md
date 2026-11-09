# DevOops Frontend · Material 디자인

Vite + React + TypeScript로 만든 학습 화면입니다. 백엔드 API를 호출해 실제 작업을 제출하고 진행 상태를 봅니다. 실패를 가짜 데이터로 덮지 않고 오류로 보여 줍니다.

## 화면

- **개요:** 전체 · 완료 · 진행 중 학습 수, 내 학습 표. 5초마다 갱신합니다.
- **새 학습:** 모델 → 데이터 → 방식·GPU → 최종 확인 4단계. 학습 모델, 데이터셋, FSDP · DDP, GPU 수(1 · 2 · 4개), 상세 설정을 고릅니다. **아무것도 입력하지 않고 넘어가면** `/api/models` · `/api/datasets`의 기본값으로 요청을 채워 제출합니다.
  - 모델 · 데이터 단계에서 S3 파일 목록을 보고 텍스트 파일을 미리 볼 수 있습니다.
- **실행 상세:** 실제 진행률, 단계, step · loss · 체크포인트 · 클러스터, 학습 설정, 작업 파일(config.json · jobset.json), 실행 기록. 3초마다 갱신하고 끝난 작업은 멈춥니다.
- **API 문서:** 백엔드 Swagger(`/swagger/`).
- **화면 모드:** 상단 **화이트 / 다크** 버튼. 선택은 localStorage에 저장됩니다.

## 구조

기능(feature) 단위로 나눕니다. 다른 기능이나 공용 코드는 `@/`(= `src/`) 경로로 가져오고, 기능 바깥에서는 그 기능의 `index.ts`가 내보내는 것만 씁니다.

```
src/
├── App.tsx                       사이드 내비·상단 바, 목록 폴링, 개요/새 학습/상세 전환
├── test-api.ts                   테스트용 가짜 백엔드
├── features/
│   ├── training/
│   │   ├── api.ts                백엔드 클라이언트, 요청 조립(buildJobRequest)
│   │   ├── types.ts              API 응답 모양 (정본: Backend api/openapi.yaml)
│   │   ├── components/           CreatePipeline(4단계), RunOverview(상세·폴링), FileList(파일·미리보기)
│   │   └── lib/                  progress(진행률·단계), format
│   └── theme/
└── shared/ui/                    Icon, StateBadge
```

## 실행과 테스트

```sh
npm install
# 백엔드가 127.0.0.1:8080일 때. 다르면 BACKEND_URL=http://host:port. Tailscale Serve가 tailnet의 5173을 여기로 넘긴다
npm run dev -- --host 127.0.0.1 --port 5173
npm run lint      # eslint
npm run typecheck # tsc --noEmit
npm test          # vitest run (Vitest + Testing Library)
npm run build
```
