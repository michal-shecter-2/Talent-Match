export function loadConfig(env = process.env) {
  const production = env.NODE_ENV === 'production';
  const database = {
    server: env.DB_SERVER || 'localhost',
    port: Number(env.DB_PORT || 1433),
    database: env.DB_NAME || 'Talent',
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    options: { encrypt: env.DB_ENCRYPT !== 'false', trustServerCertificate: env.DB_TRUST_SERVER_CERTIFICATE === 'true', enableArithAbort: true },
    pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
    connectionTimeout: 15000,
    requestTimeout: 30000,
  };
  const appOrigin = env.APP_ORIGIN || 'http://localhost:5173';
  const parsedOrigin = new URL(appOrigin);
  if (parsedOrigin.origin !== appOrigin) throw new Error('APP_ORIGIN must be an origin without a path or trailing slash.');
  if (production && parsedOrigin.protocol !== 'https:') throw new Error('Production APP_ORIGIN must use HTTPS.');
  if (production && (!database.options.encrypt || database.options.trustServerCertificate)) throw new Error('Production requires encrypted SQL connections and a trusted server certificate.');
  return {
    production, appOrigin, database,
    port: Number(env.PORT || 3001),
    sessionHours: 8,
    cookieName: production ? '__Host-talent_session' : 'talent_session',
    registrationEnabled: env.REGISTRATION_ENABLED !== 'false',
    trustProxy: Number(env.TRUST_PROXY_HOPS || 0),
  };
}
