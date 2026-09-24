import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { buildLeadName, getHubSpotLeadSnapshot, loadHubSpotLeadsClient } from './hubspot-leads-sidecar.mjs';

const WORKSPACE = process.env.WORKSPACE_DIR || '/home/azureuser/.openclaw/workspace';
const HUBSPOT_CREDS = '/home/azureuser/.openclaw/credentials/hubspot-mcp.json';
const HUBSPOT_URL = 'https://mcp.hubspot.com';
const TELEGRAM_TARGET = process.env.TELEGRAM_TARGET || '-1003890997073';
const TELEGRAM_TARGETS = (process.env.TELEGRAM_TARGETS || TELEGRAM_TARGET)
  .split(/[,\s]+/)
  .map((value) => value.trim())
  .filter(Boolean);
const REPORT_FROM = process.env.REPORT_FROM || 'isa@seamgen.com';
const NO_TELEGRAM = ['1', 'true', 'yes'].includes(String(process.env.NO_TELEGRAM || '').toLowerCase());
const HUBSPOT_CALL_TIMEOUT_MS = Number(process.env.HUBSPOT_CALL_TIMEOUT_MS || 60000);
const WINDOW_DAYS = Number(process.env.WINDOW_DAYS || 14);
const ACTIVITY_WINDOW_DAYS = Number(process.env.ACTIVITY_WINDOW_DAYS || 365);
const SOURCE_QUERY = process.env.SOURCE_QUERY || '(cc:sales@seamgen.com OR to:sale@seamgen.com OR cc:sale@seamgen.com)';
const GOG_ACCOUNT = process.env.GOG_ACCOUNT || 'isa@seamgen.com';
const GOG_KEYRING_BACKEND = process.env.GOG_KEYRING_BACKEND || 'file';
const GOG_KEYRING_PASSWORD_PATH = '/home/azureuser/.openclaw/credentials/gog-keyring-password';

if (!process.env.GOG_ACCOUNT) process.env.GOG_ACCOUNT = GOG_ACCOUNT;
if (!process.env.GOG_KEYRING_BACKEND) process.env.GOG_KEYRING_BACKEND = GOG_KEYRING_BACKEND;
if (!process.env.GOG_KEYRING_PASSWORD && GOG_KEYRING_BACKEND === 'file') {
  try {
    process.env.GOG_KEYRING_PASSWORD = String(await fs.readFile(GOG_KEYRING_PASSWORD_PATH, 'utf8')).trim();
  } catch {
    // Let gog surface a clearer auth error if the keyring password isn't present.
  }
}

const reportDir = path.join(WORKSPACE, 'reports', 'daily-mail-hubspot-sync');
const statePath = path.join(reportDir, 'state.json');
const backfillStatePath = path.join(reportDir, 'backfill-state.json');
const companyLookupCache = new Map();
const contactLookupCache = new Map();
const DEAL_STAGE_BY_KEYWORD = [
  { pattern: /\bproposal approved\b/i, pipelineId: '2487085796', stageId: '4131115726', stageLabel: 'Proposal approved' },
  { pattern: /\bproposal sent\b/i, pipelineId: '2487085796', stageId: '4131115725', stageLabel: 'Proposal sent' },
  { pattern: /\bsow sent\b/i, pipelineId: '2487085796', stageId: '4131115727', stageLabel: 'SoW sent' },
  { pattern: /\bsow signed\b/i, pipelineId: '2487085796', stageId: '4131115728', stageLabel: 'SoW signed (won)' },
  { pattern: /\b(opportunity|validation|negotiation)\b/i, pipelineId: '2487085796', stageId: '4131115724', stageLabel: 'Opportunity' },
  { pattern: /\bclosed won\b/i, pipelineId: '2487085796', stageId: '4131115728', stageLabel: 'SoW signed (won)' },
  { pattern: /\bclosed lost\b/i, pipelineId: '2487085796', stageId: '4131115729', stageLabel: 'Declined (lost)' },
  { pattern: /\babandoned\b/i, pipelineId: '2487085796', stageId: '242470165', stageLabel: 'Abandoned' },
  { pattern: /\bqualified rfp\b/i, pipelineId: '2487569084', stageId: '4131142366', stageLabel: 'Qualified RFP' },
  { pattern: /\brfp participated\b/i, pipelineId: '2487569084', stageId: '4131142367', stageLabel: 'RFP participated' },
  { pattern: /\bresponse submitted\b/i, pipelineId: '2487569084', stageId: '4131142368', stageLabel: 'Response submitted' },
  { pattern: /\bawarded\b.*\bcontract signed\b|\bcontract signed\b.*\bawarded\b/i, pipelineId: '2487569084', stageId: '4131142371', stageLabel: 'Awarded / Contract Signed (won)' },
  { pattern: /\brejected\b.*\babandoned\b|\babandoned\b.*\brejected\b/i, pipelineId: '2487569084', stageId: '4131142372', stageLabel: 'Rejected / Abandoned (lost)' },
  { pattern: /\bclosed won\b/i, pipelineId: '2487569084', stageId: '4131142371', stageLabel: 'Awarded / Contract Signed (won)' },
  { pattern: /\bclosed lost\b/i, pipelineId: '2487569084', stageId: '4131142372', stageLabel: 'Rejected / Abandoned (lost)' },
];
const RFP_PIPELINE_ID = '2487569084';
const RFP_PIPELINE_LABEL = 'RFP pipeline';
const RFP_STAGE_RANK = new Map([
  ['4131142366', 1], // Qualified RFP
  ['4131142367', 2], // RFP participated
  ['4131142368', 3], // Response submitted
  ['4131142371', 4], // Awarded / Contract Signed (won)
  ['4131142372', 4], // Rejected / Abandoned (lost)
]);
const BASECAMP_RFP_SENDERS = new Set(['notifications@youtility.basecamphq.com']);
const RFP_PURSUE_SENDERS = new Set(['joliker@seamgen.com', 'isa@seamgen.com']);
const RFP_PURSUE_SUBJECT_PATTERN = /\b(?:rfp'?s?\s+to\s+pursue|new\s+qualified\s+rfp'?s?\s+for\s+pursue\s+decision)\b/i;
const DEFAULT_LEAD_PIPELINE_ID = '2487349963';
const DEFAULT_LEAD_PIPELINE_LABEL = 'Outreach pipeline';
const DEFAULT_LEAD_NEW_STAGE_ID = '4131052277';
const DEFAULT_LEAD_NEW_STAGE_LABEL = 'First attempt';
const LEAD_INTENT_PATTERNS = [
  /\bwe would love to\b/i,
  /\bwould love to order\b/i,
  /\binterested in\b/i,
  /\bwould like to\b/i,
  /\blooking for\b/i,
  /\brequest(?:ing)? (?:a )?quote\b/i,
  /\bpricing\b/i,
  /\bdemo\b/i,
  /\bget started\b/i,
  /\bcan you help\b/i,
  /\border your\b/i,
];
const DEAL_COMMERCIAL_PATTERNS = [
  /\bproposal\b/i,
  /\bquote\b/i,
  /\bpricing\b/i,
  /\bbudget\b/i,
  /\bestimate\b/i,
  /\bcommercial\b/i,
  /\bcontract\b/i,
  /\bpurchase\b/i,
];
const DEAL_PROJECT_PATTERNS = [
  /\bproject\b/i,
  /\bbrief\b/i,
  /\bbriefing\b/i,
  /\brequirements?\b/i,
  /\bscope of work\b/i,
  /\bscope\b/i,
  /\bspec(?:ification)?\b/i,
  /\bstatement of work\b/i,
  /\bsow\b/i,
  /\bquote request\b/i,
  /\binquiry\b/i,
  /\bintro(?:duction)? meeting\b/i,
  /\bbuild\b/i,
  /\bdevelop\b/i,
  /\bimplement\b/i,
  /\blaunch\b/i,
  /\bwebsite\b/i,
  /\bportal\b/i,
  /\bplatform\b/i,
  /\bsolution\b/i,
  /\bassignment\b/i,
  /\bwork order\b/i,
];
const DEAL_STAGE_INFERENCE_RULES = [
  { pattern: /\b(closed won|signed|awarded|go ahead|green light|approved to proceed)\b/i, pipelineId: '2487085796', stageId: '4131115728', stageLabel: 'SoW signed (won)' },
  { pattern: /\b(closed lost|lost|rejected|not going forward|declined)\b/i, pipelineId: '2487085796', stageId: '4131115729', stageLabel: 'Declined (lost)' },
  { pattern: /\b(proposal approved|approved proposal|proposal accepted|approved|approval given|approval received|approval granted|approval)\b/i, pipelineId: '2487085796', stageId: '4131115726', stageLabel: 'Proposal approved' },
  { pattern: /\b(proposal sent|sent proposal|sent quote|quote sent|proposal shared|quote shared|proposal delivered|quote delivered)\b/i, pipelineId: '2487085796', stageId: '4131115725', stageLabel: 'Proposal sent' },
  { pattern: /\b(statement of work|scope of work|sow sent|work order sent|contract sent)\b/i, pipelineId: '2487085796', stageId: '4131115727', stageLabel: 'SoW sent' },
  { pattern: /\b(opportunity|validation|negotiation|discovery|requirements|brief|briefing|project kickoff|kickoff|meeting booked|next step|commercial)\b/i, pipelineId: '2487085796', stageId: '4131115724', stageLabel: 'Opportunity' },
  { pattern: /\b(qualified rfp|qualification|bid qualification)\b/i, pipelineId: '2487569084', stageId: '4131142366', stageLabel: 'Qualified RFP' },
  { pattern: /\b(rfp participated|participating in rfp|rfp)\b/i, pipelineId: '2487569084', stageId: '4131142367', stageLabel: 'RFP participated' },
  { pattern: /\b(response submitted|submitted response|proposal submitted|submission sent)\b/i, pipelineId: '2487569084', stageId: '4131142368', stageLabel: 'Response submitted' },
  { pattern: /\b(contract signed|awarded contract|awarded)\b/i, pipelineId: '2487569084', stageId: '4131142371', stageLabel: 'Awarded / Contract Signed (won)' },
  { pattern: /\b(rejected|abandoned)\b/i, pipelineId: '2487569084', stageId: '4131142372', stageLabel: 'Rejected / Abandoned (lost)' },
];
const DEAL_STAGE_ASSESSMENT_RULES = [
  {
    stageId: '4131115728',
    stageLabel: 'SoW signed (won)',
    score: 90,
    patterns: [
      /\b(closed won|signed|awarded|approved to proceed|go ahead|green light|final approval|sign-off|signed off)\b/i,
    ],
  },
  {
    stageId: '4131115726',
    stageLabel: 'Proposal approved',
    score: 80,
    patterns: [
      /\b(proposal approved|approved proposal|proposal accepted|approval given|approval received|approval granted|approval)\b/i,
      /\b(approved|okay to proceed|ok to proceed|can proceed|proceed)\b/i,
    ],
  },
  {
    stageId: '4131115725',
    stageLabel: 'Proposal sent',
    score: 70,
    patterns: [
      /\b(proposal sent|sent proposal|sent quote|quote sent|proposal shared|quote shared|proposal delivered|quote delivered)\b/i,
      /\b(shared the proposal|sent over the proposal|proposal is out)\b/i,
    ],
  },
  {
    stageId: '4131115727',
    stageLabel: 'SoW sent',
    score: 60,
    patterns: [
      /\b(statement of work|scope of work|sow sent|work order sent|contract sent)\b/i,
      /\b(sent the sow|sent the contract|contract is out)\b/i,
    ],
  },
  {
    stageId: '4131115724',
    stageLabel: 'Opportunity',
    score: 50,
    patterns: [
      /\b(opportunity|validation|negotiation|discovery|requirements|brief|briefing|project kickoff|kickoff|meeting booked|next step|commercial)\b/i,
      /\b(let's discuss|let us discuss|talk next week|call next week|follow up)\b/i,
    ],
  },
];
const GENERIC_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'yahoo.co.uk',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'msn.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
  'pm.me',
  'gmx.com',
  'mail.com',
]);
const DEAL_STAGE_LABEL_BY_ID = new Map([
  ['4131115724', 'Opportunity'],
  ['4131115725', 'Proposal sent'],
  ['4131115726', 'Proposal approved'],
  ['4131115727', 'SoW sent'],
  ['4131115728', 'SoW signed (won)'],
  ['4131115729', 'Declined (lost)'],
  ['242470165', 'Abandoned'],
  ['4131142366', 'Qualified RFP'],
  ['4131142367', 'RFP participated'],
  ['4131142368', 'Response submitted'],
  ['4131142371', 'Awarded / Contract Signed (won)'],
  ['4131142372', 'Rejected / Abandoned (lost)'],
]);
const DEAL_STAGE_RANK = new Map([
  ['4131115724', 1],
  ['4131115725', 2],
  ['4131115726', 3],
  ['4131115727', 4],
  ['4131115728', 5],
  ['4131115729', 0],
  ['242470165', 0],
]);

async function loadExistingState() {
  try {
    const raw = await fs.readFile(statePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function sendTelegramMessage(message) {
  for (const target of TELEGRAM_TARGETS) {
    await run('openclaw', [
      'message',
      'send',
      '--channel',
      'telegram',
      '--target',
      target,
      '--message',
      message,
    ]);
  }
}

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

function cleanHubSpotLabel(value = '') {
  return asText(value).replace(/\s*\(\d+\)\s*$/g, '').trim();
}

function cleanText(text = '') {
  return String(text).replace(/\s+/g, ' ').trim();
}

function parseHubSpotDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function latestActivityDate(values = []) {
  let best = null;
  for (const value of values) {
    const date = parseHubSpotDate(value);
    if (!date) continue;
    if (!best || date.getTime() > best.getTime()) best = date;
  }
  return best;
}

function recordActivityStatus(activityDate, windowDays = ACTIVITY_WINDOW_DAYS) {
  if (!activityDate) return 'inactive';
  const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  return activityDate.getTime() >= cutoff.getTime() ? 'active' : 'inactive';
}

function companyActivityDate(company = {}) {
  const props = company?.properties || {};
  return latestActivityDate([
    props.notes_last_contacted,
    props.notes_last_updated,
  ]);
}

function contactActivityDate(contact = {}) {
  const props = contact?.properties || {};
  return latestActivityDate([
    props.hs_email_last_send_date,
    props.hs_email_last_reply_date,
    props.notes_last_contacted,
    props.notes_last_updated,
  ]);
}

function statusUpdatePayload(objectType, record, propertyName, statusValue) {
  const objectId = Number(record?.id || record?.properties?.hs_object_id || 0);
  if (!objectId || !propertyName || !statusValue) return null;
  return {
    objectType: objectType.toUpperCase(),
    objectId,
    properties: {
      [propertyName]: statusValue,
    },
  };
}

async function updateActivityStatus({ objectType, record, propertyName, activityDate }) {
  const desired = recordActivityStatus(activityDate);
  const current = cleanText(record?.properties?.[propertyName] || '').toLowerCase();
  if (!propertyName || !record || !desired || current === desired) {
    return null;
  }

  const payload = statusUpdatePayload(objectType, record, propertyName, desired);
  if (!payload) return null;

  await hubspotCall('manage_crm_objects', {
    confirmationStatus: 'CONFIRMED',
    updateRequest: {
      objects: [payload],
    },
  });

  return {
    kind: 'status',
    objectType: objectType.toLowerCase(),
    objectId: String(record?.id || record?.properties?.hs_object_id || ''),
    objectName: asText(record?.properties?.name || [record?.properties?.firstname, record?.properties?.lastname].filter(Boolean).join(' ').trim() || record?.properties?.email || record?.properties?.work_email || ''),
    propertyName,
    fromStatus: current || 'unset',
    toStatus: desired,
    activityDate: activityDate ? activityDate.toISOString() : '',
    changedAt: new Date().toISOString(),
  };
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
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
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
      if (!content) throw new Error(`HubSpot tool ${toolName} returned no text content`);
      return JSON.parse(content);
    } catch (error) {
      lastError = error;
      const message = error?.message || String(error);
      const retryable =
        message.includes('Empty JSON output') ||
        message.includes('returned no text content') ||
        message.includes('Unexpected end of JSON input') ||
        message.includes('Failed to parse JSON');
      if (!retryable || attempt === 3) throw error;
      await sleep(1000 * attempt);
    }
  }
  throw lastError || new Error(`HubSpot tool ${toolName} failed`);
}

async function gmailSearch(query) {
  const response = await runJson(
    'gog',
    ['gmail', 'messages', 'search', query, '--max', '20', '--json', '--no-input'],
    { timeoutMs: 45000 },
  );
  return response.messages || [];
}

async function gmailGet(id) {
  return await runJson('gog', ['gmail', 'get', id, '--json', '--no-input'], { timeoutMs: 45000 });
}

function isInternalMail(message) {
  const headers = message?.headers || {};
  const headerAddresses = [
    ...extractEmailAddresses(headers.from || ''),
    ...extractEmailAddresses(headers.to || ''),
    ...extractEmailAddresses(headers.cc || ''),
  ];
  if (!headerAddresses.length) return false;
  const hasInternalAddress = headerAddresses.some((email) => isInternalEmailAddress(email));
  const hasExternalAddress = headerAddresses.some((email) => !isInternalEmailAddress(email));
  if (hasExternalAddress) return false;
  return hasInternalAddress && !hasForwardedExternalContext(message);
}

function isRfpMail(message) {
  const text = cleanText(
    [
      message?.headers?.subject,
      message?.snippet,
      message?.body,
    ]
      .filter(Boolean)
      .join(' '),
  ).toLowerCase();
  return /\brfp\b|request for proposal|procurement/.test(text);
}

function isBasecampRfpMail(message) {
  const headers = message?.headers || {};
  const from = asText(headers.from || '').toLowerCase();
  const subject = asText(headers.subject || '').toLowerCase();
  return (
    [...BASECAMP_RFP_SENDERS].some((sender) => from.includes(sender)) ||
    /basecamphq\.com/i.test(from) ||
    /\[us bizdev\]/i.test(subject) ||
    /sales meeting/i.test(subject)
  );
}

function isRfpPursueMail(message) {
  const headers = message?.headers || {};
  const from = asText(headers.from || '').toLowerCase();
  const subject = asText(headers.subject || '');
  return [...RFP_PURSUE_SENDERS].some((sender) => from.includes(sender)) && RFP_PURSUE_SUBJECT_PATTERN.test(subject);
}

function hasLeadIntent(text = '') {
  return LEAD_INTENT_PATTERNS.some((pattern) => pattern.test(String(text || '')));
}

function hasCommercialDealIntent(text = '') {
  return DEAL_COMMERCIAL_PATTERNS.some((pattern) => pattern.test(String(text || '')));
}

function hasProjectDealIntent(text = '') {
  return DEAL_PROJECT_PATTERNS.some((pattern) => pattern.test(String(text || '')));
}

function isDealCandidateText(text = '') {
  const combined = cleanText(text);
  return hasCommercialDealIntent(combined) && hasProjectDealIntent(combined);
}

function firstAttemptCandidate(message) {
  const subject = asText(message?.headers?.subject || '');
  const text = cleanText([subject, stripTags(asText(message?.body || '')), asText(message?.snippet || '')].join(' '));
  return externalEmailsFromMessage(message).length > 0 && hasLeadIntent(text);
}

function dealCreationCandidate(message) {
  const subject = asText(message?.headers?.subject || '');
  const text = cleanText([subject, stripTags(asText(message?.body || '')), asText(message?.snippet || '')].join(' '));
  return externalEmailsFromMessage(message).length > 0 && isDealCandidateText(text);
}

function rfpMeetingCandidate(text = '') {
  return /\b(meeting|sales meeting|kickoff|discovery|alignment|review|next step|follow[- ]?up|call|conversation)\b/i.test(
    String(text || ''),
  );
}

function rfpStageRank(stageId = '') {
  return RFP_STAGE_RANK.get(String(stageId || '').trim()) || 0;
}

function rfpStageCueFromMail(text = '', message = null) {
  const cue = dealStageCueFromText(text);
  if (cue?.pipelineId === RFP_PIPELINE_ID) {
    return cue;
  }

  const combined = cleanText(
    [
      message?.headers?.subject,
      message?.snippet,
      message?.body,
      text,
    ]
      .filter(Boolean)
      .join(' '),
  );

  if (rfpMeetingCandidate(combined)) {
    return {
      pattern: /\b(meeting|sales meeting|kickoff|discovery|alignment|review|next step|follow[- ]?up|call|conversation)\b/i,
      pipelineId: RFP_PIPELINE_ID,
      stageId: '4131142366',
      stageLabel: 'Qualified RFP',
    };
  }

  return null;
}

function summariseMessage(message) {
  const headers = message?.headers || {};
  return {
    id: message.id || '',
    subject: asText(headers.subject || ''),
    from: asText(headers.from || ''),
    date: asText(headers.date || message.date || ''),
    snippet: stripTags(asText(message.snippet || message.body || '')),
  };
}

function collectMailText(message) {
  const headers = message?.headers || {};
  return cleanText(
    [
      headers.subject,
      headers.from,
      headers.to,
      headers.cc,
      message?.snippet,
      message?.body,
    ]
      .filter(Boolean)
      .join(' '),
  );
}

function isInternalEmailAddress(email) {
  const value = cleanText(email).toLowerCase();
  return /@seamgen\.com$|@(?:itility|youtility)\.[a-z.]+$/i.test(value);
}

function hasForwardedExternalContext(message) {
  const headers = message?.headers || {};
  const bodyText = cleanText([headers.subject, message?.snippet, message?.body].filter(Boolean).join(' '));
  const bodyEmails = extractEmailAddresses(bodyText).filter((email) => !isInternalEmailAddress(email));
  if (bodyEmails.length) return true;
  return /\b(forwarded message|original message|fwd:|fw:)\b/i.test(bodyText);
}

function extractEmailAddresses(text = '') {
  const matches = String(text).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  return [...new Set(matches.map((value) => cleanText(value).toLowerCase()).filter(Boolean))];
}

function emailLocalPartToName(email = '') {
  const localPart = cleanText(String(email || '').split('@')[0] || '');
  if (!localPart) return '';
  const name = localPart.replace(/[._-]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!name) return '';
  return name
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function domainToCompanyName(domain = '') {
  const text = cleanText(domain).toLowerCase().replace(/^www\./, '');
  if (!text) return '';
  if (GENERIC_EMAIL_DOMAINS.has(text)) return '';
  const parts = text.split('.').filter(Boolean);
  if (!parts.length) return '';
  const root = parts.length > 2 ? parts.slice(0, -1).join('.') : parts[0];
  const stripped = root.replace(/^(mail|info|hello|contact|sales|team)\./i, '').replace(/[._-]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!stripped) return '';
  return stripped
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function companyNameFromMessageContext(message = {}) {
  const headers = message?.headers || {};
  const text = [
    headers.subject,
    message?.subject,
    headers.to,
    headers.cc,
    message?.snippet,
    message?.body,
  ]
    .filter(Boolean)
    .join(' ');

  const patterns = [
    /[Hh]elp\s+([A-Z][A-Za-z0-9&'’.-]*(?:\s+[A-Z][A-Za-z0-9&'’.-]*){0,4})\s+(?:grow|thrive|scale|expand|succeed)/,
    /[Tt]alk to you more about how we can help\s+([A-Z][A-Za-z0-9&'’.-]*(?:\s+[A-Z][A-Za-z0-9&'’.-]*){0,4})/,
    /[Ww]e can help\s+([A-Z][A-Za-z0-9&'’.-]*(?:\s+[A-Z][A-Za-z0-9&'’.-]*){0,4})\s+(?:grow|thrive|scale|expand|succeed)/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return cleanText(match[1]);
  }

  return '';
}

function splitRfpPursueBlocks(text = '') {
  const raw = String(text || '').replace(/\r/g, '\n').trim();
  if (!raw) return [];

  const paragraphs = raw
    .split(/\n\s*\n+/)
    .map((block) => block.trim())
    .filter(Boolean);

  if (paragraphs.length > 1) return paragraphs;

  const lines = raw.split('\n').map((line) => line.trim()).filter(Boolean);
  const blocks = [];
  let current = [];
  for (const line of lines) {
    if (/^(?:[-*•]|\d+[.)]|#+)\s+/.test(line) && current.length) {
      blocks.push(current.join('\n').trim());
      current = [line];
      continue;
    }
    current.push(line);
  }
  if (current.length) blocks.push(current.join('\n').trim());
  return blocks.length > 1 ? blocks : [raw];
}

function inferRfpIdentityFromText(text = '', evidence = {}) {
  const block = String(text || '').trim();
  const lines = block
    .split('\n')
    .map((line) => cleanText(line))
    .filter(Boolean);
  const explicitCompanyLabels = [
    /^company\s*[:\-]\s*(.+)$/i,
    /^account\s*[:\-]\s*(.+)$/i,
    /^client\s*[:\-]\s*(.+)$/i,
    /^opportunity\s*[:\-]\s*(.+)$/i,
    /^project\s*[:\-]\s*(.+)$/i,
    /^deal\s*[:\-]\s*(.+)$/i,
    /^rfp\s*[:\-]\s*(.+)$/i,
  ];
  const explicitContactLabels = [
    /^contact\s*[:\-]\s*(.+)$/i,
    /^owner\s*[:\-]\s*(.+)$/i,
    /^lead\s*[:\-]\s*(.+)$/i,
    /^proposal contact\s*[:\-]\s*(.+)$/i,
  ];

  let companyName = cleanText(evidence.company?.properties?.name || evidence.company?.properties?.domain || '');
  let contactName = cleanText([evidence.contact?.properties?.firstname, evidence.contact?.properties?.lastname].filter(Boolean).join(' '));
  let contactEmail = cleanText(evidence.contact?.properties?.email || evidence.contact?.properties?.work_email || '');
  const emails = extractEmailAddresses(block).filter((email) => !isInternalEmailAddress(email));
  if (!contactEmail && emails.length) contactEmail = emails[0];

  for (const line of lines) {
    for (const pattern of explicitCompanyLabels) {
      const match = line.match(pattern);
      if (match?.[1]) {
        companyName = cleanText(match[1]);
        break;
      }
    }
    for (const pattern of explicitContactLabels) {
      const match = line.match(pattern);
      if (match?.[1]) {
        const value = cleanText(match[1]);
        if (!contactName) contactName = value.replace(/\s*<[^>]+>\s*/g, '').trim();
        const emailMatch = extractEmailAddresses(value);
        if (!contactEmail && emailMatch.length) contactEmail = emailMatch[0];
      }
    }
  }

  if (!companyName) {
    const candidateLine =
      lines.find((line) => {
        const value = line.replace(/^[-*•\d.)\s]+/, '').trim();
        if (!value) return false;
        if (extractEmailAddresses(value).length) return false;
        if (/^(contact|owner|lead|company|account|client|details|notes?|status|stage|project|deal|rfp)\b/i.test(value)) return false;
        if (value.length < 3 || value.length > 140) return false;
        return /[A-Z]/.test(value);
      }) || '';
    companyName = cleanText(candidateLine.replace(/^[-*•\d.)\s]+/, ''));
  }

  if (!contactName && contactEmail) {
    contactName = emailLocalPartToName(contactEmail);
  }

  const companyDomain =
    cleanText(evidence.company?.properties?.domain || (contactEmail.includes('@') ? contactEmail.split('@')[1] : '') || '').toLowerCase() || '';

  return {
    companyName,
    contactName,
    contactEmail,
    companyDomain,
    leadName: buildLeadName(contactName, companyName) || contactEmail || companyName || contactName || '',
  };
}

function extractRfpImportantDates(text = '') {
  const block = String(text || '');
  const normalized = block.replace(/\r/g, '\n');
  const lineCandidates = normalized
    .split('\n')
    .map((line) => cleanText(line))
    .filter(Boolean);

  const patterns = [
    {
      key: 'qaSubmissionDate',
      label: 'Q&A submission date',
      patterns: [
        /\bq&a\s+(?:submission date|submission|due date|deadline)\b\s*[:\-]?\s*(.+)$/i,
        /\bquestions?\s+(?:due|deadline|submission date)\b\s*[:\-]?\s*(.+)$/i,
      ],
    },
    {
      key: 'qaReturnDate',
      label: 'Q&A return date',
      patterns: [
        /\bq&a\s+(?:return date|return|answers? due|responses? due)\b\s*[:\-]?\s*(.+)$/i,
        /\banswers?\s+(?:due|return date|deadline)\b\s*[:\-]?\s*(.+)$/i,
        /\bresponses?\s+(?:due|return date|deadline)\b\s*[:\-]?\s*(.+)$/i,
      ],
    },
    {
      key: 'submissionDueDay',
      label: 'Due day for submission',
      patterns: [
        /\bdue day for submission\b\s*[:\-]?\s*(.+)$/i,
        /\bsubmission\s+(?:due|deadline|date)\b\s*[:\-]?\s*(.+)$/i,
        /\bproposal\s+(?:due|deadline|date)\b\s*[:\-]?\s*(.+)$/i,
        /\bresponse\s+(?:due|deadline|date)\b\s*[:\-]?\s*(.+)$/i,
      ],
    },
  ];

  const result = {};

  for (const item of patterns) {
    let value = '';
    for (const line of lineCandidates) {
      for (const pattern of item.patterns) {
        const match = line.match(pattern);
        if (match?.[1]) {
          value = cleanText(match[1]).replace(/[.;,]+$/, '').trim();
          break;
        }
      }
      if (value) break;
    }
    result[item.key] = value;
  }

  return result;
}

function externalEmailsFromMessage(message) {
  const headers = message?.headers || {};
  const combined = [headers.from, headers.to, headers.cc, message?.snippet, message?.body].filter(Boolean).join(' ');
  return extractEmailAddresses(combined).filter((email) => !isInternalEmailAddress(email));
}

function primaryExternalEmailFromMessage(message) {
  const headers = message?.headers || {};
  const headerCandidates = [
    ...extractEmailAddresses(asText(headers.from || '')),
    ...extractEmailAddresses(asText(headers.to || '')),
    ...extractEmailAddresses(asText(headers.cc || '')),
  ].filter((email) => !isInternalEmailAddress(email));
  if (headerCandidates.length) return headerCandidates[0];
  return externalEmailsFromMessage(message)[0] || '';
}

function inferLeadIdentityFromMessage(message, evidence = {}) {
  const contactEmail =
    cleanText(primaryExternalEmailFromMessage(message) || evidence.contact?.properties?.email || evidence.contact?.properties?.work_email || evidence.contact?.properties?.hs_associated_contact_email || '')
      .toLowerCase() || '';
  const companyName =
    cleanText(
      companyNameFromMessageContext(message) ||
        evidence.company?.properties?.name ||
        evidence.company?.properties?.domain ||
        evidence.company?.properties?.hs_associated_company_name ||
        '',
    ) || domainToCompanyName(contactEmail.split('@')[1] || '') || '';
  const contactName =
    cleanText([evidence.contact?.properties?.firstname, evidence.contact?.properties?.lastname].filter(Boolean).join(' ')) ||
    emailLocalPartToName(contactEmail) ||
    '';
  const companyDomain =
    cleanText(
      evidence.company?.properties?.domain ||
        (contactEmail.includes('@') ? contactEmail.split('@')[1] : '') ||
        '',
    ).toLowerCase() || '';

  return {
    contactEmail,
    contactName,
    companyName,
    companyDomain,
    leadName: buildLeadName(contactName, companyName) || contactEmail || companyName || contactName || '',
  };
}

function splitPersonName(name = '') {
  const parts = cleanText(name).split(' ').filter(Boolean);
  if (!parts.length) return { firstname: '', lastname: '' };
  if (parts.length === 1) return { firstname: parts[0], lastname: '' };
  return {
    firstname: parts[0],
    lastname: parts.slice(1).join(' '),
  };
}

function buildCompanyProperties(identity = {}) {
  const properties = {};
  if (identity.companyName) properties.name = identity.companyName;
  if (identity.companyDomain) properties.domain = identity.companyDomain;
  return properties;
}

function buildContactProperties(identity = {}) {
  const properties = {};
  const { firstname, lastname } = splitPersonName(identity.contactName);
  if (firstname) properties.firstname = firstname;
  if (lastname) properties.lastname = lastname;
  if (identity.contactEmail) properties.email = identity.contactEmail;
  return properties;
}

function pickId(record, propertyName) {
  return cleanText(record?.id || record?.properties?.[propertyName] || record?.properties?.hs_object_id || '');
}

function normalizeLeadMatchText(value = '') {
  return cleanText(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeEmailAddress(value = '') {
  return cleanText(value).trim().toLowerCase();
}

function extractEmailDomain(value = '') {
  const email = normalizeEmailAddress(value);
  if (!email.includes('@')) return '';
  return email.split('@').pop().replace(/^www\./, '');
}

function leadTextMatches(left = '', right = '') {
  const leftText = normalizeLeadMatchText(left);
  const rightText = normalizeLeadMatchText(right);
  if (!leftText || !rightText) return false;
  if (leftText === rightText) return true;
  if (leftText.includes(rightText) || rightText.includes(leftText)) return true;

  const leftTokens = leftText.split(' ').filter(Boolean);
  const rightTokens = rightText.split(' ').filter(Boolean);
  if (!leftTokens.length || !rightTokens.length) return false;

  const smaller = leftTokens.length <= rightTokens.length ? leftTokens : rightTokens;
  const larger = leftTokens.length > rightTokens.length ? leftTokens : rightTokens;
  const overlap = smaller.filter((token) => larger.includes(token)).length;
  return smaller.length >= 2 && overlap / smaller.length >= 0.75;
}

async function createHubSpotObject(client, objectType, properties = {}, associations = []) {
  const filtered = Object.fromEntries(
    Object.entries(properties).filter(([, value]) => value != null && String(value).trim() !== ''),
  );
  if (!Object.keys(filtered).length) return null;

  const body = { properties: filtered };
  if (Array.isArray(associations) && associations.length) body.associations = associations;

  const response = await client.request('/crm/v3/objects/' + String(objectType).toLowerCase(), {
    method: 'POST',
    body,
  });
  return response;
}

async function searchHubSpotObjects(client, objectType, filterGroups, properties = []) {
  const response = await client.request(`/crm/v3/objects/${String(objectType).toLowerCase()}/search`, {
    method: 'POST',
    body: {
      limit: 5,
      filterGroups,
      properties,
    },
  });
  return response?.results || [];
}

async function searchExistingCompany(identity = {}) {
  const query = cleanText(identity.companyDomain || identity.companyName || '').trim();
  if (!query) return null;

  const response = await hubspotCall('search_crm_objects', {
    objectType: 'companies',
    query,
    properties: ['hs_object_id', 'name', 'domain'],
    limit: 5,
    chatInsights: {
      userIntent: 'Resolve a company from a mail thread during the daily HubSpot mail sync.',
      satisfaction: 'NEUTRAL',
    },
  });

  return (
    (response.results || []).find((item) => {
      const name = cleanText(item?.properties?.name || '').toLowerCase();
      const domain = cleanText(item?.properties?.domain || '').toLowerCase();
      const q = query.toLowerCase();
      return (
        (identity.companyDomain && domain === cleanText(identity.companyDomain).toLowerCase()) ||
        (identity.companyName && name === cleanText(identity.companyName).toLowerCase()) ||
        name.includes(q) ||
        domain.includes(q)
      );
    }) || null
  );
}

async function searchExistingContact(identity = {}) {
  const query = cleanText(identity.contactEmail || identity.contactName || '').trim();
  if (!query) return null;

  const response = await hubspotCall('search_crm_objects', {
    objectType: 'contacts',
    query,
    properties: ['hs_object_id', 'firstname', 'lastname', 'email', 'work_email'],
    limit: 5,
    chatInsights: {
      userIntent: 'Resolve a contact from a mail thread during the daily HubSpot mail sync.',
      satisfaction: 'NEUTRAL',
    },
  });

  return (
    (response.results || []).find((item) => {
      const email = cleanText(item?.properties?.email || item?.properties?.work_email || '').toLowerCase();
      const name = cleanText([item?.properties?.firstname, item?.properties?.lastname].filter(Boolean).join(' ')).toLowerCase();
      const q = query.toLowerCase();
      return (
        (identity.contactEmail && email === cleanText(identity.contactEmail).toLowerCase()) ||
        (identity.contactName && name === cleanText(identity.contactName).toLowerCase()) ||
        email.includes(q) ||
        name.includes(q)
      );
    }) || null
  );
}

function crmResultObject(result = {}) {
  const object = result?.object || result || null;
  if (!object) return null;
  const id = pickId(object, 'hs_object_id');
  if (!id) return null;
  return {
    id,
    properties: object.properties || {},
  };
}

async function ensureCompanyRecord(identity = {}, owner = null) {
  const existing = await searchExistingCompany(identity);
  if (existing) return existing;

  const properties = buildCompanyProperties(identity);
  if (!properties.name && !properties.domain) return null;
  if (owner?.ownerId) {
    properties.hubspot_owner_id = String(owner.ownerId);
  }

  const response = await hubspotCall('manage_crm_objects', {
    confirmationStatus: 'CONFIRMED',
    createRequest: {
      objects: [
        {
          objectType: 'COMPANY',
          properties,
        },
      ],
    },
  });

  return crmResultObject(response?.createResults?.results?.[0]) || null;
}

async function ensureContactRecord(identity = {}) {
  const existing = await searchExistingContact(identity);
  if (existing) return existing;

  const properties = buildContactProperties(identity);
  if (!properties.email && !properties.firstname && !properties.lastname) return null;

  const response = await hubspotCall('manage_crm_objects', {
    confirmationStatus: 'CONFIRMED',
    createRequest: {
      objects: [
        {
          objectType: 'CONTACT',
          properties,
        },
      ],
    },
  });

  return crmResultObject(response?.createResults?.results?.[0]) || null;
}

async function resolveLeadOwnerFromMessage(message = {}) {
  const headers = message?.headers || {};
  const fromText = asText(headers.from || '');
  const candidates = [];
  const fromEmails = extractEmailAddresses(fromText).filter((email) => !isInternalEmailAddress(email));
  const fromNames = splitNameCandidates(fromText).map((value) => cleanText(value)).filter(Boolean);

  if (fromEmails.length) candidates.push(fromEmails[0]);
  candidates.push(...fromNames);
  candidates.push(cleanText(fromText));

  for (const query of candidates.filter(Boolean)) {
    const response = await hubspotCall('search_crm_objects', {
      objectType: 'USER',
      query,
      properties: ['hs_object_id', 'hs_email', 'hs_searchable_calculated_name', 'hs_given_name', 'hs_family_name', 'hubspot_owner_id'],
      limit: 5,
      chatInsights: {
        userIntent: 'Resolve the internal owner for an outbound mail thread during the daily HubSpot mail sync.',
        satisfaction: 'NEUTRAL',
      },
    });

    const match = (response.results || []).find((item) => {
      const email = cleanText(item?.properties?.hs_email || '').toLowerCase();
      const name = cleanText(item?.properties?.hs_searchable_calculated_name || [item?.properties?.hs_given_name, item?.properties?.hs_family_name].filter(Boolean).join(' ')).toLowerCase();
      const normalized = cleanText(query).toLowerCase();
      return (
        (normalized && (email === normalized || name === normalized || email.includes(normalized) || name.includes(normalized))) ||
        (fromEmails.length && fromEmails.some((candidate) => email === cleanText(candidate).toLowerCase())) ||
        (fromNames.length && fromNames.some((candidate) => name === cleanText(candidate).toLowerCase()))
      );
    });

    const ownerId = cleanText(match?.properties?.hubspot_owner_id || match?.properties?.hs_object_id || '');
    if (ownerId) {
      return {
        ownerId,
        ownerName: cleanText(match?.properties?.hs_searchable_calculated_name || [match?.properties?.hs_given_name, match?.properties?.hs_family_name].filter(Boolean).join(' ')),
        ownerEmail: cleanText(match?.properties?.hs_email || ''),
      };
    }
  }

  return null;
}

function parseMailTimestamp(message = {}, summary = {}) {
  const candidates = [
    message?.internalDate,
    message?.date,
    summary?.date,
    message?.headers?.date,
  ];
  for (const candidate of candidates) {
    const date = parseHubSpotDate(candidate);
    if (date) return date;
  }
  return new Date();
}

function buildMailCommunicationBody(message = {}, summary = {}, context = {}) {
  const headers = message?.headers || {};
  const subject = cleanText(summary?.subject || headers.subject || '');
  const from = asText(headers.from || '');
  const to = asText(headers.to || '');
  const cc = asText(headers.cc || '');
  const intro = context.kind === 'deal'
    ? 'Deal communication logged from email sync.'
    : 'Lead communication logged from email sync.';
  const body = stripTags(asText(message?.body || message?.snippet || ''));

  return [
    context.kind === 'rfp' ? 'RFP communication logged from email sync.' : intro,
    subject ? `Subject: ${subject}` : '',
    from ? `From: ${from}` : '',
    to ? `To: ${to}` : '',
    cc ? `Cc: ${cc}` : '',
    summary?.date ? `Date: ${summary.date}` : '',
    context.kind === 'rfp' ? `Q&A submission date: ${context.rfpDates?.qaSubmissionDate || 'not found'}` : '',
    context.kind === 'rfp' ? `Q&A return date: ${context.rfpDates?.qaReturnDate || 'not found'}` : '',
    context.kind === 'rfp' ? `Due day for submission: ${context.rfpDates?.submissionDueDay || 'not found'}` : '',
    '',
    body,
  ]
    .filter((line, index, array) => line !== '' || index < array.length - 1)
    .join('\n')
    .trim()
    .slice(0, 30000);
}

async function createMailCommunicationNote({ message, summary, context = {}, ownerId = '', targets = [] } = {}) {
  const targetAssociations = (Array.isArray(targets) ? targets : [])
    .map((target) => {
      if (!target?.id || !target?.type) return null;
      return {
        targetObjectId: Number(target.id),
        targetObjectType: String(target.type).toUpperCase(),
      };
    })
    .filter(Boolean);
  if (!targetAssociations.length) return null;

  const body = buildMailCommunicationBody(message, summary, context);
  const timestamp = parseMailTimestamp(message, summary);
  const properties = {
    hs_note_body: body,
    hs_timestamp: timestamp.toISOString(),
  };
  if (ownerId) {
    properties.hubspot_owner_id = String(ownerId);
  }

  const response = await hubspotCall('manage_crm_objects', {
    confirmationStatus: 'CONFIRMED',
    createRequest: {
      objects: [
        {
          objectType: 'NOTE',
          properties,
          associations: targetAssociations,
        },
      ],
    },
  });

  const created = response?.createResults?.results?.[0] || null;
  return created
    ? {
        noteId: created.objectId || created.object?.id || '',
        noteUrl: created.object?.url || '',
      }
    : null;
}

function buildDealNameFromMail(identity = {}, summary = {}) {
  const subject = cleanText(summary?.subject || '').replace(/^((re|fw|fwd)\s*:\s*)+/i, '').trim();
  const companyName = cleanText(identity.companyName || '');
  if (subject && subject.length <= 90) {
    return subject;
  }
  if (companyName && subject) {
    return `${companyName} - ${subject.slice(0, 60)}`;
  }
  if (companyName) return `${companyName} - New opportunity`;
  return subject || 'New opportunity';
}

function findExistingDealForMail(deals = [], text = '') {
  const normalizedText = cleanText(text).toLowerCase();
  const openDeals = (deals || []).filter((deal) => !isClosedDealStageId(deal.properties?.dealstage) && String(deal.properties?.hs_is_closed_won).toLowerCase() !== 'true');
  const candidates = openDeals.length ? openDeals : deals || [];
  if (!candidates.length) return null;

  const exactMatch = candidates.find((deal) => {
    const name = cleanText(deal?.properties?.dealname || '').toLowerCase();
    return name && normalizedText.includes(name);
  });
  if (exactMatch) return exactMatch;

  if (candidates.length === 1) return candidates[0];

  return null;
}

async function createDealRecord(client, { identity = {}, summary = {}, companyRecord = null, contactRecord = null, stageCue = null, owner = null } = {}) {
  const dealName = buildDealNameFromMail(identity, summary);
  const pipelineId = stageCue?.pipelineId || '2487085796';
  const stageId = stageCue?.stageId || '4131115724';
  const pipelineLabel = pipelineId === '2487569084' ? 'RFP pipeline' : 'Sales Pipeline';
  const stageLabel = stageCue?.stageLabel || 'Opportunity';
  const properties = {
    dealname: dealName,
    pipeline: pipelineId,
    dealstage: stageId,
  };
  if (owner?.ownerId) {
    properties.hubspot_owner_id = String(owner.ownerId);
  }

  const associations = [];
  const companyId = pickId(companyRecord, 'hs_object_id');
  const contactId = pickId(contactRecord, 'hs_object_id');

  if (companyId) {
    associations.push({
      to: { id: Number(companyId) },
      types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 5 }],
    });
  }

  if (contactId) {
    associations.push({
      to: { id: Number(contactId) },
      types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 3 }],
    });
  }

  const response = await createHubSpotObject(client, 'deals', properties, associations);
  const dealId = pickId(response, 'hs_object_id');
  return {
    record: response,
    action: 'created',
    dealId,
    dealName,
    pipeline: pipelineLabel,
    stage: stageLabel,
    companyName: identity.companyName || companyRecord?.properties?.name || '',
    contactName: identity.contactName || contactRecord?.properties?.firstname || '',
    contactEmail: identity.contactEmail || contactRecord?.properties?.email || '',
    companyId,
    contactId,
    sourceSubject: summary?.subject || '',
    sourceDate: summary?.date || '',
    associations,
  };
}

function findExistingLead(snapshot, identity = {}) {
  const contactEmail = normalizeEmailAddress(identity.contactEmail);
  const contactName = normalizeLeadMatchText(identity.contactName);
  const companyName = normalizeLeadMatchText(identity.companyName);
  const leadName = normalizeLeadMatchText(identity.leadName);
  const companyDomain = extractEmailDomain(identity.companyDomain || identity.contactEmail);
  const companyFromDomain = companyDomain ? normalizeLeadMatchText(domainToCompanyName(companyDomain)) : '';

  return (snapshot?.records || []).find((record) => {
    const recordContactEmail = normalizeEmailAddress(record?.contactEmail);
    const recordContactName = normalizeLeadMatchText(record?.contactName);
    const recordCompanyName = normalizeLeadMatchText(record?.companyName);
    const recordLeadName = normalizeLeadMatchText(record?.name);
    const recordCompanyDomain = extractEmailDomain(record?.contactEmail);
    return (
      (contactEmail && recordContactEmail === contactEmail) ||
      (contactName && leadTextMatches(contactName, recordContactName)) ||
      (companyName && leadTextMatches(companyName, recordCompanyName)) ||
      (leadName && leadTextMatches(leadName, recordLeadName)) ||
      (companyDomain && recordCompanyDomain && companyDomain === recordCompanyDomain) ||
      (companyFromDomain && leadTextMatches(companyFromDomain, recordCompanyName)) ||
      (companyFromDomain && leadTextMatches(companyFromDomain, recordLeadName))
    );
  }) || null;
}

async function resolveDefaultLeadPlacement(client) {
  try {
    const pipelines = await client.listLeadPipelines();
    const pipeline =
      (pipelines?.results || []).find((item) => cleanText(item?.label).toLowerCase() === DEFAULT_LEAD_PIPELINE_LABEL.toLowerCase()) ||
      (pipelines?.results || [])[0] ||
      null;
    const stage =
      (pipeline?.stages || []).find((item) => cleanText(item?.label).toLowerCase() === DEFAULT_LEAD_NEW_STAGE_LABEL.toLowerCase()) ||
      (pipeline?.stages || [])[0] ||
      null;
    return {
      pipelineId: pipeline?.id || DEFAULT_LEAD_PIPELINE_ID,
      pipelineLabel: pipeline?.label || DEFAULT_LEAD_PIPELINE_LABEL,
      stageId: stage?.id || DEFAULT_LEAD_NEW_STAGE_ID,
      stageLabel: stage?.label || DEFAULT_LEAD_NEW_STAGE_LABEL,
    };
  } catch {
    return {
      pipelineId: DEFAULT_LEAD_PIPELINE_ID,
      pipelineLabel: DEFAULT_LEAD_PIPELINE_LABEL,
      stageId: DEFAULT_LEAD_NEW_STAGE_ID,
      stageLabel: DEFAULT_LEAD_NEW_STAGE_LABEL,
    };
  }
}

async function createLeadForMessage({ client, snapshot, message, summary, evidence, owner = null }) {
  const identity = inferLeadIdentityFromMessage(message, evidence);
  const existingLead = findExistingLead(snapshot, identity);
  if (existingLead) {
    return {
      kind: 'lead',
      action: 'existing',
      leadId: existingLead.id || existingLead.contactId || '',
      leadName: existingLead.name || identity.leadName || '',
      companyName: existingLead.companyName || identity.companyName || '',
      contactName: existingLead.contactName || identity.contactName || '',
      contactEmail: existingLead.contactEmail || identity.contactEmail || '',
      companyId: existingLead.companyId || '',
      contactId: existingLead.contactId || '',
      ownerId: existingLead.ownerId || owner?.ownerId || '',
      ownerName: owner?.ownerName || '',
      pipeline: existingLead.pipeline || DEFAULT_LEAD_PIPELINE_LABEL,
      stage: existingLead.stage || DEFAULT_LEAD_NEW_STAGE_LABEL,
      sourceSubject: summary?.subject || '',
      sourceDate: summary?.date || '',
    };
  }

  const resolvedOwner = owner || (await resolveLeadOwnerFromMessage(message).catch(() => null));
  const companyRecord = (await ensureCompanyRecord(identity, resolvedOwner)) || evidence.company || null;
  const companyId = pickId(companyRecord, 'hs_object_id');
  if (!identity.companyName && companyRecord?.properties?.name) {
    identity.companyName = companyRecord.properties.name;
  }
  if (!identity.companyDomain && companyRecord?.properties?.domain) {
    identity.companyDomain = companyRecord.properties.domain;
  }

  const contactIdentity = {
    ...identity,
    companyName: identity.companyName || companyRecord?.properties?.name || '',
    companyDomain: identity.companyDomain || companyRecord?.properties?.domain || '',
  };
  const contactRecord = (await ensureContactRecord(contactIdentity)) || evidence.contact || null;
  const contactId = pickId(contactRecord, 'hs_object_id');
  if (!identity.contactName && contactRecord?.properties) {
    identity.contactName =
      [contactRecord.properties.firstname, contactRecord.properties.lastname].filter(Boolean).join(' ').trim() ||
      identity.contactName ||
      '';
  }
  if (!identity.contactEmail && contactRecord?.properties?.email) {
    identity.contactEmail = contactRecord.properties.email;
  }

  const placement = await resolveDefaultLeadPlacement(client);
  const properties = {
    hs_lead_name: identity.leadName || summary?.subject || 'New lead',
    hs_pipeline: placement.pipelineId,
    hs_pipeline_stage: placement.stageId,
  };
  if (resolvedOwner?.ownerId) {
    properties.hubspot_owner_id = resolvedOwner.ownerId;
  }

  const associations = [];
  if (companyId) {
    associations.push({
      to: { id: Number(companyId) },
      types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 580 }],
    });
  }
  if (contactId) {
    associations.push({
      to: { id: Number(contactId) },
      types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 578 }],
    });
  }

  const created = await client.createLead({ properties, associations });
  const leadId = created?.id || created?.properties?.hs_object_id || '';
  const confirmed = leadId
    ? await client.getLead(leadId, [
        'hs_object_id',
        'hs_lead_name',
        'hs_pipeline',
        'hs_pipeline_stage',
        'hs_primary_company_id',
        'hs_primary_contact_id',
      ])
    : created;

  if (snapshot && Array.isArray(snapshot.records) && leadId) {
    snapshot.records.unshift({
      id: leadId,
      name: confirmed?.properties?.hs_lead_name || properties.hs_lead_name,
      companyName: identity.companyName || companyRecord?.properties?.name || '',
      companyId: confirmed?.properties?.hs_primary_company_id || companyId || '',
      contactName: identity.contactName || contactRecord?.properties?.firstname || '',
      contactId: confirmed?.properties?.hs_primary_contact_id || contactId || '',
      contactEmail: identity.contactEmail || contactRecord?.properties?.email || '',
      ownerId: confirmed?.properties?.hubspot_owner_id || resolvedOwner?.ownerId || '',
      pipeline: placement.pipelineLabel,
      stage: placement.stageLabel,
      createdAt: new Date().toISOString(),
      lastModified: new Date().toISOString(),
      firstOutreachDate: '',
      isOpen: true,
      followUp: describeLeadFollowUp(placement.pipelineLabel, placement.stageLabel),
    });
  }

  return {
    kind: 'lead',
    action: 'created',
    leadId: leadId || '',
    leadName: confirmed?.properties?.hs_lead_name || properties.hs_lead_name,
    companyName: identity.companyName || companyRecord?.properties?.name || '',
    contactName: identity.contactName || contactRecord?.properties?.firstname || '',
    contactEmail: identity.contactEmail || contactRecord?.properties?.email || '',
    companyId: confirmed?.properties?.hs_primary_company_id || companyId || '',
    contactId: confirmed?.properties?.hs_primary_contact_id || contactId || '',
    ownerId: confirmed?.properties?.hubspot_owner_id || resolvedOwner?.ownerId || '',
    ownerName: resolvedOwner?.ownerName || '',
    pipeline: placement.pipelineLabel,
    stage: placement.stageLabel,
    sourceSubject: summary?.subject || '',
    sourceDate: summary?.date || '',
    companyAction: companyRecord ? 'existing' : 'skipped',
    contactAction: contactRecord ? 'existing' : 'skipped',
  };
}

function splitNameCandidates(text = '') {
  return cleanText(text)
    .replace(/^((from|to|cc|for)\s*[:\-]?\s*)/i, '')
    .replace(/\s*<[^>]+>/g, '')
    .split(/\s*(?:,|;|\band\b|&|\/)\s*/i)
    .map((value) => value.replace(/\s+/g, ' ').trim())
    .filter((value) => /^[A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){1,4}$/.test(value));
}

function candidateCompaniesFromText(text = '') {
  const values = new Set();
  const clean = cleanText(text);
  const threadMatches = [...clean.matchAll(/(?:^|[\s(])([A-Z][A-Za-z0-9&.'/-]+(?:\s+[A-Z][A-Za-z0-9&.'/-]+){0,5})\s+(?:thread|sow|proposal|contract|deal|project|estimate|assessment)\b/gi)];
  for (const match of threadMatches) {
    if (match[1]) values.add(match[1].trim());
  }
  const leadingMatches = [...clean.matchAll(/\b(?:for|about|re|fw|fwd|subject)\s*[:\-]?\s*([A-Z][A-Za-z0-9&.'/-]+(?:\s+[A-Z][A-Za-z0-9&.'/-]+){0,5})\b/gi)];
  for (const match of leadingMatches) {
    if (match[1]) values.add(match[1].trim());
  }
  return [...values];
}

function candidateContactsFromMessage(message) {
  const headers = message?.headers || {};
  const combined = collectMailText(message);
  const values = new Set();

  for (const headerValue of [headers.from, headers.to, headers.cc]) {
    for (const part of splitNameCandidates(headerValue || '')) {
      values.add(part);
    }
  }

  const fromToMatch = combined.match(/\bfrom\s+(.+?)\s+to\s+(.+?)(?:[.;\n]|$)/i);
  if (fromToMatch) {
    for (const part of splitNameCandidates(fromToMatch[1])) values.add(part);
    for (const part of splitNameCandidates(fromToMatch[2])) values.add(part);
  }

  const emailMatches = extractEmailAddresses(combined).filter((email) => !isInternalEmailAddress(email));
  for (const email of emailMatches) {
    values.add(email);
  }

  return [...values];
}

async function lookupHubSpotCompany(candidate) {
  const key = cleanText(candidate).toLowerCase();
  if (!key) return null;
  if (companyLookupCache.has(key)) return companyLookupCache.get(key);

  const response = await hubspotCall('search_crm_objects', {
    objectType: 'companies',
    query: candidate,
    properties: ['name', 'domain', 'hs_object_id', 'company_status', 'notes_last_updated', 'hs_lastmodifieddate', 'createdate'],
    limit: 5,
    chatInsights: {
      userIntent: 'Resolve a company name from a mail thread during the daily HubSpot mail sync.',
      satisfaction: 'NEUTRAL',
    },
  });

  const record = (response.results || [])[0] || null;
  companyLookupCache.set(key, record);
  return record;
}

async function lookupHubSpotContact(candidate) {
  const key = cleanText(candidate).toLowerCase();
  if (!key) return null;
  if (contactLookupCache.has(key)) return contactLookupCache.get(key);

  const response = await hubspotCall('search_crm_objects', {
    objectType: 'contacts',
    query: candidate,
    properties: [
      'firstname',
      'lastname',
      'email',
      'work_email',
      'hs_object_id',
      'contact_status',
      'hs_email_last_send_date',
      'hs_email_last_reply_date',
      'notes_last_contacted',
      'notes_last_updated',
      'hs_lastmodifieddate',
      'createdate',
    ],
    limit: 5,
    chatInsights: {
      userIntent: 'Resolve a contact person from a mail thread during the daily HubSpot mail sync.',
      satisfaction: 'NEUTRAL',
    },
  });

  const record = (response.results || [])[0] || null;
  contactLookupCache.set(key, record);
  return record;
}

async function resolveMailEvidence(message) {
  const combined = collectMailText(message);
  const companyCandidates = candidateCompaniesFromText(combined);
  const contactCandidates = candidateContactsFromMessage(message);
  const resolvedContacts = [];
  let resolvedCompany = null;

  for (const candidate of companyCandidates) {
    const company = await lookupHubSpotCompany(candidate);
    if (company) {
      resolvedCompany = company;
      break;
    }
  }

  for (const candidate of contactCandidates) {
    const contact = await lookupHubSpotContact(candidate);
    if (contact) {
      resolvedContacts.push(contact);
    }
  }

  const primaryContact = resolvedContacts[0] || null;
  return {
    company: resolvedCompany,
    contact: primaryContact,
    contacts: resolvedContacts,
    companyCandidates,
    contactCandidates,
  };
}

function dealStageCueFromText(text = '') {
  const combined = cleanText(text);
  for (const cue of DEAL_STAGE_BY_KEYWORD) {
    if (cue.pattern.test(combined)) {
      return cue;
    }
  }
  for (const cue of DEAL_STAGE_INFERENCE_RULES) {
    if (cue.pattern.test(combined)) {
      return cue;
    }
  }
  return null;
}

function assessDealStageCueFromText(text = '', currentStageId = '') {
  const combined = cleanText(text);
  let bestCue = null;
  let bestScore = -1;

  for (const rule of DEAL_STAGE_ASSESSMENT_RULES) {
    if (!rule.patterns.some((pattern) => pattern.test(combined))) continue;
    let score = rule.score;

    const ruleRank = dealStageRank(rule.stageId);
    const currentRank = dealStageRank(currentStageId);
    if (currentStageId && ruleRank > 0) {
      if (ruleRank > currentRank) {
        score += 5;
      } else if (ruleRank === currentRank) {
        score -= 5;
      } else {
        score -= 10;
      }
    }

    if (currentStageId === '4131115725' && rule.stageId === '4131115726' && /\bapproval\b|\bapproved\b|\bgreen light\b|\bgo ahead\b/i.test(combined)) {
      score += 10;
    }

    if (currentStageId === '4131115726' && rule.stageId === '4131115728' && /\b(signed|awarded|final approval|sign-off|go ahead|green light)\b/i.test(combined)) {
      score += 10;
    }

    if (score > bestScore) {
      bestScore = score;
      bestCue = {
        pipelineId: '2487085796',
        stageId: rule.stageId,
        stageLabel: rule.stageLabel,
      };
    }
  }

  if (bestCue) return bestCue;
  return dealStageCueFromText(text);
}

function dealStageLabel(stageId = '') {
  return DEAL_STAGE_LABEL_BY_ID.get(String(stageId || '').trim()) || String(stageId || '').trim();
}

function dealStageRank(stageId = '') {
  return DEAL_STAGE_RANK.get(String(stageId || '').trim()) || 0;
}

function isClosedDealStageId(stageId = '') {
  return /^(242470045|242470046|242470165|4131115728|4131115729|4131142371|4131142372)$/.test(String(stageId || '').trim());
}

async function associatedDeals(companyId) {
  if (!companyId) return [];
  const response = await hubspotCall('search_crm_objects', {
    objectType: 'deals',
    properties: [
      'dealname',
      'pipeline',
      'dealstage',
      'closedate',
      'notes_last_contacted',
      'notes_last_updated',
      'createdate',
      'hs_is_closed_won',
      'hs_is_closed',
      'hs_lastmodifieddate',
      'amount',
    ],
    limit: 20,
    sorts: [{ propertyName: 'hs_lastmodifieddate', direction: 'DESCENDING' }],
    filterGroups: [
      {
        filters: [{ propertyName: 'dealname', operator: 'HAS_PROPERTY' }],
        associatedWith: [{ objectType: 'companies', operator: 'EQUAL', objectIdValues: [Number(companyId)] }],
      },
    ],
    chatInsights: {
      userIntent: 'Review associated deals for a daily HubSpot mail sync.',
      satisfaction: 'NEUTRAL',
    },
  });
  return response.results || [];
}

async function searchRfpDealsByText(text = '') {
  const query = cleanText(text).trim();
  if (!query) return [];

  const response = await hubspotCall('search_crm_objects', {
    objectType: 'deals',
    query,
    properties: [
      'dealname',
      'pipeline',
      'dealstage',
      'closedate',
      'notes_last_contacted',
      'notes_last_updated',
      'createdate',
      'hs_is_closed_won',
      'hs_is_closed',
      'hs_lastmodifieddate',
      'amount',
    ],
    limit: 10,
    chatInsights: {
      userIntent: 'Resolve an RFP deal from an inbound notification during the daily HubSpot mail sync.',
      satisfaction: 'NEUTRAL',
    },
  });

  return (response.results || []).filter((deal) => String(deal?.properties?.pipeline || '') === RFP_PIPELINE_ID);
}

function chooseRfpDealForMail(deals = [], text = '') {
  const normalizedText = cleanText(text).toLowerCase();
  const openDeals = (deals || []).filter(
    (deal) => !isClosedDealStageId(deal.properties?.dealstage) && String(deal.properties?.hs_is_closed_won).toLowerCase() !== 'true',
  );
  const candidates = openDeals.length ? openDeals : deals || [];
  if (!candidates.length) return null;

  const exactMatch = candidates.find((deal) => {
    const name = cleanText(deal?.properties?.dealname || '').toLowerCase();
    return name && normalizedText.includes(name);
  });
  if (exactMatch) return exactMatch;

  if (candidates.length === 1) return candidates[0];

  return null;
}

function chooseDealForStageCue(deals = [], text = '') {
  const normalizedText = cleanText(text).toLowerCase();
  const openDeals = (deals || []).filter((deal) => !isClosedDealStageId(deal.properties?.dealstage) && String(deal.properties?.hs_is_closed_won).toLowerCase() !== 'true');
  const candidates = openDeals.length ? openDeals : deals || [];
  if (!candidates.length) return null;

  const exactMatch = candidates.find((deal) => {
    const name = cleanText(deal?.properties?.dealname || '').toLowerCase();
    return name && normalizedText.includes(name);
  });
  if (exactMatch) return exactMatch;

  if (candidates.length === 1) return candidates[0];

  return null;
}

async function updateDealStageMove({ company, summary, text }) {
  const deals = await associatedDeals(company?.properties?.hs_object_id || company?.id || '');
  const deal = chooseDealForStageCue(deals, text);
  if (!deal) return null;

  const currentStageId = String(deal.properties?.dealstage || '').trim();
  const cue = assessDealStageCueFromText(text, currentStageId);
  if (!cue) return null;
  if (currentStageId === cue.stageId) {
    return null;
  }

  const updateResponse = await hubspotCall('manage_crm_objects', {
    confirmationStatus: 'CONFIRMED',
    updateRequest: {
      objects: [
        {
          objectType: 'DEAL',
          objectId: Number(deal.id || deal.properties?.hs_object_id),
          properties: {
            pipeline: cue.pipelineId,
            dealstage: cue.stageId,
          },
        },
      ],
    },
  });

  const updatedDeal = updateResponse?.updateResults?.results?.[0]?.object || null;
  return {
    kind: 'deal',
    companyName: asText(company?.properties?.name || ''),
    dealId: asText(deal.id || deal.properties?.hs_object_id || ''),
    dealName: asText(deal.properties?.dealname || ''),
    pipelineId: cue.pipelineId,
    pipeline: cue.pipelineId === '2487569084' ? 'RFP pipeline' : 'Sales Pipeline',
    fromStage: dealStageLabel(currentStageId),
    toStage: cue.stageLabel,
    sourceSubject: asText(summary?.subject || ''),
    sourceDate: asText(summary?.date || ''),
    changedAt: asText(updatedDeal?.updatedAt || new Date().toISOString()),
  };
}

async function processRfpMail({
  message,
  summary,
  evidence = {},
  mailText = '',
  mailOwner = null,
  leadClient = null,
  allowCreate = false,
  identityHint = null,
}) {
  const companyId = pickId(evidence.company, 'hs_object_id');
  const searchText = cleanText([summary?.subject, summary?.snippet, mailText].filter(Boolean).join(' '));
  let deals = [];

  if (companyId) {
    deals = (await associatedDeals(companyId)).filter((deal) => String(deal?.properties?.pipeline || '') === RFP_PIPELINE_ID);
  }

  if (!deals.length) {
    deals = await searchRfpDealsByText(searchText);
  }

  const deal = chooseRfpDealForMail(deals, searchText);
  if (!deal && !allowCreate) {
    return {
      handled: false,
      reason: 'No matching RFP deal could be resolved from the mail.',
    };
  }

  const defaultCue = {
    pattern: /\bqualified rfp\b/i,
    pipelineId: RFP_PIPELINE_ID,
    stageId: '4131142366',
    stageLabel: 'Qualified RFP',
  };
  const currentStageId = String(deal?.properties?.dealstage || '').trim();
  const explicitCue = rfpStageCueFromMail(mailText, message);
  const currentRank = rfpStageRank(currentStageId);
  const basecampMeetingCue =
    !explicitCue && isBasecampRfpMail(message) && rfpMeetingCandidate(searchText) && currentRank < rfpStageRank('4131142366')
      ? {
          pattern: /\b(meeting|sales meeting|kickoff|discovery|alignment|review|next step|follow[- ]?up|call|conversation)\b/i,
          pipelineId: RFP_PIPELINE_ID,
          stageId: '4131142366',
          stageLabel: 'Qualified RFP',
        }
      : null;
  const cue = explicitCue || basecampMeetingCue || (allowCreate ? defaultCue : null);
  let stageMove = null;
  const rfpDates = extractRfpImportantDates(mailText || searchText);

  if (deal && cue && currentStageId !== cue.stageId) {
    const updateResponse = await hubspotCall('manage_crm_objects', {
      confirmationStatus: 'CONFIRMED',
      updateRequest: {
        objects: [
          {
            objectType: 'DEAL',
            objectId: Number(deal.id || deal.properties?.hs_object_id),
            properties: {
              pipeline: cue.pipelineId,
              dealstage: cue.stageId,
            },
          },
        ],
      },
    });

    const updatedDeal = updateResponse?.updateResults?.results?.[0]?.object || null;
    stageMove = {
      kind: 'deal',
      action: 'stage-updated',
      companyName: asText(evidence.company?.properties?.name || ''),
      dealId: asText(deal.id || deal.properties?.hs_object_id || ''),
      dealName: asText(deal.properties?.dealname || ''),
      pipelineId: cue.pipelineId,
      pipeline: RFP_PIPELINE_LABEL,
      fromStage: dealStageLabel(currentStageId),
      toStage: cue.stageLabel,
      sourceSubject: asText(summary?.subject || ''),
      sourceDate: asText(summary?.date || ''),
      changedAt: asText(updatedDeal?.updatedAt || new Date().toISOString()),
    };
  }

  if (!deal && allowCreate) {
    if (!leadClient) {
      return {
        handled: false,
        reason: 'Lead client unavailable; RFP deal creation was requested but could not run.',
      };
    }
    const identity = identityHint || inferRfpIdentityFromText(mailText, evidence);
    const companyRecord = (await ensureCompanyRecord(identity, mailOwner)) || evidence.company || null;
    const contactRecord =
      (await ensureContactRecord({
        ...identity,
        companyName: identity.companyName || companyRecord?.properties?.name || '',
        companyDomain: identity.companyDomain || companyRecord?.properties?.domain || '',
      })) || evidence.contact || null;
    const createAction = await createDealRecord(leadClient, {
      identity,
      summary,
      companyRecord,
      contactRecord,
      stageCue: cue || defaultCue,
      owner: mailOwner,
    });
    const note = await createMailCommunicationNote({
      message,
      summary,
      context: {
        kind: 'rfp',
        stageChange: `created in ${createAction.stage || RFP_PIPELINE_LABEL}`,
        rfpDates,
      },
      ownerId: mailOwner?.ownerId || createAction.ownerId || '',
      targets: [
        { id: createAction.dealId, type: 'DEAL' },
      ],
    });

    return {
      handled: true,
      action: 'created',
      dealId: createAction.dealId,
      dealName: createAction.dealName,
      companyName: createAction.companyName || identity.companyName || '',
      contactName: createAction.contactName || identity.contactName || '',
      contactEmail: createAction.contactEmail || identity.contactEmail || '',
      pipeline: createAction.pipeline || RFP_PIPELINE_LABEL,
      fromStage: '',
      toStage: createAction.stage || cue?.stageLabel || defaultCue.stageLabel,
      sourceSubject: asText(summary?.subject || ''),
      sourceDate: asText(summary?.date || ''),
      noteId: note?.noteId || '',
      noteUrl: note?.noteUrl || '',
      stageUpdated: false,
      companyAction: 'ensured',
      contactAction: 'ensured',
      qaSubmissionDate: rfpDates.qaSubmissionDate || '',
      qaReturnDate: rfpDates.qaReturnDate || '',
      submissionDueDay: rfpDates.submissionDueDay || '',
    };
  }

  const note = await createMailCommunicationNote({
    message,
    summary,
    context: {
      kind: 'rfp',
      stageChange: stageMove ? `${stageMove.fromStage || 'Unassigned'} -> ${stageMove.toStage || 'Unassigned'}` : 'context only',
      rfpDates,
    },
    ownerId: mailOwner?.ownerId || asText(deal?.properties?.hubspot_owner_id || ''),
    targets: [
      { id: asText(deal.id || deal.properties?.hs_object_id || ''), type: 'DEAL' },
    ],
  });

  return {
    handled: true,
    action: stageMove ? 'updated' : 'context',
    dealId: asText(deal.id || deal.properties?.hs_object_id || ''),
    dealName: asText(deal.properties?.dealname || ''),
    companyName: asText(evidence.company?.properties?.name || ''),
    pipeline: RFP_PIPELINE_LABEL,
    fromStage: stageMove?.fromStage || dealStageLabel(currentStageId),
    toStage: stageMove?.toStage || dealStageLabel(currentStageId),
    sourceSubject: asText(summary?.subject || ''),
    sourceDate: asText(summary?.date || ''),
    noteId: note?.noteId || '',
    noteUrl: note?.noteUrl || '',
    stageUpdated: Boolean(stageMove),
    qaSubmissionDate: rfpDates.qaSubmissionDate || '',
    qaReturnDate: rfpDates.qaReturnDate || '',
    submissionDueDay: rfpDates.submissionDueDay || '',
  };
}

async function processRfpPursueMail({
  message,
  summary,
  evidence = {},
  mailText = '',
  mailOwner = null,
  leadClient = null,
}) {
  const blocks = splitRfpPursueBlocks(mailText).filter((block) => cleanText(block).length >= 3);
  const results = [];

  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    const identityHint = inferRfpIdentityFromText(block, evidence);
    const blockSummary = {
      ...summary,
      subject: summary?.subject || `RFP's to pursue`,
      snippet: stripTags(block).slice(0, 500),
    };
    const entryMessage = {
      ...message,
      snippet: stripTags(block).slice(0, 5000),
      body: block,
      headers: {
        ...(message?.headers || {}),
        subject: `${summary?.subject || "RFP's to pursue"}${blocks.length > 1 ? ` [${index + 1}/${blocks.length}]` : ''}`,
      },
    };
    try {
      const result = await processRfpMail({
        message: entryMessage,
        summary: blockSummary,
        evidence,
        mailText: block,
        mailOwner,
        leadClient,
        allowCreate: true,
        identityHint,
      });
      if (result?.handled) {
        results.push({
          ...result,
          sourceSubject: result.sourceSubject || `${summary?.subject || 'RFP\'s to pursue'}${blocks.length > 1 ? ` [${index + 1}/${blocks.length}]` : ''}`,
        });
      }
    } catch (error) {
      results.push({
        handled: false,
        action: 'error',
        sourceSubject: `${summary?.subject || 'RFP\'s to pursue'}${blocks.length > 1 ? ` [${index + 1}/${blocks.length}]` : ''}`,
        error: error?.message || String(error),
      });
    }
  }

  return results;
}

function buildLeadNote(snapshot) {
  if (!snapshot) return 'Lead data is not shown yet because the leads sidecar is not configured.';
  const pipelineBits = Object.entries(snapshot.byPipeline || {}).map(([name, count]) => `${cleanHubSpotLabel(name)}: ${count}`);
  const stageBits = Object.entries(snapshot.byStage || {}).map(([name, count]) => `${cleanHubSpotLabel(name)}: ${count}`);
  const parts = [`Lead records reviewed: ${snapshot.total || 0}.`];
  if (pipelineBits.length) parts.push(`Lead pipelines: ${pipelineBits.join(', ')}.`);
  if (stageBits.length) parts.push(`Lead stages: ${stageBits.slice(0, 8).join(', ')}${stageBits.length > 8 ? ', ...' : ''}.`);
  return parts.join(' ');
}

function leadFollowUpRecords(snapshot) {
  return (snapshot?.records || [])
    .filter((record) => record?.followUp?.relevant)
    .sort((a, b) => {
      const aKey = `${a.pipeline || ''} ${a.stage || ''} ${a.name || ''}`.toLowerCase();
      const bKey = `${b.pipeline || ''} ${b.stage || ''} ${b.name || ''}`.toLowerCase();
      return aKey.localeCompare(bKey);
    });
}

function leadFollowUpBlock(record) {
  const followUp = record.followUp || {};
  const lines = [
    `### ${record.name || 'Untitled lead'}`,
    `- Pipeline: ${record.pipeline || 'Unassigned'}`,
    `- Stage: ${record.stage || 'Unassigned'}`,
    `- Next outreach if no response: ${followUp.timing || 'Review manually'}`,
  ];
  if (followUp.note) lines.push(`- Note: ${followUp.note}`);
  return lines.join('\n');
}

function summarizeDealStageMoves(updatedRecords = []) {
  return (updatedRecords || [])
    .filter((record) => {
      const kind = String(record?.kind || record?.type || '').toLowerCase();
      return kind === 'deal';
    })
    .map((record) => {
      const dealName = record.dealName || record.name || record.deal || 'Untitled deal';
      const companyName = record.companyName ? ` (${record.companyName})` : '';
      const fromStage = record.fromStage || record.previousStage || '';
      const toStage = record.toStage || record.stage || record.stageName || '';
      if (fromStage && toStage) {
        return `- ${dealName}${companyName}: ${fromStage} -> ${toStage}`;
      }
      if (toStage) {
        return `- ${dealName}${companyName}: moved to ${toStage}`;
      }
      return `- ${dealName}${companyName}: deal update recorded`;
    });
}

function summarizeStatusUpdates(statusUpdates = []) {
  return (statusUpdates || [])
    .filter((record) => String(record?.kind || '').toLowerCase() === 'status')
    .map((record) => {
      const name = record.objectName || record.objectId || 'Untitled record';
      return `- ${record.objectType || 'record'} ${name}: ${record.fromStatus || 'unset'} -> ${record.toStatus || 'unset'} (${record.propertyName || 'status'})`;
    });
}

async function main() {
  await fs.mkdir(reportDir, { recursive: true });

  const existingState = await loadExistingState();
  const processedMessageIds = new Set(
    Array.isArray(existingState?.processedMessageIds)
      ? existingState.processedMessageIds.map((value) => String(value || '')).filter(Boolean)
      : [],
  );
  const lastSuccessfulRun = existingState?.lastSuccessfulRun ? new Date(existingState.lastSuccessfulRun) : null;

  const state = {
    runType: 'daily-mail-hubspot-sync',
    sourceQuery: SOURCE_QUERY,
    windowDays: WINDOW_DAYS,
    lastSuccessfulRun: null,
    processedMessageIds: [],
    updatedRecords: [],
    rfpUpdates: [],
    dealCreations: [],
    leadCreations: [],
    skippedItems: [],
    notes: [],
  };
  state.processedMessageIds = [...processedMessageIds];
  state.lastSuccessfulRun = existingState?.lastSuccessfulRun || null;

  let leadSnapshot = null;
  try {
    leadSnapshot = await getHubSpotLeadSnapshot();
  } catch (error) {
    state.notes.push(`Lead snapshot unavailable: ${error?.message || String(error)}`);
  }

  const leadNote = buildLeadNote(leadSnapshot);
  state.notes.push(leadNote);
  state.notes.push('Direct prospect mails with external recipients and outreach intent are now eligible for lead creation.');

  const candidateMessages = await gmailSearch(SOURCE_QUERY);
  const firstAttemptCandidates = [];
  const dealCreations = [];
  const leadCreations = [];
  const rfpUpdates = [];
  const skipped = [];
  const updatedRecords = [];
  const statusUpdates = [];
  const seenDealIds = new Set();
  const seenStatusKeys = new Set();
  let leadClient = null;
  try {
    leadClient = await loadHubSpotLeadsClient();
  } catch (error) {
    state.notes.push(`Lead client unavailable: ${error?.message || String(error)}`);
  }

  for (const messageRef of candidateMessages.slice(0, 20)) {
    try {
      const messageId = String(messageRef?.id || '');
      if (!messageId || processedMessageIds.has(messageId)) {
        continue;
      }
      const full = await gmailGet(messageRef.id);
      const summary = summariseMessage(full);
      const parsedMessageDate = parseMailTimestamp(full, summary);
      if (lastSuccessfulRun && parsedMessageDate <= lastSuccessfulRun) {
        processedMessageIds.add(messageId);
        continue;
      }
      processedMessageIds.add(messageId);
      const evidence = await resolveMailEvidence(full);
      let dealUpdatedThisMessage = false;
      summary.company = asText(evidence.company?.properties?.name || evidence.company?.properties?.domain || '');
      summary.contact = asText(
        evidence.contact
          ? [evidence.contact.properties?.firstname, evidence.contact.properties?.lastname].filter(Boolean).join(' ').trim() ||
              evidence.contact.properties?.email ||
              evidence.contact.properties?.work_email ||
              ''
          : '',
      );
      const isRfpNotification = isRfpMail(full) || isBasecampRfpMail(full);
      const mailText = collectMailText(full);
      const mailOwner = await resolveLeadOwnerFromMessage(full).catch(() => null);
      const stageCue = assessDealStageCueFromText(mailText);
      const dealCandidate = dealCreationCandidate(full);

      if (evidence.company && !isRfpNotification) {
        try {
          const dealUpdate = await updateDealStageMove({
            company: evidence.company,
            summary,
            text: collectMailText(full),
          });
          if (dealUpdate && !seenDealIds.has(dealUpdate.dealId)) {
            seenDealIds.add(dealUpdate.dealId);
            updatedRecords.push(dealUpdate);
            dealUpdatedThisMessage = true;
          }
        } catch (error) {
          skipped.push({
            subject: summary.subject,
            reason: `Could not update deal stage: ${error?.message || String(error)}`,
          });
        }
      }

      const ownerAmbiguous = (evidence.company || dealCandidate || firstAttemptCandidate(full)) && !mailOwner;
      const stageAmbiguous = (dealCandidate || stageCue) && !stageCue && !isRfpNotification && !isInternalMail(full);
      if (ownerAmbiguous || stageAmbiguous) {
        const questionBits = [];
        if (summary.company) questionBits.push(`company=${summary.company}`);
        if (summary.contact) questionBits.push(`contact=${summary.contact}`);
        if (ownerAmbiguous) questionBits.push('owner unclear');
        if (stageAmbiguous) questionBits.push('stage unclear');
        const question = `Daily mail sync needs help for "${summary.subject || 'untitled'}"${questionBits.length ? ` (${questionBits.join(', ')})` : ''}.`;
        try {
          await sendTelegramMessage(question);
        } catch (error) {
          skipped.push({
            subject: summary.subject,
            reason: `Could not broadcast ambiguity question: ${error?.message || String(error)}`,
          });
        }
        skipped.push({
          subject: summary.subject,
          reason: `Ambiguous ${ownerAmbiguous && stageAmbiguous ? 'owner and stage' : ownerAmbiguous ? 'owner' : 'stage'}; escalated via Telegram.`,
        });
        continue;
      }

      if (isRfpPursueMail(full)) {
        try {
          const rfpPursueUpdates = await processRfpPursueMail({
            message: full,
            summary,
            evidence,
            mailText,
            mailOwner,
            leadClient,
          });
          const handledUpdates = rfpPursueUpdates.filter((item) => item?.handled);
          if (handledUpdates.length) {
            rfpUpdates.push(...handledUpdates);
            continue;
          }
          const firstError = rfpPursueUpdates.find((item) => item?.error)?.error;
          skipped.push({
            subject: summary.subject,
            reason: firstError || 'RFP pursue mail did not yield any create/update actions.',
          });
        } catch (error) {
          skipped.push({
            subject: summary.subject,
            reason: `Could not process RFP pursue mail: ${error?.message || String(error)}`,
          });
        }
        continue;
      }

      if (isRfpNotification) {
        try {
          const rfpUpdate = await processRfpMail({
            message: full,
            summary,
            evidence,
            mailText,
            mailOwner,
            leadClient,
          });
          if (rfpUpdate?.handled) {
            rfpUpdates.push(rfpUpdate);
            continue;
          }
          skipped.push({
            subject: summary.subject,
            reason: rfpUpdate?.reason || 'RFP notification could not be matched to a deal in the RFP pipeline.',
          });
        } catch (error) {
          skipped.push({
            subject: summary.subject,
            reason: `Could not process RFP notification: ${error?.message || String(error)}`,
          });
        }
        continue;
      }

      if (isInternalMail(full)) {
        skipped.push({ subject: summary.subject, reason: 'Internal Seamgen mail or internal routing thread.' });
        continue;
      }

      if ((dealCandidate || stageCue) && (!evidence.company || !dealUpdatedThisMessage)) {
        const dealIdentity = inferLeadIdentityFromMessage(full, evidence);
        if (!summary.company && dealIdentity.companyName) summary.company = dealIdentity.companyName;
        if (!summary.contact && dealIdentity.contactName) summary.contact = dealIdentity.contactName;

        if (!leadClient) {
          skipped.push({
            subject: summary.subject,
            reason: 'Lead client unavailable; candidate detected but no HubSpot deal was created.',
          });
          continue;
        }

        try {
          const companyRecord = (await ensureCompanyRecord(dealIdentity, mailOwner)) || evidence.company || null;
          const companyResult = { action: companyRecord ? 'existing' : 'skipped' };
          const contactRecord = (await ensureContactRecord({
            ...dealIdentity,
            companyName: dealIdentity.companyName || companyRecord?.properties?.name || '',
            companyDomain: dealIdentity.companyDomain || companyRecord?.properties?.domain || '',
          })) || evidence.contact || null;
          const contactResult = { action: contactRecord ? 'existing' : 'skipped' };
          const companyId = pickId(companyRecord, 'hs_object_id');
          if (companyId) {
            const associated = await associatedDeals(companyId);
            const existingDeal = findExistingDealForMail(associated, mailText);
          if (existingDeal) {
              const existingDealResult = {
                kind: 'deal',
                action: 'existing',
                dealId: pickId(existingDeal, 'hs_object_id'),
                dealName: asText(existingDeal?.properties?.dealname || ''),
                companyName: asText(companyRecord?.properties?.name || dealIdentity.companyName || ''),
                contactName: asText(contactRecord?.properties?.firstname || dealIdentity.contactName || ''),
                contactEmail: asText(contactRecord?.properties?.email || dealIdentity.contactEmail || ''),
                pipeline: String(existingDeal?.properties?.pipeline || '') === '2487569084' ? 'RFP pipeline' : 'Sales Pipeline',
                stage: dealStageLabel(existingDeal?.properties?.dealstage || ''),
                ownerId: mailOwner?.ownerId || asText(existingDeal?.properties?.hubspot_owner_id || ''),
                ownerName: mailOwner?.ownerName || '',
                sourceSubject: summary.subject || '',
                sourceDate: summary.date || '',
                companyAction: companyResult.action,
                contactAction: contactResult.action,
              };
              dealCreations.push(existingDealResult);
              try {
                await createMailCommunicationNote({
                  message: full,
                  summary,
                  context: { kind: 'deal' },
                  ownerId: mailOwner?.ownerId || existingDealResult.ownerId || '',
                  targets: [
                    { id: existingDealResult.dealId, type: 'DEAL' },
                  ],
                });
              } catch (error) {
                skipped.push({
                  subject: summary.subject,
                  reason: `Could not create deal mail communication: ${error?.message || String(error)}`,
                });
              }
              continue;
            }
          }
          const dealAction = await createDealRecord(leadClient, {
            identity: dealIdentity,
            summary,
            companyRecord,
            contactRecord,
            stageCue: stageCue || undefined,
            owner: mailOwner,
          });
          dealCreations.push({
            ...dealAction,
            companyAction: companyResult.action,
            contactAction: contactResult.action,
          });
          try {
            await createMailCommunicationNote({
              message: full,
              summary,
              context: { kind: 'deal' },
              ownerId: mailOwner?.ownerId || dealAction.ownerId || '',
              targets: [
                { id: dealAction.dealId, type: 'DEAL' },
              ],
            });
          } catch (error) {
            skipped.push({
              subject: summary.subject,
              reason: `Could not create deal mail communication: ${error?.message || String(error)}`,
            });
          }
          continue;
        } catch (error) {
          skipped.push({
            subject: summary.subject,
            reason: `Could not create deal: ${error?.message || String(error)}`,
          });
          continue;
        }
      }

      const isCandidate = firstAttemptCandidate(full);
      if (isCandidate) {
        const leadIdentity = inferLeadIdentityFromMessage(full, evidence);
        if (!summary.company && leadIdentity.companyName) summary.company = leadIdentity.companyName;
        if (!summary.contact && leadIdentity.contactName) summary.contact = leadIdentity.contactName;
        if (summary.company || summary.contact) {
          summary.evidence = [
            summary.company ? `company: ${summary.company}` : '',
            summary.contact ? `contact: ${summary.contact}` : '',
          ]
            .filter(Boolean)
            .join('; ');
        } else if (leadIdentity.leadName) {
          summary.evidence = `lead: ${leadIdentity.leadName}`;
        }
        firstAttemptCandidates.push(summary);

        if (leadClient) {
          try {
            const leadAction = await createLeadForMessage({
              client: leadClient,
              snapshot: leadSnapshot,
              message: full,
              summary,
              evidence,
              owner: mailOwner,
            });
            leadCreations.push(leadAction);
            try {
              await createMailCommunicationNote({
                message: full,
                summary,
                context: { kind: 'lead' },
                ownerId: mailOwner?.ownerId || leadAction.ownerId || '',
                targets: [
                  { id: leadAction.leadId, type: 'LEAD' },
                ],
              });
            } catch (error) {
              skipped.push({
                subject: summary.subject,
                reason: `Could not create lead mail communication: ${error?.message || String(error)}`,
              });
            }
          } catch (error) {
            skipped.push({
              subject: summary.subject,
              reason: `Could not create lead: ${error?.message || String(error)}`,
            });
          }
        } else {
          skipped.push({
            subject: summary.subject,
            reason: 'Lead client unavailable; candidate detected but no HubSpot lead was created.',
          });
        }
      } else {
        const evidenceBits = [];
        if (summary.company) evidenceBits.push(`company: ${summary.company}`);
        if (summary.contact) evidenceBits.push(`contact: ${summary.contact}`);
        skipped.push({
          subject: summary.subject,
          reason: evidenceBits.length
            ? `Ambiguous external mapping; resolved ${evidenceBits.join(', ')} but no safe HubSpot lead action yet.`
            : 'Ambiguous external mapping; no safe HubSpot lead action without explicit company or recipient evidence.',
        });
      }
    } catch (error) {
      skipped.push({ subject: asText(messageRef.subject || ''), reason: `Could not inspect message: ${error?.message || String(error)}` });
    }
  }

  const reportLines = [];
  reportLines.push(`# Daily Mail-HubSpot Sync - ${new Date().toISOString().slice(0, 10)}`);
  reportLines.push('');
  reportLines.push(`- Gmail query: ${SOURCE_QUERY}`);
  reportLines.push(`- Window: last ${WINDOW_DAYS} days`);
  reportLines.push(`- ${leadNote}`);
  reportLines.push(`- Deal stage moves recorded: ${updatedRecords.length}`);
  reportLines.push(`- RFP updates recorded: ${rfpUpdates.length}`);
  reportLines.push(`- Deal creations recorded: ${dealCreations.length}`);
  reportLines.push(`- Status updates recorded: ${statusUpdates.length}`);
  reportLines.push(`- Lead creations recorded: ${leadCreations.length}`);
  reportLines.push('');
  if (updatedRecords.length) {
    reportLines.push('## Deal Stage Moves');
    reportLines.push('');
    for (const move of updatedRecords) {
      reportLines.push(`- ${move.dealName || 'Untitled deal'} (${move.companyName || 'Unknown company'}): ${move.fromStage || 'Unassigned'} -> ${move.toStage || 'Unassigned'}`);
    }
    reportLines.push('');
  }
  if (rfpUpdates.length) {
    reportLines.push('## RFP Updates');
    reportLines.push('');
    for (const update of rfpUpdates) {
      const actionLabel = update.action || (update.stageUpdated ? 'updated' : 'context');
      reportLines.push(`- ${update.dealName || 'Untitled deal'} (${update.companyName || 'Unknown company'}) - ${actionLabel}`);
      reportLines.push(`  - Pipeline: ${update.pipeline || 'RFP pipeline'}`);
      if (update.stageUpdated) {
        reportLines.push(`  - Stage: ${update.fromStage || 'Unassigned'} -> ${update.toStage || 'Unassigned'}`);
      } else {
        reportLines.push(`  - Stage: unchanged (${update.fromStage || 'Unassigned'})`);
      }
      reportLines.push('  - Context: note logged');
      reportLines.push(`  - Source: ${update.sourceSubject || 'Unknown subject'}`);
      reportLines.push(`  - Q&A submission date: ${update.qaSubmissionDate || 'not found'}`);
      reportLines.push(`  - Q&A return date: ${update.qaReturnDate || 'not found'}`);
      reportLines.push(`  - Due day for submission: ${update.submissionDueDay || 'not found'}`);
      if (update.contactName || update.contactEmail) {
        reportLines.push(`  - Contact: ${update.contactName || 'Unknown contact'}${update.contactEmail ? ` <${update.contactEmail}>` : ''}`);
      }
      if (update.companyAction) reportLines.push(`  - Company action: ${update.companyAction}`);
      if (update.contactAction) reportLines.push(`  - Contact action: ${update.contactAction}`);
      if (update.noteId) reportLines.push(`  - Note: ${update.noteId}`);
      if (update.error) reportLines.push(`  - Error: ${update.error}`);
    }
    reportLines.push('');
  }
  if (statusUpdates.length) {
    reportLines.push('## Activity Status Updates');
    reportLines.push('');
    for (const update of statusUpdates) {
      reportLines.push(`- ${update.objectType || 'record'} ${update.objectName || update.objectId || 'Untitled record'}: ${update.fromStatus || 'unset'} -> ${update.toStatus || 'unset'} (${update.propertyName || 'status'})`);
    }
    reportLines.push('');
  }
  if (dealCreations.length) {
    reportLines.push('## Deal Creations');
    reportLines.push('');
    for (const deal of dealCreations) {
      reportLines.push(`- ${deal.dealName || 'Untitled deal'}`);
      if (deal.companyName || deal.companyId) {
        reportLines.push(`  - Company: ${deal.companyName || 'Unknown company'}${deal.companyId ? ` (${deal.companyId})` : ''}`);
      }
      if (deal.contactName || deal.contactEmail) {
        reportLines.push(`  - Contact: ${deal.contactName || 'Unknown contact'}${deal.contactEmail ? ` <${deal.contactEmail}>` : ''}`);
      }
      reportLines.push(`  - Pipeline: ${deal.pipeline || 'Unassigned'}`);
      reportLines.push(`  - Stage: ${deal.stage || 'Unassigned'}`);
      if (deal.sourceSubject) reportLines.push(`  - Source: ${deal.sourceSubject}`);
    }
    reportLines.push('');
  }
  if (leadCreations.length) {
    reportLines.push('## Lead Creations');
    reportLines.push('');
    for (const lead of leadCreations) {
      reportLines.push(`- ${lead.leadName || 'Untitled lead'}${lead.action === 'existing' ? ' (existing)' : ''}`);
      if (lead.companyName || lead.companyId) {
        reportLines.push(`  - Company: ${lead.companyName || 'Unknown company'}${lead.companyId ? ` (${lead.companyId})` : ''}`);
        if (lead.companyAction) reportLines.push(`  - Company action: ${lead.companyAction}`);
      }
      if (lead.contactName || lead.contactEmail) {
        reportLines.push(`  - Contact: ${lead.contactName || 'Unknown contact'}${lead.contactEmail ? ` <${lead.contactEmail}>` : ''}`);
        if (lead.contactAction) reportLines.push(`  - Contact action: ${lead.contactAction}`);
      }
      reportLines.push(`  - Pipeline: ${lead.pipeline || 'Unassigned'}`);
      reportLines.push(`  - Stage: ${lead.stage || 'Unassigned'}`);
      if (lead.sourceSubject) reportLines.push(`  - Source: ${lead.sourceSubject}`);
    }
    reportLines.push('');
  }
  reportLines.push('## Lead Follow-up Timing');
  reportLines.push('');
  const leadRecords = leadFollowUpRecords(leadSnapshot);
  if (leadRecords.length) {
    for (const record of leadRecords) {
      reportLines.push(leadFollowUpBlock(record));
      reportLines.push('');
    }
  } else {
    reportLines.push('- No active outreach leads found.');
    reportLines.push('');
  }

  reportLines.push('## First-Attempt Candidates Today');
  reportLines.push('');
  if (firstAttemptCandidates.length) {
    for (const candidate of firstAttemptCandidates) {
      reportLines.push(`### ${candidate.subject || 'Untitled message'}`);
      reportLines.push(`- From: ${candidate.from || 'unknown'}`);
      reportLines.push(`- Date: ${candidate.date || 'unknown'}`);
      if (candidate.company) reportLines.push(`- Company: ${candidate.company}`);
      if (candidate.contact) reportLines.push(`- Contact: ${candidate.contact}`);
      if (candidate.evidence) reportLines.push(`- Evidence: ${candidate.evidence}`);
      reportLines.push(`- Snippet: ${candidate.snippet || 'No snippet available'}`);
      reportLines.push('');
    }
  } else {
    reportLines.push('- No first-attempt candidates found today.');
    reportLines.push('');
  }

  if (skipped.length) {
    reportLines.push('## Skipped Items');
    reportLines.push('');
    for (const item of skipped.slice(0, 10)) {
      reportLines.push(`- ${item.subject || 'Untitled'}: ${item.reason}`);
    }
    reportLines.push('');
  }

  const report = reportLines.join('\n');
  await fs.writeFile(path.join(reportDir, 'latest.md'), report, 'utf8');
  await fs.writeFile(path.join(reportDir, `${new Date().toISOString().slice(0, 10)}.md`), report, 'utf8');

  state.lastSuccessfulRun = new Date().toISOString();
  state.processedMessageIds = [...processedMessageIds].slice(-1000);
  state.updatedRecords = updatedRecords;
  state.rfpUpdates = rfpUpdates;
  state.dealCreations = dealCreations;
  state.leadCreations = leadCreations;
  state.statusUpdates = statusUpdates;
  state.skippedItems = skipped.slice(0, 25);
  state.notes.push('HubSpot leads are now routed through the API sidecar for lead visibility in the daily mail sync.');
  state.notes.push(`Deal creations recorded: ${dealCreations.length}`);
  state.notes.push(`RFP updates recorded: ${rfpUpdates.length}`);
  state.notes.push(`Lead creations recorded: ${leadCreations.length}`);
  state.notes.push(`Deal stage moves recorded: ${updatedRecords.length}`);
  state.notes.push(`Activity status updates recorded: ${statusUpdates.length}`);
  await fs.writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');

  const backfill = {
    runType: 'one-time-mail-hubspot-backfill',
    sourceQuery: 'cc:sales@seamgen.com',
    processedMessages: candidateMessages.length,
    updatedRecords: [],
    skippedAmbiguous: skipped.slice(0, 10),
    notes: [
      'HubSpot Leads are accessed via the API sidecar for mail-sync lead handling.',
      'No CRM mutations were required for this dry run.',
    ],
  };
  await fs.writeFile(backfillStatePath, `${JSON.stringify(backfill, null, 2)}\n`, 'utf8');

  const dealStageMoves = summarizeDealStageMoves(state.updatedRecords);
  const statusMoveLines = summarizeStatusUpdates(state.statusUpdates);
  const summaryBits = [
    'Daily mail-HubSpot sync complete.',
    `Deals updated: ${updatedRecords.length}`,
    `RFP updates: ${rfpUpdates.length}`,
    `Deals created: ${dealCreations.length}`,
    `Leads created: ${leadCreations.length}`,
    `Status updates: ${statusUpdates.length}`,
  ];
  if (!summaryBits.some((line) => /: 0$/.test(line)) || !dealStageMoves.length) {
    summaryBits.push(dealStageMoves.length || statusMoveLines.length ? 'See report for details.' : 'No relevant CRM changes.');
  }

  if (!NO_TELEGRAM) {
    await sendTelegramMessage(summaryBits.join('\n'));
  }
}

await main().catch(async (error) => {
  if (!NO_TELEGRAM) {
    try {
      await sendTelegramMessage(
        [
          'Daily mail-HubSpot sync failed.',
          `Error: ${error?.message || String(error)}`,
        ].join('\n'),
      );
    } catch {}
  }
  throw error;
});
