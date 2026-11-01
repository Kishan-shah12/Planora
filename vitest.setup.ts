import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';

// Lazy tabs load slower under coverage instrumentation; allow findBy* queries a little longer.
configure({ asyncUtilTimeout: 10_000 });

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});
