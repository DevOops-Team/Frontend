import { useEffect, useState } from 'react';
import { CreatePipeline } from './components/CreatePipeline';
import { StateBadge } from './components/ui';
import { seedStore } from './mock/seed';
import { cancelPipeline, isTerminal, jobSpec, submitPipeline, tickStore, TICK_MS, type Store } from './mock/store';
import type { PipelineRequest } from './lib/pipeline';

export function App({ initialStore }: { initialStore?: Store }) {
  const [store, setStore] = useState(() => initialStore ?? seedStore());
  const [view, setView] = useState('home');
  useEffect(() => { const timer = setInterval(() => setStore(tickStore), TICK_MS); return () => clearInterval(timer); }, []);
  const selected = store.pipelines.find((p) => p.id === view);
  function submit(request: PipelineRequest) { const result = submitPipeline(store, request); setStore(result.store); setView(result.id); }
  return <><header className="topnav"><div className="topnav-inner"><button className="brand" onClick={() => setView('home')}><span className="brand-mark" />DevOops</button><span className="small muted">가이드형 학습</span><span className="mock-tag">목업 데이터</span><span className="topnav-meta small muted">DDP · FSDP</span></div></header><main className="page">
    {view === 'create' ? <CreatePipeline store={store} onSubmit={submit} onCancel={() => setView('home')} /> : selected ? <>
      <button className="link" onClick={() => setView('home')}>← 학습 목록</button><header className="hero"><h1>{selected.displayName}</h1><p className="muted">{jobSpec(selected).distributedTraining.strategy.toUpperCase()} · GPU {jobSpec(selected).distributedTraining.worldSize}개</p><StateBadge state={selected.state} /></header>
      <section className="card"><h2>전달한 학습 입력</h2><dl className="review-grid"><div><dt>학습 모델</dt><dd>{jobSpec(selected).runner.model}</dd></div><div><dt>학습 데이터</dt><dd>{jobSpec(selected).runner.dataset}</dd></div><div><dt>기존 실행 파일</dt><dd>train.py</dd></div></dl></section><section className="card"><h2>학습 진행 상황</h2><div className="guided-pipeline">{['요청 접수', 'GPU 준비', '학습', '결과 저장'].map((label, i) => <div key={label} data-done={selected.tick >= [0, 1, 2, 9][i]}><span>{selected.tick >= [0, 1, 2, 9][i] ? '✓' : i + 1}</span>{label}</div>)}</div>{selected.error && <p role="alert">{selected.error}</p>}{!isTerminal(selected.state) && <button className="btn" onClick={() => setStore((s) => cancelPipeline(s, selected.id))}>학습 중지</button>}</section>
      <section className="card"><h2>실행 기록</h2><ul className="guided-events">{selected.events.map((event, i) => <li key={i}>{event.message}</li>)}</ul>{selected.state === 'SUCCEEDED' && <p className="help-note">결과 저장 위치: {jobSpec(selected).baseOutputDirectory.outputUriPrefix}/model/</p>}<details><summary>실행 요청 보기</summary><pre className="guided-json">{JSON.stringify(selected.request.body, null, 2)}</pre></details></section>
    </> : <><header className="guided-home-head"><div className="hero"><span className="eyebrow">DISTRIBUTED TRAINING</span><h1>여러 GPU로, 더 쉽게 학습하세요</h1><p className="muted">모델에 맞는 DDP 또는 FSDP를 고르고 학습을 시작하세요.</p></div><button className="btn primary" onClick={() => setView('create')}>새 학습 만들기</button></header><section className="guided-intro"><div><strong>DDP · 기본 추천</strong><p>GPU마다 모델을 복사하고 데이터를 나눠 학습해요.</p></div><div><strong>FSDP · 메모리 절약</strong><p>큰 모델을 여러 GPU에 나눠 담아 학습해요.</p></div></section><section className="card flush"><div className="guided-table-head"><h2>내 학습</h2><span className="muted small">총 {store.pipelines.length}개 · 브라우저 안에서 진행되는 목업</span></div><div className="table-wrap"><table className="list"><thead><tr><th>학습 이름</th><th>방식</th><th>사용 GPU</th><th>상태</th><th /></tr></thead><tbody>{store.pipelines.map((p) => <tr key={p.id}><td><button className="link" onClick={() => setView(p.id)}>{p.displayName}</button></td><td><span className="strategy-tag">{jobSpec(p).distributedTraining.strategy.toUpperCase()}</span></td><td>{jobSpec(p).distributedTraining.worldSize}개</td><td><StateBadge state={p.state} /></td><td><button className="link small" onClick={() => setView(p.id)}>상세 보기 →</button></td></tr>)}</tbody></table></div></section></>}
  </main></>;
}
