import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import { scanRfpsInProgress } from '../workspace/scripts/rfp-folders.mjs';
import { matchKeylessRfp } from '../workspace/scripts/weekly-rfp-pursue-decision.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = pathToFileURL(path.join(repoRoot, 'devtools', 'fixtures', 'weekly-run.mjs')).href;
const readJson = async file => JSON.parse(await fs.readFile(file, 'utf8'));

const forwarded = { slug: 'yonkers-seniors-app', title: 'Connect Seniors App', agency: 'City of Yonkers', number: 'RFP-561' };

test('a forwarded RFP matches a listing by its solicitation number from the same agency', () => {
  const listing = { title: 'Mobile App for Senior Services', agency: 'Yonkers, City of', text: 'Solicitation RFP 561 — proposals due December 4.' };
  assert.deepEqual(matchKeylessRfp(listing, [forwarded]), { rfp: forwarded, rule: 'number' });
  assert.equal(matchKeylessRfp({ ...listing, text: 'Bid #RFP-561' }, [forwarded])?.rule, 'number');
});

test('a number alone is not enough: another agency, a longer number, or a number that is only a year never matches', () => {
  const text = 'Solicitation RFP-561.';
  assert.equal(matchKeylessRfp({ title: 'App', agency: 'City of Mount Vernon', text }, [forwarded]), null);
  assert.equal(matchKeylessRfp({ title: 'App', agency: 'City of Yonkers', text: 'Bid RFP-5612 due soon.' }, [forwarded]), null);
  const yearOnly = { ...forwarded, number: '2026' };
  assert.equal(matchKeylessRfp({ title: 'Website', agency: 'City of Yonkers', text: 'Fiscal year 2026 budget.' }, [yearOnly]), null, 'a bare year');
  assert.equal(matchKeylessRfp({ title: 'Website', agency: 'City of Yonkers', text: 'no number' }, [{ ...forwarded, number: '12' }]), null, 'too short');
  // Real numbers in other shapes still match.
  assert.equal(matchKeylessRfp({ title: 'x', agency: 'City of Yonkers', text: 'Bid 1913-27 is open.' }, [{ ...forwarded, number: '1913-27' }])?.rule, 'number');
  assert.equal(matchKeylessRfp({ title: 'x', agency: 'City of Yonkers', text: 'Solicitation 39891.' }, [{ ...forwarded, number: '39891' }])?.rule, 'number');
});

test('a forwarded RFP with no number matches only the same title from the same agency', () => {
  const noNumber = { slug: 'website', title: 'Website Redesign', agency: 'City of Laguna Beach', number: '' };
  assert.equal(matchKeylessRfp({ title: 'RFP: Website Redesign', agency: 'City of Laguna Beach', text: '' }, [noNumber])?.rule, 'title');
  assert.equal(matchKeylessRfp({ title: 'Website Redesign', agency: 'City of Chandler', text: '' }, [noNumber]), null, 'a generic title from another agency');
  assert.equal(matchKeylessRfp({ title: 'Website Redesign', agency: 'City of Laguna Beach', text: '' }, [{ ...noNumber, agency: '' }]), null, 'no agency recorded');
});

function run(script, workspaceDir) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['--import', fixture, path.join(repoRoot, 'workspace', 'scripts', script)], {
      cwd: repoRoot,
      env: {
        WORKSPACE_DIR: workspaceDir, HIGHERGOV_API_KEY: 'fixture-key', RFP_RUN_DATE: '2026-10-16',
        RFP_INTAKE_REPLAY: '2026-10-08:2026-10-08', RFP_DOCUMENT_FETCH_ENABLED: '1', RFP_DELIVERY: 'preview',
        NO_TELEGRAM: '1', RFP_EMAIL_TO: 'fixture@example.test', TELEGRAM_TARGET: 'fixture',
        PATH: path.dirname(process.execPath), ...(process.env.SYSTEMROOT ? { SYSTEMROOT: process.env.SYSTEMROOT } : {}),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', chunk => { stderr += chunk.toString(); });
    child.on('close', code => resolve({ code, stderr }));
  });
}

test('a whole Friday run recognizes a forwarded RFP\'s listing, leaves it unscored, and saves its HigherGov key for the Tuesday check', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'isa-keyless-'));
  try {
    await fs.mkdir(path.join(root, 'tools'), { recursive: true });
    await fs.mkdir(path.join(root, 'RFP-pipeline', 'candidates'), { recursive: true });
    await fs.writeFile(path.join(root, 'tools', 'highergov-config.json'), JSON.stringify({ searchId: 'fixture-search', sourceType: 'sled', pageSize: 25, safetyLagDays: 1, seamgenProfile: {} }));
    await fs.writeFile(path.join(root, 'RFP-pipeline', 'state.json'), JSON.stringify({ schemaVersion: 1, searchId: 'fixture-search', highWaterCapturedDate: '2026-10-08', quota: {}, days: {} }));
    await fs.writeFile(path.join(root, 'RFP-pipeline', 'seen.csv'), 'version_key,opp_key,captured_date,seen_utc\n');
    // A teammate forwarded this RFP; it was moved to Building with no HigherGov key.
    const dir = path.join(root, 'RFPs', '3-building', 'forwarded-portal');
    await fs.mkdir(path.join(dir, 'resources'), { recursive: true });
    await fs.writeFile(path.join(dir, 'resources', 'Portal RFP from the agency.pdf'), '%PDF forwarded');
    await fs.writeFile(path.join(dir, '_stage.json'), JSON.stringify({ slug: 'forwarded-portal', title: 'Synthetic Case Management Portal',
      agency: 'Example Public Agency', stage: '3-building', history: [] }));
    assert.equal((await scanRfpsInProgress({ workspace: root })).keyless.length, 1);

    const friday = await run('weekly-rfp-pursue-decision.mjs', root);
    assert.equal(friday.code, 0, friday.stderr);
    const week = await readJson(path.join(root, 'reports', 'new-rfp-qualification', 'latest.json'));
    assert.equal(week.entries.some(entry => entry.title === 'Synthetic Case Management Portal'), false, 'not scored as a new RFP');
    assert.deepEqual(week.inProgress.map(item => [item.slug, item.stageLabel, item.matchedBy]), [['forwarded-portal', 'Building', 'title']]);
    assert.match(await fs.readFile(path.join(root, 'reports', 'new-rfp-qualification', 'latest.md'), 'utf8'),
      /- Synthetic Case Management Portal \(Building\): now on HigherGov as "Synthetic Case Management Portal", matched by its title and agency; the Tuesday check follows it from now on\./);
    // Nothing was downloaded into its folder or anywhere else for it.
    assert.deepEqual(await fs.readdir(path.join(dir, 'resources')), ['Portal RFP from the agency.pdf']);
    const saved = await readJson(path.join(dir, '_refresh.json'));
    assert.deepEqual([saved.oppKey, saved.versionKey, saved.dueDate, saved.matched.rule, saved.documents.map(doc => doc.name)],
      ['fixture-portal', 'fixture-portal-v1', '2026-11-30', 'title', ['Portal RFP from the agency.pdf']]);
    const after = await scanRfpsInProgress({ workspace: root });
    assert.deepEqual([after.keyless.length, after.byOpp.get('fixture-portal')?.slug], [0, 'forwarded-portal']);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
