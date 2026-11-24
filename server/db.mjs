import sql from 'mssql';

export async function connectDatabase(config) {
  if (!config.user || !config.password) throw new Error('Set DB_USER and DB_PASSWORD in your local .env file.');
  const pool = new sql.ConnectionPool(config);
  pool.on('error', error => console.error('SQL pool error:', error.code || 'database_error'));
  await pool.connect();
  return pool;
}

export { sql };
