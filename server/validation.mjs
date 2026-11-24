export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function credentials(body) {
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = body?.password;
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || typeof password !== 'string' || password.length < 1 || password.length > 128) throw new HttpError(400, 'בדקי את כתובת האימייל והסיסמה.');
  return { email, password };
}

export function newUser(body) {
  const values = credentials(body);
  const displayName = typeof body?.displayName === 'string' ? body.displayName.trim() : '';
  if (displayName.length < 2 || displayName.length > 100) throw new HttpError(400, 'השם המלא צריך להכיל בין 2 ל־100 תווים.');
  if (values.password.length < 12) throw new HttpError(400, 'בחרי סיסמה של לפחות 12 תווים.');
  return { ...values, displayName };
}
