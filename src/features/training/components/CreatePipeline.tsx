import { useEffect, useId, useRef, useState } from 'react';
import { Badge } from '@astryxdesign/core/Badge';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { Field } from '@astryxdesign/core/Field';
import { FileInput } from '@astryxdesign/core/FileInput';
import { Grid } from '@astryxdesign/core/Grid';
import { useMediaQuery } from '@astryxdesign/core/hooks';
import { HStack, Layout, LayoutContent, LayoutFooter, LayoutHeader, LayoutPanel, StackItem, VStack } from '@astryxdesign/core/Layout';
import { List, ListItem } from '@astryxdesign/core/List';
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import { Selector } from '@astryxdesign/core/Selector';
import { Spinner } from '@astryxdesign/core/Spinner';
import { Step, Stepper } from '@astryxdesign/core/Stepper';
import { Heading, Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { buildSpec, createJob, errorMessage, getOptions, type Upload, type UploadFile } from '../api';
import type { TrainingOptions } from '../types';
import { formatBytes } from '../lib/format';
import { parseHyperparameters, rangeText } from '../lib/hyperparameters';
import { Icon } from '@/shared/ui/Icon';
import { checkpointInterval, formatDuration, pickData, pickModel, pickTrain, type PickedFile } from '../lib/upload';

const NAME = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
const STRATEGY_TEXT: Record<string, { tag: string; title: string; body: string; choice: string }> = {
  fsdp: { tag: '메모리 절약', title: '모델을 여러 GPU에 나눠 담을 때', body: '모델을 나눠 GPU 메모리를 절약합니다.', choice: '큰 모델을 여러 GPU에 나눠 담습니다.' },
  ddp: { tag: '적은 GPU', title: '모델이 GPU 한 장에 들어갈 때', body: '같은 모델로 데이터를 나눠 학습합니다.', choice: '모델을 GPU마다 복사하고 데이터를 나눠 학습합니다.' },
};

interface Chosen<T> { pick: T; uploads: UploadFile[] }

function toPicked(list: FileList | File | File[] | null, relative: boolean): { picked: PickedFile[]; byPath: Map<string, File> } {
  const byPath = new Map<string, File>();
  const picked: PickedFile[] = [];
  const files = list instanceof File ? [list] : Array.from(list ?? []);
  for (const f of files) {
    const path = relative && f.webkitRelativePath ? f.webkitRelativePath : f.name;
    byPath.set(path, f);
    picked.push({ path, size: f.size });
  }
  return { picked, byPath };
}

// 로컬의 Hugging Face 모델 폴더, jsonl 학습 데이터, 학습 코드(train.py)를 골라 설정과 함께 올린다.
export function CreatePipeline({ onCreated, onCancel }: { onCreated: (id: string) => void; onCancel: () => void }) {
  const [options, setOptions] = useState<TrainingOptions | null>(null);
  const [loadError, setLoadError] = useState('');
  const [name, setName] = useState('');
  const [model, setModel] = useState<Chosen<ReturnType<typeof pickModel>> | null>(null);
  const [data, setData] = useState<Chosen<ReturnType<typeof pickData>> | null>(null);
  const [train, setTrain] = useState<{ pick: ReturnType<typeof pickTrain>; upload: UploadFile | null } | null>(null);
  const [strategy, setStrategy] = useState('');
  const [gpus, setGpus] = useState(0);
  const [hyper, setHyper] = useState<Record<string, string>>({});
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [issue, setIssue] = useState('');
  const [sent, setSent] = useState<{ loaded: number; total: number } | null>(null);
  const upload = useRef<Upload | null>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const strategyGroup = useId();
  const isWide = useMediaQuery('(min-width: 1100px)');

  useEffect(() => {
    let live = true;
    getOptions().then((o) => {
      if (!live) return;
      setOptions(o);
      setStrategy(o.defaultStrategy);
      setGpus(o.gpus.default);
    }).catch((e: unknown) => { if (live) setLoadError(errorMessage(e)); });
    return () => { live = false; upload.current?.abort(); };
  }, []);

  const limits = options?.limits ?? { maxModelBytes: 0, maxDataBytes: 0, maxTrainBytes: 0, maxFiles: 0 };
  const strategyInfo = options?.strategies.find((s) => s.name === strategy);
  const minGpus = strategyInfo?.minGpus ?? 1;
  const strategyText = STRATEGY_TEXT[strategy] ?? { tag: '', title: strategy, body: '', choice: '' };
  // 고를 수 없는 값도 이유와 함께 보여 준다. 할당량이 늘면 백엔드 설정의 max만 올리면 된다.
  const gpuOptions = (options?.gpus.options ?? []).map((n) => ({
    n, reason: n < minGpus ? `${strategy.toUpperCase()}는 ${minGpus}개 이상` : options && n > options.gpus.max ? '현재 할당량 초과' : '',
  }));
  const parsed = parseHyperparameters(options?.hyperparameters ?? [], hyper);
  const nameError = name.trim() && !NAME.test(name.trim()) ? '학습 이름은 1~63자의 소문자 · 숫자 · 하이픈만 쓸 수 있습니다.' : '';
  const ckpt = model && options ? checkpointInterval(model.pick.bytes, options.checkpoint) : null;
  const changed = Object.entries(parsed.values);
  const fileCount = (model?.pick.files.length ?? 0) + (data?.pick.files.length ?? 0) + (train?.upload ? 1 : 0);

  function chooseModel(list: FileList | File | File[] | null) {
    const { picked, byPath } = toPicked(list, true);
    const pick = pickModel(picked, limits);
    setModel({ pick, uploads: pick.files.map((f) => ({ path: f.path, file: byPath.get(f.path) as File })) });
    setIssue('');
  }

  function chooseData(list: FileList | File | File[] | null) {
    const { picked, byPath } = toPicked(list, false);
    const pick = pickData(picked, limits);
    setData({ pick, uploads: pick.files.map((f) => ({ path: f.path, file: byPath.get(f.path) as File })) });
    setIssue('');
  }

  function chooseTrain(list: FileList | File | File[] | null) {
    const { picked, byPath } = toPicked(list, false);
    const pick = pickTrain(picked, limits);
    setTrain({ pick, upload: pick.file ? { path: pick.file.path, file: byPath.get(pick.file.path) as File } : null });
    setIssue('');
  }

  function chooseStrategy(next: string) {
    setStrategy(next);
    const needed = options?.strategies.find((s) => s.name === next)?.minGpus ?? 1;
    if (options && gpus < needed) setGpus(options.gpus.options.find((n) => n >= needed && n <= options.gpus.max) ?? options.gpus.default);
  }

  async function submit() {
    if (!model || !data || !train?.upload) return;
    setIssue('');
    setSent({ loaded: 0, total: 1 });
    upload.current = createJob(buildSpec({ name, strategy, gpus }, parsed.values), model.uploads, data.uploads, train.upload,
      (loaded, total) => setSent({ loaded, total }));
    try {
      const created = await upload.current.done;
      onCreated(created.id);
    } catch (e) {
      setIssue(errorMessage(e));
      setSent(null);
    } finally {
      upload.current = null;
    }
  }

  function next() {
    if (step === 0) {
      if (!options) { setIssue(loadError || '설정을 불러오는 중입니다.'); return; }
      if (nameError) { setIssue(nameError); return; }
      if (!model || model.pick.errors.length > 0) { setIssue(model?.pick.errors.join(' ') ?? '모델 폴더를 선택해 주세요.'); return; }
    }
    if (step === 1 && (!data || data.pick.errors.length > 0)) { setIssue(data?.pick.errors.join(' ') ?? '학습 데이터(.jsonl)를 선택해 주세요.'); return; }
    if (step === 2 && (!train || train.pick.errors.length > 0)) { setIssue(train?.pick.errors.join(' ') ?? '학습 코드(.py) 파일 하나를 선택해 주세요.'); return; }
    if (step === 3 && parsed.errors.length > 0) { setAdvancedOpen(true); setIssue(parsed.errors.join(' ')); return; }
    if (step === 3 && fileCount > limits.maxFiles) { setIssue(`파일이 너무 많습니다 (최대 ${limits.maxFiles}개).`); return; }
    if (step === 4) { void submit(); return; }
    setIssue('');
    setStep(step + 1);
  }

  const uploading = sent !== null;
  const percent = sent ? Math.min(100, Math.floor((sent.loaded / sent.total) * 100)) : 0;

  const STEPS = [
    { label: '모델', description: 'Hugging Face 폴더' },
    { label: '데이터', description: '.jsonl 파일' },
    { label: '학습 코드', description: 'train.py' },
    { label: '방식·GPU', description: 'FSDP 또는 DDP' },
    { label: '최종 확인', description: '업로드하고 시작' },
  ];
  const problem = loadError || issue;

  const body = <VStack gap={5}>
    {step === 0 && <VStack gap={4}>
      <VStack gap={1}><Heading level={2}>어떤 모델을 학습할까요?</Heading><Text color="secondary">config.json이 들어 있는 Hugging Face 모델 폴더를 통째로 고르세요.</Text></VStack>
      <Grid columns={{ minWidth: 260 }} gap={4}>
        <TextInput label="학습 이름" isOptional placeholder="예: gpt2-demo" value={name} onChange={(v) => setName(v)} description="소문자, 숫자, 하이픈. 비워 두면 폴더 이름" status={nameError ? { type: 'error', message: nameError } : undefined} />
        <Field label="모델 폴더" inputID="model-folder" description={`최대 ${formatBytes(limits.maxModelBytes)}`}>
          <HStack gap={2} vAlign="center">
            <Button label="폴더 선택" variant="secondary" icon={<Icon name="layers" size={16} />} onClick={() => folderInput.current?.click()} />
            <Text color="secondary" maxLines={1}>{model?.pick.folder || '선택한 폴더 없음'}</Text>
          </HStack>
          <input ref={folderInput} id="model-folder" aria-label="모델 폴더" type="file" hidden {...{ webkitdirectory: '', directory: '' }} multiple onChange={(e) => chooseModel(e.target.files)} />
        </Field>
      </Grid>
      {!options && !loadError && <HStack gap={2} vAlign="center"><Spinner size="sm" /><Text color="secondary">설정을 불러오는 중입니다.</Text></HStack>}
      {model && model.pick.files.length > 0 && <Card padding={0}>
        <List density="compact" hasDividers header={<HStack paddingInline={4} paddingBlock={3} vAlign="center"><StackItem size="fill"><Text weight="medium">{model.pick.folder}</Text></StackItem><Text type="supporting" hasTabularNumbers>파일 {model.pick.files.length}개, {formatBytes(model.pick.bytes)}</Text></HStack>}>
          {model.pick.files.slice(0, 8).map((f) => <ListItem key={f.path} label={<Text type="code">{f.path.slice(model.pick.folder.length + 1)}</Text>} endContent={<Text type="supporting" hasTabularNumbers>{formatBytes(f.size)}</Text>} />)}
          {model.pick.files.length > 8 && <ListItem label={`외 ${model.pick.files.length - 8}개`} />}
        </List>
      </Card>}
    </VStack>}
    {step === 1 && <VStack gap={4}>
      <VStack gap={1}><Heading level={2}>어떤 데이터로 학습할까요?</Heading><Text color="secondary">한 줄에 {'{"text": "..."}'} 하나씩 담긴 .jsonl 파일을 고르세요.</Text></VStack>
      <FileInput label="학습 데이터" mode="dropzone" accept=".jsonl" isMultiple description={`최대 ${formatBytes(limits.maxDataBytes)}`} value={data?.uploads.map((u) => u.file as File) ?? []} onChange={(files) => chooseData(files)} />
    </VStack>}
    {step === 2 && <VStack gap={4}>
      <VStack gap={1}><Heading level={2}>어떤 코드로 학습할까요?</Heading><Text color="secondary">torchrun으로 실행할 학습 코드(.py) 파일 하나를 고르세요.</Text></VStack>
      <FileInput label="학습 코드" mode="dropzone" accept=".py" description={`최대 ${formatBytes(limits.maxTrainBytes)}`} value={(train?.upload?.file as File | undefined) ?? null} onChange={(file) => chooseTrain(file)} />
      <MetadataList title="학습 Pod 안의 경로">
        <MetadataListItem label="실행 위치"><Text type="code">/data/code/train.py</Text></MetadataListItem>
        <MetadataListItem label="설정"><Text type="code">TRAIN_CONFIG</Text></MetadataListItem>
        <MetadataListItem label="모델, 데이터"><Text type="code">DATA_DIR/model  DATA_DIR/data</Text></MetadataListItem>
        <MetadataListItem label="체크포인트"><Text type="code">CKPT_DIR</Text></MetadataListItem>
      </MetadataList>
      {train?.upload && <Text type="supporting">{formatBytes(train.upload.file.size)}, train.py로 저장</Text>}
    </VStack>}
    {step === 3 && <VStack gap={4}>
      <VStack gap={1}><Heading level={2}>학습 방식과 GPU를 선택하세요</Heading><Text color="secondary">큰 모델은 FSDP, GPU 한 장에 들어가는 모델은 DDP를 고르세요.</Text></VStack>
      <Grid columns={{ minWidth: 240 }} gap={3} role="radiogroup" aria-label="학습 방식">
        {(options?.strategies ?? []).map((s, i) => {
          const text = STRATEGY_TEXT[s.name] ?? strategyText;
          const id = `${strategyGroup}-${i}`;
          return <Card key={s.name} className="strategy-card" padding={4}>
            <input id={id} className="strategy-card-input" type="radio" name={strategyGroup} checked={strategy === s.name}
              aria-label={s.name.toUpperCase()} aria-describedby={`${id}-description`} onChange={() => chooseStrategy(s.name)} />
            <label className="strategy-card-hit-area" htmlFor={id} />
            <VStack gap={2}>
              <HStack gap={2} vAlign="center"><Heading level={3}>{s.name.toUpperCase()}</Heading><Badge variant="neutral" label={text.tag} /></HStack>
              <VStack gap={2} id={`${id}-description`}><Text weight="medium">{text.title}</Text><Text type="supporting">{text.body}</Text></VStack>
            </VStack>
          </Card>;
        })}
      </Grid>
      <Selector label="총 GPU 개수 (노드당 1개)" value={String(gpus)} onChange={(v) => setGpus(Number(v))} width={320} options={gpuOptions.map(({ n, reason }) => ({ value: String(n), label: `${n}개${reason ? ` (${reason})` : ''}`, disabled: Boolean(reason) }))} />
      <Collapsible trigger={<Text weight="medium">상세 설정</Text>} isOpen={advancedOpen} onOpenChange={setAdvancedOpen}>
        <VStack gap={3} paddingBlockStart={2}>
          <Text type="supporting">비워 두면 기본값으로 학습합니다.</Text>
          <Grid columns={{ minWidth: 200 }} gap={3}>{options?.hyperparameters.map((h) => <TextInput key={h.key} label={h.key} inputMode="decimal" autoComplete="off" placeholder={h.default === null ? '없음' : String(h.default)} value={hyper[h.key] ?? ''} description={rangeText(h)} onChange={(v) => { setHyper({ ...hyper, [h.key]: v }); setIssue(''); }} />)}</Grid>
        </VStack>
      </Collapsible>
    </VStack>}
    {step === 4 && <VStack gap={4}>
      <VStack gap={1}><Heading level={2}>이 설정으로 학습을 시작할까요?</Heading><Text color="secondary">아래 설정으로 파일을 올리고 학습을 시작합니다.</Text></VStack>
      <MetadataList columns="multi">
        <MetadataListItem label="학습 이름">{name.trim() || `${model?.pick.folder ?? ''}-(자동)`}</MetadataListItem>
        <MetadataListItem label="방식, GPU">{strategy.toUpperCase()} · {gpus}개</MetadataListItem>
        <MetadataListItem label="모델">{model?.pick.folder} ({formatBytes(model?.pick.bytes ?? 0)})</MetadataListItem>
        <MetadataListItem label="데이터">파일 {data?.pick.files.length}개 ({formatBytes(data?.pick.bytes ?? 0)})</MetadataListItem>
        <MetadataListItem label="학습 코드">{train?.upload?.path} ({formatBytes(train?.upload?.file.size ?? 0)})</MetadataListItem>
        {ckpt ? <MetadataListItem label="체크포인트 간격">약 {formatDuration(ckpt.intervalSeconds)}마다</MetadataListItem> : null}
        <MetadataListItem label="상세 설정">{changed.length === 0 ? '기본값' : changed.map(([k, v]) => `${k} ${v}`).join(', ')}</MetadataListItem>
      </MetadataList>
      {uploading && <ProgressBar label={percent < 100 ? `업로드 중 ${formatBytes(sent.loaded)} / ${formatBytes(sent.total)}` : '업로드 완료. 학습을 제출하는 중입니다.'} value={percent} hasValueLabel />}
    </VStack>}
    {problem && <Banner status="error" role="alert" title="진행할 수 없습니다" description={problem} />}
  </VStack>;

  return <Layout
    height="fill"
    header={<LayoutHeader hasDivider>
      <VStack gap={4}>
        <Heading level={1}>새 학습 만들기</Heading>
        <Stepper activeStep={step} label="새 학습 단계" onStepClick={uploading ? undefined : (i) => { if (i < step) { setIssue(''); setStep(i); } }}>
          {STEPS.map((s, i) => <Step key={s.label} step={i} label={s.label} description={s.description} isDisabled={i > step} />)}
        </Stepper>
      </VStack>
    </LayoutHeader>}
    content={<LayoutContent label="단계 내용">{body}</LayoutContent>}
    footer={<LayoutFooter hasDivider>
      <HStack gap={2} vAlign="center">
        <Button label={uploading ? '업로드 취소' : step === 0 ? '취소' : '이전'} variant="secondary" onClick={() => { if (uploading) { upload.current?.abort(); return; } if (step === 0) onCancel(); else { setIssue(''); setStep(step - 1); } }} />
        <StackItem size="fill" />
        <Button label={['다음: 학습 데이터', '다음: 학습 코드', '다음: 학습 방식', '다음: 최종 확인', uploading ? '올리는 중…' : '업로드하고 학습 시작'][step]} variant="primary" isLoading={uploading} isDisabled={uploading} onClick={next} />
      </HStack>
    </LayoutFooter>}
    end={isWide ? <LayoutPanel hasDivider width={300} label="실행 전 요약">
      <VStack gap={3}>
        <Heading level={2}>실행 전 요약</Heading>
        <Text type="supporting">{strategyText.choice}</Text>
        <MetadataList>
          <MetadataListItem label="학습 방식">{strategy.toUpperCase()}</MetadataListItem>
          <MetadataListItem label="전체 GPU">{gpus}개</MetadataListItem>
          <MetadataListItem label="모델">{model?.pick.folder || '-'}</MetadataListItem>
          <MetadataListItem label="업로드">{formatBytes((model?.pick.bytes ?? 0) + (data?.pick.bytes ?? 0) + (train?.upload?.file.size ?? 0))}</MetadataListItem>
        </MetadataList>
      </VStack>
    </LayoutPanel> : undefined}
  />;
}
