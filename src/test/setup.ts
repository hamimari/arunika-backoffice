import '@testing-library/jest-dom';
import { cleanup, configure } from '@testing-library/react';
import { afterAll, afterEach } from 'vitest';

configure({ asyncUtilTimeout: 10000 });

// jsdom doesn't implement matchMedia — antd's responsive grid/breakpoint
// hooks call it on every mount, so any page test using antd components
// needs this polyfill.
// jsdom also doesn't implement ResizeObserver, which antd's Select/dropdown
// positioning relies on.
if (!window.ResizeObserver) {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

if (!window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }) as unknown as MediaQueryList;
}

// React's scheduler fires work via setImmediate. On a slow runner that work can
// land after jsdom is torn down ("window is not defined"), so unmount and let
// it drain while the window still exists.
const drainScheduler = () => new Promise<void>((resolve) => setImmediate(resolve));

afterEach(async () => {
  cleanup();
  await drainScheduler();
});

afterAll(async () => {
  await drainScheduler();
  await drainScheduler();
});
