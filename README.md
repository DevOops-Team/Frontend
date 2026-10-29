# Frontend

학습 작업을 올리고 진행 상태를 보는 목업 화면입니다. Vite + React + TypeScript로 만들었습니다.

## 화면

- **예시 파일:** 제출 폼 위의 `예시 job.yaml`·`예시 train.py`·`예시 학습 데이터` 버튼을 누르면 모달로 내용을 보여 준다. `닫기`, Esc, 바깥 클릭으로 닫는다.
  - `src/examples/`는 Backend 저장소 `examples/`의 복사본이다(`?raw` import로 번들에 넣는다). 학습 데이터는 설명과 앞 20행만 넣었다.
  - 예시는 DDP 학습이다. GPU 노드 2대에 Pod 1개씩(`torchrun --nnodes=2`), 체크포인트는 rank 0만 S3(`/ckpt`)에 1000 step마다 쓴다.
- **작업 제출:** `job.yaml`(JobSet), `train.py`, 학습 데이터(여러 파일 가능)를 고른다. 세 가지가 모두 있어야 제출 버튼이 켜진다.
  - 제출에 성공하면 작업 ID를 보여 주고, 실패하면 백엔드 오류 메시지를 그대로 보여 준다.
- **작업 목록:** 2초마다 `GET /api/jobs`로 갱신한다.

| 열 | 내용 |
|---|---|
| 작업 | 작업 ID. JobSet이 재시작됐으면 `재시작 N회`(노드를 잃고 복구한 흔적) |
| 상태 | `Pending` / `Admitted` / `Running` / `Succeeded` / `Failed`. 마우스를 올리면 Kueue 메시지(대기 이유)가 보인다 |
| 클러스터 | MultiKueue가 고른 EKS(`devoops-a`/`devoops-b`). 아직 없으면 `미배정` |
| 진행 | step / total_steps 진행 바 (train.py가 DynamoDB에 기록한 값) |
| loss · 마지막 체크포인트 · 노드 | 같은 DynamoDB 항목 |
| 파일 | `보기`를 누르면 그 작업에 올린 파일을 표 아래에 펼친다(아래 참고) |

- **제출 파일 보기:** 작업마다 S3에 저장된 `job.yaml`(제출한 원본), `train.py`, 학습 데이터 목록을 버튼으로 보여 준다. 처음에는 첫 파일(job.yaml)을 열고, 버튼을 누르면 그 파일 내용을 보여 준다.
  - 백엔드 `GET /api/jobs/{id}/files`, `GET /api/jobs/{id}/files/{kind}/{name}`을 쓴다.
  - 데이터셋은 클 수 있어서 백엔드가 앞 64KiB만 준다. 잘렸으면 `앞부분만 표시 (64.0KB / 전체 N MB)`라고 표시한다.
  - 이 기능 전에 제출한 작업은 job.yaml이 저장돼 있지 않다.

진행 기록이 아직 없으면 `진행 기록 없음`을 표시한다. 백엔드에 연결할 수 없으면 목록 위에 그 사실을 표시한다.

## 구조

```
src/api.ts                    백엔드 API 클라이언트·타입 (Backend internal/api와 같은 모양)
src/App.tsx                   폴링(2초)과 제출 후 즉시 갱신
src/components/UploadForm.tsx 업로드 폼
src/components/JobList.tsx    작업 표
src/components/JobFiles.tsx   작업에 올린 파일 목록·내용
src/components/ExampleFiles.tsx 예시 파일 모달
src/examples/                 Backend examples 복사본(job.yaml, train.py, train.csv 앞 20행)
nginx.conf                    index.html은 no-cache, 해시가 붙은 assets는 장기 캐시
```

백엔드 주소는 `VITE_API_BASE`이고 기본값은 `http://localhost:8080`이다. 빌드할 때 번들에 들어간다.

## 테스트

TDD로 작성했다(Vitest + Testing Library, `fetch`는 stub).

```sh
npm install
npm test          # vitest run
npm run typecheck
npm run build
```

- `api`: multipart 필드(`job`, `train`, `data` 여러 개)와 URL, 서버 오류 메시지 전달, 파일 목록·내용 URL(파일명 인코딩), 잘림 헤더 해석
- `UploadForm`: 세 입력이 다 있어야 제출 가능, 선택한 파일 전달, 오류 표시
- `JobList`: 클러스터·상태·진행 바·loss·체크포인트·노드·재시작 수, 진행 기록 없음, 빈 목록, `파일 보기`로 파일 펼치기
- `ExampleFiles`: 버튼별 모달 내용(job.yaml·train.py·데이터 설명과 앞부분), 닫기 버튼·Esc로 닫기
- `JobFiles`: 파일 목록, 처음에 job.yaml 열기, 다른 파일 선택, 잘린 데이터 안내, 빈 상태
- `App`: 2초 폴링으로 값이 갱신되는지, 백엔드 연결 실패 표시

## 로컬 Docker 실행

```sh
docker build -t devoops-frontend:dev .        # 이미지 빌드 중에 테스트도 돈다
docker run -d --name devoops-frontend -p 5173:80 devoops-frontend:dev
open http://localhost:5173
```

화면은 항상 흰색(`color-scheme: only light`)이라 OS·브라우저 다크 모드의 영향을 받지 않는다.

백엔드 주소를 바꾸려면 `--build-arg VITE_API_BASE=http://<host>:<port>`를 준다. 백엔드의 `ALLOWED_ORIGIN`은 프론트 주소(`http://localhost:5173`)와 같아야 한다.
