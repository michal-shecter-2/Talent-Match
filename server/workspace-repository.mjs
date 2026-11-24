import { sql } from './db.mjs';
import { HttpError } from './validation.mjs';

function text(value, maximum, field, required = false) {
  if (typeof value !== 'string' || value.length > maximum || (required && !value.trim())) throw new HttpError(400, `ערך לא תקין בשדה ${field}.`);
  return value;
}
function texts(values, maximumCount, maximumLength, field) {
  if (!Array.isArray(values) || values.length > maximumCount) throw new HttpError(400, `ערך לא תקין בשדה ${field}.`);
  return values.map(value => text(value, maximumLength, field));
}
function candidate(value) {
  if (!value || typeof value !== 'object') throw new HttpError(400, 'פרטי מועמד אינם תקינים.');
  return {
    id: text(value.id, 100, 'מזהה', true), name: text(value.name, 200, 'שם', true),
    role: text(value.role, 300, 'תפקיד'), experience: text(value.experience, 100, 'ניסיון'), location: text(value.location, 500, 'מיקום'),
    skills: texts(value.skills, 100, 200, 'מיומנויות'), bio: text(value.bio, 20000, 'תקציר'), education: text(value.education, 2000, 'השכלה'), email: text(value.email, 254, 'אימייל'),
  };
}
function match(value, candidateIds) {
  const person = candidate(value?.candidate);
  if (!candidateIds.has(person.id) || !Number.isFinite(value.score) || value.score < 0 || value.score > 100) throw new HttpError(400, 'תוצאת התאמה אינה תקינה.');
  return { candidate: person, score: value.score, matched: texts(value.matched, 100, 200, 'מיומנויות תואמות'), missing: texts(value.missing, 100, 200, 'פערים') };
}

export function validateWorkspace(body) {
  if (!Number.isInteger(body?.version) || body.version < 0 || !body.state || typeof body.state !== 'object') throw new HttpError(400, 'מבנה סביבת העבודה אינו תקין.');
  const state = body.state;
  if (!Array.isArray(state.candidates) || state.candidates.length > 5000 || !Array.isArray(state.runs) || state.runs.length > 30 || !Array.isArray(state.matches) || state.matches.length > 3) throw new HttpError(400, 'סביבת העבודה חורגת מהמגבלות.');
  const candidates = state.candidates.map(candidate);
  const ids = new Set(candidates.map(item => item.id));
  if (ids.size !== candidates.length) throw new HttpError(400, 'מזהי המועמדים צריכים להיות ייחודיים.');
  const savedIds = texts(state.savedIds, 5000, 100, 'מועמדים שמורים');
  if (savedIds.some(id => !ids.has(id))) throw new HttpError(400, 'מועמד שמור אינו קיים במאגר.');
  const result = {
    candidates, savedIds,
    source: { name: text(state.source?.name, 300, 'שם הקובץ'), demo: Boolean(state.source?.demo) },
    description: text(state.description, 6000, 'תיאור משרה'),
    matches: state.matches.map(value => match(value, ids)),
    runs: state.runs.map(run => {
      if (!Number.isSafeInteger(run?.id) || !Array.isArray(run.matches) || run.matches.length > 3) throw new HttpError(400, 'היסטוריית החיפושים אינה תקינה.');
      return { id: run.id, description: text(run.description, 6000, 'תיאור משרה'), time: text(run.time, 50, 'שעת חיפוש'), matches: run.matches.map(value => match(value, ids)) };
    }),
  };
  if (Buffer.byteLength(JSON.stringify(result)) > 10 * 1024 * 1024) throw new HttpError(413, 'סביבת העבודה גדולה מ־10MB. הקטיני את המאגר.');
  return { version: body.version, state: result };
}

export function createWorkspaceRepository(pool) {
  return {
    async load(userId) {
      const result = await pool.request().input('UserId', sql.UniqueIdentifier, userId).query('SELECT StateJson, Revision FROM dbo.RecruiterWorkspaces WHERE UserId = @UserId;');
      const row = result.recordset[0];
      return row ? { state: JSON.parse(row.StateJson), version: row.Revision } : { state: null, version: 0 };
    },
    async save(userId, body) {
      const { state, version } = validateWorkspace(body);
      const request = pool.request().input('UserId', sql.UniqueIdentifier, userId).input('StateJson', sql.NVarChar(sql.MAX), JSON.stringify(state)).input('Revision', sql.Int, version);
      try {
        const result = version === 0
          ? await request.query('INSERT INTO dbo.RecruiterWorkspaces (UserId, StateJson) OUTPUT INSERTED.Revision AS version VALUES (@UserId, @StateJson);')
          : await request.query('UPDATE dbo.RecruiterWorkspaces SET StateJson = @StateJson, Revision = Revision + 1, UpdatedAt = SYSUTCDATETIME() OUTPUT INSERTED.Revision AS version WHERE UserId = @UserId AND Revision = @Revision;');
        if (!result.recordset[0]) throw new HttpError(409, 'סביבת העבודה השתנתה בלשונית אחרת. רענני את הדף לפני שמירה נוספת.');
        return { version: result.recordset[0].version };
      } catch (error) {
        if ([2601, 2627].includes(error.number) || [2601, 2627].includes(error.originalError?.info?.number)) throw new HttpError(409, 'סביבת העבודה השתנתה בלשונית אחרת. רענני את הדף לפני שמירה נוספת.');
        throw error;
      }
    },
  };
}
