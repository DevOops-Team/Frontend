import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Badge } from '@astryxdesign/core/Badge';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { useMediaQuery } from '@astryxdesign/core/hooks';
import { HStack, Layout, LayoutContent, LayoutHeader, LayoutPanel, StackItem, VStack } from '@astryxdesign/core/Layout';
import { List, ListItem } from '@astryxdesign/core/List';
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import { Spinner } from '@astryxdesign/core/Spinner';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { Step, Stepper } from '@astryxdesign/core/Stepper';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Icon } from '@/shared/ui/Icon';
import { StateBadge } from '@/shared/ui/StateBadge';
import { JOB_DETAIL_POLL_MS, errorMessage, getJob, isTerminal, jobEvents, jobFile, jobFiles } from '../api';
import { formatClock, formatDateTime } from '../lib/format';
import { formatDuration } from '../lib/upload';
import { STATUS_LABEL, runProgress, stepsPerEpoch, uiState } from '../lib/progress';
import type { Job, JobEvent, JobFile } from '../types';
import { FileList } from './FileList';
import { RestartJobButton } from './RestartJob';
import { StopJobButton } from './StopJob';
import { TrainedModelPanel } from './TrainedModel';

// 쿼터 대기 이벤트. 정상 동작 중에도 길게 나와 화면에서는 뺀다. 원본은 /api/jobs/{id}/events에 남는다.
const HIDDEN_EVENTS = new Set(['WaitingForQuota', 'ExceedsMaxQuota']);

export function RunOverview({ job, events, files, onBack, onChanged }: { job: Job; events: JobEvent[]; files: JobFile[]; onBack: () => void; onChanged?: () => void }) {
  const progress = runProgress(job);
  const state = uiState(job.status);
  const ordered = events.filter((e) => !HIDDEN_EVENTS.has(e.reason)).sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
  const p = job.progress;
  // Kueue 원문은 대기 중에도 계속 바뀌므로 실패 이유만 그대로 보여 준다.
  const failure = job.status === 'FAILED' ? job.statusMessage : undefined;
  const caption = failure ?? (progress.complete ? '학습과 결과 저장을 마쳤습니다.' : `${progress.stages[progress.active].label} 단계 · 상태가 자동으로 업데이트됩니다.`);
  const cfg = job.config;
  const [settingsOpen, setSettingsOpen] = useState(false);

  // 실행 기록은 카드 안에서 스크롤된다. 맨 아래를 보고 있으면 새 기록이 올 때 따라 내려가고,
  // 위로 올려 읽는 중이면 그 자리를 지킨다.
  const timeline = useRef<HTMLElement>(null);
  const following = useRef(true);
  function onTimelineScroll() {
    const el = timeline.current;
    if (el) following.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
  }
  useLayoutEffect(() => {
    const el = timeline.current;
    if (el && following.current) el.scrollTop = el.scrollHeight;
  }, [ordered.length]);

  const isWide = useMediaQuery('(min-width: 1100px)');
  const stageStatus = (st: string) => st === 'done' ? 'success' as const : st === 'error' ? 'error' as const : st === 'active' ? 'accent' as const : undefined;

  const history = <VStack gap={3} height="100%">
    <HStack vAlign="center"><StackItem size="fill"><Heading level={2}>실행 기록</Heading></StackItem>
      {isTerminal(job.status) ? <Badge variant="neutral" label="기록 종료" /> : <StatusDot variant="success" label="실시간 업데이트" isPulsing />}</HStack>
    {ordered.length === 0 && <Text color="secondary">아직 기록이 없습니다.</Text>}
    <StackItem size="fill" isScrollable ref={timeline} onScroll={onTimelineScroll} tabIndex={0} aria-label="실행 기록">
      <List density="compact" hasDividers>{ordered.map((e) => <ListItem key={e.key} align="start"
        startContent={<Text type="code" color="secondary" hasTabularNumbers><time dateTime={e.time} title={formatDateTime(e.time)}>{formatClock(e.time)}</time></Text>}
        label={<HStack gap={2} vAlign="center"><Text weight="semibold" color={e.type === 'Warning' ? 'accent' : 'primary'}>{e.reason}</Text><Badge variant={e.type === 'Warning' ? 'error' : 'neutral'} label={e.cluster} /></HStack>}
        description={e.message} />)}</List>
    </StackItem>
    <Text type="supporting">총 {ordered.length}개 기록, 시간순</Text>
  </VStack>;

  return <>
    <Layout
      height="fill"
      header={<LayoutHeader hasDivider>
        <HStack gap={4} vAlign="end" wrap="wrap">
          <StackItem size="fill">
            <VStack gap={1}>
              <HStack><Button label="학습 목록" variant="ghost" size="sm" icon={<Icon name="back" size={16} />} onClick={onBack} /></HStack>
              <Heading level={1} maxLines={1}><span title={job.name}>{job.name}</span></Heading>
            </VStack>
          </StackItem>
          <HStack gap={2} vAlign="center"><Badge variant="neutral" label={job.strategy.toUpperCase()} /><Badge variant="neutral" label={`GPU ${job.gpus}개`} /><StateBadge state={state} label={STATUS_LABEL[job.status]} />
            <StopJobButton job={job} size="md" onStopped={() => onChanged?.()} />
            <RestartJobButton job={job} size="md" onRestarted={() => onChanged?.()} /></HStack>
        </HStack>
      </LayoutHeader>}
      content={<LayoutContent>
        <VStack gap={5}>
          <Card padding={5}>
            <VStack gap={4} as="section" aria-labelledby="run-progress-title">
              <HStack gap={4} vAlign="end">
                <StackItem size="fill"><Heading level={2} id="run-progress-title">{progress.headline}</Heading></StackItem>
                <VStack gap={0} hAlign="end"><Text type="display-2" hasTabularNumbers>{progress.percent}%</Text><Text type="supporting">전체 진행률</Text></VStack>
              </HStack>
              <ProgressBar label="전체 학습 진행률" isLabelHidden value={progress.percent} formatValueLabel={(percent) => `${percent}%, ${progress.headline}`} variant={state === 'SUCCEEDED' ? 'success' : state === 'FAILED' ? 'error' : state === 'CANCELLED' || state === 'PENDING' ? 'neutral' : 'accent'} />
              <Stepper activeStep={progress.active} label="실행 단계" density="compact">
                {progress.stages.map((st, i) => <Step key={st.label} step={i} label={st.label} status={stageStatus(st.state)} description={st.state === 'done' ? '완료' : st.state === 'active' ? (job.status === 'QUEUED' ? '대기 중' : '진행 중') : st.state === 'error' ? '실패' : '대기'} />)}
              </Stepper>
              <Text color="secondary">{caption}</Text>
              <MetadataList columns={5}>
                <MetadataListItem label="Step"><Text hasTabularNumbers>{p && p.totalSteps > 0 ? `${p.step} / ${p.totalSteps}` : '-'}</Text></MetadataListItem>
                <MetadataListItem label="Loss"><Text hasTabularNumbers>{p && p.step > 0 ? p.loss.toFixed(4) : '-'}</Text></MetadataListItem>
                <MetadataListItem label="마지막 체크포인트"><Text hasTabularNumbers>{p && p.lastCheckpointStep > 0 ? p.lastCheckpointStep : '-'}</Text></MetadataListItem>
                <MetadataListItem label="클러스터"><Text type="code">{job.cluster ?? '-'}</Text></MetadataListItem>
                <MetadataListItem label="rank 0 노드"><Text type="code">{p?.nodeName ?? '-'}</Text></MetadataListItem>
              </MetadataList>
            </VStack>
          </Card>
          <TrainedModelPanel job={job} />
          <Card padding={5}>
            <VStack gap={3} as="section" aria-labelledby="run-inputs-title">
              <HStack vAlign="center"><StackItem size="fill"><Heading level={2} id="run-inputs-title">학습 설정</Heading></StackItem><Button label="상세 보기" variant="secondary" aria-haspopup="dialog" onClick={() => setSettingsOpen(true)} /></HStack>
              <Heading level={3}>작업 파일</Heading>
              <FileList label="작업 파일" preview="modal" files={files} load={(name) => jobFile(job.id, files.find((f) => f.name === name)?.kind ?? 'code', name)} />
            </VStack>
          </Card>
          {!isWide && <Card padding={5} height={480}>{history}</Card>}
        </VStack>
      </LayoutContent>}
      end={isWide ? <LayoutPanel hasDivider width={400} label="실행 기록" isScrollable={false}>{history}</LayoutPanel> : undefined}
    />
    <Dialog purpose="info" isOpen={settingsOpen} onOpenChange={setSettingsOpen} width={640}>
      <Layout
        header={<DialogHeader title="학습 설정" subtitle="실제로 쓰인 값" onOpenChange={setSettingsOpen} />}
        content={<LayoutContent padding={4}>
          <MetadataList>
            <MetadataListItem label="학습 모델"><Text type="code"><span title={job.model}>{job.model}</span></Text></MetadataListItem>
            <MetadataListItem label="업로드 위치"><Text type="code"><span title={cfg?.dataset.uri}>{cfg?.dataset.uri ?? '-'}</span></Text></MetadataListItem>
            <MetadataListItem label="학습 방식">{job.strategy.toUpperCase()}</MetadataListItem>
            <MetadataListItem label="사용 GPU">{job.gpus}개</MetadataListItem>
            <MetadataListItem label="큐"><Text type="code">{job.queue}</Text></MetadataListItem>
            {cfg ? <MetadataListItem label="batch_size_per_gpu">{cfg.batch_size_per_gpu}</MetadataListItem> : null}
            {cfg ? <MetadataListItem label="steps_per_epoch">{stepsPerEpoch(job) ?? '-'}</MetadataListItem> : null}
            {cfg ? <MetadataListItem label="epochs">{cfg.epochs}</MetadataListItem> : null}
            {cfg ? <MetadataListItem label="total_steps">{p && p.totalSteps > 0 ? p.totalSteps : '-'}</MetadataListItem> : null}
            {cfg ? <MetadataListItem label="learning_rate">{cfg.learning_rate}</MetadataListItem> : null}
            {cfg ? <MetadataListItem label="체크포인트 간격"><span title={`τ = √(2 · ${cfg.checkpoint_policy.estimated_save_seconds}s · ${cfg.checkpoint_policy.mtbf_seconds}s)`}>{formatDuration(cfg.checkpoint_policy.interval_seconds)}마다</span></MetadataListItem> : null}
            {cfg ? <MetadataListItem label="체크포인트 형식"><Text type="code">{cfg.checkpoint_format}</Text></MetadataListItem> : null}
            <MetadataListItem label="JobSet"><Text type="code"><span title={job.jobsetName}>{job.jobsetName}</span></Text></MetadataListItem>
          </MetadataList>
        </LayoutContent>}
      />
    </Dialog>
  </>;
}

// 작업 하나를 3초마다 다시 읽는다. 끝난 작업은 더 읽지 않는다 (서비스 API 명세 §1).
export function RunPage({ id, onBack }: { id: string; onBack: () => void }) {
  const [job, setJob] = useState<Job | null>(null);
  const [events, setEvents] = useState<JobEvent[]>([]);
  const [files, setFiles] = useState<JobFile[]>([]);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0); // 중단 · 다시 시작 직후 바로 다시 읽는다

  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function poll() {
      let finished = false;
      try {
        const [j, ev, fs] = await Promise.all([getJob(id), jobEvents(id), jobFiles(id)]);
        if (!live) return;
        setJob(j);
        setEvents(ev);
        setFiles(fs);
        setError('');
        finished = isTerminal(j.status);
      } catch (e) {
        if (!live) return;
        setError(errorMessage(e));
      }
      if (!finished) timer = setTimeout(() => { void poll(); }, JOB_DETAIL_POLL_MS);
    }
    void poll();
    return () => { live = false; clearTimeout(timer); };
  }, [id, refresh]);

  if (!job) return <Layout height="fill" content={<LayoutContent>
    <VStack gap={3} hAlign="start">
      {error ? <Banner status="error" role="alert" title="작업 정보를 불러오지 못했습니다" description={error} /> : <HStack gap={2} vAlign="center"><Spinner size="sm" /><Text color="secondary">작업 정보를 불러오는 중입니다.</Text></HStack>}
      {error && <Button label="학습 목록" variant="ghost" icon={<Icon name="back" size={16} />} onClick={onBack} />}
    </VStack>
  </LayoutContent>} />;
  return <>
    {error && <Banner status="error" role="alert" title="최신 상태를 불러오지 못했습니다" description={error} />}
    <RunOverview job={job} events={events} files={files} onBack={onBack} onChanged={() => setRefresh((n) => n + 1)} />
  </>;
}
