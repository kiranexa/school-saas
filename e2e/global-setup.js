import fs from 'node:fs';
import { adminClient, cleanup, seed } from './seed.js';
import { FIXTURE_FILE } from './config.js';

export default async function globalSetup() {
  const sb = adminClient();
  await cleanup(sb);                       // sisa data dari run yang gagal
  const fx = await seed(sb);
  fs.writeFileSync(FIXTURE_FILE, JSON.stringify(fx, null, 2));
}
