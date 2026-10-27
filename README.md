# Frontend

학습 작업을 올리고 진행 상태를 보는 목업 화면입니다. Vite + React + TypeScript로 만들었습니다.

## 화면

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

진행 기록이 아직 없으면 `진행 기록 없음`을 표시한다. 백엔드에 연결할 수 없으면 목록 위에 그 사실을 표시한다.

## 구조

```
src/api.ts                    백엔드 API 클라이언트·타입 (Backend internal/api와 같은 모양)
src/App.tsx                   폴링(2초)과 제출 후 즉시 갱신
src/components/UploadForm.tsx 업로드 폼
src/components/JobList.tsx    작업 표
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

- `api`: multipart 필드(`job`, `train`, `data` 여러 개)와 URL, 서버 오류 메시지 전달
- `UploadForm`: 세 입력이 다 있어야 제출 가능, 선택한 파일 전달, 오류 표시
- `JobList`: 클러스터·상태·진행 바·loss·체크포인트·노드·재시작 수, 진행 기록 없음, 빈 목록
- `App`: 2초 폴링으로 값이 갱신되는지, 백엔드 연결 실패 표시

## 로컬 Docker 실행

```sh
docker build -t devoops-frontend:dev .        # 이미지 빌드 중에 테스트도 돈다
docker run -d --name devoops-frontend -p 5173:80 devoops-frontend:dev
open http://localhost:5173
```

백엔드 주소를 바꾸려면 `--build-arg VITE_API_BASE=http://<host>:<port>`를 준다. 백엔드의 `ALLOWED_ORIGIN`은 프론트 주소(`http://localhost:5173`)와 같아야 한다.
