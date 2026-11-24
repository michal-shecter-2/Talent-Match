export type Candidate = {
  id: string;
  name: string;
  role: string;
  experience: string;
  location: string;
  skills: string[];
  bio: string;
  education: string;
  email: string;
};

export type Match = { candidate: Candidate; score: number; matched: string[]; missing: string[] };

export const sampleCandidates: Candidate[] = [
  { id: 'demo-1', name: 'מיכל לוי', role: 'Full Stack Developer', experience: '5', location: 'תל אביב', skills: ['React', 'Node.js', 'TypeScript', 'SQL', 'REST API'], bio: 'פיתוח מערכות ארגוניות מקצה לקצה, תכנון ממשקי API ועבודה בצוותי מוצר. ניסיון בפיתוח שירותי Node.js וממשקי React.', education: 'תואר ראשון במדעי המחשב', email: 'michal@example.com' },
  { id: 'demo-2', name: 'דניאל כהן', role: 'Full Stack Developer', experience: '4', location: 'רמת גן', skills: ['React', 'Node.js', 'JavaScript', 'MongoDB', 'REST API'], bio: 'פיתוח יישומי Web ושירותי Backend. ניסיון בעבודה בסביבת Agile ובבניית ממשקים רספונסיביים.', education: 'תואר ראשון בהנדסת תוכנה', email: 'daniel@example.com' },
  { id: 'demo-3', name: 'נועה ישראלי', role: 'Frontend Developer', experience: '3', location: 'ירושלים', skills: ['React', 'TypeScript', 'CSS', 'SQL', 'Figma'], bio: 'פיתוח ממשקי משתמש נגישים ומערכות עיצוב. עבודה מול צוותי Backend ואינטגרציה עם ממשקי API.', education: 'הנדסאית תוכנה', email: 'noa@example.com' },
  { id: 'demo-4', name: 'איתי שפירא', role: 'Backend Developer', experience: '6', location: 'חיפה', skills: ['Python', 'Django', 'SQL', 'Docker', 'AWS'], bio: 'פיתוח מערכות נתונים ותשתיות ענן. אחריות על ביצועים, בדיקות ותחזוקת שירותים.', education: 'תואר ראשון במדעי המחשב', email: 'itai@example.com' },
  { id: 'demo-5', name: 'יעל ברק', role: 'Project Manager', experience: '7', location: 'מודיעין', skills: ['Agile', 'Jira', 'Scrum', 'Excel', 'Project Management'], bio: 'ניהול פרויקטים טכנולוגיים, תכנון לוחות זמנים ועבודה מול לקוחות וצוותי פיתוח.', education: 'תואר ראשון בהנדסת תעשייה וניהול', email: 'yael@example.com' },
  { id: 'demo-6', name: 'אורי רוזן', role: 'Customer Success Manager', experience: '3', location: 'פתח תקווה', skills: ['CRM', 'Excel', 'Customer Success', 'Salesforce'], bio: 'שירות לקוחות עסקיים, ליווי תהליכי הטמעה, פתרון בעיות והדרכת משתמשים.', education: 'תואר ראשון בניהול', email: 'ori@example.com' },
];

export const defaultJob = 'דרושה מפתחת Full Stack עם לפחות 3 שנות ניסיון, שליטה ב־React וב־Node.js, היכרות עם TypeScript ומסדי נתונים SQL. ניסיון בפיתוח REST API ועבודה בצוות.';

export const initialMatches: Match[] = [
  { candidate: sampleCandidates[0], score: 96, matched: ['React', 'Node.js', 'TypeScript', 'SQL'], missing: [] },
  { candidate: sampleCandidates[1], score: 88, matched: ['React', 'Node.js', 'REST API'], missing: ['TypeScript', 'SQL'] },
  { candidate: sampleCandidates[2], score: 81, matched: ['React', 'TypeScript', 'SQL'], missing: ['Node.js'] },
];

const normalize = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}+#]/gu, '');
const skills = ['React', 'Node.js', 'TypeScript', 'JavaScript', 'SQL', 'MongoDB', 'REST API', 'Python', 'Django', 'Docker', 'AWS', 'Agile', 'Jira', 'Scrum', 'Excel', 'Figma', 'CRM', 'Salesforce', 'Customer Success'];

// Local keyword demonstration only. Replace through services/matching.ts when adding a server.
export function keywordMatches(candidates: Candidate[], job: string, count: number): Match[] {
  const normalizedJob = normalize(job);
  const requestedSkills = skills.filter(skill => normalizedJob.includes(normalize(skill)));
  const jobWords = job.toLowerCase().split(/[\s,.;:!?־–—]+/).filter(word => word.length > 2);
  return candidates.map(candidate => {
    // Names and contact details are deliberately excluded from matching.
    const profile = normalize([candidate.role, candidate.skills.join(' '), candidate.bio, candidate.education].join(' '));
    const matched = requestedSkills.filter(skill => profile.includes(normalize(skill)));
    const missing = requestedSkills.filter(skill => !matched.includes(skill));
    const wordOverlap = jobWords.filter(word => profile.includes(normalize(word))).length;
    const score = requestedSkills.length
      ? Math.round(matched.length / requestedSkills.length * 100)
      : Math.min(100, Math.round(wordOverlap / Math.max(jobWords.length, 1) * 100));
    return { candidate, score, matched, missing };
  }).sort((a, b) => b.score - a.score).slice(0, count);
}

export const mappingFields = [
  { key: 'name', label: 'שם מלא', required: true, aliases: ['שם מלא', 'שם', 'name', 'full name', 'candidate name'] },
  { key: 'role', label: 'תפקיד', required: false, aliases: ['תפקיד', 'תפקיד נוכחי', 'title', 'role', 'job title'] },
  { key: 'skills', label: 'מיומנויות', required: false, aliases: ['מיומנויות', 'טכנולוגיות', 'כישורים', 'skills', 'technologies'] },
  { key: 'experience', label: 'שנות ניסיון', required: false, aliases: ['שנות ניסיון', 'ניסיון', 'experience', 'years of experience'] },
  { key: 'location', label: 'עיר', required: false, aliases: ['עיר', 'מיקום', 'כתובת', 'location', 'city'] },
  { key: 'bio', label: 'ניסיון מקצועי / תקציר', required: false, aliases: ['תקציר', 'ניסיון מקצועי', 'קורות חיים', 'summary', 'bio', 'resume', 'cv'] },
  { key: 'education', label: 'השכלה', required: false, aliases: ['השכלה', 'education'] },
  { key: 'email', label: 'אימייל', required: false, aliases: ['אימייל', 'דואל', 'דוא״ל', 'email', 'e-mail'] },
] as const;

export function autoMap(headers: string[]): Record<string, string> {
  return Object.fromEntries(mappingFields.map(field => [field.key, headers.findIndex(header => field.aliases.some(alias => normalize(alias) === normalize(header))).toString()]));
}
