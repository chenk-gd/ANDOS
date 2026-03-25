import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    name: '@andos/server-integration',
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/integration/**/*.test.ts'],
    exclude: ['node_modules', 'dist', '**/node_modules/**'],
    testTimeout: 60000,
    hookTimeout: 60000,
    teardownTimeout: 60000,
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
  resolve: {
    alias: [
      { find: /^@\/(.*)$/, replacement: path.resolve(__dirname, './src/$1') },
      { find: /^~\/(.*)$/, replacement: path.resolve(__dirname, './tests/$1') },
      { find: /^@andos\/shared-errors$/, replacement: path.resolve(__dirname, '../../packages/shared-errors/src/index.ts') },
    ],
  },
});
