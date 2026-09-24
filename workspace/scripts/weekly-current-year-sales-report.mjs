import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getHubSpotLeadSnapshot } from './hubspot-leads-sidecar.mjs';
const WORKSPACE = process.env.WORKSPACE_DIR || '/home/azureuser/.openclaw/workspace';
const HUBSPOT_CREDS = '/home/azureuser/.openclaw/credentials/hubspot-mcp.json';
const HUBSPOT_URL = 'https://mcp.hubspot.com';
const REPORT_TITLE = 'Weekly 12 Month Rolling Sales Report';
const REPORT_RECIPIENT = process.env.REPORT_RECIPIENT || 'sales@seamgen.com';
const REPORT_FROM = process.env.REPORT_FROM || 'isa@seamgen.com';
const TELEGRAM_TARGET = process.env.TELEGRAM_TARGET || '-1003890997073';
const TELEGRAM_TARGETS = (process.env.TELEGRAM_TARGETS || TELEGRAM_TARGET)
  .split(/[,\s]+/)
  .map((value) => value.trim())
  .filter(Boolean);
const NO_TELEGRAM = ['1', 'true', 'yes'].includes(String(process.env.NO_TELEGRAM || '').toLowerCase());
const HUBSPOT_CALL_TIMEOUT_MS = Number(process.env.HUBSPOT_CALL_TIMEOUT_MS || 60000);
const CURRENT_YEAR = new Date().getUTCFullYear();
const TWELVE_MONTHS_AGO = new Date();
TWELVE_MONTHS_AGO.setUTCMonth(TWELVE_MONTHS_AGO.getUTCMonth() - 12);
const DEAL_WINDOW_START = TWELVE_MONTHS_AGO.toISOString().slice(0, 10);
const REPORT_PIPELINES = new Map([
  ['2487085796', 'Sales Pipeline'],
  ['2487569084', 'RFP Pipeline'],
]);
const REPORT_STAGE_ORDER = new Map([
  [
    '2487085796',
    [
      /^Opportunity$/i,
      /^Validation$/i,
      /^Proposal/i,
      /^Negotiation/i,
      /^SoW signed \(won\)$/i,
      /^Closed Won$/i,
      /^Declined \(lost\)$/i,
      /^Closed Lost$/i,
      /^Abandoned$/i,
    ],
  ],
  [
    '2487569084',
    [
      /^Sent RFP$/i,
      /^Qualified RFP$/i,
      /^RFP participated$/i,
      /^Awarded \/ Contract Signed \(won\)$/i,
      /^Closed Won$/i,
      /^Rejected \/ Abandoned\(lost\)$/i,
      /^Closed abandoned$/i,
      /^Closed Lost$/i,
    ],
  ],
]);
const REPORT_STAGE_RECENT_ACTIVITY_REQUIRED = new Set([
  'SoW signed (won)',
  'Declined (lost)',
  'Awarded / Contract Signed (won)',
  'Rejected / Abandoned (lost)',
]);
const REPORT_DEAL_ACTIVITY_WINDOW_DAYS = 7;

const reportDir = path.join(WORKSPACE, 'reports', 'weekly-current-year-sales-report');

function asText(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(asText).filter(Boolean).join(', ');
  if (typeof value === 'object') {
    return asText(
      value.label ||
        value.name ||
        value.displayName ||
        value.value ||
        value.text ||
        value.title ||
        value.domain ||
        value.address ||
        '',
    );
  }
  return String(value);
}

function cleanLabel(value = '') {
  return asText(value).replace(/\u000b/g, ' ').replace(/\s+/g, ' ').trim();
}

function isInternalMailboxText(text = '') {
  return /@seamgen\.com|@itility\.nl|@youtility\.nl/i.test(String(text || ''));
}

function hasExternalMailboxAddress(text = '') {
  const matches = String(text || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  return matches.some((email) => !isInternalMailboxText(email));
}

function compactStageLabel(value = '') {
  const text = cleanLabel(value);
  if (!text) return '';
  return text
    .replace(/^SoW signed \(won\)$/i, 'Won')
    .replace(/^Declined \(lost\)$/i, 'Lost')
    .replace(/^Closed Won$/i, 'Won')
    .replace(/^Closed Lost$/i, 'Lost')
    .replace(/^Closed abandoned$/i, 'Lost')
    .replace(/Closure\s*\/\s*Disqualified/i, 'Disqualified')
    .replace(/^Prospecting pipeline \/ /i, '')
    .replace(/^Lead pipeline \/ /i, '');
}

function formatAmount(value = '') {
  const text = cleanLabel(value);
  if (!text) return 'Unassigned';
  const numeric = Number(String(text).replace(/[^0-9.-]/g, ''));
  if (!Number.isFinite(numeric)) return text;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(numeric);
}

function displayCrmLabel(value = '') {
  return cleanLabel(value).replace(/\s*\(\d+\)\s*$/g, '').trim();
}

function pipelineDisplayName(pipelineId = '', pipelineLabel = '') {
  const cleanPipelineId = cleanLabel(pipelineId);
  const cleanPipelineLabel = displayCrmLabel(pipelineLabel);
  return REPORT_PIPELINES.get(cleanPipelineId) || cleanPipelineLabel || cleanPipelineId || 'Unassigned';
}

function extractPipelineId(value = '') {
  const text = cleanLabel(value);
  if (!text) return '';
  const match = /\((\d+)\)\s*$/.exec(text);
  if (match) return match[1];
  if (/^\d+$/.test(text)) return text;
  return text;
}

function escapeHtml(text = '') {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function decodeHtml(text = '') {
  return text
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&apos;', "'")
    .replaceAll('&nbsp;', ' ');
}

function stripTags(text = '') {
  return decodeHtml(text.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isWithinDays(date, days, end = new Date()) {
  if (!date) return false;
  const startTime = date.getTime();
  const endTime = end.getTime();
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) return false;
  return endTime - startTime <= days * 24 * 60 * 60 * 1000;
}

function daysBetween(start, end = new Date()) {
  if (!start) return null;
  return Math.floor((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
}

function businessDaysBetween(start, end = new Date()) {
  if (!start) return null;
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return null;

  const current = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate()));
  const final = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate()));
  let days = 0;

  while (current < final) {
    current.setUTCDate(current.getUTCDate() + 1);
    const weekday = current.getUTCDay();
    if (weekday !== 0 && weekday !== 6) days += 1;
  }

  return days;
}

function monthsBetween(start, end = new Date()) {
  if (!start) return null;
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return null;

  let months = (endDate.getUTCFullYear() - startDate.getUTCFullYear()) * 12 + (endDate.getUTCMonth() - startDate.getUTCMonth());
  if (endDate.getUTCDate() < startDate.getUTCDate()) months -= 1;
  return months;
}

function addMonthsUtc(start, months) {
  const date = new Date(start);
  if (Number.isNaN(date.getTime()) || !Number.isFinite(months)) return null;
  const clone = new Date(date);
  const originalDay = clone.getUTCDate();
  clone.setUTCMonth(clone.getUTCMonth() + months);
  if (clone.getUTCDate() !== originalDay) {
    clone.setUTCDate(0);
  }
  return clone;
}

function mostRecentDate(...values) {
  const dates = values.map(parseDate).filter(Boolean);
  if (!dates.length) return null;
  return dates.sort((a, b) => b.getTime() - a.getTime())[0];
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run(cmd, args, options = {}) {
  return await new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd: WORKSPACE,
      env: { ...process.env, ...(options.env || {}) },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let timeoutHandle = null;
    let timedOut = false;

    if (Number.isFinite(options.timeoutMs) && options.timeoutMs > 0) {
      timeoutHandle = setTimeout(() => {
        timedOut = true;
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
      if (stdout.length > 20 * 1024 * 1024) stdout = stdout.slice(-20 * 1024 * 1024);
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
      if (stderr.length > 20 * 1024 * 1024) stderr = stderr.slice(-20 * 1024 * 1024);
    });

    child.on('error', (error) => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      resolve({
        stdout,
        stderr: stderr || error.message || '',
        exitCode: timedOut ? 124 : 1,
      });
    });

    child.on('close', (exitCode) => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      resolve({
        stdout,
        stderr,
        exitCode: timedOut ? 124 : typeof exitCode === 'number' ? exitCode : 1,
      });
    });

    child.stdin.end(options.input ?? '');
  });
}

async function runJson(cmd, args, options = {}) {
  const result = await run(cmd, args, options);
  const text = result.stdout.trim();
  if (!text) {
    throw new Error(`Empty JSON output from ${cmd} ${args.join(' ')}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`Failed to parse JSON from ${cmd}: ${error.message}\n${text.slice(0, 500)}`);
  }

  if (result.exitCode !== 0) {
    const err = new Error(result.stderr.trim() || `${cmd} exited with ${result.exitCode}`);
    err.result = parsed;
    err.exitCode = result.exitCode;
    throw err;
  }

  return parsed;
}

function parseDatasetTsv(text = '') {
  const marker = 'Dataset TSV:\n';
  const start = text.indexOf(marker);
  if (start === -1) return [];

  const tail = text.slice(start + marker.length);
  const end = tail.indexOf('\n\nShowing ');
  const block = (end === -1 ? tail : tail.slice(0, end)).trim();
  if (!block) return [];

  const lines = block.split('\n').filter(Boolean);
  if (lines.length < 2) return [];

  const headers = lines[0].split('\t').map((cell) => {
    const match = /^(.*)\s+\[([^\]]+)\]$/.exec(cell.trim());
    return {
      raw: cell.trim(),
      label: match?.[1]?.trim() || cell.trim(),
      prop: match?.[2]?.trim() || cell.trim(),
    };
  });

  return lines.slice(1).map((line) => {
    const values = line.split('\t');
    const row = { columns: {}, props: {}, labels: {} };
    headers.forEach((header, index) => {
      const value = values[index] ?? '';
      row.columns[header.raw] = value;
      row.props[header.prop] = value;
      row.labels[header.label] = value;
    });
    return row;
  });
}

async function hubspotCall(toolName, toolArgs) {
  const args = [
    'tools',
    'call',
    '--url',
    HUBSPOT_URL,
    '--credentials-file',
    HUBSPOT_CREDS,
    '--tool-name',
    toolName,
    '--tool-args',
    JSON.stringify(toolArgs),
    '--timeout',
    String(HUBSPOT_CALL_TIMEOUT_MS),
  ];

  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const result = await runJson('mcpjam', args);
      const content = result.content?.[0]?.text;
      if (!content) {
        throw new Error(`HubSpot tool ${toolName} returned no text content`);
      }
      return JSON.parse(content);
    } catch (error) {
      lastError = error;
      const message = error?.message || String(error);
      const retryable =
        message.includes('Empty JSON output') ||
        message.includes('returned no text content') ||
        message.includes('Unexpected end of JSON input') ||
        message.includes('Failed to parse JSON');
      if (!retryable || attempt === 3) {
        throw error;
      }
      await sleep(1000 * attempt);
    }
  }

  throw lastError || new Error(`HubSpot tool ${toolName} failed`);
}

async function currentYearDealRows() {
  const response = await hubspotCall('query_crm_data', {
    sql: `SELECT COMPANY.name, COMPANY.hs_object_id, dealname, pipeline, dealstage, hubspot_owner_id, hs_lastmodifieddate, closedate, amount FROM DEAL WHERE createdate >= '${DEAL_WINDOW_START}' AND pipeline IN ('2487085796', '2487569084') ORDER BY pipeline, dealstage, hs_lastmodifieddate DESC LIMIT 500`,
    verbosityLevel: 'LOW',
    chatInsights: {
      userIntent: 'Build a weekly current-year sales and RFP report with pipeline and stage counts.',
      satisfaction: 'NEUTRAL',
    },
  });

  const text = response.results?.[0]?.content || '';
  return parseDatasetTsv(text);
}

function dealFromRow(row) {
  const pipelineValue = row.props['pipeline'] || row.labels['Pipeline'] || '';
  const pipelineId = extractPipelineId(pipelineValue);
  const lastActivityDate =
    cleanLabel(
      row.labels['Last Activity Date'] ||
        row.labels['Last activity date'] ||
        row.labels['Deal [hs_lastactivitydate]'] ||
        row.props['Deal [hs_lastactivitydate]'] ||
        row.props['hs_lastactivitydate'] ||
        '',
    ) || '';
  return {
    companyName: displayCrmLabel(row.labels['Company name'] || row.labels['Company'] || 'Unassigned'),
    companyId: cleanLabel(row.labels['Company'] || row.props['Company [hs_object_id]'] || ''),
    dealName: displayCrmLabel(row.labels['Deal Name'] || row.labels['Deal name'] || 'Unassigned'),
    pipelineId,
    pipeline: pipelineDisplayName(pipelineId, pipelineValue),
    stage: displayCrmLabel(row.labels['Deal Stage'] || 'Unassigned'),
    ownerId: cleanLabel(row.labels['Deal owner'] || row.props['Deal [hubspot_owner_id]'] || ''),
    stageUpdated: displayCrmLabel(row.labels['Last Modified Date'] || ''),
    lastActivityDate,
    closeDate: displayCrmLabel(row.labels['Close Date'] || ''),
    amount: displayCrmLabel(row.labels['Amount'] || ''),
    dealId: cleanLabel(row.labels['Deal'] || ''),
  };
}

function isRfpPipelineDeal(deal = {}) {
  return String(deal?.pipelineId || '') === '2487569084';
}

function extractRfpImportantDates(text = '') {
  const lines = String(text || '')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => cleanLabel(line))
    .filter(Boolean);

  const patterns = [
    {
      key: 'qaSubmissionDate',
      patterns: [
        /\bq&a\s+(?:submission date|submission|due date|deadline)\b\s*[:\-]?\s*(.+)$/i,
        /\bquestions?\s+(?:due|deadline|submission date)\b\s*[:\-]?\s*(.+)$/i,
      ],
    },
    {
      key: 'qaReturnDate',
      patterns: [
        /\bq&a\s+(?:return date|return|answers? due|responses? due)\b\s*[:\-]?\s*(.+)$/i,
        /\banswers?\s+(?:due|return date|deadline)\b\s*[:\-]?\s*(.+)$/i,
        /\bresponses?\s+(?:due|return date|deadline)\b\s*[:\-]?\s*(.+)$/i,
      ],
    },
    {
      key: 'submissionDueDay',
      patterns: [
        /\bdue day for submission\b\s*[:\-]?\s*(.+)$/i,
        /\bsubmission\s+due\s+date\b\s*[:\-]?\s*(.+)$/i,
        /\bsubmission\s+deadline\b\s*[:\-]?\s*(.+)$/i,
        /\bproposal\s+due\s+date\b\s*[:\-]?\s*(.+)$/i,
        /\bproposal\s+deadline\b\s*[:\-]?\s*(.+)$/i,
        /\bresponse\s+due\s+date\b\s*[:\-]?\s*(.+)$/i,
        /\bresponse\s+deadline\b\s*[:\-]?\s*(.+)$/i,
      ],
    },
  ];

  const result = {
    qaSubmissionDate: '',
    qaReturnDate: '',
    submissionDueDay: '',
  };

  for (const item of patterns) {
    for (const line of lines) {
      for (const pattern of item.patterns) {
        const match = line.match(pattern);
        if (match?.[1]) {
          result[item.key] = cleanLabel(match[1]).replace(/[.;,]+$/, '').trim();
          break;
        }
      }
      if (result[item.key]) break;
    }
  }

  return result;
}

function noteBodyFromSearchResult(note = {}) {
  return decodeHtml(asText(note?.properties?.hs_note_body || note?.properties?.body || note?.properties?.content || ''));
}

function scoreRfpDateNote(body = '', dealName = '', companyName = '') {
  const text = cleanLabel(body).toLowerCase();
  if (!text) return 0;
  let score = 0;
  const normalizedDealName = cleanLabel(dealName).toLowerCase();
  const normalizedCompanyName = cleanLabel(companyName).toLowerCase();
  if (normalizedDealName && text.includes(normalizedDealName)) score += 10;
  if (normalizedCompanyName && text.includes(normalizedCompanyName)) score += 4;
  if (/\bq&a\b/.test(text)) score += 3;
  if (/\bsubmission due date\b/.test(text)) score += 3;
  if (/\bq&a submission date\b/.test(text)) score += 3;
  if (/\bq&a return date\b/.test(text)) score += 3;
  if (/\bdue day for submission\b/.test(text)) score += 3;
  if (/\bquestions?\b/.test(text)) score += 1;
  if (/\bdeadline\b/.test(text)) score += 1;
  if (/\bclosed\b/.test(text)) score += 1;
  return score;
}

async function loadRfpDatesByDealId(deals = []) {
  const rfpDeals = (deals || []).filter(isRfpPipelineDeal).filter((deal) => cleanLabel(deal?.dealId || '').length);
  if (!rfpDeals.length) return new Map();

  const result = new Map();
  for (const deal of rfpDeals) {
    const dealId = cleanLabel(deal.dealId || '');
    if (!dealId || result.has(dealId)) continue;

    const searchContexts = [
      {
        associatedWith: [{ objectType: 'deals', operator: 'EQUAL', objectIdValues: [Number(dealId)] }],
      },
      {
        query: cleanLabel([deal.dealName, deal.companyName, dealId].filter(Boolean).join(' ')),
      },
    ];

    const noteMap = new Map();
    for (const searchContext of searchContexts) {
      const response = await hubspotCall('search_crm_objects', {
        objectType: 'notes',
        properties: ['hs_object_id', 'hs_note_body', 'hs_timestamp', 'hs_lastmodifieddate', 'createdate'],
        limit: 20,
        sort: [{ propertyName: 'hs_lastmodifieddate', direction: 'DESCENDING' }],
        ...(searchContext.query ? { query: searchContext.query } : {}),
        ...(searchContext.associatedWith ? { associatedWith: searchContext.associatedWith } : {}),
        chatInsights: {
          userIntent: 'Find the latest RFP note dates for a weekly sales report.',
          satisfaction: 'NEUTRAL',
        },
      });
      for (const note of response.results || []) {
        const noteId = cleanLabel(note?.id || note?.properties?.hs_object_id || '');
        if (!noteId || noteMap.has(noteId)) continue;
        noteMap.set(noteId, note);
      }
    }

    const notes = [...noteMap.values()]
      .map((note) => {
        const body = noteBodyFromSearchResult(note);
        const normalizedBody = body.toLowerCase();
        const normalizedDealName = cleanLabel(deal.dealName || '').toLowerCase();
        const normalizedCompanyName = cleanLabel(deal.companyName || '').toLowerCase();
        return {
          note,
          body,
          exactDealMatch: normalizedDealName ? normalizedBody.includes(normalizedDealName) : false,
          exactCompanyMatch: normalizedCompanyName ? normalizedBody.includes(normalizedCompanyName) : false,
        };
      })
      .sort((a, b) => {
        const aScore = scoreRfpDateNote(a.body, deal.dealName, deal.companyName);
        const bScore = scoreRfpDateNote(b.body, deal.dealName, deal.companyName);
        if (a.exactDealMatch !== b.exactDealMatch) return a.exactDealMatch ? -1 : 1;
        if (a.exactCompanyMatch !== b.exactCompanyMatch) return a.exactCompanyMatch ? -1 : 1;
        if (aScore !== bScore) return bScore - aScore;
        const aDate = parseDate(a.note?.properties?.hs_lastmodifieddate || a.note?.properties?.hs_timestamp || a.note?.properties?.createdate || '');
        const bDate = parseDate(b.note?.properties?.hs_lastmodifieddate || b.note?.properties?.hs_timestamp || b.note?.properties?.createdate || '');
        return (bDate?.getTime() || 0) - (aDate?.getTime() || 0);
      });

    let extracted = null;
    for (const item of notes) {
      const dates = extractRfpImportantDates(item.body);
      const score = scoreRfpDateNote(item.body, deal.dealName, deal.companyName);
      if (score >= 3 && (dates.qaSubmissionDate || dates.qaReturnDate || dates.submissionDueDay)) {
        extracted = dates;
        break;
      }
    }
    result.set(dealId, extracted || {
      qaSubmissionDate: '',
      qaReturnDate: '',
      submissionDueDay: '',
    });
  }

  return result;
}

function requiresRecentActivityCheck(deal = {}) {
  return REPORT_STAGE_RECENT_ACTIVITY_REQUIRED.has(cleanLabel(deal?.stage || ''));
}

function dealLastModifiedDate(deal = {}) {
  return parseDate(deal?.stageUpdated || deal?.lastActivityDate || '');
}

async function filterDealsByRecentActivity(deals = []) {
  const filtered = [];
  for (const deal of deals || []) {
    if (!requiresRecentActivityCheck(deal)) {
      filtered.push(deal);
      continue;
    }

    const activityDate = dealLastModifiedDate(deal);
    if (activityDate) {
      deal.lastActivityDate = activityDate.toISOString();
    }

    if (isWithinDays(activityDate, REPORT_DEAL_ACTIVITY_WINDOW_DAYS)) {
      filtered.push(deal);
    }
  }
  return filtered;
}

function groupDeals(deals) {
  const pipelines = new Map();
  for (const deal of deals) {
    const pipelineKey = deal.pipelineId || deal.pipeline;
    if (!pipelines.has(pipelineKey)) pipelines.set(pipelineKey, new Map());
    const companies = pipelines.get(pipelineKey);
    const companyKey = deal.companyId || deal.companyName;
    if (!companies.has(companyKey)) {
      companies.set(companyKey, {
        companyName: deal.companyName || 'Unassigned',
        companyId: deal.companyId || '',
        deals: [],
      });
    }
    companies.get(companyKey).deals.push(deal);
  }
  return pipelines;
}

function pipelineStats(deals) {
  const stats = new Map();
  for (const deal of deals) {
    const pipelineKey = deal.pipelineId || deal.pipeline;
    if (!stats.has(pipelineKey)) {
      stats.set(pipelineKey, { total: 0, stages: new Map() });
    }
    const bucket = stats.get(pipelineKey);
    bucket.total += 1;
    bucket.stages.set(deal.stage, (bucket.stages.get(deal.stage) || 0) + 1);
  }
  return stats;
}

function orderedPipelineEntries(groupedDeals) {
  const ordered = [];
  for (const pipelineId of REPORT_PIPELINES.keys()) {
    if (groupedDeals.has(pipelineId)) {
      ordered.push([pipelineId, groupedDeals.get(pipelineId)]);
    }
  }
  for (const [pipelineId, companies] of groupedDeals.entries()) {
    if (!REPORT_PIPELINES.has(pipelineId)) ordered.push([pipelineId, companies]);
  }
  return ordered;
}

function stageSortKey(deal) {
  const pipelineId = cleanLabel(deal?.pipelineId || '');
  const stage = cleanLabel(deal?.stage || '');
  const order = REPORT_STAGE_ORDER.get(pipelineId) || [];
  const matchedIndex = order.findIndex((pattern) => pattern.test(stage));
  if (matchedIndex !== -1) return matchedIndex;

  if (/(won|signed)/i.test(stage)) return 800;
  if (/(lost|abandoned|declined|rejected)/i.test(stage)) return 900;
  return 500;
}

function compareDealsByStage(a, b) {
  const aRank = stageSortKey(a);
  const bRank = stageSortKey(b);
  if (aRank !== bRank) return aRank - bRank;

  const aStage = cleanLabel(a?.stage || '');
  const bStage = cleanLabel(b?.stage || '');
  const stageCompare = aStage.localeCompare(bStage);
  if (stageCompare !== 0) return stageCompare;

  const aDate = parseDate(a?.stageUpdated || '');
  const bDate = parseDate(b?.stageUpdated || '');
  const dateCompare = (bDate?.getTime() || 0) - (aDate?.getTime() || 0);
  if (dateCompare !== 0) return dateCompare;

  const aName = cleanLabel(a?.dealName || '');
  const bName = cleanLabel(b?.dealName || '');
  return aName.localeCompare(bName);
}

function sortGroupedDeals(groupedDeals) {
  const result = new Map();
  for (const [pipelineId, companies] of groupedDeals.entries()) {
    const sortedCompanies = [...companies.entries()].sort(([, a], [, b]) => {
      const aFirst = [...a.deals].sort(compareDealsByStage)[0];
      const bFirst = [...b.deals].sort(compareDealsByStage)[0];
      if (!aFirst && !bFirst) {
        return cleanLabel(a.companyName || '').localeCompare(cleanLabel(b.companyName || ''));
      }
      if (!aFirst) return 1;
      if (!bFirst) return -1;
      const firstCompare = compareDealsByStage(aFirst, bFirst);
      if (firstCompare !== 0) return firstCompare;
      return cleanLabel(a.companyName || '').localeCompare(cleanLabel(b.companyName || ''));
    });

    const sortedCompaniesMap = new Map();
    for (const [companyKey, company] of sortedCompanies) {
      sortedCompaniesMap.set(companyKey, {
        ...company,
        deals: [...company.deals].sort(compareDealsByStage),
      });
    }
    result.set(pipelineId, sortedCompaniesMap);
  }
  return result;
}

function leadSnapshotSummary(snapshot) {
  if (!snapshot) return 'Lead data is not shown yet because the API sidecar is not configured.';

  const pipelineBits = Object.entries(snapshot.byPipeline || {})
    .map(([pipeline, count]) => `${pipeline}: ${count} leads`)
    .sort();
  const stageBits = Object.entries(snapshot.byStage || {})
    .map(([key, count]) => {
      const [, stage] = key.split('::');
      return `${compactStageLabel(stage)}: ${count}`;
    })
    .sort();

  const lines = [];
  if (pipelineBits.length) {
    lines.push(`${pipelineBits.join(', ')}${stageBits.length ? ` (${stageBits.slice(0, 8).join(', ')}${stageBits.length > 8 ? ', ...' : ''})` : ''}.`);
  } else {
    lines.push('No lead records found in the configured prospecting pipeline.');
  }
  return lines.join(' ');
}

function summarizeCounts(map = new Map()) {
  return [...map.entries()]
    .map(([name, count]) => `${compactStageLabel(name)}: ${count}`)
    .join(', ');
}

async function loadOwnerDirectory() {
  const response = await hubspotCall('search_crm_objects', {
    objectType: 'USER',
    properties: ['hs_searchable_calculated_name', 'hs_given_name', 'hs_family_name', 'hs_email', 'hubspot_owner_id'],
    limit: 100,
    chatInsights: {
      userIntent: 'Load HubSpot owner names for a weekly sales report.',
      satisfaction: 'NEUTRAL',
    },
  });

  const directory = new Map();
  for (const user of response.results || []) {
    const ownerId = cleanLabel(user?.properties?.hubspot_owner_id || user?.properties?.hs_internal_user_id || user?.id || '');
    if (!ownerId) continue;
    const displayName =
      displayCrmLabel(user?.displayName || user?.properties?.hs_searchable_calculated_name || '') ||
      [user?.properties?.hs_given_name, user?.properties?.hs_family_name].filter(Boolean).join(' ').trim() ||
      displayCrmLabel(user?.properties?.hs_email || '') ||
      ownerId;
    directory.set(ownerId, displayName);
  }
  return directory;
}

function ownerDisplayName(ownerId, ownerDirectory = new Map()) {
  const cleanOwnerId = cleanLabel(ownerId || '');
  if (!cleanOwnerId) return 'Unassigned';
  return ownerDirectory.get(cleanOwnerId) || 'Unknown owner';
}

function parseLeadTiming(timing = '') {
  const text = asText(timing || '').toLowerCase().trim().replace(/\s+/g, ' ');
  if (!text) return null;

  const match = text.match(/^(\d+)\s+(business days?|days?|months?)$/i);
  if (!match) return null;

  const amount = Number.parseInt(match[1], 10);
  if (!Number.isFinite(amount)) return null;

  const unitText = match[2].toLowerCase();
  if (unitText.startsWith('business day')) return { amount, unit: 'business-days' };
  if (unitText.startsWith('day')) return { amount, unit: 'days' };
  if (unitText.startsWith('month')) return { amount, unit: 'months' };
  return null;
}

function formatLeadTimingDisplay(record, now = new Date()) {
  const followUp = record.followUp || {};
  const timing = asText(followUp.timing || 'Review manually');
  const parsedTiming = parseLeadTiming(timing);
  if (!parsedTiming) return timing;

  const referenceDate =
    parseDate(record.lastContactedDate || '') ||
    parseDate(record.lastModified || '') ||
    parseDate(record.firstOutreachDate || '') ||
    parseDate(record.createdAt || '');
  if (!referenceDate) return timing;

  const elapsed =
    parsedTiming.unit === 'business-days'
      ? businessDaysBetween(referenceDate, now)
      : parsedTiming.unit === 'days'
        ? daysBetween(referenceDate, now)
        : parsedTiming.unit === 'months'
          ? monthsBetween(referenceDate, now)
          : null;
  if (!Number.isFinite(elapsed)) return timing;

  const overdue = elapsed - parsedTiming.amount;
  if (overdue > 0) {
    const unitLabel =
      parsedTiming.unit === 'business-days'
        ? overdue === 1
          ? 'business day'
          : 'business days'
        : parsedTiming.unit === 'days'
          ? overdue === 1
            ? 'day'
            : 'days'
          : overdue === 1
            ? 'month'
            : 'months';
    return `-${overdue} ${unitLabel}${record.lastContactedDate ? ` (last contact ${record.lastContactedDate.slice(0, 10)})` : ''}`;
  }

  return timing;
}

function leadFollowUpDueWindow(record, now = new Date()) {
  const followUp = record.followUp || {};
  const timing = asText(followUp.timing || 'Review manually');
  const parsedTiming = parseLeadTiming(timing);
  if (!parsedTiming) return { relevant: false, overdue: false, daysUntilDue: null };

  const referenceDate =
    parseDate(record.lastContactedDate || '') ||
    parseDate(record.lastModified || '') ||
    parseDate(record.firstOutreachDate || '') ||
    parseDate(record.createdAt || '');
  if (!referenceDate) return { relevant: false, overdue: false, daysUntilDue: null };

  const elapsed =
    parsedTiming.unit === 'business-days'
      ? businessDaysBetween(referenceDate, now)
      : parsedTiming.unit === 'days'
        ? daysBetween(referenceDate, now)
        : null;

  let daysUntilDue = null;
  if (parsedTiming.unit === 'months') {
    const dueDate = addMonthsUtc(referenceDate, parsedTiming.amount);
    if (!dueDate) return { relevant: false, overdue: false, daysUntilDue: null };
    daysUntilDue = daysBetween(now, dueDate);
  } else {
    if (!Number.isFinite(elapsed)) return { relevant: false, overdue: false, daysUntilDue: null };
    daysUntilDue = parsedTiming.amount - elapsed;
  }

  return {
    relevant: true,
    overdue: daysUntilDue < 0,
    daysUntilDue,
  };
}

function leadFollowUpRecords(snapshot) {
  return (snapshot?.records || [])
    .filter((record) => {
      const window = leadFollowUpDueWindow(record);
      return window.relevant && (window.overdue || window.daysUntilDue <= 7);
    })
    .sort((a, b) => {
      const aKey = `${a.pipeline || ''} ${a.stage || ''} ${a.name || ''}`.toLowerCase();
      const bKey = `${b.pipeline || ''} ${b.stage || ''} ${b.name || ''}`.toLowerCase();
      return aKey.localeCompare(bKey);
    });
}

function disqualifiedLeadRecords(snapshot) {
  return (snapshot?.records || [])
    .filter((record) => {
      const stage = `${record?.stage || ''}`.toLowerCase();
      return !record?.followUp?.relevant && /disqual|closure|closed lost/i.test(stage);
    })
    .sort((a, b) => {
      const aKey = `${a.pipeline || ''} ${a.stage || ''} ${a.name || ''}`.toLowerCase();
      const bKey = `${b.pipeline || ''} ${b.stage || ''} ${b.name || ''}`.toLowerCase();
      return aKey.localeCompare(bKey);
    });
}

function leadFollowUpBlockMarkdown(record) {
  const followUp = record.followUp || {};
  const lines = [
    `### ${record.name || 'Untitled lead'}`,
    `- Owner: ${record.owner || 'Unassigned'}`,
    `- Pipeline: ${record.pipeline || 'Unassigned'}`,
    `- Stage: ${record.stage || 'Unassigned'}`,
    `- Next outreach if no response: ${formatLeadTimingDisplay(record)}`,
  ];
  if (followUp.note) lines.push(`- Note: ${followUp.note}`);
  return lines.join('\n');
}

function leadFollowUpBlockHtml(record) {
  const followUp = record.followUp || {};
  const note = followUp.note ? `<p style="margin:0 0 6px;"><strong>Note:</strong> ${escapeHtml(followUp.note)}</p>` : '';
  return `
    <div style="margin:18px 0 22px;padding:18px 18px 16px;border:1px solid #e5e7eb;border-radius:10px;background:#fafafa;">
      <p style="margin:0 0 6px;"><strong>Lead name:</strong> ${escapeHtml(record.name || 'Untitled lead')}</p>
      <p style="margin:0 0 6px;"><strong>Owner:</strong> ${escapeHtml(record.owner || 'Unassigned')}</p>
      <p style="margin:0 0 6px;"><strong>Pipeline:</strong> ${escapeHtml(record.pipeline || 'Unassigned')}</p>
      <p style="margin:0 0 6px;"><strong>Current stage:</strong> ${escapeHtml(record.stage || 'Unassigned')}</p>
      <p style="margin:0 0 6px;"><strong>Next outreach if no response:</strong> ${escapeHtml(formatLeadTimingDisplay(record))}</p>
      ${note}
    </div>
  `;
}

function disqualifiedLeadBlockMarkdown(record) {
  const lines = [
    `### ${record.name || 'Untitled lead'}`,
    `- Owner: ${record.owner || 'Unassigned'}`,
    `- Pipeline: ${record.pipeline || 'Unassigned'}`,
    `- Stage: ${record.stage || 'Unassigned'}`,
  ];
  return lines.join('\n');
}

function disqualifiedLeadBlockHtml(record) {
  return `
    <div style="margin:14px 0 18px;padding:14px 16px;border:1px solid #e5e7eb;border-radius:10px;background:#fff;">
      <p style="margin:0 0 6px;"><strong>Lead name:</strong> ${escapeHtml(record.name || 'Untitled lead')}</p>
      <p style="margin:0 0 6px;"><strong>Owner:</strong> ${escapeHtml(record.owner || 'Unassigned')}</p>
      <p style="margin:0 0 6px;"><strong>Pipeline:</strong> ${escapeHtml(record.pipeline || 'Unassigned')}</p>
      <p style="margin:0 0 6px;"><strong>Current stage:</strong> ${escapeHtml(record.stage || 'Unassigned')}</p>
    </div>
  `;
}

function toSentence(text = '') {
  const clean = cleanLabel(text);
  if (!clean) return '';
  return /[.!?]$/.test(clean) ? clean : `${clean}.`;
}

function contactName(contact) {
  return [asText(contact?.properties?.firstname), asText(contact?.properties?.lastname)].filter(Boolean).join(' ').trim();
}

function contactFirstName(contact) {
  return asText(contact?.properties?.firstname).trim();
}

function formatContactReference(contact) {
  if (!contact) return '';
  const first = asText(contact.properties?.firstname);
  const last = asText(contact.properties?.lastname);
  const email = asText(contact.properties?.email || contact.properties?.work_email);
  const jobTitle = asText(contact.properties?.jobtitle);
  const name = [first, last].filter(Boolean).join(' ').trim();
  const emailText = email ? `<${email}>` : '';
  const titleText = jobTitle ? `, ${jobTitle}` : '';
  if (!name && !emailText) return '';
  return `${name || 'Proposed contact'} ${emailText}${titleText}`.replace(/\s+/g, ' ').trim();
}

function scoreContact(contact) {
  const title = asText(contact.properties?.jobtitle).toLowerCase();
  const role = asText(contact.properties?.hs_buying_role).toLowerCase();
  const sendDate = parseDate(contact.properties?.hs_email_last_send_date);
  const replyDate = parseDate(contact.properties?.hs_email_last_reply_date);
  const activityDate = mostRecentDate(
    contact.properties?.hs_email_last_send_date,
    contact.properties?.hs_email_last_reply_date,
    contact.properties?.notes_last_contacted,
    contact.properties?.notes_last_updated,
  );
  let score = 0;
  if (asText(contact.properties?.email || contact.properties?.work_email)) score += 100;
  if (replyDate) score += 30;
  if (sendDate) score += 15;
  if (activityDate) score += 10;
  if (role) score += 5;
  if (/(ceo|coo|cfo|cto|founder|president|vp|vice president|director|head|owner|principal|manager|lead|product|engineering|technology|digital|it|operations|marketing|growth)/i.test(title)) {
    score += 20;
  }
  if (/(decision maker|economic buyer|champion)/i.test(role)) {
    score += 15;
  }
  return score;
}

function pickProposedContact(contacts) {
  const candidates = (contacts || []).filter((contact) => asText(contact.properties?.email || contact.properties?.work_email));
  if (!candidates.length) return null;
  return [...candidates].sort((a, b) => scoreContact(b) - scoreContact(a))[0];
}

function pickConversationContact(contacts) {
  const candidates = (contacts || []).filter((contact) => asText(contact.properties?.email || contact.properties?.work_email));
  if (!candidates.length) return null;
  return [...candidates].sort((a, b) => {
    const aDate = mostRecentDate(
      a.properties?.hs_email_last_send_date,
      a.properties?.hs_email_last_reply_date,
      a.properties?.notes_last_contacted,
      a.properties?.notes_last_updated,
    );
    const bDate = mostRecentDate(
      b.properties?.hs_email_last_send_date,
      b.properties?.hs_email_last_reply_date,
      b.properties?.notes_last_contacted,
      b.properties?.notes_last_updated,
    );
    return (bDate?.getTime() || 0) - (aDate?.getTime() || 0);
  })[0];
}

async function contactsForCompany(companyId) {
  if (!companyId) return [];
  const response = await hubspotCall('search_crm_objects', {
    objectType: 'contacts',
    properties: [
      'firstname',
      'lastname',
      'email',
      'work_email',
      'jobtitle',
      'hs_buying_role',
      'hs_email_last_send_date',
      'hs_email_last_reply_date',
      'notes_last_contacted',
      'notes_last_updated',
      'hubspot_owner_id',
    ],
    limit: 20,
    sort: [{ propertyName: 'notes_last_updated', direction: 'DESCENDING' }],
    filterGroups: [
      {
        filters: [{ propertyName: 'email', operator: 'HAS_PROPERTY' }],
        associatedWith: [{ objectType: 'companies', operator: 'EQUAL', objectIdValues: [Number(companyId)] }],
      },
    ],
    chatInsights: {
      userIntent: 'Find contacts associated with the company for a weekly sales report.',
      satisfaction: 'NEUTRAL',
    },
  });
  return response.results || [];
}

function mailboxSearchQueries(companyName, contact) {
  const email = asText(contact?.properties?.email || contact?.properties?.work_email);
  const queries = [];
  if (email) {
    queries.push(`newer_than:365d (from:${email} OR to:${email})`);
  }
  if (companyName) {
    queries.push(`newer_than:365d "${companyName}"`);
  }
  return [...new Set(queries)];
}

function mailboxConversationSummary(message, fallbackLabel = '') {
  if (!message) return '';
  const headers = message.headers || {};
  const subject = asText(headers.subject || '');
  const from = asText(headers.from || '');
  const date = asText(headers.date || message.date || '');
  const bodyText = stripTags(asText(message.body || ''));
  const snippet = stripTags(asText(message.snippet || ''));
  const excerpt = cleanLabel(bodyText || snippet);
  const pieces = [];
  if (subject) pieces.push(`"${subject}"`);
  if (from) pieces.push(`from ${from}`);
  if (date) pieces.push(`on ${date}`);
  const base = pieces.length ? `Mailbox communication ${pieces.join(' ')}.` : fallbackLabel ? `${fallbackLabel}.` : '';
  if (!excerpt) return base;
  return `${base} ${excerpt.length > 180 ? `${excerpt.slice(0, 177)}...` : excerpt}`.trim();
}

function isExternalMailboxMessage(message) {
  const headers = message?.headers || {};
  const senderText = [headers.from, headers.replyTo, headers['reply-to'], headers.sender].map(asText).join(' ');
  const recipientText = [headers.to, headers.cc, headers.bcc, headers['delivered-to'], headers['x-original-to']]
    .map(asText)
    .join(' ');

  // Allow outbound and forwarded customer mails from internal mailboxes when they have external recipients.
  if (hasExternalMailboxAddress(recipientText)) return true;
  return !isInternalMailboxText(senderText);
}

async function recentMailboxConversation(companyName, contact) {
  const queries = mailboxSearchQueries(companyName, contact);
  if (!queries.length) {
    return {
      status: 'not_found',
      summary: 'No recent mailbox thread found.',
      subject: '',
      from: '',
      date: '',
    };
  }

  for (const query of queries) {
    try {
      const search = await runJson(
        'gog',
        ['gmail', 'messages', 'search', query, '--max', '3', '--json', '--no-input'],
        { timeoutMs: 30000 },
      );
      const messages = search.messages || [];
      if (!messages.length) continue;

      const latest = messages[0];
      const full = await runJson('gog', ['gmail', 'get', latest.id, '--json', '--no-input'], { timeoutMs: 30000 });
      if (!isExternalMailboxMessage(full)) {
        continue;
      }
      const summary = mailboxConversationSummary(full, `Latest mailbox thread matched ${query}`);
      return {
        status: 'ok',
        summary,
        subject: asText(full.headers?.subject || latest.subject || ''),
        from: asText(full.headers?.from || latest.from || ''),
        date: asText(full.headers?.date || latest.date || ''),
      };
    } catch {
      continue;
    }
  }

  return {
    status: 'not_found',
    summary: 'No recent mailbox thread found.',
    subject: '',
    from: '',
    date: '',
  };
}

function currentCommunicationSummary(_stepData, mailboxConversation) {
  return mailboxConversation?.summary || 'No recent mailbox thread found.';
}

function dealLabel(deal) {
  const parts = [deal.dealName];
  if (deal.pipeline) parts.push(deal.pipeline);
  if (deal.stage) parts.push(deal.stage);
  if (deal.closeDate) parts.push(`close ${deal.closeDate}`);
  return parts.filter(Boolean).join(' — ');
}

function formatDealStageLine(deal) {
  const updated = deal.stageUpdated ? ` (updated ${deal.stageUpdated})` : '';
  return `${deal.stage || 'Unassigned'}${updated}`;
}

function isClosedDealStage(stage = '') {
  return /(closed won|closed lost|closed abandoned|abandoned|won|lost)/i.test(String(stage || '').trim());
}

function rfpDateBlockMarkdown(rfpDates = {}) {
  return [
    `- Q&A submission date: ${rfpDates.qaSubmissionDate || 'not found'}`,
    `- Q&A return date: ${rfpDates.qaReturnDate || 'not found'}`,
    `- Due day for submission: ${rfpDates.submissionDueDay || 'not found'}`,
  ].join('\n');
}

function rfpDateBlockHtml(rfpDates = {}) {
  return `
    <p style="margin:0 0 6px;"><strong>Q&amp;A submission date:</strong> ${escapeHtml(rfpDates.qaSubmissionDate || 'not found')}</p>
    <p style="margin:0 0 6px;"><strong>Q&amp;A return date:</strong> ${escapeHtml(rfpDates.qaReturnDate || 'not found')}</p>
    <p style="margin:0 0 6px;"><strong>Due day for submission:</strong> ${escapeHtml(rfpDates.submissionDueDay || 'not found')}</p>
  `;
}

function dealBlockMarkdown(pipelineName, companyContext, deal, rfpDates = {}) {
  const lines = [
    `- Pipeline: ${pipelineName}`,
    `- Deal name: ${deal.dealName}`,
    `- Current stage: ${formatDealStageLine(deal)}`,
    `- Deal amount: ${formatAmount(deal.amount)}`,
    `- Recent communication: ${companyContext.communicationSummary}`,
  ];
  if (isRfpPipelineDeal(deal)) {
    lines.push(rfpDateBlockMarkdown(rfpDates));
  }
  return lines.join('\n');
}

function dealBlockHtml(pipelineName, companyContext, deal, rfpDates = {}) {
  return `
    <div style="margin:18px 0 22px;padding:18px 18px 16px;border:1px solid #e5e7eb;border-radius:10px;background:#fafafa;">
      <p style="margin:0 0 6px;"><strong>Pipeline:</strong> ${escapeHtml(pipelineName)}</p>
      <p style="margin:0 0 6px;"><strong>Deal name:</strong> ${escapeHtml(deal.dealName)}</p>
      <p style="margin:0 0 6px;"><strong>Current stage:</strong> ${escapeHtml(formatDealStageLine(deal))}</p>
      <p style="margin:0 0 6px;"><strong>Deal amount:</strong> ${escapeHtml(formatAmount(deal.amount))}</p>
      <p style="margin:0;"><strong>Recent communication:</strong> ${escapeHtml(companyContext.communicationSummary)}</p>
      ${isRfpPipelineDeal(deal) ? rfpDateBlockHtml(rfpDates) : ''}
    </div>
  `;
}

function buildEmailHtml(runDate, facts, pipelineGroups, companyContexts, leadNote, leadSnapshot, rfpDatesByDealId = new Map()) {
  const leadRecords = leadFollowUpRecords(leadSnapshot);
  const disqualifiedRecords = disqualifiedLeadRecords(leadSnapshot);
  const pipelineSections = [];
  for (const [pipelineId, companies] of pipelineGroups.entries()) {
    const pipelineName = pipelineDisplayName(pipelineId);
    const companySections = [];
    for (const company of companies.values()) {
      const companyContext = companyContexts.get(company.companyId || company.companyName) || company;
      const dealBlocks = company.deals
        .map((deal) => dealBlockHtml(pipelineName, companyContext, deal, rfpDatesByDealId.get(cleanLabel(deal.dealId || '')) || {}))
        .join('');
      companySections.push(`
        <section style="margin:0 0 28px;">
          ${dealBlocks}
        </section>
      `);
    }

    pipelineSections.push(`
      <section style="margin:36px 0 0;">
        <h3 style="margin:0 0 12px;font-size:20px;color:#111827;">${escapeHtml(pipelineName)}</h3>
        ${companySections.join('')}
      </section>
    `);
  }

  const factsLines = facts
    .map((fact) => `<li>${escapeHtml(fact)}</li>`)
    .join('');

  return `
    <html>
      <body style="font-family: Arial, Helvetica, sans-serif; line-height:1.5; color:#111827; background:#f9fafb; padding:24px;">
        <div style="max-width:920px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;padding:24px;">
          <h2 style="margin:0 0 12px;font-size:24px;">${escapeHtml(REPORT_TITLE)} - ${escapeHtml(runDate)}</h2>
          <p style="margin:0 0 14px;color:#374151;">Current year only. HubSpot is the single source of truth. Sales Golden Rules applied.</p>
          <h3 style="margin:20px 0 8px;font-size:20px;">Facts Overview</h3>
          <ul style="margin:0 0 18px 18px;padding:0;">${factsLines}</ul>
          <section style="margin:28px 0 0;">
            <h3 style="margin:0 0 10px;font-size:20px;color:#111827;">Outreach Pipeline</h3>
            ${
              leadRecords.length
                ? leadRecords.map((record) => leadFollowUpBlockHtml(record)).join('')
                : '<p style="margin:0;color:#374151;">No active outreach leads found.</p>'
            }
            ${
              disqualifiedRecords.length
                ? disqualifiedRecords.map((record) => disqualifiedLeadBlockHtml(record)).join('')
                : '<p style="margin:0;color:#374151;">No disqualified leads found.</p>'
            }
          </section>
          ${pipelineSections.join('')}
          <p style="margin-top:24px;color:#6b7280;font-size:12px;">This email is generated by ISA, the AI assistant of Seamgen. ISA has been fed and trained with relevant knowledge, and the content and expressions are supervised. For personal contact, you can always call or email me.</p>
        </div>
      </body>
    </html>
  `;
}

function buildReportMarkdown(runDate, facts, pipelineGroups, companyContexts, leadNote, leadSnapshot, rfpDatesByDealId = new Map()) {
  const leadRecords = leadFollowUpRecords(leadSnapshot);
  const disqualifiedRecords = disqualifiedLeadRecords(leadSnapshot);
  const lines = [];
  lines.push(`# ${REPORT_TITLE} - ${runDate}`);
  lines.push('');
  lines.push('## Facts Overview');
  for (const fact of facts) {
    lines.push(`- ${fact}`);
  }
  lines.push('');

  lines.push('## Outreach Pipeline');
  lines.push('');
  if (leadRecords.length) {
    for (const record of leadRecords) {
      lines.push(leadFollowUpBlockMarkdown(record));
      lines.push('');
    }
  } else {
    lines.push('- No active outreach leads found.');
    lines.push('');
  }

  if (disqualifiedRecords.length) {
    for (const record of disqualifiedRecords) {
      lines.push(disqualifiedLeadBlockMarkdown(record));
      lines.push('');
    }
  } else {
    lines.push('- No disqualified leads found.');
    lines.push('');
  }

  for (const [pipelineId, companies] of pipelineGroups.entries()) {
    const pipelineName = pipelineDisplayName(pipelineId);
    lines.push(`## ${pipelineName}`);
    lines.push('');
    for (const company of companies.values()) {
      const companyContext = companyContexts.get(company.companyId || company.companyName) || company;
      lines.push(`### ${companyContext.companyName || company.companyName}`);
      lines.push('');
      for (const deal of company.deals) {
        lines.push(dealBlockMarkdown(pipelineName, companyContext, deal, rfpDatesByDealId.get(cleanLabel(deal.dealId || '')) || {}));
        lines.push('');
      }
    }
  }

  return lines.join('\n');
}

async function buildCompanyContexts(groupedDeals) {
  const contexts = new Map();

  for (const companies of groupedDeals.values()) {
    for (const company of companies.values()) {
      const cacheKey = company.companyId || company.companyName;
      if (contexts.has(cacheKey)) continue;

      let contacts = [];
      let proposedContact = null;
      let mailboxConversation = null;
      try {
        if (company.companyId) {
          contacts = await contactsForCompany(company.companyId);
          proposedContact = pickProposedContact(contacts);
        }
        mailboxConversation = await recentMailboxConversation(company.companyName, proposedContact);
      } catch (error) {
        mailboxConversation = {
          status: 'not_found',
          summary: 'No recent mailbox thread found.',
          subject: '',
          from: '',
          date: '',
        };
      }

      contexts.set(cacheKey, {
        companyName: company.companyName,
        companyId: company.companyId,
        contacts,
        proposedContact,
        proposedContactText: formatContactReference(proposedContact),
        mailboxConversation,
        communicationSummary: currentCommunicationSummary(null, mailboxConversation),
      });
    }
  }

  return contexts;
}

async function loadContactActivityByIds(contactIds = []) {
  const uniqueIds = [...new Set((contactIds || []).map((value) => cleanLabel(value)).filter(Boolean))];
  if (!uniqueIds.length) return new Map();

  const activity = new Map();
  for (let index = 0; index < uniqueIds.length; index += 100) {
    const batch = uniqueIds.slice(index, index + 100);
    const response = await hubspotCall('search_crm_objects', {
      objectType: 'CONTACT',
      properties: [
        'hs_object_id',
        'hs_email_last_send_date',
        'hs_email_last_reply_date',
        'notes_last_contacted',
        'notes_last_updated',
      ],
      limit: batch.length,
      filterGroups: [
        {
          filters: [{ propertyName: 'hs_object_id', operator: 'IN', values: batch }],
        },
      ],
      chatInsights: {
        userIntent: 'Load contact activity for lead timing display in the weekly sales report.',
        satisfaction: 'NEUTRAL',
      },
    });

    for (const contact of response.results || []) {
      const props = contact?.properties || {};
      const lastContact = mostRecentDate(
        props.hs_email_last_send_date,
        props.hs_email_last_reply_date,
        props.notes_last_contacted,
        props.notes_last_updated,
      );
      const contactId = cleanLabel(props.hs_object_id || contact?.id || '');
      if (!contactId) continue;
      activity.set(contactId, {
        lastContactedDate: lastContact ? lastContact.toISOString() : '',
      });
    }
  }

  return activity;
}

async function main() {
  await fs.mkdir(reportDir, { recursive: true });

  const rows = await currentYearDealRows();
  const deals = rows.map(dealFromRow);
  const ownerDirectory = await loadOwnerDirectory().catch(() => new Map());
  for (const deal of deals) {
    deal.owner = ownerDisplayName(deal.ownerId, ownerDirectory);
  }
  const filteredDeals = await filterDealsByRecentActivity(deals);
  const groupedDeals = sortGroupedDeals(groupDeals(filteredDeals));
  const companyContexts = await buildCompanyContexts(groupedDeals);
  const rfpDatesByDealId = await loadRfpDatesByDealId(filteredDeals).catch(() => new Map());
  let leadSnapshot = null;

  const runDate = new Date().toISOString().slice(0, 10);
  const reportPath = path.join(reportDir, `${runDate}.md`);

  try {
    leadSnapshot = await getHubSpotLeadSnapshot({ pipelineIds: ['2487349963'] });
  } catch (error) {
    process.stderr.write(`Weekly current year sales lead snapshot unavailable: ${error?.message || String(error)}\n`);
  }
  if (leadSnapshot?.records?.length) {
    const contactActivity = await loadContactActivityByIds(leadSnapshot.records.map((record) => record.contactId).filter(Boolean)).catch(() => new Map());
    leadSnapshot = {
      ...leadSnapshot,
      records: leadSnapshot.records.map((record) => ({
        ...record,
        owner: ownerDisplayName(record.ownerId, ownerDirectory),
        ...(contactActivity.get(cleanLabel(record.contactId || '')) || {}),
      })),
    };
  }

  const facts = [];
  const filteredStats = pipelineStats(filteredDeals);
  const salesBucket = filteredStats.get('2487085796') || { stages: new Map() };
  const rfpBucket = filteredStats.get('2487569084') || { stages: new Map() };
  const salesStageFacts = summarizeCounts(salesBucket.stages || new Map());
  const rfpStageFacts = summarizeCounts(rfpBucket.stages || new Map());
  const leadStageFacts = summarizeCounts(new Map(Object.entries(leadSnapshot?.byStage || {}).map(([key, count]) => [key.replace('::', ' / '), count])));
  facts.push(`Prospecting pipeline: ${(leadSnapshot?.total || 0)} leads${leadStageFacts ? ` (${leadStageFacts})` : ''}.`);
  facts.push(`Sales Pipeline: ${salesBucket.total || 0} current-year deals${salesStageFacts ? ` (${salesStageFacts})` : ''}.`);
  facts.push(`RFP Pipeline: ${rfpBucket.total || 0} current-year deals${rfpStageFacts ? ` (${rfpStageFacts})` : ''}.`);

  const leadNote = leadSnapshotSummary(leadSnapshot);

  const orderedPipelineGroups = new Map(orderedPipelineEntries(groupedDeals));
  const report = buildReportMarkdown(runDate, facts, orderedPipelineGroups, companyContexts, leadNote, leadSnapshot, rfpDatesByDealId);
  await fs.writeFile(reportPath, report, 'utf8');
  await fs.writeFile(path.join(reportDir, 'latest.md'), report, 'utf8');

  const html = buildEmailHtml(runDate, facts, orderedPipelineGroups, companyContexts, leadNote, leadSnapshot, rfpDatesByDealId);

  const emailResult = await run('gog', [
    '-a',
    'isa@seamgen.com',
    'gmail',
    'send',
    '--from',
    REPORT_FROM,
    '--to',
    REPORT_RECIPIENT,
    '--subject',
    `${REPORT_TITLE} - ${runDate}`,
    '--body-html',
    html,
    '--no-input',
  ]);

  const emailStatus = emailResult.exitCode === 0 ? 'sent' : `failed (${emailResult.exitCode})`;
  const emailError = emailResult.exitCode === 0 ? '' : (emailResult.stderr || emailResult.stdout || 'unknown Gmail error').trim();

  const telegramSummary = [
    `${REPORT_TITLE} - ${runDate}`,
    `Outreach pipeline: ${(leadSnapshot?.total || 0)} leads${leadStageFacts ? ` (${leadStageFacts})` : ''}`,
    `Sales Pipeline: ${salesBucket.total || 0} current-year deals${salesStageFacts ? ` (${salesStageFacts})` : ''}`,
    `RFP Pipeline: ${rfpBucket.total || 0} current-year deals${rfpStageFacts ? ` (${rfpStageFacts})` : ''}`,
  ]
    .filter(Boolean)
    .join('\n');

  let telegramResult = { exitCode: 0 };
  if (!NO_TELEGRAM) {
    for (const target of TELEGRAM_TARGETS) {
      telegramResult = await run('openclaw', [
        'message',
        'send',
        '--channel',
        'telegram',
        '--target',
        target,
        '--message',
        telegramSummary,
      ]);
    }
  }

  const output = [
    `Report written to ${reportPath}`,
    `Email status: ${emailStatus}`,
    emailError ? `Email error: ${emailError}` : '',
    `Telegram status: ${NO_TELEGRAM ? 'skipped' : telegramResult.exitCode === 0 ? 'sent' : `failed (${telegramResult.exitCode})`}`,
  ]
    .filter(Boolean)
    .join('\n');

  process.stdout.write(`${output}\n`);
}

await main();
