import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import { getHigherGovPrefilter } from '../workspace/scripts/weekly-rfp-pursue-decision.mjs';

// The tracked HigherGov profile, not a synthetic one: these tests pin facts about
// Seamgen. Seamgen is not an SBA small business (corrected November 2026). Codes are
// the ones HigherGov actually returned in the 2026-11-06 run.
const config = JSON.parse(await fs.readFile(new URL('../workspace/tools/highergov-config.json', import.meta.url), 'utf8'));

function intake(setAside, sourceType) {
  return getHigherGovPrefilter({
    opp_type: { description: 'Solicitation' },
    source_type: sourceType,
    set_aside: setAside,
    captured_date: '2026-11-02',
    due_date: '2026-12-15',
    primary_contact_email: 'buyer@example.gov',
  }, config);
}

test('a federal total small-business set-aside is dropped at intake', () => {
  const result = intake('SBA', 'sam');
  assert.deepEqual([result.pass, result.killReason], [false, 'set-aside-not-held']);
});

test('state and local SBA codes and partial set-asides pass with a flag for scoring', () => {
  // On SLED listings SBA mostly marked small-business goals, preferences or
  // subcontracting requirements, which Seamgen can bid as prime.
  for (const [setAside, sourceType] of [['SBA', 'sled'], ['SBP', 'sam'], ['SBP', 'sled']]) {
    const result = intake(setAside, sourceType);
    assert.equal(result.pass, true, `${setAside}/${sourceType}`);
    assert.ok(result.flags.includes('small-business-set-aside'), `${setAside}/${sourceType}`);
    assert.ok(!result.flags.includes('unrecognized-set-aside'), `${setAside}/${sourceType}`);
  }
});

test('the other set-aside codes keep their existing outcomes', () => {
  for (const code of ['SDVOSBC', 'SDVOSBS', 'WOSB', '8A', '8AN']) {
    assert.equal(intake(code, 'sled').killReason, 'set-aside-not-held', code);
  }
  for (const code of ['NONE', '']) {
    const result = intake(code, 'sled');
    assert.equal(result.pass, true, code || '(blank)');
    assert.deepEqual(result.flags.filter((flag) => flag.includes('set-aside')), [], code || '(blank)');
  }
  assert.ok(intake('MBE', 'sled').flags.includes('unrecognized-set-aside'));
});

test('the profile claims GSA MAS and no small-business status', () => {
  const { certifications, setAsidePassList } = config.seamgenProfile;
  assert.ok(certifications.includes('GSA Multiple Award Schedule (MAS)'));
  assert.ok(!certifications.some((claim) => /schedule 70|small business|\bSBA\b/i.test(claim)));
  assert.ok(!setAsidePassList.some((entry) => /small business|\bSBA\b|\bSBP\b/i.test(entry)));
});
