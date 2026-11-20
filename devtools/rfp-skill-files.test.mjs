import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { INDEX_PATH, rebuiltIndex } from './rfp-index.mjs';

const skillsRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'workspace', 'skills');
const agentsPath = path.join(skillsRoot, '..', 'AGENTS.md');

// Every skill file: the older `*-skill.md` files and the RFP skills' `rfp/<id>/instructions.md`.
async function skillFiles(dir = skillsRoot) {
  const found = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...await skillFiles(full));
    else if (entry.name.endsWith('-skill.md') || entry.name === 'instructions.md') found.push(full);
  }
  return found;
}

// The fetch skill file was an exact copy of the refresh skill from the first VM import until
// October 12, 2026, so ISA had no fetch procedure and nothing flagged it. Other skills call each
// other by name, so a file holding another skill's text fails silently.
test('each skill file holds its own skill', async () => {
  const names = new Map();
  const hashes = new Map();
  for (const file of await skillFiles()) {
    const text = await fs.readFile(file, 'utf8');
    const relative = path.relative(skillsRoot, file);
    const name = text.match(/^name:\s*(.+)$/m)?.[1].trim();
    if (file.endsWith('-skill.md')) assert.equal(name, path.basename(file, '-skill.md'), `${relative} declares a different skill name`);
    else assert.ok(name, `${relative} has no name`);
    assert.equal(names.get(name), undefined, `${relative} repeats the name used by ${names.get(name)}`);
    names.set(name, relative);
    const hash = createHash('sha256').update(text).digest('hex');
    assert.equal(hashes.get(hash), undefined, `${relative} has the same contents as ${hashes.get(hash)}`);
    hashes.set(hash, relative);
  }
});

test('the meeting brief and fetch skills keep original RFP documents out of cleanup', async () => {
  const fetchSkill = await fs.readFile(path.join(skillsRoot, 'rfp', 'document-fetch', 'instructions.md'), 'utf8');
  const briefSkill = await fs.readFile(path.join(skillsRoot, 'rfp-meeting-brief-skill.md'), 'utf8');
  assert.match(fetchSkill, /never trashes or deletes anything inside a `resources\/` folder/);
  assert.match(briefSkill, /never trash or delete an original/);
  assert.match(briefSkill, /run `skills\/rfp\/document-fetch\/instructions\.md` first/);
  // The sentence that read as "clear out everything except the brief" must not come back.
  assert.doesNotMatch(briefSkill, /the folder holds only the `\.md` working copy/);
});

// Every skill named here is pasted into the Friday scoring prompt, so editing one changes
// scoring. Capability verification was taken out on November 17, 2026: it is a chat step
// that writes an engineer's checklist and has no field in the scored answer. These three stay
// as `*-skill.md` files in skills/ because the scorer reads them by file name.
test('the scorer sends the scoring and solution-landscape skills, and not capability verification', async () => {
  const { policyNames } = await import('../workspace/scripts/rfp-scoring-judgment.mjs');
  assert.deepEqual(policyNames, ['rfp-scoring-skill.md', 'rfp-preliminary-scoring-skill.md', 'rfp-solution-landscape-skill.md']);
  for (const name of policyNames) await fs.access(path.join(skillsRoot, name));
  await fs.access(path.join(skillsRoot, 'rfp', 'capability-check', 'instructions.md'));
});

// ISA has no CLAUDE.md, and AGENTS.md lost its "RFP stage folders" section when it was trimmed
// under OpenClaw's size limit, so pointers to either send ISA looking for rules it can't find.
// "Too early" refused Phase 1 RFPs, though a phase never blocks a skill. Edit history may still
// name them; only the instructions above it are checked.
test('the Phase 2 skills cite no rule ISA cannot look up', async () => {
  for (const id of ['engineering-brief', 'capability-check', 'agency-questions']) {
    const text = await fs.readFile(path.join(skillsRoot, 'rfp', id, 'instructions.md'), 'utf8');
    const historyAt = text.indexOf('## Notes and edit history');
    assert.ok(historyAt > 0, `${id} has no edit history heading`);
    const body = text.slice(0, historyAt);
    assert.doesNotMatch(body, /CLAUDE\.md/, `${id} cites CLAUDE.md`);
    assert.doesNotMatch(body, /RFP stage folders/, `${id} points at a section AGENTS.md no longer has`);
    assert.doesNotMatch(body, /\(Rule \d+\)/, `${id} cites a numbered rule from CLAUDE.md`);
    assert.doesNotMatch(body, /too early/i, `${id} refuses an RFP by phase`);
    assert.doesNotMatch(body, /Slacking/, `${id} assumes ISA sends through Slack`);
  }
  assert.match(await fs.readFile(INDEX_PATH, 'utf8'), /^## Phases$/m);
});

// OpenClaw loads any file named SKILL.md under skills/ as one of its own skills, next to the
// Skill Workshop's skills. ISA's RFP skills are kept out of that system on purpose: they are
// reached through the router and skills/rfp/INDEX.md instead.
test('no file is named SKILL.md, so OpenClaw never loads an RFP skill as its own', async () => {
  const found = [];
  const walk = async dir => {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.name.toLowerCase() === 'skill.md') found.push(path.relative(skillsRoot, full));
    }
  };
  await walk(skillsRoot);
  assert.deepEqual(found, []);
});

// The skill table is built from each skill's header, so a trigger or phase is edited in one place.
test("the RFP index's skill table matches the skill headers", async () => {
  assert.equal(await fs.readFile(INDEX_PATH, 'utf8'), await rebuiltIndex(), 'Run: npm run rfp:index');
});

// Local tests on November 18, 2026: the model picked the right skill when a request named an RFP
// task, but not for open wording, a bare "yes" or a number. The router decides in code instead.
test("ISA's AGENTS.md sends every RFP message through the router and keeps the hard rules", async () => {
  const agents = await fs.readFile(agentsPath, 'utf8');
  const section = agents.slice(agents.indexOf('## RFP updates'), agents.indexOf('## Tools'));
  // The message goes on standard input: quotes, $( or backticks in it must never reach a shell.
  assert.match(section, /on standard input \(never inside quotes on the command line\): `node scripts\/rfp-route\.mjs <<'RFP_MESSAGE_END'`/);
  assert.match(section, /even just "yes", "no" or a number/);
  assert.match(section, /`callback_data: rfp:` tap/);
  assert.match(section, /`skills\/rfp\/INDEX\.md`/);
  assert.match(section, /never run the weekly RFP job or the Tuesday check unless someone explicitly asks/);
  assert.match(section, /never say an RFP moved unless `rfp-stage\.mjs` printed that it did/);
  // The Gmail footer rule pulled one local test into a freehand agency email.
  assert.match(agents, /An email to an agency about an RFP or a proposal, including the one that goes with a proposal, is not outreach: run the RFP router first/);
  for (const file of [...section.matchAll(/`(skills\/[^`]+\.md)`/g)].map(match => match[1])) await fs.access(path.join(skillsRoot, '..', file));
});

// OpenClaw injects AGENTS.md into ISA's context only up to bootstrapMaxChars (20,000 by default in
// OpenClaw 2026.9.4 and on the VM's 2026.9.9). A longer file is cut to its first 9,000 and last
// 3,000 characters plus headings and bullets clipped to 240 characters each, which drops most of
// the RFP rules. On November 18, 2026 the phase map pushed it to 21,757 characters and local ISA
// listed only half the Phase 2 skills. Keep it under the limit; put long procedures in skill files.
test("ISA's AGENTS.md fits in OpenClaw's bootstrap limit, so none of it is cut", async () => {
  const agents = await fs.readFile(agentsPath, 'utf8');
  assert.ok(agents.length < 20000, `AGENTS.md is ${agents.length} characters; OpenClaw cuts anything over 20,000`);
});
