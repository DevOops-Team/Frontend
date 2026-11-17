import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '@astryxdesign/core/AppShell';
import { Badge } from '@astryxdesign/core/Badge';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Grid } from '@astryxdesign/core/Grid';
import { HStack, Layout, LayoutContent, LayoutHeader, StackItem, VStack } from '@astryxdesign/core/Layout';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { SideNav, SideNavItem, SideNavSection } from '@astryxdesign/core/SideNav';
import { Table, pixel, proportional } from '@astryxdesign/core/Table';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Theme } from '@astryxdesign/core/theme';
import { neutralTheme } from '@astryxdesign/theme-neutral/built';
import { useTheme } from '@/features/theme';
import { CreatePipeline, JOB_LIST_POLL_MS, RunPage, STATUS_LABEL, errorMessage, listJobs, runProgress, uiState, type Job } from '@/features/training';
import { Icon } from '@/shared/ui/Icon';
import { ChipIcon, DocIcon, GridIcon } from '@/shared/ui/navIcons';
import { StateBadge } from '@/shared/ui/StateBadge';

type JobRow = { [K in keyof Job]: Job[K] };

// 목록의 진행 칸: 실제 step / 전체 step과 그 비율. step이 아직 없으면 비워 둔다.
function RowProgress({ job }: { job: Job }) {
  const p = job.progress;
  if (!p || p.totalSteps <= 0) return <Text color="secondary">-</Text>;
  const { percent } = runProgress(job);
  const state = uiState(job.status);
  const variant = state === 'SUCCEEDED' ? 'success' : state === 'FAILED' ? 'error' : state === 'RUNNING' ? 'accent' : 'neutral';
  return <HStack gap={3} vAlign="center">
    <StackItem size="fill"><ProgressBar label={`${job.name} 진행률`} isLabelHidden value={percent} variant={variant} /></StackItem>
    <Text type="supporting" hasTabularNumbers textWrap="nowrap">{p.step.toLocaleString()} / {p.totalSteps.toLocaleString()}</Text>
  </HStack>;
}

function Overview({ jobs, listError, open }: { jobs: Job[]; listError: string; open: (view: string) => void }) {
  const count = (...statuses: Job['status'][]) => jobs.filter((j) => statuses.includes(j.status)).length;
  const columns = useMemo(() => [
    { key: 'name', header: '학습 이름', width: proportional(2, { minWidth: 160 }), renderCell: (j: JobRow) => <Button label={j.name} variant="ghost" size="sm" onClick={() => open(j.id)} /> },
    { key: 'strategy', header: '방식', width: pixel(96), renderCell: (j: JobRow) => <Badge variant="neutral" label={j.strategy.toUpperCase()} /> },
    { key: 'gpus', header: '사용 GPU', width: pixel(96), renderCell: (j: JobRow) => <Text hasTabularNumbers>{j.gpus}개</Text> },
    { key: 'progress', header: '진행', width: proportional(2, { minWidth: 200 }), renderCell: (j: JobRow) => <RowProgress job={j} /> },
    { key: 'status', header: '상태', width: pixel(120), renderCell: (j: JobRow) => <StateBadge state={uiState(j.status)} label={STATUS_LABEL[j.status]} /> },
    { key: 'detail', header: '', width: pixel(110), align: 'end' as const, renderCell: (j: JobRow) => <Button label="상세 보기" aria-label={`${j.name} 상세 보기`} variant="secondary" size="sm" onClick={() => open(j.id)} /> },
  ], [open]);

  return <Layout
    height="fill"
    contentWidth={1200}
    header={<LayoutHeader hasDivider>
      <HStack gap={4} vAlign="center" wrap="wrap">
        <StackItem size="fill">
          <VStack gap={1}>
            <Heading level={1}>다음 모델을 함께 만들어 볼까요?</Heading>
            <Text color="secondary">내 컴퓨터의 Hugging Face 모델과 학습 데이터를 올려 GPU 클러스터에서 학습합니다.</Text>
          </VStack>
        </StackItem>
        <Button label="새 학습 만들기" variant="primary" icon={<Icon name="add" size={18} />} onClick={() => open('create')} />
      </HStack>
    </LayoutHeader>}
    content={<LayoutContent>
      <VStack gap={6}>
        {listError && <Banner status="error" role="alert" title="학습 목록을 불러오지 못했습니다" description={listError} />}
        <Grid columns={{ minWidth: 200 }} gap={4}>
          <Card padding={4}><VStack gap={2}><Text type="supporting">전체 학습</Text><Text type="display-2" hasTabularNumbers>{jobs.length}</Text></VStack></Card>
          <Card padding={4}><VStack gap={2}><Text type="supporting">완료한 학습</Text><Text type="display-2" hasTabularNumbers>{count('SUCCEEDED')}</Text></VStack></Card>
          <Card padding={4}><VStack gap={2}><Text type="supporting">진행 중인 학습</Text><Text type="display-2" hasTabularNumbers>{count('QUEUED', 'ADMITTED', 'RUNNING', 'RECOVERING')}</Text></VStack></Card>
        </Grid>
        <VStack gap={3}>
          <HStack vAlign="center"><StackItem size="fill"><Heading level={2}>내 학습</Heading></StackItem><Text type="supporting" hasTabularNumbers>총 {jobs.length}개</Text></HStack>
          <Card padding={0}>
            <Table<JobRow> data={jobs} columns={columns} idKey="id" density="balanced" hasHover />
          </Card>
        </VStack>
      </VStack>
    </LayoutContent>}
  />;
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

  const sideNav = <SideNav
    aria-label="주 메뉴"
    header={<HStack paddingInline={2}><Button label="DevOops" variant="ghost" icon={<Icon name="layers" size={22} />} onClick={() => setView('home')}><Text type="large" weight="semibold">DevOops</Text></Button></HStack>}
    footer={<VStack gap={3} paddingInline={2}>
      <SegmentedControl label="화면 모드" value={theme} onChange={(v) => setTheme(v === 'dark' ? 'dark' : 'light')} size="sm" layout="fill">
        <SegmentedControlItem value="light" label="화이트" />
        <SegmentedControlItem value="dark" label="다크" />
      </SegmentedControl>
      <VStack gap={0}><Text weight="medium">DevOops 프로젝트</Text><Text type="supporting">GPU Failover</Text></VStack>
    </VStack>}>
    <SideNavSection title="워크스페이스">
      <SideNavItem label="개요" icon={GridIcon} isSelected={view === 'home'} onClick={() => setView('home')} />
      <SideNavItem label="학습 실행" icon={ChipIcon} isSelected={view !== 'home'} onClick={() => setView('create')} />
      <SideNavItem label="API 문서" icon={DocIcon} href="/swagger/" {...{ target: '_blank', rel: 'noreferrer' }} />
    </SideNavSection>
  </SideNav>;

  return <Theme theme={neutralTheme} mode={theme}>
    <AppShell height="fill" sideNav={sideNav}>
      {view === 'create' ? <CreatePipeline onCreated={setView} onCancel={() => setView('home')} />
        : view !== 'home' ? <RunPage key={view} id={view} onBack={() => setView('home')} />
          : <Overview jobs={jobs} listError={listError} open={setView} />}
    </AppShell>
  </Theme>;
}
