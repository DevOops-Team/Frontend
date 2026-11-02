# Frontend

학습 작업을 올리고 진행 상태를 보는 목업 화면입니다. Vite + React + TypeScript로 만들었습니다.

## 화면

> **데모: 가이드 실행기 (`demo/guided-launcher`)** — 사용자가 YAML을 직접 쓰지 않는 폼 기반 디자인이다. 밝은 테마, 상단 내비게이션, 가운데 정렬된 넓은 레이아웃, 보라색 강조·둥근 카드. 입력은 4단계 마법사(`1 코드 → 2 데이터 → 3 컴퓨트 → 4 검토 및 실행`)이고, 컴퓨트 단계에서 고른 값으로 `src/jobTemplate.ts`의 `buildJobYaml()`이 job.yaml(JobSet)을 만든다. 실행하면 그 문자열을 `File('job.yaml')`로 바꿔 기존과 같은 multipart(`job`·`train`·`data`)로 올린다. 백엔드 계약은 그대로다.

- **새 학습 작업 (마법사):** 단계마다 필요한 입력이 있어야 `다음`이 켜진다. 지난 단계는 위쪽 단계 표시를 눌러 돌아갈 수 있다.
  1. **코드:** `train.py`를 올리거나 `예시 train.py 사용`.
  2. **데이터:** 학습 데이터(여러 파일 가능)를 올리거나 `예시 데이터 사용`(train.csv 앞 20행).
  3. **컴퓨트:** 하드웨어 카드(`T4 × 1 / g4dn.xlarge`, `A10G × 1 / g5.xlarge`, `L4 × 1 / g6.xlarge`, `T4 × 4 / g4dn.12xlarge`), 노드 수(1–4), Spot 선호 토글, 총 step, 체크포인트 간격, 최대 재시작 횟수, 컨테이너 이미지, 작업 이름. 값이 잘못되면 칸 아래에 이유를 보여 주고 다음 단계로 못 간다.
  4. **검토 및 실행:** 총 GPU 수·하드웨어·학습 설정·파일 요약과 생성된 job.yaml(읽기 전용)을 보여 주고 `실행`으로 제출한다. 실패하면 백엔드 오류 메시지를 그대로 보여 준다.
  - 생성되는 JobSet은 `src/examples/job.yaml`과 같은 모양이다: `parallelism`·`completions`·`torchrun --nnodes` = 노드 수, `--nproc-per-node`와 `resources`(cpu·memory·`nvidia.com/gpu`)는 하드웨어, `--total-steps`·`--ckpt-every`, `failurePolicy.maxRestarts`. 기본값으로 만들면 예시와 같다(이름 제외, 테스트로 확인).
  - Spot은 JobSet에 표현할 필드가 없어 job.yaml 맨 위 **주석**으로만 남긴다(실제 용량 유형은 클러스터의 Karpenter가 정한다).
  - 입력 형식의 정본은 Backend 저장소 [`docs/input-format.md`](https://github.com/DevOops-Team/Backend/blob/dev/docs/input-format.md)다.
- **실행 목록:** 2초마다 `GET /api/jobs`로 갱신한다. 행을 누르면 작업 상세 화면으로 간다.

| 열 | 내용 |
|---|---|
| 작업 | 작업 ID. JobSet이 재시작됐으면 `재시작 N회`(노드를 잃고 복구한 흔적) |
| 상태 | `Pending` / `Admitted` / `Running` / `Succeeded` / `Failed` 배지. 마우스를 올리면 Kueue 메시지(대기 이유)가 보인다 |
| 클러스터 | MultiKueue가 고른 EKS(`devoops-a`/`devoops-b`). 아직 없으면 `미배정` |
| 진행 | step / total_steps 진행 바 (train.py가 DynamoDB에 기록한 값) |
| loss · 마지막 체크포인트 · 노드 | 같은 DynamoDB 항목 |
| 생성 | 작업을 만든 시각 |

- **작업 상세:** `실행 목록 / <작업 ID>` 이동 경로로 돌아간다. 큰 진행률 헤더(%·step, loss·체크포인트·클러스터·노드·재시작), loss 그래프, 전달 상태, 제출 파일을 보여 준다.
  - loss 그래프는 화면이 폴링한 값을 작업별로 메모리에 최근 120개까지 모아 SVG로 그린다(백엔드는 마지막 값만 준다). 새로고침하면 다시 모은다. 재시작으로 step이 줄면 그 뒤 점은 버린다.
- **전달 상태:** `GET /api/jobs/{id}/events`를 2초마다 읽는다.
  - 위쪽 경로: `제출 → k3s Kueue → MultiKueue → 워커 Kueue → JobSet → kube-scheduler → Karpenter → kubelet → 완료`. 이벤트가 있으면 초록, 그 단계의 마지막 이벤트가 Warning이면(예: Spot 용량 부족) 노랑, 아직 없으면 회색이다.
  - 아래 표: 시각, 단계, 클러스터(`k3s`/`devoops-a`/`devoops-b`), 이유(반복 횟수 `×N`), 메시지. GPU가 없는 `devoops-b`가 쿼터 부족으로 대기하다 사본이 지워지는 것도 보인다.
- **제출 파일 보기:** 작업마다 S3에 저장된 `job.yaml`(제출한 원본), `train.py`, 학습 데이터 목록을 버튼으로 보여 준다. 처음에는 첫 파일(job.yaml)을 열고, 버튼을 누르면 그 파일 내용을 보여 준다.
  - 백엔드 `GET /api/jobs/{id}/files`, `GET /api/jobs/{id}/files/{kind}/{name}`을 쓴다.
  - 데이터셋은 클 수 있어서 백엔드가 앞 64KiB만 준다. 잘렸으면 `앞부분만 표시 (64.0KB / 전체 N MB)`라고 표시한다.
  - 이 기능 전에 제출한 작업은 job.yaml이 저장돼 있지 않다.

진행 기록이 아직 없으면 `진행 기록 없음`을 표시한다. 백엔드에 연결할 수 없으면 목록 위에 그 사실을 표시한다.

## 구조

```
src/api.ts                    백엔드 API 클라이언트·타입 (Backend internal/model · api/openapi.yaml과 같은 모양)
src/App.tsx                   상단 바, 폴링(2초)·loss 기록, 홈(마법사+실행 목록)/상세 화면 전환
src/jobTemplate.ts            컴퓨트 옵션 → job.yaml(JobSet) 생성(buildJobYaml)·검증·하드웨어 목록
src/lossHistory.ts            폴링한 작업 목록 → 작업별 (step, loss) 기록
src/components/LaunchWizard.tsx 새 학습 작업 4단계 마법사
src/components/JobList.tsx    실행 목록 표
src/components/JobDetail.tsx  작업 상세 화면
src/components/LossSparkline.tsx loss SVG 그래프
src/components/JobFiles.tsx   작업에 올린 파일 목록·내용
src/components/JobTimeline.tsx 작업 전달 경로·이벤트 표 (2초 폴링)
src/components/stages.ts      이벤트 출처 → 전달 단계 분류
src/examples/                 Backend examples 복사본(job.yaml, train.py, train.csv 앞 20행)
nginx.conf                    index.html은 no-cache, 해시가 붙은 assets는 장기 캐시
```

백엔드 주소는 `VITE_API_BASE`이고 기본값은 `http://localhost:8080`이다. 빌드할 때 번들에 들어간다.

## 테스트

TDD로 작성했다(Vitest + Testing Library, `fetch`는 stub).

```sh
npm install
npm run lint      # eslint
npm run typecheck # tsc --noEmit
npm test          # vitest run
npm run build
```

- `api`: multipart 필드(`job`, `train`, `data` 여러 개)와 URL, 서버 오류 메시지 전달, 파일 목록·내용 URL(파일명 인코딩), 잘림 헤더 해석
- `jobTemplate` (순수 함수): 기본값이 예시 job.yaml과 같은지, 노드 수 → parallelism·completions·--nnodes, step·체크포인트 인자, maxRestarts·이름·이미지, 하드웨어별 resources·--nproc-per-node, Spot은 주석만, 이미지 따옴표, 총 GPU, 입력 검증
- `lossHistory` (순수 함수): step마다 한 점, 변화 없으면 같은 객체, 최근 N개, 재시작 후 되감기, 진행 기록 없는 작업 무시
- `LaunchWizard`: 단계별 `다음` 잠금, 예시 코드·데이터, 노드 1–4 제한, 검증 오류, job.yaml 미리보기·총 GPU, 생성된 job.yaml을 multipart로 전달, 오류 표시
- `JobList`: 클러스터·상태·진행 바·loss·체크포인트·노드·재시작 수, 진행 기록 없음, 빈 목록, 행 클릭으로 상세 열기
- `JobTimeline`: 출처 → 단계 분류, 경로 단계별 상태(완료·경고·대기), 시간순 이벤트 표와 반복 횟수, 2초 폴링, 빈 상태
- `JobFiles`: 파일 목록, 처음에 job.yaml 열기, 다른 파일 선택, 잘린 데이터 안내, 빈 상태
- `App`: 2초 폴링으로 값이 갱신되는지, 백엔드 연결 실패 표시, 상세 화면의 loss 그래프(폴링 기록)와 이동 경로로 돌아가기

## CI (`.github/workflows/ci.yml`)

협업 규칙 §7을 따른다. CD(ArgoCD)는 아직 정하지 않았다.

| 시점 | 실행 | 이미지 |
|---|---|---|
| `dev`·`main`행 PR, `dev` push | `eslint` → `tsc --noEmit` → `vitest` → `npm run build` → 이미지 빌드 | push 안 함 |
| `main` push(머지) | 같은 검사 → 이미지 빌드 | `ghcr.io/devoops-team/frontend:main`, `:sha-<커밋 7자리>` (linux/amd64) |

- 이미지에 들어갈 백엔드 주소는 레포 변수 `VITE_API_BASE`다(없으면 `http://localhost:8080`).
- GHCR 로그인은 기본 `GITHUB_TOKEN`을 쓴다. `main`행 PR 리뷰어는 `.github/CODEOWNERS`(정·부담당)다.

## 로컬 Docker 실행

```sh
docker build -t devoops-frontend:dev .        # 이미지 빌드 중에 테스트도 돈다
docker run -d --name devoops-frontend -p 5173:80 devoops-frontend:dev
open http://localhost:5173
```

화면은 항상 흰색(`color-scheme: only light`)이라 OS·브라우저 다크 모드의 영향을 받지 않는다.

백엔드 주소를 바꾸려면 `--build-arg VITE_API_BASE=http://<host>:<port>`를 준다. 백엔드의 `ALLOWED_ORIGIN`은 프론트 주소(`http://localhost:5173`)와 같아야 한다.
