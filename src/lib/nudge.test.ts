import { describe, expect, it } from 'vitest';
import { dueState, followUpDate, lastContact, logInteraction, queue, snooze, validateInteraction, validatePerson, warmth, weekly, type Interaction, type Person } from './nudge';

const today = '2026-11-23'; // Monday
const p = (x: Partial<Person>): Person => ({ id: 'p', name: 'Pat', company: '', role: '', howMet: '', stage: 'In conversation', cadence: 30, nextDate: null, tags: [], ...x });
const i = (x: Partial<Interaction>): Interaction => ({ id: Math.random().toString(), personId: 'p', date: '2026-11-01', type: 'Email', summary: 's', nextStep: '', ...x });

describe('follow-up dates', () => {
  it('uses the explicit date, else last contact + cadence, else today', () => {
    expect(followUpDate(p({ nextDate: '2026-12-01' }), [i({})], today)).toBe('2026-12-01');
    expect(followUpDate(p({}), [i({ date: '2026-10-01' }), i({ date: '2026-11-01' })], today)).toBe('2026-12-01');
    expect(followUpDate(p({}), [], today)).toBe(today);
    expect(followUpDate(p({ cadence: 0 }), [i({})], today)).toBeNull();
    expect(followUpDate(p({ stage: 'Closed', nextDate: '2026-12-01' }), [], today)).toBeNull();
  });
  it('classifies due states', () => {
    expect(['2026-11-20', today, '2026-11-30', '2026-12-01'].map((d) => dueState(d, today))).toEqual(['overdue', 'today', 'week', 'later']);
    expect(dueState(null, today)).toBe('none');
  });
  it('finds the latest interaction regardless of order', () => {
    expect(lastContact('p', [i({ date: '2026-11-10', id: 'b' }), i({ date: '2026-11-15', id: 'a' }), i({ personId: 'q', date: '2026-11-20' })])!.id).toBe('a');
  });
});

describe('warmth and queue', () => {
  it('grades relationship warmth against the cadence', () => {
    expect(warmth(p({}), [i({ date: '2026-11-01' })], today)).toBe('warm');
    expect(warmth(p({}), [i({ date: '2026-10-15' })], today)).toBe('cooling');
    expect(warmth(p({}), [i({ date: '2026-09-01' })], today)).toBe('cold');
    expect(warmth(p({}), [], today)).toBe('cold');
    expect(warmth(p({ cadence: 0 }), [], today)).toBe('n/a');
  });
  it('sorts the queue by date and leaves out people with nothing due', () => {
    const people = [p({ id: 'a', name: 'A', nextDate: '2026-12-10' }), p({ id: 'b', name: 'B', nextDate: '2026-11-01' }), p({ id: 'c', name: 'C', cadence: 0 })];
    expect(queue(people, [], today).map((q) => [q.person.id, q.due])).toEqual([['b', 'overdue'], ['a', 'later']]);
  });
});

describe('actions', () => {
  it('logging moves new contacts forward and sets the next date', () => {
    expect(logInteraction(p({ stage: 'New', nextDate: '2026-01-01' }), null)).toMatchObject({ stage: 'Reached out', nextDate: null });
    expect(logInteraction(p({}), '2026-12-05').nextDate).toBe('2026-12-05');
  });
  it('snoozes from today', () => {
    expect(snooze(p({}), 7, today).nextDate).toBe('2026-11-30');
  });
  it('counts interactions per week', () => {
    const w = weekly([i({ date: '2026-11-23', type: 'Call' }), i({ date: '2026-11-22' }), i({ date: '2026-11-16' }), i({ date: '2026-08-01' })], today, 3);
    expect(w.map((x) => [x.week, x.total])).toEqual([['2026-11-09', 0], ['2026-11-16', 2], ['2026-11-23', 1]]);
    expect(w[2].byType.Call).toBe(1);
  });
  it('validates input', () => {
    expect(Object.keys(validateInteraction({ date: '2026-12-01', summary: ' ', nextDate: '2026-01-01' }, today)).sort()).toEqual(['date', 'nextDate', 'summary']);
    expect(validatePerson({ name: '', cadence: '-1' })).toEqual({ name: expect.any(String), cadence: expect.any(String) });
  });
});
