// Pure deadline decisions: importing this module never reads credentials or runs a job.
const DAY_MS = 86_400_000;
const MONTH = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?';
const DATE_TOKEN = `(?<![\\w/-])(?:\\d{4}-\\d{2}-\\d{2}|\\d{1,2}/\\d{1,2}/\\d{2,4}|${MONTH}\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+\\d{4}|\\d{1,2}\\s+${MONTH},?\\s+\\d{4})(?![\\w/-])`;
// What agencies call the thing being submitted. Wording seen in the October 9 documents.
const SUBMITTED = '(?:proposals?|bids?|offers?|responses?|submittals?|submissions?|qualifications|quotes?|quotations?)';
const PROPOSAL_LABEL = new RegExp(`\\b(?:(?:sealed\\s+)?${SUBMITTED}\\s+(?:(?:are\\s+|is\\s+)?due(?:\\s+date)?|deadline|submission(?:\\s+(?:date|deadline))?`
  + `|(?:shall\\s+|must\\s+|will\\s+)?be\\s+(?:electronically\\s+)?(?:received|submitted|accepted)(?:\\s+(?:no\\s+later\\s+than|by|until|before|on\\s+or\\s+before))?`
  + `|(?:received|submitted)\\s+(?:by|no\\s+later\\s+than))|submi(?:ssion|ttal)\\s+(?:date|deadline|due)`
  + `|(?:due\\s+date|deadline)\\s+(?:for\\s+(?:receipt\\s+of\\s+)?|to\\s+submit\\s+)?(?:the\\s+)?(?:rf[pq]\\s+)?${SUBMITTED}`
  + `|submit\\s+(?:your\\s+|all\\s+|the\\s+)?${SUBMITTED})\\b`, 'gi');
const OTHER_LABEL = /\b(?:approved|revised|revision|published|publication|issued|questions?|q\s*&\s*a|clarifications?|(?:bid|proposal)\s+opening|meeting|contract\s+(?:start|end|term)|availability)\b/gi;
// "No later than <date>" is a submission deadline only when the clause leading into it
// is about submitting the proposal, not questions, invoices, or other paperwork.
const CUTOFF_PHRASE = /\b(?:no|not)\s+later\s+than\b|\bon\s+or\s+before\b|\breceived\s+(?:until|before)\b/gi;
// A noun, not just "submitted": "...emailed to <address> and submitted no later than" is a question cutoff.
const SUBMISSION_CONTEXT = new RegExp(`\\b${SUBMITTED}\\b`, 'i');
const OTHER_CONTEXT = /\b(?:questions?|inquir\w*|clarifications?|q\s*&\s*a|rfi|invoices?|billings?|payments?|reports?|protests?|appeals?|references?|insurance|certificates?)\b/i;
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();

function isoDate(year, month, day) {
  if (!Number.isInteger(year) || year < 1000 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function parseDeadlineDate(value, { dateFormat, corroboratingDates = [] } = {}) {
  const raw = clean(value);
  if (!raw || /^(?:unknown|none|tbd|n\/a)$/i.test(raw)) return { status: 'missing', date: null, reason: 'No submission date provided.' };
  let match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    const date = isoDate(Number(match[1]), Number(match[2]), Number(match[3]));
    return { status: date ? 'valid' : 'invalid', date, reason: date ? '' : 'Invalid calendar date.' };
  }
  match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (match) {
    const a = Number(match[1]), b = Number(match[2]), year = match[3];
    if (year.length === 2) {
      const matches = corroboratingDates.filter(date => {
        const m = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        return m && isoDate(Number(m[1]), Number(m[2]), Number(m[3])) === date && m[1].endsWith(year) &&
          ((dateFormat !== 'DMY' && Number(m[2]) === a && Number(m[3]) === b) ||
           (dateFormat !== 'MDY' && Number(m[2]) === b && Number(m[3]) === a));
      });
      const dates = [...new Set(matches)];
      return dates.length === 1
        ? { status: 'valid', date: dates[0], reason: 'Two-digit year corroborated by a four-digit date.' }
        : { status: 'ambiguous', date: null, reason: 'Two-digit year needs corroborating evidence.' };
    }
    const choices = [...new Set([
      dateFormat !== 'DMY' ? isoDate(Number(year), a, b) : null,
      dateFormat !== 'MDY' ? isoDate(Number(year), b, a) : null,
    ].filter(Boolean))];
    if (choices.length === 1) return { status: 'valid', date: choices[0], reason: '' };
    if (!choices.length) return { status: 'invalid', date: null, reason: 'Invalid calendar date.' };
    const corroborated = choices.filter(date => corroboratingDates.includes(date));
    if (corroborated.length === 1) return { status: 'valid', date: corroborated[0], reason: 'Numeric format corroborated.' };
    return { status: 'ambiguous', date: null, reason: 'Numeric day/month order is ambiguous.' };
  }
  match = raw.match(new RegExp(`^(${MONTH})\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})$`, 'i'));
  if (match) {
    const date = isoDate(Number(match[3]), MONTHS.indexOf(match[1].slice(0, 3).toLowerCase()) + 1, Number(match[2]));
    return { status: date ? 'valid' : 'invalid', date, reason: date ? '' : 'Invalid calendar date.' };
  }
  match = raw.match(new RegExp(`^(\\d{1,2})\\s+(${MONTH}),?\\s+(\\d{4})$`, 'i'));
  if (match) {
    const date = isoDate(Number(match[3]), MONTHS.indexOf(match[2].slice(0, 3).toLowerCase()) + 1, Number(match[1]));
    return { status: date ? 'valid' : 'invalid', date, reason: date ? '' : 'Invalid calendar date.' };
  }
  return { status: 'invalid', date: null, reason: 'Unsupported or invalid date format.' };
}

function dateInZone(timestamp, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(timestamp));
  const part = type => parts.find(p => p.type === type).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function createAssessmentContext({ now = new Date(), runDate = '', reportingTimeZone = 'UTC' } = {}) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new Error('Assessment timestamp is invalid.');
  try { dateInZone(now, reportingTimeZone); } catch { throw new Error('Assessment timezone is invalid.'); }
  const override = clean(runDate);
  if (override && !/^\d{4}-\d{2}-\d{2}$/.test(override)) throw new Error('RFP_RUN_DATE must be a valid YYYY-MM-DD date.');
  const parsed = override ? parseDeadlineDate(override) : null;
  if (parsed && parsed.status !== 'valid') throw new Error('RFP_RUN_DATE must be a valid YYYY-MM-DD date.');
  return {
    runDate: parsed?.date || dateInZone(now, reportingTimeZone),
    // A date-only historical override is not an invented midnight submission clock.
    assessmentTimestamp: override ? null : now.toISOString(),
    reportingTimeZone,
    overrideUsed: Boolean(override),
  };
}

function timingFromText(text) {
  const normalized = clean(text).replace(/\b([ap])\.?\s*m\.?/gi, '$1m');
  const m = normalized.match(/\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b|\b(?:at\s+)?(\d{1,2}):(\d{2})(?!\d)/i);
  if (!m) return { time: null, timeZone: null, invalidTime: false };
  let hour = Number(m[1] ?? m[4]), minute = Number(m[2] ?? m[5] ?? 0);
  if (minute > 59 || (m[3] ? hour < 1 || hour > 12 : hour > 23)) return { time: null, timeZone: null, invalidTime: true };
  if (m[3]) hour = hour % 12 + (m[3].toLowerCase() === 'pm' ? 12 : 0);
  const zoneText = normalized.slice(m.index + m[0].length);
  const offset = zoneText.match(/\b(?:UTC|GMT)\s*([+-])(\d{1,2})(?::(\d{2}))?\b/i);
  if (offset && (Number(offset[2]) > 14 || Number(offset[3] || 0) > 59 || (Number(offset[2]) === 14 && Number(offset[3] || 0) !== 0))) {
    return { time: null, timeZone: null, invalidTime: true };
  }
  const zones = [
    [/Atlantic Standard Time|\bAST\b/i, '-04:00'],
    [/Eastern Standard Time|\bEST\b/i, '-05:00'],
    [/Eastern Daylight Time|\bEDT\b/i, '-04:00'],
    [/Central Standard Time/i, '-06:00'],
    [/Central Daylight Time|\bCDT\b/i, '-05:00'],
    [/Mountain Standard Time/i, '-07:00'],
    [/Mountain Daylight Time|\bMDT\b/i, '-06:00'],
    [/Pacific Standard Time|\bPST\b/i, '-08:00'],
    [/Pacific Daylight Time|\bPDT\b/i, '-07:00'],
    [/Eastern Time|\bET\b/i, 'America/New_York'],
    [/Central Time|\bCT\b/i, 'America/Chicago'],
    [/Mountain Time|\bMT\b/i, 'America/Denver'],
    [/Pacific Time|\bPT\b/i, 'America/Los_Angeles'],
    [/\bUTC\b|\bGMT\b/i, 'UTC'],
  ];
  return {
    time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    timeZone: offset ? `${offset[1]}${offset[2].padStart(2, '0')}:${offset[3] || '00'}` : zones.find(([pattern]) => pattern.test(zoneText))?.[1] || null,
    invalidTime: false,
  };
}

// Fixed standard-time offsets are kept as offsets: AST does not observe US DST.
export function deadlineTimestamp(date, time, timeZone) {
  if (!time || !timeZone) return null;
  if (/^[+-]\d{2}:\d{2}$/.test(timeZone) || timeZone === 'UTC') return new Date(`${date}T${time}:00${timeZone === 'UTC' ? 'Z' : timeZone}`).toISOString();
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const target = `${date}T${time}`;
  const stamp = value => {
    const parts = formatter.formatToParts(new Date(value));
    const p = type => parts.find(item => item.type === type).value;
    return `${p('year')}-${p('month')}-${p('day')}T${p('hour')}:${p('minute')}`;
  };
  const nominal = Date.parse(`${target}:00Z`);
  const matches = [];
  // Validate the local clock across real offsets, including DST gaps and folds.
  for (let offset = -14 * 60; offset <= 14 * 60; offset += 15) {
    const candidate = nominal - offset * 60_000;
    if (stamp(candidate) === target) matches.push(candidate);
  }
  return matches.length === 1 ? new Date(matches[0]).toISOString() : null;
}

// The clause leading into a cutoff phrase: back to the sentence end, at most one line break.
function cutoffIsSubmission(text, index) {
  const lead = text.slice(Math.max(0, index - 240), index).replace(/\b([ap])\.\s?m\./gi, '$1m')
    .split(/[!?;]|\.(?=\s)/).at(-1).split('\n').slice(-2).join(' ');
  return SUBMISSION_CONTEXT.test(lead) && !OTHER_CONTEXT.test(lead);
}

function documentCandidates(document) {
  if (document.applicable === false || document.official === false) return [];
  const text = String(document.text || '').replace(/\r/g, '');
  // "Question Submission Deadline" and "Question Response Deadline" are question dates.
  const afterQuestion = index => /\b(?:questions?|q\s*&\s*a|inquir(?:y|ies)|clarifications?)\s*$/i.test(text.slice(Math.max(0, index - 30), index).split('\n').at(-1));
  const labels = [
    ...[...text.matchAll(PROPOSAL_LABEL)].map(match => ({ match, proposal: !afterQuestion(match.index) })),
    ...[...text.matchAll(OTHER_LABEL)].map(match => ({ match, proposal: false })),
    ...[...text.matchAll(CUTOFF_PHRASE)].map(match => ({ match, proposal: cutoffIsSubmission(text, match.index) })),
  ].map(({ match, proposal }) => ({ index: match.index, end: match.index + match[0].length, proposal })).sort((a, b) => a.index - b.index);
  const format = document.dateFormat || (/\bMM\/DD\/YYYY\b|month\/day\/year/i.test(text) ? 'MDY' : /\bDD\/MM\/YYYY\b|day\/month\/year/i.test(text) ? 'DMY' : undefined);
  const candidates = [];
  for (const token of text.matchAll(new RegExp(DATE_TOKEN, 'gi'))) {
    const before = labels.filter(label => label.end <= token.index).at(-1);
    const after = labels.find(label => label.index >= token.index + token[0].length);
    const prefix = before ? text.slice(before.end, token.index) : '';
    // Abbreviation and section-number dots ("Wed.", "ref. Section 2.1") don't end a sentence.
    const prefixWithoutWeekday = prefix.replace(/\b([ap])\.?\s*m\.?/gi, '$1m').replace(/\b(?:mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun|ref|sec)\./gi, '')
      .replace(/(\d)\.(?=\d)/g, '$1');
    // A label covers the first date after it, across up to two line breaks (blank lines
    // don't count); a later date in a schedule table belongs to its own row, except the
    // new date in "extended from <date> to <date>".
    const afterEarlierDate = prefixWithoutWeekday.split(new RegExp(DATE_TOKEN, 'gi'));
    const laterRow = afterEarlierDate.length > 1 && !/^[^.\n]{0,25}\bto\s*$/i.test(afterEarlierDate.at(-1));
    const beforeNear = before && prefix.length <= 160 && (prefix.replace(/\n[ \t]*(?=\n)/g, '').match(/\n/g) || []).length <= 2
      && !laterRow && !/[.!?;]/.test(prefixWithoutWeekday) && !/not (?:set|posted|available)|unknown|unavailable|to be determined|\btbd\b/i.test(prefix);
    const betweenDateAndLabel = after ? text.slice(token.index + token[0].length, after.index) : '';
    const afterNear = after && after.index - token.index < 100 && !/[\n.!?;]/.test(betweenDateAndLabel);
    // Date-before-label timetable rows may follow an unrelated row on the prior line.
    const useAfter = afterNear && after.proposal && (!beforeNear || prefix.includes('\n'));
    const label = useAfter ? after : beforeNear ? before : null;
    if (!label?.proposal) continue;
    const tailEnd = after ? after.index : Math.min(text.length, token.index + token[0].length + 120);
    // A time before an earlier date belongs to that date ("from 10/12 3:00 PM to 10/26 10:00 AM").
    const timePrefix = useAfter || new RegExp(DATE_TOKEN, 'i').test(prefix) ? '' : prefix;
    const timing = timingFromText(timePrefix + ' ' + text.slice(token.index + token[0].length, tailEnd));
    candidates.push({
      raw: token[0], dateFormat: format, ...timing,
      source: { type: 'official-document', file: document.name || 'unnamed-document', section: `line ${text.slice(0, token.index).split('\n').length}` },
      document,
    });
  }
  return candidates;
}

function extensionsFromDocuments(documents, corroboratingDates) {
  const extensions = [];
  for (const document of documents) {
    if (document.applicable === false || document.official === false) continue;
    const text = clean(document.text);
    if (!/\b(?:addendum|amendment)\b[^\n]{0,15}?\d+/i.test(text)) continue;
    // Also "the deadline for submission of proposals is extended from 10/12/2026 03:00 PM to ...".
    const clock = '(?:\\s+(?:at\\s+)?\\d{1,2}(?::\\d{2})?\\s*[ap]\\.?m\\.?)?';
    const regex = new RegExp(`(?:(?:proposal|bid|submission)\\s+(?:deadline|due\\s+date)|deadline\\s+for\\s+(?:the\\s+)?submission\\s+of\\s+(?:proposals?|bids?|responses?))[^.]{0,60}?(?:extended|changed|moved|revised)[^.]{0,30}?from\\s+(${DATE_TOKEN})${clock}\\s+to\\s+(${DATE_TOKEN})`, 'gi');
    for (const match of text.matchAll(regex)) {
      const from = parseDeadlineDate(match[1], { dateFormat: document.dateFormat, corroboratingDates });
      const to = parseDeadlineDate(match[2], { dateFormat: document.dateFormat, corroboratingDates });
      if (from.date && to.date && from.date !== to.date) extensions.push({ from: from.date, to: to.date, file: document.name });
    }
  }
  return extensions;
}

export function timelinePoints(days) {
  if (!Number.isFinite(days)) return 0;
  return days >= 30 ? 5 : days >= 21 ? 4 : days >= 16 ? 3 : days >= 11 ? 2 : 0;
}

export function assessDeadline({ metadataDueDate = '', documents = [], assessment = createAssessmentContext() } = {}) {
  const metadata = parseDeadlineDate(metadataDueDate);
  const raw = documents.flatMap(documentCandidates);
  const unambiguous = raw.map(row => parseDeadlineDate(row.raw, { dateFormat: row.dateFormat })).filter(row => row.date).map(row => row.date);
  const corroboratingDates = [...new Set([metadata.date, ...unambiguous].filter(Boolean))];
  const parsed = raw.map(row => ({ ...row, ...parseDeadlineDate(row.raw, { dateFormat: row.dateFormat, corroboratingDates }) }));
  const valid = parsed.filter(row => row.status === 'valid' && !row.invalidTime);
  let status, reason, selected = null, supersessions = [];
  if (parsed.some(row => row.status !== 'valid' || row.invalidTime)) {
    status = 'invalid'; reason = 'A labeled submission date or time is invalid or ambiguous.';
  } else if (!valid.length) {
    status = metadata.status === 'valid' ? 'metadata-only' : metadata.status === 'missing' ? 'missing' : 'invalid';
    reason = status === 'metadata-only' ? 'Only the listing deadline is available; no official submission deadline was verified.' : 'No valid official submission deadline was verified.';
    if (metadata.date) selected = { date: metadata.date, time: null, timeZone: null, source: { type: 'highergov-metadata', field: 'due_date' } };
  } else {
    const extensions = extensionsFromDocuments(documents, corroboratingDates);
    const dates = new Set(valid.map(row => row.date));
    const superseded = new Set();
    let brokenChain = false;
    for (const extension of extensions) {
      // Both ends must have explicit submission-date evidence in this candidate's set.
      if (!dates.has(extension.from) || !dates.has(extension.to)) continue;
      if (extensions.some(other => other.from === extension.from && other.to !== extension.to)) brokenChain = true;
      superseded.add(extension.from);
      supersessions.push(extension);
    }
    const current = valid.filter(row => !superseded.has(row.date));
    const currentDates = [...new Set(current.map(row => row.date))];
    if (brokenChain || currentDates.length !== 1 || (metadata.date && metadata.date !== currentDates[0] && !superseded.has(metadata.date))) {
      status = 'conflicting'; reason = 'Submission deadline sources disagree and no unambiguous amendment resolves them.';
    } else {
      const timed = current.filter(row => row.time);
      // The same cutoff written with and without its time zone is one deadline.
      const times = new Set(timed.map(row => row.time));
      const zones = new Set(timed.map(row => row.timeZone).filter(Boolean));
      if (times.size > 1 || zones.size > 1) {
        status = 'conflicting'; reason = 'Submission cutoff times or timezones disagree.';
      } else {
        selected = timed.find(row => row.timeZone) || timed[0] || current[0];
        status = 'verified'; reason = 'Official proposal submission deadline verified.';
      }
    }
  }
  const timeZone = selected?.timeZone || null;
  const countZone = timeZone || assessment.reportingTimeZone;
  const zoneDate = assessment.assessmentTimestamp
    ? /^[+-]/.test(countZone)
      ? new Date(Date.parse(assessment.assessmentTimestamp) + (countZone[0] === '-' ? -1 : 1) * (Number(countZone.slice(1, 3)) * 60 + Number(countZone.slice(4))) * 60_000).toISOString().slice(0, 10)
      : dateInZone(assessment.assessmentTimestamp, countZone)
    : assessment.runDate;
  const days = selected ? Math.round((Date.parse(`${selected.date}T00:00:00Z`) - Date.parse(`${zoneDate}T00:00:00Z`)) / DAY_MS) : null;
  const cutoff = selected ? deadlineTimestamp(selected.date, selected.time, timeZone) : null;
  if (selected?.time && timeZone && !cutoff) {
    status = 'invalid'; reason = 'Submission cutoff is an ambiguous or nonexistent local time.';
  }
  const expired = selected ? days < 0 || Boolean(cutoff && assessment.assessmentTimestamp && Date.parse(cutoff) <= Date.parse(assessment.assessmentTimestamp)) : null;
  const verified = status === 'verified';
  return {
    status, reason,
    due: selected?.date || null, time: selected?.time || null, timeZone,
    source: selected?.source || null,
    evidence: parsed.map(({ raw: value, date, status: outcome, source }) => ({ raw: value, date, status: outcome, source })),
    supersessions,
    assessmentDate: zoneDate, assessmentTimestamp: assessment.assessmentTimestamp,
    assessmentOverrideUsed: assessment.overrideUsed,
    dayCountTimeZone: countZone, timezoneFallbackUsed: !timeZone,
    days: Number.isFinite(days) ? days : null, expired,
    score: verified && !expired ? timelinePoints(days) : 0,
    pass: verified ? !expired && days >= 10 : null,
    note: verified ? reason : 'Deadline needs review: ' + reason,
  };
}
