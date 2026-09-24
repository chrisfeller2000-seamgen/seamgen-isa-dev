import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

import {
  listDocumentRecords,
  saveDocumentRecord,
} from './highergov-document-flow.mjs';

const WORKSPACE = process.env.WORKSPACE_DIR || '/home/azureuser/.openclaw/workspace';
const REPORT_PATH = process.env.RFP_PRELIM_REPORT_PATH || path.join(WORKSPACE, 'reports', 'new-rfp-qualification', '2026-09-22.md');
const CANDIDATES_ROOT = path.join(WORKSPACE, 'RFP-pipeline', 'candidates');
const CONFIG_PATH = path.join(WORKSPACE, 'tools', 'highergov-config.json');
const RUN_DATE = '2026-09-22';
const API_KEY = process.env.HIGHERGOV_API_KEY || '';
const OUT_BASENAME = process.env.RFP_SECONDARY_OUT_BASENAME || '2026-09-22-secondary-fulltext';
const opportunityCache = new Map();

function normalize(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeKey(value = '') {
  return normalize(value).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ');
}

function stripDashSuffix(value = '') {
  return normalize(value).replace(/\s+[—-]\s+.+$/, '').trim();
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

async function loadCandidates() {
  const entries = await fs.readdir(CANDIDATES_ROOT, { withFileTypes: true });
  const candidates = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const candidatePath = path.join(CANDIDATES_ROOT, entry.name, 'candidate.md');
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

async function loadSelectedTitles() {
  const report = await fs.readFile(REPORT_PATH, 'utf8');
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

function scoreBand(value, bands) {
  for (const band of bands) {
    if (band.test(value)) return band.score;
  }
  return 0;
}

function extractDateFromText(text = '') {
  const patterns = [
    /(?:proposal\s+due\s+date|due\s+date|proposal\s+deadline|deadline|submission\s+due)\D{0,40}(\b\d{1,2}\/\d{1,2}\/\d{2,4}\b)/i,
    /(?:proposal\s+due\s+date|due\s+date|proposal\s+deadline|deadline|submission\s+due)\D{0,40}(\b\d{4}-\d{2}-\d{2}\b)/i,
    /(\b\d{1,2}\/\d{1,2}\/\d{2,4}\b)/,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1];
  }
  return '';
}

function parseDate(value = '') {
  const v = normalize(value);
  if (!v || v.toLowerCase() === 'unknown') return null;
  let m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
  m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) {
    const year = m[3].length === 2 ? `20${m[3]}` : m[3];
    return new Date(`${year}-${String(m[1]).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}T00:00:00Z`);
  }
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function daysUntilDue(dateValue) {
  const due = parseDate(dateValue);
  if (!due) return null;
  const today = new Date(`${RUN_DATE}T00:00:00Z`);
  return Math.ceil((due.getTime() - today.getTime()) / 86400000);
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

function countMatches(text, patterns) {
  let count = 0;
  for (const pattern of patterns) {
    const matches = text.match(pattern);
    if (matches) count += matches.length;
  }
  return count;
}

function detectAgencyType(frontmatter, text) {
  const agency = normalize(`${frontmatter.agency_name || ''} ${frontmatter.agency_type || ''} ${text}`);
  if (/(school|college|university|education|public schools|isd\b)/i.test(agency)) return 'education';
  if (/(water|wastewater|utility|utilities|power|energy|transit|port|airport|infrastructure)/i.test(agency)) return 'utilities';
  if (/(health|hospital|medical|public health|healthcare|trial court|court|medicaid)/i.test(agency)) return 'public-health';
  if (/(city of|county|borough|town of|township|village of|department of|state of|municipal|parish)/i.test(agency)) return 'state-local';
  if (/(department of|department\b|federal|army|navy|air force|marines|va\b|cms\b|fdic\b|fema\b|epa\b|hhs\b|dot\b)/i.test(agency)) return 'federal';
  if (/(inc|corp|corporation|llc|ltd|company|foundation|association|authority)/i.test(agency)) return 'private';
  return 'unknown';
}

function detectCompliance(text) {
  const strong = /(HIPAA|NIST\s*800|FISMA|FITARA|Section\s*508|508\b|GDPR|ADA\b|PCI-DSS|CJIS|FedRAMP)/i;
  const adjacent = /(security\s+standards|privacy\s+requirements|data\s+privacy|accessibility|security\s+controls|state\s+it\s+policy)/i;
  if (strong.test(text)) return 10;
  if (adjacent.test(text)) return 6;
  if (/(compliance|security|privacy)/i.test(text)) return 4;
  return 1;
}

function detectAiAngle(text) {
  const lower = text.toLowerCase();
  if (/(ai-powered|ai driven|artificial intelligence|machine learning|chatbot|agentic|generative ai|large language model|llm|automated assistant|intelligent assistant)/i.test(lower)) return 10;
  if (/(ai|artificial intelligence|machine learning|chatbot|assistant|bot)/i.test(lower)) return 7;
  if (/(analytics|predictive|automation|workflow)/i.test(lower)) return 4;
  return 1;
}

function detectTechAlignment(text) {
  const lower = text.toLowerCase();
  const score = [
    /azure|\.net|react|angular|vue|node\.js|typescript|javascript|sql server|postgresql|mongodb|aws|openai|azure ai|bedrock|salesforce|arcgis|esri|figma/,
  ].some((re) => re.test(lower)) ? 15 : 6;
  if (/(technology agnostic|vendor agnostic|modern web platform|custom developed solution|stack agnostic)/i.test(lower)) return 14;
  if (/(azure|\.net|react|angular|vue|node\.js|aws|openai|salesforce|arcgis|sql server|postgresql|oracle|mongo|mobile app|mobile workforce)/i.test(lower)) return score;
  return 4;
}

function detectDealSize(frontmatter, text) {
  const low = Number.parseFloat(String(frontmatter.val_est_low || '').replace(/[^0-9.]/g, '')) || 0;
  const high = Number.parseFloat(String(frontmatter.val_est_high || '').replace(/[^0-9.]/g, '')) || 0;
  const candidateRange = high || low;
  const t = text.toLowerCase();
  if (candidateRange >= 250000 && candidateRange <= 3000000) return 10;
  if ((candidateRange >= 100000 && candidateRange < 250000) || (candidateRange > 3000000 && candidateRange <= 5000000)) return 8;
  if (candidateRange > 5000000 && candidateRange <= 10000000) return 5;
  if (candidateRange > 10000000) return 2;
  const budgetMatch = t.match(/\$ ?([\d,]+(?:\.\d+)?)\s*(m|million|k|thousand)?/i);
  if (budgetMatch) {
    const num = Number.parseFloat(budgetMatch[1].replace(/,/g, ''));
    const unit = (budgetMatch[2] || '').toLowerCase();
    const dollars = unit.startsWith('m') || unit === 'million' ? num * 1_000_000 : unit.startsWith('k') || unit === 'thousand' ? num * 1_000 : num;
    if (dollars >= 250000 && dollars <= 3000000) return 10;
    if ((dollars >= 100000 && dollars < 250000) || (dollars > 3000000 && dollars <= 5000000)) return 8;
    if (dollars > 5000000 && dollars <= 10000000) return 5;
    if (dollars > 10000000) return 2;
  }
  return 7;
}

function detectCaseStudyMatch(frontmatter, text) {
  const combined = `${frontmatter.title || ''} ${text}`.toLowerCase();
  const rules = [
    { re: /(patient portal|healthcare|medical|claims|credential|clinical|medicaid|hospital|behavioral health)/i, score: 20 },
    { re: /(lms|learning management|student|faculty|education portal|school portal|course management)/i, score: 20 },
    { re: /(data warehouse|business intelligence|bi|analytics platform|data platform|reporting solution|warehouse)/i, score: 20 },
    { re: /(gis|arcgis|mapping|geospatial|asset management|stormwater|water utility|utility billing|billing system|transit signal|public works)/i, score: 19 },
    { re: /(crm|customer portal|community engagement|contact center|records management|case management|tracking system)/i, score: 16 },
    { re: /(ai assistant|chatbot|answer engine|genai|machine learning|automation)/i, score: 17 },
    { re: /(support and maintenance|renewal|subscription renewal|maintenance services|helpdesk)/i, score: 10 },
  ];
  for (const rule of rules) {
    if (rule.re.test(combined)) return rule.score;
  }
  return 7;
}

function detectCompetitivePosition(text) {
  const lower = text.toLowerCase();
  const signals = [];
  let score = 8;
  if (/(incumbent|current vendor|existing vendor|replace the current|current system|existing system)/i.test(lower)) {
    score -= 2;
    signals.push('incumbent or existing system mentioned');
  }
  if (/(established|fully operational|already operating|live demonstration|live demos?|existing installs?|in production)/i.test(lower)) {
    score -= 3;
    signals.push('product posture / live-demo language');
  }
  if (/(local vendor preference|locale points|in-state|in county|must be located|availability to and familiarity with the project locale)/i.test(lower)) {
    score -= 2;
    signals.push('locale advantage requirement');
  }
  if (/(separate cost proposal|per module|per option|multiple hosting models|mandatory questionnaire|security questionnaire|demo required|presentation required)/i.test(lower)) {
    score -= 2;
    signals.push('proposal-effort multiplier');
  }
  if (/(arcgis|salesforce|tyler|accela|opengov|granicus|cisco|microsoft|oracle|open text|opentext|veeam|crowdstrike|paymentus|ionwave|bidnet|docusign|adobe sign)/i.test(lower)) {
    score -= 1;
    signals.push('platform/vender posture');
  }
  score = Math.max(0, Math.min(10, score));
  let verdict = 'Open';
  if (score <= 2 || /sole source|single source/i.test(lower)) verdict = 'Wired';
  else if (score <= 5 || signals.length >= 2) verdict = 'Leaning wired';
  else if (/insufficient evidence/i.test(lower)) verdict = 'Insufficient evidence';
  return { score, verdict, signals };
}

function detectTimeline(frontmatter, text) {
  const due = extractDateFromText(text) || frontmatter.due_date || '';
  const days = daysUntilDue(due);
  if (days == null) return { score: 0, due, days, note: 'unknown' };
  if (days >= 30) return { score: 5, due, days };
  if (days >= 21) return { score: 4, due, days };
  if (days >= 16) return { score: 3, due, days };
  if (days >= 11) return { score: 2, due, days };
  if (days >= 10) return { score: 0, due, days };
  return { score: 0, due, days };
}

function detectGates(frontmatter, text) {
  const gate1 = detectTimeline(frontmatter, text);
  const customPass = /(custom build|custom-developed|custom developed|build|develop|design|modernization|redesign|implementation|implement|support and maintain|support|maintenance|enhancement|expand|rebuild|upgrade)/i.test(text);
  const customFail = /(cots|off the shelf|off-the-shelf|saaS|saas|license renewal|subscription renewal|buy and implement|existing installs?|live demonstration|already operational|commercial product)/i.test(text);
  const gate2 = customPass && !customFail;
  const gate3 = !/(hardware|construction|equipment|physical goods|furniture|vehicle|replacement parts)/i.test(text);
  const gate4 = !/(portal registration takes|unable to submit|account required and not available|vendor registration closed|cannot submit|deadline has passed)/i.test(text);
  const gate5 = detectDealSize(frontmatter, text) > 0;
  const refs = (text.match(/government references?/gi) || []).length;
  const refsThreePlus = /3\+|three\s+or\s+more|at least three|minimum of three|three government/i.test(text);
  const gate6 = !refsThreePlus;
  return {
    gate1: gate1.days == null ? true : gate1.days >= 10,
    gate2,
    gate3,
    gate4,
    gate5,
    gate6,
    gate1Days: gate1.days,
    gate1Due: gate1.due,
    refs,
    refsThreePlus,
    gate2Reason: customPass && !customFail ? 'Custom build / modernization language present.' : 'Product or COTS language present.',
  };
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
  for (const row of manifest) {
    if (!row.downloaded || !row.local_path) continue;
    const extracted = normalize(await extractText(row.local_path));
    if (!extracted) continue;
    texts.push(`## ${row.local_file_name || row.source_file_name}\n${extracted}`);
  }
  return {
    status: 'downloaded',
    resourcesDir,
    manifest,
    text: texts.join('\n\n').trim(),
  };
}

function buildScore(candidate, fullText) {
  const frontmatter = candidate.frontmatter;
  const text = `${candidate.body}\n${fullText}`.trim();
  const gate = detectGates(frontmatter, text);
  const caseStudy = detectCaseStudyMatch(frontmatter, text);
  const agencyTypeKey = detectAgencyType(frontmatter, text);
  const agencyTypeScore =
    agencyTypeKey === 'state-local' ? 15 :
    agencyTypeKey === 'education' ? 15 :
    agencyTypeKey === 'utilities' ? 15 :
    agencyTypeKey === 'public-health' ? 15 :
    agencyTypeKey === 'federal' ? 12 :
    agencyTypeKey === 'private' ? 7 : 4;
  const tech = detectTechAlignment(text);
  const ai = detectAiAngle(text);
  const deal = detectDealSize(frontmatter, text);
  const compliance = detectCompliance(text);
  const cp = detectCompetitivePosition(text);
  const timeline = detectTimeline(frontmatter, text);
  const total = caseStudy + agencyTypeScore + tech + ai + deal + compliance + cp.score + timeline.score;
  const recommendation =
    !gate.gate1 || !gate.gate2 || !gate.gate3 || !gate.gate4 || !gate.gate5 || !gate.gate6 ? 'No-bid' :
    total >= 75 ? 'Strong Pursue' :
    total >= 50 ? 'Worth a look' : 'No-bid';
  return {
    gate,
    categories: {
      caseStudy,
      agencyTypeScore,
      tech,
      ai,
      deal,
      compliance,
      competitive: cp.score,
      timeline: timeline.score,
    },
    cp,
    timeline,
    total,
    recommendation,
  };
}

async function main() {
  if (!API_KEY) {
    throw new Error('HIGHERGOV_API_KEY is required.');
  }
  const config = JSON.parse(await fs.readFile(CONFIG_PATH, 'utf8'));
  const selectedTitles = await loadSelectedTitles();
  const candidates = await loadCandidates();
  const index = new Map();
  for (const candidate of candidates) {
    const title = normalize(candidate.frontmatter.title || '');
    const core = normalize(stripDashSuffix(candidate.frontmatter.title || ''));
    index.set(normalizeKey(title), candidate);
    index.set(normalizeKey(core), candidate);
    index.set(normalizeKey(candidate.frontmatter.slug || ''), candidate);
  }

  const selection = [];
  const seen = new Set();
  for (const item of selectedTitles) {
    const core = stripDashSuffix(item.title);
    const candidate =
      index.get(normalizeKey(item.title)) ||
      index.get(normalizeKey(core)) ||
      candidates.find((c) => normalizeKey(c.frontmatter.title || '').includes(normalizeKey(core)) || normalizeKey(item.title).includes(normalizeKey(c.frontmatter.title || '')));
    if (candidate && !seen.has(candidate.frontmatter.slug || candidate.dir)) {
      selection.push({ item, candidate });
      seen.add(candidate.frontmatter.slug || candidate.dir);
    }
  }

  // Ensure the six named RFPs are present even if the report parser misses one.
  const requiredNames = [
    'AI Technical Specification Assistant',
    'Data Warehouse and Business Intelligence Services',
    'Customer Portal & AMI Technology',
    'Website & Customer Service Logging System',
    'Investigations Tracking System',
    'Artificial Intelligence and Information Technology Technical Support and Advising Services',
  ];
  for (const name of requiredNames) {
    const candidate = candidates.find((c) => normalizeKey(c.frontmatter.title || '').includes(normalizeKey(name)));
    if (candidate && !seen.has(candidate.frontmatter.slug || candidate.dir)) {
      selection.push({ item: { title: candidate.frontmatter.title || name, score: Number(candidate.frontmatter.preliminary_score || 0) }, candidate });
      seen.add(candidate.frontmatter.slug || candidate.dir);
    }
  }

  const results = [];
  for (const { item, candidate } of selection) {
    process.stderr.write(`[secondary-fulltext] scoring ${candidate.frontmatter.title || item.title}\n`);
    try {
      const fetch = await fetchAndExtract(candidate, config, API_KEY);
      const scoringSource = fetch.status === 'downloaded' ? fetch.text : candidate.body;
      const score = buildScore(candidate, scoringSource);
      process.stderr.write(`[secondary-fulltext] -> ${candidate.frontmatter.title || item.title}: fetch=${fetch.status}, full=${score.total}, rec=${score.recommendation}\n`);
      results.push({
        title: candidate.frontmatter.title || item.title,
        agency: candidate.frontmatter.agency_name || 'unknown',
        slug: candidate.frontmatter.slug || '',
        preliminary_score: Number(candidate.frontmatter.preliminary_score || item.score || 0),
        fulltext_score: score.total,
        recommendation: score.recommendation,
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
      const score = buildScore(candidate, candidate.body);
      process.stderr.write(`[secondary-fulltext] -> ${candidate.frontmatter.title || item.title}: fetch=failed, full=${score.total}, rec=${score.recommendation}\n`);
      results.push({
        title: candidate.frontmatter.title || item.title,
        agency: candidate.frontmatter.agency_name || 'unknown',
        slug: candidate.frontmatter.slug || '',
        preliminary_score: Number(candidate.frontmatter.preliminary_score || item.score || 0),
        fulltext_score: score.total,
        recommendation: score.recommendation,
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

  results.sort((a, b) => b.fulltext_score - a.fulltext_score || a.title.localeCompare(b.title));
  const summary = {
    runDate: RUN_DATE,
    total: results.length,
    strongPursue: results.filter((r) => r.recommendation === 'Strong Pursue').length,
    worthALook: results.filter((r) => r.recommendation === 'Worth a look').length,
    noBid: results.filter((r) => r.recommendation === 'No-bid').length,
    gateFails: results.filter((r) => !r.gate.gate1 || !r.gate.gate2 || !r.gate.gate3 || !r.gate.gate4 || !r.gate.gate5 || !r.gate.gate6).length,
  };

  const outPath = path.join(WORKSPACE, 'reports', 'new-rfp-qualification', `${OUT_BASENAME}.json`);
  await fs.writeFile(outPath, JSON.stringify({ summary, results }, null, 2));

  const mdLines = [];
  mdLines.push(`# Secondary Full-Text Scoring - 2026-09-22`);
  mdLines.push(``);
  mdLines.push(`- Selected candidates: ${summary.total}`);
  mdLines.push(`- Strong Pursue: ${summary.strongPursue}`);
  mdLines.push(`- Worth a look: ${summary.worthALook}`);
  mdLines.push(`- No-bid / gate-fail: ${summary.noBid}`);
  mdLines.push(``);
  for (const row of results) {
    mdLines.push(`### ${row.title}`);
    mdLines.push(`- Agency: ${row.agency}`);
    mdLines.push(`- Prelim: ${row.preliminary_score}`);
    mdLines.push(`- Full-text: ${row.fulltext_score}`);
    mdLines.push(`- Recommendation: ${row.recommendation}`);
    mdLines.push(`- Fetch: ${row.fetchStatus}${row.fetchReason ? ` (${row.fetchReason})` : ''}`);
    mdLines.push(`- Gates: ${row.gate.gate1 && row.gate.gate2 && row.gate.gate3 && row.gate.gate4 && row.gate.gate5 && row.gate.gate6 ? 'pass' : 'fail'}`);
    mdLines.push(`- Scores: case study ${row.categories.caseStudy}, agency ${row.categories.agencyTypeScore}, tech ${row.categories.tech}, AI ${row.categories.ai}, deal ${row.categories.deal}, compliance ${row.categories.compliance}, competition ${row.categories.competitive}, timeline ${row.categories.timeline}`);
    mdLines.push(``);
  }
  await fs.writeFile(path.join(WORKSPACE, 'reports', 'new-rfp-qualification', `${OUT_BASENAME}.md`), mdLines.join('\n'));

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
