// The weekly RFP results, the Friday pursue email, and the Telegram summary.
// Code decides every fact here: tiers, scores, deadlines, budgets, links and counts.
// ISA's model only words the email's sentences and the Telegram summary. Its words are
// used only when they pass the checks below; otherwise the code-built version goes out.
import { deadlineTimestamp } from './rfp-deadline.mjs';

const PACIFIC = 'America/Los_Angeles';
const MIN_PICK_SCORE = 50;
const MINIMUM_DEAL = 100000;
// Jake's pursue-email limits (rfp-email-pursue-skill.md v1.7).
const MAX_BLOCKERS = 3;
const MAX_TELEGRAM_CHARS = 800;
const GATE_KEYS = ['gate1', 'gate2', 'gate3', 'gate4', 'gate5', 'gate6'];
// Eligibility is usually the real blocker, so it comes first. An unconfirmed deadline
// is stated in the due line rather than asked.
const QUESTION_GATES = ['gate6', 'gate2', 'gate5', 'gate4', 'gate3'];
const DEFAULT_VIBE = 'Warm, direct, commercially sharp';
// Jake's wording for an RFP whose documents name no system in place today.
const SILENT_LINE = 'RFP is silent on any incumbent — to be confirmed in Q&A.';
// The mail → HubSpot sync turns emails from isa@ with this kind of subject into deals,
// splitting the body at blank lines (RFP_PURSUE_SUBJECT_PATTERN in
// daily-mail-hubspot-sync.mjs). Jake's format would become junk deals, so the pursue
// email's subject must never match it.
export const MAIL_SYNC_PURSUE_SUBJECT = /\b(?:rfp'?s?\s+to\s+pursue|new\s+qualified\s+rfp'?s?\s+for\s+pursue\s+decision)\b/i;

// Plain words for each screened-out reason: `one` finishes "it …" (the closest miss in a
// quiet week's message), and `heading` labels the Markdown group.
const REASONS = {
  gate1: { one: 'is due too soon or closed', heading: 'Due too soon or closed' },
  gate2: { one: 'is buying an existing product', heading: 'Buying an existing product' },
  gate3: { one: 'is hardware or equipment', heading: 'Hardware or equipment' },
  gate4: { one: "can't be submitted", heading: "Can't be submitted" },
  gate5: { one: 'is under $100k', heading: 'Under $100k' },
  gate6: { one: "needs eligibility we can't meet", heading: "Eligibility we can't meet" },
  weak: { one: 'is a weak fit', heading: 'Weak fit (score under 50)' },
  notOpen: { one: "isn't an open bid", heading: 'Not an open bid' },
  watch: { one: 'is an early notice', heading: 'Early notice (pre-solicitation)' },
  thin: { one: 'had too little detail to judge', heading: 'Too little listing detail' },
  hubspot: { one: 'is already in HubSpot', heading: 'Already in HubSpot' },
};
const CHECK_REASONS = {
  documents: "couldn't get or read the RFP documents",
  disabled: 'document fetching is turned off',
  unscored: "the AI scoring didn't finish",
  noDeadline: "the due date couldn't be confirmed from the RFP",
  agency: 'needs an answer from the agency before it can be scored',
};
const TIER_ORDER = { strong: 0, worth: 1, check: 2, screened: 3 };

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const finite = value => (Number.isFinite(value) ? value : null);
const plural = (count, one, many) => (count === 1 ? one : many);

function firstSentence(text, max = 260) {
  const value = clean(text);
  if (!value) return '';
  const sentence = (value.match(/^.*?[.!?](?=\s|$)/) || [value])[0];
  if (sentence.length <= max) return sentence;
  return `${sentence.slice(0, max).replace(/\s+\S*$/, '')}…`;
}

function publicUrl(value) {
  const url = clean(value);
  return /^https?:\/\//i.test(url) ? url : '';
}

function money(amount, withSign = true) {
  const text = amount >= 1e6 ? `${+(amount / 1e6).toFixed(1)}M` : amount >= 1e3 ? `${Math.round(amount / 1e3)}k` : `${amount}`;
  return `${withSign ? '$' : ''}${text}`;
}

function budgetOf(value = {}) {
  const status = value?.status || 'unstated';
  const low = finite(value?.low ?? (status === 'stated' ? value?.estimate : null));
  const high = finite(value?.high ?? (status === 'stated' ? value?.estimate : null));
  if (status === 'conflicting') return { low: null, high: null, text: 'unclear (the sources disagree)' };
  if (low === null && high === null) return { low: null, high: null, text: 'not listed' };
  const amount = status === 'ceiling' ? `up to ${money(high)}`
    : low !== null && high !== null && low !== high ? `${money(low)}–${money(high, false)}`
      : low !== null && high === null ? `${money(low)}+` : money(high ?? low);
  return status === 'listing'
    ? { low, high, text: `about ${amount} (HigherGov's guess)` }
    : { low, high, text: `${amount} (from the RFP)` };
}

function formatDay(iso, timeZone) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone }).format(new Date(iso));
}

function formatTime(iso, timeZone) {
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone }).format(new Date(iso))
    .replace(':00', '').replace(/\s?([AP])M$/, (_, half) => `${half.toLowerCase()}m`);
}

// Pacific time for the team, from the cutoff the deadline module verified.
function deadlineOf(timeline = {}) {
  const date = timeline?.due || null;
  if (!date) return { date: null, confirmed: false, days: null, text: 'no deadline found' };
  const confirmed = timeline.status === 'verified';
  const days = finite(timeline.days);
  if (!confirmed) return { date, confirmed, days, text: `the listing says ${formatDay(`${date}T12:00:00Z`, 'UTC')}` };
  const cutoff = deadlineTimestamp(date, timeline.time, timeline.timeZone);
  const when = cutoff ? `${formatDay(cutoff, PACIFIC)} at ${formatTime(cutoff, PACIFIC)} PT` : formatDay(`${date}T12:00:00Z`, 'UTC');
  const left = days === null ? '' : days === 0 ? ' (today)' : ` (${days} ${plural(days, 'day', 'days')})`;
  return { date, confirmed, days, text: `${when}${left}` };
}

// HigherGov's own summary, without its "Background" heading.
function needOf(candidate = {}) {
  const section = (String(candidate.body || '').match(/## HigherGov AI summary\s+([\s\S]*?)(?:\n## |$)/) || [])[1];
  const text = clean(section || candidate.frontmatter?.ai_summary || candidate.frontmatter?.description_text)
    .replace(/^(background|summary|overview|purpose)\b[\s:.\-–]*/i, '');
  return firstSentence(text, 200);
}

// The scorer sometimes opens a reason with rubric shorthand ("FAIL —", "Eligibility needs
// verification:") or names the gate ("Gate 6:"); the team sees only the plain sentence.
const RUBRIC_PREFIX = /^(?:(?:fail|pass|unknown)\s*[—–:-]\s*|(?:eligibility|deadline) needs (?:verification|review):\s*)/i;
const GATE_MENTION = /\s*\(?\bgates?\s*\d[a-z]?\)?\s*[:—–-]?\s*/gi;
// When a subrule changes a gate, the policy replaces the model's reason with a stock line
// ("Gate 2 is unresolved or not met under its documented subrule…"), which tells the team
// nothing. These plain sentences stand in for it.
const STOCK_GATE_REASON = /under its documented subrule/i;
const GATE_PLAIN = {
  gate2: 'It may be buying an existing product rather than custom work.',
  gate3: 'Part of it may be hardware or equipment.',
  gate4: "How to submit isn't confirmed yet.",
  gate5: 'The budget may be under our $100k minimum.',
  gate6: 'We may not meet one of its eligibility requirements.',
};

function plainReason(reason, max = 260) {
  return firstSentence(clean(reason).replace(RUBRIC_PREFIX, '').replace(GATE_MENTION, ' ').trim()
    .replace(/^\w/, letter => letter.toUpperCase()), max);
}

function gateReason(result, key) {
  const reason = result?.gateReasons?.find(item => item.gate === `Gate ${key.slice(4)}`)?.reason;
  if (reason && STOCK_GATE_REASON.test(reason)) return GATE_PLAIN[key] || '';
  if (reason) return plainReason(reason);
  if (key === 'gate1') return firstSentence(result?.timeline?.note);
  if (key === 'gate5') return firstSentence(result?.value?.reason);
  return '';
}

function failedGate(result) {
  const key = GATE_KEYS.find(name => result?.gate?.[name] === false);
  return key ? { key, detail: gateReason(result, key) } : null;
}

function openQuestions(final) {
  if (!final?.gate) return [];
  const conditional = final.recommendation === 'Conditional — Ask the Agency';
  return QUESTION_GATES.filter(key => final.gate[key] === null && !(conditional && key === 'gate2'))
    .map(key => gateReason(final, key)).filter(Boolean).slice(0, 2);
}

// What the buyer uses today and wants (Jake's "current solution & hopeful objective").
// A current solution is stated only when the scorer cited the text that names it; a null
// one means the documents were read and name nothing, so Jake's "silent" line applies.
function buyerOf(final) {
  const buyer = final?.judgments?.buyer;
  if (!buyer || typeof buyer !== 'object') return null;
  const cited = Array.isArray(buyer.evidence) && buyer.evidence.length > 0;
  return {
    currentSolution: cited ? firstSentence(buyer.currentSolution, 200) || null : null,
    silent: buyer.currentSolution === null,
    objective: firstSentence(buyer.objective, 200) || null,
  };
}

// Jake's "Blockers": what could stop us winning, worst first, one line each. Open gates
// (eligibility first), then submission, a vendor-shaped RFP, and a compliance regime we
// haven't worked in.
function blockersOf(final) {
  const judgment = final?.judgments || {};
  const lines = openQuestions(final).map(line => firstSentence(line, 160));
  const submission = judgment.subrules?.submission;
  if (submission?.status === 'unknown') lines.push("How to submit isn't confirmed yet.");
  else if (submission?.basis === 'feasible-registration') lines.push("Submitting needs a registration on the agency's portal.");
  if (['Leaning wired', 'Wired'].includes(judgment.competitive?.verdict)) lines.push('It looks written with a particular vendor in mind.');
  const compliance = judgment.categories?.compliance;
  if (compliance?.band === 'unfamiliar' && compliance.reason) lines.push(plainReason(compliance.reason, 160));
  return lines.filter(Boolean).slice(0, MAX_BLOCKERS);
}

function rankOf(final, preliminary) {
  if (Number.isFinite(final?.total)) return { score: final.total, from: 'final' };
  if (Number.isFinite(final?.potential_total)) return { score: final.potential_total, from: 'potential' };
  if (Number.isFinite(preliminary?.total)) return { score: preliminary.total, from: 'preliminary' };
  return { score: null, from: null };
}

function placement({ preliminary, final, documentStatus, hubspotDuplicate }) {
  const prelim = preliminary?.preview || {};
  const screened = (key, detail = '') => ({ tier: 'screened', reason: key, detail });
  const check = key => ({ tier: 'check', reason: key, detail: '' });
  if (preliminary?.status === 'insufficient-metadata') return screened('thin');
  const result = final || prelim;
  // A gate the code decided (deadline, value) stays a No-bid even if the AI call failed.
  const failed = failedGate(result);
  if (failed) return screened(failed.key, failed.detail);
  if (result.recommendation === 'Not an open bid') return screened('notOpen');
  if (result.recommendation === 'Watch item') return screened('watch');
  if (result.scoring_error) return check('unscored');
  if (!final) {
    if (prelim.recommendation === 'Conditional — Ask the Agency') return check('agency');
    if (prelim.recommendation === 'Deadline needs review') return check('noDeadline');
    if (!Number.isFinite(prelim.total)) return check('unscored');
    if (prelim.total < MIN_PICK_SCORE) return screened('weak');
    return check(documentStatus === 'fetch-disabled' ? 'disabled' : 'documents');
  }
  if (final.recommendation === 'Needs documents') return check('documents');
  // Never a pick until someone confirms the date (deadline spec).
  if (final.recommendation === 'Deadline needs review') return check('noDeadline');
  if (hubspotDuplicate) return screened('hubspot');
  if (final.recommendation === 'Strong Pursue') return { tier: 'strong', reason: null, detail: '' };
  // A pick needs a score read from the documents; a listing score never makes one.
  const score = finite(final.total) ?? finite(final.potential_total);
  if (score === null) return check('unscored');
  return score >= MIN_PICK_SCORE ? { tier: 'worth', reason: null, detail: '' } : screened('weak');
}

/**
 * One results-file entry per RFP. `preliminary` is the weekly job's preliminary result
 * ({ status, preview }); `final` is the full-text result when documents were scored.
 */
export function reportEntry({ candidate, preliminary, final = null, documentStatus = 'metadata-only', hubspotDuplicate = false, documentsLink = '' }) {
  const frontmatter = candidate?.frontmatter || {};
  const prelim = preliminary?.preview || {};
  const result = final || prelim;
  const place = placement({ preliminary, final, documentStatus, hubspotDuplicate });
  const rank = rankOf(final, prelim);
  const questions = place.tier === 'worth' || place.tier === 'strong' ? openQuestions(final) : [];
  const budget = budgetOf(result.value);
  const listing = publicUrl(candidate?.sourceUrl || frontmatter.source_url);
  const posting = publicUrl(candidate?.portalUrl || frontmatter.solicitation_url);
  const conditional = final?.recommendation === 'Conditional — Ask the Agency' ? firstSentence(final.conditional?.question) : '';
  const flags = result.flags || [];
  return {
    slug: candidate?.slug || '',
    title: clean(candidate?.title || frontmatter.title || candidate?.slug),
    agency: clean(candidate?.issuer || frontmatter.agency_name),
    state: /^[A-Z]{2}$/.test(clean(frontmatter.pop_state)) ? clean(frontmatter.pop_state) : '',
    links: { highergov: listing, posting: posting !== listing ? posting : '', documents: publicUrl(documentsLink) },
    tier: place.tier,
    reason: place.reason,
    reasonDetail: place.detail,
    recommendation: result.recommendation || null,
    scoredFrom: final ? 'documents' : 'listing',
    score: finite(result.total),
    rankScore: rank.score,
    rankFrom: rank.from,
    scoreIfYes: questions.length ? finite(final?.potential_total) : null,
    need: needOf(candidate),
    fit: firstSentence(result.judgments?.categories?.caseStudy?.reason) || null,
    buyer: buyerOf(final),
    blockers: place.tier === 'strong' ? blockersOf(final) : [],
    questions,
    agencyQuestion: conditional || null,
    notes: flags.map(flag => firstSentence(flag.reason)).filter(Boolean).slice(0, 2),
    sensitive: firstSentence(flags.find(flag => flag.type === 'sensitive-industry')?.reason) || null,
    deadline: deadlineOf(result.timeline),
    budget,
    longShot: place.tier === 'worth' && (questions.length >= 2 || (budget.low !== null && budget.low < MINIMUM_DEAL)),
  };
}

/** The results file: every entry, sorted by tier and then rank score, plus the week's counts. */
export function buildResults({ runDate, week, entries, intake = {} }) {
  const sorted = [...entries].sort((a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier]
    || (b.rankScore ?? -1) - (a.rankScore ?? -1) || a.title.localeCompare(b.title));
  const counts = Object.fromEntries(Object.keys(TIER_ORDER).map(tier => [tier, entries.filter(entry => entry.tier === tier).length]));
  return { runDate, week, total: entries.length, counts,
    intake: { fetched: intake.fetched ?? null, passed: intake.pass ?? null, days: intake.daysFetched?.length ?? null }, entries: sorted };
}

// The plain short name people would use, for the code-built email and Telegram text.
function shortName(title) {
  const name = clean(title).replace(/^(?:rfp|rfq|request for (?:proposals?|qualifications?))\b[\s#:\-–—\d]*/i, '') || clean(title);
  return name.length <= 60 ? name : `${name.slice(0, 59).replace(/\s+\S*$/, '')}…`;
}

function pickLink(entry) {
  if (entry.links.documents) return { label: 'Drive folder', url: entry.links.documents };
  if (entry.links.posting) return { label: 'agency posting', url: entry.links.posting };
  if (entry.links.highergov) return { label: 'HigherGov listing', url: entry.links.highergov };
  return null;
}

/** Everything the pursue email may say: the week's Strong Pursue RFPs, best first. */
export function pursueFacts(results) {
  const picks = results.entries.filter(entry => entry.tier === 'strong');
  return {
    total: results.total,
    picks: picks.map((entry, index) => ({
      number: index + 1,
      title: entry.title,
      agency: entry.agency,
      score: entry.score,
      link: pickLink(entry),
      currentSolution: entry.buyer?.currentSolution ?? null,
      silent: Boolean(entry.buyer?.silent && !entry.buyer?.currentSolution),
      objective: entry.buyer?.objective || entry.need || null,
      fit: entry.fit,
      // Results files written before ISA-6 have no blockers or sensitive flag.
      blockers: entry.blockers || [],
      sensitive: entry.sensitive || null,
    })),
  };
}

const NUMBER_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30 };
const numbersIn = text => new Set((String(text).match(/\d+(?:\.\d+)?/g) || []).map(Number));
const linksIn = text => [...String(text).matchAll(/https?:\/\/[^\s)\]>]+/g)].map(match => match[0]);
const sentenceCount = text => (clean(text).match(/[.!?](?=\s+[A-Z"“]|\s*$)/g) || []).length || 1;
const FORBIDDEN = [
  [/\/(?:home|tmp|Users|var)\//, 'a file path'],
  [/\bgates?\s*\d/i, 'a gate number'],
  [/\b[a-z][a-z-]*:e\d+\b/, 'an excerpt ID'],
  [/\b(?:metadata-only|full-text|failed-gate|preliminary-below-threshold|access-blocked|partial-documents|insufficient-metadata)\b/i, 'an internal code'],
  [/\p{Extended_Pictographic}/u, 'an emoji'],
  [/\b\d{4}-\d{2}-\d{2}\b/, 'a raw date'],
];

// Numbers the facts contain, including ones spelled out there.
function allowedNumbers(facts) {
  const factsText = JSON.stringify(facts);
  const allowed = numbersIn(factsText);
  for (const [word, value] of Object.entries(NUMBER_WORDS)) if (new RegExp(`\\b${word}\\b`, 'i').test(factsText)) allowed.add(value);
  return allowed;
}

/** Checks ISA's sentences for the pursue email against the facts. Returns { ok, reason }. */
export function checkPursueSentences(sentences, facts) {
  const fail = reason => ({ ok: false, reason });
  if (!sentences || typeof sentences !== 'object' || !Array.isArray(sentences.rfps)) return fail('The sentences were not in the expected shape.');
  if (sentences.rfps.length !== facts.picks.length) return fail('The sentences did not cover each RFP exactly once.');
  const intro = clean(sentences.intro);
  if (!intro || sentenceCount(intro) > 1 || intro.length > 200) return fail('The opening line was missing or too long.');
  const allowed = allowedNumbers(facts);
  facts.picks.forEach(pick => allowed.add(pick.number));
  const written = [intro];
  for (const [index, pick] of facts.picks.entries()) {
    const rfp = sentences.rfps[index] || {};
    const label = `RFP ${pick.number}`;
    if (rfp.number !== pick.number) return fail(`${label} was out of order.`);
    const [name, hook, situation, fit] = [rfp.name, rfp.hook, rfp.situation, rfp.fit].map(clean);
    const blockers = Array.isArray(rfp.blockers) ? rfp.blockers.map(clean).filter(Boolean) : null;
    if (!name || name.length > 60 || !hook || hook.length > 80) return fail(`${label}: the name or hook was missing or too long.`);
    if (!situation || sentenceCount(situation) > 2 || situation.length > 420) return fail(`${label}: the current solution and objective were missing or over 2 sentences.`);
    if (/silent on any incumbent/i.test(situation) !== pick.silent) return fail(`${label}: the "silent on any incumbent" line didn't match the facts.`);
    if (pick.fit ? !fit || sentenceCount(fit) > 2 || fit.length > 360 : fit) return fail(`${label}: "why it fits us" was missing, too long, or not in the facts.`);
    if (!blockers || blockers.length !== pick.blockers.length) return fail(`${label}: the blockers didn't match the facts.`);
    if (blockers.some(line => sentenceCount(line) > 1 || line.length > 160)) return fail(`${label}: a blocker was longer than one line.`);
    written.push(name, hook, situation, fit, ...blockers);
  }
  const text = written.join('\n');
  for (const [pattern, what] of FORBIDDEN) if (pattern.test(text)) return fail(`The sentences contained ${what}.`);
  if (linksIn(text).length || /[<>*`[\]]/.test(text)) return fail('The sentences contained a link, markup, or formatting.');
  const stray = [...numbersIn(text)].find(value => !allowed.has(value));
  if (stray !== undefined) return fail(`The sentences contained a number that is not in the facts (${stray}).`);
  return { ok: true, reason: null };
}

/** The code-built sentences: used when ISA's sentences fail a check or the writer fails. */
export function pursueSentencesFallback(facts) {
  const count = facts.picks.length;
  return {
    intro: `${count === 1 ? 'One RFP' : `${count} RFPs`} worth pursuing from this week's HigherGov search, scored on the full RFP documents.`,
    rfps: facts.picks.map(pick => ({
      number: pick.number,
      name: shortName(pick.title),
      hook: `scored ${pick.score}`,
      situation: [pick.currentSolution || (pick.silent ? SILENT_LINE : ''), pick.objective].filter(Boolean).join(' '),
      fit: pick.fit || '',
      blockers: pick.blockers,
    })),
  };
}

const escapeHtml = text => String(text ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#39;');

/**
 * Jake's pursue email from the facts and the sentences. Code supplies the subject, titles,
 * links, numbering and sign-off, so those cannot be wrong. Returns { subject, text, html }.
 */
export function renderPursueEmail(facts, sentences) {
  const count = facts.picks.length;
  const countSubject = `${count} ${plural(count, 'RFP', 'RFPs')} this week — pursuing`;
  const named = count === 1 ? `${clean(sentences.rfps[0].name)} — pursuing` : countSubject;
  const subject = MAIL_SYNC_PURSUE_SUBJECT.test(named) ? countSubject : named;
  const blocks = facts.picks.map((pick, index) => {
    const words = sentences.rfps[index];
    const source = `RFP Opportunity through HigherGov: ${pick.title}${pick.agency ? ` (${pick.agency})` : ''}`;
    return {
      heading: `${pick.number}. ${clean(words.name)} — ${clean(words.hook)}`,
      source, link: pick.link,
      situation: `Current solution & hopeful objective: ${clean(words.situation)}`,
      fit: clean(words.fit) ? `Why it fits us: ${clean(words.fit)}` : '',
      blockers: words.blockers.map(clean).filter(Boolean),
      note: pick.sensitive ? `Note for Peter/Marianne: ${pick.sensitive} It still scored as a pursue, so flagging it for your call before we invest.` : '',
    };
  });
  const text = [
    clean(sentences.intro),
    ...blocks.flatMap(block => [
      block.heading,
      block.link ? `${block.source} — ${block.link.label}: ${block.link.url}` : block.source,
      block.situation,
      block.fit,
      block.blockers.length ? ['Blockers:', ...block.blockers.map(line => `- ${line}`)].join('\n') : 'Blockers: None identified.',
      block.note,
    ].filter(Boolean)),
    'Cheers,\nISA',
  ].join('\n\n');
  const p = content => `<p style="margin:0 0 12px;">${content}</p>`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;">
${p(escapeHtml(clean(sentences.intro)))}
${blocks.map(block => [
    p(escapeHtml(block.heading)),
    p(`${escapeHtml(block.source)}${block.link ? ` — <a href="${escapeHtml(block.link.url)}">${escapeHtml(block.link.label)}</a>` : ''}`),
    p(escapeHtml(block.situation)),
    block.fit ? p(escapeHtml(block.fit)) : '',
    block.blockers.length
      ? `${p('Blockers:')}\n<ul style="margin:0 0 12px;padding-left:20px;">${block.blockers.map(line => `<li>${escapeHtml(line)}</li>`).join('')}</ul>`
      : p('Blockers: None identified.'),
    block.note ? p(escapeHtml(block.note)) : '',
  ].filter(Boolean).join('\n')).join('\n')}
${p('Cheers,<br>ISA')}
</div>
`;
  return { subject, text, html };
}

/**
 * Asks ISA's model for words, checks them, and falls back to the code-built version.
 * `complete` is ISA's tools-free OpenClaw completion: ({ systemPrompt, prompt, signal }) =>
 * { text }. `read(draft)` returns { ok, reason, value }. Errors are summarized, never
 * copied, because provider errors can contain URLs or credentials.
 */
async function writeChecked({ complete, systemPrompt, facts, read, fallback, timeoutMs }) {
  const fall = reason => ({ value: fallback(), source: 'fallback', reason });
  if (typeof complete !== 'function') return fall('No writer was available.');
  const controller = new AbortController();
  let timer;
  try {
    const timedOut = new Promise((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error('timeout')); }, timeoutMs);
    });
    const result = await Promise.race([
      complete({ systemPrompt, prompt: JSON.stringify(facts, null, 2), signal: controller.signal }),
      timedOut,
    ]);
    const checked = read(String(typeof result === 'string' ? result : result?.text || '').trim());
    return checked.ok ? { value: checked.value, source: 'isa', reason: null } : fall(checked.reason);
  } catch (error) {
    return fall(error?.message === 'timeout' ? 'The writer timed out.' : 'The writer call failed.');
  } finally {
    clearTimeout(timer);
  }
}

function pursueWriterPrompt(vibe) {
  return [
    "You are ISA, Seamgen's AI sales assistant. You write the sentences of this week's pursue email to Peter, Marianne and the sales team, in the format Jake used. Code adds the RFP titles, links, numbering and sign-off.",
    `Your voice: ${vibe}. Write the way a sharp colleague writes to leadership: plain words, short sentences, confident and specific. Say "we" and "us" for Seamgen. No hype, no filler, no emoji.`,
    'Use only the facts you are given. Never add claims about Seamgen or the buyer, and copy every number exactly.',
    'Reply with one JSON object only: {"intro": string, "rfps": [{"number": number, "name": string, "hook": string, "situation": string, "fit": string, "blockers": [string]}]}, one entry per pick, in the given order and numbering.',
    "intro: one line saying how many RFPs are worth pursuing from this week's HigherGov search, scored on the full RFP documents.",
    'name: the plain short name people would use, under 60 characters (for example "Yonkers senior services app"). hook: a short phrase on why it stands out, under 80 characters (for example "strongest fit of the three").',
    `situation: at most 2 sentences. First what they use today (currentSolution), then what they want built and why (objective). When currentSolution is null and silent is true, the first sentence must be exactly: "${SILENT_LINE}" When silent is false, never call the RFP silent.`,
    'fit: 1 or 2 sentences from fit, naming the past project it mentions, in everyday words. An empty string when fit is null.',
    'blockers: each given blocker rewritten as one plain line, in the same order and the same number of lines; [] when there are none.',
    'No links, Markdown, raw dates such as 2026-10-16, or rubric words such as "gate".',
  ].join('\n');
}

/** ISA's sentences for the pursue email, or the code-built ones. Returns { sentences, source, reason }. */
export async function writePursueEmail(facts, complete, { vibe = DEFAULT_VIBE, timeoutMs = 120000 } = {}) {
  const read = draft => {
    let sentences;
    try {
      sentences = JSON.parse(draft.replace(/^```(?:json)?\s*|\s*```$/g, ''));
    } catch {
      return { ok: false, reason: 'The sentences were not valid JSON.' };
    }
    return { ...checkPursueSentences(sentences, facts), value: sentences };
  };
  const written = await writeChecked({ complete, systemPrompt: pursueWriterPrompt(vibe), facts, read,
    fallback: () => pursueSentencesFallback(facts), timeoutMs });
  return { sentences: written.value, source: written.source, reason: written.reason };
}

// For a week with no Strong Pursue: the best document-scored RFP that didn't make it, and why.
function closestMiss(results) {
  const best = results.entries.filter(entry => entry.tier !== 'strong' && entry.rankFrom !== 'preliminary' && entry.rankScore !== null)
    .sort((a, b) => b.rankScore - a.rankScore)[0];
  if (!best) return null;
  const why = best.tier === 'check' ? CHECK_REASONS[best.reason]
    : best.tier === 'screened' ? `it ${REASONS[best.reason].one}`
      : best.agencyQuestion ? 'it needs an answer from the agency first'
        : best.questions.length ? plural(best.questions.length, 'it has an open question', 'it has open questions') : 'it scored under 75';
  return { name: shortName(best.title), score: best.rankScore, why };
}

/**
 * Everything the Telegram summary may say. `email` is { status, sentences }: status is
 * 'sent', 'preview', 'failed' or 'none', and the names come from the email when it has them.
 */
export function telegramFacts(results, pursue, email = { status: 'none' }) {
  return {
    total: results.total,
    email: email.status,
    picks: pursue.picks.map((pick, index) => ({
      number: pick.number,
      name: clean(email.sentences?.rfps?.[index]?.name) || shortName(pick.title),
      score: pick.score,
      blocker: pick.blockers[0] || null,
      link: pick.link,
    })),
    closest: pursue.picks.length ? null : closestMiss(results),
  };
}

/** The code-built Telegram summary: the only version for failed and quiet weeks. */
export function renderTelegramFallback(facts) {
  const count = facts.picks.length;
  const linkOf = pick => (pick.link ? ` [${pick.link.label}](${pick.link.url})` : '');
  if (facts.email === 'none' || !count) {
    const closest = facts.closest ? `; the closest was **${facts.closest.name}** at ${facts.closest.score} (${facts.closest.why})` : '';
    return `No RFPs worth pursuing this week, so no email went out. I looked at ${facts.total}${closest}.`;
  }
  if (facts.email === 'failed') {
    return [
      `I couldn't send this week's pursue email, so here ${plural(count, 'is the RFP', `are the ${count} RFPs`)} it would have covered:`,
      ...facts.picks.map(pick => `${pick.number}. **${pick.name}** (${pick.score}).${linkOf(pick)}`),
      'Chris, the details are in the job log.',
    ].join('\n\n');
  }
  return [
    `Sent this week's pursue email: ${count} ${plural(count, 'RFP', 'RFPs')}.`,
    ...facts.picks.map(pick => `${pick.number}. **${pick.name}** (${pick.score}). ${pick.blocker ? `Biggest blocker: ${pick.blocker}` : 'No blockers stood out.'}${linkOf(pick)}`),
    `I looked at ${facts.total} RFPs this week.`,
  ].join('\n\n');
}

/** Compares ISA's Telegram summary with the facts. Returns { ok, reason }. */
export function checkTelegramDraft(draft, facts) {
  const text = String(draft || '').trim();
  const fail = reason => ({ ok: false, reason });
  if (!text) return fail('The draft was empty.');
  if (text.length > MAX_TELEGRAM_CHARS) return fail(`The draft was over ${MAX_TELEGRAM_CHARS} characters.`);
  for (const [pattern, what] of FORBIDDEN) if (pattern.test(text)) return fail(`The draft contained ${what}.`);
  // Only bold and links are allowed. RFP names can contain "#" or "|", so only real
  // Markdown structures are rejected: headings, tables, bullets, code, and italics.
  const plain = text.replace(/\*\*([^*\n]+)\*\*/g, '$1').replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '$1');
  if (/[*`]/.test(plain) || /^\s*#{1,6}\s/m.test(plain) || /^\s*\|.*\|\s*$/m.test(plain) || /^\s*[-•]\s/m.test(plain)
    || /(^|\s)_[^_\n]+_(?=[\s.,!?]|$)/.test(plain)) return fail('The draft used formatting other than bold and links.');
  const expected = facts.picks.map(pick => pick.link?.url).filter(Boolean);
  const links = linksIn(text);
  if (links.length !== expected.length || links.some((link, index) => link !== expected[index])) {
    return fail('The draft links did not match the picks, in order.');
  }
  const allowed = allowedNumbers(facts);
  facts.picks.forEach(pick => allowed.add(pick.number));
  const used = numbersIn(text.replace(/https?:\/\/[^\s)\]>]+/g, ''));
  const stray = [...used].find(value => !allowed.has(value));
  if (stray !== undefined) return fail(`The draft contained a number that is not in the facts (${stray}).`);
  const missing = [facts.total, ...facts.picks.map(pick => pick.score)].find(value => value !== null && !used.has(value));
  if (missing !== undefined) return fail(`The draft left out a number from the facts (${missing}).`);
  if (!/\bsent\b/i.test(text)) return fail("The draft didn't say the email was sent.");
  return { ok: true, reason: null };
}

const TELEGRAM_SHAPE = `Sent this week's pursue email: {n} RFPs.

1. **{name}** ({score}). Biggest blocker: {blocker, in plain words}. [{link label}]({link url})

I looked at {total} RFPs this week.`;

function telegramWriterPrompt(vibe) {
  return [
    "You are ISA, Seamgen's AI sales assistant, posting in the sales team's Telegram group right after you sent this week's pursue email.",
    `Your voice: ${vibe}. Write like a teammate in a chat: simple words, short sentences, natural and casual. Say "I" for yourself and "we" or "us" for Seamgen. No hype, no emoji.`,
    "Say you sent this week's pursue email and how many RFPs it covers. Then one line per pick, in the given order: the name in bold, the score, its biggest blocker in plain words (or that none stood out), and its link written as [label](url). End with how many RFPs you looked at this week.",
    'Use only these facts. Copy every number and link exactly, and add no other links or numbers. Never use rubric words such as "gate", internal codes, or file paths.',
    'Formatting: bold only the names with **…**. No headings, bullet dashes, tables or italics.',
    'Keep it under 600 characters. Reply with the message only.',
    '',
    'Shape:',
    TELEGRAM_SHAPE,
  ].join('\n');
}

/**
 * The Friday Telegram summary. ISA words it after a sent (or previewed) email; failed and
 * quiet weeks always use the code-built text. Returns { text, source, reason }.
 */
export async function writeTelegramMessage(facts, complete, { vibe = DEFAULT_VIBE, timeoutMs = 120000 } = {}) {
  if (!['sent', 'preview'].includes(facts.email)) return { text: renderTelegramFallback(facts), source: 'code', reason: null };
  const read = draft => ({ ...checkTelegramDraft(draft, facts), value: draft });
  const written = await writeChecked({ complete, systemPrompt: telegramWriterPrompt(vibe), facts, read,
    fallback: () => renderTelegramFallback(facts), timeoutMs });
  return { text: written.value, source: written.source, reason: written.reason };
}

/** ISA's voice line from IDENTITY.md, e.g. "**Vibe:** Warm, direct, commercially sharp". */
export function vibeFrom(identityText) {
  return clean((String(identityText || '').match(/\*\*Vibe:\*\*\s*(.+)/) || [])[1]) || DEFAULT_VIBE;
}

function scoreLabel(entry) {
  if (entry.rankScore === null) return 'not scored';
  if (entry.rankFrom === 'final') return `${entry.rankScore}${entry.tier === 'strong' ? ' (strong pursue)' : ''}`;
  if (entry.rankFrom === 'potential') return `${entry.rankScore} if the open ${plural(entry.questions.length, 'question checks', 'questions check')} out`;
  return `${entry.rankScore} (listing only; deadline not confirmed)`;
}

function dueLabel(entry) {
  if (entry.deadline.confirmed) return entry.deadline.text;
  return entry.deadline.date ? `Not confirmed (${entry.deadline.text})` : 'No deadline found';
}

function linksOf(entry) {
  return [
    entry.links.documents ? ['Documents', entry.links.documents] : null,
    entry.links.highergov ? ['HigherGov listing', entry.links.highergov] : null,
    entry.links.posting ? ['Agency posting', entry.links.posting] : null,
  ].filter(Boolean);
}

function placeName(entry) {
  return [entry.agency, entry.state].filter(Boolean).join(', ');
}

function screenedGroups(results) {
  const groups = new Map();
  for (const entry of results.entries.filter(item => item.tier === 'screened')) {
    if (!groups.has(entry.reason)) groups.set(entry.reason, []);
    groups.get(entry.reason).push(entry);
  }
  return [...groups].sort((a, b) => b[1].length - a[1].length);
}

function summaryLine(results) {
  const { strong, worth, check, screened } = results.counts;
  return `${results.total} new ${plural(results.total, 'RFP', 'RFPs')} this run: ${strong} strong pursue, ${worth} worth a look, ${check} to check, ${screened} screened out.`;
}

/** The week's full record as Markdown, for the report folder and ISA's chat answers. */
export function renderMarkdown(results) {
  const link = entry => linksOf(entry).map(([label, url]) => `[${label}](${url})`).join(' · ');
  const card = entry => [
    `### ${entry.title}${placeName(entry) ? ` — ${placeName(entry)}` : ''}${entry.longShot ? ' (long shot)' : ''}`,
    `- Score: ${scoreLabel(entry)}`,
    `- Due: ${dueLabel(entry)}`,
    `- Budget: ${entry.budget.text}`,
    entry.need ? `- What they want: ${entry.need}` : null,
    entry.fit ? `- Why Seamgen fits: ${entry.fit}` : null,
    entry.blockers.length ? `- Blockers: ${entry.blockers.join(' ')}` : null,
    entry.questions.length ? `- ${plural(entry.questions.length, 'Open question', 'Open questions')}: ${entry.questions.join(' ')}` : null,
    entry.agencyQuestion ? `- Question for the agency: ${entry.agencyQuestion}` : null,
    entry.notes.length ? `- Also note: ${entry.notes.join(' ')}` : null,
    link(entry) ? `- Links: ${link(entry)}` : null,
    '',
  ].filter(line => line !== null);
  const tier = name => results.entries.filter(entry => entry.tier === name);
  const listOr = lines => (lines.length ? [...lines, ''] : ['None this week.', '']);
  const placeOf = entry => (placeName(entry) ? ` — ${placeName(entry)}` : '');
  return [
    `# RFP results, week ${results.week}`, '', summaryLine(results), '',
    '## Strong pursue', '', ...(tier('strong').length ? tier('strong').flatMap(card) : ['None this week.', '']),
    '## Worth a look', '', ...(tier('worth').length ? tier('worth').flatMap(card) : ['None this week.', '']),
    "## Couldn't check yet", '',
    ...listOr(tier('check').map(entry => `- ${entry.title}${placeOf(entry)}: ${CHECK_REASONS[entry.reason]}. Due: ${dueLabel(entry)}. ${link(entry)}`.trim())),
    '## Screened out', '',
    ...listOr(screenedGroups(results).flatMap(([reason, entries]) => [`**${REASONS[reason].heading} (${entries.length})**`, '',
      ...entries.map(entry => `- ${entry.title}${placeOf(entry)}. ${link(entry)}`.trim()), '']).slice(0, -1)),
  ].join('\n');
}
