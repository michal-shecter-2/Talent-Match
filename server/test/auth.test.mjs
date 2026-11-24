import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { createApp, digestToken } from '../app.mjs';
import { loadConfig } from '../config.mjs';
import { hashPassword, verifyPassword } from '../passwords.mjs';
import { validateWorkspace } from '../workspace-repository.mjs';
import { HttpError } from '../validation.mjs';

const password = 'Test-only passphrase 2026!';
const records = new Map();
const sessions = new Map();
const workspaces = new Map();
let server, app, base, aliceCookie, bobCookie, adminCookie;
const config = loadConfig({ APP_ORIGIN: 'http://localhost:5173', REGISTRATION_ENABLED: 'true' });
const users = {
  async findByEmail(email) { return [...records.values()].find(user => user.email === email) || null; },
  async create(value) {
    if (await this.findByEmail(value.email)) { const error = new Error('duplicate'); error.number = 2627; throw error; }
    const user = { id: randomUUID(), ...value, isActive: true, failures: 0, lockoutUntil: null }; records.set(user.id, user); return user;
  },
  async list() { return [...records.values()]; },
  async recordFailure(id) { const user = records.get(id); if (++user.failures >= 5) user.lockoutUntil = new Date(Date.now() + 900000); },
  async recordSuccess(id) { records.get(id).failures = 0; },
  async createSession(hash, userId, expiresAt) { sessions.set(hash, { userId, expiresAt }); },
  async findSession(hash) { const session = sessions.get(hash); const user = records.get(session?.userId); return session && session.expiresAt > new Date() && user?.isActive ? user : null; },
  async deleteSession(hash) { sessions.delete(hash); },
};
const workspace = {
  async load(userId) { return structuredClone(workspaces.get(userId) || { state: null, version: 0 }); },
  async save(userId, body) {
    const validated = validateWorkspace(body);
    const previous = workspaces.get(userId);
    if ((previous?.version || 0) !== validated.version) throw new HttpError(409, 'conflict');
    const result = { state: validated.state, version: validated.version + 1 }; workspaces.set(userId, result); return { version: result.version };
  },
};
async function request(path, { method = 'GET', cookie, body, origin = config.appOrigin, header = true } = {}) {
  const response = await fetch(base + path, { method, headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(method === 'GET' ? {} : { Origin: origin, ...(header ? { 'X-Talent-Request': '1' } : {}) }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: response.status, cookie: response.headers.get('set-cookie'), json: response.status === 204 ? null : await response.json() };
}
const login = email => request('/api/auth/login', { method: 'POST', body: { email, password } });
const onlyCookie = header => header.split(';')[0];
const emptyState = { candidates: [], source: { name: '', demo: false }, savedIds: [], runs: [], description: '', matches: [] };
const person = { id: 'person-one', name: 'Test Candidate', role: 'Developer', experience: '4', location: '', skills: ['SQL'], bio: '', education: '', email: '' };

before(async () => {
  const passwordHash = await hashPassword(password);
  await users.create({ email: 'alice@example.com', displayName: 'Alice', passwordHash, role: 'recruiter' });
  await users.create({ email: 'bob@example.com', displayName: 'Bob', passwordHash, role: 'recruiter' });
  await users.create({ email: 'admin@example.com', displayName: 'Admin', passwordHash, role: 'admin' });
  app = await createApp({ users, workspace, config });
  server = app.listen(0, '127.0.0.1'); await once(server, 'listening'); base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { app?.locals.dispose(); await new Promise(resolve => server.close(resolve)); });

test('passwords are salted and a wrong password fails verification', async () => {
  const one = await hashPassword(password); const two = await hashPassword(password);
  assert.notEqual(one, two); assert.ok(await verifyPassword(password, one)); assert.equal(await verifyPassword('incorrect', one), false); assert.equal(await verifyPassword(password, 'malformed'), false);
});
test('anonymous users cannot read workspace or user lists', async () => {
  assert.equal((await request('/api/workspace')).status, 401); assert.equal((await request('/api/admin/users')).status, 401);
});
test('unknown and wrong credentials use the same message and set no cookie', async () => {
  const unknown = await request('/api/auth/login', { method: 'POST', body: { email: 'nobody@example.com', password } });
  const incorrect = await request('/api/auth/login', { method: 'POST', body: { email: 'alice@example.com', password: 'wrong' } });
  assert.equal(unknown.status, 401); assert.deepEqual(unknown.json, incorrect.json); assert.equal(unknown.cookie, null);
});
test('login normalises email and creates an HttpOnly opaque session', async () => {
  const response = await login(' ALICE@EXAMPLE.COM '); aliceCookie = onlyCookie(response.cookie);
  assert.equal(response.status, 200); assert.match(response.cookie, /HttpOnly/i); assert.match(response.cookie, /SameSite=Lax/i);
  const rawToken = aliceCookie.split('=')[1]; assert.equal(sessions.has(rawToken), false); assert.ok(sessions.has(digestToken(rawToken)));
  assert.equal('passwordHash' in response.json.user, false); assert.equal((await request('/api/auth/me', { cookie: aliceCookie })).json.user.email, 'alice@example.com');
  bobCookie = onlyCookie((await login('bob@example.com')).cookie); adminCookie = onlyCookie((await login('admin@example.com')).cookie);
});
test('unsafe requests reject another origin or a missing custom header', async () => {
  const body = { version: 0, state: emptyState };
  assert.equal((await request('/api/workspace', { cookie: aliceCookie, method: 'PUT', body, origin: 'https://attacker.example' })).status, 403);
  assert.equal((await request('/api/workspace', { cookie: aliceCookie, method: 'PUT', body, header: false })).status, 403);
});
test('registration creates a recruiter and ignores a supplied admin role and user ID', async () => {
  const response = await request('/api/auth/register', { method: 'POST', body: { displayName: 'New Recruiter', email: 'NEW@example.com', password, role: 'admin', id: 'chosen-id' } });
  assert.equal(response.status, 201); assert.equal(response.json.user.role, 'recruiter'); assert.notEqual(response.json.user.id, 'chosen-id');
  assert.equal(response.json.user.email, 'new@example.com'); assert.equal((await users.findByEmail('new@example.com')).passwordHash.includes(password), false);
  const me = await request('/api/auth/me', { cookie: onlyCookie(response.cookie) }); assert.equal(me.status, 200);
});
test('registration rejects weak passwords and duplicate email addresses', async () => {
  assert.equal((await request('/api/auth/register', { method: 'POST', body: { displayName: 'Recruiter', email: 'weak@example.com', password: 'short' } })).status, 400);
  assert.equal((await request('/api/auth/register', { method: 'POST', body: { displayName: 'Recruiter', email: 'alice@example.com', password } })).status, 409);
});
test('workspace ownership comes from the session, never a supplied user ID', async () => {
  const alice = await users.findByEmail('alice@example.com');
  const response = await request('/api/workspace', { method: 'PUT', cookie: aliceCookie, body: { version: 0, userId: 'somebody-else', state: { ...emptyState, candidates: [person], savedIds: [person.id] } } });
  assert.equal(response.status, 200); assert.equal((await request('/api/workspace', { cookie: bobCookie })).json.state, null);
  assert.equal((await request('/api/workspace', { cookie: bobCookie, method: 'PUT', body: { version: 0, userId: alice.id, state: { ...emptyState, description: 'Bob private search' } } })).status, 200);
  const own = await request('/api/workspace', { cookie: aliceCookie }); assert.equal(own.json.state.candidates[0].name, person.name); assert.equal(own.json.state.description, '');
});
test('an outdated tab cannot silently overwrite a newer workspace', async () => {
  assert.equal((await request('/api/workspace', { method: 'PUT', cookie: aliceCookie, body: { version: 0, state: emptyState } })).status, 409);
});
test('a recruiter cannot create users or read the admin list', async () => {
  assert.equal((await request('/api/admin/users', { cookie: aliceCookie })).status, 403);
  assert.equal((await request('/api/admin/users', { method: 'POST', cookie: aliceCookie, body: {} })).status, 403);
  const allowed = await request('/api/admin/users', { cookie: adminCookie }); assert.equal(allowed.status, 200); assert.equal(allowed.json.users.some(user => 'passwordHash' in user), false);
});
test('locked and inactive accounts cannot log in', async () => {
  const bob = await users.findByEmail('bob@example.com'); bob.lockoutUntil = new Date(Date.now() + 60000);
  assert.equal((await login('bob@example.com')).status, 401); bob.lockoutUntil = null; bob.isActive = false;
  assert.equal((await login('bob@example.com')).status, 401); assert.equal((await request('/api/workspace', { cookie: bobCookie })).status, 401); bob.isActive = true;
});
test('expired sessions cannot access the workspace', async () => {
  sessions.get(digestToken(bobCookie.split('=')[1])).expiresAt = new Date(Date.now() - 1000);
  assert.equal((await request('/api/workspace', { cookie: bobCookie })).status, 401);
});
test('login rotates the session and logout invalidates it on the server', async () => {
  const renewed = await request('/api/auth/login', { method: 'POST', cookie: aliceCookie, body: { email: 'alice@example.com', password } });
  const nextCookie = onlyCookie(renewed.cookie); assert.notEqual(nextCookie, aliceCookie); assert.equal((await request('/api/auth/me', { cookie: aliceCookie })).status, 401);
  assert.equal((await request('/api/auth/logout', { method: 'POST', cookie: nextCookie })).status, 204); assert.equal((await request('/api/auth/me', { cookie: nextCookie })).status, 401);
});
test('workspace validation rejects broken references and oversized fields', () => {
  assert.throws(() => validateWorkspace({ version: 0, state: { ...emptyState, savedIds: ['missing'] } }));
  assert.throws(() => validateWorkspace({ version: 0, state: { ...emptyState, candidates: [{ ...person, name: 'x'.repeat(201) }] } }));
});
test('production rejects insecure origin or SQL certificate settings', () => {
  assert.throws(() => loadConfig({ NODE_ENV: 'production', APP_ORIGIN: 'http://example.com' }));
  assert.throws(() => loadConfig({ NODE_ENV: 'production', APP_ORIGIN: 'https://example.com', DB_TRUST_SERVER_CERTIFICATE: 'true' }));
});
