import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertDialog } from '@astryxdesign/core/AlertDialog';
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
import { Table, TableSelectionToolbar, pixel, proportional, useTableSelection, useTableSelectionState } from '@astryxdesign/core/Table';
import { Heading, Text } from '@astryxdesign/core/Text';
import { ToastViewport, useToast } from '@astryxdesign/core/Toast';
import { Theme } from '@astryxdesign/core/theme';
import { neutralTheme } from '@astryxdesign/theme-neutral/built';
import { useTheme } from '@/features/theme';
import { CreatePipeline, JOB_LIST_POLL_MS, RestartJobButton, RunPage, STATUS_LABEL, StopJobButton, UPLOAD_LABEL, UploadPage, UploadToasts, deleteJob, deleteJobs, errorMessage, isDeletable, isUploadActive, listJobs, runProgress, uiState, uploadStats, uploadUiState, useUploads, type Job, type PendingUpload } from '@/features/training';
import { formatBytes } from '@/features/training/lib/format';
import { Icon } from '@/shared/ui/Icon';
import { ChipIcon, DocIcon, GridIcon } from '@/shared/ui/navIcons';
import { StateBadge } from '@/shared/ui/StateBadge';

// 목록 한 줄 = 실제 학습 또는 아직 S3로 올리는 중인 학습 (GPU-195). 업로드는 Backend가 201을 줘야 job id가 생긴다.
type Row = { id: string; name: string; strategy: string; finetune?: string; gpus: number } & ({ kind: 'job'; job: Job } | { kind: 'upload'; upload: PendingUpload });

const UPLOAD_VIEW = 'upload:';
const uploadView = (key: string) => `${UPLOAD_VIEW}${key}`;

function UploadProgress({ upload }: { upload: PendingUpload }) {
  const { percent } = uploadStats(upload, upload.updatedAt);
  const variant = upload.state === 'failed' ? 'error' : upload.state === 'cancelled' ? 'neutral' : 'accent';
  return <HStack gap={3} vAlign="center">
    <StackItem size="fill"><ProgressBar label={`${upload.summary.name} S3 업로드 진행률`} isLabelHidden value={percent} variant={variant} /></StackItem>
    <Text type="supporting" hasTabularNumbers textWrap="nowrap">{formatBytes(upload.loaded)} / {formatBytes(upload.total)}</Text>
  </HStack>;
}

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

function Overview({ jobs, pending, listError, open, reload }: { jobs: Job[]; pending: PendingUpload[]; listError: string; open: (view: string) => void; reload: () => void }) {
  const count = (...statuses: Job['status'][]) => jobs.filter((j) => statuses.includes(j.status)).length;
  // 올리는 중인 학습을 맨 위에. 제출이 끝난(done) 업로드는 실제 학습 줄로 대신한다.
  const shown = useMemo(() => pending.filter((u) => u.state !== 'done'), [pending]);
  const rows: Row[] = useMemo(() => [
    ...shown.slice().reverse().map((u): Row => ({ kind: 'upload', id: uploadView(u.key), name: u.summary.name, strategy: u.summary.strategy, finetune: u.summary.finetune, gpus: u.summary.gpus, upload: u })),
    ...jobs.map((j): Row => ({ kind: 'job', id: j.id, name: j.name, strategy: j.strategy, finetune: j.finetune, gpus: j.gpus, job: j })),
  ], [shown, jobs]);
  const uploading = shown.filter((u) => isUploadActive(u.state)).length;

  // 선택 삭제 (GPU-196). 끝난 학습만 고를 수 있고, 진행 중인 학습은 체크박스가 꺼져 있다. 업로드 줄은 업로드 상세에서 취소 · 지운다.
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const toast = useToast();
  const selectable = (r: Row) => r.kind === 'job';
  const enabled = (r: Row) => r.kind === 'job' && isDeletable(r.job.status);
  const { selectionConfig, selectionState } = useTableSelectionState<Row>({
    data: rows, idKey: 'id', getIsItemSelectable: selectable, getIsItemEnabled: enabled, selectedKeys, setSelectedKeys,
  });
  const selection = useTableSelection<Row>({ ...selectionConfig, getIsItemSelectable: selectable, getIsItemEnabled: enabled, getRowLabel: (r) => `${r.name} 선택` });
  const plugins = useMemo(() => ({ selection }), [selection]);
  const targets = jobs.filter((j) => selectedKeys.has(j.id) && isDeletable(j.status));
  const nameOf = (id: string) => jobs.find((j) => j.id === id)?.name ?? id;

  async function removeSelected() {
    setDeleting(true);
    const result = await deleteJobs(targets.map((j) => j.id), deleteJob);
    setDeleting(false);
    setConfirming(false);
    setSelectedKeys((prev) => new Set([...prev].filter((k) => !result.deleted.includes(k))));
    // 삭제 결과는 왼쪽 아래 토스트로 (GPU-302). 성공은 저절로 사라지고, 실패는 직접 닫는다.
    if (result.failed.length === 0) toast({ body: `학습 ${result.deleted.length}개를 삭제했습니다. 최종 모델과 체크포인트, 올린 파일을 S3에서 모두 지웠습니다.` });
    else toast({
      type: 'error',
      body: `${result.failed.length}개를 삭제하지 못했습니다${result.deleted.length > 0 ? ` (${result.deleted.length}개는 삭제함)` : ''}: ${result.failed.map((f) => `${nameOf(f.id)}: ${f.message}`).join(' · ')}`,
    });
    reload();
  }
  const columns = useMemo(() => [
    { key: 'name', header: '학습 이름', width: proportional(2, { minWidth: 160 }), renderCell: (r: Row) => <Button label={r.name} variant="ghost" size="sm" onClick={() => open(r.id)} /> },
    { key: 'strategy', header: '방식', width: pixel(128), renderCell: (r: Row) => <Badge variant="neutral" label={r.finetune === 'qlora' ? `${r.strategy.toUpperCase()} · QLoRA` : r.strategy.toUpperCase()} /> },
    { key: 'gpus', header: '사용 GPU', width: pixel(96), renderCell: (r: Row) => <Text hasTabularNumbers>{r.gpus}개</Text> },
    { key: 'progress', header: '진행', width: proportional(2, { minWidth: 200 }), renderCell: (r: Row) => r.kind === 'upload' ? <UploadProgress upload={r.upload} /> : <RowProgress job={r.job} /> },
    { key: 'status', header: '상태', width: pixel(130), renderCell: (r: Row) => r.kind === 'upload' ? <StateBadge state={uploadUiState(r.upload.state)} label={UPLOAD_LABEL[r.upload.state]} /> : <StateBadge state={uiState(r.job.status)} label={STATUS_LABEL[r.job.status]} /> },
    { key: 'detail', header: '', width: pixel(220), align: 'end' as const, renderCell: (r: Row) => <HStack gap={2} hAlign="end">
      {r.kind === 'job' && <StopJobButton job={r.job} onStopped={reload} />}
      {r.kind === 'job' && <RestartJobButton job={r.job} onRestarted={reload} />}
      <Button label={r.kind === 'upload' ? '업로드 보기' : '상세 보기'} aria-label={`${r.name} ${r.kind === 'upload' ? '업로드' : '상세'} 보기`} variant="secondary" size="sm" onClick={() => open(r.id)} />
    </HStack> },
  ], [open, reload]);

  return <><Layout
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
          <Card padding={4}><VStack gap={2}><Text type="supporting">전체 학습</Text><Text type="display-2" hasTabularNumbers>{rows.length}</Text></VStack></Card>
          <Card padding={4}><VStack gap={2}><Text type="supporting">완료한 학습</Text><Text type="display-2" hasTabularNumbers>{count('SUCCEEDED')}</Text></VStack></Card>
          <Card padding={4}><VStack gap={2}><Text type="supporting">진행 중인 학습</Text><Text type="display-2" hasTabularNumbers>{count('QUEUED', 'ADMITTED', 'RUNNING', 'RECOVERING', 'STOPPING') + uploading}</Text></VStack></Card>
        </Grid>
        <VStack gap={3}>
          <HStack vAlign="center"><StackItem size="fill"><Heading level={2}>내 학습</Heading></StackItem><Text type="supporting" hasTabularNumbers>총 {rows.length}개{uploading > 0 ? ` · S3 업로드 중 ${uploading}개` : ''}</Text></HStack>
          {selectionState.hasSelection
            ? <TableSelectionToolbar selection={selectionState} label="선택한 학습" clearLabel="선택 해제" renderSelectionLabel={(n) => `${n}개 선택됨`}
              startContent={<Button label="선택 삭제" variant="destructive" size="sm" icon={<Icon name="cross" size={16} />} isDisabled={targets.length === 0} onClick={() => setConfirming(true)} />} />
            : <Text type="supporting">끝난 학습(성공 · 실패 · 중단됨)을 골라 삭제할 수 있습니다. 진행 중인 학습은 먼저 중단해야 합니다.</Text>}
          <Card padding={0}>
            <Table<Row> data={rows} columns={columns} idKey="id" density="balanced" hasHover plugins={plugins} />
          </Card>
        </VStack>
      </VStack>
    </LayoutContent>}
    />
    <AlertDialog
      isOpen={confirming}
      onOpenChange={(open) => { if (!deleting) setConfirming(open); }}
      title={`학습 ${targets.length}개를 영구 삭제할까요?`}
      description={`${targets.map((j) => j.name).join(', ')}의 학습 완료 모델과 모든 체크포인트, 올린 모델 · 데이터 · 학습 코드가 S3에서 모든 버전까지 지워집니다. 되돌릴 수 없습니다.`}
      cancelLabel="취소"
      actionLabel="영구 삭제"
      actionVariant="destructive"
      isActionLoading={deleting}
      onAction={() => { void removeSelected(); }}
    />
  </>;
}

export function App() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [listError, setListError] = useState('');
  const [view, setView] = useState('home');
  const { theme, setTheme } = useTheme();
  const pending = useUploads();
  // 업로드가 끝나 학습이 만들어지면 목록을 바로 다시 읽는다.
  const submitted = pending.filter((u) => u.state === 'done').length;
  const goHome = useCallback(() => setView('home'), []);
  const [refresh, setRefresh] = useState(0);
  const reload = useCallback(() => setRefresh((n) => n + 1), []);

  useEffect(() => {
    if (view !== 'home') return undefined;
    let live = true;
    const load = () => listJobs().then((items) => { if (live) { setJobs(items); setListError(''); } }).catch((e: unknown) => { if (live) setListError(errorMessage(e)); });
    void load();
    const timer = setInterval(() => { void load(); }, JOB_LIST_POLL_MS);
    return () => { live = false; clearInterval(timer); };
  }, [view, submitted, refresh]);

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
    {/* 학습 생성 · 삭제 · S3 업로드 알림은 왼쪽 아래 토스트로 (GPU-302) */}
    <ToastViewport position="bottomStart">
    <UploadToasts onOpenJob={setView} />
    <AppShell height="fill" sideNav={sideNav}>
      {view === 'create' ? <CreatePipeline onSubmitted={(key) => setView(uploadView(key))} onCancel={goHome} />
        : view.startsWith(UPLOAD_VIEW) ? <UploadPage key={view} uploadKey={view.slice(UPLOAD_VIEW.length)} onBack={goHome} onCreated={setView} />
          : view !== 'home' ? <RunPage key={view} id={view} onBack={goHome} />
            : <Overview jobs={jobs} pending={pending} listError={listError} open={setView} reload={reload} />}
    </AppShell>
    </ToastViewport>
  </Theme>;
}
