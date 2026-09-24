import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {
  ensureCandidateResourcesDir,
  evaluateDocumentCompleteness,
  listDocumentRecords,
  lookupOpportunityRecord,
  saveDocumentRecord,
  writeDocumentManifestJson,
  writeDocumentManifestMarkdown,
} from './highergov-document-flow.mjs';

const WORKSPACE = process.env.WORKSPACE_DIR || '/home/azureuser/.openclaw/workspace';
// This job implements the rfp-flow workflow: portal intake, qualification, document handling, and digest drafting.
const REPORT_DIR = path.join(WORKSPACE, 'reports', 'new-rfp-qualification');
const PIPELINE_DIR = path.join(WORKSPACE, 'RFP-pipeline');
const PORTAL_CANDIDATES_DIR = path.join(PIPELINE_DIR, 'candidates');
const HIGHERGOV_CONFIG_PATH = path.join(WORKSPACE, 'tools', 'highergov-config.json');
const HIGHERGOV_STATE_PATH = path.join(PIPELINE_DIR, 'state.json');
const HIGHERGOV_SEEN_PATH = path.join(PIPELINE_DIR, 'seen.csv');
const FAVORABLE_RFP_ROOT_FOLDER_ID = '1FgeVVURDnS-JyQTyapa7pCl3BN4_PmaW';
const REPORT_FROM = 'isa@seamgen.com';
const REPORT_TO = process.env.REPORT_TO || 'mariannefaro@seamgen.com';
const TELEGRAM_TARGET = process.env.TELEGRAM_TARGET || '-1003890997073';
const NO_TELEGRAM = ['1', 'true', 'yes'].includes(String(process.env.NO_TELEGRAM || '').toLowerCase());
const DOCUMENT_FETCH_ENABLED = ['1', 'true', 'yes', 'on'].includes(String(process.env.RFP_DOCUMENT_FETCH_ENABLED || '').toLowerCase());
const FULL_QUALIFY_REQUIRE_DOCS = !['0', 'false', 'no'].includes(String(process.env.RFP_FULL_QUALIFY_REQUIRE_DOCS || 'true').toLowerCase());
const FULL_QUALIFY_MIN_DAYS = Number.parseInt(process.env.RFP_FULL_QUALIFY_MIN_DAYS || '10', 10) || 10;
const FULL_QUALIFY_MIN_VALUE = Number.parseInt(process.env.RFP_FULL_QUALIFY_MIN_VALUE || '100000', 10) || 100000;
const FULL_QUALIFY_THRESHOLD = Number.parseInt(process.env.RFP_FULL_QUALIFY_THRESHOLD || '75', 10) || 75;
const TEST_MODE = ['1', 'true', 'yes', 'on'].includes(String(process.env.RFP_WEEKLY_TEST_MODE || '').toLowerCase()) || process.argv.slice(2).includes('--test-mode');
const HUBSPOT_CREDS = '/home/azureuser/.openclaw/credentials/hubspot-mcp.json';
const HUBSPOT_URL = 'https://mcp.hubspot.com';
const RFP_PIPELINE_ID = '2487569084';
const TEST_CANDIDATE_SLUG = normalizeText(process.env.RFP_TEST_CANDIDATE_SLUG || '');

function normalizeText(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function weekNumber(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return String(Math.ceil(((d - yearStart) / 86400000 + 1) / 7)).padStart(2, '0');
}

function isoDate(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function summarizeCount(count, label) {
  return `${count} ${label}${count === 1 ? '' : 's'}`;
}

function buildTelegramSummary(runDate, intake, qualifiedCount, manualReviewCount = 0) {
  const scanned = intake?.fetched || 0;
  const days = (intake?.daysFetched || []).length || 0;
  const passed = intake?.pass || 0;
  const filteredOut = Math.max(scanned - passed, 0);
  return [
    `Weekly RFP job ${runDate}: ${summarizeCount(scanned, 'record')} scanned across ${summarizeCount(days, 'day')}; ${summarizeCount(passed, 'candidate')} passed intake; ${summarizeCount(filteredOut, 'record')} filtered out.`,
    `${summarizeCount(qualifiedCount, 'RFP')} qualified for the digest.`,
    `${summarizeCount(manualReviewCount, 'candidate')} sent to manual review.`,
    `Mail sent to ${REPORT_TO}.`,
  ].join(' ');
}

async function withTimeout(promise, timeoutMs, label = 'operation') {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timeoutId);
  }
}

const CLI_ARGS = process.argv.slice(2);

function getCliOption(name) {
  const index = CLI_ARGS.findIndex((arg) => arg === name);
  if (index >= 0 && index + 1 < CLI_ARGS.length) {
    return CLI_ARGS[index + 1];
  }
  const withEquals = CLI_ARGS.find((arg) => arg.startsWith(`${name}=`));
  if (withEquals) {
    return withEquals.slice(name.length + 1);
  }
  return '';
}

function getTestCandidateSlug() {
  return normalizeText(process.env.RFP_TEST_CANDIDATE_SLUG || getCliOption('--candidate-slug') || getCliOption('--candidate') || 'investigations-tracking-system');
}

function getTestCandidateVersionKey() {
  return normalizeText(process.env.RFP_TEST_VERSION_KEY || getCliOption('--candidate-version-key'));
}

function escapeHtml(text = '') {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function cleanName(value = '') {
  return normalizeText(String(value || '').replace(/\.[^.]+$/, ''));
}

function cleanIssuerName(value = '') {
  return normalizeText(value)
    .replace(/\b(the|a|an)\b\s+/gi, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[“”"']+/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '')
    .trim();
}

function sanitizeDriveName(value = '') {
  return normalizeText(value)
    .replace(/[\/\\:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function slugifyText(value = '') {
  const slug = normalizeText(String(value || '').toLowerCase())
    .replace(/&/g, ' and ')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || 'untitled';
}

function extractUrl(value = '') {
  const match = String(value || '').match(/https?:\/\/[^\s<>"')]+/i);
  return match ? match[0].replace(/[.,;]+$/, '') : '';
}

function normalizeSearchText(value = '') {
  return normalizeText(String(value || '').toLowerCase())
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function removeGenericRfpWords(value = '') {
  return normalizeSearchText(value)
    .split(' ')
    .filter((word) => word && !['rfp', 'request', 'for', 'proposal', 'proposals', 'solicitation', 'document', 'addendum', 'rfq', 'bid', 'invitation', 'to', 'the', 'and', 'of', 'services', 'service', 'powered', 'assistant', 'solution', 'platform', 'system', 'tool', 'tools', 'program', 'initiative'].includes(word))
    .join(' ')
    .trim();
}

function normalizeRfpCore(value = '') {
  return normalizeSearchText(value)
    .split(' ')
    .filter((word) => word && !['rfp', 'request', 'for', 'proposal', 'proposals', 'solicitation', 'document', 'addendum', 'rfq', 'bid', 'invitation', 'to', 'the', 'and', 'of', 'services', 'service', 'powered', 'assistant', 'solution', 'platform', 'system', 'tool', 'tools', 'program', 'initiative', 'project', 'implementation'].includes(word))
    .join(' ')
    .trim();
}

function buildRfpKey(title = '', issuer = '') {
  const cleanedIssuer = normalizeSearchText(issuer);
  const cleanedTitle = normalizeRfpCore(title) || removeGenericRfpWords(title) || normalizeSearchText(title);
  return normalizeSearchText([cleanedIssuer, cleanedTitle].filter(Boolean).join(' '));
}

function tokenOverlapScore(left = '', right = '') {
  const leftTokens = new Set(normalizeSearchText(left).split(' ').filter(Boolean));
  const rightTokens = new Set(normalizeSearchText(right).split(' ').filter(Boolean));
  if (!leftTokens.size || !rightTokens.size) return 0;
  let overlap = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) overlap += 1;
  }
  return overlap / Math.max(leftTokens.size, rightTokens.size);
}

function isPrimaryRfpFile(name = '') {
  const text = normalizeText(name).toLowerCase();
  if (!text) return false;
  if (/\b(attachment|appendix|attendance|q&a|questions and answers|cost proposal|presentation|attendance list|form)\b/i.test(text)) {
    return false;
  }
  return /\brfp\b|request for proposal|request for proposals|invitation to proposal|rfq|solicitation|bid invitation/i.test(text);
}

function formatIsoDate(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function parseIsoDate(value = '') {
  const text = normalizeText(value);
  if (!text) return '';
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return formatIsoDate(parsed);
  const match = text.match(/\b\d{4}-\d{2}-\d{2}\b/);
  return match ? match[0] : '';
}

function scoreBand(score) {
  if (score >= 95) return 'Exceptional fit';
  if (score >= 90) return 'Very strong fit';
  if (score >= 80) return 'Strong fit';
  return 'Qualified fit';
}

function reasonToWhyFit(reason) {
  const map = {
    'Accessibility / WCAG': 'accessibility/WCAG support',
    'Web / CMS / mobile delivery': 'web, CMS, intranet, or mobile delivery',
    'Integration / modern stack': 'integration and modern stack capability',
    'AI / automation / data platform': 'AI, automation, or data platform capability',
    'Support / maintenance / hosting': 'hosting, support, or maintenance capability',
    'Public-sector buyer': 'a public-sector procurement context',
    'Delivery structure': 'a phased delivery structure',
  };
  return map[reason] || reason.toLowerCase();
}

function clipText(value = '', limit = 180) {
  const text = normalizeText(value);
  if (!text) return '';
  if (text.length <= limit) return text;
  return `${text.slice(0, limit).trimEnd()}…`;
}

function buildWhyItFitsNarrative({ title = '', issuer = '', summary = '', reasons = [], landscapeSummary = '', capabilitySummary = '' } = {}) {
  const parts = [...new Set(reasons)].map((reason) => reasonToWhyFit(reason)).filter(Boolean);
  const coreAsk = clipText(summary, 140);
  const fitBits = [];
  if (parts.length) {
    fitBits.push(`Seamgen matches the ask with ${parts.slice(0, 2).join(' and ')}`);
  }
  if (coreAsk) {
    fitBits.push(`the RFP specifically asks for ${coreAsk}`);
  }
  const landscapeText = clipText(landscapeSummary || '', 90);
  const capabilityText = clipText(capabilitySummary || '', 90);
  if (landscapeText) {
    fitBits.push(landscapeText.replace(/^Solution landscape points to\s+/i, 'the landscape points to '));
  }
  if (capabilityText) {
    fitBits.push(capabilityText.replace(/^Capability verification confirms\s+/i, 'our delivery fit shows '));
  }
  const lead = issuer
    ? `For ${title}${issuer ? ` — ${issuer}` : ''},`
    : `For ${title},`;
  if (!fitBits.length) return `${lead} Seamgen looks like a solid custom-build fit.`;
  if (fitBits.length === 1) return `${lead} ${fitBits[0]}.`;
  return `${lead} ${fitBits[0]}; ${fitBits.slice(1).join('; ')}.`;
}

function serializeFrontmatterValue(value) {
  if (value === null || value === undefined || value === '') return 'unknown';
  if (Array.isArray(value)) {
    return `[${value.map((item) => `"${String(item).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(', ')}]`;
  }
  if (typeof value === 'object') {
    return `"${JSON.stringify(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

async function updateCandidateMarkdownAtomic(candidatePath, updater) {
  const raw = await fs.readFile(candidatePath, 'utf8');
  const parsed = parseFrontmatterMarkdown(raw);
  const frontmatter = { ...parsed.frontmatter };
  const body = parsed.body || '';
  await updater(frontmatter, body);

  const frontmatterLines = ['---'];
  for (const [key, value] of Object.entries(frontmatter)) {
    frontmatterLines.push(`${key}: ${serializeFrontmatterValue(value)}`);
  }
  frontmatterLines.push('---');
  frontmatterLines.push('');
  const nextContent = `${frontmatterLines.join('\n')}${body ? `${body.replace(/^\n+/, '')}` : ''}`;
  const tempPath = `${candidatePath}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tempPath, nextContent, 'utf8');
  await fs.rename(tempPath, candidatePath);
}

async function persistCandidateState(candidatePath, updates) {
  await updateCandidateMarkdownAtomic(candidatePath, async (frontmatter) => {
    Object.assign(frontmatter, updates);
  });
}

function buildMetadataText(candidate) {
  const frontmatter = candidate?.frontmatter || {};
  const body = candidate?.body || '';
  return [
    frontmatter.ai_summary || '',
    frontmatter.description_text || '',
    body || '',
  ].filter(Boolean).join('\n\n');
}

function extractDeadlinesFromMetadata(candidate, metadataText, runDate) {
  const frontmatter = candidate?.frontmatter || {};
  const deadlines = extractDeadlines(metadataText, runDate).slice(0, 4);
  if (!deadlines.length && frontmatter.due_date && normalizeText(frontmatter.due_date).toLowerCase() !== 'unknown') {
    deadlines.push({ label: 'Proposal due', date: normalizeText(frontmatter.due_date) });
  }
  return deadlines;
}

function scoreCandidateFromText({ candidate, text, runDate }) {
  const title = cleanName(candidate?.title || candidate?.slug || '');
  const issuer = cleanName(candidate?.issuer || '');
  const deadlines = extractDeadlinesFromMetadata(candidate, text, runDate);
  const base = analyzeFit(text, title, deadlines, runDate);
  const gateCheck = evaluateQualificationGates(text, title, issuer, deadlines, candidate?.frontmatter?.val_est_low || '', runDate);
  const landscape = assessSolutionLandscape(text, title, issuer, deadlines);
  const capability = verifyCapabilities(text, title, base.reasons);
  let score = base.score + landscape.score + capability.score;
  const augmentedBlockers = [...base.blockers];
  if (landscape.hardMismatch) {
    augmentedBlockers.push({ category: 'Solution landscape', detail: 'The RFP appears to expect a product or delivery model that does not fit a custom-build pursuit.' });
    score -= 15;
  }
  if (capability.hardMismatch) {
    augmentedBlockers.push({ category: 'Capability verification', detail: 'The brief suggests a hard mismatch with Seamgen\'s custom delivery model.' });
    score -= 15;
  }
  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    reasons: base.reasons,
    blockers: augmentedBlockers,
    gateCheck,
    landscape,
    capability,
    deadlines,
  };
}

function buildQualificationNarrative(score, reasons = []) {
  const band = scoreBand(score);
  const reasonText = [...new Set(reasons)].length ? `Signals: ${[...new Set(reasons)].join(', ')}.` : 'Signals are general but still supportive.';
  return `${band}. ${reasonText}`;
}

function deadlineLabelFromText(text = '') {
  const lower = normalizeText(text).toLowerCase();
  if (/nda/.test(lower)) return 'NDA deadline';
  if (/questions?|clarification|inquiry/.test(lower)) return 'Questions due';
  if (/proposal submission|submit proposals|submittal|response due|submitted by|due date|proposal due/.test(lower)) return 'Proposal due';
  if (/bid opening|opening date/.test(lower)) return 'Bid opening';
  if (/offer shall be valid|valid for/.test(lower)) return 'Offer validity';
  if (/deadline/.test(lower)) return 'Deadline';
  return 'Deadline';
}

function run(cmd, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd: WORKSPACE,
      env: { ...process.env, ...(options.env || {}) },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let timeoutHandle = null;

    if (Number.isFinite(options.timeoutMs) && options.timeoutMs > 0) {
      timeoutHandle = setTimeout(() => {
        try {
          child.kill('SIGTERM');
        } catch {}
        setTimeout(() => {
          try {
            child.kill('SIGKILL');
          } catch {}
        }, 5000);
      }, options.timeoutMs);
    }

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });
    child.on('close', (exitCode) => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      resolve({ stdout, stderr, exitCode: typeof exitCode === 'number' ? exitCode : 1 });
    });
    child.stdin.end(options.input ?? '');
  });
}

async function runJson(cmd, args, options = {}) {
  const result = await run(cmd, args, options);
  if (result.exitCode !== 0) {
    throw new Error((result.stderr || result.stdout || `${cmd} failed`).trim());
  }
  return result.stdout.trim();
}

async function driveSearch(query, max = 50) {
  const output = await runJson('gog', ['-a', 'isa@seamgen.com', 'drive', 'search', query, '--max', String(max), '--plain'], { timeoutMs: 120000 });
  const lines = output.split('\n').map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return [];

  const rows = [];
  const headers = lines[0].split('\t');
  for (const line of lines.slice(1)) {
    const values = line.split('\t');
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });
    rows.push(row);
  }
  return rows;
}

async function hubspotSearchTitle(title) {
  const payload = {
    objectType: 'deals',
    query: title,
    properties: ['dealname', 'pipeline', 'dealstage'],
    limit: 5,
  };
  const output = await runJson('mcpjam', [
    'tools',
    'call',
    '--url',
    HUBSPOT_URL,
    '--credentials-file',
    HUBSPOT_CREDS,
    '--tool-name',
    'search_crm_objects',
    '--tool-args',
    JSON.stringify(payload),
    '--format',
    'json',
  ], { timeoutMs: 60000 });

  const parsed = JSON.parse(output || '{}');
  const text = parsed?.content?.[0]?.text || '';
  const result = text ? JSON.parse(text) : { results: [] };
  return Array.isArray(result.results) ? result.results : [];
}

function hubspotDealNameText(deal = {}) {
  return normalizeSearchText(deal?.properties?.dealname || deal?.dealname || '');
}

function scoreDuplicateMatch(query = '', deal = {}) {
  const normalizedQuery = normalizeSearchText(query);
  const normalizedDeal = hubspotDealNameText(deal);
  if (!normalizedQuery || !normalizedDeal) return 0;
  if (normalizedQuery === normalizedDeal) return 1;
  if (normalizedQuery.includes(normalizedDeal) || normalizedDeal.includes(normalizedQuery)) return 0.95;

  const queryTokens = normalizedQuery.split(' ').filter(Boolean);
  const dealTokens = new Set(normalizedDeal.split(' ').filter(Boolean));
  if (!queryTokens.length || !dealTokens.size) return 0;

  let overlap = 0;
  for (const token of queryTokens) {
    if (dealTokens.has(token)) overlap += 1;
  }
  return overlap / Math.max(queryTokens.length, dealTokens.size);
}

function buildDuplicateQueries(title = '', summary = '') {
  const queries = new Set();
  const normalizedTitle = normalizeSearchText(title);
  const shortenedTitle = removeGenericRfpWords(title);
  const normalizedSummary = normalizeText(summary);
  const summarySentence = (normalizedSummary.match(/[^.!?]+[.!?]+/g) || [normalizedSummary])[0] || '';
  const summaryLead = normalizedSummary.split(/\s+/).slice(0, 18).join(' ');

  for (const value of [title, shortenedTitle, summaryLead, summarySentence]) {
    const text = normalizeText(value);
    if (text && text.length >= 6) queries.add(text);
  }

  return [...queries].filter((value) => removeGenericRfpWords(value).length >= 6 || normalizeSearchText(value).split(' ').length >= 3);
}

function scoreCandidateAgainstDeal(candidateText = '', dealNameText = '') {
  const normalizedCandidate = normalizeSearchText(candidateText);
  const normalizedDeal = normalizeSearchText(dealNameText);
  if (!normalizedCandidate || !normalizedDeal) return 0;
  if (normalizedCandidate === normalizedDeal) return 1;
  if (normalizedCandidate.includes(normalizedDeal) || normalizedDeal.includes(normalizedCandidate)) return 0.95;

  const candidateTokens = normalizedCandidate.split(' ').filter(Boolean);
  const dealTokens = new Set(normalizedDeal.split(' ').filter(Boolean));
  if (!candidateTokens.length || !dealTokens.size) return 0;

  let overlap = 0;
  for (const token of candidateTokens) {
    if (dealTokens.has(token)) overlap += 1;
  }
  return overlap / Math.max(candidateTokens.length, dealTokens.size);
}

async function loadHubSpotRfpIndex() {
  if (loadHubSpotRfpIndex.cache) return loadHubSpotRfpIndex.cache;
  const names = new Set();

  try {
    const response = await runJson(
      'mcpjam',
      [
        'tools',
        'call',
        '--url',
        HUBSPOT_URL,
        '--credentials-file',
        HUBSPOT_CREDS,
        '--tool-name',
        'query_crm_data',
        '--tool-args',
        JSON.stringify({
          sql: `SELECT dealname, pipeline, dealstage, hs_object_id, hs_lastmodifieddate FROM DEAL ORDER BY hs_lastmodifieddate DESC LIMIT 2000`,
          verbosityLevel: 'LOW',
          chatInsights: {
            userIntent: 'Build a complete index of existing HubSpot RFP deal names for weekly RFP qualification dedupe.',
            satisfaction: 'NEUTRAL',
          },
        }),
        '--format',
        'json',
      ],
      { timeoutMs: 120000 },
    );
    const parsed = JSON.parse(response || '{}');
    const text = parsed?.content?.[0]?.text || '';
    const bundle = text ? JSON.parse(text) : { results: [] };
    for (const item of bundle.results || []) {
      let record = item;
      if (typeof item?.content === 'string') {
        try {
          record = JSON.parse(item.content);
        } catch {
          record = item;
        }
      }
      const props = record?.properties || {};
      const name = normalizeSearchText(props.dealname || props['Deal name'] || props['Deal Name'] || '');
      if (name) names.add(name);
    }
  } catch {
    const queries = ['RFP', 'proposal', 'website', 'portal', 'development', 'redesign', 'cms', 'intranet', 'ai', 'software'];
    for (const query of queries) {
      const matches = await hubspotSearchTitle(query).catch(() => []);
      for (const deal of matches) {
        const name = hubspotDealNameText(deal);
        if (name) names.add(name);
      }
    }
  }

  loadHubSpotRfpIndex.cache = [...names];
  return loadHubSpotRfpIndex.cache;
}

async function hasHubSpotDuplicate(title = '', issuer = '', summary = '', index = []) {
  const normalizedTitle = normalizeSearchText(title);
  const shortenedTitle = normalizeRfpCore(title) || removeGenericRfpWords(title);
  const normalizedIssuer = normalizeSearchText(issuer);
  const summaryLead = normalizeText(summary).split(/\s+/).slice(0, 20).join(' ');
  const candidateVariants = [
    title,
    shortenedTitle,
    issuer ? `${issuer} ${title}` : '',
    summaryLead,
  ].map((value) => normalizeSearchText(value)).filter(Boolean);

  const matchedInIndex = index.some((dealName) => {
    const normalizedDeal = normalizeSearchText(dealName);
    if (!normalizedDeal) return false;
    if (candidateVariants.some((variant) => variant === normalizedDeal || variant.includes(normalizedDeal) || normalizedDeal.includes(variant))) {
      return true;
    }
    if (shortenedTitle && normalizedDeal.includes(shortenedTitle)) return true;
    if (normalizedIssuer && normalizedDeal.includes(normalizedIssuer) && tokenOverlapScore(shortenedTitle || normalizedTitle, normalizedDeal) >= 0.45) {
      return true;
    }
    return candidateVariants.some((variant) => tokenOverlapScore(variant, normalizedDeal) >= 0.65);
  });

  if (matchedInIndex) return true;
  return false;
}

async function driveUrl(fileId) {
  const output = await runJson('gog', ['-a', 'isa@seamgen.com', 'drive', 'url', fileId], { timeoutMs: 60000 });
  return normalizeText(output);
}

async function listFilesRecursive(rootDir) {
  const out = [];
  async function walk(currentDir) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        out.push(fullPath);
      }
    }
  }
  await walk(rootDir).catch(() => null);
  return out;
}

function parseFrontmatterMarkdown(content = '') {
  const text = String(content || '');
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  const frontmatter = {};
  if (!match) {
    return { frontmatter, body: text };
  }

  const fmText = match[1];
  const body = match[2] || '';
  for (const rawLine of fmText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (!key) continue;
    value = value.replace(/^\s+|\s+$/g, '');
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith('\'') && value.endsWith('\''))) {
      value = value.slice(1, -1);
    }
    if (value === 'null') value = '';
    frontmatter[key] = value;
  }
  return { frontmatter, body };
}

async function loadPortalCandidates() {
  await fs.mkdir(PORTAL_CANDIDATES_DIR, { recursive: true });
  let candidateFiles = await listFilesRecursive(PORTAL_CANDIDATES_DIR);
  candidateFiles = candidateFiles.filter((file) => path.basename(file).toLowerCase() === 'candidate.md');
  return candidateFiles;
}

async function readPortalCandidate(candidatePath) {
  const raw = await fs.readFile(candidatePath, 'utf8');
  const { frontmatter, body } = parseFrontmatterMarkdown(raw);
  const slug = path.basename(path.dirname(candidatePath));
  const title = normalizeText(frontmatter.title || '');
  const issuer = normalizeText(frontmatter.agency_name || '');
  const sourceUrl = normalizeText(frontmatter.source_url || frontmatter.solicitation_url || '');
  const portalUrl = normalizeText(frontmatter.solicitation_url || frontmatter.source_url || '');
  return {
    slug,
    path: candidatePath,
    raw,
    body,
    frontmatter,
    title,
    issuer,
    sourceUrl,
    portalUrl,
  };
}

async function findLocalResourcesDir(slug) {
  const stageDirs = ['1-pre-submission', '2-intermediate-stage', '3-building', '4-submitted'];
  for (const stage of stageDirs) {
    const resourcesDir = path.join(WORKSPACE, 'RFPs', stage, slug, 'resources');
    if (await fs.access(resourcesDir).then(() => true).catch(() => false)) {
      return resourcesDir;
    }
  }
  return '';
}

async function driveSearchRaw(query, options = {}) {
  let finalQuery = query;
  if (options.parent) {
    finalQuery = `${query} and '${options.parent}' in parents`;
  }
  const args = ['-a', 'isa@seamgen.com', 'drive', 'search', finalQuery, '--raw-query', '--plain', '--max', String(options.max || 100)];
  const output = await runJson('gog', args, { timeoutMs: 120000 });
  const lines = output.split('\n').map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return [];
  const headers = lines[0].split('\t');
  return lines.slice(1).map((line) => {
    const values = line.split('\t');
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });
    return row;
  });
}

async function loadHigherGovConfig() {
  if (loadHigherGovConfig.cache) return loadHigherGovConfig.cache;
  const raw = await fs.readFile(HIGHERGOV_CONFIG_PATH, 'utf8');
  loadHigherGovConfig.cache = JSON.parse(raw);
  return loadHigherGovConfig.cache;
}

function getHigherGovApiKey() {
  const key = process.env.HIGHERGOV_API_KEY;
  if (!key || !String(key).trim()) {
    throw new Error('HIGHERGOV_API_KEY is not set.');
  }
  return String(key).trim();
}

async function loadHigherGovState() {
  const exists = await fs.access(HIGHERGOV_STATE_PATH).then(() => true).catch(() => false);
  if (!exists) return null;
  const raw = await fs.readFile(HIGHERGOV_STATE_PATH, 'utf8');
  return JSON.parse(raw);
}

async function saveHigherGovState(state) {
  await fs.mkdir(path.dirname(HIGHERGOV_STATE_PATH), { recursive: true });
  await fs.writeFile(HIGHERGOV_STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

function utcToday() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function addUtcDays(date, days) {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function formatUtcDate(date) {
  return new Date(date).toISOString().slice(0, 10);
}

function getTextField(value = '') {
  if (typeof value === 'string') return normalizeText(value);
  if (!value || typeof value !== 'object') return '';
  return normalizeText(
    value.contact_email ||
    value.agency_name ||
    value.description ||
    value.name ||
    value.title ||
    value.code ||
    value.naics_code ||
    value.naics_description ||
    value.value ||
    '',
  );
}

function formatYamlValue(value) {
  if (value === null || value === undefined || value === '') return 'unknown';
  const text = String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `"${text}"`;
}

function recordField(record, key) {
  if (!record || typeof record !== 'object') return '';
  const direct = record[key];
  if (direct !== undefined && direct !== null && direct !== '') return direct;
  return '';
}

function recordString(record, key) {
  const value = recordField(record, key);
  if (typeof value === 'string') return normalizeText(value);
  if (value && typeof value === 'object') {
    return normalizeText(
      value.contact_email ||
      value.agency_name ||
      value.description ||
      value.name ||
      value.title ||
      value.code ||
      value.naics_code ||
      value.naics_description ||
      value.value ||
      '',
    );
  }
  return '';
}

async function loadExistingPortalCandidates() {
  await fs.mkdir(PORTAL_CANDIDATES_DIR, { recursive: true });
  const files = await listFilesRecursive(PORTAL_CANDIDATES_DIR);
  const candidateFiles = files.filter((file) => path.basename(file).toLowerCase() === 'candidate.md');
  const versionKeys = new Set();
  const slugs = new Set();
  for (const candidatePath of candidateFiles) {
    const raw = await fs.readFile(candidatePath, 'utf8').catch(() => '');
    if (!raw) continue;
    const { frontmatter } = parseFrontmatterMarkdown(raw);
    const versionKey = normalizeText(frontmatter.version_key || '');
    if (versionKey) versionKeys.add(versionKey);
    slugs.add(path.basename(path.dirname(candidatePath)));
  }
  return { candidateFiles, versionKeys, slugs };
}

async function clearPortalCandidatesCache() {
  const exists = await fs.access(PORTAL_CANDIDATES_DIR).then(() => true).catch(() => false);
  if (!exists) return;
  const entries = await fs.readdir(PORTAL_CANDIDATES_DIR, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const target = path.join(PORTAL_CANDIDATES_DIR, entry.name);
    await fs.rm(target, { recursive: true, force: true }).catch(() => null);
  }
}

async function resetHigherGovIntakeState() {
  await fs.rm(HIGHERGOV_STATE_PATH, { force: true }).catch(() => null);
  await fs.rm(HIGHERGOV_SEEN_PATH, { force: true }).catch(() => null);
}

async function loadHigherGovSeenSet() {
  const set = new Set();
  const exists = await fs.access(HIGHERGOV_SEEN_PATH).then(() => true).catch(() => false);
  if (!exists) return set;
  const raw = await fs.readFile(HIGHERGOV_SEEN_PATH, 'utf8').catch(() => '');
  const lines = raw.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return set;
  for (const line of lines.slice(1)) {
    const [versionKey] = line.split(',');
    if (versionKey) set.add(versionKey.replace(/^"|"$/g, '').trim());
  }
  return set;
}

async function appendHigherGovSeenRow(versionKey, oppKey, capturedDate) {
  await fs.mkdir(path.dirname(HIGHERGOV_SEEN_PATH), { recursive: true });
  const exists = await fs.access(HIGHERGOV_SEEN_PATH).then(() => true).catch(() => false);
  const row = [
    JSON.stringify(versionKey || ''),
    JSON.stringify(oppKey || ''),
    JSON.stringify(capturedDate || ''),
    JSON.stringify(new Date().toISOString()),
  ].join(',');
  if (!exists) {
    await fs.writeFile(HIGHERGOV_SEEN_PATH, `version_key,opp_key,captured_date,seen_utc\n${row}\n`, 'utf8');
  } else {
    await fs.appendFile(HIGHERGOV_SEEN_PATH, `${row}\n`, 'utf8');
  }
}

function buildHigherGovQueryUrl(method, query) {
  const params = new URLSearchParams();
  params.set('api_key', getHigherGovApiKey());
  for (const [key, value] of Object.entries(query || {})) {
    if (value !== undefined && value !== null && `${value}` !== '') {
      params.set(key, String(value));
    }
  }
  return `https://www.highergov.com/api-external/${method}/?${params.toString()}`;
}

async function invokeHigherGov(method, query) {
  const url = buildHigherGovQueryUrl(method, query);
  const attempts = 3;
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { method: 'GET' });
      const text = await response.text();
      if (!response.ok) {
        const error = new Error(`HigherGov ${method} failed (HTTP ${response.status}): ${text.slice(0, 500)}`);
        error.status = response.status;
        throw error;
      }
      return JSON.parse(text);
    } catch (error) {
      lastError = error;
      const status = Number(error?.status || 0);
      const retriable = [429, 500, 502, 503, 504].includes(status);
      if (attempt < attempts && retriable) {
        const delay = 1500 * attempt;
        process.stderr.write(`[weekly-rfp] HigherGov ${method} attempt ${attempt} failed (${status || 'network'}), retrying in ${delay}ms\n`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

async function getHigherGovDayCount(config, day) {
  const resp = await invokeHigherGov('opportunity', {
    search_id: config.searchId,
    source_type: config.sourceType,
    captured_date: day,
    page_size: 1,
  });
  return Number.parseInt(resp?.meta?.pagination?.count || '0', 10) || 0;
}

async function getHigherGovDayRecords(config, day) {
  const pageSize = Number.parseInt(config.pageSize || 25, 10) || 25;
  const byKey = new Map();
  let page = 1;
  let pages = null;
  let count = null;
  let fetched = 0;
  let lastPage = 0;
  process.stderr.write(`[weekly-rfp] intake day ${day} start\n`);

  while (page <= 50) {
    const resp = await invokeHigherGov('opportunity', {
      search_id: config.searchId,
      source_type: config.sourceType,
      captured_date: day,
      page_size: pageSize,
      page_number: page,
    });
    if (count === null) {
      count = Number.parseInt(resp?.meta?.pagination?.count || '0', 10) || 0;
    }
    pages = Number.parseInt(resp?.meta?.pagination?.pages || '0', 10) || pages;
    const results = Array.isArray(resp?.results) ? resp.results : [];
    fetched += results.length;
    lastPage = page;
    const before = byKey.size;
    for (const rec of results) {
      const versionKey = normalizeText(recordString(rec, 'version_key'));
      const key = versionKey || normalizeText(recordString(rec, 'opp_key')) || `${day}-${page}-${byKey.size}`;
      if (!byKey.has(key)) {
        byKey.set(key, rec);
      }
    }
    if (!results.length) break;
    if (page > 1 && byKey.size === before) break;
    if (pages !== null && page >= pages) break;
    page += 1;
  }

  return {
    records: [...byKey.values()],
    count,
    pages,
    served: byKey.size,
    fetched,
    fullyDrained: pages !== null && lastPage >= pages,
  };
}

function getHigherGovPrefilter(record, config) {
  const profile = config.seamgenProfile || {};
  const flags = [];

  const oppType = recordString(record, 'opp_type');
  if (oppType) {
    for (const excluded of profile.excludedOppTypes || []) {
      if (oppType.toLowerCase().includes(String(excluded).toLowerCase())) {
        return { pass: false, killReason: 'excluded-opp-type-rfi-sources-sought', flags, daysUntilDue: null };
      }
    }
  }

  const setAside = recordString(record, 'set_aside');
  if (setAside) {
    for (const deny of profile.setAsideDenyList || []) {
      if (setAside.toLowerCase().includes(String(deny).toLowerCase())) {
        return { pass: false, killReason: 'set-aside-not-held', flags, daysUntilDue: null };
      }
    }
    const recognized = (profile.setAsidePassList || []).some((allowed) => setAside.toLowerCase().includes(String(allowed).toLowerCase()));
    if (!recognized) flags.push('unrecognized-set-aside');
  }

  const dueDate = parseIsoDate(recordString(record, 'due_date'));
  let daysUntilDue = null;
  if (!dueDate) {
    flags.push('no-due-date');
  } else {
    const capturedBasis = parseIsoDate(recordString(record, 'captured_date')) || formatUtcDate(new Date());
    daysUntilDue = daysBetween(dueDate, capturedBasis);
    if (daysUntilDue < Number(profile.minDaysToDue || 10)) {
      return { pass: false, killReason: 'due-in-under-10-days', flags, daysUntilDue };
    }
  }

  if (`${recordField(record, 'sole_source_flag')}` === 'True') {
    flags.push('sole-source-flagged');
  }

  const naicsCode = recordString(record, 'naics_code');
  if (naicsCode && Array.isArray(profile.naics) && !profile.naics.includes(naicsCode)) {
    flags.push('naics-outside-profile');
  }

  if (!recordString(record, 'primary_contact_email')) {
    flags.push('no-contact');
  }

  return { pass: true, killReason: null, flags, daysUntilDue };
}

function buildHigherGovCandidateContent(record, prefilter, slug) {
  const agency = recordField(record, 'agency') || {};
  const naics = recordField(record, 'naics_code') || {};
  const primary = recordField(record, 'primary_contact_email') || {};
  const secondary = recordField(record, 'secondary_contact_email') || {};
  const attachments = recordField(record, 'attachments') || [];
  const hasAttachmentText = Array.isArray(attachments)
    && attachments.some((attachment) => normalizeText(attachment?.text || '').length > 0);
  const confidence = hasAttachmentText ? 'full-text' : 'metadata-only';
  const flags = prefilter.flags || [];
  const flagYaml = flags.length ? `[${flags.map((flag) => `"${flag}"`).join(', ')}]` : '[]';
  const daysAtCapture = prefilter.daysUntilDue !== null && prefilter.daysUntilDue !== undefined ? String(prefilter.daysUntilDue) : 'unknown';
  const title = recordString(record, 'title') || slug;

  const fm = [];
  fm.push('---');
  fm.push('# --- provenance ---');
  fm.push('source: HigherGov');
  fm.push(`source_url: ${formatYamlValue(recordString(record, 'path'))}`);
  fm.push(`solicitation_url: ${formatYamlValue(recordString(record, 'source_path'))}`);
  fm.push(`opp_key: ${formatYamlValue(recordString(record, 'opp_key'))}`);
  fm.push(`version_key: ${formatYamlValue(recordString(record, 'version_key'))}`);
  fm.push(`captured_date: ${formatYamlValue(recordString(record, 'captured_date'))}`);
  fm.push(`slug: ${formatYamlValue(slug)}`);
  fm.push('# --- scoring header fields ---');
  fm.push(`title: ${formatYamlValue(title)}`);
  fm.push(`rfp_number: ${formatYamlValue(recordString(record, 'source_id'))}`);
  fm.push(`agency_name: ${formatYamlValue(getTextField(agency))}`);
  fm.push(`agency_type: ${formatYamlValue(getTextField(agency?.agency_type))}`);
  fm.push(`primary_contact_name: ${formatYamlValue(getTextField(primary?.contact_name))}`);
  fm.push(`primary_contact_title: ${formatYamlValue(getTextField(primary?.contact_title))}`);
  fm.push(`primary_contact_email: ${formatYamlValue(getTextField(primary?.contact_email))}`);
  fm.push(`primary_contact_phone: ${formatYamlValue(getTextField(primary?.contact_phone))}`);
  fm.push(`secondary_contact_email: ${formatYamlValue(getTextField(secondary?.contact_email))}`);
  fm.push(`posted_date: ${formatYamlValue(recordString(record, 'posted_date'))}`);
  fm.push(`due_date: ${formatYamlValue(recordString(record, 'due_date'))}`);
  fm.push('due_date_time: unknown          # HigherGov carries no time or timezone');
  fm.push(`days_until_due_at_capture: ${daysAtCapture}`);
  fm.push('questions_due_date: unknown     # NOT carried by the HigherGov API');
  fm.push('# --- gate inputs ---');
  fm.push(`naics_code: ${formatYamlValue(getTextField(naics?.naics_code))}`);
  fm.push(`naics_description: ${formatYamlValue(getTextField(naics?.naics_description))}`);
  fm.push(`psc_code: ${formatYamlValue(recordString(record, 'psc_code'))}`);
  fm.push(`opp_type: ${formatYamlValue(recordString(record, 'opp_type'))}`);
  fm.push(`source_type: ${formatYamlValue(recordString(record, 'source_type'))}`);
  fm.push(`set_aside: ${formatYamlValue(recordString(record, 'set_aside'))}`);
  fm.push(`val_est_low: ${formatYamlValue(recordString(record, 'val_est_low'))}`);
  fm.push(`val_est_high: ${formatYamlValue(recordString(record, 'val_est_high'))}`);
  fm.push(`pop_state: ${formatYamlValue(recordString(record, 'pop_state'))}`);
  fm.push('# --- pipeline metadata ---');
  fm.push(`prefilter: ${prefilter.flags.length ? 'pass-with-flag' : 'pass'}`);
  fm.push(`prefilter_flags: ${flagYaml}`);
  fm.push(`scoring_confidence: ${confidence}`);
  fm.push('status: awaiting-scoring');
  fm.push('score: null');
  fm.push('---');
  fm.push('');

  const body = [];
  body.push(`# ${title}`);
  body.push('');
  body.push('> **For Claude.** This is a HigherGov intake record, not the full solicitation.');
  body.push('> Score it with `skills/rfp-scoring-skill.md`. `Source (found via)` is **HigherGov** - do not ask Jake.');
  body.push('> **Recompute "Days until due" against today**; `days_until_due_at_capture` was correct at capture, not now.');
  body.push('> Any field marked `unknown` was not available from HigherGov - write "unknown", never guess.');
  if (confidence === 'metadata-only') {
    body.push('> **`scoring_confidence: metadata-only`** - no attachment text was available. You are scoring off a summary;');
    body.push('> Gate 2, Gate 4, Gate 5 and Category 1 are all weaker. Mark the score provisional and say so.');
  }
  body.push('');
  body.push('## HigherGov AI summary');
  body.push(normalizeText(recordString(record, 'ai_summary')));
  body.push('');
  body.push('## Opportunity description (verbatim from HigherGov)');
  body.push(normalizeText(recordString(record, 'description_text')));
  body.push('');
  body.push('## Attachments');
  body.push('_No attachment text retrieved. Read the original solicitation before relying on the score._');
  body.push('');
  body.push('## Links');
  body.push(`- HigherGov page: ${recordString(record, 'path')}`);
  body.push(`- Original solicitation: ${recordString(record, 'source_path')}`);
  body.push('');

  return `${fm.join('\r\n')}${body.join('\r\n')}`;
}

async function getOrCreateUniqueHigherGovSlug(title, existingSlugs, usedSlugs) {
  const base = slugifyText(title);
  let slug = base;
  let counter = 1;
  while (existingSlugs.has(slug) || usedSlugs.has(slug) || (await fs.access(path.join(PORTAL_CANDIDATES_DIR, slug)).then(() => true).catch(() => false))) {
    counter += 1;
    slug = `${base}-v${counter}`;
  }
  usedSlugs.add(slug);
  return slug;
}

async function runHigherGovIntake() {
  const config = await loadHigherGovConfig();
  const fullBackfill = ['1', 'true', 'yes', 'full'].includes(String(process.env.RFP_FULL_BACKFILL || '').toLowerCase());
  const backfillDays = Number.parseInt(process.env.RFP_BACKFILL_DAYS || '30', 10) || 30;
  if (fullBackfill) {
    await resetHigherGovIntakeState();
  }
  const state = (await loadHigherGovState()) || {
    schemaVersion: 1,
    searchId: config.searchId,
    highWaterCapturedDate: null,
    quota: { month: isoDate().slice(0, 7), recordsFetched: 0, totalFetched: 0, history: [] },
    days: {},
  };
  await clearPortalCandidatesCache();
  const seenVersions = fullBackfill ? new Set() : await loadHigherGovSeenSet();
  const usedSlugs = new Set();
  const safetyLag = Number(config.safetyLagDays || 1);
  const endDate = addUtcDays(utcToday(), -safetyLag);
  const startDate = fullBackfill
    ? addUtcDays(endDate, -Math.max(backfillDays - 1, 0))
    : (state.highWaterCapturedDate ? addUtcDays(new Date(`${state.highWaterCapturedDate}T00:00:00Z`), 1) : addUtcDays(endDate, -6));
  const daysFetched = [];
  let current = startDate;
  let totalPass = 0;
  let totalKilled = 0;
  let totalDupes = 0;
  let totalFetched = 0;

  await fs.mkdir(PORTAL_CANDIDATES_DIR, { recursive: true });

  while (current <= endDate) {
    const day = formatUtcDate(current);
    daysFetched.push(day);
    const dr = await getHigherGovDayRecords(config, day);
    totalFetched += dr.fetched;
    process.stderr.write(`[weekly-rfp] intake day ${day} done: ${dr.served} served / ${dr.count ?? 'unknown'} total\n`);
    for (const record of dr.records) {
      const versionKey = normalizeText(recordString(record, 'version_key'));
      if (versionKey && seenVersions.has(versionKey)) {
        totalDupes += 1;
        continue;
      }
      const prefilter = getHigherGovPrefilter(record, config);
      const title = recordString(record, 'title') || 'untitled';
      if (!prefilter.pass) {
        totalKilled += 1;
        if (versionKey) seenVersions.add(versionKey);
        continue;
      }
      const slug = await getOrCreateUniqueHigherGovSlug(title, new Set(), usedSlugs);
      const candidateDir = path.join(PORTAL_CANDIDATES_DIR, slug);
      await fs.mkdir(candidateDir, { recursive: true });
      const candidatePath = path.join(candidateDir, 'candidate.md');
      const content = buildHigherGovCandidateContent(record, prefilter, slug);
      await fs.writeFile(candidatePath, content, 'utf8');
      totalPass += 1;
      if (versionKey) {
        seenVersions.add(versionKey);
        await appendHigherGovSeenRow(versionKey, recordString(record, 'opp_key'), recordString(record, 'captured_date')).catch(() => null);
      }
    }
    if (dr.fullyDrained) {
      state.days[day] = { fetched: dr.served, count: dr.count };
      state.highWaterCapturedDate = day;
      state.searchId = config.searchId;
      await saveHigherGovState(state);
    }
    current = addUtcDays(current, 1);
  }

  return {
    pass: totalPass,
    killed: totalKilled,
    dupes: totalDupes,
    fetched: totalFetched,
    state,
    daysFetched,
    startDate: formatUtcDate(startDate),
    endDate: formatUtcDate(endDate),
  };
}

async function loadFavorableRfpFolders() {
  if (loadFavorableRfpFolders.cache) return loadFavorableRfpFolders.cache;
  const rows = await driveSearchRaw("mimeType = 'application/vnd.google-apps.folder' and trashed = false", {
    parent: FAVORABLE_RFP_ROOT_FOLDER_ID,
    max: 200,
  }).catch(() => []);
  loadFavorableRfpFolders.cache = rows
    .filter((row) => normalizeText(row.TYPE || row.Type || row.type || '').toLowerCase() === 'folder')
    .map((row) => ({
      id: normalizeText(row.ID || row.Id || row.id || ''),
      name: normalizeText(row.NAME || row.Name || row.name || ''),
      normalized: normalizeSearchText(row.NAME || row.Name || row.name || ''),
    }))
    .filter((row) => row.id && row.name);
  return loadFavorableRfpFolders.cache;
}

function buildRfpFolderAliases(issuer = '', title = '', slug = '') {
  const aliases = [
    slug,
    title,
    normalizeRfpCore(title),
    removeGenericRfpWords(title),
    issuer ? `${issuer} - ${title}` : '',
    issuer,
  ]
    .map((value) => sanitizeDriveName(value || ''))
    .map((value) => normalizeSearchText(value))
    .filter(Boolean);

  return [...new Set(aliases)];
}

async function resolveRfpFolderId(issuer, title, slug = '') {
  const aliases = buildRfpFolderAliases(issuer, title, slug);
  const desiredName = sanitizeDriveName(slug || normalizeRfpCore(title) || removeGenericRfpWords(title) || title || `${issuer || 'Unknown organization'} - ${title}`);
  const desiredNormalized = normalizeSearchText(desiredName);
  const folders = await loadFavorableRfpFolders().catch(() => []);
  const existing = folders.find((folder) => {
    if (!folder.normalized) return false;
    if (folder.normalized === desiredNormalized || desiredNormalized.includes(folder.normalized) || folder.normalized.includes(desiredNormalized)) {
      return true;
    }
    return aliases.some((alias) => alias === folder.normalized || alias.includes(folder.normalized) || folder.normalized.includes(alias));
  });
  if (existing) {
    return existing.id;
  }

  await runJson('gog', ['-a', 'isa@seamgen.com', 'drive', 'mkdir', desiredName, '--parent', FAVORABLE_RFP_ROOT_FOLDER_ID, '--plain'], { timeoutMs: 120000 }).catch(() => null);
  loadFavorableRfpFolders.cache = null;
  const refreshed = await loadFavorableRfpFolders().catch(() => []);
  const created = refreshed.find((folder) => {
    if (!folder.normalized) return false;
    if (folder.normalized === desiredNormalized || folder.name === desiredName) return true;
    return aliases.some((alias) => alias === folder.normalized || alias.includes(folder.normalized) || folder.normalized.includes(alias));
  });
  return created?.id || '';
}

async function folderHasFile(folderId, fileName) {
  const rows = await driveSearchRaw(`name = '${String(fileName || '').replaceAll("'", "\\'")}' and trashed = false`, {
    parent: folderId,
    max: 20,
  }).catch(() => []);
  return rows.some((row) => normalizeText(row.NAME || row.Name || row.name || '') === normalizeText(fileName));
}

async function copyLocalFileToFolder(localPath, folderId) {
  const targetName = path.basename(localPath);
  const exists = await folderHasFile(folderId, targetName).catch(() => false);
  if (exists) {
    return { copied: false, reason: 'File already exists in destination folder.' };
  }
  await runJson('gog', ['-a', 'isa@seamgen.com', 'drive', 'upload', localPath, '--name', targetName, '--parent', folderId, '--no-input'], { timeoutMs: 120000 });
  return { copied: true, folderId, fileName: targetName };
}

async function ensureRfpDriveFolder(issuer, title, slug = '') {
  const folderId = await resolveRfpFolderId(issuer, title, slug);
  if (!folderId) {
    return { created: false, copied: false, reason: 'Could not resolve destination folder.' };
  }
  const folderUrl = await driveUrl(folderId).catch(() => `https://drive.google.com/drive/folders/${folderId}`);
  return { created: true, folderId, folderUrl };
}

async function mirrorLocalResourcesToDrive(folderId, slug) {
  const resourcesDir = await findLocalResourcesDir(slug);
  if (!resourcesDir) {
    return { mirrored: 0, reason: 'No local resources folder found.' };
  }
  const files = await listFilesRecursive(resourcesDir);
  let mirrored = 0;
  for (const filePath of files) {
    const fileName = path.basename(filePath);
    if (!fileName) continue;
    const result = await copyLocalFileToFolder(filePath, folderId).catch((error) => ({
      copied: false,
      reason: error?.message || 'Drive upload failed.',
    }));
    if (result.copied) mirrored += 1;
  }
  return { mirrored, resourcesDir };
}

async function downloadDriveFile(fileId, outputPath) {
  await runJson('gog', ['-a', 'isa@seamgen.com', 'drive', 'download', fileId, '--out', outputPath, '--overwrite'], { timeoutMs: 120000 });
  return outputPath;
}

async function extractPdfText(filePath) {
  const pdftotext = await run('bash', ['-lc', `command -v pdftotext >/dev/null && pdftotext "${filePath.replaceAll('"', '\\"')}" - || true`], { timeoutMs: 120000 });
  if (pdftotext.stdout.trim()) return pdftotext.stdout;
  return '';
}

async function extractDocxText(filePath) {
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
  const result = await run('python3', ['-c', script], { timeoutMs: 120000 });
  return result.exitCode === 0 ? result.stdout : '';
}

async function extractHtmlText(filePath) {
  const raw = await fs.readFile(filePath, 'utf8').catch(() => '');
  if (!raw) return '';
  return normalizeText(
    raw
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'"),
  );
}

async function extractXlsxText(filePath) {
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
  const result = await run('python3', ['-c', script], { timeoutMs: 120000 });
  return result.exitCode === 0 ? result.stdout : '';
}

async function extractFileText(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.pdf') return await extractPdfText(filePath);
  if (ext === '.docx') return await extractDocxText(filePath);
  if (ext === '.html' || ext === '.htm') return await extractHtmlText(filePath);
  if (ext === '.xlsx') return await extractXlsxText(filePath);
  if (ext === '.txt' || ext === '.md') {
    return await fs.readFile(filePath, 'utf8').catch(() => '');
  }
  return '';
}

async function loadQualificationEvidence(slug, fallbackText = '', options = {}) {
  if (!loadQualificationEvidence.cache) {
    loadQualificationEvidence.cache = new Map();
  }
  const cacheKey = `${slug}::${normalizeText(options.resourcesDir || '')}`;
  if (!options.forceRefresh && loadQualificationEvidence.cache.has(cacheKey)) {
    return loadQualificationEvidence.cache.get(cacheKey);
  }

  const resourcesDir = options.resourcesDir || await findLocalResourcesDir(slug);
  if (!resourcesDir) {
    const evidence = { text: fallbackText, source: 'metadata-fallback', docsFound: 0 };
    loadQualificationEvidence.cache.set(cacheKey, evidence);
    return evidence;
  }

  const files = await listFilesRecursive(resourcesDir).catch(() => []);
  const usableFiles = files.filter((file) => {
    const ext = path.extname(file).toLowerCase();
    return ['.pdf', '.docx', '.txt', '.md', '.html', '.htm'].includes(ext);
  });

  const parts = [];
  for (const filePath of usableFiles) {
    const extracted = await extractFileText(filePath).catch(() => '');
    if (!normalizeText(extracted)) continue;
    parts.push(`## ${path.relative(resourcesDir, filePath)}\n${extracted}`);
  }

  const evidence = {
    text: parts.join('\n\n').trim() || fallbackText,
    source: parts.length ? 'docs' : 'metadata-fallback',
    docsFound: parts.length,
  };
  loadQualificationEvidence.cache.set(cacheKey, evidence);
  return evidence;
}

function invalidateQualificationEvidenceCache(slug, resourcesDir = '') {
  if (!loadQualificationEvidence.cache) return;
  const suffix = `::${normalizeText(resourcesDir || '')}`;
  for (const key of [...loadQualificationEvidence.cache.keys()]) {
    if (key === slug || key.startsWith(`${slug}::`) || (suffix !== '::' && key === `${slug}${suffix}`)) {
      loadQualificationEvidence.cache.delete(key);
    }
  }
}

function firstMatch(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return normalizeText(match[0]);
  }
  return '';
}

function extractIssuer(text = '', title = '') {
  const source = `${title}\n${text}`;
  const patterns = [
    /(?:^|[.\n])\s*(?:description:\s*)?(?:the\s+)?([A-Z][^.!?\n]{3,160}?)\s+(?:hereby\s+issues|is\s+hereby\s+issuing|is\s+issuing|is\s+soliciting|is\s+seeking|seeks|solicits|invites|inviting)\b/mi,
    /(?:^|[.\n])\s*(?:issued\s+by|on\s+behalf\s+of)\s+(?:the\s+)?([A-Z][^.!?\n]{3,160}?)\b/mi,
    /(?:^|[.\n])\s*(?:the\s+)?([A-Z][^.!?\n]{3,160}?)\s+(?:hereby\s+issues|is\s+soliciting|is\s+seeking)\s+(?:competitive\s+)?proposals?/mi,
  ];

  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (!match) continue;
    const cleaned = cleanIssuerName(match[1]);
    if (cleaned && cleaned.length >= 3) return cleaned;
  }

  return '';
}

function extractDeadlines(text = '', runDate = '') {
  const lines = String(text || '')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => normalizeText(line))
    .filter(Boolean);
  const wanted = [];
  const deadlinePatterns = /deadline|due date|proposal submission|questions due|submission date|questions deadline|bid opening|proposal opening|submitted by|written questions|offer due|response due|clarification deadline/i;
  const datePatterns = [
    /\b\d{4}-\d{2}-\d{2}\b/g,
    /\b\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}\b/g,
    /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+\d{1,2},?\s+\d{4}\b/gi,
    /\b\d{1,2}\s+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?,?\s+\d{4}\b/gi,
  ];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!deadlinePatterns.test(line)) continue;
    const window = [line, lines[index + 1] || '', lines[index + 2] || ''].filter(Boolean).join(' ');
    const dates = [];
    for (const pattern of datePatterns) {
      for (const match of window.matchAll(pattern)) {
        const parsed = formatIsoDate(match[0]);
        if (parsed) dates.push(parsed);
      }
    }
    if (dates.length) {
      for (const date of dates) {
        const label = deadlineLabelFromText(window);
        if (runDate && date <= runDate) continue;
        if (!wanted.some((item) => item.label === label && item.date === date)) {
          wanted.push({ label, date });
        }
        if (wanted.length >= 5) break;
      }
    }
    if (wanted.length >= 5) break;
  }
  return wanted;
}

function evaluateQualificationGates(text = '', title = '', issuer = '', deadlines = [], amountValue = '', runDate = '') {
  const evidence = normalizeText(text);
  const results = [];
  const add = (gate, pass, reason) => {
    results.push({ gate, pass, reason });
    return pass;
  };

  const earliestDeadline = Array.isArray(deadlines) && deadlines.length
    ? [...deadlines].map((deadline) => deadline.date).filter(Boolean).sort()[0]
    : '';
  const dayDiff = earliestDeadline && runDate ? daysBetween(earliestDeadline, runDate) : null;
  if (!earliestDeadline) {
    add('Gate 1', false, 'No future due date could be verified in the RFP docs.');
  } else if (dayDiff < FULL_QUALIFY_MIN_DAYS) {
    add('Gate 1', false, `The earliest verified due date is only ${dayDiff} day(s) away.`);
  } else {
    add('Gate 1', true, `The earliest verified due date is ${dayDiff} day(s) away.`);
  }

  const customSignals = /\b(custom build|custom-built|moderni[sz]ation|redesign|rebuild|replatform|migration|integration|implement(?:ation)? services|development services)\b/i.test(evidence);
  const cotsSignals = /\b(cots|off[- ]the[- ]shelf|saas|software as a service|license(?:d)? solution|reseller|install and configure|configure this product|commercial product only|turnkey|no[- ]code|self[- ]service|existing platform)\b/i.test(evidence);
  if (cotsSignals && !customSignals) {
    add('Gate 2', false, 'The docs read as product procurement rather than a custom-build pursuit.');
  } else {
    add('Gate 2', true, customSignals ? 'The docs indicate custom work or modernization.' : 'No hard product-procurement tell found in the docs.');
  }

  const physicalSignals = /\b(hardware-only|physical goods|equipment procurement|construction|install(?:ation)? of equipment|devices?|servers?|laptops?|routers?|switches?)\b/i.test(evidence);
  if (physicalSignals) {
    add('Gate 3', false, 'The docs point to hardware/equipment/construction rather than software/services.');
  } else {
    add('Gate 3', true, 'No hardware-only or construction tell found in the docs.');
  }

  const submitSignals = /\b(must be registered|must register|vendor registration|portal registration|portal account|submit(?:ted)? via (?:the )?portal|bid portal|procurement portal|submittal portal|electronic submission|email submission)\b/i.test(evidence);
  const submitBarriers = /\b(closed|restricted|must already be approved|pre[- ]qualified|invite(?:d)? only)\b/i.test(evidence);
  if (submitSignals && submitBarriers) {
    add('Gate 4', false, 'The docs mention a submission path with an explicit access/registration barrier.');
  } else {
    add('Gate 4', true, 'No submission blocker is visible in the docs.');
  }

  const amountText = normalizeText(amountValue || extractContractValue(evidence));
  const amountMatch = amountText.match(/(\$?\s*\d[\d,]*(?:\.\d+)?)(\s*[kKmM])?/);
  let amountNumeric = 0;
  if (amountMatch) {
    const raw = parseFloat(amountMatch[1].replace(/[^0-9.]/g, ''));
    const suffix = (amountMatch[2] || '').trim().toLowerCase();
    amountNumeric = raw;
    if (suffix === 'k') amountNumeric *= 1000;
    if (suffix === 'm') amountNumeric *= 1000000;
  }
  if (amountNumeric > 0 && amountNumeric < FULL_QUALIFY_MIN_VALUE) {
    add('Gate 5', false, `The documented value appears below the $${(FULL_QUALIFY_MIN_VALUE / 1000).toFixed(0)}K floor (${amountText}).`);
  } else {
    add('Gate 5', true, amountNumeric > 0 ? `The documented value is at or above the $${(FULL_QUALIFY_MIN_VALUE / 1000).toFixed(0)}K floor (${amountText}).` : 'No hard sub-floor value is documented.');
  }

  const setAsideSignals = /\b(8a|8\(a\)|hubzone|wosb|edwosb|veteran[- ]owned|sdvosb|local vendor|minority[- ]owned)\b/i.test(evidence);
  const qualificationSignals = /\b(esri certified|specific license|specific certification|must provide proof of|minimum qualifications|3\+ governmental|3 or more governmental|governmental references|existing installs?|live demonstrations|must already exist|installed base)\b/i.test(evidence);
  if (setAsideSignals || qualificationSignals) {
    add('Gate 6', false, 'The docs contain qualification/set-aside tells that appear to exclude Seamgen.');
  } else {
    add('Gate 6', true, 'No disqualifying qualification or set-aside tell is visible in the docs.');
  }

  return {
    results,
    failed: results.find((gate) => !gate.pass) || null,
  };
}

function extractSummary(text = '') {
  const paragraphs = String(text || '')
    .replace(/\r/g, '\n')
    .split(/\n\s*\n+/)
    .map((block) => normalizeText(block))
    .filter(Boolean)
    .filter((block) => !/^(table of contents|contents|section\s+\d+|page\s+\d+)$/i.test(block))
    .filter((block) => !/\.{6,}\s*\d+\s*$/i.test(block))
    .filter((block) => block.length > 40);

  if (!paragraphs.length) return '';

  const scored = paragraphs.map((paragraph, index) => {
    const lower = paragraph.toLowerCase();
    let score = 0;
    if (/request for proposal|request for proposals|rfp|solicitation|invitation to proposal/.test(lower)) score += 4;
    if (/(seeks|seeking|soliciting|seeks competitive proposals|is soliciting proposals|purpose|background|overview|scope|mission|project overview)/.test(lower)) score += 4;
    if (/(shall|must|required|will|include|support|provide|deliver|manage|maintain)/.test(lower)) score += 2;
    if (paragraph.length > 400) score += 1;
    if (/table of contents|contents|page \d+|\.{6,}\s*\d+$/.test(lower)) score -= 5;
    if (/^[A-Z0-9\s,&\-()]{25,}$/.test(paragraph) && paragraph.length < 120) score -= 3;
    score -= Math.min(index, 5) * 0.25;
    return { paragraph, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0]?.paragraph || paragraphs[0] || '';
  const secondary = scored[1]?.paragraph || '';

  const combined = [best, secondary]
    .filter(Boolean)
    .map((paragraph) => {
      const sentences = paragraph.match(/[^.!?]+[.!?]+/g) || [paragraph];
      return sentences.slice(0, 2).join(' ').replace(/\s+/g, ' ').trim();
    })
    .filter(Boolean)
    .join(' ');

  const summary = normalizeText(combined || best)
    .replace(/^(the\s+)?vendor\s+shall\s+be\s+responsible\s+for\s+/i, '')
    .replace(/^(this\s+rfp|the\s+rfp)\s+(seeks|seeks to|is seeking|is for)\s+/i, '')
    .replace(/\b(addenda|attachments?|exhibits?)\b.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!summary) return '';
  const trimmed = summary.length > 260 ? `${summary.slice(0, 260).trimEnd()}…` : summary;
  return trimmed.replace(/\s+/g, ' ');
}

function daysBetween(left = '', right = '') {
  const leftDate = new Date(left);
  const rightDate = new Date(right);
  if (Number.isNaN(leftDate.getTime()) || Number.isNaN(rightDate.getTime())) return null;
  return Math.round((leftDate - rightDate) / 86400000);
}

function analyzeFit(text = '', title = '', deadlines = [], runDate = '') {
  const lower = `${title}\n${text}`.toLowerCase();
  let score = 0;
  const reasons = [];
  const blockers = [];
  const seenBlockers = new Set();
  const addBlocker = (category, detail, penalty = 0) => {
    const key = `${category}|${detail}`;
    if (seenBlockers.has(key)) return;
    seenBlockers.add(key);
    blockers.push({ category, detail });
    score -= penalty;
  };

  const fitRules = [
    [/accessibility|wcag|section 508|ada/i, 20, 'Accessibility / WCAG'],
    [/website|web redesign|intranet|portal|cms|content management|mobile|app|responsive/i, 18, 'Web / CMS / mobile delivery'],
    [/api|azure|react|\.net|sso|integration|cloud/i, 15, 'Integration / modern stack'],
    [/ai|artificial intelligence|automation|workflow|data platform|analytics/i, 15, 'AI / automation / data platform'],
    [/maintenance|support|hosting|operations|managed services/i, 10, 'Support / maintenance / hosting'],
    [/public sector|government|district|college|department|agency|state|city|metroparks/i, 8, 'Public-sector buyer'],
    [/fixed price|milestone|phased|implementation/i, 8, 'Delivery structure'],
  ];

  for (const [pattern, points, label] of fitRules) {
    if (pattern.test(lower)) {
      score += points;
      reasons.push(label);
    }
  }

  if (/\b(no[- ]code|self[- ]service|turnkey|cots|off[- ]the[- ]shelf|ready[- ]made product|existing platform)\b/i.test(lower)) {
    addBlocker('Product-fit', 'Asks for a ready-made or no-code platform.', 35);
  }

  if (/\bsaas\b/i.test(lower) && !/\bcustom\b/i.test(lower)) {
    addBlocker('Scope-fit', 'Reads like a SaaS-first ask without a clear custom-build angle.', 10);
  }

  if (/\b(sealed bid|mandatory site visit|vendor registration|two[- ]envelope|addenda required|prequalification|qualified bidder|bid bond)\b/i.test(lower)) {
    addBlocker('Procurement risk', 'Rigid procurement mechanics suggest a heavy bid process.', 5);
  }

  if (/\b(soc\s?2|iso\s?27001|hipaa|fedramp|cjis|pci\s?dss|security questionnaire|insurance certificate|data residency|background check)\b/i.test(lower)) {
    addBlocker('Compliance risk', 'Security or compliance requirements are material in the brief.', 5);
  }

  if (/\b(fixed price|turnkey|all[- ]inclusive|guaranteed delivery|hard deadline|liquidated damages|penalty)\b/i.test(lower)) {
    addBlocker('Delivery risk', 'The brief suggests fixed-price or turnkey delivery with limited discovery room.', 5);
  }

  if (/\b(budget\s*(?:tbd|unknown|not stated|not disclosed)|to be determined|no budget|budget\s*[:\-]\s*tbd)\b/i.test(lower)) {
    addBlocker('Budget risk', 'The budget is missing or explicitly unclear.', 3);
  }

  if (Array.isArray(deadlines) && deadlines.length && runDate) {
    const earliest = [...deadlines].map((deadline) => deadline.date).filter(Boolean).sort()[0];
    const days = earliest ? daysBetween(earliest, runDate) : null;
    if (Number.isFinite(days) && days <= 7) {
      addBlocker('Timeline risk', `Proposal is due in ${days} day${days === 1 ? '' : 's'}.`, 5);
    }
  }

  if (/\bproposal\b|\brfp\b|\bsolicitation\b/i.test(lower)) {
    score += 5;
  }

  if (/\bbudget\b|\bestimate\b|\bamount\b|\bpriced\b/i.test(lower)) {
    score += 5;
  }

  if (score < 0) score = 0;
  return { score, reasons: [...new Set(reasons)], blockers: [...new Set(blockers)] };
}

function assessSolutionLandscape(text = '', title = '', issuer = '', deadlines = []) {
  const lower = `${title}\n${issuer}\n${text}`.toLowerCase();
  const signals = [];
  let score = 0;
  let hardMismatch = false;

  if (/website|portal|intranet|cms|content management|digital experience|user experience|responsive/.test(lower)) {
    signals.push('web / portal solution');
    score += 8;
  }
  if (/integration|api|data migration|single sign[- ]on|sso|cloud|azure|microsoft 365|salesforce/.test(lower)) {
    signals.push('integration-heavy landscape');
    score += 8;
  }
  if (/accessibility|wcag|section 508|ada/.test(lower)) {
    signals.push('accessibility requirement');
    score += 6;
  }
  if (/moderniz|replace|upgrade|migration|legacy/.test(lower)) {
    signals.push('modernization / replacement context');
    score += 4;
  }
  if (/public sector|government|agency|city|county|district|college|university|school/.test(lower)) {
    signals.push('public-sector procurement landscape');
    score += 3;
  }
  if (/\b(no[- ]code|self[- ]service|turnkey|cots|off[- ]the[- ]shelf|ready[- ]made product|existing platform)\b/i.test(lower)) {
    hardMismatch = true;
    signals.push('product-fit mismatch');
    score -= 20;
  }

  const earliest = Array.isArray(deadlines) && deadlines.length ? [...deadlines].map((deadline) => deadline.date).filter(Boolean).sort()[0] : '';
  if (earliest) {
    signals.push(`timeline anchored to ${earliest}`);
  }

  const summary = signals.length
    ? `Solution landscape points to ${signals.slice(0, 3).join(', ')}.`
    : 'Solution landscape is broad; no strong directional signal from the text.';

  return { summary, score, hardMismatch, signals };
}

function verifyCapabilities(text = '', title = '', reasons = []) {
  const lower = `${title}\n${text}`.toLowerCase();
  const signals = [];
  let score = 0;
  let hardMismatch = false;

  if (/accessibility|wcag|section 508|ada/.test(lower)) {
    signals.push('accessibility delivery');
    score += 8;
  }
  if (/integration|api|sso|cloud|azure|\.net|react|workflow|automation|analytics|data platform/.test(lower)) {
    signals.push('implementation and integration work');
    score += 8;
  }
  if (/website|portal|intranet|cms|digital experience|responsive|content management/.test(lower)) {
    signals.push('web delivery');
    score += 6;
  }
  if (/support|maintenance|hosting|managed services/.test(lower)) {
    signals.push('delivery and support');
    score += 3;
  }
  if (/\b(no[- ]code|self[- ]service|turnkey|cots|off[- ]the[- ]shelf|ready[- ]made product|existing platform)\b/i.test(lower)) {
    hardMismatch = true;
    signals.push('capability mismatch with custom build model');
    score -= 25;
  }
  if (/saas\b/i.test(lower) && !/custom/.test(lower)) {
    score -= 5;
    signals.push('SaaS-first language without custom build context');
  }

  if (!signals.length && reasons.length) {
    signals.push(`backed by ${[...new Set(reasons)].slice(0, 3).join(', ')}`);
    score += 2;
  }

  const summary = signals.length
    ? `Capability verification confirms ${signals.slice(0, 3).join(', ')}.`
    : 'Capability verification does not expose a clear mismatch.';

  return { summary, score, hardMismatch, signals };
}

function formatBlocker(blocker = {}) {
  if (!blocker || typeof blocker !== 'object') return '';
  const category = normalizeText(blocker.category || '');
  const detail = normalizeText(blocker.detail || '');
  if (!category && !detail) return '';
  if (!category) return detail;
  if (!detail) return category;
  return `${category}: ${detail}`;
}

function extractContractValue(text = '') {
  const lines = String(text || '')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => normalizeText(line))
    .filter(Boolean);

  const keywordPatterns = /contract value|contract amount|estimated value|estimated budget|budget|price|cost|amount|not-to-exceed|nte/i;
  const currencyPatterns = [
    /\$\s*\d[\d,]*(?:\.\d+)?(?:\s*(?:k|m|million))?/i,
    /\bUSD\s*\d[\d,]*(?:\.\d+)?(?:\s*(?:k|m|million))?/i,
  ];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!keywordPatterns.test(line)) continue;
    const window = [line, lines[index + 1] || ''].filter(Boolean).join(' ');
    for (const pattern of currencyPatterns) {
      const match = window.match(pattern);
      if (match) return normalizeText(match[0]);
    }
  }

  return 'not stated';
}

function buildSection(item) {
  const deadlineRows = item.deadlines.length
    ? item.deadlines.map((line) => `${escapeHtml(line.label)}: ${escapeHtml(line.date)}`).join('<br>')
    : 'No future deadline found in the extracted material.';

  const blockerRows = item.blockers.length
    ? item.blockers.map((blocker) => escapeHtml(formatBlocker(blocker))).join('<br>')
    : 'No major blocker detected from the extracted material.';

  return `
    <article style="border:1px solid #dbeafe;border-left:6px solid #2563eb;border-radius:18px;padding:18px 20px;margin:0 0 18px;background:#ffffff;box-shadow:0 1px 2px rgba(15,23,42,0.04);">
      <h3 style="margin:0 0 12px;font-size:20px;line-height:1.25;color:#111827;">${escapeHtml(item.displayTitle)}</h3>
      <div style="font-size:14px;color:#374151;">
        <div style="padding:10px 0;border-top:1px solid #e5e7eb;">
          <strong>Documentation link:</strong> <a href="${escapeHtml(item.driveUrl)}">Open documentation</a>
        </div>
        <div style="padding:10px 0;border-top:1px solid #e5e7eb;">
          <strong>Portal source:</strong> <a href="${escapeHtml(item.portalUrl || item.driveUrl)}">Open HigherGov listing</a>
        </div>
        <div style="padding:10px 0;border-top:1px solid #e5e7eb;">
          <strong>Contract value:</strong> ${escapeHtml(item.amount)}
        </div>
        <div style="padding:10px 0;border-top:1px solid #e5e7eb;">
          <strong>Qualification:</strong> ${escapeHtml(item.scoreNarrative)}
        </div>
        <div style="padding:10px 0;border-top:1px solid #e5e7eb;">
          <strong>Key dates:</strong><br>${deadlineRows}
        </div>
        <div style="padding:10px 0;border-top:1px solid #e5e7eb;">
          <strong>What the RFP is asking for:</strong> ${escapeHtml(item.summary || 'Not enough text extracted to summarize clearly.')}
        </div>
        <div style="padding:10px 0;border-top:1px solid #e5e7eb;">
          <strong>Why Seamgen fits:</strong> ${escapeHtml(item.whyFits || 'Fit came from general procurement signals.')}
        </div>
        <div style="padding:10px 0;border-top:1px solid #e5e7eb;">
          <strong>Potential blockers:</strong><br>${blockerRows}
        </div>
      </div>
    </article>
  `;
}

function buildReviewSection(item) {
  const details = [
    item.document_status ? `Document status: ${item.document_status}` : '',
    item.qualification_status ? `Qualification status: ${item.qualification_status}` : '',
    item.reason ? `Reason: ${item.reason}` : '',
  ].filter(Boolean).join('<br>');
  return `
    <article style="border:1px solid #fee2e2;border-left:6px solid #dc2626;border-radius:18px;padding:18px 20px;margin:0 0 18px;background:#fff7f7;box-shadow:0 1px 2px rgba(15,23,42,0.04);">
      <h3 style="margin:0 0 12px;font-size:20px;line-height:1.25;color:#111827;">${escapeHtml(item.displayTitle)}</h3>
      <div style="font-size:14px;color:#374151;">
        <div style="padding:10px 0;border-top:1px solid #e5e7eb;">
          <strong>Preliminary score:</strong> ${escapeHtml(item.preliminaryScoreDisplay)}
        </div>
        <div style="padding:10px 0;border-top:1px solid #e5e7eb;">
          <strong>Status:</strong> ${escapeHtml(item.qualification_status || 'provisional')}
        </div>
        <div style="padding:10px 0;border-top:1px solid #e5e7eb;">
          <strong>Why it paused:</strong> ${escapeHtml(item.reason || 'Manual review required.')}
        </div>
        <div style="padding:10px 0;border-top:1px solid #e5e7eb;">
          <strong>Document state:</strong> ${escapeHtml(item.document_status || 'metadata-only')}
        </div>
      </div>
    </article>
  `;
}

function buildEmailHtml(runDate, qualifiedItems, manualItems, intake) {
  const week = weekNumber(new Date(runDate));
  const itemCount = qualifiedItems.length;
  const manualCount = manualItems.length;
  const intakeSummary = intake
    ? `${summarizeCount(intake.fetched || 0, 'record')} scanned across ${summarizeCount((intake.daysFetched || []).length, 'day')}; ${summarizeCount(intake.pass || 0, 'candidate')} passed, ${summarizeCount(Math.max((intake.fetched || 0) - (intake.pass || 0), 0), 'filtered out')}.`
    : 'HigherGov intake completed before qualification.';
  return `
    <html>
      <body style="font-family:Arial,Helvetica,sans-serif;line-height:1.5;color:#111827;background:#f9fafb;padding:24px;">
        <div style="max-width:980px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;padding:24px;">
          <h2 style="margin:0 0 10px;font-size:24px;">New qualified RFP's for pursue decision - week ${escapeHtml(week)}</h2>
          <p style="margin:0 0 8px;color:#374151;">${escapeHtml(intakeSummary)}</p>
          <p style="margin:0 0 16px;color:#374151;">${escapeHtml(summarizeCount(itemCount, 'qualified RFP'))} found in the current portal intake. Only items at or above the 75 threshold, and without an existing HubSpot RFP record, are included.</p>
          ${itemCount ? qualifiedItems.map(buildSection).join('') : '<p style="margin:0;color:#374151;">No qualified new RFPs were found in this run.</p>'}
          <h3 style="margin:24px 0 12px;font-size:20px;color:#111827;">Manual review</h3>
          <p style="margin:0 0 16px;color:#374151;">${escapeHtml(summarizeCount(manualCount, 'candidate'))} require follow-up or document review.</p>
          ${manualCount ? manualItems.map(buildReviewSection).join('') : '<p style="margin:0;color:#374151;">No candidates were held for manual review.</p>'}
          <p style="margin-top:24px;color:#6b7280;font-size:12px;">This email is generated by ISA, the AI assistant of Seamgen. ISA has been fed and trained with relevant knowledge, and the content and expressions are supervised. For personal contact, you can always call or email me.</p>
        </div>
      </body>
    </html>
  `;
}

async function scoreMetadataCandidate(candidate, runDate) {
  const metadataText = buildMetadataText(candidate);
  const candidateText = metadataText || normalizeText(candidate?.frontmatter?.title || candidate?.slug || '');
  const preview = scoreCandidateFromText({
    candidate,
    text: candidateText,
    runDate,
  });
  const enoughMetadata = normalizeText(metadataText).length >= 120
    || normalizeText(candidate?.frontmatter?.ai_summary || '').length >= 80
    || normalizeText(candidate?.frontmatter?.description_text || '').length >= 80
    || normalizeText(candidate?.frontmatter?.due_date || '').toLowerCase() !== 'unknown'
    || normalizeText(candidate?.frontmatter?.val_est_low || '').toLowerCase() !== 'unknown';

  if (!enoughMetadata) {
    return {
      status: 'insufficient-metadata',
      score: null,
      text: metadataText,
      preview,
      evidenceSource: 'metadata-only',
    };
  }

  return {
    status: 'preliminary-below-threshold',
    score: Math.max(0, Math.round(preview.score)),
    text: metadataText,
    preview,
    evidenceSource: 'metadata-only',
  };
}

async function materializeCandidateDocuments({ candidate, config, resourcesDir, apiKey, forceFetch = false }) {
  const frontmatter = candidate.frontmatter || {};
  const versionKey = normalizeText(frontmatter.version_key || '');
  const oppKey = normalizeText(frontmatter.opp_key || '');
  const capturedDate = normalizeText(frontmatter.captured_date || '');
  const lookup = await lookupOpportunityRecord({
    apiKey,
    searchId: config.searchId,
    sourceType: config.sourceType,
    capturedDate,
    versionKey,
    oppKey,
  }).catch((error) => ({ __error: error }));
  if (lookup.__error) {
    return {
      status: 'failed',
      manifest: null,
      resourcesDir,
      reason: lookup.__error?.message || 'HigherGov opportunity lookup failed.',
    };
  }
  if (!lookup.record) {
    return {
      status: 'failed',
      manifest: null,
      resourcesDir,
      reason: 'Could not rehydrate the live HigherGov opportunity record from the stored stable keys.',
    };
  }

  const liveRecord = lookup.record;
  const documentPath = normalizeText(liveRecord.document_path || '');
  if (!documentPath) {
    return {
      status: 'access-blocked',
      manifest: null,
      resourcesDir,
      reason: 'The live HigherGov opportunity record did not expose a document_path.',
    };
  }

  const documentRecords = await listDocumentRecords({ apiKey, documentPath }).catch((error) => {
    return { __error: error };
  });
  if (documentRecords && documentRecords.__error) {
    return {
      status: 'failed',
      manifest: null,
      resourcesDir,
      reason: documentRecords.__error?.message || 'HigherGov document lookup failed.',
    };
  }
  if (!Array.isArray(documentRecords) || !documentRecords.length) {
    return {
      status: 'document-list-empty',
      manifest: null,
      resourcesDir,
      reason: 'HigherGov returned no document records for the live document_path.',
    };
  }

  await fs.mkdir(resourcesDir, { recursive: true });
  const documents = [];
  for (let i = 0; i < documentRecords.length; i += 1) {
    const row = await saveDocumentRecord({
      apiKey,
      record: documentRecords[i],
      resourcesDir,
      index: i,
    }).catch((error) => ({
      source_document_id: normalizeText(documentRecords[i]?.id || documentRecords[i]?.document_id || ''),
      source_file_name: normalizeText(documentRecords[i]?.file_name || documentRecords[i]?.name || documentRecords[i]?.title || ''),
      local_file_name: '',
      local_path: '',
      content_type: '',
      size_bytes: 0,
      role: 'other',
      required: false,
      priority: 0,
      downloaded: false,
      extracted: false,
      extracted_text_chars: 0,
      hash: '',
      document_status: 'failed',
      reason: error?.message || 'download failed',
    }));
    documents.push(row);
  }

  const manifest = {
    candidate_slug: candidate.slug,
    candidate_title: candidate.title,
    version_key: versionKey,
    opp_key: oppKey,
    captured_date: capturedDate,
    highergov_page: normalizeText(liveRecord.path || frontmatter.source_url || ''),
    source_path: normalizeText(liveRecord.source_path || frontmatter.solicitation_url || ''),
    fetched_utc: new Date().toISOString(),
    documents,
  };

  return {
    status: 'downloaded',
    manifest,
    resourcesDir,
    liveRecord,
    documentRecords,
  };
}

async function extractManifestEvidence(manifest, resourcesDir) {
  const documents = Array.isArray(manifest?.documents) ? manifest.documents : [];
  let extractedDocs = 0;
  let primaryDocument = null;
  let extractedText = '';
  for (const row of documents) {
    if (!row?.downloaded || !row.local_path) continue;
    const text = await extractFileText(row.local_path).catch(() => '');
    if (normalizeText(text)) {
      row.extracted = true;
      row.extracted_text_chars = normalizeText(text).length;
      row.document_status = row.document_status === 'downloaded but unsupported' ? row.document_status : 'downloaded and extracted';
      extractedDocs += 1;
      if (!primaryDocument && row.role === 'solicitation') {
        primaryDocument = row;
      }
      extractedText += `## ${row.local_file_name || row.source_file_name}\n${text.trim()}\n\n`;
    } else if (row.document_status !== 'failed') {
      row.extracted = false;
      if (row.document_status === 'downloaded') {
        row.document_status = 'downloaded but unsupported';
      }
    }
  }

  const completeness = evaluateDocumentCompleteness({
    manifest: documents,
    extractedTextByPath: new Map(documents.filter((row) => row.extracted && row.local_path).map((row) => [row.local_path, row.extracted_text_chars])),
  });
  const manifestSummary = {
    ...manifest,
    resources_dir: resourcesDir,
    extracted_docs: extractedDocs,
    primary_document: primaryDocument ? {
      local_file_name: primaryDocument.local_file_name,
      local_path: primaryDocument.local_path,
      role: primaryDocument.role,
      extracted_text_chars: primaryDocument.extracted_text_chars || 0,
    } : null,
    completeness,
    documents,
  };
  return {
    manifest: manifestSummary,
    evidenceText: normalizeText(extractedText),
    completeness,
  };
}

async function runIsolatedDocumentFlowTest() {
  const candidateSlug = getTestCandidateSlug();
  const candidateFiles = await loadPortalCandidates();
  const candidatePath = candidateFiles.find((file) => path.basename(path.dirname(file)) === candidateSlug);
  if (!candidatePath) {
    throw new Error(`Could not find candidate.md for slug ${candidateSlug}`);
  }
  const candidate = await readPortalCandidate(candidatePath);
  const config = await loadHigherGovConfig();
  const apiKey = getHigherGovApiKey();
  const runDate = isoDate(process.env.RFP_RUN_DATE || new Date());
  const preliminary = await scoreMetadataCandidate(candidate, runDate);
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), `rfp-test-${candidate.slug}-`));
  const resourcesDir = path.join(tempDir, 'resources');
  await fs.mkdir(resourcesDir, { recursive: true });
  const documentFlow = await materializeCandidateDocuments({
    candidate,
    config,
    resourcesDir,
    apiKey,
    forceFetch: true,
  });
  if (documentFlow.status !== 'downloaded') {
    return {
      candidateSlug: candidate.slug,
      runDate,
      tempDir,
      preliminary,
      documentFlow,
      final: null,
    };
  }

  invalidateQualificationEvidenceCache(candidate.slug, resourcesDir);
  const extracted = await extractManifestEvidence(documentFlow.manifest, resourcesDir);
  const finalText = extracted.completeness.complete ? extracted.evidenceText : '';
  const final = finalText
    ? scoreCandidateFromText({ candidate, text: finalText, runDate })
    : null;
  return {
    candidateSlug: candidate.slug,
    runDate,
    tempDir,
    preliminary,
    documentFlow,
    extracted,
    final,
  };
}

async function main() {
  const runDate = isoDate(process.env.RFP_RUN_DATE || new Date());
  process.stderr.write(`[weekly-rfp] start ${runDate}\n`);
  if (TEST_MODE) {
    process.stderr.write(`[weekly-rfp] test mode enabled - skipping intake and using isolated document flow\n`);
    const result = await runIsolatedDocumentFlowTest();
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  const intake = await runHigherGovIntake();
  process.stderr.write(`[weekly-rfp] intake done: ${intake.pass} pass, ${intake.fetched} fetched across ${intake.daysFetched.length} day(s)\n`);
  const candidatePaths = await loadPortalCandidates().catch(() => []);
  process.stderr.write(`[weekly-rfp] candidates on disk: ${candidatePaths.length}\n`);

  const qualified = [];
  const manualReview = [];
  let hubspotDealIndex = null;
  const getHubspotIndex = async () => {
    if (hubspotDealIndex) return hubspotDealIndex;
    hubspotDealIndex = await withTimeout(loadHubSpotRfpIndex().catch(() => []), 30000, 'HubSpot index load').catch((error) => {
      process.stderr.write(`[weekly-rfp] HubSpot index fallback: ${error.message}\n`);
      return [];
    });
    process.stderr.write(`[weekly-rfp] HubSpot index loaded: ${hubspotDealIndex.length} deal name(s)\n`);
    return hubspotDealIndex;
  };
  const seenRfpKeys = new Set();
  const apiKey = getHigherGovApiKey();
  const config = await loadHigherGovConfig();

  for (let i = 0; i < candidatePaths.length; i += 1) {
    const candidatePath = candidatePaths[i];
    const candidate = await readPortalCandidate(candidatePath).catch(() => null);
    if (!candidate) continue;
    const { slug, title: frontTitle, issuer: frontIssuer, sourceUrl, portalUrl, frontmatter, body } = candidate;
    const title = cleanName(frontTitle || slug);
    const issuer = cleanName(frontIssuer || '');
    const metadataText = buildMetadataText(candidate);
    const preliminary = await scoreMetadataCandidate(candidate, runDate);
    const preliminaryScore = preliminary.score;
    const summary = extractSummary(metadataText) || normalizeText(frontmatter.ai_summary || '').slice(0, 260) || normalizeText(frontmatter.description_text || '').slice(0, 260) || '';
    const rfpKey = buildRfpKey(title, issuer);
    if (rfpKey && seenRfpKeys.has(rfpKey)) {
      continue;
    }
    if (rfpKey) {
      seenRfpKeys.add(rfpKey);
    }

    if ((i + 1) % 25 === 0) {
      process.stderr.write(`[weekly-rfp] scored ${i + 1}/${candidatePaths.length} candidates\n`);
    }
    const displayTitle = issuer && !normalizeSearchText(title).includes(normalizeSearchText(issuer))
      ? `${title} — ${issuer}`
      : title;
    const deadlines = extractDeadlinesFromMetadata(candidate, metadataText, runDate);
    const amountValue = (frontmatter.val_est_low && normalizeText(frontmatter.val_est_low).toLowerCase() !== 'unknown'
      ? normalizeText(frontmatter.val_est_low)
      : 'not stated');

    if (preliminary.status === 'insufficient-metadata') {
      await persistCandidateState(candidatePath, {
        preliminary_score: null,
        final_score: null,
        score: null,
        scoring_confidence: 'metadata-only',
        qualification_status: 'insufficient-metadata',
        document_status: 'metadata-only',
        status: 'provisional',
      });
      manualReview.push({
        displayTitle,
        preliminaryScoreDisplay: 'insufficient metadata',
        qualification_status: 'insufficient-metadata',
        document_status: 'metadata-only',
        reason: 'Not enough metadata to score reliably.',
      });
      continue;
    }

    await persistCandidateState(candidatePath, {
      preliminary_score: preliminaryScore,
      final_score: null,
      score: null,
      scoring_confidence: 'metadata-only',
      qualification_status: preliminaryScore >= FULL_QUALIFY_THRESHOLD ? 'provisional' : 'preliminary-below-threshold',
      document_status: 'metadata-only',
      status: 'provisional',
    });

    if (preliminaryScore < FULL_QUALIFY_THRESHOLD) {
      manualReview.push({
        displayTitle,
        preliminaryScoreDisplay: String(preliminaryScore),
        qualification_status: 'preliminary-below-threshold',
        document_status: 'metadata-only',
        reason: `Preliminary score ${preliminaryScore} is below the document-fetch threshold of ${FULL_QUALIFY_THRESHOLD}.`,
      });
      continue;
    }

    if (!DOCUMENT_FETCH_ENABLED) {
      manualReview.push({
        displayTitle,
        preliminaryScoreDisplay: String(preliminaryScore),
        qualification_status: 'provisional',
        document_status: 'metadata-only',
        reason: 'Document fetching is disabled by feature flag, so this candidate stays provisional.',
      });
      continue;
    }

    const resourcesDir = await ensureCandidateResourcesDir(slug);
    const fetchResult = await materializeCandidateDocuments({
      candidate,
      config,
      resourcesDir,
      apiKey,
    });

    if (fetchResult.status !== 'downloaded' || !fetchResult.manifest) {
      await persistCandidateState(candidatePath, {
        preliminary_score: preliminaryScore,
        final_score: null,
        score: null,
        scoring_confidence: 'metadata-only',
        qualification_status: 'provisional',
        document_status: fetchResult.status,
        status: 'provisional',
      });
      manualReview.push({
        displayTitle,
        preliminaryScoreDisplay: String(preliminaryScore),
        qualification_status: 'provisional',
        document_status: fetchResult.status,
        reason: fetchResult.reason || 'Document fetch did not produce retrievable files.',
      });
      continue;
    }

    await writeDocumentManifestJson(resourcesDir, fetchResult.manifest);
    await writeDocumentManifestMarkdown(resourcesDir, fetchResult.manifest);
    invalidateQualificationEvidenceCache(slug, resourcesDir);

    const extracted = await extractManifestEvidence(fetchResult.manifest, resourcesDir);
    await writeDocumentManifestJson(resourcesDir, extracted.manifest);
    await writeDocumentManifestMarkdown(resourcesDir, extracted.manifest);

    const completeness = extracted.completeness;
    if (!completeness.complete) {
      const documentStatus = completeness.status;
      await persistCandidateState(candidatePath, {
        preliminary_score: preliminaryScore,
        final_score: null,
        score: null,
        scoring_confidence: ['access-blocked', 'document-list-empty'].includes(documentStatus) ? 'metadata-only' : 'partial-documents',
        qualification_status: 'provisional',
        document_status: documentStatus,
        document_manifest_path: path.join(resourcesDir, '_document-manifest.json'),
        status: 'provisional',
      });
      manualReview.push({
        displayTitle,
        preliminaryScoreDisplay: String(preliminaryScore),
        qualification_status: 'provisional',
        document_status: documentStatus,
        reason: completeness.reasons.join('; ') || 'Document completeness could not be proven.',
      });
      continue;
    }

    const qualificationText = extracted.evidenceText || metadataText;
    const scoringBundle = scoreCandidateFromText({ candidate, text: qualificationText, runDate });
    const finalScore = Math.max(0, Math.round(scoringBundle.score));
    const gateCheck = scoringBundle.gateCheck;
    const whyFits = buildWhyItFitsNarrative({
      title,
      issuer,
      summary: extractSummary(qualificationText) || summary,
      reasons: scoringBundle.reasons,
      landscapeSummary: scoringBundle.landscape.summary,
      capabilitySummary: scoringBundle.capability.summary,
    });
    const blockers = [...scoringBundle.blockers];
    const amountText = extractContractValue(qualificationText)
      || (frontmatter.val_est_low && normalizeText(frontmatter.val_est_low).toLowerCase() !== 'unknown'
        ? normalizeText(frontmatter.val_est_low)
        : '');

    if (gateCheck.failed) {
      await persistCandidateState(candidatePath, {
        preliminary_score: preliminaryScore,
        final_score: null,
        score: null,
        scoring_confidence: 'full-text',
        qualification_status: 'failed-gate',
        document_status: 'full-text',
        document_manifest_path: path.join(resourcesDir, '_document-manifest.json'),
        status: 'provisional',
      });
      manualReview.push({
        displayTitle,
        preliminaryScoreDisplay: String(preliminaryScore),
        qualification_status: 'failed-gate',
        document_status: 'full-text',
        reason: `Strict gate failed: ${gateCheck.failed.gate} - ${gateCheck.failed.reason}`,
      });
      continue;
    }

    await persistCandidateState(candidatePath, {
      preliminary_score: preliminaryScore,
      final_score: finalScore,
      score: finalScore,
      scoring_confidence: 'full-text',
      qualification_status: finalScore >= FULL_QUALIFY_THRESHOLD ? 'qualified' : 'rejected',
      document_status: 'full-text',
      document_manifest_path: path.join(resourcesDir, '_document-manifest.json'),
      status: 'scored',
      scored_date: runDate,
    });

    if (finalScore < FULL_QUALIFY_THRESHOLD) {
      manualReview.push({
        displayTitle,
        preliminaryScoreDisplay: String(preliminaryScore),
        qualification_status: 'rejected',
        document_status: 'full-text',
        reason: `Final score ${finalScore} is below the pursue threshold.`,
      });
      continue;
    }

    const hubspotDuplicate = await hasHubSpotDuplicate(title, issuer, summary, await getHubspotIndex()).catch(() => false);
    if (hubspotDuplicate) {
      await persistCandidateState(candidatePath, {
        qualification_status: 'rejected',
      });
      manualReview.push({
        displayTitle,
        preliminaryScoreDisplay: String(preliminaryScore),
        qualification_status: 'rejected',
        document_status: 'full-text',
        reason: 'A HubSpot RFP record already exists for this opportunity.',
      });
      continue;
    }

    process.stderr.write(`[weekly-rfp] qualify ${candidatePaths.length ? `${i + 1}/${candidatePaths.length}` : i + 1}: ${displayTitle}\n`);
    const driveFolder = await withTimeout(
      ensureRfpDriveFolder(issuer, title, slug),
      60000,
      `Drive folder creation for ${displayTitle}`,
    ).catch((error) => ({
      created: false,
      folderId: '',
      folderUrl: '',
      reason: error?.message || 'Could not resolve destination folder.',
    }));
    if (!driveFolder.folderId) {
      process.stderr.write(`[weekly-rfp] drive folder skipped for ${displayTitle}: ${driveFolder.reason || 'unknown reason'}\n`);
    } else {
      process.stderr.write(`[weekly-rfp] drive folder ready for ${displayTitle}\n`);
    }
    const mirrorStatus = driveFolder.folderId
      ? await withTimeout(
        mirrorLocalResourcesToDrive(driveFolder.folderId, slug),
        60000,
        `Drive mirroring for ${displayTitle}`,
      ).catch((error) => ({
        mirrored: 0,
        reason: error?.message || 'Drive mirroring failed.',
      }))
      : { mirrored: 0, reason: 'Drive folder missing.' };
    process.stderr.write(`[weekly-rfp] drive mirror for ${displayTitle}: ${mirrorStatus.mirrored || 0} file(s)\n`);

    qualified.push({
      id: slug,
      title,
      issuer,
      displayTitle,
      driveUrl: driveFolder.folderUrl || portalUrl || sourceUrl,
      portalUrl: portalUrl || sourceUrl,
      amount: amountText || amountValue,
      deadlines,
      summary: extractSummary(qualificationText) || summary,
      scoreNarrative: buildQualificationNarrative(finalScore, scoringBundle.reasons),
      whyFits,
      blockers,
      landscapeSummary: scoringBundle.landscape.summary,
      capabilitySummary: scoringBundle.capability.summary,
      mirrorStatus,
    });
  }
  process.stderr.write(`[weekly-rfp] qualification complete: ${qualified.length} qualified, ${manualReview.length} manual review\n`);

  const reportMarkdown = [
    `# New qualified RFP's for pursue decision - week ${weekNumber(new Date(runDate))}`,
    '',
    `- Run date: ${runDate}`,
    `- Qualified RFPs: ${qualified.length}`,
    `- Manual review: ${manualReview.length}`,
    '',
    ...qualified.flatMap((item) => [
      `## ${item.displayTitle}`,
      item.issuer ? `- Requesting party: ${item.issuer}` : null,
      `- Documentation link: [Open documentation](${item.driveUrl})`,
      item.portalUrl ? `- Portal source: [Open HigherGov listing](${item.portalUrl})` : null,
      `- Contract value: ${item.amount}`,
      `- Qualification: ${item.scoreNarrative}`,
      `- Key dates: ${item.deadlines.length ? item.deadlines.map((deadline) => `${deadline.label}: ${deadline.date}`).join(' | ') : 'no future deadline found'}`,
      `- What the RFP is asking for: ${item.summary || 'not enough text extracted to summarize clearly.'}`,
      `- Why Seamgen fits: ${item.whyFits}`,
      `- Potential blockers: ${item.blockers.length ? item.blockers.map((blocker) => formatBlocker(blocker)).filter(Boolean).join('; ') : 'none detected'}`,
      '',
    ].filter(Boolean)),
    '## Manual review',
    '',
    ...manualReview.flatMap((item) => [
      `### ${item.displayTitle}`,
      `- Preliminary score: ${item.preliminaryScoreDisplay}`,
      `- Qualification status: ${item.qualification_status}`,
      `- Document status: ${item.document_status}`,
      `- Why it paused: ${item.reason}`,
      '',
    ].filter(Boolean)),
    '---',
    'This email is generated by ISA, the AI assistant of Seamgen. ISA has been fed and trained with relevant knowledge, and the content and expressions are supervised. For personal contact, you can always call or email me.',
  ].join('\n');

  const reportHtml = buildEmailHtml(runDate, qualified, manualReview, intake);
  process.stderr.write(`[weekly-rfp] rendering report and sending mail\n`);
  await fs.mkdir(REPORT_DIR, { recursive: true });
  const reportMarkdownPath = path.join(REPORT_DIR, `${runDate}.md`);
  const reportMarkdownLatestPath = path.join(REPORT_DIR, 'latest.md');
  const reportHtmlPath = path.join(REPORT_DIR, `${runDate}.html`);
  const reportHtmlLatestPath = path.join(REPORT_DIR, 'latest.html');
  await fs.writeFile(reportMarkdownPath, reportMarkdown, 'utf8');
  await fs.writeFile(reportMarkdownLatestPath, reportMarkdown, 'utf8');
  await fs.writeFile(reportHtmlPath, reportHtml, 'utf8');
  await fs.writeFile(reportHtmlLatestPath, reportHtml, 'utf8');

  const sendResult = await runJson('gog', [
    '-a',
    'isa@seamgen.com',
    'gmail',
    'send',
    '--from',
    REPORT_FROM,
    '--to',
    REPORT_TO,
    '--subject',
    `New qualified RFP's for pursue decision - week ${weekNumber(new Date(runDate))}`,
    '--body-html-file',
    reportHtmlPath,
    '--no-input',
  ], { timeoutMs: 120000 });

  let telegramStatus = 'skipped';
  let telegramError = '';
  if (!NO_TELEGRAM) {
    const telegramMessage = buildTelegramSummary(runDate, intake, qualified.length, manualReview.length);
    const telegramResult = await runJson('openclaw', [
      'message',
      'send',
      '--channel',
      'telegram',
      '--target',
      TELEGRAM_TARGET,
      '--message',
      telegramMessage,
    ], { timeoutMs: 45000 }).then(() => ({ exitCode: 0 })).catch((error) => ({
      exitCode: typeof error?.exitCode === 'number' ? error.exitCode : 1,
      stdout: error?.stdout || '',
      stderr: error?.stderr || error?.message || 'unknown Telegram error',
    }));
    telegramStatus = telegramResult.exitCode === 0 ? 'sent' : `failed (${telegramResult.exitCode})`;
    telegramError = telegramResult.exitCode === 0 ? '' : normalizeText(telegramResult.stderr || telegramResult.stdout || 'unknown Telegram error');
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        runDate,
        qualifiedRfps: qualified.length,
        manualReviewRfps: manualReview.length,
        reportDir: REPORT_DIR,
        emailStatus: 'sent',
        telegramStatus,
        telegramTarget: NO_TELEGRAM ? '' : TELEGRAM_TARGET,
        telegramError: telegramError || undefined,
        gmailResponse: sendResult.slice(0, 200),
      },
      null,
      2,
    )}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(
    `${JSON.stringify(
      {
        name: error?.name || 'Error',
        message: error?.message || String(error),
      },
      null,
      2,
    )}\n`,
  );
  process.exitCode = 1;
});
