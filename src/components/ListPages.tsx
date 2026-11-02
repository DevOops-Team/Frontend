import { useState } from 'react';
import { bestTrial } from '../lib/hpt';
import { formatDuration, formatTime, poolSummary } from '../lib/format';
import type { Navigate, TrainingTab } from '../lib/route';
import { TICK_SECONDS, type Pipeline, type Store } from '../mock/store';
import { Empty, FilterBar, PageHeader, StateBadge } from './ui';

const PIPELINE_STATES = ['PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED'];

function match(q: string, ...fields: (string | undefined)[]) {
  const s = q.trim().toLowerCase();
  return !s || fields.some((f) => f?.toLowerCase().includes(s));
}

function NewTrainingButton({ nav }: { nav: Navigate }) {
  return (
    <button type="button" className="btn primary" onClick={() => nav({ page: 'create' })}>
      ＋ 새 모델 학습
    </button>
  );
}

export function Dashboard({ store, nav }: { store: Store; nav: Navigate }) {
  const count = (s: string) => store.pipelines.filter((p) => p.state === s).length;
  const tiles: [string, number, () => void][] = [
    ['실행 중인 학습', count('RUNNING') + count('PENDING'), () => nav({ page: 'training', tab: 'pipelines' })],
    ['실패한 학습', count('FAILED'), () => nav({ page: 'training', tab: 'pipelines' })],
    ['모델', store.models.length, () => nav({ page: 'models' })],
    ['엔드포인트', store.endpoints.length, () => nav({ page: 'endpoints' })],
  ];
  return (
    <>
      <PageHeader title="대시보드" actions={<NewTrainingButton nav={nav} />} />
      <div className="tiles">
        {tiles.map(([label, n, go]) => (
          <button key={label} type="button" className="tile" onClick={go}>
            <span className="small muted">{label}</span>
            <strong>{n}</strong>
          </button>
        ))}
      </div>
      <section className="card flush">
        <div className="card-head">
          <h2>최근 학습 파이프라인</h2>
          <button type="button" className="link small" onClick={() => nav({ page: 'training', tab: 'pipelines' })}>
            모두 보기
          </button>
        </div>
        <PipelineTable pipelines={store.pipelines.slice(0, 5)} store={store} nav={nav} />
      </section>
    </>
  );
}

export function DatasetsPage({ store }: { store: Store }) {
  const [q, setQ] = useState('');
  const rows = store.datasets.filter((d) => match(q, d.displayName, d.id));
  return (
    <>
      <PageHeader title="데이터셋" />
      <p className="muted small page-note">학습 방법 단계에서 고를 수 있는 관리형 데이터셋입니다 (목업).</p>
      <section className="card flush">
        <FilterBar query={q} onQuery={setQ} />
        <div className="table-wrap">
          <table className="list">
            <thead>
              <tr>
                <th>이름</th>
                <th>ID</th>
                <th>유형</th>
                <th>항목 수</th>
                <th>주석 세트</th>
                <th>리전</th>
                <th>생성</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id}>
                  <td>{d.displayName}</td>
                  <td className="mono small">{d.id}</td>
                  <td>{d.type}</td>
                  <td>{d.items.toLocaleString('ko-KR')}</td>
                  <td className="small">{d.annotationSets.join(', ')}</td>
                  <td className="small">{d.region}</td>
                  <td className="small muted">{formatTime(d.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function PipelineTable({ pipelines, store, nav }: { pipelines: Pipeline[]; store: Store; nav: Navigate }) {
  if (pipelines.length === 0) return <Empty>조건에 맞는 학습 파이프라인이 없습니다</Empty>;
  return (
    <div className="table-wrap">
      <table className="list">
        <thead>
          <tr>
            <th>이름</th>
            <th>상태</th>
            <th>작업 유형</th>
            <th>모델</th>
            <th>리전</th>
            <th>생성</th>
            <th>경과 시간</th>
          </tr>
        </thead>
        <tbody>
          {pipelines.map((p) => {
            const model = store.models.find((m) => m.id === p.modelId);
            return (
              <tr key={p.id}>
                <td>
                  <button type="button" className="link" onClick={() => nav({ page: 'pipeline', id: p.id })}>
                    {p.displayName}
                  </button>
                  <div className="mono small muted">{p.id}</div>
                </td>
                <td>
                  <StateBadge state={p.state} title={p.error} />
                </td>
                <td className="small">{p.hptJobId ? '커스텀 학습 + 초매개변수 조정' : '커스텀 학습'}</td>
                <td className="small">
                  {model ? (
                    <button type="button" className="link" onClick={() => nav({ page: 'model', id: model.id })}>
                      {`${model.displayName} v${p.modelVersion}`}
                    </button>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                <td className="small">{p.region}</td>
                <td className="small muted">{formatTime(p.createdAt)}</td>
                <td className="small">{formatDuration(p.tick * TICK_SECONDS)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const TABS: { id: TrainingTab; label: string }[] = [
  { id: 'pipelines', label: '학습 파이프라인' },
  { id: 'custom', label: '커스텀 작업' },
  { id: 'hpt', label: '초매개변수 조정 작업' },
];

export function TrainingPage({ store, tab, nav }: { store: Store; tab: TrainingTab; nav: Navigate }) {
  const [q, setQ] = useState('');
  const [state, setState] = useState('');
  const ok = (s: string) => !state || s === state;

  return (
    <>
      <PageHeader title="학습" actions={<NewTrainingButton nav={nav} />} />
      <div className="tabs" role="tablist" aria-label="학습 작업 종류">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={t.id === tab} onClick={() => nav({ page: 'training', tab: t.id })}>
            {t.label}
          </button>
        ))}
      </div>
      <section className="card flush">
        <FilterBar query={q} onQuery={setQ} state={state} onState={setState} states={PIPELINE_STATES} />
        {tab === 'pipelines' && <PipelineTable pipelines={store.pipelines.filter((p) => ok(p.state) && match(q, p.displayName, p.id))} store={store} nav={nav} />}

        {tab === 'custom' && (
          <div className="table-wrap">
            <table className="list">
              <thead>
                <tr>
                  <th>커스텀 작업</th>
                  <th>상태</th>
                  <th>작업자 풀</th>
                  <th>학습 파이프라인</th>
                  <th>생성</th>
                </tr>
              </thead>
              <tbody>
                {store.pipelines
                  .filter((p) => !p.hptJobId && ok(p.state) && match(q, p.customJobId, p.displayName))
                  .map((p) => (
                    <tr key={p.customJobId}>
                      <td>
                        <button type="button" className="link" onClick={() => nav({ page: 'pipeline', id: p.id })}>
                          {`${p.displayName}-custom-job`}
                        </button>
                        <div className="mono small muted">{p.customJobId}</div>
                      </td>
                      <td>
                        <StateBadge state={p.state} />
                      </td>
                      <td className="mono small">{poolSummary(p)}</td>
                      <td className="small">{p.displayName}</td>
                      <td className="small muted">{formatTime(p.createdAt)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'hpt' && (
          <div className="table-wrap">
            <table className="list">
              <thead>
                <tr>
                  <th>조정 작업</th>
                  <th>상태</th>
                  <th>시도</th>
                  <th>최적 측정항목</th>
                  <th>알고리즘</th>
                  <th>생성</th>
                </tr>
              </thead>
              <tbody>
                {store.hptJobs
                  .filter((j) => ok(j.state) && match(q, j.displayName, j.id))
                  .map((j) => {
                    const best = bestTrial(j.trials, j.study.metrics[0].goal);
                    const done = j.trials.filter((t) => t.state === 'SUCCEEDED' || t.state === 'INFEASIBLE').length;
                    return (
                      <tr key={j.id}>
                        <td>
                          <button type="button" className="link" onClick={() => nav({ page: 'hpt', id: j.id })}>
                            {j.displayName}
                          </button>
                          <div className="mono small muted">{j.id}</div>
                        </td>
                        <td>
                          <StateBadge state={j.state} />
                        </td>
                        <td className="small">{`${done} / ${j.maxTrials}`}</td>
                        <td className="mono small">{best ? `${j.study.metrics[0].metricId} ${best.metric}` : '—'}</td>
                        <td className="small">{j.study.algorithm}</td>
                        <td className="small muted">{formatTime(j.createdAt)}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

export function ModelsPage({ store, nav }: { store: Store; nav: Navigate }) {
  const [q, setQ] = useState('');
  const rows = store.models.filter((m) => match(q, m.displayName, m.id));
  return (
    <>
      <PageHeader title="모델 레지스트리" />
      <section className="card flush">
        <FilterBar query={q} onQuery={setQ} />
        {rows.length === 0 ? (
          <Empty>모델이 없습니다. 예측 컨테이너를 지정한 학습 파이프라인이 성공하면 여기에 등록됩니다.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="list">
              <thead>
                <tr>
                  <th>이름</th>
                  <th>기본 버전</th>
                  <th>버전 수</th>
                  <th>배포</th>
                  <th>리전</th>
                  <th>최근 업데이트</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => {
                  const latest = m.versions[m.versions.length - 1];
                  const eps = store.endpoints.filter((e) => e.deployments.some((d) => d.modelId === m.id)).length;
                  return (
                    <tr key={m.id}>
                      <td>
                        <button type="button" className="link" onClick={() => nav({ page: 'model', id: m.id })}>
                          {m.displayName}
                        </button>
                        <div className="mono small muted">{m.id}</div>
                      </td>
                      <td className="small">{`버전 ${latest.versionId}`}</td>
                      <td className="small">{m.versions.length}</td>
                      <td className="small">{eps ? `엔드포인트 ${eps}개` : <span className="muted">배포 안 됨</span>}</td>
                      <td className="small">{m.region}</td>
                      <td className="small muted">{formatTime(latest.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

export function EndpointsPage({ store, nav }: { store: Store; nav: Navigate }) {
  const [q, setQ] = useState('');
  const rows = store.endpoints.filter((e) => match(q, e.displayName, e.id));
  return (
    <>
      <PageHeader title="엔드포인트" />
      <section className="card flush">
        <FilterBar query={q} onQuery={setQ} />
        {rows.length === 0 ? (
          <Empty>엔드포인트가 없습니다. 모델 레지스트리에서 모델 버전을 배포하세요.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="list" aria-label="엔드포인트 목록">
              <thead>
                <tr>
                  <th>이름</th>
                  <th>상태</th>
                  <th>배포된 모델 (트래픽)</th>
                  <th>머신 · 복제본</th>
                  <th>리전</th>
                  <th>생성</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.id}>
                    <td>
                      {e.displayName}
                      <div className="mono small muted">{e.id}</div>
                    </td>
                    <td>
                      <StateBadge state="SUCCEEDED" label="활성" />
                    </td>
                    <td className="small">
                      {e.deployments.map((d) => (
                        <div key={`${d.modelId}-${d.versionId}`}>
                          <button type="button" className="link" onClick={() => nav({ page: 'model', id: d.modelId })}>
                            {`${d.modelName} v${d.versionId}`}
                          </button>{' '}
                          <span className="muted">{d.traffic}%</span>
                        </div>
                      ))}
                    </td>
                    <td className="small mono">
                      {e.deployments.map((d) => (
                        <div key={`${d.modelId}-${d.versionId}`}>{`${d.machineType} · ${d.minReplicas}–${d.maxReplicas}`}</div>
                      ))}
                    </td>
                    <td className="small">{e.region}</td>
                    <td className="small muted">{formatTime(e.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
