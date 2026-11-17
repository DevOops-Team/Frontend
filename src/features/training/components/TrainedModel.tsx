import { useEffect, useState } from 'react';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Link } from '@astryxdesign/core/Link';
import { List, ListItem } from '@astryxdesign/core/List';
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList';
import { Skeleton } from '@astryxdesign/core/Skeleton';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Icon } from '@/shared/ui/Icon';
import { ApiError, errorMessage, getTrainedModel, modelFileUrl } from '../api';
import { formatBytes, formatDateTime } from '../lib/format';
import type { Job, TrainedModel } from '../types';

// 학습 완료 모델: 학습이 끝난(SUCCEEDED) 작업의 마지막 승인 체크포인트를 보여 주고 내려받게 한다.
// 상태 4가지: 학습 중(빈 상태) · 불러오는 중 · 오류(다시 시도) · 완료(파일별 내려받기, S3에서 직접).

type Loaded = { id: string; model: TrainedModel | null; error: string; missing: boolean };

function emptyText(job: Job): string {
  if (job.status === 'FAILED' || job.status === 'CANCELLED') return '학습이 끝까지 완료되지 않아 내려받을 모델이 없습니다.';
  return '학습이 끝나면 마지막 체크포인트를 여기서 내려받을 수 있습니다.';
}

export function TrainedModelPanel({ job }: { job: Job }) {
  const finished = job.status === 'SUCCEEDED';
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!finished) return undefined;
    let live = true;
    getTrainedModel(job.id)
      .then((model) => { if (live) setLoaded({ id: job.id, model, error: '', missing: false }); })
      .catch((e: unknown) => {
        if (!live) return;
        const missing = e instanceof ApiError && e.status === 404;
        setLoaded({ id: job.id, model: null, error: missing ? '' : errorMessage(e), missing });
      });
    return () => { live = false; };
  }, [job.id, finished, attempt]);

  const current = loaded?.id === job.id ? loaded : null;
  const model = finished ? current?.model ?? null : null;

  let body;
  if (!finished) {
    body = <Text color="secondary">{emptyText(job)}</Text>;
  } else if (!current) {
    body = <VStack gap={2} aria-hidden="true"><Skeleton height={20} width="40%" /><Skeleton height={16} /><Skeleton height={16} /></VStack>;
  } else if (current.missing) {
    body = <Text color="secondary">승인된 체크포인트가 없어 내려받을 모델이 없습니다.</Text>;
  } else if (current.error) {
    body = <VStack gap={3} hAlign="start">
      <Banner status="error" role="alert" title="모델 정보를 불러오지 못했습니다" description={current.error} />
      <Button label="다시 불러오기" variant="secondary" onClick={() => { setLoaded(null); setAttempt((n) => n + 1); }} />
    </VStack>;
  } else if (model) {
    body = <VStack gap={4}>
      <HStack gap={3} vAlign="end" wrap="wrap">
        <Text type="supporting">마지막 체크포인트</Text>
        <Text type="large" weight="semibold" hasTabularNumbers>{`step ${model.step.toLocaleString()}`}</Text>
        <Text type="supporting" hasTabularNumbers><time dateTime={model.approvedAt}>{formatDateTime(model.approvedAt)} 승인</time></Text>
      </HStack>
      <MetadataList columns={4}>
        <MetadataListItem label="크기">{formatBytes(model.sizeBytes)}</MetadataListItem>
        <MetadataListItem label="형식"><Text type="code">{model.format}</Text></MetadataListItem>
        <MetadataListItem label="저장 GPU">{model.worldSize}개</MetadataListItem>
        <MetadataListItem label="세대">{model.generation}</MetadataListItem>
      </MetadataList>
      <VStack gap={2}>
        <Heading level={3}>파일 {model.files.length}개</Heading>
        {model.files.length > 1 && <Text type="supporting">체크포인트는 모든 파일을 한 폴더에 받아야 불러올 수 있습니다.</Text>}
        <List density="compact" hasDividers aria-label="모델 파일">{model.files.map((f) => <ListItem key={f.name}
          label={<Text type="code" maxLines={1}><span title={`${f.name}\nsha256 ${f.sha256}`}>{f.name}</span></Text>}
          description={<Text type="supporting" hasTabularNumbers>{formatBytes(f.size)}</Text>}
          endContent={<Link href={modelFileUrl(job.id, f.name)} label={`${f.name} 내려받기`} download><HStack gap={1} vAlign="center"><Icon name="download" size={16} />내려받기</HStack></Link>} />)}
        </List>
      </VStack>
    </VStack>;
  }

  return <Card padding={5}>
    <VStack gap={4} aria-labelledby="run-model-title" aria-busy={finished && !current ? true : undefined} as="section">
      <Heading level={2} id="run-model-title">학습 완료 모델</Heading>
      {body}
    </VStack>
  </Card>;
}
