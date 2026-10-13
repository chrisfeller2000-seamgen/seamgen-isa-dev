import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  MAIL_SYNC_PURSUE_SUBJECT, buildResults, checkPursueSentences, checkTelegramDraft, pursueFacts, pursueSentencesFallback,
  renderMarkdown, renderPursueEmail, renderTelegramFallback, reportEntry, telegramFacts, vibeFrom, writePursueEmail, writeTelegramMessage,
} from '../workspace/scripts/rfp-report.mjs';
import { deliverPursueUpdate, readPortalCandidate } from '../workspace/scripts/weekly-rfp-pursue-decision.mjs';

// Invented RFPs shaped like the weekly job's real inputs. No real opportunity data.
const GATES = ['gate1', 'gate2', 'gate3', 'gate4', 'gate5', 'gate6'];
const confirmed = { status: 'verified', due: '2026-11-02', time: '15:00', timeZone: 'America/Denver', days: 27 };
const listingOnly = { status: 'metadata-only', due: '2026-10-28', time: null, timeZone: null, days: 22 };
const listingValue = (low, high) => ({ status: 'listing', low, high, estimate: null });
const SILENT = 'RFP is silent on any incumbent — to be confirmed in Q&A.';
const cited = [{ sourceId: 'doc-1', quote: 'The City will replace its paper permit forms.' }];

function candidate(slug, { title = `Permit portal ${slug}`, issuer = 'City of Example', state = 'CA', rfpNumber = 'unknown' } = {}) {
  return {
    slug, title, issuer,
    sourceUrl: `https://www.highergov.com/sl/contract-opportunity/${slug}`,
    portalUrl: `https://bids.example.gov/${slug}`,
    frontmatter: { pop_state: state, rfp_number: rfpNumber },
    body: `# ${title}\n\n## HigherGov AI summary\nBackground The city wants an online permit portal for residents and staff. It replaces paper forms.\n\n## Opportunity description\nText.`,
  };
}

function result({ recommendation, total = null, potential, gates = {}, timeline = confirmed, value = listingValue(250000, 900000),
  caseStudy = 'Our permit portal for the City of Sample is a close match.', judgment = {}, extra = {} }) {
  // An open gate is null, so `??` would wrongly turn it into a pass.
  const gate = Object.fromEntries(GATES.map(key => [key, gates[key] && 'pass' in gates[key] ? gates[key].pass : true]));
  return {
    gate,
    gateReasons: GATES.map(key => ({ gate: `Gate ${key.slice(4)}`, pass: gate[key], reason: gates[key]?.reason || 'Official proposal submission deadline verified.' })),
    recommendation, total, potential_total: potential === undefined ? total : potential, timeline, value, flags: [],
    judgments: { ...judgment, categories: { caseStudy: { reason: caseStudy }, ...judgment.categories } },
    qualification_status: recommendation === 'Strong Pursue' ? 'qualified' : 'provisional',
    ...extra,
  };
}

const preliminary = (total, extra = {}) => ({ status: 'preliminary-below-threshold', score: total,
  preview: result({ recommendation: total >= 50 ? 'Worth a look' : 'No-bid', total, timeline: listingOnly, ...extra }) });

const strongPick = (slug = 'strong', judgment = { buyer: { currentSolution: null, objective: 'Residents want to apply for permits online instead of on paper.', evidence: cited } }, total = 82, rfpNumber) =>
  reportEntry({ candidate: candidate(slug, { rfpNumber }), preliminary: preliminary(70), final: result({ recommendation: 'Strong Pursue', total, judgment }),
    documentStatus: 'full-text', documentsLink: `https://drive.example.test/${slug}` });

function weekEntries() {
  return [
    strongPick(),
    reportEntry({ candidate: candidate('utility', { title: 'Utility management software', issuer: 'State Office of Energy' }), preliminary: preliminary(69),
      final: result({ recommendation: 'Needs review', potential: 75,
        gates: { gate6: { pass: null, reason: 'Eligibility needs verification: the solicitation requires utility-management experience at comparable scale.' } } }) }),
    reportEntry({ candidate: candidate('giving', { title: 'Online giving platform', issuer: 'State Public TV' }), preliminary: preliminary(62),
      final: result({ recommendation: 'Needs review', potential: 62, value: listingValue(75000, 250000), caseStudy: null,
        gates: { gate4: { pass: null, reason: 'Submission requires a portal account.' },
          gate6: { pass: null, reason: 'The RFP requires a completed SOC 2 Type 2 audit and three recent related projects.' } } }) }),
    reportEntry({ candidate: candidate('erp', { title: 'ERP system', issuer: 'City of Sample' }), preliminary: preliminary(60),
      final: result({ recommendation: 'No-bid', value: listingValue(2500000, 9000000),
        gates: { gate2: { pass: false, reason: 'FAIL — the city is buying the rights to an existing ERP product.' } } }) }),
    reportEntry({ candidate: candidate('lms'), preliminary: preliminary(68),
      final: result({ recommendation: 'No-bid', value: listingValue(100000, 300000), gates: { gate2: { pass: false, reason: 'A hosted subscription product.' } } }) }),
    reportEntry({ candidate: candidate('radios'), preliminary: preliminary(20, { gates: { gate3: { pass: false, reason: 'Radios and towers.' } } }) }),
    reportEntry({ candidate: candidate('cameras'), preliminary: preliminary(15, { gates: { gate3: { pass: false, reason: 'Camera hardware.' } } }) }),
    reportEntry({ candidate: candidate('weak'), preliminary: preliminary(38) }),
    reportEntry({ candidate: candidate('nodocs'), preliminary: preliminary(64), documentStatus: 'document-list-empty' }),
    reportEntry({ candidate: candidate('thin'), preliminary: { status: 'insufficient-metadata', score: null, preview: result({ recommendation: 'Needs review', timeline: listingOnly }) } }),
  ];
}

const weekResults = (entries = weekEntries()) => buildResults({ runDate: '2026-10-06', week: '41', entries, intake: { fetched: 14, pass: 10, daysFetched: ['a', 'b'] } });

test('each RFP lands in one tier, from the scorer outcome and the document state', () => {
  const byslug = Object.fromEntries(weekEntries().map(entry => [entry.slug, entry]));
  assert.equal(byslug.strong.tier, 'strong');
  assert.deepEqual([byslug.utility.tier, byslug.utility.rankFrom, byslug.utility.scoreIfYes], ['worth', 'potential', 75]);
  assert.deepEqual(byslug.utility.questions, ['The solicitation requires utility-management experience at comparable scale.']);
  assert.deepEqual([byslug.giving.tier, byslug.giving.rankFrom, byslug.giving.longShot], ['worth', 'potential', true]);
  // October 9: RFPs with an unconfirmed deadline were picked on their listing score.
  // They wait for the date, whatever they score; the document score is shown when there is one.
  const nodate = reportEntry({ candidate: candidate('nodate'), preliminary: preliminary(68),
    final: result({ recommendation: 'Deadline needs review', potential: 66, timeline: listingOnly, gates: { gate1: { pass: null } } }) });
  assert.deepEqual([nodate.tier, nodate.reason, nodate.rankFrom, nodate.rankScore], ['check', 'noDeadline', 'potential', 66]);
  const older = reportEntry({ candidate: candidate('older'), preliminary: preliminary(68),
    final: result({ recommendation: 'Deadline needs review', potential: null, timeline: listingOnly, gates: { gate1: { pass: null } } }) });
  assert.deepEqual([older.tier, older.reason, older.rankFrom], ['check', 'noDeadline', 'preliminary']);
  const noScore = reportEntry({ candidate: candidate('noscore'), preliminary: preliminary(70), final: result({ recommendation: 'Needs review', potential: null }) });
  assert.deepEqual([noScore.tier, noScore.reason], ['check', 'unscored']);
  assert.deepEqual([byslug.erp.tier, byslug.erp.reason, byslug.erp.reasonDetail], ['screened', 'gate2', 'The city is buying the rights to an existing ERP product.']);
  assert.deepEqual([byslug.weak.tier, byslug.weak.reason], ['screened', 'weak']);
  assert.deepEqual([byslug.nodocs.tier, byslug.nodocs.reason], ['check', 'documents']);
  assert.deepEqual([byslug.thin.tier, byslug.thin.reason], ['screened', 'thin']);
  const disabled = reportEntry({ candidate: candidate('off'), preliminary: preliminary(64), documentStatus: 'fetch-disabled' });
  assert.deepEqual([disabled.tier, disabled.reason], ['check', 'disabled']);
  const duplicate = reportEntry({ candidate: candidate('dup'), preliminary: preliminary(70), final: result({ recommendation: 'Strong Pursue', total: 80 }), hubspotDuplicate: true });
  assert.deepEqual([duplicate.tier, duplicate.reason], ['screened', 'hubspot']);
  // A failed AI call is "check", but a deadline the code already ruled out stays a No-bid.
  const failed = reportEntry({ candidate: candidate('err'), preliminary: preliminary(70), final: result({ recommendation: 'Needs review', extra: { scoring_error: 'model-unavailable' } }) });
  assert.deepEqual([failed.tier, failed.reason], ['check', 'unscored']);
  const late = reportEntry({ candidate: candidate('late'), preliminary: preliminary(70),
    final: result({ recommendation: 'No-bid', gates: { gate1: { pass: false, reason: 'Due in 6 days.' } }, extra: { scoring_error: 'model-unavailable' } }) });
  assert.deepEqual([late.tier, late.reason], ['screened', 'gate1']);
});

test('deadlines are shown in Pacific time with days left, and listing-only dates say so', () => {
  const [strong] = weekEntries();
  assert.equal(strong.deadline.text, 'Nov 2 at 2pm PT (27 days)');
  const nodate = reportEntry({ candidate: candidate('nodate'), preliminary: preliminary(68),
    final: result({ recommendation: 'Deadline needs review', potential: 66, timeline: listingOnly, gates: { gate1: { pass: null } } }) });
  assert.deepEqual([nodate.deadline.confirmed, nodate.deadline.text], [false, 'the listing says Oct 28']);
  assert.match(renderMarkdown(weekResults([nodate])), /the due date couldn't be confirmed from the RFP\. Due: Not confirmed \(the listing says Oct 28\)\./);
  assert.equal(strong.budget.text, "about $250k–900k (HigherGov's guess)");
  assert.equal(reportEntry({ candidate: candidate('x'), preliminary: preliminary(70),
    final: result({ recommendation: 'Strong Pursue', total: 80, value: { status: 'stated', estimate: 400000 } }) }).budget.text, '$400k (from the RFP)');
});

test("what the buyer uses today: named when cited, Jake's silent line when the documents name none, left out when unknown", () => {
  const buyer = value => strongPick('b', { buyer: value }).buyer;
  assert.deepEqual(buyer({ currentSolution: 'They use a 2014 Accela permit system.', objective: 'A modern portal.', advantage: 'Cost is only 10 of 100 points.', evidence: cited }),
    { currentSolution: 'They use a 2014 Accela permit system.', silent: false, objective: 'A modern portal.', advantage: 'Cost is only 10 of 100 points.' });
  assert.deepEqual(buyer({ currentSolution: null, objective: 'A modern portal.', advantage: null, evidence: cited }),
    { currentSolution: null, silent: true, objective: 'A modern portal.', advantage: null });
  // Uncited: not stated, and not "silent" either, because nobody showed the documents say nothing.
  assert.deepEqual(buyer({ currentSolution: 'A mainframe.', objective: 'A modern portal.', advantage: 'No incumbent.', evidence: [] }),
    { currentSolution: null, silent: false, objective: 'A modern portal.', advantage: null });
  assert.equal(strongPick('b', {}).buyer, null);
  const situation = value => pursueSentencesFallback(pursueFacts(weekResults([strongPick('b', { buyer: value })]))).rfps[0].situation;
  assert.equal(situation({ currentSolution: null, objective: 'A modern portal.', evidence: cited }), `${SILENT} A modern portal.`);
  // With no buyer summary, the objective is HigherGov's summary of what they want.
  assert.equal(situation(undefined), 'The city wants an online permit portal for residents and staff.');
});

test('blockers come worst first, in plain words, at most three', () => {
  const pick = strongPick('b', {
    subrules: { submission: { status: 'feasible', basis: 'feasible-registration',
      evidence: [{ sourceId: 'doc-1', quote: 'Proposals must be submitted through BidNet Direct, the Empire State Purchasing Group portal.' }] } },
    competitive: { verdict: 'Leaning wired' },
    categories: { compliance: { band: 'unfamiliar', points: 1, reason: 'Compliance: the RFP asks for SOC 2 Type II evidence, which we do not hold.' } },
  });
  assert.deepEqual(pick.blockers.map(blocker => blocker.text), ["Submitting needs a registration on the agency's portal.",
    'It looks written with a particular vendor in mind.', 'Compliance: the RFP asks for SOC 2 Type II evidence, which we do not hold.']);
  // ISA gets the cited RFP text, so it can say "only through BidNet" instead of "a portal".
  assert.equal(pick.blockers[0].quote, 'Proposals must be submitted through BidNet Direct, the Empire State Purchasing Group portal.');
  // The policy's stock reason for a subrule-changed gate leaked into the October 9 report.
  const open = reportEntry({ candidate: candidate('open'), preliminary: preliminary(70), final: result({ recommendation: 'Strong Pursue', total: 80,
    gates: { gate6: { pass: null, reason: 'Gate 6 is unresolved or not met under its documented subrule; see the recorded evidence.' } } }) });
  assert.deepEqual(open.blockers.map(blocker => blocker.text), ['We may not meet one of its eligibility requirements.']);
  // October 12 VM preview: reasons open with what checks out, and Gate 4 and the submission
  // check both described the same portal. The blocker is the sentence saying what's missing.
  const mixed = reportEntry({ candidate: candidate('mixed'), preliminary: preliminary(70), final: result({ recommendation: 'Strong Pursue', total: 80,
    judgment: { subrules: { submission: { status: 'unknown' } } },
    gates: {
      gate6: { pass: null, reason: 'Relevant AI delivery is supported, and the reference form asks for generic references. However, current insurance and financial-capacity evidence is also needed before confirming eligibility.' },
      gate4: { pass: null, reason: 'Public Purchase submission is required. Our account access and registration timing are not established by the supplied evidence.' },
    } }) });
  assert.deepEqual(mixed.blockers.map(blocker => blocker.text), ['Current insurance and financial-capacity evidence is also needed before confirming eligibility.',
    'Our account access and registration timing are not established by the supplied evidence.']);
  // Worth a look RFPs get blockers too, for the Markdown record; screened-out ones don't.
  assert.deepEqual(weekEntries()[1].blockers.map(blocker => blocker.text), ['The solicitation requires utility-management experience at comparable scale.']);
  assert.deepEqual(weekEntries()[3].blockers, []);
});

test("the pursue email covers only Strong Pursue RFPs, in Jake's format, with links and titles from the facts", () => {
  const results = weekResults([...weekEntries(), strongPick('grants', {
    buyer: { currentSolution: 'They track grants in spreadsheets today.', objective: 'One system for applicants and reviewers.',
      advantage: 'Cost is only 5 of 100 evaluation points.', evidence: cited },
    subrules: { submission: { status: 'unknown' } },
  }, 78, '2026-114')]);
  const facts = pursueFacts(results);
  assert.deepEqual(facts.picks.map(pick => pick.title), ['Permit portal strong', 'Permit portal grants']);
  const sentences = pursueSentencesFallback(facts);
  assert.deepEqual(checkPursueSentences(sentences, facts), { ok: true, reason: null });
  const email = renderPursueEmail(facts, sentences);
  assert.equal(email.subject, 'Permit portal strong and Permit portal grants — pursuing');
  assert.equal(email.text, [
    "2 RFPs worth pursuing from this week's HigherGov search, scored on the full RFP documents.",
    '1. Permit portal strong — scored 82',
    'RFP Opportunity through HigherGov: Permit portal strong (City of Example) — Drive folder: https://drive.example.test/strong',
    `Current solution & hopeful objective: ${SILENT} Residents want to apply for permits online instead of on paper.`,
    'Why it fits us: Our permit portal for the City of Sample is a close match.',
    'Blockers: None identified.',
    '2. Permit portal grants — scored 78',
    'RFP Opportunity through HigherGov: Permit portal grants, No. 2026-114 (City of Example) — Drive folder: https://drive.example.test/grants',
    'Current solution & hopeful objective: They track grants in spreadsheets today. One system for applicants and reviewers.',
    'Why it fits us: Our permit portal for the City of Sample is a close match. Cost is only 5 of 100 evaluation points.',
    "Blockers:\n- How to submit isn't confirmed yet.",
    'Cheers,\nISA',
  ].join('\n\n'));
  const hostile = structuredClone(facts);
  hostile.picks[1].title = 'Grants portal <script>';
  assert.match(renderPursueEmail(hostile, sentences).html, /Grants portal &lt;script&gt;, No\. 2026-114 \(City of Example\)/);
  assert.match(email.html, /— <a href="https:\/\/drive\.example\.test\/strong">Drive folder<\/a>/);
  assert.match(email.html, /<li>How to submit isn&#39;t confirmed yet\.<\/li>/);
  assert.doesNotMatch(email.html, /color:|<table|<img|Strong pursue|Screened out/);
  assert.equal(renderPursueEmail(pursueFacts(weekResults()), pursueSentencesFallback(pursueFacts(weekResults()))).subject, 'Permit portal strong — pursuing');
});

test("the subject never matches the mail sync's pursue pattern, which would turn the email into deals", async () => {
  // Kept in step with the mail sync's own pattern, which can't be imported (it runs on load).
  const source = await fs.readFile(new URL('../workspace/scripts/daily-mail-hubspot-sync.mjs', import.meta.url), 'utf8');
  const theirs = source.match(/const RFP_PURSUE_SUBJECT_PATTERN = \/(.+)\/i;/)[1];
  assert.equal(MAIL_SYNC_PURSUE_SUBJECT.source, theirs);
  const facts = pursueFacts(weekResults());
  const sentences = pursueSentencesFallback(facts);
  assert.doesNotMatch(renderPursueEmail(facts, sentences).subject, MAIL_SYNC_PURSUE_SUBJECT);
  sentences.rfps[0].name = 'Two RFPs to pursue';
  assert.equal(renderPursueEmail(facts, sentences).subject, '1 RFP this week — pursuing');
});

test("ISA's email sentences are used only when they pass; otherwise the code-built ones go out with the reason", async () => {
  const facts = pursueFacts(weekResults());
  const good = { ...pursueSentencesFallback(facts) };
  good.rfps = [{ ...good.rfps[0], name: 'City permit portal', hook: 'the strongest fit this week',
    fit: "It's a lot like the permit portal we built for the City of Sample." }];
  let seen;
  const sent = await writePursueEmail(facts, async request => { seen = request; return { text: `\`\`\`json\n${JSON.stringify(good)}\n\`\`\`` }; }, { vibe: 'Warm, direct' });
  assert.deepEqual([sent.source, sent.sentences.rfps[0].name], ['isa', 'City permit portal']);
  assert.match(seen.systemPrompt, /Your voice: Warm, direct\./);
  assert.ok(seen.systemPrompt.includes(SILENT));
  assert.deepEqual(JSON.parse(seen.prompt), JSON.parse(JSON.stringify(facts)));

  const change = edit => { const copy = structuredClone(good); edit(copy); return copy; };
  const rejected = {
    'a changed number': change(copy => { copy.rfps[0].hook = 'scored 92'; }),
    'a link': change(copy => { copy.rfps[0].fit += ' See https://example.com.'; }),
    'a missing RFP': change(copy => { copy.rfps = []; }),
    'an added blocker': change(copy => { copy.rfps[0].blockers = ['We have never done permits.']; }),
    'a dropped silent line': change(copy => { copy.rfps[0].situation = 'Residents want to apply for permits online.'; }),
    'rubric words': change(copy => { copy.rfps[0].fit = 'Gate 6 passes on our references.'; }),
    'formatting': change(copy => { copy.rfps[0].name = '**City permit portal**'; }),
    'a long situation': change(copy => { copy.rfps[0].situation = `${SILENT} They want permits online. They also want payments. And reports.`; }),
    // October 12 VM preview: ISA wrote "9 RFPs are worth pursuing" for a one-RFP email.
    'the RFPs looked at instead of the picks': change(copy => { copy.intro = "10 RFPs are worth pursuing from this week's HigherGov search, scored on the full RFP documents."; }),
  };
  for (const [name, sentences] of Object.entries(rejected)) {
    const outcome = await writePursueEmail(facts, async () => ({ text: JSON.stringify(sentences) }));
    assert.deepEqual([outcome.source, outcome.sentences], ['fallback', pursueSentencesFallback(facts)], name);
    assert.ok(outcome.reason, name);
  }
  assert.equal((await writePursueEmail(facts, async () => ({ text: 'Here is the email!' }))).reason, 'The sentences were not valid JSON.');
  assert.equal((await writePursueEmail(facts, async () => { throw new Error('secret https://x?key=1'); })).reason, 'The writer call failed.');
  assert.equal((await writePursueEmail(facts, () => new Promise(() => {}), { timeoutMs: 20 })).reason, 'The writer timed out.');
  assert.equal((await writePursueEmail(facts, null)).reason, 'No writer was available.');
});

test('the Telegram summary says what happened: sent, failed, or nothing to pursue', () => {
  const results = weekResults();
  const pursue = pursueFacts(results);
  const sentFacts = telegramFacts(results, pursue, { status: 'sent', sentences: pursueSentencesFallback(pursue) });
  const sent = renderTelegramFallback(sentFacts);
  assert.equal(sent, "Sent this week's pursue email: 1 RFP.\n\n1. **Permit portal strong** (82). No blockers stood out. [Drive folder](https://drive.example.test/strong)\n\nI looked at 10 RFPs this week.");
  assert.deepEqual(checkTelegramDraft(sent, sentFacts), { ok: true, reason: null });
  const failed = renderTelegramFallback(telegramFacts(results, pursue, { status: 'failed' }));
  assert.match(failed, /^I couldn't send this week's pursue email, so here is the RFP it would have covered:\n\n1\. \*\*Permit portal strong\*\* \(82\)\. \[Drive folder\]/);
  assert.match(failed, /Chris, the details are in the job log\.$/);
  const quiet = weekResults(weekEntries().slice(1));
  const none = renderTelegramFallback(telegramFacts(quiet, pursueFacts(quiet)));
  assert.equal(none, 'No RFPs worth pursuing this week, so no email went out. I looked at 9; the closest was **Utility management software** at 75 (it has an open question).');
});

test("the Telegram draft checks reject changed facts, wrong links, and anything the team shouldn't see", async () => {
  const results = weekResults();
  const pursue = pursueFacts(results);
  const facts = telegramFacts(results, pursue, { status: 'sent', sentences: pursueSentencesFallback(pursue) });
  const good = renderTelegramFallback(facts);
  const rejected = {
    'changed score': good.replace('(82)', '(85)'),
    'missing link': good.replace('[Drive folder](https://drive.example.test/strong)', 'Drive folder'),
    'extra link': `${good}\nMore: https://example.com/other`,
    'file path': `${good}\nSee /home/azureuser/.openclaw/workspace/reports.`,
    'gate number': good.replace('No blockers stood out.', 'Gate 6 passed.'),
    'bullets': good.replace('1. **', '- **'),
    'emoji': `${good} 📈`,
    'too long': `${good}\n${'Extra words. '.repeat(80)}`,
    'not saying it was sent': good.replace("Sent this week's", "Here's this week's"),
    'talking about a missing link': `${good} No link provided.`,
    'a missing value': good.replace('(82)', '(null)'),
  };
  for (const [name, draft] of Object.entries(rejected)) assert.equal(checkTelegramDraft(draft, facts).ok, false, name);
  // October 12 VM preview: ISA said no blockers stood out for a pick that had one.
  const withBlocker = { ...facts, picks: facts.picks.map(pick => ({ ...pick, blocker: 'Submission is only through BidNet.' })) };
  assert.equal(checkTelegramDraft(good, withBlocker).reason, 'The draft dropped a blocker.');

  const casual = good.replace("Sent this week's pursue email: 1 RFP.", "Just sent this week's pursue email to the team, 1 RFP in it.");
  assert.deepEqual(await writeTelegramMessage(facts, async () => ({ text: casual })), { text: casual, source: 'isa', reason: null });
  // Failed and quiet weeks never ask the model.
  const quietFacts = telegramFacts(results, pursue, { status: 'failed' });
  assert.deepEqual(await writeTelegramMessage(quietFacts, async () => { throw new Error('should not be called'); }),
    { text: renderTelegramFallback(quietFacts), source: 'code', reason: null });
});

test('delivery: one email to the recipients, then Telegram; preview, re-runs and failures send what they should', async () => {
  const calls = [];
  const run = async (cmd, args) => { calls.push([cmd, ...args]); return 'ok'; };
  const results = weekResults();
  const to = ['marianne@example.test', 'sales@example.test'];
  const base = { results, complete: null, vibe: 'Warm', to, noTelegram: false, run };

  const sent = await deliverPursueUpdate({ ...base, preview: false });
  assert.deepEqual(calls.map(call => call[0]), ['gog', 'openclaw']);
  const gmail = calls[0];
  assert.equal(gmail[gmail.indexOf('--to') + 1], 'marianne@example.test,sales@example.test');
  assert.equal(gmail[gmail.indexOf('--subject') + 1], 'Permit portal strong — pursuing');
  assert.match(gmail[gmail.indexOf('--body-html') + 1], /Cheers,<br>ISA/);
  assert.equal(calls[1].at(-1), sent.telegram.text);
  assert.deepEqual([sent.email.status, sent.email.writtenBy, sent.email.picks, sent.telegram.status], ['sent', 'fallback', 1, 'sent']);

  calls.length = 0;
  const preview = await deliverPursueUpdate({ ...base, preview: true });
  assert.equal(calls.length, 0);
  assert.deepEqual([preview.email.status, preview.telegram.status], ['preview', 'preview']);
  assert.match(preview.emailHtml, /Permit portal strong/);

  // A re-run in the same week sends nothing new: the email goes to Peter.
  const rerun = await deliverPursueUpdate({ ...base, preview: false, previous: { week: '41', runDate: '2026-10-09', email: sent.email } });
  assert.equal(calls.length, 0);
  assert.deepEqual([rerun.email.status, rerun.email.subject, rerun.telegram.status], ['already-sent', 'Permit portal strong — pursuing', 'skipped']);
  // A failed send doesn't count, so a re-run retries it; Telegram says the email didn't go out.
  const failing = async (cmd, args) => { calls.push([cmd, ...args]); if (cmd === 'gog') throw new Error('gmail down'); return 'ok'; };
  const failed = await deliverPursueUpdate({ ...base, preview: false, run: failing, previous: { week: '41', runDate: '2026-10-09', email: { status: 'failed' } } });
  assert.deepEqual([failed.email.status, failed.telegram.status], ['failed', 'sent']);
  assert.match(calls.at(-1).at(-1), /^I couldn't send this week's pursue email/);
  calls.length = 0;
  const unset = await deliverPursueUpdate({ ...base, preview: false, to: [] });
  assert.deepEqual([unset.email.status, unset.email.reason, calls.map(call => call[0])], ['failed', 'No recipients are set (RFP_EMAIL_TO).', ['openclaw']]);

  calls.length = 0;
  const quiet = await deliverPursueUpdate({ ...base, results: weekResults(weekEntries().slice(1)), preview: false });
  assert.deepEqual([quiet.email.status, calls.map(call => call[0])], ['none', ['openclaw']]);
  assert.match(quiet.telegram.text, /^No RFPs worth pursuing this week, so no email went out\./);
});

test('the Markdown record lists every RFP by decision, with the email blockers and links', () => {
  const markdown = renderMarkdown(weekResults());
  assert.match(markdown, /^# RFP results, week 41\n\n10 new RFPs this run: 1 strong pursue, 2 worth a look, 1 to check, 6 screened out\./);
  assert.match(markdown, /- Why Seamgen fits: Our permit portal for the City of Sample is a close match\./);
  assert.match(markdown, /## Couldn't check yet\n\n- Permit portal nodocs — City of Example, CA: couldn't get or read the RFP documents\./);
  assert.match(markdown, /\*\*Buying an existing product \(2\)\*\*/);
  assert.doesNotMatch(markdown, /metadata-only|preliminary-below-threshold|failed-gate/);
});

test("ISA's voice comes from IDENTITY.md, with a default", () => {
  assert.equal(vibeFrom('- **Name:** ISA\n- **Vibe:** Warm, direct, commercially sharp\n'), 'Warm, direct, commercially sharp');
  assert.equal(vibeFrom(''), 'Warm, direct, commercially sharp');
});

test("candidate files from Jake's PowerShell tools keep their header despite the byte-order mark", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'isa-bom-'));
  try {
    const file = path.join(dir, 'candidate.md');
    await fs.writeFile(file, '\uFEFF---\ntitle: "Example AI services"\nagency_name: "Example Metroparks"\nsource_url: "https://www.highergov.com/sl/example"\n---\nBody.\n');
    const candidate = await readPortalCandidate(file);
    assert.deepEqual([candidate.title, candidate.issuer, candidate.sourceUrl], ['Example AI services', 'Example Metroparks', 'https://www.highergov.com/sl/example']);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
