// scripts/rfp-dates.mjs: the calendar skill's date arithmetic, key-dates note and Google Calendar links.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { routeWorkspace } from './fixtures/rfp-route-workspace.mjs';
import { googleCalendarLink, parseClock, parseWrittenDate, planDates, recordedDates, resolveZone, runDates } from '../workspace/scripts/rfp-dates.mjs';
import { routeRequest } from '../workspace/scripts/rfp-route.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const script = path.join(repoRoot, 'workspace', 'scripts', 'rfp-dates.mjs');
const SLUG = 'laguna-beach-website-redesign';
const NOW = new Date('2026-11-18T20:00:00Z');
const folderOf = workspace => path.join(workspace, 'RFPs', '2-intermediate-stage', SLUG);
const notePath = workspace => path.join(folderOf(workspace), `key-dates_${SLUG}.md`);
// The Google Calendar links in the text ISA sends, in order, as parsed URLs.
const linksIn = text => [...text.matchAll(/\[Add to Google Calendar\]\((https:[^)\s]+)\)/g)].map(match => new URL(match[1]));

const laguna = () => ({
  name: 'Laguna Beach Website Redesign', agency: 'City of Laguna Beach', number: 'RFP 2026-31',
  contact: 'Jane Doe, jdoe@lagunabeachcity.net', submission: 'Upload to PlanetBids', foundVia: 'PlanetBids', zone: 'PT',
  milestones: [
    { kind: 'questions', date: 'December 11, 2026', time: '5:00 PM', source: 'file 4, page 1' },
    { kind: 'conference', date: 'Thursday, December 3, 2026', time: '10:00 a.m.', mandatory: true, registration: 'https://example.org/register', registerBy: 'December 1, 2026', source: 'file 4, page 2' },
    { kind: 'proposal', date: 'January 14, 2027', time: '2:00 PM', source: 'file 4, page 1' },
  ],
  notScheduled: [{ milestone: 'Interviews', why: 'only "week of February 8, 2027"', source: 'file 4, page 3' }],
});

test('printed zones, times and dates are read as the documents write them', () => {
  assert.equal(resolveZone('PT').zone, 'America/Los_Angeles');
  assert.equal(resolveZone('Eastern Standard Time').half, 'standard');
  assert.equal(resolveZone('C.S.T.').zone, 'America/Chicago');
  assert.equal(resolveZone('America/Phoenix').zone, 'America/Phoenix');
  assert.equal(resolveZone('Mars time'), null);
  assert.deepEqual(parseClock('5:00 p.m. PT'), { time: '17:00', zoneText: 'PT' });
  assert.deepEqual(parseClock('12:00 noon'), { time: '12:00', zoneText: '' });
  assert.equal(parseClock('14:30').time, '14:30');
  assert.ok(parseClock('5').error, 'a bare hour is not a time');
  assert.equal(parseWrittenDate('Friday, December 11, 2026').date, '2026-12-11');
  assert.equal(parseWrittenDate('12/11/2026').date, '2026-12-11');
  assert.match(parseWrittenDate('Monday, December 11, 2026').error, /that date is a Friday/);
  assert.ok(parseWrittenDate('week of December 7, 2026').error);
});

test('the events carry weekdays, agency time, a register-by date and only reminders still ahead', () => {
  const plan = planDates(laguna(), { slug: SLUG, now: NOW });
  assert.deepEqual(plan.events.map(event => [event.label, event.when]), [
    ['Register for the conference', 'Tue Dec 1, 2026'],
    ['Pre-proposal conference', 'Thu Dec 3, 2026, 10:00 AM PT'],
    ['Questions due', 'Fri Dec 11, 2026, 5:00 PM PT'],
    ['Proposal due', 'Thu Jan 14, 2027, 2:00 PM PT'],
  ]);
  const conference = plan.events.find(event => event.kind === 'conference');
  assert.equal(conference.at, '2026-12-03T18:00:00.000Z');
  assert.equal(conference.title, '[RFP] Laguna Beach Website Redesign — MANDATORY conference');
  assert.equal(plan.events.find(event => event.kind === 'register').title, '[RFP] Laguna Beach Website Redesign — REGISTER for conference by 12/1');
  assert.deepEqual(plan.events.find(event => event.kind === 'proposal').reminders, [14, 7, 2]);
  // On January 10 the proposal is four days away: its 2-week and 1-week reminders have passed.
  const late = planDates(laguna(), { slug: SLUG, now: new Date('2027-01-10T20:00:00Z') });
  assert.deepEqual(late.passed.map(event => event.label), ['Register for the conference', 'Pre-proposal conference', 'Questions due']);
  assert.deepEqual(late.events.find(event => event.kind === 'proposal').reminders, [2], 'reminders already past are left out');
});

test('an RFP that prints EST in summer is put on EDT, and Arizona is flagged', () => {
  const plan = planDates({ name: 'Yonkers', milestones: [
    { kind: 'proposal', date: 'July 30, 2026', time: '2:00 PM', zone: 'EST' },
    { kind: 'questions', date: 'July 16, 2026', time: '10:00 AM', zone: 'MST' },
  ] }, { slug: 'yonkers-senior-services-app', now: new Date('2026-07-01T12:00:00Z') });
  const proposal = plan.events.find(event => event.kind === 'proposal');
  assert.equal(proposal.at, '2026-07-30T18:00:00.000Z', '2 PM New York time in July is 18:00 UTC');
  assert.match(plan.notes.join('\n'), /prints "EST"; on Jul 30 the agency's clocks are on EDT/);
  assert.match(plan.needs.join('\n'), /Arizona .* America\/Phoenix/);
});

test('a field filled with "not stated" is left out instead of reaching the calendar', () => {
  const plan = planDates({ ...laguna(), contact: 'Not stated in the saved documents', foundVia: 'unknown', submission: 'N/A' }, { slug: SLUG, now: NOW });
  const details = new URL(googleCalendarLink(plan.events[0], plan.ledger.input)).searchParams.get('details');
  assert.doesNotMatch(details, /Contact:|found via|Submission:/);
  assert.match(details, /Agency: City of Laguna Beach/);
});

test('fuzzy, unreadable and zone-less dates are reported, never scheduled', () => {
  const plan = planDates({ name: 'X', milestones: [
    { kind: 'questions', date: 'TBD', time: '' },
    { kind: 'proposal', date: 'March 3, 2027', time: '3:00 PM' },
    { kind: 'other', label: 'Intent to bid due', date: 'February 1, 2027' },
  ] }, { slug: 'x', now: NOW });
  assert.deepEqual(plan.notScheduled.map(item => item.milestone), ['Questions due', 'Proposal due']);
  assert.match(plan.notScheduled[1].why, /No time zone/);
  assert.deepEqual(plan.events.map(event => [event.label, event.allDay]), [['Intent to bid due', true]], 'a date with no time is an all-day event');
});

// OpenClaw 2026.9.4 and the VM's 2026.9.9 refuse a text/calendar file attached to a reply, so the
// text carries a Google Calendar link for each event instead of a MEDIA: line.
test('a run writes the key-dates note only, and the text links each upcoming event to Google Calendar', async () => {
  const workspace = await routeWorkspace();
  const { text } = await runDates({ slug: SLUG, input: laguna(), workspace, now: NOW });
  assert.match(text, /^Send them the text between the lines word for word, links included/);
  assert.doesNotMatch(text, /MEDIA:|attach/i);
  assert.match(text, /Not scheduled \(no confirmed date\):\n• Interviews/);
  const links = linksIn(text);
  assert.equal(links.length, 4, 'one link per upcoming event');
  for (const link of links) {
    assert.equal(`${link.origin}${link.pathname}`, 'https://calendar.google.com/calendar/render');
    assert.equal(link.searchParams.get('action'), 'TEMPLATE');
  }
  const [register, conference, , proposal] = links;
  assert.equal(register.searchParams.get('dates'), '20261201/20261202', 'an all-day event ends the next day');
  assert.equal(conference.searchParams.get('dates'), '20261203T180000Z/20261203T190000Z', '10 AM Pacific, one hour');
  assert.equal(conference.searchParams.get('ctz'), 'America/Los_Angeles');
  assert.equal(conference.searchParams.get('text'), '[RFP] Laguna Beach Website Redesign — MANDATORY conference');
  assert.equal(conference.searchParams.get('details'), [
    'RFP number: RFP 2026-31', 'Agency: City of Laguna Beach', 'Contact: Jane Doe, jdoe@lagunabeachcity.net',
    'Submission: Upload to PlanetBids', 'Register: https://example.org/register', 'Source: file 4, page 2',
  ].join('\n'));
  assert.equal(proposal.searchParams.get('dates'), '20270114T220000Z/20270114T223000Z');
  assert.match(text, /Suggested reminders: .*proposal due 2 weeks, 1 week and 2 days before\./);
  const note = await fs.readFile(notePath(workspace), 'utf8');
  assert.match(note, /^# Key dates — City of Laguna Beach — Laguna Beach Website Redesign \(RFP 2026-31\)/);
  assert.match(note, /\| \*\*Proposal due\*\* \| \*\*Thu Jan 14, 2027, 2:00 PM PT\*\* \| file 4, page 1 \|/);
  const files = await fs.readdir(folderOf(workspace));
  assert.deepEqual(files.filter(name => name.startsWith('key-dates')), [`key-dates_${SLUG}.md`], 'no calendar file is written');
  const resources = await fs.readdir(path.join(folderOf(workspace), 'resources'));
  assert.ok(!resources.some(name => name.startsWith('key-dates')), 'nothing goes into resources/, which is mirrored to Drive');
});

test('a second run lists what moved, keeps the old date as "was:", and links the new date', async () => {
  const workspace = await routeWorkspace();
  await runDates({ slug: SLUG, input: laguna(), workspace, now: NOW });
  const input = laguna();
  input.milestones[2] = { kind: 'proposal', date: 'January 21, 2027', time: '2:00 PM', source: 'file 1 (Addendum 1)' };
  input.milestones.splice(1, 1); // the conference was cancelled
  const { text } = await runDates({ slug: SLUG, input, workspace, now: NOW });
  assert.match(text, /• Proposal due: Thu Jan 14, 2027, 2:00 PM PT → Thu Jan 21, 2027, 2:00 PM PT, per file 1 \(Addendum 1\)\. If you added the earlier date to your calendar, delete that event\./);
  assert.match(text, /• Pre-proposal conference \(Thu Dec 3, 2026, 10:00 AM PT\) is no longer in the documents\. Remove it from your calendar\./);
  assert.match(await fs.readFile(notePath(workspace), 'utf8'), /\(was: Thu Jan 14, 2027, 2:00 PM PT\)/);
  assert.equal(linksIn(text).at(-1).searchParams.get('dates'), '20270121T220000Z/20270121T223000Z', 'the link has the new date');
  const again = await runDates({ slug: SLUG, input, workspace, now: NOW });
  assert.match(again.text, /Changed since the dates were last given:\n• Nothing moved\./);
});

test('--merge records one date and keeps the rest; an older hand-written note is kept', async () => {
  const workspace = await routeWorkspace();
  await fs.writeFile(notePath(workspace), '# Key dates — Laguna Beach (RFP 2026-31)\n\n| Milestone | Date/time |\n|---|---|\n| Proposal due | Jan 14 |\n\n**Note:** hand-written.\n');
  await runDates({ slug: SLUG, input: laguna(), workspace, now: NOW });
  await runDates({ slug: SLUG, input: { name: 'Laguna Beach Website Redesign', zone: 'PT', milestones: [{ kind: 'questions', date: 'December 14, 2026', time: '5:00 PM', source: 'file 1' }] }, workspace, now: NOW, merge: true });
  const note = await fs.readFile(notePath(workspace), 'utf8');
  assert.match(note, /\*\*Note:\*\* hand-written\./);
  assert.equal((note.match(/key-dates:start/g) || []).length, 1, 'the maintained part is replaced, not added twice');
  const recorded = await recordedDates(SLUG, { workspace, now: NOW });
  assert.deepEqual(recorded.dates.map(item => [item.milestone, item.when, item.daysLeft]), [
    ['Register for the conference', 'Tue Dec 1, 2026', 13],
    ['Pre-proposal conference', 'Thu Dec 3, 2026, 10:00 AM PT', 15],
    ['Questions due', 'Mon Dec 14, 2026, 5:00 PM PT', 26],
    ['Proposal due', 'Thu Jan 14, 2027, 2:00 PM PT', 57],
  ]);
});

test('the router answers a date question with the recorded dates, and never asks to move first', async () => {
  const workspace = await routeWorkspace();
  await runDates({ slug: SLUG, input: laguna(), workspace, now: NOW });
  const decision = await routeRequest('When are questions due for Laguna Beach?', { workspace, now: NOW });
  assert.equal(decision.action, 'answer');
  assert.equal(decision.about, 'dates');
  assert.equal(decision.dates.dates.find(item => item.milestone === 'Questions due').when, 'Fri Dec 11, 2026, 5:00 PM PT');
  const none = await routeRequest('is there a pre-bid meeting for chandler', { workspace, now: NOW });
  assert.equal(none.action, 'answer');
  assert.equal(none.dates, null, 'no note yet: ISA reads the documents');
});

test('from the command line: the dates arrive on standard input, and an RFP with no folder is refused', async () => {
  const workspace = await routeWorkspace();
  const input = laguna();
  input.contact = 'Jane $(touch pwned) `id` Doe';
  const run = spawnSync(process.execPath, [script, '--rfp', SLUG], { input: JSON.stringify(input), env: { ...process.env, WORKSPACE_DIR: workspace }, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.ok(linksIn(run.stdout).some(link => link.searchParams.get('details').includes('Jane $(touch pwned) `id` Doe')));
  await assert.rejects(fs.access(path.join(workspace, 'pwned')));
  const show = spawnSync(process.execPath, [script, '--rfp', SLUG, '--show'], { env: { ...process.env, WORKSPACE_DIR: workspace }, encoding: 'utf8' });
  assert.match(show.stdout, /"milestone": "Proposal due"/);
  const missing = spawnSync(process.execPath, [script, '--rfp', 'pasco-county-records-system'], { input: '{}', env: { ...process.env, WORKSPACE_DIR: workspace }, encoding: 'utf8' });
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /has no folder yet.*document-fetch/);
  const bad = spawnSync(process.execPath, [script, '--rfp', SLUG], { input: 'not json', env: { ...process.env, WORKSPACE_DIR: workspace }, encoding: 'utf8' });
  assert.match(bad.stderr, /must be JSON/);
});

test('a link survives a title with parentheses and asterisks, and an all-day event spans one day', () => {
  const plan = planDates({ name: 'X', zone: 'CT', milestones: [
    { kind: 'conference', date: 'December 2, 2026', time: '9:00 AM', registrationRequired: true },
    { kind: 'proposal', date: 'December 20, 2026' },
  ] }, { slug: 'x', now: NOW });
  const proposal = plan.events.find(event => event.kind === 'proposal');
  const link = googleCalendarLink({ ...proposal, title: '[RFP] X (Phase 2) *web* — Proposal DUE' });
  // A bare parenthesis or asterisk would end or break the Markdown link ISA sends.
  assert.doesNotMatch(link, /[()*\s]/);
  assert.equal(new URL(link).searchParams.get('text'), '[RFP] X (Phase 2) *web* — Proposal DUE');
  assert.equal(new URL(link).searchParams.get('dates'), '20261220/20261221');
  assert.match(plan.needs.join('\n'), /No registration link/);
  assert.equal(plan.events.find(event => event.kind === 'register').date, '2026-12-01', 'with no sign-up deadline, register the day before');
});
