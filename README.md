# DDP · FSDP 가이드형 학습 목업

현재 화면은 PyTorch의 DDP 또는 FSDP만 선택할 수 있는 클릭 가능한 목업입니다. 백엔드를 호출하지 않으며 실제 GPU 자원을 만들지 않습니다.

- 모델 → 데이터 → 방식·GPU → 최종 확인의 4단계 구성입니다. 모델과 데이터는 빈 입력에서 시작하며 사용자가 직접 입력해야 합니다.
- 모델명·모델 경로는 자유 입력이며, 데이터는 경로/URI 또는 파일 선택으로 받습니다. 특정 모델 목록이나 파일 형식으로 제한하지 않습니다. 준비된 `train.py`에 입력 모델·데이터·DDP/FSDP·총 GPU 수를 전달하는 목업입니다.
- DDP는 기본 추천, FSDP는 GPU 메모리를 나누어 사용하는 방식으로 안내합니다.
- **GPU 설정** 버튼을 누르면 모달에서 학습 방식, 총 GPU 개수(1·2·4·8개), GPU 종류를 선택합니다. GPU 한 개를 노드 한 대에 배정하며, FSDP는 최소 2개가 필요합니다.
- 모달의 선택은 닫기/Esc 이후에도 보존됩니다. GPU 수는 요약·목업 예상 비용·생성 요청의 `distributedTraining.worldSize`와 작업자 풀의 GPU 합계에 반영됩니다.
- 실행 후 진행 단계·이벤트·요청 상세와 결과 저장 위치를 볼 수 있습니다. 새로고침하면 목업 초기 상태로 돌아갑니다.

```sh
npm run dev -- --host 127.0.0.1 --port 5173
npm test
npm run typecheck
npm run lint
npm run build
```

아래는 기존 목업의 참고 설명이며 현재 가이드 UI와 차이가 있습니다.

---

# Frontend

파인튜닝 작업을 만들고 진행 상태를 보는 목업 화면입니다. Vite + React + TypeScript로 만들었습니다.

## 화면

> **데모: 노코드 파인튜닝형 (`demo/guided-launcher`)** — 코드도 YAML도 없이 **태스크 → 베이스 모델 → 데이터셋**만 고르면 되는 입력 방식의 클릭 가능한 목업이다. 백엔드를 부르지 않고 브라우저 안의 목업 데이터(`src/mock/`)로만 돈다(상단에 `목업 데이터` 표시). 밝은 테마만 쓴다(흰색·옅은 회색 면, 어두운 글자, 보라색 강조, `color-scheme: only light`, 다크 모드 재정의 없음). 상단 내비게이션, 단계 표시가 있는 마법사, 실행 목록 표, 상세 화면 구성이다.

### 입력: 5단계 마법사

단계마다 필요한 값이 있어야 `다음`이 켜지고, 지난 단계는 위쪽 단계 표시로 돌아갈 수 있다.

1. **태스크:** 카드 5개 — 텍스트 분류, 지시 따르기(LLM SFT), 요약, 이미지 분류, 표 데이터 회귀/분류. 고른 태스크가 뒤 단계(모델 목록·컬럼 역할·평가 지표)를 정한다.
2. **베이스 모델:** 태스크로 걸러진 모델 카탈로그(목업) 표와 검색. 크기(파라미터), 라이선스 태그, 언어, 추천 GPU를 보여 준다. 예: `klue/bert-base`, `beomi/KoAlpaca-Polyglot-5.8B`, `meta-llama/Llama-3.1-8B`, `Qwen/Qwen2.5-7B`, `google/vit-base-patch16-224`, `microsoft/resnet-50`, `xgboost`.
3. **데이터셋:** 출처 세 가지.
   - **CSV/JSONL 업로드:** 파일을 브라우저에서 바로 파싱한다(`src/lib/parse.ts`, 의존성 없는 자체 파서: 따옴표·이스케이프·CRLF·BOM, JSONL 줄 번호 오류). 앞 5행 미리보기 표, 감지된 컬럼(타입 추정·빈 값 수).
   - **Hugging Face 데이터셋 ID:** `e9t/nsmc`, `beomi/KoAlpaca-v1.1a` 등 목업 미리보기. 실제 허브는 조회하지 않는다.
   - **샘플 데이터셋:** 태스크별 내장 목업.
   - 그다음 **컬럼 매핑**: 데이터셋 컬럼을 태스크 역할에 연결한다(분류: `text`·`label`, SFT: `instruction`·`input`(선택)·`output`, 요약: `document`·`summary`, 이미지: `image`·`label`, 표: `target`·`id`(제외)). 이름이 비슷하면 자동으로 채우고, 필수 역할 누락·없는 컬럼·한 컬럼 중복 사용·라벨 1종류·표 특성 열 없음은 오류로 막는다. 빈 값은 경고만 한다.
   - **학습/검증 분할** 슬라이더(50–95%)와 행 수, **라벨 분포** 막대.
4. **학습 설정:** 프리셋 `빠르게`(1 epoch) / `균형`(3 epoch, 기본) / `최고 품질`(5 epoch, 전체 미세조정)이 epoch·learning rate·batch size·LoRA(켜기/rank)를 채운다. `고급`을 펼쳐 직접 바꾸면 `사용자 지정`이 된다. LoRA는 1B 이상 LLM에서만 켤 수 있다. GPU는 모델 크기·LoRA로 필요한 메모리를 계산해 자동 추천하고 `직접 고르기`로 바꿀 수 있다(메모리가 모자라면 막는다). 예상 시간·비용은 목업 공식(샘플당 시간 × 학습 행 × epoch ÷ GPU 속도 + 3분)으로 보여 준다.
5. **검토 및 시작:** 실행 이름(기본값은 모델·데이터셋으로 만든 slug)과 사람이 읽는 요약 카드(각 카드의 `수정`으로 해당 단계 이동). `API 요청으로 보기`를 펼치면 같은 내용의 JSON 요청 본문과 복사 버튼이 있다. `학습 시작`을 누르면 목업 실행이 목록 맨 위에 생긴다.

API 요청 본문(제안 스키마, `src/lib/request.ts`의 `buildRequest`):

```json
{
  "name": "bert-base-ko-shopping-reviews",
  "task": "text-classification",
  "base_model": "klue/bert-base",
  "dataset": {
    "source": "sample",
    "uri": "sample://ko-shopping-reviews",
    "format": "csv",
    "columns": { "text": "document", "label": "label" },
    "split": { "train": 0.9, "validation": 0.1, "seed": 42 }
  },
  "hyperparameters": {
    "preset": "balanced",
    "epochs": 3,
    "learning_rate": 0.0001,
    "batch_size": 16,
    "lora": { "enabled": false }
  },
  "compute": { "gpu": "t4", "gpu_count": 1, "auto": true }
}
```

`dataset.source`는 `upload`·`huggingface`·`sample`이고 `uri`는 각각 `upload://<파일>`·`hf://<ID>`·`sample://<ID>`다. 매핑하지 않은 선택 역할은 `columns`에서 빠진다. LoRA를 켜면 `"lora": { "enabled": true, "rank": 16 }`.

### 출력: 실행 목록과 상세

- **실행 목록:** 실행 이름·ID, 상태(`대기`/`실행 중`/`완료`/`실패`, 실패 이유는 마우스 오버), 태스크, 베이스 모델, 단계 진행 바, 최신 평가 지표, 생성 시각. 처음에는 시드 실행 5개(완료 2, 학습 중 1, 막 시작 1, 데이터 검증 실패 1 — `데이터셋 라벨 컬럼(label)에 빈 값 132개가 있습니다…`)가 있고, 1.5초마다 타이머로 진행한다. 행을 누르면 상세로 간다.
- **실행 상세:**
  - 진행률 헤더와 **단계 파이프라인** `데이터 검증 → 토크나이즈 → 학습 → 평가 → 모델 등록`(완료 초록, 진행 중 보라 + %, 실패 빨강). 실패하면 원인 배너. 태스크·모델·데이터셋·컴퓨트·예상 시간/비용.
  - **학습 loss**와 **검증 지표** 그래프(분류: F1/정확도, SFT·요약: ROUGE-L). SVG로 직접 그린다.
  - 완료 후 **평가 결과**: 지표 표(분류: 정확도·정밀도·재현율·F1 / 생성: ROUGE-1·2·L·BLEU)와, 분류는 혼동 행렬, SFT·요약은 샘플 생성 결과 표(입력·정답·모델 출력).
  - **결과물**: `모델 레지스트리에 등록됨: devoops/<이름>:v1`, 다운로드 버튼(LoRA 어댑터·병합 모델 또는 전체 가중치, 목업).
  - **플레이그라운드**: 입력을 넣고 `예측`하면 목업 예측(분류는 라벨별 확률 막대, SFT는 답변, 요약은 요약문)을 보여 준다.

## 구조

```
src/App.tsx                       상단 바(목업 데이터 표시), 목업 실행 상태·1.5초 타이머, 홈/상세 전환
src/components/LaunchWizard.tsx   5단계 마법사(태스크·모델·학습 설정·검토, JSON 보기)
src/components/DatasetStep.tsx    데이터셋 단계: 업로드/HF/샘플, 미리보기, 컬럼 매핑, 분할, 라벨 분포
src/components/RunList.tsx        실행 목록 표·상태 배지
src/components/RunDetail.tsx      실행 상세: 파이프라인, 그래프, 평가 결과, 결과물, 플레이그라운드
src/components/LineChart.tsx      (step, 값) SVG 선 그래프
src/lib/parse.ts                  CSV/JSONL 파서
src/lib/mapping.ts                자동 매핑·매핑 검증·라벨 분포·분할·타입 추정
src/lib/estimate.ts               프리셋, GPU 추천, 시간·비용 추정(목업 공식)
src/lib/request.ts                API 요청 본문 생성(buildRequest), 실행 이름
src/lib/format.ts                 표시용 포맷
src/mock/catalog.ts               태스크·역할, 모델 카탈로그, GPU 목록
src/mock/datasets.ts              샘플 데이터셋, HF ID 목업 미리보기
src/mock/runs.ts                  실행 모델, tick() 진행 시뮬레이션, 평가 결과·예측 목업
src/mock/seed.ts                  시드 실행 5개
nginx.conf                        index.html은 no-cache, 해시가 붙은 assets는 장기 캐시
```

## 테스트

Vitest + Testing Library.

```sh
npm install
npm run lint      # eslint
npm run typecheck # tsc --noEmit
npm test          # vitest run
npm run build
```

- `parse` (순수): CSV 헤더·행, 따옴표 안 쉼표·줄바꿈·`""`, CRLF·BOM, 빈 줄·모자란 칸, 빈/중복 헤더, 닫히지 않은 따옴표, JSONL 키 합치기·값 문자열화·오류 줄 번호, 확장자로 파서 선택
- `mapping` (순수): 동의어 자동 매핑, 필수/선택 역할, 없는 컬럼·중복 사용, 라벨 2종류 이상, 표 특성 열, 빈 값 경고, 라벨 분포·기타 묶음, 분할, 타입 추정
- `request` (순수): 요청 본문 전체 모양, 선택 역할 제외, `hf://`·`sample://` URI, LoRA 끔, 실행 이름 slug·검증
- `estimate` (순수): 프리셋과 LoRA 가능 여부, 하이퍼파라미터 검증, GPU 추천(작은 GPU·A100 여러 장·CPU), 시간·비용 공식 값과 단조성, 시간 표시
- `mock/runs`: 시드 상태 다양성·실패 이유, 단계 진행 끝까지·loss 감소, 혼동 행렬·샘플 생성, 플레이그라운드 예측
- `App` (RTL): 마법사를 끝까지 걸어 제출 → 실행이 목록에 생기고 상세로 이동, CSV 업로드 미리보기·매핑 오류로 막힘·빈 값 경고, 잘못된 JSONL 오류, 완료 실행의 결과물·혼동 행렬·플레이그라운드와 실패 실행의 원인

## CI (`.github/workflows/ci.yml`)

협업 규칙 §7을 따른다. CD(ArgoCD)는 아직 정하지 않았다.

| 시점 | 실행 | 이미지 |
|---|---|---|
| `dev`·`main`행 PR, `dev` push | `eslint` → `tsc --noEmit` → `vitest` → `npm run build` → 이미지 빌드 | push 안 함 |
| `main` push(머지) | 같은 검사 → 이미지 빌드 | `ghcr.io/devoops-team/frontend:main`, `:sha-<커밋 7자리>` (linux/amd64) |

- 이미지에 들어갈 백엔드 주소는 레포 변수 `VITE_API_BASE`다(없으면 `http://localhost:8080`). 이 목업 브랜치는 백엔드를 부르지 않아 쓰지 않는다.
- GHCR 로그인은 기본 `GITHUB_TOKEN`을 쓴다. `main`행 PR 리뷰어는 `.github/CODEOWNERS`(정·부담당)다.

## 로컬 Docker 실행

```sh
docker build -t devoops-frontend:dev .        # 이미지 빌드 중에 테스트도 돈다
docker run -d --name devoops-frontend -p 5173:80 devoops-frontend:dev
open http://localhost:5173
```

화면은 항상 흰색(`color-scheme: only light`)이라 OS·브라우저 다크 모드의 영향을 받지 않는다.

