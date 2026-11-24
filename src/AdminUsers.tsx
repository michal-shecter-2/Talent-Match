import { useEffect, useState, type FormEvent } from 'react';
import { LoaderCircle, Plus, ShieldCheck, Users, X } from 'lucide-react';
import { api, demoMode, type ApiUser } from './services/api';

export default function AdminUsers({ close }: { close: () => void }) {
  const [users, setUsers] = useState<(ApiUser & { isActive?: boolean })[]>([]);
  const [loading, setLoading] = useState(!demoMode);
  const [submitting, setSubmitting] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  useEffect(() => {
    if (demoMode) { setUsers([{ id: 'preview-michal', displayName: 'מיכל לוי', email: 'michal@example.com', role: 'admin', isActive: true }, { id: 'preview-yael', displayName: 'יעל כהן', email: 'yael@example.com', role: 'recruiter', isActive: true }]); return; }
    api<{ users: ApiUser[] }>('/admin/users').then(result => setUsers(result.users)).catch(error => setError(error.message)).finally(() => setLoading(false));
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(''); setSuccess(''); setSubmitting(true);
    try {
      if (demoMode) { setError('יצירת חשבונות אמיתיים זמינה בפרויקט עם שרת Node ו־SQL Server.'); return; }
      const result = await api<{ user: ApiUser }>('/admin/users', 'POST', { displayName, email, password });
      setUsers(previous => [{ ...result.user, isActive: true }, ...previous]); setDisplayName(''); setEmail(''); setPassword(''); setSuccess('החשבון נוצר. המגייסת יכולה להיכנס עם האימייל והסיסמה שהוגדרו.');
    } catch (error) { setError(error instanceof Error ? error.message : 'החשבון לא נוצר.'); }
    finally { setSubmitting(false); }
  }
  return <div className="admin-users"><div className="admin-heading"><div><h2><Users size={20} />ניהול מגייסות</h2><p>חשבון אישי וסביבת עבודה נפרדת לכל מגייסת.</p></div><button className="icon-button" aria-label="חזרה לסביבת העבודה" onClick={close}><X size={20} /></button></div>
    <div className="admin-grid"><section className="panel admin-form-panel"><h3><Plus size={17} />פתיחת חשבון למגייסת</h3><p>פרטי הכניסה יוגדרו על ידי מנהלת המערכת.</p>{error && <div className="error-banner" role="alert">{error}</div>}{success && <div className="auth-info" role="status">{success}</div>}<form onSubmit={submit}><label>שם מלא<input autoComplete="off" required minLength={2} maxLength={100} value={displayName} onChange={event => setDisplayName(event.target.value)} disabled={submitting || demoMode} /></label><label>אימייל<input type="email" dir="ltr" autoComplete="off" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} disabled={submitting || demoMode} /></label><label>סיסמה ראשונית<input type="password" dir="ltr" autoComplete="new-password" required minLength={12} maxLength={128} placeholder="לפחות 12 תווים" value={password} onChange={event => setPassword(event.target.value)} disabled={submitting || demoMode} /></label><button className="primary-button full-width" disabled={submitting || demoMode}>{submitting ? <LoaderCircle size={16} className="spin" /> : <Plus size={16} />}{demoMode ? 'תצוגה בלבד — נדרש שרת' : 'יצירת החשבון'}</button></form><div className="admin-note"><ShieldCheck size={16} />גישה לניהול חשבונות זמינה למנהלת בלבד.</div></section>
    <section className="panel admin-list"><h3>המגייסות בצוות <span className="count-badge">{users.length}</span></h3>{loading ? <div className="empty-results"><LoaderCircle className="spin" size={25} /></div> : users.map(user => <div className="admin-person" key={user.id}><span className="avatar">{user.displayName[0]}</span><div><strong>{user.displayName}</strong><span dir="ltr">{user.email}</span></div><span className="role-badge">{user.role === 'admin' ? 'מנהלת' : 'מגייסת'}</span></div>)}</section></div></div>;
}
