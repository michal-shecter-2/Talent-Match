import express from 'express';
import helmet from 'helmet';
import { randomBytes, createHash } from 'node:crypto';
import { hashPassword, verifyPassword } from './passwords.mjs';
import { credentials, newUser, HttpError } from './validation.mjs';

export const digestToken = token => createHash('sha256').update(token).digest('hex');
const invalidCredentials = 'האימייל או הסיסמה אינם נכונים, או שהחשבון חסום זמנית.';

function publicUser(user) {
  return { id: user.id, email: user.email, displayName: user.displayName, role: user.role };
}

export async function createApp({ users, config, workspace, staticDirectory }) {
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', config.trustProxy);
  app.use(helmet({ contentSecurityPolicy: { directives: { 'font-src': ["'self'", 'data:'], 'style-src': ["'self'", "'unsafe-inline'"], 'img-src': ["'self'", 'data:'], 'connect-src': ["'self'"], 'script-src': ["'self'"], 'upgrade-insecure-requests': config.production ? [] : null } }, strictTransportSecurity: config.production ? undefined : false }));
  app.use('/api', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  // Same-origin custom header blocks cross-site form submissions and unauthorised CORS preflights.
  // No CORS access is granted; production serves the UI and API on the same origin.
  app.use('/api', (req, _res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    if (req.get('origin') !== config.appOrigin || req.get('x-talent-request') !== '1') return next(new HttpError(403, 'הבקשה נחסמה. רענני את הדף ונסי שוב.'));
    next();
  });
  app.use(express.json({ limit: '12mb' }));
  const cookieOptions = { httpOnly: true, secure: config.production, sameSite: 'lax', path: '/' };
  function sessionToken(req) {
    const cookie = (req.headers.cookie || '').split(';').map(item => item.trim()).find(item => item.startsWith(`${config.cookieName}=`));
    const value = cookie?.slice(config.cookieName.length + 1);
    return value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
  }
  async function authenticate(req, _res, next) {
    const token = sessionToken(req);
    req.user = token ? await users.findSession(digestToken(token)) : null;
    if (!req.user) throw new HttpError(401, 'יש להיכנס למערכת כדי להמשיך.');
    next();
  }
  function adminOnly(req, _res, next) {
    if (req.user.role !== 'admin') throw new HttpError(403, 'הפעולה זמינה למנהלת המערכת בלבד.');
    next();
  }
  const attempts = new Map();
  const timer = setInterval(() => { for (const [key, value] of attempts) if (value.until <= Date.now()) attempts.delete(key); }, 60000).unref();
  app.locals.dispose = () => clearInterval(timer);
  function limitAuthentication(req, _res, next) {
    const key = req.ip || 'unknown';
    let entry = attempts.get(key);
    if (!entry || entry.until <= Date.now()) { entry = { count: 0, until: Date.now() + 15 * 60000 }; attempts.set(key, entry); }
    if (++entry.count > 20) throw new HttpError(429, 'בוצעו יותר מדי ניסיונות. נסי שוב בעוד 15 דקות.');
    next();
  }
  // Use a valid password hash for an unknown user to perform the same expensive verification.
  const dummyHash = await hashPassword(randomBytes(32).toString('hex'));
  async function startSession(req, res, user) {
    const previous = sessionToken(req);
    if (previous) await users.deleteSession(digestToken(previous));
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + config.sessionHours * 3600000);
    await users.createSession(digestToken(token), user.id, expiresAt);
    res.cookie(config.cookieName, token, { ...cookieOptions, expires: expiresAt });
    return publicUser(user);
  }
  async function createAccount(body, role = 'recruiter') {
    const values = newUser(body);
    const passwordHash = await hashPassword(values.password);
    try { return await users.create({ email: values.email, displayName: values.displayName, passwordHash, role }); }
    catch (error) { if ([2601, 2627].includes(error.number) || [2601, 2627].includes(error.originalError?.info?.number)) throw new HttpError(409, 'לא ניתן ליצור חשבון עם כתובת האימייל הזאת.'); throw error; }
  }

  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
  app.get('/api/auth/config', (_req, res) => res.json({ registrationEnabled: config.registrationEnabled }));
  app.post('/api/auth/login', limitAuthentication, async (req, res) => {
    const { email, password } = credentials(req.body);
    const user = await users.findByEmail(email);
    const valid = await verifyPassword(password, user?.passwordHash || dummyHash);
    if (!user || !valid || !user.isActive || (user.lockoutUntil && new Date(user.lockoutUntil) > new Date())) {
      if (user && !valid && user.isActive) await users.recordFailure(user.id);
      throw new HttpError(401, invalidCredentials);
    }
    await users.recordSuccess(user.id);
    res.json({ user: await startSession(req, res, user) });
  });
  app.post('/api/auth/register', limitAuthentication, async (req, res) => {
    if (!config.registrationEnabled) throw new HttpError(403, 'יצירת חשבונות זמינה דרך מנהלת המערכת.');
    // Public registration never accepts a role or an externally provided user ID.
    const user = await createAccount(req.body);
    res.status(201).json({ user: await startSession(req, res, user) });
  });
  app.get('/api/auth/me', authenticate, (req, res) => res.json({ user: publicUser(req.user) }));
  app.post('/api/auth/logout', async (req, res) => {
    const token = sessionToken(req);
    if (token) await users.deleteSession(digestToken(token));
    res.clearCookie(config.cookieName, cookieOptions).status(204).end();
  });
  app.get('/api/admin/users', authenticate, adminOnly, async (_req, res) => res.json({ users: (await users.list()).map(user => ({ ...publicUser(user), isActive: Boolean(user.isActive) })) }));
  app.post('/api/admin/users', authenticate, adminOnly, async (req, res) => {
    const user = await createAccount(req.body, 'recruiter');
    res.status(201).json({ user: publicUser(user) });
  });

  if (workspace) {
    app.get('/api/workspace', authenticate, async (req, res) => res.json(await workspace.load(req.user.id)));
    app.put('/api/workspace', authenticate, async (req, res) => {
      const result = await workspace.save(req.user.id, req.body);
      res.json(result);
    });
  }
  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'הכתובת לא נמצאה.')));
  if (staticDirectory) {
    app.use(express.static(staticDirectory));
    app.get('/{*path}', (_req, res) => res.sendFile('index.html', { root: staticDirectory }));
  }
  app.use((error, _req, res, _next) => {
    const status = error instanceof HttpError ? error.status : error.type === 'entity.too.large' ? 413 : error.type === 'entity.parse.failed' ? 400 : 500;
    if (status === 500) console.error('Request failed:', error.code || error.name || 'internal_error');
    res.status(status).json({ error: error instanceof HttpError ? error.message : status === 413 ? 'הבקשה גדולה מדי.' : status === 400 ? 'מבנה הבקשה אינו תקין.' : 'אירעה שגיאה בשרת. נסי שוב מאוחר יותר.' });
  });
  return app;
}
