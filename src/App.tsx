import { useEffect, useState } from 'react';
import { useTheme } from '@/features/theme';
import { CreatePipeline, JOB_LIST_POLL_MS, RunPage, STATUS_LABEL, errorMessage, listJobs, runProgress, uiState, type Job } from '@/features/training';
import { Icon } from '@/shared/ui/Icon';
import { StateBadge } from '@/shared/ui/StateBadge';

// 목록의 진행 칸: 실제 step / 전체 step과 그 비율. step이 아직 없으면 비워 둔다.
function RowProgress({ job }: { job: Job }) {
  const p = job.progress;
  if (!p || p.totalSteps <= 0) return <span className="muted">-</span>;
  const { percent } = runProgress(job);
  return <span className="row-progress" data-state={uiState(job.status)}>
    <span className="meter" aria-hidden="true"><span style={{ transform: `scaleX(${percent / 100})` }} /></span>
    <span className="num">{p.step.toLocaleString()} / {p.totalSteps.toLocaleString()}</span>
  </span>;
}

export function App() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [listError, setListError] = useState('');
  const [view, setView] = useState('home');
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    if (view !== 'home') return undefined;
    let live = true;
    const load = () => listJobs().then((items) => { if (live) { setJobs(items); setListError(''); } }).catch((e: unknown) => { if (live) setListError(errorMessage(e)); });
    void load();
    const timer = setInterval(() => { void load(); }, JOB_LIST_POLL_MS);
    return () => { live = false; clearInterval(timer); };
  }, [view]);

  const count = (...statuses: Job['status'][]) => jobs.filter((j) => statuses.includes(j.status)).length;

  return <div className="app">
    <aside className="app-nav">
      <button type="button" className="brand" onClick={() => setView('home')}><span className="brand-mark"><Icon name="layers" size={20} /></span>DevOops</button>
      <nav aria-label="주 메뉴">
        <span className="nav-caption">워크스페이스</span>
        <button type="button" className="nav-item" aria-current={view === 'home' ? 'page' : undefined} onClick={() => setView('home')}><Icon name="grid" size={18} />개요</button>
        <button type="button" className="nav-item" aria-current={view !== 'home' ? 'page' : undefined} onClick={() => setView('create')}><Icon name="chip" size={18} />학습 실행</button>
        <a className="nav-item" href="/swagger/" target="_blank" rel="noreferrer"><Icon name="doc" size={18} />API 문서</a>
      </nav>
      <div className="nav-bottom"><span className="workspace-avatar">D</span><div><strong>DevOops 프로젝트</strong><span>GPU Failover</span></div></div>
    </aside>
    <div className="app-main">
      <header className="topbar">
        <div className="crumbs"><span>워크스페이스</span><span className="crumb-divider" aria-hidden="true">/</span><strong>{view === 'home' ? '개요' : view === 'create' ? '새 학습' : '실행 상세'}</strong></div>
        <div className="mode-tray" role="group" aria-label="화면 모드">
          <button type="button" aria-label="화이트 모드" aria-pressed={theme === 'light'} onClick={() => setTheme('light')}><Icon name="sun" size={16} /><span>화이트</span></button>
          <button type="button" aria-label="다크 모드" aria-pressed={theme === 'dark'} onClick={() => setTheme('dark')}><Icon name="moon" size={16} /><span>다크</span></button>
        </div>
      </header>
      <main className={`page${view === 'create' ? ' page-create' : view === 'home' ? ' page-home' : ' page-detail'}`}>
        {view === 'create' ? <CreatePipeline onCreated={setView} onCancel={() => setView('home')} /> : view !== 'home' ? <RunPage key={view} id={view} onBack={() => setView('home')} /> : <>
          <header className="home-head">
            <div>
              <h1>다음 모델을 함께 만들어 볼까요?</h1>
              <p className="lead muted">내 컴퓨터의 Hugging Face 모델과 학습 데이터를 올려 GPU 클러스터에서 학습합니다.</p>
            </div>
            <button type="button" className="key key--primary" onClick={() => setView('create')}><Icon name="add" size={18} />새 학습 만들기</button>
          </header>
          {listError && <p role="alert" className="issues">{listError}</p>}
          <dl className="stat-row">
            <div><dt>전체 학습</dt><dd className="num">{jobs.length}<small>개</small></dd></div>
            <div><dt>완료한 학습</dt><dd className="num">{count('SUCCEEDED')}<small>개</small></dd></div>
            <div><dt>진행 중인 학습</dt><dd className="num">{count('QUEUED', 'ADMITTED', 'RUNNING', 'RECOVERING')}<small>개</small></dd></div>
          </dl>
          <dl className="intro-row">
            <div><dt><code>FSDP</code> <span className="tag">메모리 절약</span></dt><dd>모델을 여러 GPU에 나눠 담아 학습해요.</dd></div>
            <div><dt>파일 업로드 <span className="tag">S3</span></dt><dd>모델 폴더와 jsonl 데이터를 올리면 체크포인트 간격을 계산해 학습합니다.</dd></div>
          </dl>
          <section className="ledger" aria-labelledby="ledger-title">
            <div className="ledger-head"><h2 id="ledger-title">내 학습</h2><span className="muted">총 {jobs.length}개</span></div>
            <div className="table-wrap">
              <table className="list">
                <thead><tr><th>학습 이름</th><th>방식</th><th>사용 GPU</th><th>진행</th><th>상태</th><th><span className="visually-hidden">상세</span></th></tr></thead>
                <tbody>
                  {jobs.map((j) => <tr key={j.id}>
                    <td><button type="button" className="link" onClick={() => setView(j.id)}>{j.name}</button></td>
                    <td><code>{j.strategy.toUpperCase()}</code></td>
                    <td className="num">{j.gpus}개</td>
                    <td><RowProgress job={j} /></td>
                    <td><StateBadge state={uiState(j.status)} label={STATUS_LABEL[j.status]} /></td>
                    <td className="cell-action"><button type="button" className="link" aria-label={`${j.name} 상세 보기`} onClick={() => setView(j.id)}>상세 보기</button></td>
                  </tr>)}
                </tbody>
              </table>
            </div>
          </section>
        </>}
      </main>
    </div>
  </div>;
}
