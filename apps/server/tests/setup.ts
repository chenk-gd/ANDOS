import { beforeAll, afterAll } from 'vitest';
import { db } from '../src/db/connection';

// Global test setup
beforeAll(async () => {
  // Verify database connection
  const connected = await db.raw('SELECT 1');
  if (!connected) {
    throw new Error('Database connection failed');
  }
  console.log('Test database connected');
});

afterAll(async () => {
  // Close database connection
  await db.destroy();
  console.log('Test database disconnected');
});
