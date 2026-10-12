import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createAssessmentContext } from './rfp-deadline.mjs';
import { DOCUMENT_FETCH_THRESHOLD, unscoredRfp } from './rfp-scoring-policy.mjs';
import { scoreRfp } from './rfp-scoring-judgment.mjs';
import {
  classifyDocumentRecord,
  evaluateDocumentCompleteness,
  listDocumentRecords,
  saveDocumentRecord,
} from './highergov-document-flow.mjs';

const opportunityCache = new Map();

export function resolveRunConfig(env = process.env, { now = new Date() } = {}) {
  const assessment = createAssessmentContext({ now, runDate: env.RFP_RUN_DATE, reportingTimeZone: env.RFP_ASSESSMENT_TIME_ZONE || 'UTC' });
  const workspace = env.WORKSPACE_DIR || '/home/azureuser/.openclaw/workspace';
  const outputBasename = env.RFP_SECONDARY_OUT_BASENAME || `${assessment.runDate}-secondary-fulltext`;
  if (!/^[A-Za-z0-9_-]+$/.test(outputBasename)) throw new Error('RFP_SECONDARY_OUT_BASENAME must be a filename without a path or extension.');
  return {
    assessment, workspace, outputBasename,
    reportPath: env.RFP_PRELIM_REPORT_PATH || path.join(workspace, 'reports', 'new-rfp-qualification', `${assessment.runDate}.md`),
    candidatesRoot: path.join(workspace, 'RFP-pipeline', 'candidates'),
    configPath: path.join(workspace, 'tools', 'highergov-config.json'),
  };
}

function normalize(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeKey(value = '') {
  return normalize(value).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ');
}

function parseFrontmatter(fileText) {
  const match = fileText.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) return { frontmatter: {}, body: fileText };
  const frontmatter = {};
  for (const rawLine of match[1].split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    } else if (!value.startsWith('"') && !value.startsWith("'")) {
      const commentIdx = value.indexOf(' #');
      if (commentIdx >= 0) value = value.slice(0, commentIdx).trim();
    }
    frontmatter[key] = value;
  }
  return { frontmatter, body: fileText.slice(match[0].length) };
}

async function loadCandidates(candidatesRoot) {
  const entries = await fs.readdir(candidatesRoot, { withFileTypes: true });
  const candidates = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const candidatePath = path.join(candidatesRoot, entry.name, 'candidate.md');
    try {
      const raw = await fs.readFile(candidatePath, 'utf8');
      const parsed = parseFrontmatter(raw);
      candidates.push({
        path: candidatePath,
        dir: path.dirname(candidatePath),
        raw,
        body: parsed.body,
        frontmatter: parsed.frontmatter,
      });
    } catch {
      // ignore non-candidate folders
    }
  }
  return candidates;
}

async function loadSelectedTitles(reportPath) {
  const report = await fs.readFile(reportPath, 'utf8');
  const matches = [...report.matchAll(/^### (.+)\n- Preliminary score: (\d+)/gm)];
  return matches
    .map((match) => ({ title: match[1].trim(), score: Number.parseInt(match[2], 10) || 0 }))
    .filter((item) => item.score >= DOCUMENT_FETCH_THRESHOLD);
}

async function loadOpportunityRecordsForDate(apiKey, config, capturedDate) {
  const cacheKey = normalize(capturedDate);
  if (opportunityCache.has(cacheKey)) return opportunityCache.get(cacheKey);

  const records = [];
  const pageSize = Number.parseInt(config.pageSize || '25', 10) || 25;
  let pageNumber = 1;
  let pages = null;
  while (!pages || pageNumber <= pages) {
    const url = new URL('https://www.highergov.com/api-external/opportunity/');
    url.searchParams.set('api_key', apiKey);
    url.searchParams.set('search_id', config.searchId);
    url.searchParams.set('source_type', config.sourceType);
    url.searchParams.set('captured_date', cacheKey);
    url.searchParams.set('page_size', String(pageSize));
    url.searchParams.set('page_number', String(pageNumber));
    const response = await fetch(url, { method: 'GET' });
    const text = await response.text();
    if (!response.ok) {
      const error = new Error(`HigherGov opportunity lookup failed (HTTP ${response.status}) for ${cacheKey}`);
      error.status = response.status;
      error.body = text;
      throw error;
    }
    const data = JSON.parse(text);
    const rows = Array.isArray(data.results) ? data.results : [];
    records.push(...rows);
    pages = Number.parseInt(data?.meta?.pagination?.pages || '0', 10) || pageNumber;
    if (!rows.length) break;
    if (pageNumber >= pages) break;
    pageNumber += 1;
  }
  opportunityCache.set(cacheKey, records);
  return records;
}

function textFromPdf(filePath) {
  try {
    return execFileSync('pdftotext', [filePath, '-'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

function textFromDocx(filePath) {
  const script = `
from zipfile import ZipFile
from xml.etree import ElementTree as ET
path = ${JSON.stringify(filePath)}
with ZipFile(path) as z:
    xml = z.read('word/document.xml')
root = ET.fromstring(xml)
texts = [node.text for node in root.iter() if node.tag.endswith('}t') and node.text]
print(' '.join(texts))
`;
  try {
    return execFileSync('python3', ['-c', script], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

function textFromXlsx(filePath) {
  const script = `
from zipfile import ZipFile
from xml.etree import ElementTree as ET
path = ${JSON.stringify(filePath)}
ns = {'a': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
with ZipFile(path) as z:
    shared = []
    if 'xl/sharedStrings.xml' in z.namelist():
        root = ET.fromstring(z.read('xl/sharedStrings.xml'))
        for si in root.findall('.//a:si', ns):
            pieces = []
            for node in si.iter():
                if node.tag.endswith('}t') and node.text:
                    pieces.append(node.text)
            shared.append(''.join(pieces))
    values = []
    for name in sorted([n for n in z.namelist() if n.startswith('xl/worksheets/sheet') and n.endswith('.xml')]):
        root = ET.fromstring(z.read(name))
        for c in root.findall('.//a:c', ns):
            t = c.attrib.get('t')
            v = c.find('a:v', ns)
            if v is None or not v.text:
                continue
            if t == 's':
                idx = int(v.text)
                if 0 <= idx < len(shared):
                    values.append(shared[idx])
            else:
                values.append(v.text)
print(' '.join(values))
`;
  try {
    return execFileSync('python3', ['-c', script], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

function textFromHtml(filePath) {
  try {
    const raw = execFileSync('python3', ['-c', `from pathlib import Path\nprint(Path(${JSON.stringify(filePath)}).read_text(encoding='utf-8', errors='ignore'))`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return raw
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/\s+/g, ' ')
      .trim();
  } catch {
    return '';
  }
}

function extractText(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.pdf') return textFromPdf(filePath);
  if (ext === '.docx') return textFromDocx(filePath);
  if (ext === '.xlsx') return textFromXlsx(filePath);
  if (ext === '.html' || ext === '.htm') return textFromHtml(filePath);
  if (ext === '.txt' || ext === '.md') {
    return fs.readFile(filePath, 'utf8').catch(() => '');
  }
  return '';
}

async function extractTextRecursive(dirPath) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...await extractTextRecursive(full));
    } else {
      const ext = path.extname(entry.name).toLowerCase();
      if (['.pdf', '.docx', '.xlsx', '.html', '.htm', '.txt', '.md'].includes(ext)) files.push(full);
    }
  }
  return files;
}

async function fetchAndExtract(candidate, config, apiKey) {
  const resourcesDir = path.join(os.tmpdir(), `secondary-fulltext-${candidate.frontmatter.slug || 'rfp'}-${Date.now()}`, 'resources');
  await fs.mkdir(resourcesDir, { recursive: true });
  const capturedDate = normalize(candidate.frontmatter.captured_date || '');
  // Reasons reach the report and ISA's chat answers. They are fixed text because
  // provider errors and download links can carry API keys or signed URLs.
  if (!capturedDate) {
    return { status: 'metadata-only', reason: 'Listing could not be looked up in HigherGov (no capture date).' };
  }
  const records = await loadOpportunityRecordsForDate(apiKey, config, capturedDate);
  const versionKey = normalize(candidate.frontmatter.version_key || '');
  const oppKey = normalize(candidate.frontmatter.opp_key || '');
  const lookupRecord = records.find((record) => {
    const recordVersionKey = normalize(record.version_key || '');
    const recordOppKey = normalize(record.opp_key || '');
    return (versionKey && recordVersionKey === versionKey) || (oppKey && recordOppKey === oppKey);
  });
  if (!lookupRecord) {
    return { status: 'failed', reason: 'Listing could not be found again in HigherGov.' };
  }
  const documentPath = normalize(lookupRecord.document_path || '');
  if (!documentPath) {
    return { status: 'access-blocked', reason: 'HigherGov listing has no documents link.' };
  }
  const documentRecords = await listDocumentRecords({ apiKey, documentPath }).catch((error) => ({ __error: error }));
  if (documentRecords.__error) {
    return { status: 'failed', reason: 'Document retrieval failed.' };
  }
  if (!Array.isArray(documentRecords) || !documentRecords.length) {
    // Keep the newer live distinction: an empty list is not proven access denial.
    return { status: 'document-list-empty', reason: 'HigherGov returned no documents.' };
  }
  const manifest = [];
  for (let i = 0; i < documentRecords.length; i += 1) {
    const row = await saveDocumentRecord({
      apiKey,
      record: documentRecords[i],
      resourcesDir,
      index: i,
    }).catch((error) => ({
      // Keep the file's role so a required attachment that failed still blocks a final score.
      ...classifyDocumentRecord(documentRecords[i]),
      source_file_name: normalize(documentRecords[i]?.file_name || documentRecords[i]?.name || ''),
      local_path: '',
      local_file_name: '',
      downloaded: false,
      extracted: false,
      document_status: 'failed',
      reason: error?.message || 'download failed',
    }));
    manifest.push(row);
  }
  const documents = [];
  for (const row of manifest) {
    if (!row.downloaded || !row.local_path) continue;
    const extracted = String(await extractText(row.local_path)).trim();
    // Same rule as the weekly job: only non-empty text counts as extracted evidence.
    row.extracted = Boolean(extracted);
    row.extracted_text_chars = normalize(extracted).length;
    if (!extracted) continue;
    // Re-classify with the text: agencies often name the RFP after the project.
    Object.assign(row, classifyDocumentRecord({ file_name: row.source_file_name || row.local_file_name, text: extracted }));
    documents.push({ name: row.local_file_name || row.source_file_name, text: extracted });
  }
  // Downloaded files are not proof that the solicitation was read. Apply the weekly
  // job's check: a readable solicitation and no missing or unreadable required document.
  const completeness = evaluateDocumentCompleteness({ manifest });
  // A scored RFP still lists files nobody read, such as an old-format contract template.
  const unread = manifest.filter((row) => !row.extracted).map((row) => row.source_file_name || row.local_file_name);
  return {
    status: completeness.complete ? 'downloaded' : completeness.status,
    reason: completeness.complete ? (unread.length ? `Files not read: ${unread.join('; ')}` : '') : completeness.reasons.join('; '),
    resourcesDir,
    manifest,
    documents,
    completeness,
  };
}

// Report titles must match exactly one candidate (title, slug, or "title — agency").
// No forced titles and no fuzzy guesses: anything else is listed for review.
export function resolveSelectedCandidates(selectedTitles, candidates) {
  const selection = [], reviews = [], seen = new Set();
  for (const item of selectedTitles.filter((entry) => entry.score >= DOCUMENT_FETCH_THRESHOLD)) {
    const matches = candidates.filter(({ frontmatter: { title, slug, agency_name: agency } }) =>
      [title, slug, `${title} — ${agency}`, `${title} - ${agency}`].some((value) => normalizeKey(value || '') === normalizeKey(item.title)));
    if (matches.length !== 1) {
      reviews.push({ item, reason: matches.length ? 'Ambiguous candidate match; manual review required.' : 'No exact candidate match; manual review required.' });
      continue;
    }
    const [candidate] = matches;
    const key = candidate.frontmatter.slug || candidate.dir;
    if (!seen.has(key)) { selection.push({ item, candidate }); seen.add(key); }
  }
  return { selection, reviews };
}

function resultRow(candidate, item, score, fetch) {
  return {
    title: candidate.frontmatter.title || item.title,
    agency: candidate.frontmatter.agency_name || 'unknown',
    slug: candidate.frontmatter.slug || '',
    preliminary_score: Number(candidate.frontmatter.preliminary_score || item.score || 0),
    fulltext_score: score.total,
    recommendation: score.recommendation,
    qualification_status: score.qualification_status,
    scoring_confidence: score.scoring_confidence,
    scoring_reasons: score.reasons,
    scoring_error: score.scoring_error || null,
    gate: score.gate,
    gateReasons: score.gateReasons || [],
    categories: score.categories,
    competitive: score.cp,
    timeline: score.timeline,
    flags: score.flags || [],
    conditional: score.conditional || null,
    judgments: score.judgments || null,
    provenance: score.provenance || null,
    fetchStatus: fetch.status,
    fetchReason: fetch.reason || '',
    resourcesDir: fetch.resourcesDir || '',
  };
}

async function main() {
  const run = resolveRunConfig();
  const apiKey = process.env.HIGHERGOV_API_KEY || '';
  if (!apiKey) {
    throw new Error('HIGHERGOV_API_KEY is required.');
  }
  const config = JSON.parse(await fs.readFile(run.configPath, 'utf8'));
  const selectedTitles = await loadSelectedTitles(run.reportPath);
  const candidates = await loadCandidates(run.candidatesRoot);
  const { selection, reviews } = resolveSelectedCandidates(selectedTitles, candidates);
  const results = reviews.map(({ item, reason }) => resultRow({ frontmatter: {} }, item,
    unscoredRfp({ candidate: { frontmatter: {} }, phase: 'full-text', assessment: run.assessment }, reason, 'Needs review'),
    { status: 'not-attempted', reason }));
  for (const { item, candidate } of selection) {
    process.stderr.write(`[secondary-fulltext] scoring ${candidate.frontmatter.title || item.title}\n`);
    try {
      const fetch = await fetchAndExtract(candidate, config, apiKey);
      // Only a readable solicitation is scored; listing text never stands in for it.
      const score = fetch.status === 'downloaded'
        ? await scoreRfp({ candidate, phase: 'full-text', documents: fetch.documents, completeness: fetch.completeness, assessment: run.assessment }, { workspace: run.workspace })
        : unscoredRfp({ candidate, phase: 'full-text', assessment: run.assessment }, fetch.reason, 'Needs documents');
      process.stderr.write(`[secondary-fulltext] -> ${candidate.frontmatter.title || item.title}: fetch=${fetch.status}, full=${score.total}, rec=${score.recommendation}
`);
      results.push(resultRow(candidate, item, score, fetch));
    } catch {
      // Lookup errors can include provider details; record only a fixed reason.
      const fetch = { status: 'failed', reason: 'Document retrieval failed.' };
      const score = unscoredRfp({ candidate, phase: 'full-text', assessment: run.assessment }, fetch.reason, 'Needs documents');
      process.stderr.write(`[secondary-fulltext] -> ${candidate.frontmatter.title || item.title}: fetch=failed, full=${score.total}, rec=${score.recommendation}
`);
      results.push(resultRow(candidate, item, score, fetch));
    }
  }

  const report = buildSecondaryReport(results, run.assessment);
  const reportDir = path.join(run.workspace, 'reports', 'new-rfp-qualification');
  await fs.mkdir(reportDir, { recursive: true });
  await fs.writeFile(path.join(reportDir, `${run.outputBasename}.json`), JSON.stringify({ summary: report.summary, results: report.results }, null, 2));
  await fs.writeFile(path.join(reportDir, `${run.outputBasename}.md`), report.markdown);
  process.stdout.write(`${JSON.stringify(report.summary, null, 2)}\n`);
}

export function buildSecondaryReport(inputResults, assessment) {
  const byFinalScore = (a, b) => (Number.isFinite(b.fulltext_score) ? b.fulltext_score : -Infinity)
    - (Number.isFinite(a.fulltext_score) ? a.fulltext_score : -Infinity) || a.title.localeCompare(b.title);
  const byPreliminary = (a, b) => (Number(b.preliminary_score) || 0) - (Number(a.preliminary_score) || 0) || a.title.localeCompare(b.title);
  const scored = inputResults.filter((r) => r.recommendation !== 'Needs documents').sort(byFinalScore);
  // Unscored for missing evidence, not rejected: listed after scored rows by preliminary score.
  const needsDocuments = inputResults.filter((r) => r.recommendation === 'Needs documents').sort(byPreliminary);
  const results = [...scored, ...needsDocuments];
  const count = (...recommendations) => results.filter((r) => recommendations.includes(r.recommendation)).length;
  const gatesOf = (row) => [1, 2, 3, 4, 5, 6].map((n) => row.gate?.[`gate${n}`]);
  const summary = {
    runDate: assessment.runDate,
    assessmentTimestamp: assessment.assessmentTimestamp,
    assessmentTimeZone: assessment.reportingTimeZone,
    assessmentOverrideUsed: assessment.overrideUsed,
    total: results.length,
    // Only a validated, document-backed qualification counts as a pursuit.
    strongPursue: results.filter((r) => r.recommendation === 'Strong Pursue' && r.qualification_status === 'qualified').length,
    worthALook: count('Worth a look'),
    noBid: count('No-bid'),
    conditional: count('Conditional — Ask the Agency'),
    needsReview: count('Needs review'),
    deadlineNeedsReview: count('Deadline needs review'),
    needsDocuments: needsDocuments.length,
    watch: count('Watch item', 'Not an open bid'),
    gateFails: results.filter((r) => gatesOf(r).includes(false)).length,
  };

  const mdLines = [
    `# Secondary Full-Text Scoring - ${assessment.runDate}`,
    '',
    `- Assessment timezone: ${assessment.reportingTimeZone}; historical date override: ${assessment.overrideUsed ? 'yes' : 'no'}`,
    `- Selected candidates: ${summary.total}`,
    `- Strong Pursue: ${summary.strongPursue}`,
    `- Worth a look: ${summary.worthALook}`,
    `- No-bid / gate-fail: ${summary.noBid}`,
    `- Conditional — Ask the Agency: ${summary.conditional}`,
    `- Needs review: ${summary.needsReview}`,
    `- Deadline needs review: ${summary.deadlineNeedsReview}`,
    `- Needs documents: ${summary.needsDocuments}`,
    `- Watch item / not an open bid: ${summary.watch}`,
    '',
  ];
  for (const row of scored) {
    const gates = gatesOf(row);
    const { categories: c, timeline: t } = row;
    mdLines.push(
      `### ${row.title}`,
      `- Agency: ${row.agency}`,
      `- Prelim: ${row.preliminary_score}`,
      `- Full-text: ${row.fulltext_score ?? 'Not finalized'}`,
      `- Recommendation: ${row.recommendation}`,
      `- Fetch: ${row.fetchStatus}${row.fetchReason ? ` (${row.fetchReason})` : ''}`,
      `- Gates: ${gates.includes(false) ? 'fail' : gates.includes(null) ? 'needs review' : 'pass'}`,
      `- Confidence: ${row.scoring_confidence || 'unverified'}; qualification: ${row.qualification_status || 'unverified'}`,
      `- Wired-RFP read: ${row.competitive?.verdict || 'Insufficient evidence'}`,
      ...(row.scoring_reasons || []).map((reason) => `- Evidence note: ${reason}`),
      `- Proposal deadline: ${t.due || 'unknown'}${t.time ? ` ${t.time} ${t.timeZone || '(timezone unknown)'}` : ''}`,
      `- Deadline status: ${t.status}; ${t.note}`,
      `- Deadline source: ${t.source?.file || t.source?.type || 'none'}${t.source?.section ? ` (${t.source.section})` : ''}`,
      `- Days remaining: ${t.days ?? 'unknown'}; assessed ${t.assessmentDate} in ${t.dayCountTimeZone}${t.timezoneFallbackUsed ? ' (reporting timezone fallback)' : ''}`,
      ...(c ? [`- Scores: case study ${c.caseStudy}, agency ${c.agencyTypeScore}, tech ${c.tech}, AI ${c.ai}, deal ${c.deal}, compliance ${c.compliance}, competition ${c.competitive}, timeline ${c.timeline}`] : []),
      '',
    );
  }
  if (needsDocuments.length) {
    mdLines.push(
      '## Needs documents',
      '',
      'No final score: the actual solicitation could not be read. These are not no-bids; preliminary scores come from the HigherGov listing summary and are provisional.',
      '',
    );
    for (const row of needsDocuments) {
      mdLines.push(
        `### ${row.title}`,
        `- Agency: ${row.agency}`,
        `- Prelim: ${row.preliminary_score} (provisional, listing summary only)`,
        '- Full-text: Not scored (needs documents)',
        `- Recommendation: ${row.recommendation}`,
        `- Documents: ${row.fetchStatus}${row.fetchReason ? ` (${row.fetchReason})` : ''}`,
        `- Listing deadline (unverified): ${row.timeline.due || 'unknown'}; days remaining ${row.timeline.days ?? 'unknown'}; assessed ${row.timeline.assessmentDate}`,
        '',
      );
    }
  }
  return { summary, results, markdown: mdLines.join('\n') };
}

// Tests and report consumers can import pure exports without invoking live integrations.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
