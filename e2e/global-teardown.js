import { adminClient, cleanup } from './seed.js';

export default async function globalTeardown() {
  if (process.env.E2E_KEEP_DATA === '1') return;   // untuk debugging
  await cleanup(adminClient());
}
