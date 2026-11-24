import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { loadConfig } from '../config.mjs';
import { connectDatabase, sql } from '../db.mjs';
import { createUserRepository } from '../user-repository.mjs';
import { createWorkspaceRepository } from '../workspace-repository.mjs';
import { hashPassword, verifyPassword } from '../passwords.mjs';
import { digestToken } from '../app.mjs';

// Opt-in check for a DEVELOPMENT database after db:migrate.
const pool = await connectDatabase(loadConfig().database);
const users = createUserRepository(pool);
const workspace = createWorkspaceRepository(pool);
const createdIds = [];
try {
  const suffix = randomBytes(8).toString('hex');
  const password = randomBytes(32).toString('base64url');
  const passwordHash = await hashPassword(password);
  const alice = await users.create({ email: `test-a-${suffix}@example.invalid`, displayName: 'Integration A', passwordHash, role: 'recruiter' }); createdIds.push(alice.id);
  const bob = await users.create({ email: `test-b-${suffix}@example.invalid`, displayName: 'Integration B', passwordHash, role: 'recruiter' }); createdIds.push(bob.id);
  const found = await users.findByEmail(alice.email); assert.ok(await verifyPassword(password, found.passwordHash));
  const hash = digestToken(randomBytes(32).toString('base64url'));
  await users.createSession(hash, alice.id, new Date(Date.now() + 60000));
  assert.equal((await users.findSession(hash)).id, alice.id);
  const state = { candidates: [], source: { name: 'test', demo: false }, savedIds: [], runs: [], matches: [], description: 'Alice private job description' };
  assert.equal((await workspace.save(alice.id, { state, version: 0 })).version, 1);
  assert.equal((await workspace.load(alice.id)).state.description, state.description);
  assert.equal((await workspace.load(bob.id)).state, null);
  await assert.rejects(workspace.save(alice.id, { state, version: 0 }), error => error.status === 409);
  await workspace.save(alice.id, { state: { ...state, description: 'Updated' }, version: 1 });
  await users.deleteSession(hash); assert.equal(await users.findSession(hash), null);
  console.log('SQL Server integration passed: users, sessions, private workspaces, and revision conflicts.');
} finally {
  for (const id of createdIds) await pool.request().input('Id', sql.UniqueIdentifier, id).query('DELETE FROM dbo.Users WHERE Id = @Id;');
  await pool.close();
}
