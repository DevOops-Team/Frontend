import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';
import { stubApi } from './test-api';

beforeEach(() => { localStorage.clear(); document.documentElement.removeAttribute('data-theme'); stubApi(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });
describe('appearance preferences', () => {
  it('switches and persists theme without losing wizard input', async () => {
    const user = userEvent.setup();
    const rendered = render(<App />);
    await user.click(await screen.findByRole('button', { name: '새 학습 만들기' }));
    await user.type(await screen.findByLabelText('학습 이름'), 'my-run');
    await user.click(screen.getByRole('button', { name: '다크 모드' }));
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    expect(localStorage.getItem('devoops-google-theme')).toBe('dark');
    expect(screen.getByLabelText('학습 이름')).toHaveValue('my-run');
    rendered.unmount();
    render(<App />);
    expect(screen.getByRole('button', { name: '다크 모드' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: '화이트 모드' }));
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');
  });
  it('defaults to light even when the OS prefers dark', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    render(<App />);
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');
    await screen.findByRole('button', { name: '새 학습 만들기' });
  });
});
