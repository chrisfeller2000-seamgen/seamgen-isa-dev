#!/usr/bin/env node
// An RFP's key dates as calendar events: the date arithmetic the calendar skill
// (skills/rfp/calendar-dates/instructions.md) used to leave to the model. ISA reads the dates
// from the RFP's documents and passes them here exactly as the documents print them; this works
// out the weekdays, the agency's real time zone (an RFP that prints "EST" in July means EDT),
// the register-by date, the reminders, what has already passed and what moved since last time.
//
//   node scripts/rfp-dates.mjs --rfp <slug> [--merge] <<'RFP_DATES_END'
//   { "name": "...", "zone": "PT", "milestones": [ { "kind": "proposal", "date": "January 21, 2027", "time": "2:00 PM", "source": "file 1, page 3" } ] }
//   RFP_DATES_END
//   node scripts/rfp-dates.mjs --rfp <slug> --show      (the dates recorded last time, no changes)
//
// It writes one file, key-dates_<slug>.md in the RFP's folder, and nothing else: the RFP's one
// key-dates note. This script owns the part between the key-dates markers; anything else in the
// note (older hand-written tables) is kept as it is. The agency questions skill and the Tuesday
// refresh read the same note, so every skill gives the same deadline. The note isn't copied to
// Drive (only resources/ is). Each upcoming date in the text ISA sends has a Google Calendar
// link; ISA never writes to anyone's calendar, the person taps the link and saves the event. Input arrives on standard input through a
// quoted heredoc, like the router's, because agency text can hold characters a shell would run.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deadlineTimestamp, parseDeadlineDate } from './rfp-deadline.mjs';
import { findRfpFolders, workspaceDir } from './rfp-folders.mjs';

const DAY_MS = 86_400_000;
const START = '<!-- key-dates:start (written by scripts/rfp-dates.mjs: run it again instead of editing this part) -->';
const END = '<!-- key-dates:end -->';
const LEDGER = /<!-- rfp-dates-ledger\n([\s\S]*?)\n-->/;

// What each kind of date is called, its reminders (days before), and how long the event is.
export const KINDS = {
  questions: { label: 'Questions due', title: 'Questions due', reminders: [3, 1], minutes: 30, order: 1 },
  conference: { label: 'Pre-proposal conference', title: 'Pre-proposal conference', reminders: [4, 1], minutes: 60, order: 2 },
  register: { label: 'Register for the conference', title: 'REGISTER for conference', reminders: [4, 1], minutes: 0, order: 3 },
  other: { label: 'Other deadline', title: '', reminders: [3, 1], minutes: 30, order: 4 },
  proposal: { label: 'Proposal due', title: 'Proposal DUE', reminders: [14, 7, 2], minutes: 30, order: 5 },
};

// Printed US zone names to the agency's real zone. `standard`/`daylight` are the printed forms
// that name one half of the year, so a mismatch with the date can be pointed out.
const ZONES = [
  { pattern: /^(?:e[sd]?t|eastern(?: (?:standard|daylight|prevailing))?(?: time)?)$/i, zone: 'America/New_York', standard: 'EST', daylight: 'EDT' },
  { pattern: /^(?:c[sd]?t|central(?: (?:standard|daylight|prevailing))?(?: time)?)$/i, zone: 'America/Chicago', standard: 'CST', daylight: 'CDT' },
  { pattern: /^(?:m[sd]?t|mountain(?: (?:standard|daylight|prevailing))?(?: time)?)$/i, zone: 'America/Denver', standard: 'MST', daylight: 'MDT' },
  { pattern: /^(?:p[sd]?t|pacific(?: (?:standard|daylight|prevailing))?(?: time)?)$/i, zone: 'America/Los_Angeles', standard: 'PST', daylight: 'PDT' },
  { pattern: /^(?:ak[sd]?t|alaska(?: (?:standard|daylight))?(?: time)?)$/i, zone: 'America/Anchorage', standard: 'AKST', daylight: 'AKDT' },
  { pattern: /^(?:hst|hawaii(?:an)?(?: standard)?(?: time)?)$/i, zone: 'Pacific/Honolulu' },
  { pattern: /^(?:ast|atlantic(?: standard)?(?: time)?)$/i, zone: 'America/Puerto_Rico' },
];
const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const validZone = zone => { try { new Intl.DateTimeFormat('en-US', { timeZone: zone }); return true; } catch { return false; } };

/** A printed zone ("PT", "EST", "Central Time") or an IANA name, as { zone, printed } or null. */
export function resolveZone(text) {
  const raw = clean(text).replace(/\./g, '');
  if (!raw) return null;
  if (raw.includes('/') && validZone(raw)) return { zone: raw, printed: raw };
  const found = ZONES.find(item => item.pattern.test(raw));
  if (!found) return null;
  const upper = raw.toUpperCase();
  const half = upper === found.standard || /standard/i.test(raw) ? 'standard' : upper === found.daylight || /daylight/i.test(raw) ? 'daylight' : null;
  return { zone: found.zone, printed: raw, half, standard: found.standard, daylight: found.daylight };
}

/** "5:00 PM", "5 p.m. PT", "17:00", "noon" → { time: "17:00", zoneText } or { error }. */
export function parseClock(text) {
  const raw = clean(text);
  if (!raw) return { time: null, zoneText: '' };
  const normalized = raw.replace(/\b([ap])\.\s?m\.?/gi, '$1m').replace(/\b12(?::00)?\s*noon\b/i, 'noon');
  if (/^noon\b/i.test(normalized)) return { time: '12:00', zoneText: clean(normalized.slice(4)) };
  const match = normalized.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b\s*(.*)$/i);
  if (!match) return { error: `I can't read the time "${raw}".` };
  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  const half = match[3]?.toLowerCase();
  if (!half && match[2] === undefined) return { error: `"${raw}" has no minutes or AM/PM.` };
  if (minute > 59 || (half ? hour < 1 || hour > 12 : hour > 23)) return { error: `I can't read the time "${raw}".` };
  if (half) hour = hour % 12 + (half === 'pm' ? 12 : 0);
  return { time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`, zoneText: clean(match[4]).replace(/^\(|\)$/g, '') };
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const weekdayOf = iso => new Date(`${iso}T12:00:00Z`).getUTCDay();
const addDays = (iso, days) => new Date(Date.parse(`${iso}T12:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

/** A date as the documents print it, with any weekday checked against the date. */
export function parseWrittenDate(text) {
  const raw = clean(text);
  const weekday = raw.match(/^(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)[a-z]*\.?,?\s+/i);
  const rest = weekday ? raw.slice(weekday[0].length) : raw;
  // US agencies write numeric dates month first (12/11/2026 is December 11).
  const parsed = parseDeadlineDate(rest.replace(/,\s*(\d{4})$/, ', $1'), { dateFormat: 'MDY' });
  if (parsed.status !== 'valid') return { error: `I can't read the date "${raw}" (${parsed.reason.replace(/\.$/, '').toLowerCase()}).` };
  if (weekday) {
    const said = WEEKDAYS.findIndex(day => day.startsWith(weekday[1].toLowerCase().slice(0, 3)));
    const actual = weekdayOf(parsed.date);
    if (said !== actual) return { error: `The document says ${cap(WEEKDAYS[said])} ${rest}, but that date is a ${cap(WEEKDAYS[actual])}. One of them is wrong.`, date: parsed.date };
  }
  return { date: parsed.date };
}
const cap = word => word.charAt(0).toUpperCase() + word.slice(1);

function zoneParts(timestamp, zone) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).formatToParts(new Date(timestamp));
  const part = type => parts.find(item => item.type === type)?.value || '';
  const generic = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'shortGeneric' }).formatToParts(new Date(timestamp)).find(item => item.type === 'timeZoneName')?.value || '';
  return { weekday: part('weekday'), month: part('month'), day: part('day'), year: part('year'), clock: `${part('hour')}:${part('minute')} ${part('dayPeriod')}`, abbreviation: part('timeZoneName'), generic };
}
const dayText = iso => {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).formatToParts(new Date(`${iso}T12:00:00Z`));
  const part = type => parts.find(item => item.type === type).value;
  return `${part('weekday')} ${part('month')} ${part('day')}, ${part('year')}`;
};
const dateInZone = (timestamp, zone) => new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(timestamp));
const dayWords = days => (days % 7 === 0 ? `${days / 7} week${days === 7 ? '' : 's'}` : `${days} day${days === 1 ? '' : 's'}`);
const listWords = items => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`);

/**
 * Turns ISA's input into events. Pure: `previous` is the last run's ledger and `now` the clock.
 * Returns { events, passed, notScheduled, changed, needs, notes, ledger }.
 */
export function planDates(rawInput, { slug, previous = null, now = new Date(), merge = false } = {}) {
  const input = withoutFillers(rawInput);
  const needs = [...(input.needs || []).map(clean).filter(Boolean)];
  const notes = [];
  const notScheduled = (input.notScheduled || []).map(item => ({ milestone: clean(item.milestone), why: clean(item.why), source: clean(item.source) }));
  const name = clean(input.name) || slug;
  let milestones = (input.milestones || []).map(item => ({ ...item, kind: KINDS[item.kind] ? item.kind : 'other' }));
  if (merge && previous?.input?.milestones) {
    const given = new Set(milestones.map(item => item.kind === 'other' ? `other:${clean(item.label)}` : item.kind));
    milestones = [...previous.input.milestones.filter(item => !given.has(item.kind === 'other' ? `other:${clean(item.label)}` : item.kind)), ...milestones];
  }
  const defaultZone = clean(input.zone);
  const events = [];

  for (const item of milestones) {
    const kind = KINDS[item.kind];
    const label = item.kind === 'other' ? clean(item.label) || kind.label : kind.label;
    const source = clean(item.source);
    const skip = why => notScheduled.push({ milestone: label, why, source });
    const date = parseWrittenDate(item.date);
    if (date.error) { skip(date.error); continue; }
    const clock = parseClock(item.time);
    if (clock.error) { skip(clock.error); continue; }
    const base = { kind: item.kind, key: item.kind === 'other' ? `other-${slugWords(label)}` : item.kind, label, source, note: clean(item.note),
      registration: clean(item.registration), mandatory: Boolean(item.mandatory) };
    if (!clock.time) {
      events.push({ ...base, allDay: true, date: date.date, when: dayText(date.date), noTime: true });
    } else {
      const zoneText = clean(item.zone) || clock.zoneText || defaultZone;
      const zone = resolveZone(zoneText);
      if (!zone) { skip(zoneText ? `I don't know the time zone "${zoneText}"; give the agency's zone, for example America/Chicago.` : 'No time zone: give the agency\'s zone (the city or state the RFP is from).'); continue; }
      const at = deadlineTimestamp(date.date, clock.time, zone.zone);
      if (!at) { skip(`${clock.time} on ${date.date} doesn't exist in ${zone.zone} (the clocks change that night). Check the documents.`); continue; }
      const parts = zoneParts(at, zone.zone);
      if (zone.half) {
        const actual = parts.abbreviation;
        const printed = zone.half === 'standard' ? zone.standard : zone.daylight;
        if (actual !== printed && /^[A-Z]{3,4}$/.test(actual)) {
          notes.push(`${label}: the RFP prints "${zone.printed}"; on ${parts.month} ${parts.day} the agency's clocks are on ${actual}, so the event is at ${parts.clock} agency time.`);
          if (zone.zone === 'America/Denver' && zone.half === 'standard') needs.push(`${label}: printed "${zone.printed}". If the agency is in Arizona (no daylight time), run this again with zone America/Phoenix.`);
        }
      }
      events.push({ ...base, allDay: false, at, zone: zone.zone, when: `${parts.weekday} ${parts.month} ${parts.day}, ${parts.year}, ${parts.clock} ${parts.generic}` });
    }
    if (item.kind === 'conference' && (item.registration || item.registerBy || item.registrationRequired)) {
      const conference = events.at(-1);
      let registerBy = conference.allDay ? addDays(conference.date, -1) : addDays(dateInZone(conference.at, conference.zone), -1);
      let byWhy = 'the day before the conference (no separate sign-up deadline in the documents)';
      if (item.registerBy) {
        const by = parseWrittenDate(item.registerBy);
        if (by.error) needs.push(`Registration deadline: ${by.error}`);
        else { registerBy = by.date; byWhy = 'the sign-up deadline'; }
      }
      const [, month, day] = registerBy.split('-').map(Number);
      events.push({ ...base, kind: 'register', key: 'register', label: KINDS.register.label, allDay: true, date: registerBy, when: dayText(registerBy), byWhy, byShort: `${month}/${day}` });
      if (!item.registration) needs.push('No registration link in the documents: find where to sign up before the register-by date.');
    }
  }

  const today = zone => dateInZone(now, zone || 'America/Los_Angeles');
  const upcoming = [], passed = [];
  for (const event of events) {
    const isPast = event.allDay ? event.date < today(defaultZoneOf(events, input)) : Date.parse(event.at) < now.getTime();
    event.stamp = event.allDay ? `${event.date} all-day` : event.at;
    event.title = titleOf(name, event);
    event.reminders = KINDS[event.kind].reminders.filter(days => event.allDay
      ? addDays(event.date, -days) > today(defaultZoneOf(events, input))
      : Date.parse(event.at) - days * DAY_MS > now.getTime());
    (isPast ? passed : upcoming).push(event);
  }
  upcoming.sort(byTime);
  passed.sort(byTime);

  // What moved since the last run, by milestone.
  const changed = [];
  const before = previous?.events || {};
  const history = {};
  for (const event of events) {
    const old = before[event.key];
    history[event.key] = { stamp: event.stamp, when: event.when, was: old?.was || [] };
    if (old && old.stamp !== event.stamp) {
      changed.push({ label: event.label, from: old.when, to: event.when, source: event.source });
      history[event.key].was = [old.when, ...(old.was || [])].slice(0, 5);
    }
  }
  if (!merge) {
    const unsure = new Set(notScheduled.map(item => item.milestone));
    for (const [key, old] of Object.entries(before)) {
      if (history[key]) continue;
      // A date that can't be confirmed this time is kept, so a later run can tell whether it moved.
      if (unsure.has(old.label)) { history[key] = old; changed.push({ label: old.label, from: old.when, to: null, unsure: true }); continue; }
      changed.push({ label: old.label || key, from: old.when, to: null, source: '' });
    }
  } else {
    for (const [key, old] of Object.entries(before)) if (!history[key]) history[key] = old;
  }
  for (const [key, entry] of Object.entries(history)) entry.label = entry.label || events.find(event => event.key === key)?.label || before[key]?.label || key;

  const ledger = { given: today(defaultZoneOf(events, input)), input: { ...input, milestones }, events: history };
  return { name, events: upcoming, passed, notScheduled, changed, needs: [...new Set(needs)], notes, ledger, first: !previous };
}

// In local tests ISA filled fields the documents don't give with "Not stated in the saved
// documents", which would land in every event's description. Such a field is left out instead.
const FILLER = /^(?:not (?:stated|given|listed|found|provided|specified|in)\b|unknown$|n\/?a$|none$|tbd$|-$)/i;
const DETAIL_FIELDS = ['agency', 'number', 'contact', 'submission', 'foundVia'];
function withoutFillers(input = {}) {
  const out = { ...input };
  for (const field of DETAIL_FIELDS) if (FILLER.test(clean(out[field]))) delete out[field];
  out.milestones = (input.milestones || []).map(item => {
    const copy = { ...item };
    for (const field of ['registration', 'registerBy', 'note', 'source']) if (FILLER.test(clean(copy[field]))) delete copy[field];
    return copy;
  });
  return out;
}

const slugWords = text => clean(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'date';
const byTime = (a, b) => (a.allDay ? Date.parse(`${a.date}T00:00:00Z`) : Date.parse(a.at)) - (b.allDay ? Date.parse(`${b.date}T00:00:00Z`) : Date.parse(b.at)) || KINDS[a.kind].order - KINDS[b.kind].order;
const defaultZoneOf = (events, input) => events.find(event => event.zone)?.zone || resolveZone(input.zone)?.zone || 'America/Los_Angeles';

function titleOf(name, event) {
  const kind = KINDS[event.kind];
  let what = event.kind === 'other' ? event.label : kind.title;
  if (event.kind === 'conference' && event.mandatory) what = 'MANDATORY conference';
  if (event.kind === 'register') what = `${kind.title} by ${event.byShort}`;
  return `[RFP] ${name} — ${what}${event.note ? ` (${event.note})` : ''}`;
}

// ---- Google Calendar links -----------------------------------------------------------------

// OpenClaw won't attach a .ics file to a reply. Its check on local files ISA attaches allows
// images, audio, video, PDF, Office files, archives and plain text, and refuses text/calendar
// (HOST_READ_ALLOWED_DOCUMENT_MIMES in OpenClaw 2026.9.4 and the VM's 2026.9.9; the reply then
// goes out with a "couldn't attach" note). So each event is a Google Calendar "add event" link in
// the message instead. ISA still never writes to a calendar: the person taps the link and saves.
// A link can't carry reminders, so the event gets the person's default Google notifications.
const GOOGLE_CALENDAR = 'https://calendar.google.com/calendar/render';
const googleStamp = iso => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/** A Google Calendar link that opens the event, filled in, for the person to save. */
export function googleCalendarLink(event, input = {}) {
  const details = [
    input.number && `RFP number: ${clean(input.number)}`,
    input.agency && `Agency: ${clean(input.agency)}`,
    input.contact && `Contact: ${clean(input.contact)}`,
    input.submission && `Submission: ${clean(input.submission)}`,
    event.registration && `Register: ${event.registration}`,
    event.kind === 'register' && `Register by ${event.byWhy}.`,
    event.noTime && 'The documents give no time for this date.',
    event.source && `Source: ${event.source}`,
  ].filter(Boolean).join('\n');
  const minutes = Number(event.minutes) || KINDS[event.kind].minutes;
  // All-day events end on the next day, as in Google's own links; timed ones are given in UTC.
  const dates = event.allDay
    ? `${event.date.replace(/-/g, '')}/${addDays(event.date, 1).replace(/-/g, '')}`
    : `${googleStamp(event.at)}/${googleStamp(new Date(Date.parse(event.at) + minutes * 60_000).toISOString())}`;
  const params = new URLSearchParams({ action: 'TEMPLATE', text: event.title, details });
  if (event.zone) params.set('ctz', event.zone);
  // The link goes into a Markdown link, which a bare parenthesis or asterisk would break. `dates`
  // holds only digits, T, Z and the slash, kept as Google's own links write it.
  return `${GOOGLE_CALENDAR}?${params.toString().replace(/[()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)}&dates=${dates}`;
}

// ---- The key-dates note ---------------------------------------------------------------------

export function renderBlock(plan, { input = {} }) {
  const rows = [...plan.passed, ...plan.events].sort(byTime).map(event => {
    const was = plan.ledger.events[event.key]?.was?.[0];
    const passed = plan.passed.includes(event) ? ' (passed)' : '';
    const cell = `${event.when}${passed}${was ? ` (was: ${was})` : ''}`;
    return event.kind === 'proposal' ? `| **${event.label}** | **${cell}** | ${event.source || ''} |` : `| ${event.label} | ${cell} | ${event.source || ''} |`;
  });
  const out = [START, `Source (found via): ${clean(input.foundVia) || 'not given'}`, `Last given: ${plan.ledger.given}`, '',
    '| Milestone | Date/time (agency time) | Source |', '|---|---|---|', ...rows];
  if (plan.notScheduled.length) out.push('', 'Not scheduled (no confirmed date):', ...plan.notScheduled.map(item => `- ${item.milestone}: ${item.why}${item.source ? ` (${item.source})` : ''}`));
  if (plan.notes.length) out.push('', ...plan.notes.map(note => `**Note:** ${note}`));
  out.push('', `<!-- rfp-dates-ledger\n${JSON.stringify(plan.ledger, null, 1)}\n-->`, END);
  return out.join('\n');
}

export function mergeNote(existing, block, { title }) {
  if (!existing) return `# Key dates — ${title}\n\n${block}\n`;
  const start = existing.indexOf(START.slice(0, 22));
  const end = existing.indexOf(END);
  if (start >= 0 && end > start) return `${existing.slice(0, start)}${block}${existing.slice(end + END.length)}`;
  // An older hand-written note: keep it, and add the maintained part below it.
  return `${existing.trimEnd()}\n\n## Calendar dates\n\n${block}\n`;
}

export function readLedger(note) {
  const match = String(note || '').match(LEDGER);
  if (!match) return null;
  try { return JSON.parse(match[1]); } catch { return null; }
}

// ---- What ISA sends -------------------------------------------------------------------------

export function renderChat(plan, { notePath }) {
  const out = [`Key dates for ${plan.name} (agency time):`];
  if (!plan.events.length) out.push('• Nothing still ahead.');
  for (const event of plan.events) {
    const was = plan.changed.find(change => change.label === event.label && change.to);
    out.push(`• ${event.label}: ${event.when}${event.noTime ? ' (no time given)' : ''}${was ? ` (moved from ${was.from})` : ''}${event.kind === 'register' ? ` (${event.byWhy})` : ''}`
      + ` — [Add to Google Calendar](${googleCalendarLink(event, plan.ledger.input)})`);
  }
  if (plan.passed.length) out.push('', 'Already passed:', ...plan.passed.map(event => `• ${event.label}: ${event.when}`));
  if (!plan.first) {
    out.push('', 'Changed since the dates were last given:');
    if (!plan.changed.length) out.push('• Nothing moved.');
    for (const change of plan.changed) {
      out.push(change.to
        ? `• ${change.label}: ${change.from} → ${change.to}${change.source ? `, per ${change.source}` : ''}. If you added the earlier date to your calendar, delete that event.`
        : change.unsure
          ? `• ${change.label} (${change.from}) can't be confirmed now; see "Not scheduled". Check it before relying on the old event.`
          : `• ${change.label} (${change.from}) is no longer in the documents. Remove it from your calendar.`);
    }
  }
  if (plan.notScheduled.length) out.push('', 'Not scheduled (no confirmed date):', ...plan.notScheduled.map(item => `• ${item.milestone}: ${item.why}${item.source ? ` (${item.source})` : ''}`));
  if (plan.notes.length) out.push('', ...plan.notes.map(note => `Note: ${note}`));
  if (plan.needs.length) out.push('', 'Needs your action:', ...plan.needs.map(item => `• ${item}`));
  if (plan.events.length) {
    const reminders = plan.events.filter(event => event.reminders.length)
      .map(event => `${event.label.toLowerCase()} ${listWords(event.reminders.map(dayWords))} before`);
    out.push('', 'Tap "Add to Google Calendar" next to a date, then Save. A link can\'t set reminders, so your calendar\'s default notification applies.'
      + (reminders.length ? ` Suggested reminders: ${reminders.join('; ')}.` : ''));
  }
  const relay = ['Send them the text between the lines word for word, links included. They can\'t see this output.', '-----', ...out, '-----'];
  relay.push(`(Key-dates note, not for the chat: ${notePath})`);
  return relay.join('\n');
}

// ---- Files ----------------------------------------------------------------------------------

async function rfpFolder(slug, workspace) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(String(slug || ''))) throw new Error('That is not an RFP slug.');
  const folders = await findRfpFolders(slug, { workspace });
  if (!folders.length) throw new Error(`${slug} has no folder yet, so its documents aren't saved. Follow skills/rfp/document-fetch/instructions.md first.`);
  if (folders.length > 1) throw new Error(`${slug} has folders in ${folders.map(item => item.stage.dir).join(' and ')}. Ask a developer to merge them.`);
  return folders[0].dir;
}
const notePathOf = (dir, slug) => path.join(dir, `key-dates_${slug}.md`);
async function writeAtomic(file, text) {
  const temp = `${file}.tmp-${process.pid}`;
  await fs.writeFile(temp, text, 'utf8');
  await fs.rename(temp, file);
}

/** Plans, writes the key-dates note, and returns the text for ISA. */
export async function runDates({ slug, input, workspace = workspaceDir(), now = new Date(), merge = false }) {
  const dir = await rfpFolder(slug, workspace);
  const notePath = notePathOf(dir, slug);
  const existing = await fs.readFile(notePath, 'utf8').catch(() => '');
  const plan = planDates(input, { slug, previous: readLedger(existing), now, merge });
  const relative = file => path.relative(workspace, file).split(path.sep).join('/');
  const title = [clean(input.agency), plan.name, clean(input.number) && `(${clean(input.number)})`].filter(Boolean).join(' — ').replace(' — (', ' (');
  await writeAtomic(notePath, mergeNote(existing, renderBlock(plan, { input: plan.ledger.input }), { title }));
  return { plan, text: renderChat(plan, { notePath: relative(notePath) }) };
}

/** The dates recorded last time, worked out again against today. Null when none are recorded. */
export async function recordedDates(slug, { workspace = workspaceDir(), now = new Date() } = {}) {
  let dir;
  try { dir = await rfpFolder(slug, workspace); } catch { return null; }
  const notePath = notePathOf(dir, slug);
  const ledger = readLedger(await fs.readFile(notePath, 'utf8').catch(() => ''));
  if (!ledger?.input) return null;
  const plan = planDates(ledger.input, { slug, previous: ledger, now });
  return {
    recorded: ledger.given,
    note: path.relative(workspace, notePath).split(path.sep).join('/'),
    dates: [...plan.passed, ...plan.events].sort(byTime).map(event => {
      const zone = event.zone || defaultZoneOf(plan.events, ledger.input);
      const day = event.allDay ? event.date : dateInZone(event.at, zone);
      const passed = plan.passed.includes(event);
      return { milestone: event.label, when: event.when, passed, daysLeft: passed ? 0 : Math.round((Date.parse(day) - Date.parse(dateInZone(now, zone))) / DAY_MS), source: event.source || null };
    }),
    notScheduled: plan.notScheduled,
  };
}

async function readStdin() {
  if (process.stdin.isTTY) return '';
  let text = '';
  for await (const chunk of process.stdin) text += chunk;
  return text;
}

const USAGE = `Usage: node scripts/rfp-dates.mjs --rfp <slug> [--merge] <<'RFP_DATES_END'
{ "name": "<short RFP name>", "agency": "...", "number": "...", "contact": "...", "submission": "...", "foundVia": "...", "zone": "<agency zone, e.g. PT>",
  "milestones": [ { "kind": "questions|conference|proposal|other", "date": "<as printed>", "time": "<as printed>", "source": "file <n>, page <p>" } ],
  "notScheduled": [ { "milestone": "...", "why": "...", "source": "..." } ] }
RFP_DATES_END
   or: node scripts/rfp-dates.mjs --rfp <slug> --show`;

export async function main(args = process.argv.slice(2), { workspace = workspaceDir(), now = new Date(), stdin = readStdin } = {}) {
  const slug = args[args.indexOf('--rfp') + 1];
  if (!args.includes('--rfp') || !slug || slug.startsWith('--')) { process.stderr.write(`${USAGE}\n`); process.exitCode = 1; return; }
  if (args.includes('--show')) {
    const recorded = await recordedDates(slug, { workspace, now });
    process.stdout.write(recorded ? `${JSON.stringify(recorded, null, 2)}\n` : `No key dates are recorded for ${slug}. Read them from its documents.\n`);
    return;
  }
  const raw = (await stdin()).trim();
  let input;
  try { input = JSON.parse(raw); } catch { process.stderr.write(`The dates must be JSON on standard input.\n${USAGE}\n`); process.exitCode = 1; return; }
  const { text } = await runDates({ slug, input, workspace, now, merge: args.includes('--merge') });
  process.stdout.write(`${text}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`Dates failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
