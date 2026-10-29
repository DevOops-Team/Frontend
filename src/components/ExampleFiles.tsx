import { useEffect, useState, type ReactNode } from 'react';
// Backend 저장소 examples/의 복사본. 백엔드 예시를 바꾸면 여기도 같이 바꾼다.
import jobYaml from '../examples/job.yaml?raw';
import trainPy from '../examples/train.py?raw';
import trainHead from '../examples/train-head.csv?raw';

interface Example {
  button: string;
  title: string;
  body: ReactNode;
}

const DATA_DESCRIPTION = (
  <>
    <p>
      인프라(배치·복구·체크포인트·진행 상태) 확인용 <strong>합성 선형 회귀 데이터</strong>입니다. Backend 저장소의{' '}
      <code>examples/make_data.py</code>로 만들며, seed가 고정이라 항상 같은 파일이 나옵니다.
    </p>
    <table>
      <tbody>
        <tr>
          <th>형식</th>
          <td>CSV, 헤더 없음, 5000행 × 9열, 약 380KB</td>
        </tr>
        <tr>
          <th>입력 (앞 8열)</th>
          <td>x1..x8, 각각 표준정규분포 N(0, 1)</td>
        </tr>
        <tr>
          <th>레이블 (마지막 열)</th>
          <td>y = w·x + ε, w = [0.942, -1.397, -0.680, 0.371, -1.016, -0.072, 0.179, -0.831], ε ~ N(0, 0.1²)</td>
        </tr>
        <tr>
          <th>모델</th>
          <td>train.py의 MLP(8 → 256 → 1), MSE loss, DDP 2 rank(GPU 노드 2대). loss가 약 0.01 근처까지 내려가면 정상</td>
        </tr>
      </tbody>
    </table>
    <p className="muted">앞 20행:</p>
    <pre>{trainHead}</pre>
  </>
);

const EXAMPLES: Example[] = [
  { button: '예시 job.yaml', title: 'job.yaml', body: <pre>{jobYaml}</pre> },
  { button: '예시 train.py', title: 'train.py', body: <pre>{trainPy}</pre> },
  { button: '예시 학습 데이터', title: 'train.csv', body: DATA_DESCRIPTION },
];

// 제출 폼 옆에서 예시 파일을 모달로 보여 준다.
export function ExampleFiles() {
  const [open, setOpen] = useState<Example | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="examples">
      {EXAMPLES.map((ex) => (
        <button key={ex.title} type="button" onClick={() => setOpen(ex)}>
          {ex.button}
        </button>
      ))}
      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(null)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="example-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header>
              <h3 id="example-title">{open.title}</h3>
              <button type="button" onClick={() => setOpen(null)} autoFocus>
                닫기
              </button>
            </header>
            <div className="modal-body">{open.body}</div>
          </div>
        </div>
      )}
    </div>
  );
}
