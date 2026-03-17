import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    name: '@andos/server',
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setupMock.ts'],
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules', 'dist', '**/node_modules/**'],
    testTimeout: 30000,
    hookTimeout: 30000,
    teardownTimeout: 30000,
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'tests/',
        '**/*.d.ts',
        'database/migrations/',
        'vitest.config.ts',
      ],
    },
  },
  resolve: {
    alias: [
      { find: /^@\/(.*)$/, replacement: path.resolve(__dirname, './src/$1') },
      { find: /^@andos\/shared-errors$/, replacement: path.resolve(__dirname, '../../packages/shared-errors/src/index.ts') },
    ],
  },
});
