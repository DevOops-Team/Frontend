import { useEffect, useState } from 'react';
import { useTheme } from '@/features/theme';
import { CreatePipeline, JOB_LIST_POLL_MS, RunPage, STATUS_LABEL, errorMessage, listJobs, uiState, type Job } from '@/features/training';
import { Icon } from '@/shared/ui/Icon';
import { StateBadge } from '@/shared/ui/StateBadge';

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

  return <div className="material-app"><aside className="material-nav"><button className="brand" onClick={() => setView('home')}><span className="brand-mark"><Icon name="layers" size={23} /></span>DevOops<span className="brand-sub">WORKSPACE</span></button><nav aria-label="주 메뉴"><span className="nav-caption">워크스페이스</span><button className="nav-item" aria-current={view === 'home' ? 'page' : undefined} onClick={() => setView('home')}><Icon name="grid" />개요</button><button className="nav-item" aria-current={view !== 'home' ? 'page' : undefined} onClick={() => setView('create')}><Icon name="chip" />학습 실행</button><a className="nav-item" href="/swagger/" target="_blank" rel="noreferrer"><Icon name="layers" />API 문서</a></nav><div className="nav-bottom"><span className="workspace-avatar">D</span><div><strong>DevOops 프로젝트</strong><span>GPU Failover</span></div></div></aside><div className="material-main"><header className="topnav"><div className="topnav-inner"><div className="workspace-location"><Icon name="layers" size={18} /><span>워크스페이스</span><span className="location-divider">/</span><strong>{view === 'home' ? '개요' : view === 'create' ? '새 학습' : '실행 상세'}</strong></div><div className="header-tools"><div className="theme-control" role="group" aria-label="화면 모드"><button type="button" aria-label="화이트 모드" aria-pressed={theme === 'light'} onClick={() => setTheme('light')}><Icon name="sun" size={17} /><span>화이트</span></button><button type="button" aria-label="다크 모드" aria-pressed={theme === 'dark'} onClick={() => setTheme('dark')}><Icon name="moon" size={17} /><span>다크</span></button></div></div></div></header><main className={`page${view === 'create' ? ' page-create' : view === 'home' ? ' page-home' : ' page-detail'}`}>
    {view === 'create' ? <CreatePipeline onCreated={setView} onCancel={() => setView('home')} /> : view !== 'home' ? <RunPage key={view} id={view} onBack={() => setView('home')} /> : <><header className="guided-home-head"><div className="hero"><span className="eyebrow">MODEL DEVELOPMENT</span><h1>다음 모델을<br />함께 만들어 볼까요?</h1><p className="muted">내 컴퓨터의 Hugging Face 모델과 학습 데이터를 올려 GPU 클러스터에서 학습합니다.</p></div><div className="home-hero-action"><span className="hero-orbit" aria-hidden="true"><Icon name="chip" size={42} /><i /><i /></span><button className="btn primary" onClick={() => setView('create')}><Icon name="add" size={18} />새 학습 만들기</button></div></header>{listError && <p role="alert" className="issues">{listError}</p>}<section className="material-stats"><div><span className="stat-icon blue"><Icon name="layers" /></span><span>전체 학습<strong>{jobs.length}<small>개</small></strong></span></div><div><span className="stat-icon green"><Icon name="check" /></span><span>완료한 학습<strong>{count('SUCCEEDED')}<small>개</small></strong></span></div><div><span className="stat-icon amber"><Icon name="chip" /></span><span>진행 중인 학습<strong>{count('QUEUED', 'ADMITTED', 'RUNNING')}<small>개</small></strong></span></div></section><section className="guided-intro"><div><span className="intro-icon"><Icon name="chip" /></span><strong>FSDP <span className="strategy-tag">메모리 절약</span></strong><p>모델을 여러 GPU에 나눠 담아 학습해요.</p></div><div><span className="intro-icon"><Icon name="layers" /></span><strong>파일 업로드 <span className="strategy-tag">S3</span></strong><p>모델 폴더와 jsonl 데이터를 올리면 체크포인트 간격을 계산해 학습합니다.</p></div></section><section className="card flush"><div className="guided-table-head"><h2>내 학습</h2><span className="muted small">총 {jobs.length}개</span></div><div className="table-wrap"><table className="list"><thead><tr><th>학습 이름</th><th>방식</th><th>사용 GPU</th><th>상태</th><th /></tr></thead><tbody>{jobs.map((j) => <tr key={j.id}><td><button className="link" onClick={() => setView(j.id)}>{j.name}</button></td><td><span className="strategy-tag">{j.strategy.toUpperCase()}</span></td><td>{j.gpus}개</td><td><StateBadge state={uiState(j.status)} label={STATUS_LABEL[j.status]} /></td><td><button className="link small" aria-label={`${j.name} 상세 보기`} onClick={() => setView(j.id)}>상세 보기 →</button></td></tr>)}</tbody></table></div></section></>}
  </main></div></div>;
}
