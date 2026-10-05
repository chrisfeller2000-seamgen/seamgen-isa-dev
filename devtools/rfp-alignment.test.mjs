import assert from 'node:assert/strict';
import test from 'node:test';
import { isDeepStrictEqual } from 'node:util';
import { alignmentCases, rubricContract } from './fixtures/rfp-alignment-cases.mjs';
import { companySources, recordedJudgment } from './fixtures/rfp-recorded-judgments.mjs';
import { classifyDocumentRecord, evaluateDocumentCompleteness } from '../workspace/scripts/highergov-document-flow.mjs';
import { createAssessmentContext } from '../workspace/scripts/rfp-deadline.mjs';
import { finalizeRfpScore } from '../workspace/scripts/rfp-scoring-policy.mjs';
import { getHigherGovPrefilter } from '../workspace/scripts/weekly-rfp-pursue-decision.mjs';

// Jake's rubric cases (invented opportunities) against the real intake prefilter,
// document check, and scoring finalizer. Scoring cases use recorded judgments, so
// they prove the deterministic rules around a judgment, not AI agreement.
const assessment = createAssessmentContext({ runDate: rubricContract.assessmentDate, reportingTimeZone: 'UTC' });
const getField = (value, path) => path.split('.').reduce((current, key) => current?.[key], value);

function score(fixture, phase) {
  const input = { candidate: fixture.candidate, companySources, assessment, phase, documents: phase === 'preliminary' ? [] : fixture.documents };
  const result = finalizeRfpScore(input, recordedJudgment(input));
  return { ...result, categoryCount: result.categories ? Object.keys(result.categories).length : 0 };
}

function observe(fixture) {
  if (fixture.kind === 'documents') {
    const classifications = fixture.records.map(classifyDocumentRecord);
    const manifest = fixture.records.map((record, i) => ({ ...classifications[i], source_file_name: record.file_name,
      downloaded: record.downloaded !== false, extracted: Boolean(record.text), document_status: record.status || 'downloaded' }));
    return { documents: { classifications, completeness: evaluateDocumentCompleteness({ manifest }) } };
  }
  const intake = getHigherGovPrefilter(fixture.record, { seamgenProfile: fixture.companyProfile });
  if (fixture.kind === 'intake') return { intake };
  return { intake, preliminary: score(fixture, 'preliminary'), document: score(fixture, 'full-text') };
}

const observations = new Map(alignmentCases.map((fixture) => [fixture.id, observe(fixture)]));

test('the rubric contract keeps eight categories totalling 100 and unique cases', () => {
  assert.equal(Object.values(rubricContract.categories).reduce((a, b) => a + b, 0), 100);
  assert.equal(new Set(alignmentCases.map((fixture) => fixture.id)).size, alignmentCases.length);
});

for (const fixture of alignmentCases) {
  test(`policy case: ${fixture.name}`, () => {
    const observation = observations.get(fixture.id);
    for (const check of fixture.checks) {
      const actual = getField(observation, check.field);
      const expected = check.op === 'sameAs' ? getField(observations.get(check.caseId), check.otherField) : check.expected;
      const rule = rubricContract.rules[check.rule] || check.rule;
      assert.notEqual(actual, undefined, `${check.field} is not exposed`);
      if (check.op === 'between') assert.ok(actual >= expected[0] && actual <= expected[1], `${check.field} = ${actual}; ${rule}`);
      else if (check.op === 'not') assert.ok(!isDeepStrictEqual(actual, expected), `${check.field} must not be ${JSON.stringify(expected)}; ${rule}`);
      else assert.deepEqual(actual, expected, `${check.field}; ${rule}`);
    }
    if (fixture.kind !== 'scoring') return;
    for (const result of [observation.preliminary, observation.document]) {
      // Jake stops weighted scoring on gate failures and unresolved outcomes.
      if (result.total === null) {
        assert.notEqual(result.qualification_status, 'qualified');
        assert.notEqual(result.recommendation, 'Strong Pursue');
        continue;
      }
      assert.equal(result.total, Object.values(result.categories).reduce((a, b) => a + b, 0));
      for (const [category, max] of Object.entries(rubricContract.categories)) {
        assert.ok(result.categories[category] >= 0 && result.categories[category] <= max, category);
      }
    }
  });
}
