import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    // CI runners are several times slower than a laptop; antd dialogs plus
    // userEvent typing run well past the 5s default there.
    testTimeout: 30000,
    hookTimeout: 30000,
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
    coverage: {
      provider: 'v8',
      // json-summary is what scripts/coverage-ratchet.mjs reads; text keeps
      // the local run readable.
      reporter: ['text', 'json-summary'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/test/**', 'src/main.tsx', 'src/vite-env.d.ts', 'src/**/*.d.ts'],
    },
  },
} as Parameters<typeof defineConfig>[0])
