import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';
import { seedRuns } from './mock/seed';

async function pickTaskAndModel(user: ReturnType<typeof userEvent.setup>, task: RegExp, model: string) {
  await user.click(screen.getByRole('radio', { name: task }));
  await user.click(screen.getByRole('button', { name: '다음' }));
  await user.click(screen.getByRole('radio', { name: model }));
  await user.click(screen.getByRole('button', { name: '다음' }));
}

describe('App (mock)', () => {
  it('walks the wizard with a sample dataset and adds the run to the list', async () => {
    const user = userEvent.setup();
    render(<App initialRuns={[]} />);
    expect(screen.getByText('목업 데이터')).toBeInTheDocument();
    expect(screen.getByText('아직 실행이 없습니다')).toBeInTheDocument();

    const next = () => screen.getByRole('button', { name: '다음' });
    expect(next()).toBeDisabled();
    await user.click(screen.getByRole('radio', { name: /텍스트 분류/ }));
    await user.click(next());

    // 태스크로 걸러진 모델만 보인다
    expect(screen.queryByRole('radio', { name: 'meta-llama/Llama-3.1-8B' })).not.toBeInTheDocument();
    await user.type(screen.getByRole('searchbox', { name: '모델 검색' }), 'klue');
    expect(screen.queryByRole('radio', { name: 'xlm-roberta-base' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'klue/bert-base' }));
    await user.click(next());

    expect(next()).toBeDisabled();
    await user.click(screen.getByRole('button', { name: /쇼핑몰 리뷰 감성/ }));
    expect(screen.getByRole('combobox', { name: '텍스트 컬럼' })).toHaveValue('document');
    expect(screen.getByRole('combobox', { name: '라벨 컬럼' })).toHaveValue('label');
    expect(within(screen.getByRole('list', { name: '라벨 분포' })).getByText(/긍정/)).toBeInTheDocument();
    await user.click(next());

    // 프리셋 '균형'이 기본, 작은 모델이라 LoRA는 꺼짐
    expect(screen.getByRole('radio', { name: /균형/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText(/NVIDIA T4 16GB × 1/)).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: /빠르게/ }));
    await user.click(next());

    expect(screen.getByRole('textbox', { name: '실행 이름' })).toHaveValue('bert-base-ko-shopping-reviews');
    await user.click(screen.getByText('API 요청으로 보기'));
    const body = JSON.parse(screen.getByLabelText('API 요청 본문').textContent!);
    expect(body).toMatchObject({
      task: 'text-classification',
      base_model: 'klue/bert-base',
      dataset: { source: 'sample', uri: 'sample://ko-shopping-reviews', columns: { text: 'document', label: 'label' }, split: { train: 0.9 } },
      hyperparameters: { preset: 'fast', epochs: 1, lora: { enabled: false } },
      compute: { gpu: 't4', gpu_count: 1, auto: true },
    });

    await user.click(screen.getByRole('button', { name: '학습 시작' }));
    expect(screen.getByText('파인튜닝을 시작했습니다')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'bert-base-ko-shopping-reviews 상세 보기' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '실행 상세 보기' }));
    expect(screen.getByRole('list', { name: '단계 진행' })).toBeInTheDocument();
    expect(screen.getByText('검증 F1')).toBeInTheDocument();
  });

  it('parses an uploaded CSV, previews it and blocks on a bad mapping', async () => {
    const user = userEvent.setup();
    render(<App initialRuns={[]} />);
    await pickTaskAndModel(user, /텍스트 분류/, 'klue/bert-base');

    await user.click(screen.getByRole('radio', { name: /CSV\/JSONL 업로드/ }));
    const csv = 'review,sentiment,extra\n"좋아요, 또 살게요",pos,1\n별로예요,neg,2\n그럭저럭,,3\n';
    await user.upload(screen.getByLabelText('데이터셋 파일'), new File([csv], 'reviews.csv', { type: 'text/csv' }));

    const preview = await screen.findByRole('table', { name: '데이터 미리보기' });
    expect(within(preview).getByText('좋아요, 또 살게요')).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: '감지된 컬럼' })).getByText('review')).toBeInTheDocument();
    expect(screen.getByText(/전체 3행/)).toBeInTheDocument();

    // 'sentiment'는 동의어가 아니라 자동 매핑이 안 된다 → 직접 고른다
    expect(screen.getByRole('combobox', { name: '텍스트 컬럼' })).toHaveValue('review');
    expect(screen.getByRole('alert')).toHaveTextContent("'라벨' 역할에 컬럼을 지정하세요");
    expect(screen.getByRole('button', { name: '다음' })).toBeDisabled();
    await user.selectOptions(screen.getByRole('combobox', { name: '라벨 컬럼' }), 'sentiment');
    expect(screen.getByText(/'sentiment' 컬럼에 빈 값 1개/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다음' })).toBeEnabled();
  });

  it('shows an error for an invalid JSONL upload', async () => {
    const user = userEvent.setup();
    render(<App initialRuns={[]} />);
    await pickTaskAndModel(user, /지시 따르기/, 'Qwen/Qwen2.5-7B');
    await user.click(screen.getByRole('radio', { name: /CSV\/JSONL 업로드/ }));
    await user.upload(screen.getByLabelText('데이터셋 파일'), new File(['{"instruction":"a"}\nnot json'], 'bad.jsonl'));
    expect(await screen.findByText('JSONL 2번째 줄을 읽을 수 없습니다')).toBeInTheDocument();
  });

  it('shows outputs, evaluation and playground for a finished seeded run, and the failure reason for a failed one', async () => {
    const user = userEvent.setup();
    render(<App initialRuns={seedRuns()} />);
    await user.click(screen.getByRole('button', { name: 'bert-nsmc-sentiment 상세 보기' }));
    expect(screen.getByText('devoops/bert-nsmc-sentiment:v1')).toBeInTheDocument();
    expect(screen.getByRole('table', { name: '혼동 행렬' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /loss 그래프/ })).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: '플레이그라운드 입력' }), '최고의 영화, 강력 추천');
    await user.click(screen.getByRole('button', { name: '예측' }));
    expect(within(screen.getByRole('status', { name: '예측 결과' })).getAllByRole('listitem')[0]).toHaveTextContent('1');

    await user.click(screen.getByRole('button', { name: '실행 목록' }));
    await user.click(screen.getByRole('button', { name: 'vit-pcb-defects 상세 보기' }));
    expect(screen.getByRole('alert')).toHaveTextContent('빈 값 132개');
  });
});
