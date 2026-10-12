#!/usr/bin/env node
// Re-scores RFPs already on the VM with this checkout's scorer, to compare against
// Jake's system (Jira ISA-3). Run it on the VM from a temporary copy of the repo.
// It reads candidate files and saved documents from the live workspace and calls ISA's
// model once per RFP with complete documents. It writes nothing and sends nothing.
//
// Usage: node devtools/score-sample.mjs --date 2026-10-09 [--report <weekly results.json>] [slug ...]
// --report adds that week's strong and worth-a-look picks. --date is the assessment date,
// usually the original run date so deadlines count the same way.
import fs from 'node:fs/promises';
import path from 'node:path';
import { reportEntry } from '../workspace/scripts/rfp-report.mjs';
import {
  extractManifestEvidence, findLocalResourcesDir, readPortalCandidate, scoreCandidateFromText,
} from '../workspace/scripts/weekly-rfp-pursue-decision.mjs';

const WORKSPACE = process.env.WORKSPACE_DIR || '/home/azureuser/.openclaw/workspace';
const args = process.argv.slice(2);
const option = name => {
  const index = args.indexOf(name);
  return index === -1 ? null : args.splice(index, 2)[1];
};
const runDate = option('--date') || new Date().toISOString().slice(0, 10);
const reportPath = option('--report');
const slugs = [...args];
if (reportPath) {
  const report = JSON.parse(await fs.readFile(reportPath, 'utf8'));
  slugs.push(...report.entries.filter(entry => ['strong', 'worth'].includes(entry.tier)).map(entry => entry.slug));
}
if (!slugs.length || !/^\d{4}-\d{2}-\d{2}$/.test(runDate)) {
  console.error('Usage: node devtools/score-sample.mjs --date YYYY-MM-DD [--report <results.json>] [slug ...]');
  process.exit(1);
}

const gateSummary = gate => ['gate1', 'gate2', 'gate3', 'gate4', 'gate5', 'gate6']
  .map(key => `${key.slice(4)}:${gate?.[key] === true ? 'pass' : gate?.[key] === false ? 'FAIL' : '?'}`).join(' ');

async function scoreOne(slug) {
  const candidate = await readPortalCandidate(path.join(WORKSPACE, 'RFP-pipeline', 'candidates', slug, 'candidate.md'));
  const resourcesDir = await findLocalResourcesDir(slug);
  const manifest = resourcesDir ? JSON.parse(await fs.readFile(path.join(resourcesDir, '_document-manifest.json'), 'utf8').catch(() => 'null')) : null;
  // Same rule as the weekly job: no model call without a complete document set.
  let result = { recommendation: 'Needs documents', gate: {}, gateReasons: [], reasons: ['No saved documents.'] };
  if (manifest) {
    const { documents, completeness } = await extractManifestEvidence(manifest, resourcesDir);
    result = completeness.complete
      ? await scoreCandidateFromText({ candidate, runDate, documents, completeness })
      : { ...result, reasons: completeness.reasons };
  }
  const preliminary = { status: 'preliminary', preview: { total: Number(candidate.frontmatter.preliminary_score) || null } };
  const entry = reportEntry({ candidate, preliminary, final: result, documentStatus: 'full-text' });
  return {
    slug,
    title: entry.title,
    recommendation: result.recommendation,
    total: result.total ?? null,
    potential: result.potential_total ?? null,
    gates: gateSummary(result.gate),
    emailTier: entry.tier,
    notPassed: (result.gateReasons || []).filter(item => item.pass !== true).map(item => `${item.gate}: ${item.reason}`).slice(0, 3),
    model: result.provenance?.model || null,
    error: result.scoring_error || null,
  };
}

for (const slug of slugs) {
  const started = Date.now();
  const row = await scoreOne(slug).catch(error => ({ slug, error: error.message }));
  console.log(JSON.stringify({ ...row, seconds: Math.round((Date.now() - started) / 1000) }));
}
