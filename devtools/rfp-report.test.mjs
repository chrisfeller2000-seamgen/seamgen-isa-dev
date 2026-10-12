import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildResults, checkTelegramDraft, renderEmailHtml, renderMarkdown, renderTelegramFallback, reportEntry, telegramFacts,
  vibeFrom, writeTelegramMessage,
} from '../workspace/scripts/rfp-report.mjs';
import { deliverWeeklyReport } from '../workspace/scripts/weekly-rfp-pursue-decision.mjs';

// Invented RFPs shaped like the weekly job's real inputs. No real opportunity data.
const GATES = ['gate1', 'gate2', 'gate3', 'gate4', 'gate5', 'gate6'];
const confirmed = { status: 'verified', due: '2026-11-02', time: '15:00', timeZone: 'America/Denver', days: 27 };
const listingOnly = { status: 'metadata-only', due: '2026-10-28', time: null, timeZone: null, days: 22 };
const listingValue = (low, high) => ({ status: 'listing', low, high, estimate: null });
const subject = "New qualified RFP's for pursue decision - week 41";

function candidate(slug, { title = `Permit portal ${slug}`, issuer = 'City of Example', state = 'CA' } = {}) {
  return {
    slug, title, issuer,
    sourceUrl: `https://www.highergov.com/sl/contract-opportunity/${slug}`,
    portalUrl: `https://bids.example.gov/${slug}`,
    frontmatter: { pop_state: state },
    body: `# ${title}\n\n## HigherGov AI summary\nBackground The city wants an online permit portal for residents and staff. It replaces paper forms.\n\n## Opportunity description\nText.`,
  };
}

function result({ recommendation, total = null, potential, gates = {}, timeline = confirmed, value = listingValue(250000, 900000),
  caseStudy = 'Our permit portal for the City of Sample is a close match.', extra = {} }) {
  // An open gate is null, so `??` would wrongly turn it into a pass.
  const gate = Object.fromEntries(GATES.map(key => [key, gates[key] && 'pass' in gates[key] ? gates[key].pass : true]));
  return {
    gate,
    gateReasons: GATES.map(key => ({ gate: `Gate ${key.slice(4)}`, pass: gate[key], reason: gates[key]?.reason || 'Official proposal submission deadline verified.' })),
    recommendation, total, potential_total: potential === undefined ? total : potential, timeline, value, flags: [],
    judgments: { categories: { caseStudy: { reason: caseStudy } } },
    qualification_status: recommendation === 'Strong Pursue' ? 'qualified' : 'provisional',
    ...extra,
  };
}

const preliminary = (total, extra = {}) => ({ status: 'preliminary-below-threshold', score: total,
  preview: result({ recommendation: total >= 50 ? 'Worth a look' : 'No-bid', total, timeline: listingOnly, ...extra }) });

function weekEntries() {
  return [
    reportEntry({ candidate: candidate('strong'), preliminary: preliminary(70), final: result({ recommendation: 'Strong Pursue', total: 82 }), documentStatus: 'full-text' }),
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

const weekResults = () => buildResults({ runDate: '2026-10-06', week: '41', entries: weekEntries(), intake: { fetched: 14, pass: 10, daysFetched: ['a', 'b'] } });

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
  const html = renderEmailHtml(buildResults({ runDate: '2026-10-06', week: '41', entries: [nodate] }), { subject });
  assert.match(html, /the due date couldn&#39;t be confirmed from the RFP\. Due: Not confirmed \(the listing says Oct 28\)\. Score from the documents: 66\./);
  assert.equal(strong.budget.text, "about $250k–900k (HigherGov's guess)");
  assert.equal(reportEntry({ candidate: candidate('x'), preliminary: preliminary(70),
    final: result({ recommendation: 'Strong Pursue', total: 80, value: { status: 'stated', estimate: 400000 } }) }).budget.text, '$400k (from the RFP)');
});

test('the Telegram facts pick at most three, strong pursues first, and every RFP is counted once', () => {
  const extra = ['a', 'b'].map(slug => reportEntry({ candidate: candidate(slug), preliminary: preliminary(60), final: result({ recommendation: 'Worth a look', total: 55 }) }));
  const results = buildResults({ runDate: '2026-10-06', week: '41', entries: [...weekEntries(), ...extra] });
  const facts = telegramFacts(results);
  assert.deepEqual(facts.picks.map(pick => pick.title), ['Permit portal strong', 'Utility management software', 'Online giving platform']);
  assert.equal(facts.morePicks, 2);
  assert.deepEqual(facts.verdict, { strong: 1, worth: 1, longShots: 1, text: '1 is a strong pursue and 1 is worth a look, plus a long shot.' });
  assert.equal(facts.total, facts.picks.length + facts.morePicks + facts.check.count + (facts.skipped ? 1 : 0) + facts.notAFit.count);
});

test('the biggest skipped RFP is a large one skipped for a reason a partner could cover', () => {
  const facts = telegramFacts(weekResults());
  assert.equal(facts.skipped.title, 'ERP system');
  assert.equal(facts.skipped.budget, "about $2.5M–9M (HigherGov's guess)");
  const hardwareOnly = buildResults({ runDate: '2026-10-06', week: '41', entries: [
    reportEntry({ candidate: candidate('towers'), preliminary: preliminary(20, { value: listingValue(5000000, 8000000), gates: { gate3: { pass: false, reason: 'Towers.' } } }) }),
    reportEntry({ candidate: candidate('small'), preliminary: preliminary(55), final: result({ recommendation: 'No-bid', value: listingValue(100000, 300000), gates: { gate2: { pass: false } } }) }),
  ] });
  assert.equal(telegramFacts(hardwareOnly).skipped, null);
});

test('the fallback message follows the approved template and passes the draft checks', () => {
  const facts = telegramFacts(weekResults());
  const text = renderTelegramFallback(facts);
  assert.match(text, /^Morning team! I went through 10 new RFPs this week\. 1 is a strong pursue and 1 is worth a look, plus a long shot\./);
  assert.match(text, /\n1\. \*\*Permit portal strong, City of Example\*\*\nThe city wants an online permit portal for residents and staff\.\nWhy us: Our permit portal/);
  assert.match(text, /It scores 82, a strong pursue\.\nDue Nov 2 at 2pm PT \(27 days\)\. Budget about \$250k–900k \(HigherGov's guess\)\.\n\[HigherGov listing\]\(https:\/\/www\.highergov\.com\/sl\/contract-opportunity\/strong\)/);
  assert.match(text, /Question for the team: can we meet this\? The solicitation requires utility-management experience at comparable scale\. If yes, it scores 75, a strong pursue\./);
  assert.match(text, /3\. Long shot: \*\*Online giving platform, State Public TV\*\*/);
  assert.match(text, /Questions for the team: can we meet these\? The RFP requires a completed SOC 2 Type 2 audit and three recent related projects\. Submission requires a portal account\. If yes, it scores 62\./);
  assert.match(text, /Biggest one I skipped: ERP system, City of Sample, about \$2\.5M–9M \(HigherGov's guess\)\. The city is buying the rights to an existing ERP product\. It's only worth it with a partner\./);
  assert.match(text, /1 looked promising, but I couldn't get its documents to check the requirements\. It's in Marianne's email\./);
  assert.match(text, /The other 5 weren't a fit: 2 are hardware or equipment, 1 is buying an existing product, 1 is a weak fit, and 1 for other reasons\. Full list is in Marianne's email\.$/);
  assert.ok(text.length <= 3000);
  assert.deepEqual(checkTelegramDraft(text, facts), { ok: true, reason: null });
});

test('a week with nothing to pursue says so plainly', () => {
  const quiet = buildResults({ runDate: '2026-10-06', week: '41', entries: weekEntries().filter(entry => entry.tier === 'screened' || entry.tier === 'check') });
  const facts = telegramFacts(quiet);
  const text = renderTelegramFallback(facts);
  assert.match(text, /^Morning team\. Nothing worth chasing this week\.\n\nI went through 7 RFPs\. Most were hardware or existing products\. 1 looked promising, but I couldn't get its documents to check the requirements\. It's at the top of Marianne's email\./);
  assert.deepEqual(checkTelegramDraft(text, facts), { ok: true, reason: null });
});

test('the draft checks reject changed facts, wrong links, and anything the team should not see', () => {
  const facts = telegramFacts(weekResults());
  const good = renderTelegramFallback(facts);
  const link = facts.picks[0].link;
  const rejected = {
    'changed score': good.replace('it scores 75', 'it scores 85'),
    'missing link': good.replace(`[HigherGov listing](${link})`, 'HigherGov listing'),
    'extra link': `${good}\nMore: https://example.com/other`,
    'file path': `${good}\nSee /home/azureuser/.openclaw/workspace/reports.`,
    'gate number': good.replace('can we meet this?', 'gate 6 is open:'),
    'heading': `# RFPs\n${good}`,
    'bullets': good.replace('Why us:', '- Why us:'),
    'emoji': `${good} 📈`,
    'too long': `${good}\n${'Extra words. '.repeat(250)}`,
    'raw date': good.replace('Due Nov 2 at 2pm PT', 'Due 2026-11-02'),
    'unflagged long shot': good.replace('**Permit portal strong', 'Long shot: **Permit portal strong').replace('3. Long shot: ', '3. '),
  };
  for (const [name, draft] of Object.entries(rejected)) {
    const longShotFacts = name === 'unflagged long shot' ? { ...facts, picks: facts.picks.map(pick => ({ ...pick, longShot: false })) } : facts;
    assert.equal(checkTelegramDraft(draft, longShotFacts).ok, false, name);
  }
  const noSkip = { ...facts, skipped: null };
  assert.equal(checkTelegramDraft(good, noSkip).ok, false, 'skipped RFP without the fact');
  // Spelled-out numbers in the facts may be written as digits.
  assert.equal(checkTelegramDraft(good.replace('three recent related projects', '3 recent related projects'), facts).ok, true);
});

test("ISA's draft is sent only when it passes; otherwise the fallback goes out with the reason", async () => {
  const facts = telegramFacts(weekResults());
  const good = renderTelegramFallback(facts).replace('Morning team!', 'Morning team, happy Friday!');
  let seen;
  const sent = await writeTelegramMessage(facts, async request => { seen = request; return { text: good }; }, { vibe: 'Warm, direct' });
  assert.deepEqual([sent.source, sent.text], ['isa', good]);
  assert.match(seen.systemPrompt, /Your voice: Warm, direct\./);
  assert.match(seen.systemPrompt, /Biggest one I skipped/);
  assert.deepEqual(JSON.parse(seen.prompt), JSON.parse(JSON.stringify(facts)));

  const wrong = await writeTelegramMessage(facts, async () => ({ text: good.replace('it scores 75', 'it scores 95') }));
  assert.equal(wrong.source, 'fallback');
  assert.match(wrong.reason, /number/);
  assert.equal(wrong.text, renderTelegramFallback(facts));
  assert.deepEqual(await writeTelegramMessage(facts, async () => { throw new Error('secret https://x?key=1'); }),
    { text: renderTelegramFallback(facts), source: 'fallback', reason: 'The writer call failed.' });
  assert.equal((await writeTelegramMessage(facts, () => new Promise(() => {}), { timeoutMs: 20 })).reason, 'The writer timed out.');
  assert.equal((await writeTelegramMessage(facts, null)).reason, 'No writer was available.');
});

test('the email lists RFPs by decision, links every one, and uses the AI case-study reason for fit', () => {
  const results = weekResults();
  results.entries[0].title = 'Permit portal <script>';
  const html = renderEmailHtml(results, { subject });
  const order = ['Strong pursue', 'Worth a look', "Couldn't check yet", 'Screened out'].map(heading => html.indexOf(`>${heading.replace("'", '&#39;')}<`));
  assert.ok(order.every((index, i) => index > 0 && (i === 0 || index > order[i - 1])), `section order ${order}`);
  for (const entry of results.entries) assert.ok(html.includes(entry.links.highergov), entry.slug);
  assert.match(html, /<strong>Why Seamgen fits:<\/strong> Our permit portal for the City of Sample is a close match\./);
  // The keyword-era builder joined gate sentences into the fit text (October 6 regression).
  assert.doesNotMatch(html, /Seamgen matches the ask|official proposal submission deadline verified\. and/i);
  assert.match(html, /Permit portal &lt;script&gt;/);
  assert.match(html, /Buying an existing product \(2\)/);
  assert.match(html, /This email is generated by ISA/);
  assert.doesNotMatch(html, /metadata-only|preliminary-below-threshold|failed-gate/);
  const markdown = renderMarkdown(results, { subject });
  assert.match(markdown, /^# New qualified RFP's for pursue decision - week 41\n\n10 new RFPs this run: 1 strong pursue, 2 worth a look, 1 to check, 6 screened out\./);
  assert.match(markdown, /## Couldn't check yet\n\n- Permit portal nodocs — City of Example, CA: couldn't get or read the RFP documents\./);
});

test("ISA's voice comes from IDENTITY.md, with a default", () => {
  assert.equal(vibeFrom('- **Name:** ISA\n- **Vibe:** Warm, direct, commercially sharp\n'), 'Warm, direct, commercially sharp');
  assert.equal(vibeFrom(''), 'Warm, direct, commercially sharp');
});

test('preview mode sends nothing; normal delivery sends the email, then the Telegram message', async () => {
  const calls = [];
  const run = async (cmd, args) => { calls.push([cmd, ...args]); return 'ok'; };
  assert.deepEqual(await deliverWeeklyReport({ subject, htmlPath: '/tmp/r.html', telegramText: 'Hi', preview: true, run }),
    { emailStatus: 'preview', telegramStatus: 'preview' });
  assert.equal(calls.length, 0);
  const sent = await deliverWeeklyReport({ subject, htmlPath: '/tmp/r.html', telegramText: 'Hi team', preview: false, noTelegram: false, run });
  assert.deepEqual(calls.map(call => call[0]), ['gog', 'openclaw']);
  assert.ok(calls[0].includes(subject) && calls[0].includes('/tmp/r.html'));
  assert.deepEqual(calls[1].slice(1, 4), ['message', 'send', '--channel']);
  assert.equal(calls[1].at(-1), 'Hi team');
  assert.equal(sent.telegramStatus, 'sent');
  calls.length = 0;
  assert.equal((await deliverWeeklyReport({ subject, htmlPath: '/tmp/r.html', telegramText: 'Hi', preview: false, noTelegram: true, run })).telegramStatus, 'skipped');
  assert.deepEqual(calls.map(call => call[0]), ['gog']);
});
