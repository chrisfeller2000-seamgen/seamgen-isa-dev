#!/usr/bin/env node
// Builds the Friday pursue email and Telegram summary from saved RFP entries and sends
// nothing, so the wording can be reviewed before it goes live (Jira ISA-6).
//
// Usage: npm run rfp:preview -- <file> [--isa]
// <file> is a weekly results file ({ entries }) or `score-sample.mjs --entries` output (one
// JSON line per RFP). With --isa, ISA's model writes the words through the installed
// OpenClaw, as the Friday job does (one model call each for the email and the message);
// without it, the code-built version is shown. Output goes to .isa-local/preview/.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildResults, pursueFacts, renderPursueEmail, telegramFacts, vibeFrom, writePursueEmail, writeTelegramMessage,
} from '../workspace/scripts/rfp-report.mjs';
import { createOpenClawJudge } from '../workspace/scripts/rfp-scoring-judgment.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const file = args.find(arg => !arg.startsWith('--'));
if (!file) {
  console.error('Usage: npm run rfp:preview -- <results.json | score-sample output> [--isa]');
  process.exit(1);
}

const raw = await fs.readFile(file, 'utf8');
let entries;
try {
  const parsed = JSON.parse(raw);
  entries = Array.isArray(parsed) ? parsed : parsed.entries;
} catch {
  // One JSON line per RFP. OpenClaw also logs to stdout during model calls, so other lines are skipped.
  entries = raw.split('\n').filter(line => line.startsWith('{')).map(line => JSON.parse(line).entry).filter(Boolean);
}
if (!entries?.length) {
  console.error('No RFP entries found. For score-sample output, run it with --entries.');
  process.exit(1);
}

const complete = args.includes('--isa') ? await createOpenClawJudge() : null;
const vibe = vibeFrom(await fs.readFile(path.join(repoRoot, 'workspace', 'IDENTITY.md'), 'utf8').catch(() => ''));
const results = buildResults({ runDate: new Date().toISOString().slice(0, 10), week: 'preview', entries });
const pursue = pursueFacts(results);
const written = pursue.picks.length ? await writePursueEmail(pursue, complete, { vibe }) : null;
const email = written ? renderPursueEmail(pursue, written.sentences) : null;
const facts = telegramFacts(results, pursue, { status: email ? 'preview' : 'none', sentences: written?.sentences });
const telegram = await writeTelegramMessage(facts, complete, { vibe });

const outDir = path.join(repoRoot, '.isa-local', 'preview');
await fs.mkdir(outDir, { recursive: true });
const files = { 'telegram.md': `${telegram.text}\n` };
if (email) Object.assign(files, { 'email.html': email.html, 'email.txt': `Subject: ${email.subject}\n\n${email.text}\n` });
for (const [name, content] of Object.entries(files)) await fs.writeFile(path.join(outDir, name), content, 'utf8');

const how = outcome => `${outcome.source}${outcome.reason ? ` (${outcome.reason})` : ''}`;
console.log(`${entries.length} RFPs, ${pursue.picks.length} Strong Pursue.`);
console.log(email ? `Email: "${email.subject}", written by ${how(written)}.` : 'Email: none this week.');
console.log(`Telegram: written by ${how(telegram)}.`);
console.log(`Files: ${Object.keys(files).map(name => path.join('.isa-local', 'preview', name)).join(', ')}`);
