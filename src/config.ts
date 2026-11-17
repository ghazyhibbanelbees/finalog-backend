import 'dotenv/config';

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Environment variable ${name} wajib diisi (lihat .env.example)`);
  return v;
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: required('DATABASE_URL'),
  jwtSecret: required('JWT_SECRET'),
  dataKey: required('DATA_KEY'), // 64 karakter hex (32 byte)
  accessTtlSeconds: 15 * 60,
  refreshTtlDays: 30,
  maxFailedLogin: 5,
  lockMinutes: 15,
};

if (!/^[0-9a-fA-F]{64}$/.test(config.dataKey)) {
  throw new Error('DATA_KEY harus 64 karakter hex');
}
