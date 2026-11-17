import { useState } from 'react';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { CodeBlock } from '@astryxdesign/core/CodeBlock';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { HStack, Layout, LayoutContent, VStack } from '@astryxdesign/core/Layout';
import { List, ListItem } from '@astryxdesign/core/List';
import { Spinner } from '@astryxdesign/core/Spinner';
import { Text } from '@astryxdesign/core/Text';
import { errorMessage } from '../api';
import { formatBytes } from '../lib/format';
import type { FilePreview } from '../types';

// S3에 있는 파일 목록과 텍스트 파일 미리보기. 가중치 같은 바이너리는 크기만 보여 준다.

const TEXT_FILE = /\.(json|jsonl|txt|py|csv|yaml|yml)$/i;
const LANGUAGE: Record<string, string> = { py: 'python', json: 'json', jsonl: 'json', yaml: 'yaml', yml: 'yaml' };

type PreviewMode = 'inline' | 'modal';

function PreviewBody({ name, preview, error, loading }: { name: string; preview: FilePreview | null; error: string; loading: boolean }) {
  return <VStack gap={3}>
    {error && <Banner status="error" role="alert" title="미리보기를 불러오지 못했습니다" description={error} />}
    {loading && !preview && !error && <HStack gap={2} vAlign="center"><Spinner size="sm" /><Text color="secondary">불러오는 중입니다.</Text></HStack>}
    {preview && <>
      <CodeBlock code={preview.text} language={LANGUAGE[name.split('.').pop() ?? ''] ?? 'text'} width="100%" maxHeight="60vh" hasLineNumbers isWrapped />
      {preview.truncated && <Text type="supporting">전체 {formatBytes(preview.totalSize)} 중 앞부분만 보여 줍니다.</Text>}
    </>}
  </VStack>;
}

function FileRow({ name, size, load, mode, label }: { name: string; size: number; load: (name: string) => Promise<FilePreview>; mode: PreviewMode; label: string }) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<FilePreview | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function show() {
    setOpen(true);
    if (preview) return;
    setLoading(true);
    setError('');
    try {
      setPreview(await load(name));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  const body = <PreviewBody name={name} preview={preview} error={error} loading={loading} />;
  const inlineOpen = mode === 'inline' && open;
  const action = TEXT_FILE.test(name)
    ? <Button label={inlineOpen ? '닫기' : '미리보기'} variant="ghost" size="sm" tooltip={`${name} 미리보기`} onClick={() => { if (inlineOpen) setOpen(false); else void show(); }} />
    : undefined;
  return <>
    <ListItem label={<Text type="code" maxLines={1}>{name}</Text>} description={<Text type="supporting" hasTabularNumbers>{formatBytes(size)}</Text>} endContent={action} />
    {inlineOpen && body}
    {mode === 'modal' && <Dialog isOpen={open} onOpenChange={setOpen} width={880}>
      <Layout
        header={<DialogHeader title={name} subtitle={`${label}, ${formatBytes(size)}`} onOpenChange={setOpen} />}
        content={<LayoutContent padding={4}>{body}</LayoutContent>}
      />
    </Dialog>}
  </>;
}

export function FileList({ files, load, label, preview = 'inline' }: { files: { name: string; size: number }[]; load: (name: string) => Promise<FilePreview>; label: string; preview?: PreviewMode }) {
  if (files.length === 0) return <Text color="secondary">표시할 파일이 없습니다.</Text>;
  return <List density="compact" hasDividers aria-label={label}>{files.map((f) => <FileRow key={f.name} name={f.name} size={f.size} load={load} mode={preview} label={label} />)}</List>;
}
