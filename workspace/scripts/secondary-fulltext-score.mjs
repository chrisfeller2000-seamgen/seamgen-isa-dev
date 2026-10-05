import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createAssessmentContext } from './rfp-deadline.mjs';
import { finalizeRfpScore, unscoredRfp } from './rfp-scoring-policy.mjs';
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
    .filter((item) => item.score >= 75);
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
  if (!capturedDate) {
    return { status: 'metadata-only', reason: 'Missing captured_date for HigherGov lookup.' };
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
    return { status: 'failed', reason: 'Could not rehydrate opportunity record.' };
  }
  const documentPath = normalize(lookupRecord.document_path || '');
  if (!documentPath) {
    return { status: 'access-blocked', reason: 'Opportunity record did not expose a document_path.' };
  }
  const documentRecords = await listDocumentRecords({ apiKey, documentPath }).catch((error) => ({ __error: error }));
  if (documentRecords.__error) {
    return { status: 'failed', reason: documentRecords.__error?.message || 'Document lookup failed.' };
  }
  if (!Array.isArray(documentRecords) || !documentRecords.length) {
    // Keep the newer live distinction: an empty list is not proven access denial.
    return { status: 'document-list-empty', reason: 'No document records returned.' };
  }
  const manifest = [];
  for (let i = 0; i < documentRecords.length; i += 1) {
    const row = await saveDocumentRecord({
      apiKey,
      record: documentRecords[i],
      resourcesDir,
      index: i,
    }).catch((error) => ({
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
  const texts = [];
  const documents = [];
  const extractedTextByPath = new Map();
  for (const row of manifest) {
    if (!row.downloaded || !row.local_path) continue;
    const extracted = String(await extractText(row.local_path)).trim();
    row.extracted = Boolean(extracted);
    row.document_status = extracted ? 'downloaded and extracted' : 'downloaded but unsupported';
    if (!extracted) continue;
    Object.assign(row, classifyDocumentRecord({ file_name: row.source_file_name || row.local_file_name, text: extracted }));
    extractedTextByPath.set(row.local_path, extracted);
    // Preserve existing business-category text normalization; deadline evidence keeps lines.
    texts.push(`## ${row.local_file_name || row.source_file_name}\n${normalize(extracted)}`);
    documents.push({ name: row.local_file_name || row.source_file_name, text: extracted });
  }
  return {
    status: 'downloaded',
    resourcesDir,
    manifest,
    documents,
    completeness: evaluateDocumentCompleteness({ manifest, extractedTextByPath }),
    text: texts.join('\n\n').trim(),
  };
}

export function buildScore(candidate, fullText, { documents = [], assessment = createAssessmentContext(), judgment, companySources = [], landscapeSources = [], completeness } = {}) {
  const input = { candidate, documents, assessment, companySources, landscapeSources, completeness, phase: 'full-text' };
  // fullText is retained for caller compatibility, never treated as a document.
  return judgment ? finalizeRfpScore(input, judgment) : unscoredRfp(input, 'No validated AI judgment was supplied.');
}

export async function scoreSecondaryCandidate(candidate, { documents = [], assessment = createAssessmentContext(), completeness, companySources, policies, landscapeSources, judge, workspace } = {}) {
  return scoreRfp({ candidate, documents, assessment, completeness, companySources, policies, landscapeSources, phase: 'full-text' }, { judge, workspace });
}

export function resolveSelectedCandidates(selectedTitles, candidates) {
  const selection = [], reviews = [], seen = new Set();
  for (const item of selectedTitles.filter(item => item.score >= 75)) {
    const exact = candidates.filter(candidate => [candidate.frontmatter.title, candidate.frontmatter.slug,
      `${candidate.frontmatter.title} — ${candidate.frontmatter.agency_name}`,
      `${candidate.frontmatter.title} - ${candidate.frontmatter.agency_name}`]
      .some(value => normalizeKey(value || '') === normalizeKey(item.title)));
    if (exact.length !== 1) { reviews.push({ item, reason: exact.length ? 'Ambiguous candidate match; manual review required.' : 'No exact candidate match; manual review required.' }); continue; }
    const candidate = exact[0], key = candidate.frontmatter.slug || candidate.dir;
    if (!seen.has(key)) { selection.push({ item, candidate }); seen.add(key); }
  }
  return { selection, reviews };
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
  const results = reviews.map(({ item, reason }) => {
    const score = unscoredRfp({ candidate: { frontmatter: {}, body: '' }, assessment: run.assessment }, reason);
    return { title: item.title, agency: 'unknown', slug: '', preliminary_score: item.score,
      fulltext_score: null, ...score, recommendation: 'Needs review', competitive: score.cp,
      fetchStatus: 'not-attempted', fetchReason: reason, resourcesDir: '' };
  });
  for (const { item, candidate } of selection) {
    process.stderr.write(`[secondary-fulltext] scoring ${candidate.frontmatter.title || item.title}\n`);
    try {
      const fetch = await fetchAndExtract(candidate, config, apiKey);
      const score = await scoreSecondaryCandidate(candidate, { documents: fetch.documents || [], completeness: fetch.completeness || { complete: false },
        assessment: run.assessment, workspace: run.workspace });
      process.stderr.write(`[secondary-fulltext] -> ${candidate.frontmatter.title || item.title}: fetch=${fetch.status}, full=${score.total}, rec=${score.recommendation}\n`);
      results.push({
        title: candidate.frontmatter.title || item.title,
        agency: candidate.frontmatter.agency_name || 'unknown',
        slug: candidate.frontmatter.slug || '',
        preliminary_score: Number(candidate.frontmatter.preliminary_score || item.score || 0),
        fulltext_score: score.total,
        recommendation: score.recommendation,
        qualification_status: score.qualification_status,
        scoring_confidence: score.scoring_confidence,
        document_status: score.document_status || fetch.status,
        scoring_reasons: score.reasons,
        gateReasons: score.gateReasons || [],
        judgments: score.judgments || null,
        flags: score.flags || [],
        conditional: score.conditional || null,
        scoring_error: score.scoring_error || null,
        provenance: score.provenance || null,
        gate: score.gate,
        categories: score.categories,
        competitive: score.cp,
        timeline: score.timeline,
        fetchStatus: fetch.status,
        fetchReason: fetch.reason || '',
        resourcesDir: fetch.resourcesDir || '',
      });
    } catch (error) {
      const fetch = { status: 'failed', reason: error?.message || 'unknown' };
      const score = unscoredRfp({ candidate, assessment: run.assessment }, 'Document processing failed; no metadata fallback score.');
      process.stderr.write(`[secondary-fulltext] -> ${candidate.frontmatter.title || item.title}: fetch=failed, full=${score.total}, rec=${score.recommendation}\n`);
      results.push({
        title: candidate.frontmatter.title || item.title,
        agency: candidate.frontmatter.agency_name || 'unknown',
        slug: candidate.frontmatter.slug || '',
        preliminary_score: Number(candidate.frontmatter.preliminary_score || item.score || 0),
        fulltext_score: score.total,
        recommendation: score.recommendation,
        qualification_status: score.qualification_status,
        scoring_confidence: score.scoring_confidence,
        document_status: score.document_status || fetch.status,
        scoring_reasons: score.reasons,
        gateReasons: score.gateReasons || [],
        provenance: score.provenance || null,
        gate: score.gate,
        categories: score.categories,
        competitive: score.cp,
        timeline: score.timeline,
        fetchStatus: fetch.status,
        fetchReason: fetch.reason || '',
        resourcesDir: '',
      });
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
  const results = [...inputResults].sort((a, b) =>
    (Number.isFinite(b.fulltext_score) ? b.fulltext_score : -Infinity) -
    (Number.isFinite(a.fulltext_score) ? a.fulltext_score : -Infinity) || a.title.localeCompare(b.title));
  const summary = {
    runDate: assessment.runDate,
    assessmentTimestamp: assessment.assessmentTimestamp,
    assessmentTimeZone: assessment.reportingTimeZone,
    assessmentOverrideUsed: assessment.overrideUsed,
    total: results.length,
    strongPursue: results.filter((r) => r.recommendation === 'Strong Pursue' && r.scoring_confidence === 'full-text' && r.qualification_status === 'qualified').length,
    needsDocuments: results.filter(r => r.recommendation === 'Needs documents').length,
    needsReview: results.filter(r => r.recommendation === 'Needs review').length,
    conditional: results.filter(r => r.recommendation === 'Conditional — Ask the Agency').length,
    watch: results.filter(r => ['Watch item', 'Not an open bid'].includes(r.recommendation)).length,
    worthALook: results.filter((r) => r.recommendation === 'Worth a look').length,
    noBid: results.filter((r) => r.recommendation === 'No-bid').length,
    deadlineNeedsReview: results.filter((r) => r.recommendation === 'Deadline needs review').length,
    gateFails: results.filter((r) => [r.gate.gate1, r.gate.gate2, r.gate.gate3, r.gate.gate4, r.gate.gate5, r.gate.gate6].some(pass => pass === false)).length,
  };

  const mdLines = [];
  mdLines.push(`# Secondary Full-Text Scoring - ${assessment.runDate}`);
  mdLines.push(``);
  mdLines.push(`- Assessment timezone: ${assessment.reportingTimeZone}; historical date override: ${assessment.overrideUsed ? 'yes' : 'no'}`);
  mdLines.push(`- Selected candidates: ${summary.total}`);
  mdLines.push(`- Strong Pursue: ${summary.strongPursue}`);
  mdLines.push(`- Worth a look: ${summary.worthALook}`);
  mdLines.push(`- No-bid / gate-fail: ${summary.noBid}`);
  mdLines.push(`- Deadline needs review: ${summary.deadlineNeedsReview}`);
  mdLines.push(``);
  for (const row of results) {
    mdLines.push(`### ${row.title}`);
    mdLines.push(`- Agency: ${row.agency}`);
    mdLines.push(`- Prelim: ${row.preliminary_score}`);
    mdLines.push(`- Full-text: ${row.fulltext_score === null ? 'Not finalized' : row.fulltext_score}`);
    mdLines.push(`- Recommendation: ${row.recommendation}`);
    mdLines.push(`- Fetch: ${row.fetchStatus}${row.fetchReason ? ` (${row.fetchReason})` : ''}`);
    const failed = [row.gate.gate1, row.gate.gate2, row.gate.gate3, row.gate.gate4, row.gate.gate5, row.gate.gate6].some(pass => pass === false);
    mdLines.push(`- Gates: ${failed ? 'fail' : [1, 2, 3, 4, 5, 6].some(n => row.gate[`gate${n}`] === null) ? 'needs review' : 'pass'}`);
    mdLines.push(`- Confidence: ${row.scoring_confidence || 'unverified'}; qualification: ${row.qualification_status || 'unverified'}`);
    mdLines.push(`- Wired-RFP read: ${row.competitive?.verdict || 'Insufficient evidence'}`);
    for (const reason of row.scoring_reasons || []) mdLines.push(`- Evidence note: ${reason}`);
    mdLines.push(`- Proposal deadline: ${row.timeline.due || 'unknown'}${row.timeline.time ? ` ${row.timeline.time} ${row.timeline.timeZone || '(timezone unknown)'}` : ''}`);
    mdLines.push(`- Deadline status: ${row.timeline.status}; ${row.timeline.note}`);
    mdLines.push(`- Deadline source: ${row.timeline.source?.file || row.timeline.source?.type || 'none'}${row.timeline.source?.section ? ` (${row.timeline.source.section})` : ''}`);
    mdLines.push(`- Days remaining: ${row.timeline.days ?? 'unknown'}; assessed ${row.timeline.assessmentDate} in ${row.timeline.dayCountTimeZone}${row.timeline.timezoneFallbackUsed ? ' (reporting timezone fallback)' : ''}`);
    mdLines.push(`- Scores: case study ${row.categories.caseStudy}, agency ${row.categories.agencyTypeScore}, tech ${row.categories.tech}, AI ${row.categories.ai}, deal ${row.categories.deal}, compliance ${row.categories.compliance}, competition ${row.categories.competitive}, timeline ${row.categories.timeline}`);
    mdLines.push(``);
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
