import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { routeWorkspace } from './fixtures/rfp-route-workspace.mjs';
import { loadSkills, normalize, routeRequest } from '../workspace/scripts/rfp-route.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const phrases = JSON.parse(await fs.readFile(path.join(repoRoot, 'devtools', 'fixtures', 'rfp-route-phrases.json'), 'utf8'));

// Every phrasing, checked together so a failure lists every request the router got wrong.
test('the router reads each way of asking as the right skill, RFP and next step', async () => {
  const workspace = await routeWorkspace();
  try {
    const wrong = [];
    for (const expected of phrases.cases) {
      const got = await routeRequest(expected.say, { workspace });
      const mismatch = [
        got.action !== expected.action && `action ${got.action}, wanted ${expected.action}`,
        'skill' in expected && got.skill?.id !== expected.skill && `skill ${got.skill?.id}, wanted ${expected.skill}`,
        'rfp' in expected && got.rfp?.slug !== expected.rfp && `rfp ${got.rfp?.slug}, wanted ${expected.rfp}`,
        'toPhase' in expected && got.toPhase !== expected.toPhase && `phase ${got.toPhase}, wanted ${expected.toPhase}`,
        'about' in expected && (got.about ?? null) !== expected.about && `about ${got.about}, wanted ${expected.about}`,
      ].filter(Boolean);
      if (mismatch.length) wrong.push(`"${expected.say}": ${mismatch.join('; ')}`);
    }
    assert.deepEqual(wrong, [], `${wrong.length} of ${phrases.cases.length} requests routed wrong`);
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test('a later-phase skill asks first, with one command per choice, and "--stay" runs it in place', async () => {
  const workspace = await routeWorkspace();
  try {
    const ask = await routeRequest('Can you put together the submission checklist for Laguna Beach?', { workspace });
    assert.equal(ask.action, 'ask-move');
    assert.deepEqual(ask.choices.map(choice => choice.command), [
      'rfp move laguna-beach-website-redesign building',
      'rfp checklist laguna-beach-website-redesign --stay',
    ]);
    assert.equal(ask.choices[0].then, 'rfp checklist laguna-beach-website-redesign');
    assert.match(ask.say, /^"Submission checklist" is a Phase 3: Building skill, and .* is in Phase 2: Shortlisted\. Want me to move it first\?\n1\. /);
    const stay = await routeRequest(ask.choices[1].command, { workspace });
    assert.equal(stay.action, 'run-skill');
    assert.equal(stay.skill.file, 'skills/rfp/submission-checklist/instructions.md');
    // The submission email is written before the proposal goes in: it never asks about a move.
    const email = await routeRequest('rfp submission-email laguna-beach-website-redesign', { workspace });
    assert.equal(email.action, 'run-skill');
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test('a move names the exact rfp-stage.mjs command, and gives no after-move text of its own', async () => {
  const workspace = await routeWorkspace();
  try {
    const move = await routeRequest('Yes, move Pasco County', { workspace });
    assert.equal(move.command, 'node scripts/rfp-stage.mjs pasco-county-records-system shortlisted --by "<their name>"');
    assert.match(move.note, /Never say it moved otherwise/);
    // In local runs ISA twice sent a pre-written "Moved …" text without running the move, so the
    // skill list after a move comes only from rfp-stage.mjs (see rfp-stage.test.mjs).
    assert.equal(move.after, undefined);
    // Every choice carries the exact router call to run when the person replies with its number.
    const ask = await routeRequest('Can you put together the submission checklist for Laguna Beach?', { workspace });
    assert.deepEqual(ask.choices.map(choice => choice.route), [
      'node scripts/rfp-route.mjs "rfp move laguna-beach-website-redesign building"',
      'node scripts/rfp-route.mjs "rfp checklist laguna-beach-website-redesign --stay"',
    ]);
    assert.equal(ask.choices[0].thenRoute, 'node scripts/rfp-route.mjs "rfp checklist laguna-beach-website-redesign"');
    // Phase 1 has no skills to run; the offer says so and suggests the move.
    const offer = await routeRequest('rfp skills chandler-permit-portal', { workspace });
    assert.match(offer.say, /Nothing to run in Phase 1: Scored/);
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test('the router only reads: the workspace is byte-for-byte the same after every request', async () => {
  const workspace = await routeWorkspace();
  const snapshot = async () => {
    const files = [];
    const walk = async dir => {
      for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) await walk(full);
        else files.push(`${path.relative(workspace, full)}:${(await fs.readFile(full)).toString('base64')}`);
      }
    };
    await walk(workspace);
    return files.sort();
  };
  try {
    const before = await snapshot();
    for (const expected of phrases.cases) await routeRequest(expected.say, { workspace });
    assert.deepEqual(await snapshot(), before);
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test('the command line prints one JSON decision', async () => {
  const workspace = await routeWorkspace();
  try {
    const run = spawnSync(process.execPath, [path.join(repoRoot, 'workspace', 'scripts', 'rfp-route.mjs'), 'rfp', 'brief', 'Laguna', 'Beach'],
      { env: { ...process.env, WORKSPACE_DIR: workspace }, encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    const decision = JSON.parse(run.stdout);
    assert.equal(decision.action, 'run-skill');
    assert.equal(decision.rfp.slug, 'laguna-beach-website-redesign');
    const empty = spawnSync(process.execPath, [path.join(repoRoot, 'workspace', 'scripts', 'rfp-route.mjs')], { encoding: 'utf8' });
    assert.equal(empty.status, 1);
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test('each RFP skill folder has a complete router header and its own command', async () => {
  const skills = await loadSkills({ workspace: path.join(repoRoot, 'workspace') });
  assert.equal(skills.length, 11);
  const commands = new Set();
  for (const skill of skills) {
    assert.ok(skill.label && skill.when, `${skill.id} needs a label and a when line`);
    assert.ok(skill.asks.length >= 6, `${skill.id} needs at least six ways people ask for it`);
    assert.ok(skill.phase === null || [2, 3, 4].includes(skill.phase), `${skill.id} has an unknown phase`);
    assert.match(skill.command, /^[a-z][a-z-]*$/);
    assert.ok(!commands.has(skill.command), `${skill.command} is used twice`);
    assert.ok(!['list', 'skills', 'move'].includes(skill.command), `${skill.command} is a reserved word`);
    commands.add(skill.command);
  }
  assert.equal(normalize('Q&A — what’s due?'), 'q and a whats due');
});

// A message with quotes, $( or backticks must never reach a shell: ISA passes it on standard input.
test('the router reads a message on standard input, as written', async () => {
  const workspace = await routeWorkspace();
  try {
    const message = 'Can you do the engineering brief for Laguna Beach? "$(whoami)" `id`';
    const run = spawnSync(process.execPath, [path.join(repoRoot, 'workspace', 'scripts', 'rfp-route.mjs')],
      { env: { ...process.env, WORKSPACE_DIR: workspace }, input: message, encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    const decision = JSON.parse(run.stdout);
    assert.equal(decision.request, message);
    assert.equal(decision.skill.id, 'engineering-brief');
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

// Local tests on November 18, 2026: ISA asked people to send a PDF it already had, because nothing
// told it where an RFP's documents were or how to read them.
test('a decision about an RFP says what documents are saved and how to read them by number', async () => {
  const workspace = await routeWorkspace();
  try {
    const brief = await routeRequest('rfp brief laguna-beach-website-redesign', { workspace });
    assert.equal(brief.action, 'run-skill');
    assert.equal(brief.documents.saved, 4);
    assert.equal(brief.documents.readable, 3);
    assert.deepEqual(brief.documents.files.map(file => file.n), [1, 2, 3, 4]);
    assert.equal(brief.documents.readAll, 'node scripts/document-text.mjs --rfp laguna-beach-website-redesign --file all');
    assert.equal(brief.documents.notes, 'node scripts/document-text.mjs --rfp laguna-beach-website-redesign --notes');
    assert.match(brief.note, /never ask the person for a document that is already saved/);
    // An RFP with an empty folder, and one with no folder at all, point to the fetch skill instead.
    for (const message of ['rfp brief yonkers-senior-services-app', 'rfp fetch pasco-county-records-system']) {
      const empty = await routeRequest(message, { workspace });
      assert.equal(empty.documents.saved, 0, message);
      assert.match(empty.documents.note, /document-fetch/);
    }
    // Questions and moves don't need the documents yet.
    assert.equal((await routeRequest('rfp checklist laguna-beach-website-redesign', { workspace })).documents, undefined);
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});
