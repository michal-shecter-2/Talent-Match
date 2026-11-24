export type ApiUser = { id: string; email: string; displayName: string; role: 'admin' | 'recruiter' };
export const demoMode = import.meta.env.MODE === 'preview';

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method, credentials: 'same-origin',
      headers: { Accept: 'application/json', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(method !== 'GET' ? { 'X-Talent-Request': '1' } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch { throw new ApiError(0, 'לא ניתן להתחבר לשרת. בדקי שהוא פועל ונסי שוב.'); }
  if (response.status === 204) return undefined as T;
  let payload;
  try { payload = await response.json(); }
  catch { throw new ApiError(response.status || 0, 'השרת אינו זמין כרגע. בדקי את הגדרות החיבור.'); }
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/auth/')) window.dispatchEvent(new Event('talent:unauthorized'));
    throw new ApiError(response.status, typeof payload.error === 'string' ? payload.error : 'הפעולה לא הושלמה.');
  }
  return payload as T;
}
