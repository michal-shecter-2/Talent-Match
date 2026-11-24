import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.mjs';
import { connectDatabase } from './db.mjs';
import { createUserRepository } from './user-repository.mjs';
import { createApp } from './app.mjs';
import { createWorkspaceRepository } from './workspace-repository.mjs';

const config = loadConfig();
const pool = await connectDatabase(config.database);
const users = createUserRepository(pool);
const app = await createApp({ users, config, workspace: createWorkspaceRepository(pool), staticDirectory: fileURLToPath(new URL('../dist/', import.meta.url)) });
const server = app.listen(config.port, () => console.log(`Talent API is listening on port ${config.port}.`));
async function shutdown() {
  app.locals.dispose();
  server.close(async () => { await pool.close(); process.exit(0); });
}
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
