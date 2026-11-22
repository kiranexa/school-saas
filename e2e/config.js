export const PORT = 5199;
export const SLUG_A = 'e2e-a';
export const SLUG_B = 'e2e-b';
export const URL_A = `http://${SLUG_A}.localhost:${PORT}`;
export const URL_B = `http://${SLUG_B}.localhost:${PORT}`;
export const PASSWORD = 'E2e-Test-Pass-123!';

export const USERS = {
  adminA: 'e2e-admin-a@example.com',   // owner sekolah A
  staffA: 'e2e-staff-a@example.com',   // peran admin (bukan owner) sekolah A
  guruA: 'e2e-guru-a@example.com',
  siswaA: 'e2e-siswa-a@example.com',
  adminB: 'e2e-admin-b@example.com',
};

export const FIXTURE_FILE = new URL('./.fixtures.json', import.meta.url);
