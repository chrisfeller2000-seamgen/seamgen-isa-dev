import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const skillsRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'workspace', 'skills');

async function skillFiles(dir = skillsRoot) {
  const found = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...await skillFiles(full));
    else if (entry.name.endsWith('-skill.md')) found.push(full);
  }
  return found;
}

// The fetch skill file was an exact copy of the refresh skill from the first VM import until
// October 12, 2026, so ISA had no fetch procedure and nothing flagged it. Other skills call each
// other by file name, so a file holding another skill's text fails silently.
test('each skill file holds its own skill', async () => {
  const names = new Map();
  const hashes = new Map();
  for (const file of await skillFiles()) {
    const text = await fs.readFile(file, 'utf8');
    const relative = path.relative(skillsRoot, file);
    const name = text.match(/^name:\s*(.+)$/m)?.[1].trim();
    assert.equal(name, path.basename(file, '-skill.md'), `${relative} declares a different skill name`);
    assert.equal(names.get(name), undefined, `${relative} repeats the name used by ${names.get(name)}`);
    names.set(name, relative);
    const hash = createHash('sha256').update(text).digest('hex');
    assert.equal(hashes.get(hash), undefined, `${relative} has the same contents as ${hashes.get(hash)}`);
    hashes.set(hash, relative);
  }
});

test('the meeting brief and fetch skills keep original RFP documents out of cleanup', async () => {
  const fetchSkill = await fs.readFile(path.join(skillsRoot, 'rfp-document-fetch-skill.md'), 'utf8');
  const briefSkill = await fs.readFile(path.join(skillsRoot, 'rfp-meeting-brief-skill.md'), 'utf8');
  assert.match(fetchSkill, /never trashes or deletes anything inside a `resources\/` folder/);
  assert.match(briefSkill, /never trash or delete an original/);
  assert.match(briefSkill, /run `skills\/rfp-document-fetch-skill\.md` first/);
  // The sentence that read as "clear out everything except the brief" must not come back.
  assert.doesNotMatch(briefSkill, /the folder holds only the `\.md` working copy/);
});

// Every skill named here is pasted into the Friday scoring prompt, so editing one changes
// scoring. Capability verification was taken out on November 17, 2026: it is a chat step
// that writes an engineer's checklist and has no field in the scored answer.
test('the scorer sends the scoring and solution-landscape skills, and not capability verification', async () => {
  const { policyNames } = await import('../workspace/scripts/rfp-scoring-judgment.mjs');
  assert.deepEqual(policyNames, ['rfp-scoring-skill.md', 'rfp-preliminary-scoring-skill.md', 'rfp-solution-landscape-skill.md']);
  for (const name of policyNames) await fs.access(path.join(skillsRoot, name));
  await fs.access(path.join(skillsRoot, 'rfp-capability-verification-skill.md'));
});

// ISA learns which skills go with each RFP phase only from the phase map in workspace/AGENTS.md
// (the live OpenClaw config doesn't load these skill files on its own), so a renamed or retired
// skill there would leave ISA offering something that isn't there.
test("the phase map in ISA's AGENTS.md names skills that exist, and never offers document refresh or retired ones", async () => {
  const agents = await fs.readFile(path.join(skillsRoot, '..', 'AGENTS.md'), 'utf8');
  const start = agents.indexOf('- **Phases and their skills:**');
  assert.notEqual(start, -1, 'AGENTS.md has no phase map');
  const map = agents.slice(start, agents.indexOf('\n- **', start + 1));
  const named = [...map.matchAll(/`skills\/([^`]+-skill\.md)`/g)].map(match => match[1]);
  assert.equal(named.length, 9);
  for (const name of named) await fs.access(path.join(skillsRoot, name));
  for (const phase of ['Phase 1: Scored', 'Phase 2: Looking closer', 'Phase 3: Building', 'Phase 4: Submitted']) assert.match(map, new RegExp(phase));
  // The Tuesday check covers new documents for Phases 2 and 3 on its own; the meeting brief is retired.
  assert.doesNotMatch(map, /rfp-document-refresh-skill|rfp-meeting-brief-skill/);
  assert.match(map, /Never run a skill just because an RFP moved/);
});
