import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Vitest globals가 꺼져 있으면 Testing Library가 자동으로 DOM을 정리하지 않는다.
afterEach(() => cleanup());
