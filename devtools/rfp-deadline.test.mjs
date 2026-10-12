import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { assessDeadline, createAssessmentContext, parseDeadlineDate, timelinePoints } from '../workspace/scripts/rfp-deadline.mjs';
import { buildSecondaryReport, resolveRunConfig } from '../workspace/scripts/secondary-fulltext-score.mjs';
import { finalizeRfpScore, unscoredRfp } from '../workspace/scripts/rfp-scoring-policy.mjs';
import { companySources, recordedJudgment } from './fixtures/rfp-recorded-judgments.mjs';

const assessment = createAssessmentContext({ runDate: '2026-09-28' });
const document = text => ({ name: 'synthetic-solicitation.txt', text });
const assess = (text, metadataDueDate = '2026-10-26', options = {}) => assessDeadline({ metadataDueDate, documents: [document(text)], assessment, ...options });
const mdrText = 'Approved 5/7/75\nRevised 3/18/2008\nProposals shall be received no later than Monday, October 26, 2026, at 4:30 p.m. Atlantic Standard Time.';
const businessText = 'Custom build a data warehouse on Azure with AI support and security. Incumbent and local vendor preference.';
const candidate = { frontmatter: { title: 'Synthetic Analytics Platform', agency_name: 'State of Example', due_date: '2026-10-26', val_est_low: '180000' }, body: businessText };
const score = text => {
  const input = { candidate, documents: [document(text)], assessment, companySources, phase: 'full-text' };
  return finalizeRfpScore(input, recordedJudgment(input));
};

test('MDR regression: actual submission deadline, 28 days, four points, and unchanged other categories', () => {
  const result = assess(mdrText);
  assert.equal(result.status, 'verified');
  assert.equal(result.due, '2026-10-26');
  assert.equal(result.days, 28);
  assert.equal(result.score, 4);
  assert.equal(result.pass, true);
  assert.equal(result.time, '16:30');
  assert.equal(result.timeZone, '-04:00');
  assert.equal(result.source.section, 'line 3');
  const scored = score(mdrText);
  const plain = score('Proposal due date: 2026-10-26');
  assert.deepEqual(scored.categories, plain.categories);
  assert.equal(scored.categories.timeline, 4);
  assert.equal(scored.total, Object.values(scored.categories).reduce((a, b) => a + b, 0));
  assert.equal(scored.recommendation, 'Strong Pursue');
  assert.equal(scored.gate.gate1Days, scored.timeline.days);
  assert.equal(scored.gate.gate1Due, scored.timeline.due);
});

test('stored deadline is not overwritten or falsely verified by an approval date', () => {
  const result = assess('Approved 5/7/75\nRevised 11/9/2020');
  assert.equal(result.due, '2026-10-26');
  assert.equal(result.status, 'metadata-only');
  assert.equal(result.score, 0);
  assert.equal(result.pass, null);
  assert.equal(result.source.type, 'highergov-metadata');
});

test('ignore revision, publication, contract, meeting, questions, and availability dates', () => {
  const result = assess('Approved 5/7/75\nRevised 12/17/2025\nPublished September 25, 2026\nContract start: 2026-11-01\nPre-bid meeting: October 2, 2026\nQuestions deadline: October 5, 2026\nSupport 24/7/365', '');
  assert.equal(result.status, 'missing');
  assert.equal(result.due, null);
  assert.equal(result.pass, null);
  assert.deepEqual(result.evidence, []);
});

test('question and proposal dates remain separate even on the same line', () => {
  for (const text of ['Questions due: October 5, 2026; Proposal due date: October 26, 2026', 'Proposal due date: October 26, 2026; Questions due: October 5, 2026']) {
    assert.equal(assess(text).due, '2026-10-26');
    assert.equal(assess(text).evidence.length, 1);
  }
});

test('availability wording cannot become a deadline, including under a deadline label', () => {
  assert.equal(assess('Support must be available 24/7/365.', '').status, 'missing');
  const result = assess('Proposal due date: 24/7/365', '');
  assert.equal(result.status, 'invalid');
  assert.equal(result.days, null);
  assert.equal(result.pass, null);
  assert.equal(result.score, 0);
});

test('two-digit years require corroboration, never a blind 20 prefix', () => {
  assert.equal(parseDeadlineDate('5/7/75').status, 'ambiguous');
  assert.equal(assess('Proposal due date: 5/7/75', '').status, 'invalid');
  assert.equal(assess('Proposal due date: 10/26/26').due, '2026-10-26');
  assert.equal(parseDeadlineDate('5/7/75', { corroboratingDates: ['1975-05-07'] }).date, '1975-05-07');
});

test('strict calendar validation rejects rollover, trailing junk, and partial dates', () => {
  for (const date of ['2026-02-30', '2026-13-01', '2025-02-29', '2026-10-26junk', '10/26/2026junk', '24/7/365', '10/26/202', 'October 32, 2026']) assert.equal(parseDeadlineDate(date).status, 'invalid', date);
  assert.equal(parseDeadlineDate('2028-02-29').date, '2028-02-29');
  assert.equal(parseDeadlineDate('26 October 2026').date, '2026-10-26');
  assert.equal(parseDeadlineDate('Oct. 26th, 2026').date, '2026-10-26');
});

test('written dates, deadline tables, and multiline submission labels are supported', () => {
  for (const text of ['Submission date\nMonday, October 26, 2026', 'October 26, 2026 Due Date for Proposals', 'Proposals are due October 26, 2026', 'Bids must be received by 2026-10-26']) {
    assert.equal(assess(text).status, 'verified', text);
    assert.equal(assess(text).due, '2026-10-26', text);
  }
});

// Shapes taken from the October 9 RFPs, where 7 of 8 deadlines went unread.
test('common real-world deadline wordings are read as the proposal deadline', () => {
  for (const text of [
    'Submit Proposals Vendor October 26, 2026 NO LATER THAN 2:00 PM ET',
    'Responses must be submitted through the Bid Office E-Procurement Platform\nno later than 3:30 P.M. on Monday, October 26, 2026 to the link below:',
    'Proposal Due Date and Time October 26th, 2026 by 5:00 PM EST',
    'Proposal Due Date and Time\n\nOctober 26, 2026 at 3:00 PM',
    'Proposals must be submitted through the portal at https://procurement.example.test/portal/city, no later than 5:00 pm on Monday, October 26, 2026.',
    'Deadline for RFP Submissions October 26, 2026',
    'Deadline to Submit Proposals: 10/26/2026, 2:00PM PST',
    'Sealed Proposals will be received until 2:30pm on Monday, October 26, 2026, EST',
    'Sealed proposals must be received on or before October 26, 2026, 11:00',
    'Qualifications will be accepted at the Procurement Office or electronically no later than 2:00 P.M., Monday, October 26, 2026.',
  ]) {
    const result = assess(text);
    assert.deepEqual([result.status, result.due], ['verified', '2026-10-26'], text);
  }
});

test('question, invoice, and reference cutoffs are not the proposal deadline', () => {
  for (const text of [
    'Questions regarding this RFP must be submitted in writing no later than 4:30 p.m., Monday, October 19, 2026.',
    'Question Submission Deadline October 19, 2026, 2:00pm',
    'Question Response Deadline October 19, 2026, 2:00pm',
    'Invoices must be submitted no later than October 19, 2026.',
    'Deadline for references no later than 5:00 pm on October 19, 2026',
  ]) assert.equal(assess(text, '').status, 'missing', text);
  const both = assess('Question Submission Deadline October 14, 2026, 2:00pm\nProposal Submission Deadline October 26, 2026, 2:00pm');
  assert.deepEqual([both.status, both.due], ['verified', '2026-10-26']);
});

test('an addendum extending "the deadline for submission of proposals" replaces the old date', () => {
  const documents = [document('RFA responses must be received by October 12, 2026, at 3:00 PM Eastern'),
    { name: 'addendum.txt', text: 'Solicitation Addendum Form (001)\nThe deadline for submission of proposals is hereby extended from 10/12/2026 03:00 PM to 10/26/2026 10:00 AM.' }];
  const result = assessDeadline({ metadataDueDate: '2026-10-26', documents, assessment });
  assert.deepEqual([result.status, result.due, result.supersessions.length], ['verified', '2026-10-26', 1]);
});

test('ambiguous numeric formats require metadata or an explicit source format', () => {
  assert.equal(assess('Proposal due date: 10/05/2026', '').status, 'invalid');
  assert.equal(assess('Proposal due date: 10/05/2026', '2026-10-05').due, '2026-10-05');
  assert.equal(assess('Date format MM/DD/YYYY\nProposal due date: 10/05/2026', '').due, '2026-10-05');
  assert.equal(assess('Date format DD/MM/YYYY\nProposal due date: 05/10/2026', '').due, '2026-10-05');
});

test('an explicit numbered amendment resolves an old deadline, not a question deadline', () => {
  const documents = [document('Proposal deadline: October 10, 2026'), { name: 'addendum-1.txt', text: 'Addendum No. 1\nProposal deadline extended from October 10, 2026 to October 26, 2026.' }];
  const result = assessDeadline({ metadataDueDate: '2026-10-10', documents, assessment });
  assert.equal(result.status, 'verified');
  assert.equal(result.due, '2026-10-26');
  assert.equal(result.source.file, 'addendum-1.txt');
  assert.equal(result.supersessions.length, 1);
  const questions = { name: 'addendum-2.txt', text: 'Addendum No. 2\nQuestions deadline extended from October 10, 2026 to October 26, 2026.' };
  assert.equal(assessDeadline({ documents: [documents[0], questions], assessment }).due, '2026-10-10');
  assert.equal(assessDeadline({ documents: [documents[0], { ...documents[1], applicable: false }], assessment }).due, '2026-10-10');
});

test('contradictory or cyclic amendments do not select the most favorable date', () => {
  const original = document('Proposal deadline: October 10, 2026');
  const amendment = (number, from, to) => ({ name: `addendum-${number}.txt`, text: `Addendum No. ${number}\nProposal deadline extended from October ${from}, 2026 to October ${to}, 2026.` });
  assert.equal(assessDeadline({ documents: [original, amendment(1, 10, 20), amendment(2, 10, 26)], assessment }).status, 'conflicting');
  assert.equal(assessDeadline({ documents: [original, amendment(1, 10, 20), amendment(2, 20, 10)], assessment }).status, 'conflicting');
  assert.equal(assessDeadline({ documents: [original, amendment(1, 10, 20), amendment(2, 20, 26)], assessment }).due, '2026-10-26');
});

test('unresolved official/metadata dates and contradictory cutoff times need review', () => {
  for (const result of [assess('Proposal deadline: October 25, 2026'), assess('Proposal deadline: October 25, 2026\nProposal deadline: October 26, 2026', ''), assess('Proposal deadline: October 26, 2026 at 3:00 pm PT\nProposal deadline: October 26, 2026 at 4:00 pm PT')]) {
    assert.equal(result.status, 'conflicting');
    assert.equal(result.pass, null);
    assert.equal(result.score, 0);
  }
});

test('normal assessment uses current clock, not September 22 or capture date', () => {
  const current = createAssessmentContext({ now: new Date('2026-09-28T12:00:00Z') });
  const result = assess('Proposal due date: October 5, 2026', '2026-10-05', { assessment: current });
  assert.equal(result.days, 7);
  assert.equal(result.pass, false);
  assert.equal(current.runDate, '2026-09-28');
  assert.equal(current.overrideUsed, false);
});

test('ten-calendar-day gate and all timeline scoring boundaries are preserved', () => {
  for (const [days, points] of [[-1, 0], [0, 0], [9, 0], [10, 0], [11, 2], [15, 2], [16, 3], [20, 3], [21, 4], [29, 4], [30, 5]]) {
    const due = new Date(Date.parse('2026-09-28T00:00:00Z') + days * 86_400_000).toISOString().slice(0, 10);
    const result = assess(`Proposal due date: ${due}`, due);
    assert.equal(result.days, days);
    assert.equal(result.score, points);
    assert.equal(result.pass, days >= 10);
    assert.equal(timelinePoints(days), points);
  }
});

test('known cutoff expires only when its actual time has passed', () => {
  const text = 'Proposal deadline: October 26, 2026 at 4:30 p.m. Atlantic Standard Time.';
  const before = assess(text, '2026-10-26', { assessment: createAssessmentContext({ now: new Date('2026-10-26T20:29:00Z') }) });
  const after = assess(text, '2026-10-26', { assessment: createAssessmentContext({ now: new Date('2026-10-26T20:30:00Z') }) });
  assert.equal(before.expired, false);
  assert.equal(after.expired, true);
  assert.equal(after.pass, false);
  assert.equal(assess('No submission date is posted.', '').expired, null);
  assert.equal(assess('Proposal deadline: October 26, 2026').time, null);
});

test('calendar counts follow explicit timezone near midnight and across DST', () => {
  const result = assess('Proposal deadline: October 26, 2026 at 4:30 pm PT', '2026-10-26', { assessment: createAssessmentContext({ now: new Date('2026-09-29T01:00:00Z') }) });
  assert.equal(result.assessmentDate, '2026-09-28');
  assert.equal(result.days, 28);
  const dst = assess('Proposal deadline: November 9, 2026 at 4:30 pm PT', '2026-11-09', { assessment: createAssessmentContext({ now: new Date('2026-10-31T19:00:00Z') }) });
  assert.equal(dst.days, 9);
  assert.equal(dst.pass, false);
  assert.equal(assess('Proposal deadline: November 1, 2026 at 1:30 am PT', '2026-11-01').status, 'invalid');
  assert.equal(assess('Proposal deadline: March 8, 2026 at 2:30 am PT', '2026-03-08').status, 'invalid');
});

test('host timezone cannot change deadline decisions', () => {
  const script = `import {assessDeadline,createAssessmentContext} from ${JSON.stringify(new URL('../workspace/scripts/rfp-deadline.mjs', import.meta.url).href)}; console.log(JSON.stringify(assessDeadline({metadataDueDate:'2026-10-26',documents:[{name:'synthetic.txt',text:'Proposal deadline: October 26, 2026 at 4:30 pm PT'}],assessment:createAssessmentContext({now:new Date('2026-09-29T01:00:00Z')})})));`;
  const outputs = ['UTC', 'America/Los_Angeles', 'Asia/Tokyo'].map(TZ => {
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', script], { env: { TZ }, encoding: 'utf8', timeout: 10_000 });
    assert.equal(child.status, 0, child.stderr);
    return child.stdout;
  });
  assert.equal(outputs[0], outputs[1]);
  assert.equal(outputs[1], outputs[2]);
});

test('historical overrides and reporting timezone are validated and reported', () => {
  assert.equal(assessment.overrideUsed, true);
  assert.equal(assessment.assessmentTimestamp, null);
  for (const runDate of ['2026-02-30', '09/28/2026', '2026-09-28junk']) assert.throws(() => createAssessmentContext({ runDate }), /RFP_RUN_DATE/);
  assert.throws(() => createAssessmentContext({ reportingTimeZone: 'Not/AZone' }), /timezone/);
  assert.throws(() => createAssessmentContext({ now: new Date('invalid') }), /timestamp/);
});

test('input/output defaults use assessment date, with explicit older input supported', () => {
  const now = new Date('2026-09-30T12:00:00Z');
  const run = resolveRunConfig({ WORKSPACE_DIR: '/synthetic-workspace' }, { now });
  assert.match(run.reportPath, /2026-09-30\.md$/);
  assert.equal(run.outputBasename, '2026-09-30-secondary-fulltext');
  const oldInput = resolveRunConfig({ RFP_PRELIM_REPORT_PATH: '/synthetic/2026-09-22.md' }, { now });
  assert.equal(oldInput.assessment.runDate, '2026-09-30');
  assert.equal(oldInput.reportPath, '/synthetic/2026-09-22.md');
  assert.throws(() => resolveRunConfig({ RFP_SECONDARY_OUT_BASENAME: '../outside' }), /filename/);
});

test('unknown deadlines cannot inflate qualified counts or get finalized scores', () => {
  const unresolved = score('Support available 24/7/365.');
  assert.equal(unresolved.total, null);
  assert.equal(unresolved.recommendation, 'Deadline needs review');
  assert.equal(unresolved.gate.gate1, null);
  const row = (title, scored) => ({ title, agency: 'Synthetic Agency', preliminary_score: 80, fulltext_score: scored.total, ...scored, fetchStatus: 'downloaded' });
  const report = buildSecondaryReport([row('Needs review', unresolved), row('Verified', score(mdrText)), row('Conflict', score('Proposal deadline: October 25, 2026'))], assessment);
  assert.equal(report.summary.strongPursue, 1);
  assert.equal(report.summary.deadlineNeedsReview, 2);
  assert.equal(report.summary.gateFails, 0);
  assert.equal(report.summary.total, report.summary.strongPursue + report.summary.worthALook + report.summary.noBid + report.summary.deadlineNeedsReview);
  assert.equal(report.results[0].title, 'Verified');
  assert.match(report.markdown, /Secondary Full-Text Scoring - 2026-09-28/);
  assert.match(report.markdown, /Full-text: Not finalized/);
  assert.match(report.markdown, /Deadline status: conflicting/);
  assert.match(report.markdown, /Days remaining: 28/);
  assert.equal(report.summary.runDate, '2026-09-28');
});

test('candidate notes cannot establish an official deadline; independent no-bid reasons remain', () => {
  const notes = { ...candidate, body: `${businessText}\nProposal deadline: October 26, 2026` };
  const result = unscoredRfp({ candidate: notes, documents: [], assessment, phase: 'full-text' }, 'No validated AI judgment.');
  assert.equal(result.timeline.status, 'metadata-only');
  assert.equal(result.total, null);
  assert.equal(result.recommendation, 'Deadline needs review');
  const hardwareInput = { candidate, assessment, documents: [], companySources, phase: 'full-text' };
  const hardware = finalizeRfpScore(hardwareInput, recordedJudgment(hardwareInput, { gate3: false }));
  assert.equal(hardware.recommendation, 'No-bid');
  assert.equal(hardware.gate.gate3, false);
  assert.equal(hardware.total, null);
});

test('imports have no network or production-job side effects', () => {
  const script = `globalThis.fetch=()=>{throw new Error('Network forbidden')}; await import(${JSON.stringify(new URL('../workspace/scripts/secondary-fulltext-score.mjs', import.meta.url).href)}); console.log('safe-import');`;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', script], { env: {}, encoding: 'utf8', timeout: 10_000 });
  assert.equal(child.status, 0, child.stderr);
  assert.equal(child.stdout.trim(), 'safe-import');
  assert.equal(child.stderr, '');
});

test('date fragments and dates in unrelated subsequent sentences are not selected', () => {
  for (const text of ['Proposal due date: 2026-10-26/garbage', 'Proposal due date is not available; work begins October 26, 2026', 'Proposal due date is not set. October 26, 2026 is a contract milestone.', 'October 26, 2026 is a publication date. Submission date is unknown.', 'Proposal due date: TBD\nBid opening: October 26, 2026']) {
    const result = assess(text, '');
    assert.notEqual(result.status, 'verified', text);
    assert.equal(result.pass, null, text);
  }
  assert.equal(parseDeadlineDate('2/30/26', { corroboratingDates: ['2026-02-30'] }).status, 'ambiguous');
});

test('time before date and explicit UTC offset are preserved', () => {
  const result = assess('Proposals must be received by 4:30 p.m. UTC-04:00 on October 26, 2026');
  assert.equal(result.time, '16:30');
  assert.equal(result.timeZone, '-04:00');
  assert.equal(result.status, 'verified');
  assert.equal(assess('Proposals must be received by Fri. October 26, 2026 at 4:30 p.m. Atlantic\nStandard Time').timeZone, '-04:00');
});
