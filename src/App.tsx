import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowDownToLine, ArrowLeft, ArrowUpLeft, Asterisk, Bookmark, Check, CheckCheck, CheckCircle2, ChevronDown, ChevronLeft, CircleHelp, Clock3, FileSpreadsheet, FileUp, FolderOpen, History, LayoutGrid, LoaderCircle, LogOut, MapPin, Menu, MessageSquareText, Plus, Search, Send, ShieldCheck, SlidersHorizontal, Sparkles, Trash2, Upload, Users, X } from 'lucide-react';
import Papa from 'papaparse';
import { autoMap, defaultJob, initialMatches, mappingFields, sampleCandidates, type Candidate, type Match } from './data';
import { findMatches } from './services/matching';
import AuthGate from './AuthGate';
import AdminUsers from './AdminUsers';
import { api, demoMode, type ApiUser } from './services/api';

type Page = 'search' | 'database' | 'saved' | 'history';
type SearchRun = { id: number; description: string; matches: Match[]; time: string };
type ImportData = { name: string; headers: string[]; rows: string[][] };
const pageLabels: Record<Page, string> = { search: 'חיפוש התאמה', database: 'מאגר המועמדים', saved: 'מועמדים שמורים', history: 'היסטוריית חיפושים' };

function Logo({ light = false }: { light?: boolean }) {
  return <div className={`brand ${light ? 'brand-light' : ''}`} dir="ltr"><span className="brand-mark"><Asterisk strokeWidth={3} /></span><span>talent<span className="brand-dot">.</span></span></div>;
}

function Modal({ title, subtitle, children, close, wide = false }: { title: string; subtitle?: string; children: ReactNode; close: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    dialog?.showModal();
    return () => { dialog?.close(); previous?.focus(); };
  }, []);
  return <dialog ref={ref} className={`modal ${wide ? 'modal-wide' : ''}`} onCancel={close} onClick={event => { if (event.target === ref.current) close(); }}><div className="modal-head"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="icon-button" aria-label="סגירה" onClick={close}><X size={20} /></button></div>{children}</dialog>;
}

function CandidateCard({ match, index, saved, onSave, onOpen }: { match: Match; index: number; saved: boolean; onSave: () => void; onOpen: () => void }) {
  const candidate = match.candidate;
  return <article className={`candidate-card candidate-${index % 3}`}>
    <div className="candidate-top"><span className="match-rank">{index === 0 ? <><Sparkles size={13} /> ההתאמה המובילה</> : `התאמה #${index + 1}`}</span><button className={`save-button ${saved ? 'is-saved' : ''}`} onClick={onSave} aria-label={saved ? `הסרת ${candidate.name} מהשמורים` : `שמירת ${candidate.name}`} aria-pressed={saved}><Bookmark size={18} fill={saved ? 'currentColor' : 'none'} /></button></div>
    <div className="candidate-person"><div className="avatar candidate-avatar">{candidate.name.split(' ').map(word => word[0]).slice(0, 2).join('')}</div><div className="person-name"><h3>{candidate.name}</h3><p dir="auto">{candidate.role || 'תפקיד לא צוין'}</p></div><div className="score"><strong>{match.score}<small>%</small></strong><span>ציון הדגמה</span></div></div>
    <div className="candidate-meta"><span><MapPin size={13} />{candidate.location || 'מיקום לא צוין'}</span><span className="meta-dot">·</span><span>{candidate.experience ? `${candidate.experience} שנות ניסיון` : 'ניסיון לא צוין'}</span></div>
    <div className="tags" dir="ltr">{candidate.skills.slice(0, 4).map(skill => <span className={match.matched.includes(skill) ? 'tag tag-match' : 'tag'} key={skill}>{skill}</span>)}</div>
    <div className="match-note"><CheckCircle2 size={15} /><span>{match.matched.length ? `נמצאה חפיפה ב־${match.matched.length} מיומנויות מהתיאור` : 'כדאי לבדוק את הניסיון מול דרישות המשרה'}</span></div>
    <button className="profile-link" onClick={onOpen}>לפרופיל המלא <ArrowLeft size={15} /></button>
  </article>;
}

type WorkspaceState = { candidates: Candidate[]; source: { name: string; demo: boolean }; savedIds: string[]; runs: SearchRun[]; description: string; matches: Match[] };

export default function App() {
  return <AuthGate>{(user, logout) => <Workspace key={user.id} user={user} onLogout={logout} />}</AuthGate>;
}

function Workspace({ user, onLogout }: { user: ApiUser; onLogout: () => Promise<void> }) {
  const [page, setPage] = useState<Page>('search');
  const [candidates, setCandidates] = useState<Candidate[]>(demoMode ? sampleCandidates : []);
  const [source, setSource] = useState({ name: demoMode ? 'מאגר_מועמדים_לדוגמה.xlsx' : 'עדיין לא הועלה מאגר', demo: demoMode });
  const [description, setDescription] = useState(demoMode ? defaultJob : '');
  const [resultCount, setResultCount] = useState(3);
  const [matches, setMatches] = useState<Match[]>(demoMode ? initialMatches : []);
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [runs, setRuns] = useState<SearchRun[]>([]);
  const [query, setQuery] = useState('');
  const [detail, setDetail] = useState<Match | null>(null);
  const [help, setHelp] = useState(false);
  const [importData, setImportData] = useState<ImportData | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');
  const [mobileNav, setMobileNav] = useState(false);
  const displayName = user.displayName;
  const [ready, setReady] = useState(demoMode);
  const [loadingWorkspace, setLoadingWorkspace] = useState(!demoMode);
  const [workspaceVersion, setWorkspaceVersion] = useState(0);
  const [persisted, setPersisted] = useState('');
  const [saving, setSaving] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [adminPanel, setAdminPanel] = useState(false);
  const savingRef = useRef<Promise<boolean> | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const resultsRef = useRef<HTMLElement>(null);
  useEffect(() => { if (toast) { const timer = setTimeout(() => setToast(''), 3500); return () => clearTimeout(timer); } }, [toast]);

  const snapshot = JSON.stringify({ candidates, source, savedIds, runs, description, matches });
  const dirty = !demoMode && ready && snapshot !== persisted;

  useEffect(() => {
    if (demoMode) return;
    let active = true;
    api<{ state: WorkspaceState | null; version: number }>('/workspace').then(result => {
      if (!active) return;
      const state = result.state || { candidates: [], source: { name: 'עדיין לא הועלה מאגר', demo: false }, savedIds: [], runs: [], description: '', matches: [] };
      setCandidates(state.candidates); setSource(state.source); setSavedIds(state.savedIds); setRuns(state.runs); setDescription(state.description); setMatches(state.matches);
      setWorkspaceVersion(result.version); setPersisted(JSON.stringify({ candidates: state.candidates, source: state.source, savedIds: state.savedIds, runs: state.runs, description: state.description, matches: state.matches })); setReady(true);
    }).catch(error => { if (active) setError(error.message); }).finally(() => { if (active) setLoadingWorkspace(false); });
    return () => { active = false; };
  }, [user.id]);
  useEffect(() => {
    if (!dirty) return;
    function warn(event: BeforeUnloadEvent) { event.preventDefault(); event.returnValue = ''; }
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  async function saveWorkspace(): Promise<boolean> {
    if (demoMode) { setToast('בתצוגת ההדגמה השינויים נשמרים עד ליציאה בלבד'); return true; }
    if (!ready) return false;
    if (!dirty) return true;
    if (savingRef.current) return savingRef.current;
    setSaving(true); setError('');
    const task = (async () => {
      try {
        const result = await api<{ version: number }>('/workspace', 'PUT', { version: workspaceVersion, state: JSON.parse(snapshot) });
        setWorkspaceVersion(result.version); setPersisted(snapshot); setToast('סביבת העבודה נשמרה בחשבון שלך'); return true;
      } catch (error) { setError(error instanceof Error ? error.message : 'השמירה לא הושלמה.'); return false; }
      finally { setSaving(false); savingRef.current = null; }
    })();
    savingRef.current = task;
    return task;
  }
  async function logout() {
    if (loggingOut || saving || busy || reading) return;
    setLoggingOut(true);
    try { if (dirty && !await saveWorkspace()) return; await onLogout(); }
    catch (error) { setError(error instanceof Error ? error.message : 'היציאה לא הושלמה. נסי שוב.'); }
    finally { setLoggingOut(false); }
  }

  function navigate(next: Page) { setPage(next); setQuery(''); setMobileNav(false); }
  function toggleSaved(id: string) {
    const exists = savedIds.includes(id);
    setSavedIds(ids => exists ? ids.filter(item => item !== id) : [...ids, id]);
    setToast(exists ? 'המועמד הוסר מהרשימה השמורה' : 'המועמד נוסף לרשימה השמורה');
  }
  function newSearch() { navigate('search'); setDescription(''); setMatches([]); setError(''); setTimeout(() => composer.current?.focus(), 0); }
  async function search(event?: FormEvent) {
    event?.preventDefault();
    if (busy) return;
    if (description.trim().length < 12) { setError('כדי למצוא התאמות, כתבי תיאור של לפחות 12 תווים.'); return; }
    if (!candidates.length) { setError('צריך לטעון מאגר מועמדים לפני החיפוש.'); return; }
    setError(''); setBusy(true);
    try {
      const result = await findMatches(candidates, description.trim(), resultCount);
      setMatches(result);
      setRuns(history => [{ id: Date.now(), description: description.trim(), matches: result, time: new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }) }, ...history].slice(0, 30));
      setToast('הדגמת ההתאמות מוכנה לצפייה');
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    } catch { setError('לא הצלחנו להשלים את החיפוש. אפשר לנסות שוב.'); }
    finally { setBusy(false); }
  }

  async function readFile(file?: File) {
    if (!file) return;
    setError('');
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (!['xlsx', 'csv'].includes(extension || '')) { setError('אפשר להעלות קובץ XLSX או CSV. קובץ XLS יש לשמור קודם כ־XLSX.'); return; }
    if (file.size > 5 * 1024 * 1024) { setError('הקובץ גדול מדי. בגרסת ההדגמה אפשר לטעון עד 5MB.'); return; }
    setReading(true);
    try {
      let rows: unknown[][];
      if (extension === 'csv') {
        const parsed = Papa.parse<string[]>(await file.text(), { skipEmptyLines: 'greedy' });
        if (parsed.errors.length) throw new Error('לא הצלחנו לקרוא את ה־CSV. בדקי שהשורות והמירכאות בקובץ תקינות.');
        rows = parsed.data;
      } else {
        const { default: readXlsxFile } = await import('read-excel-file');
        rows = await readXlsxFile(file);
      }
      const nonempty = rows.filter(row => row.some(value => value !== null && value !== undefined && String(value).trim()));
      if (nonempty.length < 2) throw new Error('צריך לפחות שורת כותרות ושורת מועמד אחת בקובץ.');
      if (nonempty.length > 5001 || nonempty[0].length > 100) throw new Error('גרסת ההדגמה תומכת בעד 5,000 מועמדים ו־100 עמודות.');
      const headers = nonempty[0].map(value => String(value ?? '').trim());
      if (headers.some(header => !header) || new Set(headers).size !== headers.length) throw new Error('לכל עמודה צריכה להיות כותרת מלאה וייחודית בשורה הראשונה.');
      setMapping(autoMap(headers));
      setImportData({ name: file.name, headers, rows: nonempty.slice(1).map(row => headers.map((_, index) => String(row[index] ?? '').trim())) });
    } catch (error) { setError(error instanceof Error ? error.message : 'הקובץ לא נקרא. בדקי שהוא קובץ אקסל תקין ולא מוגן בסיסמה.'); }
    finally { setReading(false); if (fileInput.current) fileInput.current.value = ''; }
  }

  function confirmImport() {
    if (!importData) return;
    if (Number(mapping.name) < 0) { setError('צריך לבחור עמודת שם מלא.'); return; }
    const selected = Object.values(mapping).filter(value => Number(value) >= 0);
    if (new Set(selected).size !== selected.length) { setError('כל עמודה בקובץ יכולה להיות משויכת לשדה אחד בלבד.'); return; }
    if (['role', 'skills', 'bio'].every(key => Number(mapping[key]) < 0)) { setError('בחרי לפחות שדה מקצועי אחד: תפקיד, מיומנויות או תקציר.'); return; }
    const get = (row: string[], key: string) => Number(mapping[key]) >= 0 ? row[Number(mapping[key])] || '' : '';
    const imported = importData.rows.filter(row => get(row, 'name')).map((row, index): Candidate => ({
      id: `import-${Date.now()}-${index}`, name: get(row, 'name'), role: get(row, 'role'), experience: get(row, 'experience'), location: get(row, 'location'), skills: get(row, 'skills').split(/[,;|\n]+/).map(skill => skill.trim()).filter(Boolean), bio: get(row, 'bio'), education: get(row, 'education'), email: get(row, 'email'),
    }));
    if (!imported.length) { setError('לא נמצאו שורות עם שם מלא בעמודה שנבחרה.'); return; }
    const skipped = importData.rows.length - imported.length;
    setCandidates(imported); setSource({ name: importData.name, demo: false }); setSavedIds([]); setMatches([]); setRuns([]); setImportData(null); setError('');
    setToast(`נטענו ${imported.length} מועמדים${skipped ? `; ${skipped} שורות ללא שם דולגו` : ''}`);
  }

  function exportCsv() {
    const selected = candidates.filter(candidate => savedIds.includes(candidate.id));
    const protect = (value: string) => /^[\s]*[=+@-]/.test(value) ? `'${value}` : value;
    const csv = Papa.unparse({ fields: ['שם מלא', 'תפקיד', 'שנות ניסיון', 'עיר', 'מיומנויות', 'אימייל'], data: selected.map(candidate => [candidate.name, candidate.role, candidate.experience, candidate.location, candidate.skills.join(', '), candidate.email].map(protect)) });
    const url = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a'); link.href = url; link.download = 'talent-shortlist.csv'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    setToast('הרשימה יוצאה לקובץ CSV');
  }

  if (loadingWorkspace) return <div className="auth-loading"><LoaderCircle className="spin" size={30} /><p>טוענת את סביבת העבודה של {displayName}...</p></div>;
  if (!ready) return <div className="auth-loading"><ShieldCheck size={30} /><p role="alert">{error || 'סביבת העבודה אינה זמינה.'}</p><button className="secondary-button" onClick={() => window.location.reload()}>ניסיון נוסף</button><button className="text-button" onClick={() => void onLogout()}>יציאה מהחשבון</button></div>;

  const filtered = candidates.filter(candidate => (page !== 'saved' || savedIds.includes(candidate.id)) && [candidate.name, candidate.role, candidate.skills.join(' '), candidate.location].join(' ').toLowerCase().includes(query.toLowerCase()));
  return <div className="app-shell">
    {mobileNav && <div className="sidebar-backdrop" onClick={() => setMobileNav(false)} />}
    <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}><Logo /><div className="workspace-label"><span className="workspace-icon">M</span><div><strong>{displayName}</strong><span>{user.role === 'admin' ? 'מנהלת מערכת' : 'מגייסת'} · {demoMode ? 'תצוגה בלבד' : 'חשבון אישי'}</span></div><ChevronDown size={15} /></div><button className="new-search" onClick={newSearch}><Plus size={18} />חיפוש חדש</button><div className="nav-caption">סביבת עבודה</div><nav aria-label="ניווט ראשי">{([{ key: 'search', icon: Sparkles }, { key: 'database', icon: Users }, { key: 'saved', icon: Bookmark }, { key: 'history', icon: History }] as const).map(({ key, icon: Icon }) => <button key={key} onClick={() => navigate(key)} className={page === key ? 'nav-item active' : 'nav-item'} aria-current={page === key ? 'page' : undefined}><Icon size={18} /><span>{pageLabels[key]}</span>{key === 'database' && <small>{candidates.length}</small>}{key === 'saved' && savedIds.length > 0 && <small>{savedIds.length}</small>}</button>)}</nav><div className="sidebar-bottom">{user.role === 'admin' && <button className="sidebar-help admin-nav" onClick={() => { setAdminPanel(true); setMobileNav(false); }}><Users size={17} />ניהול מגייסות<ArrowUpLeft size={14} /></button>}<div className="sidebar-tip"><span className="tip-icon"><Sparkles size={18} /></span><h4>ההתאמה מתחילה בפרטים</h4><p>תיאור משרה מדויק יעזור למצוא<br />אנשים שמתאימים באמת.</p><button onClick={() => setHelp(true)}>כמה טיפים לפני שמתחילים <ArrowUpLeft size={14} /></button></div><button className="sidebar-help" onClick={() => setHelp(true)}><CircleHelp size={17} />עזרה והדרכה<ArrowUpLeft size={14} /></button><div className="sidebar-footer"><span>talent. workspace</span><span>{demoMode ? 'UI Preview' : 'Personal account'} · v1.1</span></div></div></aside>

    <div className="workspace"><header className="topbar"><div className="breadcrumbs"><button className="mobile-menu icon-button" aria-label="פתיחת תפריט" onClick={() => setMobileNav(true)}><Menu size={21} /></button><LayoutGrid size={16} /><span>סביבת העבודה</span><ChevronLeft size={13} /><strong>{pageLabels[page]}</strong></div><div className="topbar-actions"><span className="demo-label"><span />{demoMode ? 'תצוגת ממשק' : 'חשבון אישי'}</span>{!demoMode && <button className="workspace-save" onClick={() => void saveWorkspace()} disabled={saving || !dirty || busy || reading}>{saving ? <LoaderCircle className="spin" size={14} /> : <Check size={14} />}{saving ? 'שומרת...' : dirty ? 'שמירת השינויים' : 'הכול נשמר'}</button>}<span className="topbar-divider" /><button className="icon-button help-top" aria-label="עזרה" onClick={() => setHelp(true)}><CircleHelp size={19} /></button><button className="user-menu" title="יציאה למסך הכניסה" onClick={() => void logout()} disabled={loggingOut || saving || busy || reading}><span className="avatar user-avatar">{displayName.slice(0, 1)}</span><span className="user-text">{displayName}<small>צוות הגיוס</small></span><LogOut size={15} /></button></div></header>

    <main className="main-content">{adminPanel ? <AdminUsers close={() => setAdminPanel(false)} /> : <>
      <div className="page-heading"><div><div className="eyebrow"><span />סביבת הגיוס שלך, קצת יותר חכמה</div><h1>{page === 'search' ? <>האנשים הנכונים. <span>במקום הנכון.</span></> : pageLabels[page]}</h1><p>{page === 'search' ? 'מעלים את המאגר, מתארים את המשרה — ומגלים מי יכול להתאים.' : page === 'database' ? 'כל המועמדים שלך, עם המידע שצריך כדי להכיר אותם.' : page === 'saved' ? 'האנשים שסימנת ושווה לחזור אליהם. הרשימה האישית שלך.' : 'חוזרים לחיפושים שביצעת בסביבת העבודה האישית שלך.'}</p></div><div className="heading-decoration" aria-hidden="true"><span /><Asterisk size={44} strokeWidth={1.5} /><i /></div></div>
      {error && <div className="error-banner" role="alert">{error}<button aria-label="סגירת הודעה" onClick={() => setError('')}><X size={16} /></button></div>}

      {page === 'search' && <>
        <div className="workflow-grid"><section className="panel upload-panel"><div className="panel-heading"><span className="step-number">01</span><div><h2>מתחילים במועמדים</h2><p>המאגר שלך. ההזדמנות הבאה שלהם.</p></div><span className="panel-corner"><FileSpreadsheet size={18} /></span></div><div className={`dropzone ${dragging ? 'dragging' : ''}`} onDragOver={event => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); if (!reading && !busy) void readFile(event.dataTransfer.files[0]); }}><div className="file-art" aria-hidden="true"><span className="file-back" /><span className="file-front"><FileSpreadsheet size={30} strokeWidth={1.5} /><i /></span><span className="file-plus"><Plus size={13} /></span></div><h3>מקום אחד לכל הטאלנטים</h3><p>גררי לכאן קובץ אקסל עם פרטי המועמדים</p><button className="upload-button" onClick={() => fileInput.current?.click()} disabled={reading || busy}>{reading ? <LoaderCircle className="spin" size={16} /> : <Upload size={16} />}{reading ? 'קוראת את הקובץ...' : 'בחירת קובץ מהמחשב'}</button><span className="file-hint">XLSX או CSV <span>·</span> עד 5MB</span></div><div className="loaded-file"><div className="excel-icon"><FileSpreadsheet size={21} /></div><div className="loaded-file-info"><strong dir="auto">{source.name}</strong><span>{candidates.length} מועמדים {source.demo ? 'פיקטיביים' : 'נטענו'} <span>·</span> {source.demo ? 'קובץ לדוגמה' : demoMode ? 'נטען בדפדפן בלבד' : 'במאגר האישי שלך'}</span></div><CheckCircle2 size={17} className="green" /></div><div className="local-note"><ShieldCheck size={13} />{demoMode ? 'הקובץ נשאר בדפדפן בהדגמה הזאת' : 'לחצי שמירת שינויים כדי לשמור במאגר האישי'}</div></section>

        <section className="panel job-panel"><div className="panel-heading"><span className="step-number">02</span><div><h2>את מי מחפשים היום?</h2><p>כתבי את המשרה במילים שלך. אנחנו איתך.</p></div><span className="panel-corner"><MessageSquareText size={18} /></span></div><div className="assistant-intro"><span className="assistant-icon"><Asterisk size={19} /></span><p>ספרי לי על התפקיד, על הניסיון הדרוש ועל<br className="desktop-break" />הכישורים שחשובים לך במועמד או במועמדת.</p><span className="assistant-sparkle">✦</span></div><form onSubmit={search} className="job-form"><div className="composer"><textarea ref={composer} aria-label="תיאור המשרה" value={description} onChange={event => setDescription(event.target.value)} placeholder="למשל: מחפשת מפתחת Full Stack עם ניסיון ב־React וב־Node.js..." maxLength={6000} disabled={busy} /><div className="composer-footer"><span><span className="composer-dot" />אפשר לכתוב בעברית ובאנגלית</span><span>{description.length}/6,000</span></div></div><div className="job-suggestions"><span>אפשר להתחיל עם</span>{[{ label: 'פיתוח Full Stack', text: defaultJob }, { label: 'ניהול פרויקטים', text: 'דרוש מנהל פרויקטים טכנולוגיים עם ניסיון בניהול צוותים, עבודה ב־Agile וב־Jira, תכנון לוחות זמנים ועבודה מול לקוחות.' }].map(item => <button type="button" key={item.label} onClick={() => { setDescription(item.text); composer.current?.focus(); }} disabled={busy}>{item.label}<ArrowUpLeft size={12} /></button>)}</div><div className="search-controls"><label className="result-select"><SlidersHorizontal size={15} /><select aria-label="מספר התאמות להצגה" value={resultCount} onChange={event => setResultCount(Number(event.target.value))} disabled={busy}><option value={3}>3 התאמות מובילות</option><option value={2}>2 התאמות מובילות</option></select><ChevronDown size={12} /></label><button className="primary-button search-button" type="submit" disabled={busy || reading}>{busy ? <LoaderCircle className="spin" size={17} /> : <Sparkles size={17} />}{busy ? 'מוצאת התאמות...' : 'מציאת ההתאמות שלי'}<ArrowLeft size={16} /></button></div></form></section></div>

        <section className="results-section" ref={resultsRef} aria-live="polite"><div className="section-heading"><div><h2>נעים להכיר, ההתאמות שלך<span className="count-badge">{matches.length}</span></h2><p>{source.demo ? 'טעימה מהאפשרויות במאגר שלך. כל הפרטים כאן פיקטיביים.' : 'תוצאות הדגמה לפי חפיפת מילות מפתח בתיאור ובמאגר.'}</p></div><button className="text-button database-link" onClick={() => navigate('database')}>לכל המועמדים <ArrowLeft size={15} /></button></div>{busy ? <div className="loading-results"><LoaderCircle size={25} className="spin" /><h3>בודקים את המילים, מחברים את הנקודות</h3><p>מריצים הדגמת התאמה מקומית על המאגר שלך</p></div> : matches.length ? <div className="candidate-grid">{matches.map((match, index) => <CandidateCard key={match.candidate.id} match={match} index={index} saved={savedIds.includes(match.candidate.id)} onSave={() => toggleSaved(match.candidate.id)} onOpen={() => setDetail(match)} />)}</div> : <div className="empty-results"><Search size={26} /><h3>ההתאמה הבאה מתחילה בתיאור שלך</h3><p>הוסיפי כמה מילים על המשרה ולחצי על מציאת ההתאמות.</p></div>}</section><div className="prototype-note"><Sparkles size={14} /><span>ממשק לדוגמה · הציונים אינם הערכת AI. חיבור ל־Gemini יתווסף בשלב הבא.</span><span className="note-separator">|</span><span>ההחלטה תמיד בידיים שלך</span></div>
      </>}

      {(page === 'database' || page === 'saved') && <section className="panel database-panel"><div className="database-toolbar"><label className="search-input"><Search size={17} /><input aria-label="חיפוש מועמדים" placeholder="חיפוש לפי שם, תפקיד או מיומנות..." value={query} onChange={event => setQuery(event.target.value)} /></label><div className="database-actions"><span>{filtered.length} מועמדים</span>{page === 'database' ? <button className="primary-button small" onClick={() => fileInput.current?.click()} disabled={reading}><FileUp size={16} />{reading ? 'קוראת קובץ...' : 'העלאת מאגר'}</button> : <button className="secondary-button small" onClick={exportCsv} disabled={!savedIds.length}><ArrowDownToLine size={16} />ייצוא הרשימה</button>}</div></div>{filtered.length ? <div className="table-scroll"><table><thead><tr><th>מועמד / ת</th><th>תפקיד</th><th>מיומנויות</th><th>מיקום</th><th><span className="sr-only">פעולות</span></th></tr></thead><tbody>{filtered.map(candidate => <tr key={candidate.id}><td><button className="table-person" onClick={() => setDetail({ candidate, score: 0, matched: [], missing: [] })}><span className="avatar">{candidate.name[0]}</span><strong>{candidate.name}</strong></button></td><td dir="auto">{candidate.role || 'לא צוין'}</td><td><div className="tags" dir="ltr">{candidate.skills.slice(0, 3).map(skill => <span key={skill} className="tag">{skill}</span>)}</div></td><td>{candidate.location || 'לא צוין'}</td><td><button className={`save-button ${savedIds.includes(candidate.id) ? 'is-saved' : ''}`} aria-label={savedIds.includes(candidate.id) ? `הסרת ${candidate.name} מהשמורים` : `שמירת ${candidate.name}`} aria-pressed={savedIds.includes(candidate.id)} onClick={() => toggleSaved(candidate.id)}><Bookmark size={18} fill={savedIds.includes(candidate.id) ? 'currentColor' : 'none'} /></button></td></tr>)}</tbody></table></div> : <div className="empty-results"><Bookmark size={30} /><h3>{query ? 'לא נמצאו מועמדים לחיפוש הזה' : 'הרשימה הקצרה שלך מתחילה כאן'}</h3><p>{query ? 'נסי לחפש שם, תפקיד או מיומנות אחרת.' : 'לחצי על סימנית בכרטיס מועמד כדי לשמור אותו כאן.'}</p><button className="secondary-button" onClick={() => navigate('search')}>לחיפוש התאמות<ArrowLeft size={15} /></button></div>}</section>}

      {page === 'history' && <section className="panel history-panel">{runs.length ? <><div className="database-toolbar"><h2>{runs.length} חיפושים בסשן הנוכחי</h2><button className="text-button" onClick={() => { setRuns([]); setToast('היסטוריית ההדגמה נוקתה'); }}><Trash2 size={15} />ניקוי היסטוריה</button></div>{runs.map(run => <button className="history-row" key={run.id} onClick={() => { setDescription(run.description); setMatches(run.matches); navigate('search'); }}><span className="history-icon"><History size={20} /></span><div><strong>{run.description}</strong><span>{run.matches.length} התאמות · היום, {run.time}</span></div><ArrowLeft size={18} /></button>)}</> : <div className="empty-results"><Clock3 size={30} /><h3>כל חיפוש פותח אפשרות חדשה</h3><p>החיפושים שתבצעי יופיעו כאן. אפשר לשמור עד 30 חיפושים בחשבון.</p><button className="secondary-button" onClick={() => navigate('search')}>לחיפוש הראשון<ArrowLeft size={15} /></button></div>}</section>}
      </>}<footer className="page-footer"><span dir="ltr">Good people. Great possibilities.</span><span>נבנה סביב האנשים שלך <span className="footer-asterisk">✦</span></span></footer>
    </main></div>
    <input ref={fileInput} type="file" accept=".xlsx,.csv" className="sr-only" aria-label="העלאת קובץ מועמדים" onChange={event => void readFile(event.target.files?.[0])} />
    {toast && <div className="toast" role="status"><CheckCheck size={18} />{toast}<button className="icon-button" aria-label="סגירת הודעה" onClick={() => setToast('')}><X size={15} /></button></div>}

    {detail && <Modal title="נעים להכיר" subtitle="כל המידע הרלוונטי, במקום אחד" close={() => setDetail(null)}><div className="detail-person"><span className="avatar detail-avatar">{detail.candidate.name[0]}</span><div><h2>{detail.candidate.name}</h2><p dir="auto">{detail.candidate.role || 'תפקיד לא צוין'}</p></div><button className={`save-button ${savedIds.includes(detail.candidate.id) ? 'is-saved' : ''}`} aria-label="שמירה או הסרה מהשמורים" onClick={() => toggleSaved(detail.candidate.id)}><Bookmark size={22} fill={savedIds.includes(detail.candidate.id) ? 'currentColor' : 'none'} /></button></div><div className="detail-facts"><span><MapPin size={15} />{detail.candidate.location || 'מיקום לא צוין'}</span><span><Clock3 size={15} />{detail.candidate.experience ? `${detail.candidate.experience} שנות ניסיון` : 'ניסיון לא צוין'}</span></div><div className="detail-block"><h3>קצת על הניסיון</h3><p>{detail.candidate.bio || 'לא נוסף תקציר בקובץ המקור.'}</p></div><div className="detail-block"><h3>מיומנויות</h3><div className="tags" dir="ltr">{detail.candidate.skills.length ? detail.candidate.skills.map(skill => <span className="tag tag-match" key={skill}>{skill}</span>) : <p dir="rtl">לא צוינו מיומנויות.</p>}</div></div><div className="detail-block"><h3>השכלה</h3><p>{detail.candidate.education || 'לא צוינה בקובץ המקור.'}</p></div>{!!detail.missing.length && <div className="detail-gap"><h3>מה כדאי לבדוק בשיחה?</h3><p>לא נמצאה התייחסות למיומנויות האלה בפרטים שנטענו:</p><div className="tags" dir="ltr">{detail.missing.map(skill => <span className="tag" key={skill}>{skill}</span>)}</div></div>}{detail.candidate.email && <div className="detail-contact"><span>כתובת אימייל</span><span dir="ltr">{detail.candidate.email}</span></div>}<div className="detail-disclaimer">{source.demo ? 'פרופיל פיקטיבי להמחשת הממשק. ' : ''}המידע מבוסס על המאגר בלבד. ההתאמה מוצגת להדגמה ואינה המלצת גיוס.</div></Modal>}

    {help && <Modal title="כמה צעדים, והדרך קצרה יותר" subtitle="מכירים את סביבת העבודה של Talent" close={() => setHelp(false)}><div className="help-steps"><div><span className="step-number">01</span><section><h3>טוענים מאגר</h3><p>קובץ XLSX או CSV, עם כותרות בשורה הראשונה ומועמד אחד בכל שורה. אחרי הטעינה תוכלי לבחור איזו עמודה מתאימה לכל שדה.</p></section></div><div><span className="step-number">02</span><section><h3>מתארים מה חשוב</h3><p>תפקיד, מיומנויות, סוג הניסיון ודרישות חובה. אפשר לכתוב בעברית ובאנגלית ולבחור שתיים או שלוש התאמות.</p></section></div><div><span className="step-number">03</span><section><h3>מכירים ושומרים</h3><p>פותחים פרופיל, בודקים פערים ושומרים את המועמדים המעניינים לרשימה קצרה שאפשר לייצא.</p></section></div></div><div className="help-note"><ShieldCheck size={21} /><p>{demoMode ? 'זו תצוגת UI עם חשבונות פיקטיביים. השינויים נשמרים בזיכרון הדף בלבד ונמחקים ביציאה או ברענון.' : 'לכל מגייסת חשבון אישי. לחצי על שמירת השינויים כדי לשמור את המאגר, המועמדים והחיפושים ב־SQL Server. השמירה מופרדת לפי המגייסת המחוברת.'} החיפוש עדיין מבוסס על חפיפת מילות מפתח; חיבור ל־Gemini יתווסף בשלב הבא.</p></div><button className="primary-button full-width" onClick={() => setHelp(false)}>בואי נמצא התאמה<ArrowLeft size={16} /></button></Modal>}

    {importData && <Modal title="מחברים את העמודות" subtitle={`${importData.name} · ${importData.rows.length} שורות · נשתמש בגיליון הראשון בקובץ`} close={() => { setImportData(null); setError(''); }} wide><div className="mapping-note"><FileSpreadsheet size={20} /><p>בחרי איזו עמודה בקובץ מתאימה לכל שדה. שדות שלא מופו יישארו ריקים.</p></div>{error && <div className="error-banner" role="alert">{error}</div>}<div className="mapping-grid">{mappingFields.map(field => <label key={field.key}>{field.label}{field.required && <span className="required"> *</span>}<select value={mapping[field.key]} onChange={event => { setMapping(previous => ({ ...previous, [field.key]: event.target.value })); setError(''); }}><option value="-1">לא קיים בקובץ</option>{importData.headers.map((header, index) => <option key={index} value={index.toString()}>{header}</option>)}</select><small>{Number(mapping[field.key]) >= 0 ? `לדוגמה: ${importData.rows[0]?.[Number(mapping[field.key])] || 'שדה ריק'}` : 'לא נבחרה עמודה'}</small></label>)}</div><div className="import-footer"><span><ShieldCheck size={14} />{demoMode ? 'המאגר הנוכחי יוחלף. הקובץ נשאר בדפדפן.' : 'המאגר האישי יוחלף לאחר שמירת השינויים.'}</span><button className="primary-button" onClick={confirmImport}><Check size={17} />טעינת המועמדים</button></div></Modal>}
  </div>;
}
