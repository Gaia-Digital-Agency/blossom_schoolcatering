export const GRADE_OPTIONS = [
  'Pre K',
  'PS',
  'PR',
  'KP',
  'G1',
  'G1a',
  'G1b',
  'G2',
  'G2a',
  'G2b',
  'G3',
  'G3a',
  'G3b',
  'G4',
  'G4a',
  'G4b',
  'G5',
  'G5a',
  'G5b',
  'G6',
  'G7',
  'G8',
  'G9',
  'G10',
  'G11',
  'G12',
  'G13',
] as const;

const GRADE_INDEX = new Map<string, number>(
  GRADE_OPTIONS.map((grade, index) => [grade.toUpperCase(), index]),
);

const GRADE_FAMILY_ORDER = [
  'Pre K',
  'KP',
  'G1',
  'G2',
  'G3',
  'G4',
  'G5',
  'G6',
  'G7',
  'G8',
  'G9',
  'G10',
  'G11',
  'G12',
  'G13',
] as const;

const GRADE_FAMILY_INDEX = new Map<string, number>(
  GRADE_FAMILY_ORDER.map((grade, index) => [grade.toUpperCase(), index]),
);

function normalizeLegacyGrade(raw: string) {
  const value = raw.trim();
  if (!value) return '';

  const upper = value.toUpperCase();
  if (GRADE_INDEX.has(upper)) return GRADE_OPTIONS[GRADE_INDEX.get(upper)!];

  if (/^PRE[\s-]*K$/i.test(value)) return 'Pre K';
  if (/^KINDER(GARTEN)?$/i.test(value)) return 'KP';

  const gradeMatch = /^GRADE\s*(\d{1,2})([AB])?$/i.exec(value);
  if (gradeMatch) {
    const [, gradeNumber, suffix = ''] = gradeMatch;
    const candidate = `G${Number(gradeNumber)}${suffix.toLowerCase()}`;
    const idx = GRADE_INDEX.get(candidate.toUpperCase());
    return idx !== undefined ? GRADE_OPTIONS[idx] : value;
  }

  const gMatch = /^G\s*(\d{1,2})([AB])?$/i.exec(value);
  if (gMatch) {
    const [, gradeNumber, suffix = ''] = gMatch;
    const candidate = `G${Number(gradeNumber)}${suffix.toLowerCase()}`;
    const idx = GRADE_INDEX.get(candidate.toUpperCase());
    return idx !== undefined ? GRADE_OPTIONS[idx] : value;
  }

  const numericMatch = /^(\d{1,2})$/.exec(value);
  if (numericMatch) {
    const candidate = `G${Number(numericMatch[1])}`;
    const idx = GRADE_INDEX.get(candidate.toUpperCase());
    return idx !== undefined ? GRADE_OPTIONS[idx] : value;
  }

  return value;
}

export function normalizeGradeLabel(raw?: string | null) {
  return normalizeLegacyGrade(String(raw || ''));
}

function toGradeFamily(raw?: string | null) {
  const normalized = normalizeGradeLabel(raw);
  if (!normalized) return '';
  if (normalized === 'Pre K' || normalized === 'KP') return normalized;
  const match = /^G(\d{1,2})/i.exec(normalized);
  return match ? `G${Number(match[1])}` : normalized;
}

function makassarCurrentYear(now = new Date()) {
  return Number(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Makassar',
    year: 'numeric',
  }).format(now));
}

function extractYear(raw?: string | null) {
  const match = /^(\d{4})/.exec(String(raw || '').trim());
  return match ? Number(match[1]) : null;
}

export function progressGradeByYears(baseGrade?: string | null, yearsElapsed = 0) {
  const normalized = normalizeGradeLabel(baseGrade);
  const familyGrade = toGradeFamily(baseGrade);
  const startIndex = GRADE_FAMILY_INDEX.get(familyGrade.toUpperCase());
  if (startIndex === undefined) return normalized;
  const nextIndex = Math.min(startIndex + Math.max(0, yearsElapsed), GRADE_FAMILY_ORDER.length - 1);
  return GRADE_FAMILY_ORDER[nextIndex];
}

export function resolveEffectiveGrade(input: {
  registrationGrade?: string | null;
  currentGrade?: string | null;
  registrationDate?: string | null;
  now?: Date;
}) {
  const currentGrade = normalizeGradeLabel(input.currentGrade);
  if (currentGrade) return currentGrade;

  const registrationGrade = normalizeGradeLabel(input.registrationGrade);
  if (!registrationGrade) return '';

  const registrationYear = extractYear(input.registrationDate);
  if (!registrationYear) return registrationGrade;

  const yearsElapsed = Math.max(0, makassarCurrentYear(input.now) - registrationYear);
  return progressGradeByYears(registrationGrade, yearsElapsed);
}
