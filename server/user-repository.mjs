import { sql } from './db.mjs';

const publicColumns = 'Id AS id, Email AS email, DisplayName AS displayName, Role AS role, IsActive AS isActive';

export function createUserRepository(pool) {
  return {
    async findByEmail(email) {
      const result = await pool.request().input('Email', sql.NVarChar(254), email).query(`SELECT ${publicColumns}, PasswordHash AS passwordHash, LockoutUntil AS lockoutUntil FROM dbo.Users WHERE Email = @Email;`);
      return result.recordset[0] || null;
    },
    async create({ email, displayName, passwordHash, role }) {
      const result = await pool.request().input('Email', sql.NVarChar(254), email).input('DisplayName', sql.NVarChar(100), displayName).input('PasswordHash', sql.VarChar(256), passwordHash).input('Role', sql.VarChar(20), role).query(`INSERT INTO dbo.Users (Email, DisplayName, PasswordHash, Role) OUTPUT INSERTED.Id AS id, INSERTED.Email AS email, INSERTED.DisplayName AS displayName, INSERTED.Role AS role, INSERTED.IsActive AS isActive VALUES (@Email, @DisplayName, @PasswordHash, @Role);`);
      return result.recordset[0];
    },
    async list() {
      const result = await pool.request().query(`SELECT ${publicColumns} FROM dbo.Users ORDER BY CreatedAt DESC;`);
      return result.recordset;
    },
    async recordFailure(id) {
      await pool.request().input('Id', sql.UniqueIdentifier, id).query(`UPDATE dbo.Users SET FailedLoginCount = CASE WHEN LockoutUntil IS NOT NULL AND LockoutUntil <= SYSUTCDATETIME() THEN 1 ELSE FailedLoginCount + 1 END, LockoutUntil = CASE WHEN (CASE WHEN LockoutUntil IS NOT NULL AND LockoutUntil <= SYSUTCDATETIME() THEN 1 ELSE FailedLoginCount + 1 END) >= 5 THEN DATEADD(MINUTE, 15, SYSUTCDATETIME()) ELSE NULL END WHERE Id = @Id;`);
    },
    async recordSuccess(id) {
      await pool.request().input('Id', sql.UniqueIdentifier, id).query('UPDATE dbo.Users SET FailedLoginCount = 0, LockoutUntil = NULL WHERE Id = @Id;');
    },
    async createSession(tokenHash, userId, expiresAt) {
      await pool.request().input('TokenHash', sql.Char(64), tokenHash).input('UserId', sql.UniqueIdentifier, userId).input('ExpiresAt', sql.DateTime2(3), expiresAt).query('DELETE FROM dbo.UserSessions WHERE ExpiresAt <= SYSUTCDATETIME(); INSERT INTO dbo.UserSessions(TokenHash, UserId, ExpiresAt) VALUES(@TokenHash, @UserId, @ExpiresAt);');
    },
    async findSession(tokenHash) {
      const result = await pool.request().input('TokenHash', sql.Char(64), tokenHash).query('SELECT u.Id AS id, u.Email AS email, u.DisplayName AS displayName, u.Role AS role, u.IsActive AS isActive FROM dbo.UserSessions s INNER JOIN dbo.Users u ON u.Id = s.UserId WHERE s.TokenHash = @TokenHash AND s.ExpiresAt > SYSUTCDATETIME() AND u.IsActive = 1;');
      return result.recordset[0] || null;
    },
    async deleteSession(tokenHash) {
      await pool.request().input('TokenHash', sql.Char(64), tokenHash).query('DELETE FROM dbo.UserSessions WHERE TokenHash = @TokenHash;');
    },
  };
}
