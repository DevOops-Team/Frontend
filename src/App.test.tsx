import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';
import { CONFIG, DATASET, MODEL, makeJob, stubApi } from './test-api';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function walkToReview(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: '새 학습 만들기' }));
  await screen.findByText('GPT-2 small');
  await user.click(screen.getByRole('button', { name: '다음: 데이터 입력' }));
  await user.click(screen.getByRole('button', { name: '다음: 학습 방식' }));
  await user.click(screen.getByRole('button', { name: '다음: 최종 확인' }));
}

describe('training flow against the backend', () => {
  it('submits the default model, dataset and config when nothing is entered', async () => {
    const user = userEvent.setup();
    const api = stubApi();
    render(<App />);

    await walkToReview(user);
    await user.click(screen.getByRole('button', { name: '학습 시작' }));

    await waitFor(() => expect(api.posted()).toHaveLength(1));
    expect(api.posted()[0]).toEqual({
      model: 'gpt2', strategy: 'fsdp', gpus: 2, dataset: { id: 'ds-tiny-shakespeare', version: 1 }, hyperparameters: {},
    });
    expect(await screen.findByRole('heading', { name: 'gpt2-3f9a1c2e' })).toBeInTheDocument();
    expect(screen.getByText('FSDP · GPU 2개')).toBeInTheDocument();
  });

  it('sends the training name only when one is typed', async () => {
    const user = userEvent.setup();
    const api = stubApi();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: '새 학습 만들기' }));
    await user.type(await screen.findByLabelText('학습 이름'), 'gpt2-demo');
    await user.click(screen.getByRole('button', { name: '다음: 데이터 입력' }));
    await user.click(screen.getByRole('button', { name: '다음: 학습 방식' }));
    await user.click(screen.getByRole('button', { name: '다음: 최종 확인' }));
    await user.click(screen.getByRole('button', { name: '학습 시작' }));

    await waitFor(() => expect(api.posted()).toHaveLength(1));
    expect(api.posted()[0]).toMatchObject({ name: 'gpt2-demo' });
  });

  it('shows the model and data files stored in S3 and previews text files', async () => {
    const user = userEvent.setup();
    stubApi();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: '새 학습 만들기' }));
    expect(await screen.findByText(MODEL.uri)).toBeInTheDocument();
    expect(screen.getByText('model.safetensors')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'model.safetensors 미리보기' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'config.json 미리보기' }));
    expect(await screen.findByText('preview of config.json')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '다음: 데이터 입력' }));
    expect(await screen.findByText(DATASET.versions![0].uri)).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'train-000.jsonl 미리보기' }));
    expect(await screen.findByText('preview of train-000.jsonl')).toBeInTheDocument();
  });

  it('shows the config the backend will fill in before starting', async () => {
    const user = userEvent.setup();
    stubApi();
    render(<App />);

    await walkToReview(user);

    expect(screen.getByText('Tiny Shakespeare · v1')).toBeInTheDocument();
    expect(screen.getByText('epochs')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
  });

  async function walkToStrategy(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await screen.findByRole('button', { name: '새 학습 만들기' }));
    await screen.findByText('GPT-2 small');
    await user.click(screen.getByRole('button', { name: '다음: 데이터 입력' }));
    await user.click(screen.getByRole('button', { name: '다음: 학습 방식' }));
  }

  it('keeps detailed settings closed until asked for', async () => {
    const user = userEvent.setup();
    stubApi();
    render(<App />);
    await walkToStrategy(user);

    const toggle = screen.getByRole('button', { name: '상세 설정' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByLabelText('epochs')).not.toBeInTheDocument();

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText('epochs')).toHaveAttribute('placeholder', '10');
    expect(screen.getByLabelText('batch_size_per_gpu')).toHaveAttribute('placeholder', '4');
    expect(screen.getByLabelText('learning_rate')).toHaveAttribute('placeholder', '0.00003');
  });

  it('submits detailed settings, leaving untouched values to the backend', async () => {
    const user = userEvent.setup();
    const api = stubApi();
    render(<App />);
    await walkToStrategy(user);

    await user.click(screen.getByRole('button', { name: '상세 설정' }));
    await user.type(screen.getByLabelText('epochs'), '3');
    await user.type(screen.getByLabelText('learning_rate'), '0.001');
    await user.click(screen.getByRole('button', { name: '다음: 최종 확인' }));
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('0.001')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '학습 시작' }));

    await waitFor(() => expect(api.posted()).toHaveLength(1));
    expect(api.posted()[0]).toMatchObject({ hyperparameters: { epochs: 3, learning_rate: 0.001 } });
  });

  it('blocks moving on with an invalid detailed setting and says why', async () => {
    const user = userEvent.setup();
    const api = stubApi();
    render(<App />);
    await walkToStrategy(user);

    await user.click(screen.getByRole('button', { name: '상세 설정' }));
    await user.type(screen.getByLabelText('epochs'), '99');
    await user.click(screen.getByRole('button', { name: '다음: 최종 확인' }));

    expect(screen.getByRole('alert')).toHaveTextContent('epochs');
    expect(screen.queryByRole('button', { name: '학습 시작' })).not.toBeInTheDocument();
    expect(api.posted()).toHaveLength(0);
  });

  it('offers model and dataset choices with the sample selected', async () => {
    const user = userEvent.setup();
    stubApi({ models: [MODEL, { ...MODEL, name: 'gpt2-large', displayName: 'GPT-2 large' }], datasets: [DATASET, { ...DATASET, id: 'ds-other', name: 'Other' }] });
    render(<App />);

    await user.click(await screen.findByRole('button', { name: '새 학습 만들기' }));
    expect(await screen.findByLabelText('학습 모델')).toHaveValue('gpt2');
    await user.selectOptions(screen.getByLabelText('학습 모델'), 'gpt2-large');
    await user.click(screen.getByRole('button', { name: '다음: 데이터 입력' }));
    expect(await screen.findByLabelText('학습 데이터')).toHaveValue('ds-tiny-shakespeare');
  });

  it('shows the single model and dataset as selected choices too', async () => {
    const user = userEvent.setup();
    stubApi();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: '새 학습 만들기' }));
    expect(await screen.findByRole('combobox', { name: '학습 모델' })).toHaveValue('gpt2');
    await user.click(screen.getByRole('button', { name: '다음: 데이터 입력' }));
    expect(await screen.findByRole('combobox', { name: '학습 데이터' })).toHaveValue('ds-tiny-shakespeare');
  });

  it('lets DDP run on one GPU and submits that choice', async () => {
    const user = userEvent.setup();
    const api = stubApi();
    render(<App />);
    await walkToStrategy(user);

    await user.click(screen.getByRole('radio', { name: /DDP/ }));
    await user.click(screen.getByRole('button', { name: 'GPU 설정' }));
    await user.selectOptions(screen.getByLabelText('총 GPU 개수'), '1');
    await user.click(screen.getByRole('button', { name: '이 설정 사용하기' }));
    await user.click(screen.getByRole('button', { name: '다음: 최종 확인' }));
    await user.click(screen.getByRole('button', { name: '학습 시작' }));

    await waitFor(() => expect(api.posted()).toHaveLength(1));
    expect(api.posted()[0]).toMatchObject({ strategy: 'ddp', gpus: 1 });
  });

  it('shows 1, 2 and 4 GPUs, disabling what cannot run now', async () => {
    const user = userEvent.setup();
    stubApi();
    render(<App />);
    await walkToStrategy(user);
    await user.click(screen.getByRole('button', { name: 'GPU 설정' }));

    const option = (name: RegExp) => screen.getByRole('option', { name });
    expect(option(/^1개/)).toBeDisabled(); // FSDP는 2개 이상
    expect(option(/^2개/)).toBeEnabled();
    expect(option(/^4개/)).toBeDisabled(); // 현재 할당량 초과
    expect(option(/^4개/)).toHaveTextContent('할당량');
    expect(option(/^1개/)).toHaveTextContent('FSDP');
  });

  it('moves off one GPU when switching back to FSDP', async () => {
    const user = userEvent.setup();
    const api = stubApi();
    render(<App />);
    await walkToStrategy(user);

    await user.click(screen.getByRole('radio', { name: /DDP/ }));
    await user.click(screen.getByRole('button', { name: 'GPU 설정' }));
    await user.selectOptions(screen.getByLabelText('총 GPU 개수'), '1');
    await user.click(screen.getByRole('button', { name: '이 설정 사용하기' }));
    await user.click(screen.getByRole('radio', { name: /FSDP/ }));
    await user.click(screen.getByRole('button', { name: '다음: 최종 확인' }));
    await user.click(screen.getByRole('button', { name: '학습 시작' }));

    await waitFor(() => expect(api.posted()).toHaveLength(1));
    expect(api.posted()[0]).toMatchObject({ strategy: 'fsdp', gpus: 2 });
  });

  it('explains how to fix it when no dataset is in S3 and blocks moving on', async () => {
    const user = userEvent.setup();
    stubApi({ datasets: [] });
    render(<App />);

    await user.click(await screen.findByRole('button', { name: '새 학습 만들기' }));
    await screen.findByText('GPT-2 small');
    await user.click(screen.getByRole('button', { name: '다음: 데이터 입력' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('seed_assets.py');
    await user.click(screen.getByRole('button', { name: '다음: 학습 방식' }));
    expect(screen.queryByRole('button', { name: '다음: 최종 확인' })).not.toBeInTheDocument();
  });

  it('keeps the wizard open and shows the backend error when submission fails', async () => {
    const user = userEvent.setup();
    const fail = { '/api/jobs': { status: 400, body: { error: 'invalid request', code: 'VALIDATION', fields: [{ field: 'gpus', message: '2~2' }] } } };
    const api = stubApi();
    render(<App />);
    await walkToReview(user);
    stubApi({ fail });

    await user.click(screen.getByRole('button', { name: '학습 시작' }));

    expect(await screen.findByText(/gpus: 2~2/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '학습 시작' })).toBeInTheDocument();
    expect(api.posted()).toHaveLength(0);
  });

  it('lists real jobs on the overview and never presents mock data', async () => {
    stubApi({ jobs: [makeJob({ name: 'first-run', status: 'SUCCEEDED' })] });
    render(<App />);

    expect(await screen.findByRole('button', { name: 'first-run' })).toBeInTheDocument();
    expect(screen.queryByText(/목업/)).not.toBeInTheDocument();
  });

  it('keeps the overview to the training list, without a data card', async () => {
    const api = stubApi({ jobs: [makeJob({ name: 'first-run', status: 'SUCCEEDED' })] });
    render(<App />);

    await screen.findByRole('button', { name: 'first-run' });
    expect(screen.queryByText('준비된 학습 데이터')).not.toBeInTheDocument();
    expect(api.urls()).not.toContain('GET /api/datasets');
  });

  it('shows an error instead of fake data when the backend is down', async () => {
    stubApi({ fail: { '/api/jobs': { status: 502, body: { error: 'list jobs failed: k3s unreachable', code: 'UPSTREAM' } } } });
    render(<App />);

    expect(await screen.findByRole('alert')).toHaveTextContent('k3s unreachable');
  });

  it('links to Swagger', async () => {
    stubApi();
    render(<App />);

    expect(screen.getByRole('link', { name: /API 문서/ })).toHaveAttribute('href', '/swagger/');
    await screen.findByRole('button', { name: '새 학습 만들기' });
  });

  it('opens a job from the list and shows its real progress', async () => {
    const user = userEvent.setup();
    const job = makeJob({ config: CONFIG });
    stubApi({ jobs: [job], job });
    render(<App />);

    await user.click(await screen.findByRole('button', { name: job.name }));

    expect(await screen.findByRole('progressbar', { name: '전체 학습 진행률' })).toHaveAttribute('aria-valuenow', '25');
  });
});
