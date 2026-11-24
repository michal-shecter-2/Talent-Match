import { readFile } from 'node:fs/promises';
import { loadConfig } from './config.mjs';
import { connectDatabase } from './db.mjs';

const pool = await connectDatabase(loadConfig().database);
try {
  const schema = await readFile(new URL('./schema.sql', import.meta.url), 'utf8');
  await pool.request().batch(schema);
  console.log('SQL Server schema is up to date.');
} finally { await pool.close(); }
