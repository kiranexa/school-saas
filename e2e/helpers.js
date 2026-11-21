import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { FIXTURE_FILE, PASSWORD } from './config.js';

export const fixtures = () => JSON.parse(fs.readFileSync(FIXTURE_FILE, 'utf8'));

// Login lewat form di halaman /admin atau /siswa
export async function login(page, path, email, password = PASSWORD) {
  await page.goto(path);
  await page.fill('#em', email);
  await page.fill('#pw', password);
  await page.getByRole('button', { name: 'Masuk' }).click();
}

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
export const anonClient = () =>
  createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, opts);

export async function clientAs(email) {
  const sb = anonClient();
  const { error } = await sb.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  return sb;
}
