import { useMemo, useState, type ReactNode } from 'react';
import { DemoTag, EmptyState, Field, Landing, NotFound, Notice, PageHead, Shell, downloadText, uid, useFlash, usePersistentState, useRoute } from './shared/ui';
import { DataTable, useTable, type Column } from './shared/table';
import { toCSV } from './shared/csv';
import { addDays, daysBetween, formatDay, relativeDays, todayISO } from './shared/dates';
import {
  STAGES,
  TYPES,
  dueState,
  followUpDate,
  lastContact,
  logInteraction,
  queue,
  snooze,
  validateInteraction,
  validatePerson,
  warmth,
  weekly,
  type Interaction,
  type InteractionType,
  type Person,
  type QueueItem,
  type Stage,
} from './lib/nudge';

const KEY = 'nudge-desk:store';
const NAV = [
  { to: '/', label: 'Overview' },
  { to: '/today', label: 'Follow-ups' },
  { to: '/people', label: 'People' },
  { to: '/pipeline', label: 'Pipeline' },
  { to: '/activity', label: 'Activity' },
];
const TYPE_COLOR: Record<InteractionType, string> = { Email: 'var(--accent)', Call: '#2f6aa3', Meeting: '#5b7f3a', Message: '#8a4f9e', Event: '#b08a1e' };
const WARMTH_LABEL = { warm: 'Warm', cooling: 'Cooling', cold: 'Cold', 'n/a': 'No rhythm' } as const;

interface Store {
  people: Person[];
  log: Interaction[];
}

export function demoStore(today: string): Store {
  const d = (n: number) => addDays(today, -n);
  const p = (id: string, name: string, company: string, role: string, howMet: string, stage: Stage, cadence: number, tags: string[], nextDate: string | null = null): Person => ({ id: `demo-${id}`, name, company, role, howMet, stage, cadence, tags, nextDate, demo: true });
  const people: Person[] = [
    p('ana', 'Ana Ruiz', 'Brightside Studio (demo)', 'Design lead', 'Portfolio review meetup', 'Opportunity', 14, ['design', 'hiring'], addDays(today, 1)),
    p('kofi', 'Kofi Mensah', 'Northwind Logistics (demo)', 'Ops manager', 'Former colleague', 'In conversation', 30, ['referral']),
    p('lena', 'Lena Fischer', 'Demo Analytics GmbH', 'Head of data', 'Conference talk', 'Reached out', 21, ['data']),
    p('raj', 'Raj Iyer', '', 'Freelance developer', 'Climbing gym', 'In conversation', 45, ['peer']),
    p('mei', 'Mei Chen', 'Harbour Health (demo)', 'Product manager', 'LinkedIn message', 'New', 7, ['product']),
    p('tom', 'Tom Okoye', 'Okoye & Partners Architecture and Interiors (demo)', 'Founding partner', 'Introduced by Kofi', 'Opportunity', 10, ['client'], d(2)),
    p('sara', 'Sara Lind', 'Demo Foundation', 'Programme officer', 'Grant webinar', 'Closed', 0, ['grant']),
    p('jules', 'Jules Martin', '', 'Mentor', 'University alumni event', 'In conversation', 60, ['mentor']),
  ];
  const log: Interaction[] = [];
  const add = (pid: string, days: number, type: InteractionType, summary: string, nextStep = '') => log.push({ id: `demo-i${log.length}`, personId: `demo-${pid}`, date: d(days), type, summary, nextStep });
  add('ana', 3, 'Meeting', 'Coffee to talk about the design systems role. Interview loop starts next month.', 'Send case study PDF');
  add('ana', 20, 'Email', 'Thanked her for the portfolio feedback.');
  add('kofi', 40, 'Call', 'Catch-up; he may need help with a dashboard project in Q1.', 'Check in after budget approval');
  add('kofi', 95, 'Message', 'Congratulated him on the promotion.');
  add('lena', 26, 'Email', 'Followed up after her talk on data quality; shared my notes.');
  add('raj', 12, 'Event', 'Met at the climbing gym social; swapped ideas on side projects.');
  add('tom', 9, 'Meeting', 'Scoped a website refresh; waiting for their partners’ decision.', 'Send revised quote');
  add('tom', 16, 'Call', 'Intro call via Kofi.');
  add('sara', 70, 'Email', 'Grant application submitted; outcome expected in spring.');
  add('jules', 50, 'Call', 'Monthly mentoring call: talked about pricing freelance work.');
  add('jules', 110, 'Meeting', 'First mentoring session.');
  for (let w = 1; w < 12; w++) if (w % 3 !== 0) add(['raj', 'kofi', 'lena'][w % 3], w * 7 + 3, w % 2 ? 'Message' : 'Email', 'Quick check-in.');
  return { people, log };
}

export default function App() {
  const [route, navigate] = useRoute();
  const today = todayISO();
  const [store, setStore] = usePersistentState<Store>(KEY, () => demoStore(today));
  const ctx = { store, setStore, today, navigate };
  const view = route.match(/^\/person\/(.+)$/);
  let page: ReactNode;
  if (route === '/') page = <Home />;
  else if (route === '/today') page = <Today {...ctx} />;
  else if (route === '/people') page = <People {...ctx} />;
  else if (view) page = <PersonPage {...ctx} id={view[1]} />;
  else if (route === '/pipeline') page = <Pipeline {...ctx} />;
  else if (route === '/activity') page = <Activity {...ctx} />;
  else page = <NotFound />;
  return (
    <Shell name="Nudge Desk" wordmark={['Nudge', 'Desk']} nav={NAV} route={route} cta={{ to: '/today', label: 'Who to contact' }} footerNote="Notes stay in this browser. Nudge Desk never contacts anyone for you.">
      {page}
    </Shell>
  );
}

type Ctx = { store: Store; setStore: (s: Store) => void; today: string; navigate: (to: string) => void };

function Warmth({ w }: { w: ReturnType<typeof warmth> }) {
  return <span className={`warm w-${w.replace('/', '')}`}><i aria-hidden="true" />{WARMTH_LABEL[w]}</span>;
}

function LogForm({ person, store, setStore, today, onDone, compact }: { person: Person; store: Store; setStore: (s: Store) => void; today: string; onDone?: () => void; compact?: boolean }) {
  const [d, setD] = useState({ date: today, type: 'Email' as InteractionType, summary: '', nextStep: '', nextDate: person.cadence ? addDays(today, person.cadence) : '' });
  const [submitted, setSubmitted] = useState(false);
  const errors = submitted ? validateInteraction(d, today) : {};
  function save(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (Object.keys(validateInteraction(d, today)).length) return;
    setStore({
      people: store.people.map((p) => (p.id === person.id ? logInteraction(p, d.nextDate && d.nextDate !== addDays(d.date, p.cadence) ? d.nextDate : null) : p)),
      log: [...store.log, { id: uid('int'), personId: person.id, date: d.date, type: d.type, summary: d.summary.trim(), nextStep: d.nextStep.trim() }],
    });
    onDone?.();
  }
  return (
    <form className={`stack log-form ${compact ? 'is-compact' : ''}`} onSubmit={save} noValidate aria-label={`Log an interaction with ${person.name}`}>
      <div className="form-grid">
        <Field label="Date" error={errors.date}>{(p) => <input {...p} type="date" max={today} value={d.date} onChange={(e) => setD({ ...d, date: e.target.value })} />}</Field>
        <Field label="How">{(p) => <select {...p} value={d.type} onChange={(e) => setD({ ...d, type: e.target.value as InteractionType })}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select>}</Field>
        <Field label="Next follow-up" hint={person.cadence ? `Default: ${person.cadence} days later` : 'Optional'} error={errors.nextDate}>{(p) => <input {...p} type="date" min={today} value={d.nextDate} onChange={(e) => setD({ ...d, nextDate: e.target.value })} />}</Field>
      </div>
      <Field label="What happened" error={errors.summary}>{(p) => <textarea {...p} rows={2} value={d.summary} onChange={(e) => setD({ ...d, summary: e.target.value })} />}</Field>
      <Field label="Next step" hint="Optional">{(p) => <input {...p} value={d.nextStep} onChange={(e) => setD({ ...d, nextStep: e.target.value })} />}</Field>
      <div className="row"><button className="btn btn-primary" type="submit">Save interaction</button>{onDone && <button type="button" className="btn btn-ghost" onClick={onDone}>Cancel</button>}</div>
    </form>
  );
}

function QueueRow({ q, store, setStore, today, compact }: { q: QueueItem; store: Store; setStore: (s: Store) => void; today: string; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const w = warmth(q.person, store.log, today);
  const days = daysBetween(today, q.date);
  return (
    <li className={`q-row d-${q.due}`}>
      <div className="q-main">
        <span className="q-when"><b>{q.due === 'overdue' ? `${-days}d` : q.due === 'today' ? 'Due' : `${days}d`}</b><small>{q.due === 'overdue' ? 'late' : q.due === 'today' ? 'today' : 'to go'}</small></span>
        <span className="q-who">
          {compact ? <strong>{q.person.name}</strong> : <a href={`#/person/${q.person.id}`}><strong>{q.person.name}</strong></a>}
          <span className="small muted">{[q.person.role, q.person.company].filter(Boolean).join(' · ')}</span>
          <span className="small">{q.last ? `Last: ${q.last.type.toLowerCase()} ${relativeDays(daysBetween(today, q.last.date))}${q.last.nextStep ? ` — next step: ${q.last.nextStep}` : ''}` : 'Never contacted'}</span>
        </span>
        <Warmth w={w} />
      </div>
      {!compact && (
        <div className="row q-actions">
          <button type="button" className="btn btn-sm btn-primary" aria-expanded={open} onClick={() => setOpen(!open)}>Log interaction</button>
          <button type="button" className="btn btn-sm" onClick={() => setStore({ ...store, people: store.people.map((p) => (p.id === q.person.id ? snooze(p, 3, today) : p)) })} aria-label={`Snooze ${q.person.name} for 3 days`}>+3 days</button>
          <button type="button" className="btn btn-sm" onClick={() => setStore({ ...store, people: store.people.map((p) => (p.id === q.person.id ? snooze(p, 7, today) : p)) })} aria-label={`Snooze ${q.person.name} for a week`}>+1 week</button>
        </div>
      )}
      {open && <LogForm person={q.person} store={store} setStore={setStore} today={today} onDone={() => setOpen(false)} compact />}
    </li>
  );
}

function HeroPreview() {
  const today = todayISO();
  const s = demoStore(today);
  const q = queue(s.people, s.log, today).slice(0, 4);
  return <ul className="queue hero-q">{q.map((x) => <QueueRow key={x.person.id} q={x} store={s} setStore={() => {}} today={today} compact />)}</ul>;
}

function Home() {
  return (
    <Landing
      eyebrow="Follow-up tracker"
      title={<>Stay in touch <em>on purpose.</em></>}
      lead="For job searches, freelance leads and the people you don’t want to lose touch with. Log each conversation, set how often you mean to follow up, and Nudge Desk tells you who’s due — and who’s going cold."
      primary={{ href: '#/today', label: 'See who’s due' }}
      secondary={{ href: '#/pipeline', label: 'View the pipeline' }}
      previewLabel="Follow-ups — demo contacts"
      preview={<HeroPreview />}
      steps={[
        { title: 'Add a person', body: 'Who they are, how you met, a stage, and how often you’d like to be in touch.' },
        { title: 'Log conversations', body: 'Calls, emails, meetings — with a line of notes and the agreed next step.' },
        { title: 'Work the queue', body: 'Each day shows who’s overdue, due today or this week. Log, or snooze for a few days.' },
      ]}
      stepsIntro="Nudge Desk opens with eight labelled, fictional contacts and three months of history. Clear them when you’re ready."
      features={[
        { title: 'Rhythm, not reminders', body: 'Follow-ups come from each person’s cadence and your last contact, unless you set a specific date.' },
        { title: 'Warm, cooling, cold', body: 'See at a glance whose relationship is overdue for attention.' },
        { title: 'Simple pipeline', body: 'New → reached out → in conversation → opportunity → closed.' },
        { title: 'Activity chart', body: 'Twelve weeks of outreach by type, so you can see whether you’re keeping it up.' },
      ]}
      note="Nudge Desk is a notebook. It never emails or messages anyone."
      closing={{ title: <>One message today <em>beats ten next month.</em></>, action: { href: '#/today', label: 'Start with today' } }}
    />
  );
}

function Today({ store, setStore, today }: Ctx) {
  const q = queue(store.people, store.log, today);
  const groups: [string, QueueItem[]][] = [['Overdue', q.filter((x) => x.due === 'overdue')], ['Today', q.filter((x) => x.due === 'today')], ['This week', q.filter((x) => x.due === 'week')]];
  const later = q.filter((x) => x.due === 'later').length;
  if (store.people.length === 0) return <EmptyState title="No one to follow up with yet" actions={<><a className="btn btn-primary" href="#/people">Add a person</a><button type="button" className="btn" onClick={() => setStore(demoStore(today))}>Load demo contacts</button></>}>Add someone you’d like to stay in touch with.</EmptyState>;
  return (
    <div className="stack">
      <PageHead eyebrow={formatDay(today, { weekday: 'long', day: 'numeric', month: 'long' })} title={<>Who to <em>nudge.</em></>} description={`${groups[0][1].length} overdue · ${groups[1][1].length} today · ${groups[2][1].length} this week · ${later} later`} />
      {groups.every(([, l]) => l.length === 0) && <EmptyState title="All caught up">Nobody is due this week. Nice work.</EmptyState>}
      {groups.filter(([, l]) => l.length).map(([title, list]) => (
        <section key={title} aria-labelledby={`g-${title}`} className="stack">
          <h2 id={`g-${title}`} className="h3">{title} <span className="badge">{list.length}</span></h2>
          <ul className="queue">{list.map((x) => <QueueRow key={x.person.id} q={x} store={store} setStore={setStore} today={today} />)}</ul>
        </section>
      ))}
    </div>
  );
}

function People({ store, setStore, today, navigate }: Ctx) {
  const [flash, setFlash] = useFlash();
  const [stage, setStage] = useState('');
  const [q, setQ] = useState('');
  const [d, setD] = useState({ name: '', company: '', role: '', howMet: '', cadence: '30' });
  const [submitted, setSubmitted] = useState(false);
  const errors = submitted ? validatePerson(d) : {};
  const rows = useMemo(() => store.people.filter((p) => (!stage || p.stage === stage) && `${p.name} ${p.company} ${p.role} ${p.tags.join(' ')}`.toLowerCase().includes(q.trim().toLowerCase())), [store, stage, q]);
  const columns: Column<Person>[] = [
    { key: 'name', label: 'Name', sort: (p) => p.name, render: (p) => <><a href={`#/person/${p.id}`}>{p.name}</a>{p.demo && <> <DemoTag /></>}<div className="small muted">{[p.role, p.company].filter(Boolean).join(' · ')}</div></> },
    { key: 'stage', label: 'Stage', sort: (p) => STAGES.indexOf(p.stage), render: (p) => p.stage },
    { key: 'last', label: 'Last contact', sort: (p) => lastContact(p.id, store.log)?.date ?? '', render: (p) => { const l = lastContact(p.id, store.log); return l ? relativeDays(daysBetween(today, l.date)) : 'Never'; } },
    { key: 'next', label: 'Next follow-up', sort: (p) => followUpDate(p, store.log, today) ?? '', render: (p) => { const n = followUpDate(p, store.log, today); const s = dueState(n, today); return n ? <span className={`badge ${s === 'overdue' ? 'badge-err' : s === 'today' ? 'badge-warn' : ''}`}>{relativeDays(daysBetween(today, n))}</span> : '—'; } },
    { key: 'warm', label: 'Warmth', sort: (p) => ['cold', 'cooling', 'warm', 'n/a'].indexOf(warmth(p, store.log, today)), render: (p) => <Warmth w={warmth(p, store.log, today)} /> },
  ];
  const table = useTable(rows, columns, { initialSort: 'next' });
  function add(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (Object.keys(validatePerson(d)).length) return;
    const id = uid('person');
    setStore({ ...store, people: [...store.people, { id, name: d.name.trim(), company: d.company.trim(), role: d.role.trim(), howMet: d.howMet.trim(), stage: 'New', cadence: Number(d.cadence), nextDate: null, tags: [] }] });
    navigate(`/person/${id}`);
  }
  return (
    <div className="stack">
      <PageHead eyebrow="People" title={<>Everyone you’re <em>keeping up with.</em></>} actions={<button type="button" className="btn" disabled={!store.log.length} onClick={() => downloadText('nudge-desk-interactions.csv', toCSV(['Date', 'Person', 'Company', 'Type', 'Summary', 'Next step'], [...store.log].sort((a, b) => b.date.localeCompare(a.date)).map((i) => { const p = store.people.find((x) => x.id === i.personId); return [i.date, p?.name ?? '', p?.company ?? '', i.type, i.summary, i.nextStep]; })), 'text/csv')}>Export interactions</button>} />
      {flash && <Notice kind={flash.kind} onDismiss={() => setFlash(null)}>{flash.text}</Notice>}
      {store.people.length > 0 && (
        <div className="card stack">
          <div className="filters">
            <Field label="Search" className="grow">{(p) => <input {...p} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, company, role or tag" />}</Field>
            <Field label="Stage">{(p) => <select {...p} value={stage} onChange={(e) => setStage(e.target.value)}><option value="">All stages</option>{STAGES.map((s) => <option key={s}>{s}</option>)}</select>}</Field>
          </div>
          <DataTable caption="People" columns={columns} table={table} rowKey={(p) => p.id} empty="Nobody matches these filters." />
          {store.people.some((p) => p.demo) && <div><button type="button" className="btn btn-ghost btn-sm" onClick={() => { const ids = new Set(store.people.filter((p) => p.demo).map((p) => p.id)); setStore({ people: store.people.filter((p) => !p.demo), log: store.log.filter((i) => !ids.has(i.personId)) }); setFlash({ kind: 'success', text: 'Demo contacts removed.' }); }}>Clear demo contacts</button></div>}
        </div>
      )}
      <form className="card stack" onSubmit={add} noValidate aria-labelledby="add-p">
        <h2 id="add-p" className="h3">Add a person</h2>
        <div className="form-grid">
          <Field label="Name" error={errors.name}>{(p) => <input {...p} value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />}</Field>
          <Field label="Company">{(p) => <input {...p} value={d.company} onChange={(e) => setD({ ...d, company: e.target.value })} />}</Field>
          <Field label="Role">{(p) => <input {...p} value={d.role} onChange={(e) => setD({ ...d, role: e.target.value })} />}</Field>
          <Field label="How you met">{(p) => <input {...p} value={d.howMet} onChange={(e) => setD({ ...d, howMet: e.target.value })} />}</Field>
          <Field label="Follow up every (days)" hint="0 = no regular follow-up" error={errors.cadence}>{(p) => <input {...p} inputMode="numeric" value={d.cadence} onChange={(e) => setD({ ...d, cadence: e.target.value })} />}</Field>
        </div>
        <div><button className="btn btn-primary" type="submit">Add person</button></div>
      </form>
    </div>
  );
}

function PersonPage({ store, setStore, today, navigate, id }: Ctx & { id: string }) {
  const person = store.people.find((p) => p.id === id);
  const [flash, setFlash] = useFlash();
  if (!person) return <EmptyState title="Person not found" actions={<a className="btn btn-primary" href="#/people">Back to people</a>} />;
  const history = store.log.filter((i) => i.personId === person.id).sort((a, b) => b.date.localeCompare(a.date));
  const next = followUpDate(person, store.log, today);
  const update = (patch: Partial<Person>) => setStore({ ...store, people: store.people.map((p) => (p.id === person.id ? { ...p, ...patch } : p)) });
  return (
    <div className="stack">
      <PageHead eyebrow={<><a href="#/people">People</a> / {person.stage}</>} title={person.name} description={[person.role, person.company, person.howMet && `met: ${person.howMet}`].filter(Boolean).join(' · ') || undefined}
        actions={<button type="button" className="btn btn-danger" onClick={() => { if (window.confirm(`Remove ${person.name} and their history?`)) { setStore({ people: store.people.filter((p) => p.id !== person.id), log: store.log.filter((i) => i.personId !== person.id) }); navigate('/people'); } }}>Remove</button>} />
      {flash && <Notice kind={flash.kind} onDismiss={() => setFlash(null)}>{flash.text}</Notice>}
      {person.demo && <p><DemoTag /> <span className="small muted">A fictional demo contact.</span></p>}
      <div className="stats">
        <div className="stat"><span className="stat-label">Next follow-up</span><span className="stat-value" data-testid="next">{next ? relativeDays(daysBetween(today, next)) : '—'}</span></div>
        <div className="stat"><span className="stat-label">Warmth</span><span className="stat-value"><Warmth w={warmth(person, store.log, today)} /></span></div>
        <div className="stat"><span className="stat-label">Interactions</span><span className="stat-value">{history.length}</span></div>
      </div>
      <div className="layout-main">
        <section className="card stack" aria-labelledby="hist">
          <h2 id="hist" className="h3">History</h2>
          <LogForm person={person} store={store} setStore={(s) => { setStore(s); setFlash({ kind: 'success', text: 'Interaction saved.' }); }} today={today} />
          {history.length === 0 ? <p className="muted">No interactions yet.</p> : (
            <ol className="timeline">
              {history.map((i) => (
                <li key={i.id} style={{ ['--c' as string]: TYPE_COLOR[i.type] }}>
                  <span className="small mono">{formatDay(i.date, { day: 'numeric', month: 'short', year: 'numeric' })} · {i.type}</span>
                  <p>{i.summary}</p>
                  {i.nextStep && <p className="small"><strong>Next step:</strong> {i.nextStep}</p>}
                </li>
              ))}
            </ol>
          )}
        </section>
        <aside className="card stack">
          <h2 className="h3">Settings</h2>
          <Field label="Stage">{(p) => <select {...p} value={person.stage} onChange={(e) => update({ stage: e.target.value as Stage })}>{STAGES.map((s) => <option key={s}>{s}</option>)}</select>}</Field>
          <Field label="Follow up every (days)" hint="0 = no regular follow-up">{(p) => <input {...p} inputMode="numeric" defaultValue={person.cadence} onBlur={(e) => { const n = Number(e.target.value); if (Number.isInteger(n) && n >= 0 && n <= 365) update({ cadence: n }); else setFlash({ kind: 'error', text: 'Use 0–365 days.' }); }} />}</Field>
          <Field label="Specific follow-up date" hint="Overrides the rhythm until you log again">{(p) => <input {...p} type="date" value={person.nextDate ?? ''} onChange={(e) => update({ nextDate: e.target.value || null })} />}</Field>
          {person.nextDate && <button type="button" className="btn btn-sm btn-ghost" onClick={() => update({ nextDate: null })}>Clear specific date</button>}
        </aside>
      </div>
    </div>
  );
}

function Pipeline({ store, setStore, today }: Ctx) {
  return (
    <div className="stack">
      <PageHead eyebrow="Pipeline" title={<>Where things <em>stand.</em></>} description="Move people along as conversations progress." />
      <div className="pipeline">
        {STAGES.map((s) => {
          const list = store.people.filter((p) => p.stage === s);
          return (
            <section key={s} className="stage" aria-labelledby={`st-${s}`}>
              <h2 id={`st-${s}`} className="stage-head"><span>{s}</span><span className="badge">{list.length}</span></h2>
              <ul className="stage-list">
                {list.map((p) => {
                  const i = STAGES.indexOf(s);
                  return (
                    <li key={p.id} className="stage-card">
                      <a href={`#/person/${p.id}`}><strong>{p.name}</strong></a>
                      <span className="small muted">{p.company || p.role || '—'}</span>
                      <Warmth w={warmth(p, store.log, today)} />
                      <div className="row nowrap">
                        {i > 0 && <button type="button" className="icon-btn" aria-label={`Move ${p.name} back to ${STAGES[i - 1]}`} onClick={() => setStore({ ...store, people: store.people.map((x) => (x.id === p.id ? { ...x, stage: STAGES[i - 1] } : x)) })}>←</button>}
                        {i < STAGES.length - 1 && <button type="button" className="icon-btn" aria-label={`Move ${p.name} to ${STAGES[i + 1]}`} onClick={() => setStore({ ...store, people: store.people.map((x) => (x.id === p.id ? { ...x, stage: STAGES[i + 1] } : x)) })}>→</button>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function Activity({ store, today }: Ctx) {
  const weeks = weekly(store.log, today, 12);
  const max = Math.max(4, ...weeks.map((w) => w.total));
  const [tip, setTip] = useState<string | null>(null);
  const recent = store.log.filter((i) => i.date > addDays(today, -28)).length;
  return (
    <div className="stack">
      <PageHead eyebrow="Activity" title={<>Twelve weeks <em>of outreach.</em></>} />
      <div className="stats">
        <div className="stat"><span className="stat-label">Last 4 weeks</span><span className="stat-value">{recent}</span></div>
        <div className="stat"><span className="stat-label">Weekly average</span><span className="stat-value">{(weeks.reduce((s, w) => s + w.total, 0) / weeks.length).toFixed(1)}</span></div>
        <div className="stat"><span className="stat-label">Cold relationships</span><span className="stat-value">{store.people.filter((p) => warmth(p, store.log, today) === 'cold').length}</span></div>
      </div>
      <section className="card stack" aria-labelledby="w-t">
        <h2 id="w-t" className="h3">Interactions per week</h2>
        <div className="bars-wrap" onMouseLeave={() => setTip(null)}>
          <div className="bars-axis" aria-hidden="true">{[max, Math.round(max / 2), 0].map((t) => <span key={t}>{t}</span>)}</div>
          <div className="bars" role="img" aria-label={weeks.map((w) => `Week of ${formatDay(w.week, { day: 'numeric', month: 'short' })}: ${w.total}`).join(', ')}>
            {weeks.map((w, i) => {
              const text = `Week of ${formatDay(w.week, { day: 'numeric', month: 'short' })}: ${w.total} (${TYPES.filter((t) => w.byType[t]).map((t) => `${w.byType[t]} ${t.toLowerCase()}`).join(', ') || 'none'})`;
              return (
                <div key={w.week} className="bar-col" style={{ ['--i' as string]: i }} tabIndex={0} aria-label={text} onMouseEnter={() => setTip(text)} onFocus={() => setTip(text)} onBlur={() => setTip(null)}>
                  <div className="bar-stack" style={{ height: `${(w.total / max) * 100}%` }}>{TYPES.filter((t) => w.byType[t]).map((t) => <span key={t} style={{ flexGrow: w.byType[t], background: TYPE_COLOR[t] }} />)}</div>
                  <span className="bar-label mono">{formatDay(w.week, { day: 'numeric', month: 'numeric' })}</span>
                </div>
              );
            })}
          </div>
        </div>
        <p className="small" aria-live="polite">{tip ?? 'Hover or focus a week for the breakdown.'}</p>
        <p className="legend">{TYPES.map((t) => <span key={t}><i style={{ background: TYPE_COLOR[t] }} />{t}</span>)}<span className="muted">· weeks start on Monday</span></p>
      </section>
    </div>
  );
}
