import { useEffect, useState } from 'react';
import { AlertDialog } from '@astryxdesign/core/AlertDialog';
import { Badge } from '@astryxdesign/core/Badge';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { HStack, Layout, LayoutContent, LayoutHeader, StackItem, VStack } from '@astryxdesign/core/Layout';
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Icon } from '@/shared/ui/Icon';
import { StateBadge } from '@/shared/ui/StateBadge';
import { formatBytes } from '../lib/format';
import { formatDuration } from '../lib/upload';
import { UPLOAD_LABEL, isActive, uploadStats, uploadUiState, type PendingUpload, type UploadState } from '../lib/uploadQueue';
import { uploads, useUploads } from '../uploads';

const HEADLINE: Record<UploadState, string> = {
  uploading: '모델과 데이터를 S3로 올리고 있어요',
  submitting: 'S3 저장을 마무리하고 학습을 제출하고 있어요',
  done: '업로드를 마치고 학습을 제출했어요',
  failed: '업로드하지 못했어요',
  cancelled: '업로드를 취소했어요',
};

// 보내는 동안 속도 · 남은 시간이 멈춰 보이지 않게 1초마다 다시 그린다.
function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

function UploadOverview({ upload, onBack }: { upload: PendingUpload; onBack: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const active = isActive(upload.state);
  const now = useNow(active);
  const stats = uploadStats(upload, active ? Math.max(now, upload.updatedAt) : upload.updatedAt);
  const s = upload.summary;
  const variant = upload.state === 'failed' ? 'error' : upload.state === 'cancelled' ? 'neutral' : 'accent';

  return <>
    <Layout
      height="fill"
      contentWidth={960}
      header={<LayoutHeader hasDivider>
        <HStack gap={4} vAlign="end" wrap="wrap">
          <StackItem size="fill">
            <VStack gap={1}>
              <HStack><Button label="학습 목록" variant="ghost" size="sm" icon={<Icon name="back" size={16} />} onClick={onBack} /></HStack>
              <Heading level={1} maxLines={1}><span title={s.name}>{s.name}</span></Heading>
            </VStack>
          </StackItem>
          <HStack gap={2} vAlign="center"><Badge variant="neutral" label={s.strategy.toUpperCase()} />{s.finetune === 'qlora' && <Badge variant="neutral" label="QLoRA" />}<Badge variant="neutral" label={`GPU ${s.gpus}개`} /><StateBadge state={uploadUiState(upload.state)} label={UPLOAD_LABEL[upload.state]} /></HStack>
        </HStack>
      </LayoutHeader>}
      content={<LayoutContent>
        <VStack gap={5}>
          {upload.state === 'failed' && <Banner status="error" role="alert" title="업로드하지 못했습니다" description={upload.error ?? ''} />}
          <Card padding={5}>
            <VStack gap={4} as="section" aria-labelledby="upload-progress-title">
              <HStack gap={4} vAlign="end">
                <StackItem size="fill"><Heading level={2} id="upload-progress-title">{HEADLINE[upload.state]}</Heading></StackItem>
                <VStack gap={0} hAlign="end"><Text type="display-2" hasTabularNumbers>{stats.percent}%</Text><Text type="supporting">S3 전달</Text></VStack>
              </HStack>
              <ProgressBar label="S3 업로드 진행률" isLabelHidden value={stats.percent} variant={variant} formatValueLabel={(p) => `${p}%, ${UPLOAD_LABEL[upload.state]}`} />
              <HStack gap={2} vAlign="center">
                {active ? <StatusDot variant="success" label="전송 중" isPulsing /> : null}
                <Text color="secondary">
                  {upload.state === 'uploading' ? '다른 화면으로 가도 업로드는 계속됩니다. 이 탭을 닫거나 새로 고치면 업로드가 끊깁니다.'
                    : upload.state === 'submitting' ? '파일은 모두 보냈습니다. 학습이 만들어지면 실행 상세로 넘어갑니다.'
                      : upload.state === 'cancelled' ? '업로드를 멈췄습니다. 학습은 만들어지지 않았습니다.'
                        : upload.state === 'failed' ? '학습은 만들어지지 않았습니다. 같은 파일로 다시 시도할 수 있습니다.' : ''}
                </Text>
              </HStack>
              <MetadataList columns={4}>
                <MetadataListItem label="보낸 양"><Text hasTabularNumbers>{formatBytes(upload.loaded)} / {formatBytes(upload.total)}</Text></MetadataListItem>
                <MetadataListItem label="속도"><Text hasTabularNumbers>{active && stats.bytesPerSecond ? `${formatBytes(stats.bytesPerSecond)}/s` : '-'}</Text></MetadataListItem>
                <MetadataListItem label="남은 시간"><Text hasTabularNumbers>{upload.state === 'uploading' && stats.remainingSeconds !== null ? `약 ${formatDuration(stats.remainingSeconds)}` : '-'}</Text></MetadataListItem>
                <MetadataListItem label="걸린 시간"><Text hasTabularNumbers>{formatDuration(stats.elapsedSeconds)}</Text></MetadataListItem>
              </MetadataList>
              <HStack gap={2} wrap="wrap">
                {active && <Button label="업로드 취소" variant="destructive" isDisabled={upload.state !== 'uploading'} onClick={() => setConfirming(true)} />}
                {(upload.state === 'failed' || upload.state === 'cancelled') && <>
                  <Button label="다시 시도" variant="primary" onClick={() => uploads.retry(upload.key)} />
                  <Button label="목록에서 지우기" variant="secondary" onClick={() => { uploads.dismiss(upload.key); onBack(); }} />
                </>}
              </HStack>
            </VStack>
          </Card>
          <Card padding={5}>
            <VStack gap={3} as="section" aria-labelledby="upload-files-title">
              <Heading level={2} id="upload-files-title">올리는 파일</Heading>
              <MetadataList>
                <MetadataListItem label="모델">{s.model.folder} · 파일 {s.model.count}개 · {formatBytes(s.model.bytes)}</MetadataListItem>
                <MetadataListItem label="학습 데이터">파일 {s.data.count}개 · {formatBytes(s.data.bytes)}</MetadataListItem>
                <MetadataListItem label="학습 코드"><Text type="code">{s.train.name}</Text> · {formatBytes(s.train.bytes)}</MetadataListItem>
                <MetadataListItem label="저장 위치"><Text type="code">S3 datasets/&lt;학습 id&gt;/v1/</Text></MetadataListItem>
              </MetadataList>
              <Text type="supporting">학습 id는 업로드가 끝나고 Backend가 학습을 만들 때 정해집니다.</Text>
            </VStack>
          </Card>
        </VStack>
      </LayoutContent>}
    />
    <AlertDialog
      isOpen={confirming}
      onOpenChange={setConfirming}
      title="업로드를 취소할까요?"
      description={`${s.name}의 S3 업로드를 멈춥니다. 학습은 만들어지지 않고, 다시 시도하면 처음부터 올립니다.`}
      cancelLabel="계속 올리기"
      actionLabel="업로드 취소"
      actionVariant="destructive"
      onAction={() => { uploads.cancel(upload.key); setConfirming(false); }}
    />
  </>;
}

// 업로드 상세. 업로드가 끝나 학습이 만들어지면 그 학습의 실행 상세로 넘어간다.
export function UploadPage({ uploadKey, onBack, onCreated }: { uploadKey: string; onBack: () => void; onCreated: (jobId: string) => void }) {
  const upload = useUploads().find((u) => u.key === uploadKey);
  const jobId = upload?.state === 'done' ? upload.jobId : undefined;

  useEffect(() => {
    if (jobId) onCreated(jobId);
  }, [jobId, onCreated]);

  if (!upload) return <Layout height="fill" content={<LayoutContent>
    <VStack gap={3} hAlign="start">
      <Banner status="info" title="업로드를 찾을 수 없습니다" description="목록에서 지웠거나 새로 고침으로 끊긴 업로드입니다." />
      <Button label="학습 목록" variant="ghost" icon={<Icon name="back" size={16} />} onClick={onBack} />
    </VStack>
  </LayoutContent>} />;
  return <UploadOverview upload={upload} onBack={onBack} />;
}
