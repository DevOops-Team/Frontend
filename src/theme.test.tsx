import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';

beforeEach(() => { localStorage.clear(); document.documentElement.removeAttribute('data-theme'); });
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });
describe('appearance preferences', () => {
  it('switches and persists theme without losing wizard input', async () => {
    const user = userEvent.setup();
    const rendered = render(<App />);
    await user.click(screen.getByRole('button', { name: '새 학습 만들기' }));
    await user.type(screen.getByLabelText('학습 모델'), 'my/custom-model');
    await user.click(screen.getByRole('button', { name: '다크 모드' }));
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    expect(localStorage.getItem('devoops-google-theme')).toBe('dark');
    expect(screen.getByLabelText('학습 모델')).toHaveValue('my/custom-model');
    rendered.unmount();
    render(<App />);
    expect(screen.getByRole('button', { name: '다크 모드' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: '화이트 모드' }));
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');
  });
  it('defaults to light even when the OS prefers dark', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    render(<App />);
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');
  });
});
