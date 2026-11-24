import { createInterface } from 'node:readline/promises';
import { loadConfig } from './config.mjs';
import { connectDatabase } from './db.mjs';
import { createUserRepository } from './user-repository.mjs';
import { hashPassword } from './passwords.mjs';
import { newUser } from './validation.mjs';

// Read secrets from an interactive terminal, never command-line arguments or source code.
async function secretPrompt(message) {
  if (!process.stdin.isTTY) throw new Error('Run this command in an interactive terminal.');
  process.stdout.write(message);
  process.stdin.setRawMode(true); process.stdin.resume(); process.stdin.setEncoding('utf8');
  return new Promise((resolve, reject) => {
    let value = '';
    function done(error) {
      process.stdin.removeListener('data', data); process.stdin.setRawMode(false); process.stdin.pause(); process.stdout.write('\n');
      error ? reject(error) : resolve(value);
    }
    function data(chunk) {
      for (const char of chunk) {
        if (char === '\u0003') return done(new Error('Cancelled.'));
        if (char === '\r' || char === '\n') return done();
        if (char === '\u007f' || char === '\b') value = value.slice(0, -1);
        else if (char >= ' ' && value.length < 129) value += char;
      }
    }
    process.stdin.on('data', data);
  });
}

const terminal = createInterface({ input: process.stdin, output: process.stdout });
let email, displayName, role;
try {
  email = await terminal.question('Email: ');
  displayName = await terminal.question('Display name: ');
  const requested = await terminal.question('Role (admin/recruiter, default recruiter): ');
  role = requested.trim() || 'recruiter';
  if (!['admin', 'recruiter'].includes(role)) throw new Error('Invalid role.');
} finally { terminal.close(); }
const password = await secretPrompt('Password (12+ characters, hidden): ');
const confirmation = await secretPrompt('Confirm password: ');
if (password !== confirmation) throw new Error('Passwords do not match.');
const values = newUser({ email, displayName, password });
const pool = await connectDatabase(loadConfig().database);
try {
  await createUserRepository(pool).create({ email: values.email, displayName: values.displayName, passwordHash: await hashPassword(values.password), role });
  console.log('Account created. No password was stored in plaintext.');
} finally { await pool.close(); }
