import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowLeft, Asterisk, Eye, EyeOff, LoaderCircle, ShieldCheck, Users } from 'lucide-react';
import { api, ApiError, demoMode, type ApiUser } from './services/api';

const demoRecruiters: ApiUser[] = [
  { id: 'preview-michal', displayName: 'מיכל לוי', email: 'michal@example.com', role: 'admin' },
  { id: 'preview-yael', displayName: 'יעל כהן', email: 'yael@example.com', role: 'recruiter' },
];

export default function AuthGate({ children }: { children: (user: ApiUser, logout: () => Promise<void>) => ReactNode }) {
  const [user, setUser] = useState<ApiUser | null>(null);
  const [loading, setLoading] = useState(!demoMode);
  const [submitting, setSubmitting] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [register, setRegister] = useState(false);
  const [registrationEnabled, setRegistrationEnabled] = useState(demoMode);
  const [error, setError] = useState('');
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    if (demoMode) return;
    let active = true;
    Promise.all([
      api<{ registrationEnabled: boolean }>('/auth/config'),
      api<{ user: ApiUser }>('/auth/me').catch(error => { if (error instanceof ApiError && error.status === 401) return null; throw error; }),
    ]).then(([config, result]) => { if (active) { setRegistrationEnabled(config.registrationEnabled); setUser(result?.user || null); } })
      .catch(error => { if (active) setError(error.message); }).finally(() => { if (active) setLoading(false); });
    function unauthorised() { setUser(null); setExpired(true); setPassword(''); }
    window.addEventListener('talent:unauthorized', unauthorised);
    return () => { active = false; window.removeEventListener('talent:unauthorized', unauthorised); };
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    if (demoMode) { setError('זו תצוגת ממשק בלבד. הרשמה אמיתית זמינה לאחר הפעלת שרת Node ו־SQL Server.'); return; }
    setSubmitting(true);
    try {
      const result = await api<{ user: ApiUser }>(register ? '/auth/register' : '/auth/login', 'POST', { email, password, ...(register ? { displayName: name } : {}) });
      setPassword(''); setUser(result.user); setExpired(false);
    } catch (error) { setError(error instanceof Error ? error.message : 'הכניסה לא הושלמה.'); }
    finally { setSubmitting(false); }
  }
  async function logout() {
    if (!demoMode) await api('/auth/logout', 'POST');
    setUser(null); setEmail(''); setPassword(''); setError(''); setExpired(false);
  }

  if (loading) return <div className="auth-loading"><LoaderCircle className="spin" size={30} /><p>בודקת את ההתחברות שלך...</p></div>;
  if (user) return children(user, logout);
  return <main className="login-screen"><div className="login-art"><div className="brand brand-light" dir="ltr"><span className="brand-mark"><Asterisk strokeWidth={3} /></span><span>talent<span className="brand-dot">.</span></span></div><div className="login-art-text"><span className="eyebrow">פחות חיפוש. יותר התאמה.</span><h1>הטאלנט הבא שלך<br />מתחיל כאן<span>.</span></h1><p>כל המועמדים, כל הדרישות, וכל מה שצריך<br />כדי למצוא את החיבור הנכון.</p><div className="login-orbit"><Users size={62} /><span /><i /></div></div><small>talent. — האנשים הנכונים, במקום הנכון</small></div><div className="login-form-wrap"><form className="login-form" onSubmit={submit}><span className="pill"><span className="status-dot" />{demoMode ? 'תצוגת חשבונות לדוגמה' : 'כניסה למגייסות'}</span><h2>{register ? 'נעים להכיר אותך.' : 'טוב לראות אותך.'}</h2><p>{register ? 'פותחים חשבון אישי ומתחילים לגייס.' : 'נכנסים לחשבון האישי, וממשיכים להתאמה הבאה.'}</p>
    {expired && <div className="auth-info" role="status">ההתחברות הסתיימה. היכנסי שוב לחשבון שלך.</div>}
    {error && <div className="error-banner" role="alert">{error}</div>}
    {demoMode && !register ? <div className="preview-accounts"><p>בחרי חשבון כדי לראות את הממשק:</p>{demoRecruiters.map(recruiter => <button key={recruiter.id} type="button" className="preview-account" onClick={() => setUser(recruiter)}><span className="avatar">{recruiter.displayName[0]}</span><span><strong>{recruiter.displayName}</strong><small>{recruiter.role === 'admin' ? 'מנהלת מערכת' : 'מגייסת'}</small></span><ArrowLeft size={17} /></button>)}<button className="text-button preview-registration" type="button" onClick={() => setRegister(true)}>לצפייה במסך ההרשמה</button><div className="login-disclaimer"><ShieldCheck size={18} /><span>אלו חשבונות פיקטיביים לתצוגה. ההתחברות האמיתית זמינה בפרויקט עם שרת Node ו־SQL Server.</span></div></div> : <>
    {register && <label>שם מלא<input type="text" autoComplete="name" required minLength={2} maxLength={100} value={name} onChange={event => setName(event.target.value)} disabled={submitting} /></label>}
    <label>כתובת אימייל<input type="email" dir="ltr" name="email" placeholder="you@company.com" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} autoComplete="username" disabled={submitting} /></label>
    <label>סיסמה<div className="password-input"><input type={showPassword ? 'text' : 'password'} dir="ltr" name="password" placeholder={register ? 'לפחות 12 תווים' : 'הסיסמה שלך'} minLength={register ? 12 : 1} maxLength={128} required value={password} onChange={event => setPassword(event.target.value)} autoComplete={register ? 'new-password' : 'current-password'} disabled={submitting} /><button type="button" aria-label={showPassword ? 'הסתרת הסיסמה' : 'הצגת הסיסמה'} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></label>
    <button className="primary-button" type="submit" disabled={submitting}>{submitting ? <LoaderCircle className="spin" size={17} /> : <ArrowLeft size={17} />}{submitting ? 'רק רגע...' : register ? 'יצירת החשבון שלי' : 'כניסה לחשבון שלי'}</button>
    {registrationEnabled ? <button className="text-button" type="button" onClick={() => { setRegister(value => !value); setError(''); setPassword(''); }}>{register ? 'כבר יש לך חשבון? כניסה למערכת' : 'חדשה כאן? יצירת חשבון אישי'}</button> : <p className="account-help">לפתיחת חשבון או לעזרה בכניסה, פני למנהלת המערכת.</p>}
    <div className="login-disclaimer"><ShieldCheck size={18} /><span>חשבון אישי לכל מגייסת. בכניסה מוצלחת תועברי לסביבת העבודה שלך.</span></div></>}
  </form></div></main>;
}
