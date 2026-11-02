import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Vitest globals가 꺼져 있으면 Testing Library가 자동으로 DOM을 정리하지 않는다.
afterEach(() => cleanup());

// jsdom은 scrollTo를 구현하지 않는다(화면 전환 때 맨 위로 올리는 호출).
window.scrollTo = () => {};
