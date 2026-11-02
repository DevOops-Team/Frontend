import { useState } from 'react';
import { gpuOf, taskOf } from '../mock/catalog';
import { formatCount, since, stageLabel } from '../lib/format';
import { formatMinutes } from '../lib/estimate';
import { STAGES, evaluation, metricName, overallProgress, predict, registryName, stageState, type Prediction, type Run } from '../mock/runs';
import { LineChart } from './LineChart';
import { StatusBadge } from './RunList';

interface Props {
  run: Run | undefined;
  runId: string;
  onBack: () => void;
}

function Pipeline({ run }: { run: Run }) {
  return (
    <ol className="pipeline" aria-label="단계 진행">
      {STAGES.map((name, i) => {
        const state = stageState(run, i);
        const pct = state === 'done' ? 100 : state === 'active' ? Math.round(run.stageProgress * 100) : 0;
        return (
          <li key={name} data-state={state}>
            <span className="pipe-dot" aria-hidden="true">
              {state === 'done' ? '✓' : state === 'failed' ? '!' : i + 1}
            </span>
            <span className="pipe-name">{name}</span>
            <span className="pipe-sub small muted">
              {state === 'done' ? '완료' : state === 'failed' ? '실패' : state === 'active' ? `${pct}%` : '대기'}
            </span>
            <span className="pipe-bar" aria-hidden="true">
              <span style={{ width: `${pct}%` }} />
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function EvaluationCard({ run }: { run: Run }) {
  const ev = evaluation(run);
  const max = ev.confusion ? Math.max(...ev.confusion.matrix.flat(), 1) : 1;
  return (
    <section className="card">
      <h3>평가 결과</h3>
      <p className="muted small eval-note">검증 세트 {formatCount(run.rows - Math.round(run.rows * run.request.dataset.split.train))}행 기준 (목업)</p>
      <div className="eval-grid">
        <table className="metric-table" aria-label="평가 지표">
          <tbody>
            {ev.metrics.map((m) => (
              <tr key={m.name}>
                <th scope="row">{m.name}</th>
                <td className="mono">{m.value.toFixed(3)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {ev.confusion && (
          <div>
            <div className="small muted confusion-caption">혼동 행렬 (행: 정답, 열: 예측)</div>
            <table className="confusion" aria-label="혼동 행렬">
              <thead>
                <tr>
                  <th />
                  {ev.confusion.labels.map((l) => (
                    <th key={l} scope="col">{l}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ev.confusion.matrix.map((row, i) => (
                  <tr key={ev.confusion!.labels[i]}>
                    <th scope="row">{ev.confusion!.labels[i]}</th>
                    {row.map((v, j) => (
                      <td
                        key={j}
                        className="mono"
                        data-diag={i === j || undefined}
                        style={{ background: `rgba(124, 58, 237, ${(0.06 + (v / max) * 0.6).toFixed(2)})`, color: v / max > 0.55 ? '#fff' : undefined }}
                      >
                        {formatCount(v)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {ev.samples && (
        <div className="table-wrap samples">
          <table aria-label="샘플 생성 결과">
            <thead>
              <tr>
                <th>입력</th>
                <th>정답</th>
                <th>모델 출력</th>
              </tr>
            </thead>
            <tbody>
              {ev.samples.map((s) => (
                <tr key={s.input}>
                  <td className="small">{s.input}</td>
                  <td className="small muted">{s.reference}</td>
                  <td className="small">{s.prediction}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Playground({ run }: { run: Run }) {
  const [input, setInput] = useState('');
  const [result, setResult] = useState<Prediction | null>(null);
  const task = run.request.task;
  const placeholder: Record<string, string> = {
    'text-classification': '예: 배송이 빠르고 품질도 최고예요',
    'instruction-sft': '예: 주문한 상품을 다른 주소로 받을 수 있나요?',
    summarization: '요약할 글을 붙여 넣으세요',
    'image-classification': '이미지 경로 또는 URL (예: s3://bucket/sample.jpg)',
    tabular: '특성 값 (예: tenure_months=2, monthly_fee=69000, support_calls=5)',
  };
  return (
    <section className="card">
      <h3>플레이그라운드</h3>
      <form
        className="playground"
        onSubmit={(e) => {
          e.preventDefault();
          setResult(predict(run, input));
        }}
      >
        <label className="field">
          <span className="field-label">입력</span>
          <textarea rows={3} value={input} placeholder={placeholder[task]} onChange={(e) => setInput(e.target.value)} aria-label="플레이그라운드 입력" />
        </label>
        <div>
          <button type="submit" className="btn primary" disabled={!input.trim()}>
            예측
          </button>
        </div>
      </form>
      {result && (
        <div className="prediction" aria-label="예측 결과" role="status">
          {result.text && <p>{result.text}</p>}
          {result.scores && (
            <ul className="scores">
              {result.scores.map((s, i) => (
                <li key={s.label} data-top={i === 0 || undefined}>
                  <span className="score-label">{s.label}</span>
                  <span className="score-bar">
                    <span style={{ width: `${(s.p * 100).toFixed(1)}%` }} />
                  </span>
                  <span className="mono small">{(s.p * 100).toFixed(1)}%</span>
                </li>
              ))}
            </ul>
          )}
          <p className="small muted">목업 예측입니다. 실제 모델을 호출하지 않습니다.</p>
        </div>
      )}
    </section>
  );
}

function Outputs({ run }: { run: Run }) {
  const lora = run.request.hyperparameters.lora.enabled;
  const [note, setNote] = useState<string | null>(null);
  const downloads = run.request.task === 'tabular' ? ['model.json (XGBoost)'] : lora ? ['LoRA 어댑터 (adapter_model.safetensors)', '병합 모델 (merged)'] : ['전체 가중치 (model.safetensors)'];
  return (
    <section className="card">
      <h3>결과물</h3>
      <p className="registry">
        모델 레지스트리에 등록됨: <code>{registryName(run)}</code>
      </p>
      <div className="downloads">
        {downloads.map((d) => (
          <button key={d} type="button" className="btn" onClick={() => setNote(`${d} 다운로드는 목업이라 파일이 내려가지 않습니다.`)}>
            ↓ {d}
          </button>
        ))}
      </div>
      {note && <p className="small muted">{note}</p>}
    </section>
  );
}

// 실행 상세: 단계 파이프라인, loss·평가 지표 그래프, 평가 결과, 결과물·플레이그라운드.
export function RunDetail({ run, runId, onBack }: Props) {
  return (
    <div className="detail">
      <nav className="breadcrumb" aria-label="위치">
        <button type="button" className="link" onClick={onBack}>
          실행 목록
        </button>
        <span aria-hidden="true">/</span>
        <span>{run?.request.name ?? runId}</span>
      </nav>

      {!run ? (
        <div className="card">
          <p>실행을 찾을 수 없습니다.</p>
        </div>
      ) : (
        <>
          <header className="card detail-header">
            <div className="detail-title">
              <h2>{run.request.name}</h2>
              <StatusBadge status={run.status} />
              <span className="muted small mono">{run.id}</span>
            </div>
            <div className="big-progress">
              <div className="big-progress-num">
                <strong>{`${Math.round(overallProgress(run) * 100)}%`}</strong>
                <span className="muted">
                  {stageLabel(run)}
                  {run.stage === 2 && run.status === 'Running' ? ` · ${run.step} / ${run.totalSteps} step` : ''}
                </span>
              </div>
              <progress aria-label={`${run.request.name} 전체 진행률`} value={overallProgress(run)} max={1} data-failed={run.status === 'Failed' || undefined} />
            </div>
            <Pipeline run={run} />
            {run.failure && (
              <p role="alert" className="banner">
                <strong>{STAGES[run.failure.stage]} 단계에서 실패했습니다.</strong> {run.failure.reason}
              </p>
            )}
            <dl className="stats">
              <div>
                <dt>태스크</dt>
                <dd>{taskOf(run.request.task).name}</dd>
              </div>
              <div>
                <dt>베이스 모델</dt>
                <dd className="mono small">{run.request.base_model}</dd>
              </div>
              <div>
                <dt>데이터셋</dt>
                <dd>
                  {run.datasetTitle} <span className="muted small">· {formatCount(run.rows)}행</span>
                </dd>
              </div>
              <div>
                <dt>컴퓨트</dt>
                <dd>{`${gpuOf(run.request.compute.gpu).label} × ${run.request.compute.gpu_count}`}</dd>
              </div>
              <div>
                <dt>예상 시간 · 비용</dt>
                <dd>
                  {formatMinutes(run.estimate.minutes)} · ${run.estimate.costUsd.toFixed(2)}
                </dd>
              </div>
              <div>
                <dt>생성</dt>
                <dd>{since(run.createdAt)}</dd>
              </div>
            </dl>
          </header>

          <div className="chart-row">
            <section className="card">
              <h3>학습 loss</h3>
              <LineChart points={run.loss} label="loss" />
            </section>
            <section className="card">
              <h3>검증 {metricName(run.request.task)}</h3>
              <LineChart points={run.metric} label={metricName(run.request.task)} color="var(--ok)" digits={3} />
            </section>
          </div>

          {run.status === 'Succeeded' ? (
            <>
              <EvaluationCard run={run} />
              <Outputs run={run} />
              <Playground run={run} />
            </>
          ) : (
            <section className="card">
              <h3>평가 결과 · 결과물</h3>
              <p className="muted">
                {run.status === 'Failed'
                  ? '실패한 실행이라 평가 결과와 모델이 없습니다. 원인을 고친 뒤 새 실행을 시작하세요.'
                  : '모든 단계가 끝나면 평가 결과, 모델 레지스트리 등록 정보, 다운로드와 플레이그라운드가 여기에 나타납니다.'}
              </p>
            </section>
          )}
        </>
      )}
    </div>
  );
}
