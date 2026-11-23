import { addDays, daysBetween, isValidISODate, weekStart } from '../shared/dates';

export const STAGES = ['New', 'Reached out', 'In conversation', 'Opportunity', 'Closed'] as const;
export type Stage = (typeof STAGES)[number];
export const TYPES = ['Email', 'Call', 'Meeting', 'Message', 'Event'] as const;
export type InteractionType = (typeof TYPES)[number];

export interface Person {
  id: string;
  name: string;
  company: string;
  role: string;
  howMet: string;
  stage: Stage;
  /** Follow up every N days after the last interaction; 0 = no regular cadence. */
  cadence: number;
  /** Explicit next follow-up date that overrides the cadence (set by "next step" or snooze). */
  nextDate: string | null;
  tags: string[];
  demo?: boolean;
}

export interface Interaction {
  id: string;
  personId: string;
  date: string;
  type: InteractionType;
  summary: string;
  nextStep: string;
}

export function lastContact(personId: string, log: Interaction[]): Interaction | null {
  let last: Interaction | null = null;
  for (const i of log) if (i.personId === personId && (!last || i.date > last.date)) last = i;
  return last;
}

/** Explicit next date wins; otherwise last contact + cadence; otherwise (never contacted, with a cadence) due now. */
export function followUpDate(p: Person, log: Interaction[], today: string): string | null {
  if (p.stage === 'Closed') return null;
  if (p.nextDate) return p.nextDate;
  if (!p.cadence) return null;
  const last = lastContact(p.id, log);
  return last ? addDays(last.date, p.cadence) : today;
}

export type Due = 'overdue' | 'today' | 'week' | 'later' | 'none';
export function dueState(date: string | null, today: string): Due {
  if (!date) return 'none';
  const d = daysBetween(today, date);
  return d < 0 ? 'overdue' : d === 0 ? 'today' : d <= 7 ? 'week' : 'later';
}

/** warm: within cadence · cooling: up to 1.5× · cold: beyond, or never contacted. */
export function warmth(p: Person, log: Interaction[], today: string): 'warm' | 'cooling' | 'cold' | 'n/a' {
  if (!p.cadence) return 'n/a';
  const last = lastContact(p.id, log);
  if (!last) return 'cold';
  const since = daysBetween(last.date, today);
  return since <= p.cadence ? 'warm' : since <= p.cadence * 1.5 ? 'cooling' : 'cold';
}

export interface QueueItem {
  person: Person;
  date: string;
  due: Due;
  last: Interaction | null;
}

export function queue(people: Person[], log: Interaction[], today: string): QueueItem[] {
  return people
    .map((person) => { const date = followUpDate(person, log, today); return { person, date: date ?? '', due: dueState(date, today), last: lastContact(person.id, log) }; })
    .filter((q) => q.due !== 'none')
    .sort((a, b) => a.date.localeCompare(b.date) || a.person.name.localeCompare(b.person.name));
}

/** Logging an interaction clears a stale explicit date unless a new one is given, and nudges "New" people to "Reached out". */
export function logInteraction(p: Person, nextDate: string | null): Person {
  return { ...p, nextDate, stage: p.stage === 'New' ? 'Reached out' : p.stage };
}

export function snooze(p: Person, days: number, today: string): Person {
  return { ...p, nextDate: addDays(today, days) };
}

/** Interactions per week for the `weeks` weeks ending this week (Monday start). */
export function weekly(log: Interaction[], today: string, weeks = 12) {
  const start = addDays(weekStart(today), -(weeks - 1) * 7);
  return Array.from({ length: weeks }, (_, i) => {
    const from = addDays(start, i * 7), to = addDays(from, 6);
    const inWeek = log.filter((x) => x.date >= from && x.date <= to);
    return { week: from, total: inWeek.length, byType: Object.fromEntries(TYPES.map((t) => [t, inWeek.filter((x) => x.type === t).length])) as Record<InteractionType, number> };
  });
}

export function validateInteraction(d: { date: string; summary: string; nextDate: string }, today: string) {
  const e: Partial<Record<'date' | 'summary' | 'nextDate', string>> = {};
  if (!isValidISODate(d.date)) e.date = 'Choose the date.';
  else if (d.date > today) e.date = 'Log it once it has happened.';
  if (!d.summary.trim()) e.summary = 'Write a line about what was said.';
  if (d.nextDate && (!isValidISODate(d.nextDate) || d.nextDate < today)) e.nextDate = 'The next follow-up should be today or later.';
  return e;
}

export function validatePerson(d: { name: string; cadence: string }) {
  const e: Partial<Record<'name' | 'cadence', string>> = {};
  if (!d.name.trim()) e.name = 'Enter a name.';
  const c = Number(d.cadence);
  if (!Number.isInteger(c) || c < 0 || c > 365) e.cadence = 'Use 0–365 days (0 = no regular follow-up).';
  return e;
}
