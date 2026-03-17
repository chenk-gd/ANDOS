import { beforeAll, afterAll, vi } from 'vitest';

// Global mocks for all tests
vi.mock('bcrypt', () => ({
  default: {
    hash: vi.fn(async (password: string) => `hashed_${password}`),
    compare: vi.fn(async (password: string, hash: string) => hash === `hashed_${password}`),
  },
  hash: vi.fn(async (password: string) => `hashed_${password}`),
  compare: vi.fn(async (password: string, hash: string) => hash === `hashed_${password}`),
}));

// Mock test setup - no database required
beforeAll(async () => {
  console.log('Mock test environment initialized');
});

afterAll(async () => {
  console.log('Mock test environment cleaned up');
});
