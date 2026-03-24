import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
  test: {
    name: '@andos/web',
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/e2e/**',
      '**/*.e2e.spec.ts',
      '**/cypress/**',
      '**/.{idea,git,cache,output,temp}/**',
      '**/playwright-tests/**',
    ],
    deps: {
      inline: ['element-plus'],
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'e2e/',
        'dist/',
        '**/*.d.ts',
        '**/*.config.ts',
        '**/mock.ts',
        '**/types/**',
      ],
    },
  },
  resolve: {
    alias: [
      { find: /^@\/(.*)$/, replacement: resolve(__dirname, 'src/$1') },
    ],
  },
})
