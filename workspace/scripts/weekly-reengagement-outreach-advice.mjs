import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { loadHubSpotLeadsClient } from './hubspot-leads-sidecar.mjs';

const WORKSPACE = process.env.WORKSPACE_DIR || '/home/azureuser/.openclaw/workspace';
const HUBSPOT_CREDS = '/home/azureuser/.openclaw/credentials/hubspot-mcp.json';
const HUBSPOT_URL = 'https://mcp.hubspot.com';
const REPORT_TITLE = 'Weekly New Reengagement Outreach Advice';
const REPORT_RECIPIENT = 'nurrea@seamgen.com';
const REPORT_CC = 'mariannefaro@seamgen.com';
const REPORT_FROM = 'isa@seamgen.com';
const HUBSPOT_PORTAL_ID = Number(process.env.HUBSPOT_PORTAL_ID || 21542978);
const TELEGRAM_TARGET = process.env.TELEGRAM_TARGET || '-1003890997073';
const TELEGRAM_TARGETS = (process.env.TELEGRAM_TARGETS || TELEGRAM_TARGET)
  .split(/[,\s]+/)
  .map((value) => value.trim())
  .filter(Boolean);
const NO_TELEGRAM = ['1', 'true', 'yes'].includes(String(process.env.NO_TELEGRAM || '').toLowerCase());
const HUBSPOT_CALL_TIMEOUT_MS = Number(process.env.HUBSPOT_CALL_TIMEOUT_MS || 60000);
const OUTREACH_CONTEXT_TIMEOUT_MS = Number(process.env.REENGAGEMENT_OUTREACH_TIMEOUT_MS || 12000);
const reportDir = path.join(WORKSPACE, 'reports', 'weekly-reengagement-outreach-advice');
const REPORT_TIME_ZONE = 'America/Los_Angeles';

function normalizeText(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function toArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return [value];
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function parseDate(value) {
  if (!value) return null;
  const normalized = String(value || '').replace(/(\d)(st|nd|rd|th)\b/gi, '$1');
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function mostRecentDate(...values) {
  const dates = values.map(parseDate).filter(Boolean);
  if (!dates.length) return null;
  return dates.sort((a, b) => b.getTime() - a.getTime())[0];
}

function latestContactTouch(contacts = []) {
  const dates = [];
  for (const contact of contacts || []) {
    const props = contact?.properties || {};
    const date = mostRecentDate(
      props.hs_email_last_send_date,
      props.hs_email_last_reply_date,
      props.notes_last_contacted,
      props.notes_last_updated,
    );
    if (date) dates.push(date);
  }
  return dates.length ? dates.sort((a, b) => b.getTime() - a.getTime())[0] : null;
}

function formatDate(value = '') {
  const date = parseDate(value);
  return date ? date.toISOString().slice(0, 10) : 'not found';
}

function parseAmount(value = '') {
  const text = String(value || '').trim();
  if (!text) return 0;
  const numeric = Number(text.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(numeric) ? numeric : 0;
}

function formatAmount(value = '') {
  const numeric = parseAmount(value);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(numeric);
}

function escapeHtml(text = '') {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function cleanText(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function formatAppRating(rating) {
  const numeric = Number(rating || 0);
  return Number.isFinite(numeric) && numeric > 0 ? numeric.toFixed(1) : '';
}

function summarizeCount(count, label) {
  return `${count} ${label}${count === 1 ? '' : 's'}`;
}

function withTimeout(promise, timeoutMs, label = 'operation timed out') {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(label)), timeoutMs);
    Promise.resolve(promise)
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

function isInternalMailboxText(text = '') {
  return /@seamgen\.com|@itility\.nl|@youtility\.nl/i.test(String(text || ''));
}

function hasExternalMailboxAddress(text = '') {
  const matches = String(text || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  return matches.some((email) => !isInternalMailboxText(email));
}

function formatDateTime(value = '') {
  const date = parseDate(value);
  if (!date) return 'not found';
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: REPORT_TIME_ZONE,
  }).format(date);
}

function formatDateOnly(value = '') {
  const date = parseDate(value);
  if (!date) return 'not found';
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeZone: REPORT_TIME_ZONE,
  }).format(date);
}

function runJson(cmd, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd: process.env.WORKSPACE_DIR || '/home/azureuser/.openclaw/workspace',
      env: { ...process.env, ...(options.env || {}) },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let timeoutHandle = null;
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (timeoutHandle) clearTimeout(timeoutHandle);
      resolve(result);
    };

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
        finish({
          stdout,
          stderr: `${stderr}${stderr ? '\n' : ''}${cmd} timed out after ${options.timeoutMs}ms`.trim(),
          exitCode: 124,
          timedOut: true,
        });
      }, options.timeoutMs);
    }

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });
    child.on('close', (exitCode) => {
      finish({ stdout, stderr, exitCode: typeof exitCode === 'number' ? exitCode : 1 });
    });
    child.stdin.end(options.input ?? '');
  });
}

async function hubspotCall(toolName, toolArgs) {
  const creds = '/home/azureuser/.openclaw/credentials/hubspot-mcp.json';
  const args = [
    'tools',
    'call',
    '--url',
    'https://mcp.hubspot.com',
    '--credentials-file',
    creds,
    '--tool-name',
    toolName,
    '--tool-args',
    JSON.stringify(toolArgs || {}),
    '--format',
    'json',
  ];
  const result = await runJson('mcpjam', args, { timeoutMs: 60000 });
  if (result.exitCode !== 0) {
    throw new Error((result.stderr || result.stdout || `HubSpot tool ${toolName} failed`).trim());
  }
  const parsed = JSON.parse(result.stdout || '{}');
  const text = parsed?.content?.[0]?.text || '';
  return text ? JSON.parse(text) : {};
}

function parseDatasetTsv(text = '') {
  const marker = 'Dataset TSV:\n';
  const start = String(text || '').indexOf(marker);
  if (start === -1) return [];

  const tail = String(text || '').slice(start + marker.length);
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

async function queryCrmData(sql) {
  const response = await hubspotCall('query_crm_data', {
    sql,
    verbosityLevel: 'LOW',
    chatInsights: {
      userIntent: 'Select companies for the weekly reengagement outreach job.',
      satisfaction: 'NEUTRAL',
    },
  });
  const text = response.results?.[0]?.content || '';
  return parseDatasetTsv(text);
}

async function fetchReengagementCandidateRows(startDate, endDate) {
  return await queryCrmData(
    `SELECT COMPANY.name, COMPANY.hs_object_id, COMPANY.domain, COMPANY.website, COMPANY.industry, CONTACT.hs_object_id, CONTACT.firstname, CONTACT.lastname, CONTACT.email, CONTACT.work_email, CONTACT.hs_email_last_send_date, CONTACT.hs_email_last_reply_date, CONTACT.notes_last_contacted, CONTACT.notes_last_updated, DEAL.hs_object_id, dealname, dealstage, closedate, amount FROM DEAL WHERE closedate BETWEEN '${startDate}' AND '${endDate}' ORDER BY COMPANY.hs_object_id, closedate DESC LIMIT 5000`,
  );
}

async function readInput() {
  const inputFile = String(process.env.REENGAGEMENT_INPUT_FILE || '').trim();
  if (inputFile) {
    return JSON.parse(await fs.readFile(inputFile, 'utf8'));
  }

  if (!process.stdin.isTTY) {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
    const text = Buffer.concat(chunks).toString('utf8').trim();
    return text ? JSON.parse(text) : {};
  }

  throw new Error('Missing reengagement input. Provide REENGAGEMENT_INPUT_FILE or pipe JSON on stdin.');
}

function monthsAgoIsoDate(months, fromDate = new Date()) {
  const date = new Date(fromDate);
  date.setUTCMonth(date.getUTCMonth() - months);
  return date.toISOString().slice(0, 10);
}

function isActiveStatus(value = '') {
  return String(value || '').trim().toLowerCase() === 'active';
}

async function associatedRecords(objectType, companyId, properties, extra = {}) {
  const response = await hubspotCall('search_crm_objects', {
    objectType,
    properties,
    limit: 100,
    associatedWith: [{ objectType: 'companies', operator: 'EQUAL', objectIdValues: [Number(companyId)] }],
    ...extra,
    chatInsights: {
      userIntent: `Find ${objectType.toLowerCase()} records associated with a company for the weekly reengagement outreach selector.`,
      satisfaction: 'NEUTRAL',
    },
  });
  return response.results || [];
}

function noteBodyFromSearchResult(note = {}) {
  return cleanText(
    note?.properties?.hs_note_body ||
      note?.properties?.body ||
      note?.properties?.content ||
      note?.properties?.hs_content ||
      '',
  );
}

function serviceRelevantText(text = '') {
  const lower = cleanText(text).toLowerCase();
  return /software|platform|app|application|website|web|mobile|ios|android|portal|product|design|ux|ui|development|engineering|integration|moderni[sz]ation|automation|cloud|data|ai|analytics|digital|accessibility|wcag|508|cms|content management|legacy|migration|azure|\.net|react|sso|api|workflow|admin|redesign|refresh|rebrand|launch|login|sign in|checkout|booking|reservation|customer portal|member portal|patient portal|download the app/i.test(lower);
}

function stripHtml(text = '') {
  return cleanText(String(text || '').replace(/<[^>]*>/g, ' '));
}

function truncateText(text = '', limit = 220) {
  const value = cleanText(text);
  if (value.length <= limit) return value;
  return `${value.slice(0, Math.max(0, limit - 1))}…`;
}

function signalKey(signal) {
  return [signal?.source || '', signal?.title || '', signal?.detail || ''].map((value) => cleanText(value).toLowerCase()).join('::');
}

function dedupeSignals(signals = []) {
  const seen = new Set();
  const out = [];
  for (const signal of signals) {
    const key = signalKey(signal);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(signal);
  }
  return out;
}

function appSearchTerms(company = {}) {
  const rawName = cleanText(company.companyName || company.name || '');
  const website = cleanText(company.website || company.domain || company.companyDomain || '');
  const significantTokens = rawName
    .replace(/\b(inc|llc|ltd|corp|corporation|company|co|inc\.|llc\.|ltd\.|the)\b/gi, ' ')
    .split(/[^a-z0-9]+/i)
    .map((token) => cleanText(token))
    .filter((token) => token.length >= 3);
  const compactName = rawName
    .replace(/\b(inc|llc|ltd|corp|corporation|company|co|inc\.|llc\.|ltd\.)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  const reducedName = significantTokens.slice(0, 3).join(' ');
  const firstToken = significantTokens[0] || '';
  const lastToken = significantTokens[significantTokens.length - 1] || '';
  const domainSlug = website
    ? website
        .replace(/^https?:\/\//i, '')
        .replace(/^www\./i, '')
        .split(/[/?#]/)[0]
        .replace(/\.[a-z]{2,}$/i, '')
        .replace(/[^a-z0-9]+/gi, ' ')
        .trim()
    : '';
  return [...new Set([rawName, compactName, reducedName, firstToken, lastToken, domainSlug].map((value) => cleanText(value)).filter(Boolean))].slice(0, 6);
}

function termMatchesText(term = '', text = '') {
  const left = cleanText(term).toLowerCase();
  const right = cleanText(text).toLowerCase();
  if (!left || !right) return false;
  if (right.includes(left) || left.includes(right)) return true;
  const words = left.split(/[^a-z0-9]+/i).filter((word) => word.length >= 4);
  const matches = words.filter((word) => right.includes(word));
  return matches.length >= Math.max(1, Math.ceil(words.length / 2));
}

function companyTextMatchesCompany(companyName = '', resultFields = '') {
  const needle = cleanText(companyName).toLowerCase();
  const haystack = cleanText(resultFields).toLowerCase();
  if (!needle || !haystack) return false;
  if (haystack.includes(needle) || needle.includes(haystack)) return true;
  const termTokens = needle
    .split(/[^a-z0-9]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !/^(inc|llc|ltd|corp|co|the)$/i.test(token));
  if (!termTokens.length) return false;
  const matches = termTokens.filter((token) => haystack.includes(token));
  const threshold = termTokens.length <= 2 ? 1 : Math.max(2, Math.ceil(termTokens.length / 2));
  return matches.length >= threshold;
}

function appResultMatchesCompany(companyName = '', resultFields = '') {
  const needle = cleanText(companyName).toLowerCase();
  const haystack = cleanText(resultFields).toLowerCase();
  if (!needle || !haystack) return false;
  if (haystack.includes(needle) || needle.includes(haystack)) return true;
  const termTokens = needle
    .split(/[^a-z0-9]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length >= 4 && !/^(inc|llc|ltd|corp|co|the|company)$/i.test(token));
  if (!termTokens.length) return false;
  const matches = termTokens.filter((token) => haystack.includes(token));
  const threshold = termTokens.length <= 2 ? termTokens.length : 2;
  return matches.length >= threshold;
}

function parseRssItems(xml = '') {
  const items = [];
  const matches = String(xml || '').match(/<item[\s\S]*?<\/item>/gi) || [];
  for (const item of matches) {
    const title = cleanText((/<title><!\[CDATA\[(.*?)\]\]><\/title>/i.exec(item) || /<title>(.*?)<\/title>/i.exec(item) || [])[1] || '');
    const link = cleanText((/<link>(.*?)<\/link>/i.exec(item) || [])[1] || '');
    const pubDate = cleanText((/<pubDate>(.*?)<\/pubDate>/i.exec(item) || [])[1] || '');
    const description = cleanText((/<description><!\[CDATA\[(.*?)\]\]><\/description>/i.exec(item) || /<description>(.*?)<\/description>/i.exec(item) || [])[1] || '');
    if (!title && !link) continue;
    items.push({ title, link, pubDate, description });
  }
  return items;
}

async function fetchText(url, { timeoutMs = 15000, headers = {} } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; ISA/1.0)',
        accept: 'text/html,application/xml,application/rss+xml,*/*',
        ...headers,
      },
      signal: controller.signal,
    });
    const text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      headers: response.headers,
      text,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function parseWebsiteCandidates(company = {}) {
  const candidates = [];
  const website = cleanText(company.website || company.webSite || company.url || '');
  const domain = cleanText(company.domain || '');
  const contactDomain = cleanText(company.contactDomain || '');

  const pushCandidate = (value) => {
    const candidate = cleanText(value);
    if (!candidate) return;
    if (/^https?:\/\//i.test(candidate)) {
      candidates.push(candidate);
      return;
    }
    const domainLike = candidate.replace(/^www\./i, '').replace(/\/.*$/, '');
    if (domainLike) {
      candidates.push(`https://${domainLike}`);
      candidates.push(`https://www.${domainLike}`);
    }
  };

  pushCandidate(website);
  pushCandidate(domain);
  pushCandidate(contactDomain);
  return [...new Set(candidates)];
}

function eventPageCandidates(baseUrl = '') {
  const normalized = cleanText(baseUrl);
  if (!normalized) return [];
  const pages = [
    '',
    '/',
    '/events',
    '/event',
    '/events/',
    '/webinars',
    '/webinar',
    '/news',
    '/blog',
    '/meetings',
    '/conferences',
  ].map((suffix) => {
    try {
      return new URL(suffix, normalized).toString();
    } catch {
      return '';
    }
  });
  return [...new Set(pages.filter(Boolean))];
}

function topicPageCandidates(baseUrl = '', extraPaths = []) {
  const normalized = cleanText(baseUrl);
  if (!normalized) return [];
  const pages = [];
  for (const suffix of extraPaths) {
    try {
      pages.push(new URL(suffix, normalized).toString());
    } catch {}
  }
  return [...new Set(pages.filter(Boolean))];
}

function extractLinks(html = '', baseUrl = '') {
  const links = [];
  const regex = /<a[^>]+href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi;
  let match;
  while ((match = regex.exec(String(html || '')))) {
    const href = cleanText(match[1]);
    const text = stripHtml(match[2]);
    if (!href) continue;
    try {
      const url = new URL(href, baseUrl).toString();
      links.push({ url, text });
    } catch {}
  }
  return links;
}

function websiteSignalFromText(companyName, url, html, lastModified) {
  const text = stripHtml(html);
  const lowered = text.toLowerCase();
  const signals = [];
  const pushSignal = (title, detail, score, evidence = text) => {
    signals.push({
      source: 'website',
      score,
      title,
      detail,
      evidence: truncateText(evidence, 260),
    });
  };

  if (/(we'?re hiring|we are hiring|open roles|open positions|vacanc(?:y|ies)|careers?|join our team|work with us|apply now)/i.test(text)) {
    pushSignal('Open technical vacancies', `Website mentions hiring or open roles at ${url}.`, 4);
  }
  if (/(download the app|download our app|app store|google play|mobile app|ios app|android app)/i.test(text)) {
    pushSignal('Mobile app callout', `Website highlights an app download or mobile app at ${url}.`, 4);
  }
  if (/(customer portal|member portal|patient portal|portal login|log in|login|sign in|dashboard|self[- ]service|account portal|my account)/i.test(text)) {
    pushSignal('Portal or self-service callout', `Website exposes a portal or self-service workflow at ${url}.`, 4);
  }
  if (/(redesign|relaunch|rebrand|new website|website refresh|site refresh|moderni[sz]ation|digital transformation|new look|new experience)/i.test(text)) {
    pushSignal('Website redesign or refresh', `Website language suggests a redesign, refresh, or replatforming angle at ${url}.`, 4);
  }
  if (/(accessibility|wcag|section 508|a11y|inclusive design)/i.test(text)) {
    pushSignal('Accessibility signal', `Website mentions accessibility or compliance at ${url}.`, 4);
  }
  if (/(cms|content management|content workflow|editorial workflow|publishing workflow|content operations)/i.test(text)) {
    pushSignal('CMS or content workflow signal', `Website mentions CMS or content workflow at ${url}.`, 3);
  }
  if (/(api|sso|integration|system integration|workflow automation|automation|portal|admin|dashboard)/i.test(text)) {
    pushSignal('Integration or workflow signal', `Website mentions integration or workflow work at ${url}.`, 4);
  }
  const yearMatches = [...lowered.matchAll(/\b(20\d{2})\b/g)].map((match) => Number(match[1]));
  const maxYear = yearMatches.length ? Math.max(...yearMatches) : null;
  const currentYear = new Date().getUTCFullYear();
  if ((lastModified && parseDate(lastModified) && (Date.now() - parseDate(lastModified).getTime()) > 365 * 24 * 60 * 60 * 1000) || (maxYear && maxYear <= currentYear - 2)) {
    pushSignal('Outdated website signal', `Website at ${url} looks stale or not recently updated.`, 3);
  }
  if (companyName && companyTextMatchesCompany(companyName, text)) {
    pushSignal('Company-specific website context', `Homepage content ties the site to ${companyName}.`, 2);
  }
  return signals;
}

function parseUpcomingDates(text = '') {
  const results = [];
  const source = cleanText(text);
  if (!source) return results;

  const currentYear = new Date().getUTCFullYear();
  const patterns = [
    /\b((?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{1,2},?\s+\d{4})\b/gi,
    /\b(\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{4})\b/gi,
    /\b(\d{4}-\d{2}-\d{2})\b/g,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(source))) {
      const raw = cleanText(match[1]);
      const parsed = parseDate(raw);
      if (!parsed) continue;
      const ageDays = Math.floor((parsed.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
      if (ageDays < 0 || ageDays > 180) continue;
      results.push({ raw, date: parsed.toISOString().slice(0, 10) });
    }
  }

  if (!results.length) {
    const yearMatches = [...source.matchAll(/\b(20\d{2})\b/g)].map((match) => Number(match[1]));
    if (yearMatches.some((year) => year >= currentYear)) {
      results.push({ raw: `future year ${Math.max(...yearMatches)}`, date: '' });
    }
  }

  return results.slice(0, 5);
}

async function collectEventSignals(company = {}) {
  const candidates = parseWebsiteCandidates(company);
  const signals = [];
  const eventKeywords = /event|webinar|conference|summit|meetup|roadshow|workshop|meet the team|open house|demo day/i;

  for (const candidate of [...candidates, ...candidates.flatMap(eventPageCandidates)].slice(0, 6)) {
    try {
      const response = await fetchText(candidate, { timeoutMs: 12000 });
      if (!response.ok || !response.text) continue;
      const text = stripHtml(response.text);
      const lower = text.toLowerCase();
      if (!eventKeywords.test(lower)) continue;
      if (!serviceRelevantText(text)) continue;

      const dates = parseUpcomingDates(text);
      const nearbyLinks = extractLinks(response.text, candidate)
        .filter((link) => eventKeywords.test(`${link.url} ${link.text}`))
        .slice(0, 2);
      const eventHints = dates.map((item) => item.date || item.raw).filter(Boolean);
      const hintText = eventHints.length ? `Upcoming event timing found: ${eventHints.join(', ')}.` : `Event language found on ${candidate}.`;

      signals.push({
        source: 'event',
        score: dates.length ? 5 : 3,
        title: dates.length ? 'Upcoming event signal' : 'Event-related website signal',
        detail: hintText,
        evidence: truncateText(text, 280),
      });

      for (const link of nearbyLinks) {
        try {
          const page = await fetchText(link.url, { timeoutMs: 12000 });
          if (!page.ok || !page.text) continue;
          const pageText = stripHtml(page.text);
          if (!eventKeywords.test(pageText)) continue;
          if (!serviceRelevantText(pageText)) continue;
          const pageDates = parseUpcomingDates(pageText);
          signals.push({
            source: 'event',
            score: pageDates.length ? 5 : 4,
            title: pageDates.length ? 'Upcoming event page' : 'Event page',
            detail: `${link.text || 'Event page'} at ${link.url}${pageDates.length ? ` with dates ${pageDates.map((item) => item.date || item.raw).join(', ')}` : ''}`,
            evidence: truncateText(pageText, 280),
          });
        } catch {}
      }
    } catch {}
  }

  return dedupeSignals(signals);
}

async function collectWebsiteSignals(company = {}) {
  const candidates = parseWebsiteCandidates(company);
  const signals = [];
  for (const candidate of candidates.slice(0, 3)) {
    try {
      const response = await fetchText(candidate, { timeoutMs: 12000 });
      if (!response.ok || !response.text) continue;
      const lastModified = response.headers.get('last-modified') || '';
      signals.push(...websiteSignalFromText(company.companyName || company.name || '', candidate, response.text, lastModified));

      const links = extractLinks(response.text, candidate)
        .filter((link) => /careers?|jobs?|vacanc(?:y|ies)|join-?us|work-with-us|open-roles?|positions/i.test(`${link.url} ${link.text}`))
        .slice(0, 2);
      for (const link of links) {
        try {
          const page = await fetchText(link.url, { timeoutMs: 12000 });
          if (!page.ok || !page.text) continue;
          signals.push(...websiteSignalFromText(company.companyName || company.name || '', link.url, page.text, page.headers.get('last-modified') || ''));
        } catch {}
      }
    } catch {}
  }
  return dedupeSignals(signals);
}

function parseGoogleNewsUrl(url = '') {
  try {
    const parsed = new URL(url);
    const value = parsed.searchParams.get('url') || parsed.searchParams.get('q') || '';
    return value ? decodeURIComponent(value) : url;
  } catch {
    return url;
  }
}

function parseDuckDuckGoRedirectUrl(url = '') {
  try {
    const parsed = new URL(url);
    const target = parsed.searchParams.get('uddg') || '';
    return target ? decodeURIComponent(target) : url;
  } catch {
    return url;
  }
}

function parseDuckDuckGoLiteResults(text = '') {
  const results = [];
  const lines = String(text || '').split(/\r?\n/);
  let current = null;

  const pushCurrent = () => {
    if (!current) return;
    current.snippet = cleanText(current.snippet || '');
    if (current.title || current.url || current.snippet) results.push(current);
    current = null;
  };

  for (const line of lines) {
    const match = /^## \[(.*?)\]\((.*?)\)/.exec(line);
    if (match) {
      pushCurrent();
      current = {
        title: cleanText(match[1]),
        url: parseDuckDuckGoRedirectUrl(cleanText(match[2])),
        snippet: '',
      };
      continue;
    }
    if (!current) continue;
    const trimmed = cleanText(line);
    if (!trimmed) {
      current.snippet = `${current.snippet || ''} `;
      continue;
    }
    if (/^\[[^\]]+\]\([^)]+\)$/.test(trimmed)) continue;
    current.snippet = `${current.snippet || ''} ${trimmed}`.trim();
  }

  pushCurrent();
  return results;
}

async function searchDuckDuckGoLite(query) {
  const searchUrl = `https://r.jina.ai/http://duckduckgo.com/lite/?q=${encodeURIComponent(query)}`;
  try {
    const response = await fetchText(searchUrl, { timeoutMs: 20000 });
    if (!response.ok || !response.text) return [];
    return parseDuckDuckGoLiteResults(response.text);
  } catch {
    return [];
  }
}

async function collectNewsSignals(company = {}) {
  const companyName = cleanText(company.companyName || company.name || '');
  if (!companyName) return [];
  const industry = cleanText(company.industry || company.companyIndustry || '');
  const digitalTriggers = [
    'app',
    'mobile app',
    'website',
    'site',
    'redesign',
    'refresh',
    'replatform',
    'portal',
    'self-service',
    'digital experience',
    'online ordering',
    'booking',
  ];
  const queries = [
    `${companyName} when:14d`,
    industry ? `${companyName} ${industry} when:14d` : '',
    industry ? `${industry} market when:14d` : '',
    ...digitalTriggers.slice(0, 6).map((term) => `${companyName} ${term} when:14d`),
  ].filter(Boolean);
  const signals = [];

  for (const query of queries) {
    try {
      const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
      const response = await fetchText(url, { timeoutMs: 15000, headers: { accept: 'application/rss+xml,text/xml,*/*' } });
      if (!response.ok || !response.text) continue;
      const items = parseRssItems(response.text);
      for (const item of items.slice(0, 5)) {
        const date = parseDate(item.pubDate);
        if (!date) continue;
        const ageDays = Math.floor((Date.now() - date.getTime()) / (24 * 60 * 60 * 1000));
        if (ageDays > 14) continue;
        const title = cleanText(item.title || '');
        const detail = cleanText(item.description || title || parseGoogleNewsUrl(item.link || ''));
        const digitalPlanMatch = /(app|mobile app|ios|android|website|site refresh|website refresh|site redesign|website redesign|replatform|portal|self-service|digital experience|online ordering|booking|checkout|customer experience|new app|new website|app update|site launch|website launch)/i.test(`${title} ${detail}`);
        const broadMarketMatch = /(funding|launch|partnership|expands|acquires|announces|hire|hiring|layoff|revenue|market|sector|regulation|product)/i.test(title);
        const sourceLabel = digitalPlanMatch
          ? 'App or website plan signal'
          : broadMarketMatch
            ? 'Relevant market or sector news'
            : 'Recent company news';
        const score = digitalPlanMatch || broadMarketMatch ? 4 : 3;
        signals.push({
          source: 'news',
          score,
          title: sourceLabel,
          detail: digitalPlanMatch
            ? `${title} (${date.toISOString().slice(0, 10)}) suggests an app or website change that may support the company's digital plans.`
            : `${title} (${date.toISOString().slice(0, 10)})`,
          evidence: truncateText(detail, 280),
        });
      }
    } catch {}
  }

  return dedupeSignals(signals);
}

async function collectSearchSignals(company = {}) {
  const companyName = cleanText(company.companyName || company.name || '');
  if (!companyName) return [];
  const topics = [
    {
      source: 'search',
      name: 'funding',
      title: 'LinkedIn or web funding signal',
      queries: [
        `site:linkedin.com/company ${companyName} funding`,
        `site:linkedin.com/posts ${companyName} funding`,
        `${companyName} funding raised series investment`,
      ],
      keywords: [/funding|funded|raises?|raised|series [abc]|seed|investment|investors?/i],
      score: 4,
    },
    {
      source: 'search',
      name: 'leadership',
      title: 'LinkedIn or web leadership signal',
      queries: [
        `site:linkedin.com/company ${companyName} leadership`,
        `site:linkedin.com/posts ${companyName} CEO CTO VP appointed named promoted`,
        `${companyName} CEO CTO VP appointed named promoted head of`,
      ],
      keywords: [/ceo|cto|cfo|coo|vp|vice president|head of|appointed|named|joins|promoted/i],
      score: 4,
    },
    {
      source: 'search',
      name: 'partnership',
      title: 'LinkedIn or web partnership signal',
      queries: [
        `site:linkedin.com/posts ${companyName} partnership integration reseller`,
        `site:linkedin.com/company ${companyName} partnership`,
        `${companyName} partnership integration reseller alliance`,
      ],
      keywords: [/partnership|partnered|partners with|integration|integrates with|reseller|alliance|ecosystem/i],
      score: 4,
    },
    {
      source: 'search',
      name: 'hiring',
      title: 'LinkedIn or web hiring signal',
      queries: [
        `site:linkedin.com/jobs ${companyName}`,
        `site:linkedin.com/company ${companyName} jobs`,
        `site:linkedin.com/posts ${companyName} hiring`,
        `${companyName} careers jobs open roles greenhouse lever workable`,
      ],
      keywords: [/hiring|jobs?|open roles?|open positions?|careers?|recruiting|join our team|work with us/i],
      score: 4,
    },
    {
      source: 'search',
      name: 'digital_plan',
      title: 'App or website plan signal',
      queries: [
        `site:linkedin.com/company ${companyName} app website redesign refresh replatform`,
        `site:linkedin.com/posts ${companyName} app website redesign refresh replatform`,
        `${companyName} app website redesign refresh replatform portal self-service digital experience`,
      ],
      keywords: [
        /app|mobile app|website|site|redesign|refresh|replatform|portal|self-service|digital experience|online ordering|booking|checkout|customer experience|new app|new website|app update|site launch|website launch/i,
      ],
      score: 4,
    },
  ];

  const signals = [];
  for (const topic of topics) {
    let topicMatched = false;
    let fallbackResult = null;
    for (const query of topic.queries.slice(0, 3)) {
      const results = await searchDuckDuckGoLite(query);
      if (!fallbackResult) {
        fallbackResult = results.find((result) => cleanText(result.title || '') || cleanText(result.snippet || '') || cleanText(result.url || '')) || null;
      }
      for (const result of results.slice(0, 3)) {
        const title = cleanText(result.title || '');
        const snippet = cleanText(result.snippet || '');
        const url = cleanText(result.url || '');
        const body = `${title} ${snippet} ${url}`;
        if (!topic.keywords.some((keyword) => keyword.test(body)) && !companyTextMatchesCompany(companyName, body)) continue;
        topicMatched = true;
        signals.push({
          source: topic.source,
          score: topic.score,
          title: topic.title,
          detail: `${title || query}${url ? ` (${url})` : ''}`,
          evidence: truncateText(snippet || url || title, 280),
        });
      }
      if (signals.length >= 8) break;
    }
    if (!topicMatched && fallbackResult) {
      const title = cleanText(fallbackResult.title || '');
      const snippet = cleanText(fallbackResult.snippet || '');
      const url = cleanText(fallbackResult.url || '');
      signals.push({
        source: topic.source,
        score: 1,
        title: `${topic.title} (weak hint)`,
        detail: `${title || `${topic.name} search`}${url ? ` (${url})` : ''}`,
        evidence: truncateText(snippet || url || title || companyName, 280),
      });
    }
  }

  return dedupeSignals(signals);
}

async function collectTopicNewsSignals(company = {}, topic = {}) {
  const companyName = cleanText(company.companyName || company.name || '');
  if (!companyName) return [];
  const industry = cleanText(company.industry || company.companyIndustry || '');
  const queries = (topic.queries || [])
    .flatMap((term) => [
      `${companyName} ${term}`,
      industry ? `${companyName} ${industry} ${term}` : '',
    ])
    .filter(Boolean);
  const keywords = topic.keywords || [];
  const source = topic.source || 'news';
  const baseScore = Number(topic.baseScore || 3);
  const strongScore = Number(topic.strongScore || 4);
  const titlePrefix = topic.titlePrefix || 'Recent company news';
  const strongTitle = topic.strongTitle || titlePrefix;
  const weakTitle = topic.weakTitle || titlePrefix;
  const signals = [];

  for (const query of [...new Set(queries)].slice(0, 6)) {
    try {
      const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
      const response = await fetchText(url, { timeoutMs: 15000, headers: { accept: 'application/rss+xml,text/xml,*/*' } });
      if (!response.ok || !response.text) continue;
      const items = parseRssItems(response.text);
      for (const item of items.slice(0, 5)) {
        const date = parseDate(item.pubDate);
        if (!date) continue;
        const ageDays = Math.floor((Date.now() - date.getTime()) / (24 * 60 * 60 * 1000));
        if (ageDays > 14) continue;
        const title = cleanText(item.title || '');
        const detail = cleanText(item.description || title || parseGoogleNewsUrl(item.link || ''));
        const matched = keywords.some((keyword) => keyword.test(title) || keyword.test(detail)) || companyTextMatchesCompany(companyName, `${title} ${detail}`);
        if (!matched) continue;
        signals.push({
          source,
          score: strongScore,
          title: strongTitle,
          detail: `${title} (${date.toISOString().slice(0, 10)})`,
          evidence: truncateText(detail, 280),
        });
      }
    } catch {}
  }

  return dedupeSignals(signals);
}

async function collectTopicWebsiteSignals(company = {}, topic = {}) {
  const candidates = parseWebsiteCandidates(company);
  const signals = [];
  const source = topic.source || 'website';
  const baseScore = Number(topic.baseScore || 3);
  const strongScore = Number(topic.strongScore || 4);
  const titlePrefix = topic.titlePrefix || 'Website signal';
  const strongTitle = topic.strongTitle || titlePrefix;
  const weakTitle = topic.weakTitle || titlePrefix;
  const pagePaths = topic.pagePaths || [];
  const keywords = topic.keywords || [];
  const extraCandidates = candidates.flatMap((candidate) => topicPageCandidates(candidate, pagePaths));
  const urls = [...new Set([...candidates, ...extraCandidates].filter(Boolean))].slice(0, 8);

  for (const candidate of urls) {
    try {
      const response = await fetchText(candidate, { timeoutMs: 12000 });
      if (!response.ok || !response.text) continue;
      const text = stripHtml(response.text);
      const matched = keywords.some((keyword) => keyword.test(text) || keyword.test(candidate)) || companyTextMatchesCompany(company?.companyName || company?.name || '', `${text} ${candidate}`);
      if (!matched) continue;
      const dates = parseUpcomingDates(text);
      signals.push({
        source,
        score: dates.length ? strongScore : baseScore,
        title: dates.length ? strongTitle : weakTitle,
        detail: dates.length
          ? `${candidate} mentions ${topic.name || 'a relevant signal'} with dates ${dates.map((item) => item.date || item.raw).join(', ')}.`
          : `${candidate} mentions ${topic.name || 'a relevant signal'}.`,
        evidence: truncateText(text, 280),
      });
    } catch {}
  }

  return dedupeSignals(signals);
}

async function collectAppSignals(company = {}) {
  const companyName = cleanText(company.companyName || company.name || '');
  const searchTerms = appSearchTerms(company);
  if (!searchTerms.length) return [];
  const signals = [];
  const seen = new Set();
  const priorityTerms = searchTerms.slice(0, 4);
  await Promise.all(priorityTerms.map(async (term) => {
    try {
      const appleUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=software&limit=5&country=us`;
      const playUrl = `https://play.google.com/store/search?q=${encodeURIComponent(term)}&c=apps&hl=en&gl=US`;
      const [appleResponse, playResponse] = await Promise.all([
        fetchText(appleUrl, { timeoutMs: 10000, headers: { accept: 'application/json' } }).catch(() => null),
        fetchText(playUrl, { timeoutMs: 10000 }).catch(() => null),
      ]);

      if (appleResponse && appleResponse.ok && appleResponse.text) {
        let parsed = null;
        try {
          parsed = JSON.parse(appleResponse.text);
        } catch {
          parsed = null;
        }
        for (const result of parsed?.results || []) {
          const rating = Number(result.averageUserRating || 0);
          const ratingCount = Number(result.userRatingCount || 0);
          const trackName = cleanText(result.trackName || '');
          const artistName = cleanText(result.artistName || '');
          const sellerName = cleanText(result.sellerName || '');
          const bundleId = cleanText(result.bundleId || '');
          const trackUrl = cleanText(result.trackViewUrl || '');
          const ratingText = formatAppRating(result.averageUserRating);
          const key = `${trackName}::${artistName}::${bundleId}::${trackUrl}`;
          if (seen.has(key)) continue;
          const fields = [trackName, artistName, sellerName, bundleId, trackUrl].join(' ');
          const matchesCompany = appResultMatchesCompany(companyName || term, fields);
          if (!matchesCompany) continue;
          seen.add(key);
          signals.push({
            source: 'app',
            score: rating && rating < 3 ? 5 : 2,
            title: rating && rating < 3 ? 'App Store rating below 3 stars' : 'App Store app presence',
            detail: rating && rating < 3
              ? `${trackName || term} has an App Store rating of ${rating.toFixed(1)}${ratingCount ? ` (${ratingCount} ratings)` : ''}.`
              : `${trackName || term} is listed in the App Store${ratingText ? ` with an App Store rating of ${ratingText}` : ''}${ratingCount ? ` (${ratingCount} ratings)` : ''}${artistName ? ` by ${artistName}` : ''}.`,
            evidence: trackUrl || '',
          });
        }
      }

      if (playResponse && playResponse.ok && playResponse.text) {
        const html = playResponse.text;
        const ratingMatches = [...html.matchAll(/([0-9](?:\.[0-9])?)\s*star/i)];
        const rating = ratingMatches.length ? Number(ratingMatches[0][1]) : null;
        const key = `play::${term}::${rating ?? 'presence'}`;
        if (!seen.has(key)) {
          const body = stripHtml(html);
          const matchesCompany = appResultMatchesCompany(companyName || term, body);
          if (!matchesCompany) {
            // Keep the Play Store scan strict so low-rating noise from generic terms does not pollute the report.
          } else if (rating && rating < 3) {
            seen.add(key);
            signals.push({
              source: 'app',
              score: 5,
              title: 'Play Store rating below 3 stars',
              detail: `${term} appears to have a Play Store app rating of ${rating.toFixed(1)} stars.`,
              evidence: truncateText(body, 260),
            });
          } else {
            seen.add(key);
            signals.push({
              source: 'app',
              score: 2,
              title: 'Play Store app presence',
              detail: rating
                ? `${term} appears to have a Google Play app rating of ${rating.toFixed(1)} stars.`
                : `${term} appears to have a Google Play app listing.`,
              evidence: truncateText(body, 260),
            });
          }
        }
      }
    } catch {}
  }));

  if (!signals.length) {
    const searchQueries = searchTerms.flatMap((term) => [
      `site:apps.apple.com ${term}`,
      `site:play.google.com ${term}`,
      `site:itunes.apple.com ${term}`,
      `${term} app store`,
      `${term} google play`,
    ]);
    for (const query of [...new Set(searchQueries)].slice(0, 6)) {
      try {
        const results = await searchDuckDuckGoLite(query);
        for (const result of results.slice(0, 5)) {
          const title = cleanText(result.title || '');
          const snippet = cleanText(result.snippet || '');
          const url = cleanText(result.url || '');
          const body = `${title} ${snippet} ${url}`;
        if (!/apps\.apple\.com|itunes\.apple\.com|play\.google\.com/i.test(body)) continue;
        if (!appResultMatchesCompany(companyName, body)) continue;
          const ratingMatch = body.match(/([0-9](?:\.[0-9])?)\s*(?:stars?|ratings?)/i);
          const rating = ratingMatch ? Number(ratingMatch[1]) : null;
          signals.push({
            source: 'app',
            score: rating && rating < 3 ? 5 : 2,
            title: rating && rating < 3 ? 'App store rating below 3 stars' : 'App store listing signal',
            detail: rating && rating < 3
              ? `${title || query} suggests an app rating of ${rating.toFixed(1)} stars.`
              : `${title || query}${rating ? ` suggests an app rating of ${rating.toFixed(1)} stars` : ''}${url ? ` (${url})` : ''}`,
            evidence: truncateText(snippet || url || title, 280),
          });
        }
      } catch {}
    }
  }

  return dedupeSignals(signals);
}

async function collectAppFrictionSignals(company = {}) {
  const companyName = cleanText(company.companyName || company.name || '');
  const searchTerms = appSearchTerms(company);
  if (!searchTerms.length) return [];
  const signals = [];
  const queries = [];
  for (const term of searchTerms) {
    queries.push(
      `${term} app reviews`,
      `${term} app crash`,
      `${term} app bug`,
      `${term} app support`,
      `site:apps.apple.com ${term} reviews`,
      `site:play.google.com ${term} reviews`,
    );
  }

  const keywords = [
    /review|reviews|rating|star|stars|crash|bug|buggy|broken|issue|issues|problem|complaint|complaints|support|does not work|won't open|won't load|failing/i,
  ];

  for (const query of [...new Set(queries)].slice(0, 10)) {
    try {
      const results = await searchDuckDuckGoLite(query);
      for (const result of results.slice(0, 5)) {
        const title = cleanText(result.title || '');
        const snippet = cleanText(result.snippet || '');
        const url = cleanText(result.url || '');
        const body = `${title} ${snippet} ${url}`;
        if (!keywords.some((keyword) => keyword.test(body)) && !appResultMatchesCompany(companyName, body)) continue;
        signals.push({
          source: 'app',
          score: 4,
          title: 'App friction signal',
          detail: `${title || query}${url ? ` (${url})` : ''}`,
          evidence: truncateText(snippet || url || title, 280),
        });
      }
    } catch {}
  }

  return dedupeSignals(signals);
}

async function collectFundingSignals(company = {}) {
  const newsSignals = await collectTopicNewsSignals(company, {
    source: 'news',
    name: 'funding round',
    titlePrefix: 'Funding signal',
    strongTitle: 'Funding or round announcement',
    weakTitle: 'Funding or round mention',
    queries: ['funding', 'raised', 'round', 'series a', 'series b', 'series c', 'seed', 'investment'],
    keywords: [
      /funding|funded|raises?|raised|round|series [abc]|seed|pre-seed|investment|investors?/i,
    ],
    baseScore: 3,
    strongScore: 4,
  });
  const websiteSignals = await collectTopicWebsiteSignals(company, {
    source: 'website',
    name: 'funding / investor update',
    titlePrefix: 'Funding signal',
    strongTitle: 'Funding or investor update',
    weakTitle: 'Funding or investor mention',
    pagePaths: ['/news', '/press', '/press-releases', '/investors', '/blog', '/updates'],
    queries: [],
    keywords: [
      /funding|funded|raises?|raised|round|series [abc]|seed|pre-seed|investment|investors?/i,
    ],
    baseScore: 3,
    strongScore: 4,
  });
  return dedupeSignals([...newsSignals, ...websiteSignals]);
}

async function collectLeadershipSignals(company = {}) {
  const newsSignals = await collectTopicNewsSignals(company, {
    source: 'news',
    name: 'leadership change',
    titlePrefix: 'Leadership signal',
    strongTitle: 'Leadership change announcement',
    weakTitle: 'Leadership change mention',
    queries: ['CEO', 'CTO', 'CFO', 'appointed', 'joins', 'named', 'promoted', 'head of'],
    keywords: [
      /ceo|cto|cfo|coo|vp|vice president|head of|joins|appointed|named|promoted|hired|selected|elevated/i,
    ],
    baseScore: 3,
    strongScore: 4,
  });
  const websiteSignals = await collectTopicWebsiteSignals(company, {
    source: 'website',
    name: 'leadership page update',
    titlePrefix: 'Leadership signal',
    strongTitle: 'Leadership page or team update',
    weakTitle: 'Leadership page mention',
    pagePaths: ['/about', '/team', '/leadership', '/company/leadership', '/executive-team', '/who-we-are'],
    keywords: [
      /ceo|cto|cfo|coo|vp|vice president|head of|leadership|management team|executive team|founder/i,
    ],
    baseScore: 3,
    strongScore: 4,
  });
  return dedupeSignals([...newsSignals, ...websiteSignals]);
}

async function collectProductSignals(company = {}) {
  const newsSignals = await collectTopicNewsSignals(company, {
    source: 'news',
    name: 'product launch',
    titlePrefix: 'Product signal',
    strongTitle: 'Product launch or feature announcement',
    weakTitle: 'Product launch mention',
    queries: ['launch', 'launched', 'release', 'feature', 'beta', 'general availability', 'roadmap', 'introduces'],
    keywords: [
      /launch|launched|launches|release|released|feature|beta|roadmap|introduces|introducing|general availability|ga\b/i,
    ],
    baseScore: 3,
    strongScore: 4,
  });
  const websiteSignals = await collectTopicWebsiteSignals(company, {
    source: 'website',
    name: 'product update page',
    titlePrefix: 'Product signal',
    strongTitle: 'Product update or release page',
    weakTitle: 'Product update mention',
    pagePaths: ['/blog', '/news', '/updates', '/release-notes', '/releases', '/changelog', '/product-updates'],
    keywords: [
      /launch|launched|launches|release|released|feature|beta|roadmap|introduces|introducing|general availability|ga\b/i,
    ],
    baseScore: 3,
    strongScore: 4,
  });
  return dedupeSignals([...newsSignals, ...websiteSignals]);
}

async function collectPartnershipSignals(company = {}) {
  const newsSignals = await collectTopicNewsSignals(company, {
    source: 'news',
    name: 'partnership',
    titlePrefix: 'Partnership signal',
    strongTitle: 'Partnership or integration announcement',
    weakTitle: 'Partnership mention',
    queries: ['partnership', 'partner', 'integrates with', 'integration', 'reseller', 'alliance'],
    keywords: [
      /partnership|partnered|partners with|integration|integrates with|reseller|alliance|ecosystem/i,
    ],
    baseScore: 3,
    strongScore: 4,
  });
  const websiteSignals = await collectTopicWebsiteSignals(company, {
    source: 'website',
    name: 'partnership page',
    titlePrefix: 'Partnership signal',
    strongTitle: 'Partnership or integration page',
    weakTitle: 'Partnership mention',
    pagePaths: ['/partners', '/partner', '/integrations', '/integration', '/ecosystem', '/alliance', '/customers'],
    keywords: [
      /partnership|partnered|partners with|integration|integrates with|reseller|alliance|ecosystem/i,
    ],
    baseScore: 3,
    strongScore: 4,
  });
  return dedupeSignals([...newsSignals, ...websiteSignals]);
}

async function collectHiringSignals(company = {}) {
  const newsSignals = await collectTopicNewsSignals(company, {
    source: 'news',
    name: 'hiring spree',
    titlePrefix: 'Hiring signal',
    strongTitle: 'Hiring surge announcement',
    weakTitle: 'Hiring mention',
    queries: ['hiring', 'hired', 'jobs', 'open roles', 'open positions', 'careers', 'growth'],
    keywords: [
      /hiring|hired|jobs?|open roles?|open positions?|careers?|recruiting|talent|team growth/i,
    ],
    baseScore: 3,
    strongScore: 4,
  });
  const websiteSignals = await collectTopicWebsiteSignals(company, {
    source: 'website',
    name: 'careers page',
    titlePrefix: 'Hiring signal',
    strongTitle: 'Active careers or hiring page',
    weakTitle: 'Hiring mention',
    pagePaths: ['/careers', '/jobs', '/open-roles', '/openings', '/work-with-us', '/join-us', '/careers/jobs'],
    keywords: [
      /hiring|hired|jobs?|open roles?|open positions?|careers?|recruiting|talent|join our team|work with us/i,
    ],
    baseScore: 3,
    strongScore: 4,
  });
  return dedupeSignals([...newsSignals, ...websiteSignals]);
}

async function collectServiceFitSignals(company = {}) {
  const serviceTopics = [
    {
      name: 'accessibility',
      titlePrefix: 'Accessibility signal',
      strongTitle: 'Accessibility or compliance initiative',
      weakTitle: 'Accessibility mention',
      queries: ['accessibility', 'WCAG', 'Section 508', 'inclusive design', 'a11y'],
      pagePaths: ['/accessibility', '/accessibility-statement', '/about', '/services', '/blog', '/resources', '/case-studies'],
      keywords: [/accessibility|accessible|wcag|section 508|508|a11y|inclusive design/i],
      score: 4,
    },
    {
      name: 'modernization',
      titlePrefix: 'Modernization signal',
      strongTitle: 'Modernization or replatforming initiative',
      weakTitle: 'Modernization mention',
      queries: ['modernization', 'replatforming', 'legacy systems', 'digital transformation', 'migration'],
      pagePaths: ['/blog', '/news', '/case-studies', '/solutions', '/services', '/resources', '/insights'],
      keywords: [/moderni[sz]ation|replatform|legacy|migration|digital transformation|transform/i],
      score: 4,
    },
    {
      name: 'cms',
      titlePrefix: 'CMS signal',
      strongTitle: 'CMS or content workflow initiative',
      weakTitle: 'CMS mention',
      queries: ['CMS', 'content management', 'publishing workflow', 'editorial workflow', 'content operations'],
      pagePaths: ['/blog', '/resources', '/case-studies', '/platform', '/about', '/services', '/solutions'],
      keywords: [/cms|content management|publishing workflow|editorial workflow|content operations|content editors/i],
      score: 4,
    },
    {
      name: 'mobile',
      titlePrefix: 'Mobile signal',
      strongTitle: 'Mobile app initiative',
      weakTitle: 'Mobile mention',
      queries: ['iOS', 'Android', 'mobile app', 'native app', 'cross-platform app', 'app launch'],
      pagePaths: ['/app', '/mobile', '/blog', '/news', '/case-studies', '/products', '/solutions'],
      keywords: [/ios|android|mobile app|native app|cross-platform|mobile/i],
      score: 4,
    },
    {
      name: 'integration',
      titlePrefix: 'Integration signal',
      strongTitle: 'Integration or workflow initiative',
      weakTitle: 'Integration mention',
      queries: ['API', 'SSO', 'integration', 'workflow automation', 'portal', 'admin', 'dashboard'],
      pagePaths: ['/platform', '/blog', '/services', '/solutions', '/resources', '/about', '/case-studies'],
      keywords: [/api|sso|integration|workflow|automation|portal|admin|dashboard|system integration/i],
      score: 4,
    },
    {
      name: 'microsoft_azure',
      titlePrefix: 'Microsoft / Azure signal',
      strongTitle: 'Microsoft or Azure initiative',
      weakTitle: 'Microsoft or Azure mention',
      queries: ['Azure', '.NET', 'Microsoft', 'React', 'cloud platform', 'enterprise app'],
      pagePaths: ['/technology', '/platform', '/services', '/solutions', '/careers', '/blog', '/case-studies'],
      keywords: [/azure|\.net|microsoft|react|cloud platform|enterprise app/i],
      score: 4,
    },
    {
      name: 'ai_automation',
      titlePrefix: 'AI automation signal',
      strongTitle: 'AI or automation initiative',
      weakTitle: 'AI or automation mention',
      queries: ['AI', 'automation', 'copilot', 'LLM', 'agentic', 'workflow automation', 'chatbot'],
      pagePaths: ['/blog', '/news', '/services', '/solutions', '/resources', '/platform', '/case-studies'],
      keywords: [/ai|artificial intelligence|automation|copilot|llm|agentic|chatbot|workflow automation/i],
      score: 4,
    },
  ];

  const signals = [];
  for (const topic of serviceTopics) {
    const [newsSignals, websiteSignals] = await Promise.all([
      collectTopicNewsSignals(company, {
        source: 'news',
        name: topic.name,
        titlePrefix: topic.titlePrefix,
        strongTitle: topic.strongTitle,
        weakTitle: topic.weakTitle,
        queries: topic.queries,
        keywords: topic.keywords,
        baseScore: Math.max(2, topic.score - 1),
        strongScore: topic.score,
      }),
      collectTopicWebsiteSignals(company, {
        source: 'website',
        name: topic.name,
        titlePrefix: topic.titlePrefix,
        strongTitle: topic.strongTitle,
        weakTitle: topic.weakTitle,
        pagePaths: topic.pagePaths,
        keywords: topic.keywords,
        baseScore: Math.max(2, topic.score - 1),
        strongScore: topic.score,
      }),
    ]);
    signals.push(...newsSignals, ...websiteSignals);
  }

  return dedupeSignals(signals);
}

function parseDriveSearchFiles(output = '') {
  try {
    const parsed = JSON.parse(String(output || '{}'));
    return Array.isArray(parsed.files) ? parsed.files : [];
  } catch {
    return [];
  }
}

function scoreSowFile(file = {}, companyName = '') {
  const name = cleanText(file.name || '');
  const lower = name.toLowerCase();
  let score = 0;
  if (/sow|statement of work|scope of work/i.test(name)) score += 10;
  if (/contract|agreement|work order|project|proposal|estimate|rfp/i.test(name)) score += 4;
  if (companyName && lower.includes(companyName.toLowerCase())) score += 3;
  if (file.mimeType === 'application/vnd.google-apps.document') score += 4;
  if (file.modifiedTime) score += 1;
  return score;
}

function addMonthsToDate(date, months) {
  const copy = new Date(date);
  copy.setUTCMonth(copy.getUTCMonth() + months);
  return copy;
}

function extractSowEndDateFromText(text = '') {
  const source = String(text || '');
  const lines = source.split(/\r?\n/).map((line) => cleanText(line)).filter(Boolean);
  const candidates = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const nextLine = lines[index + 1] || '';
    const windowText = `${line} ${nextLine}`.trim();
    const dateMatches = [...windowText.matchAll(/\b((?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{1,2},?\s+\d{4}|\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{4}|\d{4}-\d{2}-\d{2})\b/gi)];
    if (!dateMatches.length) continue;

    const exactDates = dateMatches
      .map((match) => parseDate(match[1]))
      .filter(Boolean);
    const latestExactDate = exactDates.sort((a, b) => b.getTime() - a.getTime())[0] || null;

    if (/effective date/i.test(windowText) && /month|week|day/i.test(windowText)) {
      const durationMatch = /(\d+)\s*(month|months|week|weeks|day|days)\b/i.exec(windowText);
      const effectiveMatch = /\beffective date(?: is expected to|[:\s-]+)?\s*(?:on\s*)?((?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{1,2},?\s+\d{4}|\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{4}|\d{4}-\d{2}-\d{2})/i.exec(windowText);
      if (durationMatch && effectiveMatch) {
        const baseDate = parseDate(effectiveMatch[1]);
        const amount = Number(durationMatch[1]);
        const unit = durationMatch[2].toLowerCase();
        if (baseDate && Number.isFinite(amount)) {
          let endDate = baseDate;
          if (unit.startsWith('month')) endDate = addMonthsToDate(baseDate, amount);
          if (unit.startsWith('week')) endDate = new Date(baseDate.getTime() + amount * 7 * 24 * 60 * 60 * 1000);
          if (unit.startsWith('day')) endDate = new Date(baseDate.getTime() + amount * 24 * 60 * 60 * 1000);
          candidates.push({ score: 10, date: endDate, evidence: windowText });
          continue;
        }
      }
    }

    if (/end date|final date|expires?|expiration|completion|through|until|period of performance|performance period/i.test(windowText)) {
      candidates.push({ score: 9, date: latestExactDate, evidence: windowText });
      continue;
    }

    if (/invoice term|payment schedule|invoice schedule|payment terms/i.test(windowText)) {
      candidates.push({ score: 7, date: latestExactDate, evidence: windowText });
      continue;
    }

    candidates.push({ score: 4, date: latestExactDate, evidence: windowText });
  }

  const normalized = candidates.filter((candidate) => candidate.date && !Number.isNaN(candidate.date.getTime()));
  if (!normalized.length) return null;
  normalized.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.date.getTime() - a.date.getTime();
  });
  return normalized[0].date;
}

async function fetchDriveDocumentText(fileId) {
  const outFile = path.join('/tmp', `isa-drive-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.txt`);
  try {
    const result = await runJson('gog', ['docs', 'export', fileId, '--format', 'txt', '--out', outFile], { timeoutMs: 45000 });
    if (result.exitCode !== 0) return '';
    return await fs.readFile(outFile, 'utf8');
  } catch {
    return '';
  } finally {
    try {
      await fs.unlink(outFile);
    } catch {}
  }
}

async function resolveSowEndDate(company = {}, deals = []) {
  const companyName = cleanText(company.companyName || company.name || '');
  const companyDomain = cleanText(company.domain || company.companyDomain || '');
  const dealNames = [...new Set((deals || []).map((deal) => cleanText(deal?.properties?.dealname || deal?.dealname || '')).filter(Boolean))].slice(0, 3);
  const searchTerms = [
    companyName,
    companyDomain,
    ...dealNames,
  ].filter(Boolean);
  if (!searchTerms.length) return null;

  const queries = [];
  for (const term of searchTerms) {
    queries.push(`${term} SOW`);
    queries.push(`${term} statement of work`);
    queries.push(`${term} scope of work`);
    queries.push(`${term} contract`);
  }

  const seen = new Set();
  const candidates = [];
  for (const query of [...new Set(queries)].slice(0, 8)) {
    try {
      const result = await runJson('gog', ['drive', 'search', query, '--max', '8', '--json', '--no-input'], { timeoutMs: 30000 });
      if (result.exitCode !== 0) continue;
      const files = parseDriveSearchFiles(result.stdout);
      for (const file of files) {
        const fileId = cleanText(file.id || '');
        if (!fileId || seen.has(fileId)) continue;
        seen.add(fileId);
        candidates.push(file);
      }
    } catch {}
  }

  const ranked = candidates
    .map((file) => ({ file, score: scoreSowFile(file, companyName) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  for (const { file } of ranked) {
    if (file.mimeType !== 'application/vnd.google-apps.document') continue;
    const text = await fetchDriveDocumentText(file.id);
    if (!text) continue;
    const endDate = extractSowEndDateFromText(text);
    if (endDate) return endDate;
  }

  return null;
}

function combineSignalNarrative(signals = []) {
  const ordered = [...signals].sort((a, b) => (b.score || 0) - (a.score || 0));
  if (!ordered.length) return '';
  const top = ordered[0];
  const secondary = ordered[1];
  const fragments = [`${top.title}: ${top.detail}`];
  if (secondary) fragments.push(`${secondary.title}: ${secondary.detail}`);
  return fragments.join(' ');
}

function buildFallbackSignals(company = {}, proposedContact = null, activeContacts = [], leadMatches = []) {
  const companyName = cleanText(company.companyName || company.name || '');
  const website = cleanText(company.website || '');
  const domain = cleanText(company.domain || '');
  const industry = cleanText(company.industry || '');
  const signals = [];

  if (website || domain) {
    signals.push({
      source: 'fallback',
      score: 1,
      title: 'Website on file',
      detail: `${companyName || 'Company'} has a public website${website ? `: ${website}` : domain ? `: ${domain}` : ''}.`,
      evidence: website || domain,
    });
  }

  if (industry) {
    signals.push({
      source: 'fallback',
      score: 1,
      title: 'Industry context',
      detail: `${companyName || 'Company'} is tagged as ${industry}.`,
      evidence: industry,
    });
  }

  if (activeContacts.length) {
    signals.push({
      source: 'fallback',
      score: 1,
      title: 'Reachable contact on file',
      detail: `${activeContacts.length} active contact${activeContacts.length === 1 ? '' : 's'} available for ${companyName || 'this account'}.`,
      evidence: proposedContact ? contactReference(proposedContact) : '',
    });
  }

  if (leadMatches.length) {
    signals.push({
      source: 'fallback',
      score: 1,
      title: 'Existing lead history',
      detail: `${leadMatches.length} lead record${leadMatches.length === 1 ? '' : 's'} already exist for this company or contact.`,
      evidence: '',
    });
  }

  return dedupeSignals(signals);
}

function buildDealTimingSignals(recentDeals = [], dealSummary = {}) {
  const signals = [];
  const dealCount = Array.isArray(recentDeals) ? recentDeals.length : Number(dealSummary?.dealCount || 0);
  const lastProjectEndDate = dealSummary?.lastProjectEndDate ? parseDate(dealSummary.lastProjectEndDate) : null;
  const now = new Date();

  if (lastProjectEndDate) {
    const daysSinceEnd = Math.floor((now.getTime() - lastProjectEndDate.getTime()) / (24 * 60 * 60 * 1000));
    if (daysSinceEnd <= 180) {
      signals.push({
        source: 'deal_timing',
        score: 4,
        title: 'Recent project timing',
        detail: `The latest won project ended ${daysSinceEnd} days ago, which is still fresh enough for a re-engagement angle.`,
        evidence: lastProjectEndDate.toISOString(),
      });
    } else if (daysSinceEnd <= 365) {
      signals.push({
        source: 'deal_timing',
        score: 3,
        title: 'Recent project timing',
        detail: `The latest won project ended ${daysSinceEnd} days ago, which suggests a timely follow-up opportunity.`,
        evidence: lastProjectEndDate.toISOString(),
      });
    } else if (daysSinceEnd <= 730) {
      signals.push({
        source: 'deal_timing',
        score: 2,
        title: 'Prior project timing',
        detail: `The latest won project ended ${daysSinceEnd} days ago, which can still justify a warm re-engagement.`,
        evidence: lastProjectEndDate.toISOString(),
      });
    }
  }

  if (dealCount >= 3) {
    signals.push({
      source: 'deal_timing',
      score: 2,
      title: 'Multi-project history',
      detail: `${dealCount} won deals are linked to this account, which makes it easier to frame a credible outreach angle.`,
      evidence: '',
    });
  } else if (dealCount === 2) {
    signals.push({
      source: 'deal_timing',
      score: 1,
      title: 'Repeat project history',
      detail: 'Two won deals are linked to this account, so there is already some delivery history to refer back to.',
      evidence: '',
    });
  }

  return dedupeSignals(signals);
}

function strongEnoughSignals(signals = []) {
  const ordered = [...signals].sort((a, b) => (b.score || 0) - (a.score || 0));
  const totalScore = ordered.reduce((sum, signal) => sum + Number(signal.score || 0), 0);
  const hasStrongSingle = ordered.some((signal) => Number(signal.score || 0) >= 3);
  const strongCount = ordered.filter((signal) => Number(signal.score || 0) >= 2).length;
  return {
    ordered,
    totalScore,
    isStrong: hasStrongSingle || totalScore >= 4 || (strongCount >= 2 && totalScore >= 4) || (ordered.length >= 3 && totalScore >= 4),
  };
}

async function collectCompanyOutreachContext(company, proposedContact, activeContacts, leadMatches, recentDeals = [], dealSummary = {}) {
  const debugCompany = cleanText(process.env.REENGAGEMENT_DEBUG_COMPANY || '').toLowerCase();
  const companyNameForDebug = cleanText(company.companyName || company.name || '').toLowerCase();
  const dealTimingSignals = buildDealTimingSignals(recentDeals, dealSummary);
  const sourceTimeout = Number(process.env.REENGAGEMENT_SOURCE_TIMEOUT_MS || 12000);
  const expandedTimeout = Number(process.env.REENGAGEMENT_EXPANDED_TIMEOUT_MS || 9000);

  async function evaluateSignals(contextCompany, includeExpanded = false) {
    const [websiteSignals, eventSignals, newsSignals, appSignals, appFrictionSignals, serviceFitSignals] = await Promise.all([
      withTimeout(collectWebsiteSignals(contextCompany).catch(() => []), sourceTimeout, 'website signal timeout').catch(() => []),
      withTimeout(collectEventSignals(contextCompany).catch(() => []), sourceTimeout, 'event signal timeout').catch(() => []),
      withTimeout(collectNewsSignals(contextCompany).catch(() => []), sourceTimeout, 'news signal timeout').catch(() => []),
      withTimeout(collectAppSignals(contextCompany).catch(() => []), sourceTimeout, 'app signal timeout').catch(() => []),
      withTimeout(collectAppFrictionSignals(contextCompany).catch(() => []), sourceTimeout, 'app friction signal timeout').catch(() => []),
      withTimeout(collectServiceFitSignals(contextCompany).catch(() => []), sourceTimeout, 'service-fit signal timeout').catch(() => []),
    ]);

    const expandedSignals = includeExpanded
      ? await Promise.all([
          withTimeout(collectFundingSignals(contextCompany).catch(() => []), expandedTimeout, 'funding signal timeout').catch(() => []),
          withTimeout(collectLeadershipSignals(contextCompany).catch(() => []), expandedTimeout, 'leadership signal timeout').catch(() => []),
          withTimeout(collectProductSignals(contextCompany).catch(() => []), expandedTimeout, 'product signal timeout').catch(() => []),
          withTimeout(collectPartnershipSignals(contextCompany).catch(() => []), expandedTimeout, 'partnership signal timeout').catch(() => []),
          withTimeout(collectHiringSignals(contextCompany).catch(() => []), expandedTimeout, 'hiring signal timeout').catch(() => []),
        ])
      : [[], [], [], [], []];

    const [fundingSignals, leadershipSignals, productSignals, partnershipSignals, hiringSignals] = expandedSignals;
    const signals = dedupeSignals([
      ...websiteSignals,
      ...eventSignals,
      ...newsSignals,
      ...appSignals,
      ...appFrictionSignals,
      ...serviceFitSignals,
      ...fundingSignals,
      ...leadershipSignals,
      ...productSignals,
      ...partnershipSignals,
      ...hiringSignals,
      ...dealTimingSignals,
    ]);
    const evaluated = strongEnoughSignals(signals);

    if (debugCompany && companyNameForDebug.includes(debugCompany)) {
      process.stdout.write(
        `${JSON.stringify(
          {
            companyName: contextCompany.companyName || contextCompany.name || '',
            expanded: includeExpanded,
            sourceCounts: {
              website: websiteSignals.length,
              event: eventSignals.length,
              news: newsSignals.length,
              app: appSignals.length,
              appFriction: appFrictionSignals.length,
              serviceFit: serviceFitSignals.length,
              funding: fundingSignals.length,
              leadership: leadershipSignals.length,
              product: productSignals.length,
              partnership: partnershipSignals.length,
              hiring: hiringSignals.length,
              dealTiming: dealTimingSignals.length,
            },
          },
          null,
          2,
        )}\n`,
      );
    }

    return {
      signals: evaluated.ordered,
      totalScore: evaluated.totalScore,
      isStrong: evaluated.isStrong,
      bestSignal: evaluated.ordered[0] || null,
      narrative: combineSignalNarrative(evaluated.ordered),
    };
  }

  const quickContext = await evaluateSignals(company, false);
  if (quickContext.isStrong || quickContext.signals.length >= 2) {
    return quickContext;
  }

  const companyRecord = companyNeedsHubSpotRefresh(company)
    ? await fetchCompanyRecord(company.companyId).catch(() => null)
    : null;
  const expandedCompany = companyRecord
    ? {
        ...company,
        companyName: cleanText(companyRecord?.properties?.name || company.companyName || ''),
        companyDomain: cleanText(companyRecord?.properties?.domain || company.companyDomain || ''),
        companyWebsite: cleanText(companyRecord?.properties?.website || company.companyWebsite || ''),
        companyIndustry: cleanText(companyRecord?.properties?.industry || company.companyIndustry || ''),
      }
    : company;

  const expandedContext = await evaluateSignals(expandedCompany, true);
  if (expandedContext.isStrong || expandedContext.signals.length >= 2) {
    return expandedContext;
  }

  const searchSignals = await withTimeout(
    collectSearchSignals(expandedCompany).catch(() => []),
    8000,
    `search signal timeout for company ${company.companyId}`,
  ).catch(() => []);
  if (searchSignals.length) {
    const mergedSignals = dedupeSignals([
      ...expandedContext.signals,
      ...searchSignals,
    ]);
    const evaluated = strongEnoughSignals(mergedSignals);
    return {
      signals: evaluated.ordered,
      totalScore: evaluated.totalScore,
      isStrong: evaluated.isStrong,
      bestSignal: evaluated.ordered[0] || null,
      narrative: combineSignalNarrative(evaluated.ordered),
    };
  }

  return expandedContext.signals.length ? expandedContext : quickContext;
}

async function loadContactActivityByIds(contactIds = []) {
  const uniqueIds = [...new Set((contactIds || []).map((value) => cleanText(value)).filter(Boolean))];
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
        userIntent: 'Load contact activity for the weekly reengagement outreach report.',
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
      const contactId = cleanText(props.hs_object_id || contact?.id || '');
      if (!contactId) continue;
      activity.set(contactId, {
        lastContactedDate: lastContact ? lastContact.toISOString() : '',
      });
    }
  }

  return activity;
}

async function fetchAssociatedDeals(companyId) {
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
    limit: 100,
    sorts: [{ propertyName: 'hs_lastmodifieddate', direction: 'DESCENDING' }],
    filterGroups: [
      {
        filters: [{ propertyName: 'dealname', operator: 'HAS_PROPERTY' }],
        associatedWith: [{ objectType: 'companies', operator: 'EQUAL', objectIdValues: [Number(companyId)] }],
      },
    ],
    chatInsights: {
      userIntent: 'Review associated deals for the weekly reengagement outreach report.',
      satisfaction: 'NEUTRAL',
    },
  });
  return response.results || [];
}

async function fetchCompanyRecord(companyId) {
  if (!companyId) return null;
  const rows = await queryCrmData(
    `SELECT hs_object_id, name, domain, website, industry FROM COMPANY WHERE hs_object_id = '${String(companyId).replace(/'/g, "''")}' LIMIT 1`,
  ).catch(() => []);
  const row = rows[0];
  if (!row) return null;
  return {
    properties: {
      hs_object_id: cleanText(row.props.hs_object_id || row.labels.hs_object_id || row.columns['hs_object_id'] || companyId),
      name: cleanText(row.props.name || row.labels.name || row.labels['Company name'] || row.columns['name'] || ''),
      domain: cleanText(row.props.domain || row.labels.domain || row.columns['domain'] || ''),
      website: cleanText(row.props.website || row.labels.website || row.columns['website'] || ''),
      industry: cleanText(row.props.industry || row.labels.industry || row.columns['industry'] || ''),
    },
  };
}

function companyNeedsHubSpotRefresh(company = {}) {
  return !cleanText(company.companyWebsite || '') || !cleanText(company.companyDomain || '') || !cleanText(company.companyIndustry || '');
}

function contactDisplayName(contact) {
  return [cleanText(contact?.properties?.firstname), cleanText(contact?.properties?.lastname)].filter(Boolean).join(' ').trim();
}

function contactReference(contact) {
  const name = contactDisplayName(contact);
  const email = cleanText(contact?.properties?.email || contact?.properties?.work_email || '');
  if (!name && !email) return '';
  if (name && email) return `${name} <${email}>`;
  return name || email;
}

function contactRecordUrl(contactId = '') {
  const cleanId = cleanText(contactId);
  if (!cleanId || !HUBSPOT_PORTAL_ID) return '';
  return `https://app.hubspot.com/contacts/${HUBSPOT_PORTAL_ID}/record/0-1/${cleanId}`;
}

function scoreContact(contact) {
  const title = cleanText(contact?.properties?.jobtitle).toLowerCase();
  const role = cleanText(contact?.properties?.hs_buying_role).toLowerCase();
  const sendDate = parseDate(contact?.properties?.hs_email_last_send_date);
  const replyDate = parseDate(contact?.properties?.hs_email_last_reply_date);
  const activityDate = mostRecentDate(
    contact?.properties?.hs_email_last_send_date,
    contact?.properties?.hs_email_last_reply_date,
    contact?.properties?.notes_last_contacted,
    contact?.properties?.notes_last_updated,
  );
  let score = 0;
  if (cleanText(contact?.properties?.email || contact?.properties?.work_email)) score += 100;
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
  const candidates = (contacts || []).filter((contact) => cleanText(contact?.properties?.email || contact?.properties?.work_email));
  if (!candidates.length) return null;
  return [...candidates].sort((a, b) => scoreContact(b) - scoreContact(a))[0];
}

function dealAmountFromRow(deal = {}) {
  return (
    deal?.properties?.amount ??
    deal?.props?.amount ??
    deal?.labels?.Amount ??
    deal?.labels?.amount ??
    deal?.labels?.['Amount'] ??
    deal?.columns?.['Amount [amount]'] ??
    deal?.columns?.['amount'] ??
    ''
  );
}

function sumDealValue(deals = []) {
  return deals.reduce((sum, deal) => sum + parseAmount(dealAmountFromRow(deal)), 0);
}

function latestDealCloseDate(deals = []) {
  return mostRecentDate(...deals.map((deal) => deal?.properties?.closedate || deal?.props?.closedate || deal?.labels?.['Close Date'] || deal?.labels?.closedate || deal?.labels?.['closedate'] || deal?.columns?.['Close Date [closedate]'] || deal?.columns?.['closedate'] || ''));
}

function companyLeadMatches(leadSnapshot, companyId, contactIds = []) {
  const companyKey = cleanText(companyId);
  const contactKeys = new Set((contactIds || []).map((value) => cleanText(value)).filter(Boolean));
  return (leadSnapshot?.records || []).filter((record) => {
    const leadCompanyId = cleanText(record?.companyId || '');
    const leadContactId = cleanText(record?.contactId || '');
    return (companyKey && leadCompanyId && leadCompanyId === companyKey) || (leadContactId && contactKeys.has(leadContactId));
  });
}

function hasLeadForCompanyOrContact(leadSnapshot, companyId, contactIds = []) {
  const companyKey = String(companyId || '').trim();
  const contactKeys = new Set((contactIds || []).map((value) => String(value || '').trim()).filter(Boolean));
  return (leadSnapshot?.records || []).some((record) => {
    const leadCompanyId = String(record?.companyId || '').trim();
    const leadContactId = String(record?.contactId || '').trim();
    return (companyKey && leadCompanyId && leadCompanyId === companyKey) || (leadContactId && contactKeys.has(leadContactId));
  });
}

function isClosedWonDealRow(row = {}) {
  const stage = String(
    row.labels?.['Deal Stage'] ||
      row.labels?.['Deal stage'] ||
      row.labels?.dealstage ||
      row.props?.dealstage ||
      row.properties?.dealstage ||
      row.columns?.['Deal Stage [dealstage]'] ||
      row.columns?.['Deal stage [dealstage]'] ||
      row.columns?.['dealstage'] ||
      '',
  )
    .toLowerCase()
    .trim();
  return (
    /closed\s*won/.test(stage) ||
    /\bwon\b/.test(stage) ||
    /sow\s*signed/.test(stage) ||
    /statement of work signed/.test(stage) ||
    /signed sow/.test(stage)
  );
}

async function selectReengagementCompanies({ runDate, leadSnapshot, testOnly = false }) {
  const skipSowLookup = String(process.env.REENGAGEMENT_SKIP_SOW_LOOKUP || '').trim() === '1';
  const debugCompany = cleanText(process.env.REENGAGEMENT_DEBUG_COMPANY || '').toLowerCase();
  const scanStart = monthsAgoIsoDate(60, parseDate(runDate) || new Date());
  const scanEnd = todayIsoDate();
  const dealRows = await fetchReengagementCandidateRows(scanStart, scanEnd);
  const companyGroups = new Map();
  for (const row of dealRows) {
    if (!isClosedWonDealRow(row)) continue;
    const companyId = String(row.labels['Company'] || '').trim();
    if (!/^\d+$/.test(companyId)) continue;
    if (!companyGroups.has(companyId)) {
      companyGroups.set(companyId, {
        companyId,
        companyName: String(row.labels['Company name'] || '').trim(),
        companyDomain: String(row.labels['Company Domain Name'] || '').trim(),
        companyWebsite: String(row.labels['Website URL'] || '').trim(),
        companyIndustry: String(row.labels['Industry'] || '').trim(),
        seedDeals: [],
      });
    }
    companyGroups.get(companyId).seedDeals.push(row);
  }

  const reviewedCompanies = [];
  const scannedCompanies = [];
  const newLeadRecords = [];

  for (const company of companyGroups.values()) {
    const companyDebugText = [
      company.companyName,
      company.companyWebsite,
      company.companyDomain,
      company.companyIndustry,
    ]
      .map((value) => cleanText(value).toLowerCase())
      .filter(Boolean)
      .join(' ');
    if (debugCompany && !companyDebugText.includes(debugCompany)) continue;
    const reviewEntry = {
      companyId: company.companyId,
      companyName: cleanText(company.companyName || '') || `Company ${company.companyId}`,
      companyDomain: cleanText(company.companyDomain || ''),
      companyWebsite: cleanText(company.companyWebsite || ''),
      companyIndustry: cleanText(company.companyIndustry || ''),
    };
    reviewedCompanies.push(reviewEntry);
    const seedCompany = {
      properties: {
        hs_object_id: company.companyId,
        name: company.companyName,
        domain: company.companyDomain,
        website: company.companyWebsite,
        industry: company.companyIndustry,
      },
    };
    const resolvedCompany = testOnly || !companyNeedsHubSpotRefresh(company)
      ? seedCompany
      : (await fetchCompanyRecord(company.companyId).catch(() => null)) || seedCompany;

    if (testOnly) {
      const seedContacts = [...company.seedDeals]
        .map((row) => {
          const contactId = String(row.labels['Contact'] || row.props['Contact [hs_object_id]'] || '').trim();
          if (!contactId) return null;
          return {
            properties: {
              hs_object_id: contactId,
              firstname: String(row.labels['First Name'] || '').trim(),
              lastname: String(row.labels['Last Name'] || '').trim(),
              email: String(row.labels['Email'] || '').trim(),
              work_email: String(row.labels['Work email'] || '').trim(),
            },
          };
        })
        .filter(Boolean);
      const contactIds = seedContacts.map((contact) => contact?.properties?.hs_object_id || contact?.id || '');
      const qualifyingDeals = company.seedDeals.filter(isClosedWonDealRow);
      if (!qualifyingDeals.length) continue;
      const proposedContact = pickProposedContact(seedContacts);
      const hasExistingLead = hasLeadForCompanyOrContact(leadSnapshot, company.companyId, contactIds);
      const lastContactedDate = latestContactTouch(seedContacts);
      const lastProjectEndDate = latestDealCloseDate(qualifyingDeals);
      const totalDealValue = sumDealValue(qualifyingDeals);
      Object.assign(reviewEntry, {
        proposedContact,
        dealSummary: {
          lastProjectEndDate,
          totalDealValue,
          dealCount: qualifyingDeals.length,
        },
        activeContacts: seedContacts,
        recentDeals: qualifyingDeals,
        leadMatches: companyLeadMatches(leadSnapshot, company.companyId, contactIds),
        hasExistingLead,
        lastContactRecordUrl: proposedContact ? contactRecordUrl(proposedContact?.properties?.hs_object_id || proposedContact?.id || '') : '',
        lastContactedDate: lastContactedDate ? lastContactedDate.toISOString() : '',
        lastProjectEndDate: lastProjectEndDate ? lastProjectEndDate.toISOString() : '',
        totalDealValue,
        outreachContext: { signals: [], totalScore: 0, isStrong: false, bestSignal: null, narrative: '' },
      });
      scannedCompanies.push(reviewEntry);
      continue;
    }

    const seedContacts = [...company.seedDeals]
      .map((row) => {
        const contactId = String(row.labels['Contact'] || row.props['Contact [hs_object_id]'] || '').trim();
        if (!contactId) return null;
        return {
          properties: {
            hs_object_id: contactId,
            firstname: String(row.labels['First Name'] || '').trim(),
            lastname: String(row.labels['Last Name'] || '').trim(),
            email: String(row.labels['Email'] || '').trim(),
            work_email: String(row.labels['Work email'] || '').trim(),
            contact_status: String(row.labels['Contact Status'] || '').trim(),
            hs_email_last_send_date: String(row.labels['Last marketing email send date'] || '').trim(),
            hs_email_last_reply_date: String(row.labels['Last marketing email reply date'] || '').trim(),
            notes_last_contacted: String(row.labels['Last Contacted'] || '').trim(),
            notes_last_updated: String(row.labels['Last Activity Date'] || '').trim(),
            jobtitle: String(row.labels['Job title'] || '').trim(),
            hs_buying_role: String(row.labels['Buying role'] || '').trim(),
          },
        };
      })
      .filter(Boolean);
    const associatedDeals = testOnly ? [] : await fetchAssociatedDeals(company.companyId).catch(() => []);
    const uniqueDealKeys = new Set();
    const uniqueDeals = [];
    const dealSeed = [...associatedDeals, ...company.seedDeals];
    for (const deal of dealSeed) {
      const dealKey =
        String(deal?.id || deal?.properties?.hs_object_id || '').trim() ||
        `${String(deal?.properties?.dealname || deal?.labels?.['Deal Name'] || '').trim()}|${String(deal?.properties?.closedate || deal?.labels?.['Close Date'] || '').trim()}|${String(deal?.properties?.amount || deal?.labels?.['Amount'] || '').trim()}`;
      if (!dealKey || uniqueDealKeys.has(dealKey)) continue;
      uniqueDealKeys.add(dealKey);
      uniqueDeals.push(deal);
    }
    const qualifyingDeals = uniqueDeals.filter(isClosedWonDealRow);
    if (!qualifyingDeals.length) {
      continue;
    }
    const activeContacts = testOnly
      ? seedContacts.filter((contact) => {
          const props = contact?.properties || {};
          const email = cleanText(props.email || props.work_email || '');
          return Boolean(email);
        })
      : await associatedRecords(
          'contacts',
          company.companyId,
          [
            'hs_object_id',
            'firstname',
            'lastname',
            'email',
            'work_email',
            'contact_status',
            'hs_email_last_send_date',
            'hs_email_last_reply_date',
            'notes_last_contacted',
            'notes_last_updated',
            'jobtitle',
            'hs_buying_role',
          ],
          ).then((records) => {
          const filtered = records.filter((contact) => {
            const props = contact?.properties || {};
            const email = cleanText(props.email || props.work_email || '');
            const status = cleanText(props.contact_status || '');
            return Boolean(email) && (!status || isActiveStatus(status) || status.toLowerCase() !== 'inactive');
          });
          return filtered.length ? filtered : seedContacts;
        }).catch(() => seedContacts);
    const dealSummary = {
      lastProjectEndDate: testOnly || skipSowLookup
        ? latestDealCloseDate(qualifyingDeals)
        : await resolveSowEndDate({
            companyId: company.companyId,
            companyName: cleanText(resolvedCompany?.properties?.name || company.companyName || '') || `Company ${company.companyId}`,
            domain: cleanText(resolvedCompany?.properties?.domain || ''),
          }, qualifyingDeals).catch(() => null) || latestDealCloseDate(qualifyingDeals),
      totalDealValue: sumDealValue(qualifyingDeals),
      dealCount: qualifyingDeals.length,
    };
    const proposedContact = pickProposedContact(activeContacts);
    const contactIds = activeContacts.map((contact) => contact?.properties?.hs_object_id || contact?.id || '');
    const leadMatches = companyLeadMatches(leadSnapshot, company.companyId, contactIds);
    const hasExistingLead = hasLeadForCompanyOrContact(leadSnapshot, company.companyId, contactIds);
    const lastContactedDate = latestContactTouch(activeContacts);

    if (testOnly) {
      Object.assign(reviewEntry, {
        proposedContact,
        dealSummary,
        activeContacts,
        recentDeals: qualifyingDeals,
        leadMatches,
        hasExistingLead,
        lastContactedDate: lastContactedDate ? lastContactedDate.toISOString() : '',
        lastProjectEndDate: dealSummary.lastProjectEndDate ? dealSummary.lastProjectEndDate.toISOString() : '',
        totalDealValue: dealSummary.totalDealValue,
        outreachContext: { signals: [], totalScore: 0, isStrong: false, bestSignal: null, narrative: '' },
      });
      scannedCompanies.push(reviewEntry);
      continue;
    }

    const outreachContext = await withTimeout(
      collectCompanyOutreachContext(
        {
          companyId: company.companyId,
          companyName: cleanText(resolvedCompany?.properties?.name || company.companyName || '') || `Company ${company.companyId}`,
          domain: cleanText(resolvedCompany?.properties?.domain || ''),
          website: cleanText(resolvedCompany?.properties?.website || ''),
          industry: cleanText(resolvedCompany?.properties?.industry || ''),
        },
        proposedContact,
        activeContacts,
        leadMatches,
        qualifyingDeals,
        dealSummary,
      ),
      OUTREACH_CONTEXT_TIMEOUT_MS,
      `outreach context timeout for company ${company.companyId}`,
    ).catch(() => ({
      signals: [],
      totalScore: 0,
      isStrong: false,
      bestSignal: null,
      narrative: '',
      timedOut: true,
    }));

    Object.assign(reviewEntry, {
      proposedContact,
      dealSummary,
      activeContacts,
      recentDeals: qualifyingDeals,
      leadMatches,
      hasExistingLead,
      lastContactRecordUrl: proposedContact ? contactRecordUrl(proposedContact?.properties?.hs_object_id || proposedContact?.id || '') : '',
      lastContactedDate: lastContactedDate ? lastContactedDate.toISOString() : '',
      lastProjectEndDate: dealSummary.lastProjectEndDate ? dealSummary.lastProjectEndDate.toISOString() : '',
      totalDealValue: dealSummary.totalDealValue,
      outreachContext,
    });
    scannedCompanies.push(reviewEntry);

    if (hasExistingLead || !outreachContext.isStrong) {
      continue;
    }

    newLeadRecords.push({
      type: 'new',
      companyId: company.companyId,
      companyName: cleanText(resolvedCompany?.properties?.name || company.companyName || '') || `Company ${company.companyId}`,
      leadName: proposedContact ? contactDisplayName(proposedContact) : cleanText(company.companyName || '') || `Lead ${company.companyId}`,
      contactId: proposedContact?.properties?.hs_object_id || proposedContact?.id || '',
      contactName: proposedContact ? contactDisplayName(proposedContact) : '',
      contactEmail: proposedContact ? cleanText(proposedContact?.properties?.email || proposedContact?.properties?.work_email || '') : '',
      outreachSignal: outreachContext.narrative || `Recent closed project activity and an active contact, with no existing lead yet.`,
      lastContactRecordUrl: proposedContact ? contactRecordUrl(proposedContact?.properties?.hs_object_id || proposedContact?.id || '') : '',
      lastContactedDate: proposedContact
        ? mostRecentDate(
            proposedContact?.properties?.hs_email_last_send_date,
            proposedContact?.properties?.hs_email_last_reply_date,
            proposedContact?.properties?.notes_last_contacted,
            proposedContact?.properties?.notes_last_updated,
          )?.toISOString() || ''
        : '',
      lastProjectEndDate: dealSummary.lastProjectEndDate ? dealSummary.lastProjectEndDate.toISOString() : '',
      totalDealValue: dealSummary.totalDealValue,
      outreachScore: outreachContext.totalScore,
      signalSources: outreachContext.signals.map((signal) => signal.source),
      outreachSignals: outreachContext.signals,
    });
  }

  return {
    scanStart,
    scanEnd,
    companyCount: companyGroups.size,
    dealRowsFetched: dealRows.length,
    reviewedCompanies,
    scannedCompanies,
    newLeadRecords,
  };
}

function sortRecords(records = []) {
  return [...records].sort((a, b) => {
    const aKey = `${a.companyName || ''} ${a.leadName || ''}`.toLowerCase();
    const bKey = `${b.companyName || ''} ${b.leadName || ''}`.toLowerCase();
    return aKey.localeCompare(bKey);
  });
}

function mergeCompanyRecords(reviewedCompanies = [], scannedCompanies = []) {
  const merged = new Map();
  for (const record of reviewedCompanies || []) {
    const key = String(record.companyId || '').trim() || cleanText(record.companyName || '').toLowerCase();
    if (!key) continue;
    merged.set(key, { ...record });
  }
  for (const record of scannedCompanies || []) {
    const key = String(record.companyId || '').trim() || cleanText(record.companyName || '').toLowerCase();
    if (!key) continue;
    merged.set(key, { ...(merged.get(key) || {}), ...record });
  }
  return [...merged.values()];
}

function formatRecordDate(value = '', { includeTime = false } = {}) {
  if (includeTime) return formatDateTime(value);
  return formatDateOnly(value);
}

function signalStrengthLabel(score = 0) {
  const numeric = Number(score || 0);
  if (numeric >= 4) return 'Strong';
  if (numeric >= 3) return 'Medium';
  return 'Weak';
}

function signalStrengthBreakdown(signals = []) {
  const counts = { strong: 0, medium: 0, weak: 0 };
  for (const signal of signals || []) {
    const label = signalStrengthLabel(signal?.score || 0).toLowerCase();
    if (counts[label] !== undefined) counts[label] += 1;
  }
  return counts;
}

function sortedSignals(record = {}) {
  return [...(record?.outreachContext?.signals || [])]
    .sort((a, b) => (Number(b.score || 0) - Number(a.score || 0)) || cleanText(a.title || '').localeCompare(cleanText(b.title || '')));
}

function recordBlockMarkdown(record, kindLabel) {
  const signalSources = [...new Set((record.signalSources || []).map((value) => cleanText(value)).filter(Boolean))].join(', ');
  const allSignals = Array.isArray(record.outreachSignals) ? record.outreachSignals : [];
  const lines = [
    `### ${record.companyName || 'Untitled company'} / ${record.leadName || 'Untitled lead'}`,
    `- Type: ${kindLabel}`,
    `- Outreach signal: ${record.outreachSignal || 'Review manually'}`,
    `- Last contact moment: ${formatRecordDate(record.lastContactedDate, { includeTime: true })}${record.lastContactRecordUrl ? ` ([Open record](${record.lastContactRecordUrl}))` : ''}`,
    `- End date of latest project (based on SoW): ${formatRecordDate(record.lastProjectEndDate)}`,
    `- Total value of all deals: ${formatAmount(record.totalDealValue)}`,
  ];
  if (signalSources) {
    lines.push(`- Signal sources: ${signalSources}`);
  }
  if (allSignals.length) {
    lines.push('- All signals:');
    for (const signal of allSignals) {
      lines.push(`  - ${formatSignalLabel(signal)}`);
    }
  }
  if (record.leadStage) {
    lines.push(`- Current lead stage: ${record.leadStage}`);
  }
  return lines.join('\n');
}

function recordBlockHtml(record, kindLabel) {
  const signalSources = [...new Set((record.signalSources || []).map((value) => cleanText(value)).filter(Boolean))].join(', ');
  const allSignals = Array.isArray(record.outreachSignals) ? record.outreachSignals : [];
  const signalItems = allSignals.length
    ? allSignals
        .map((signal) => `<li style="margin:0 0 4px;">${escapeHtml(formatSignalLabel(signal))}</li>`)
        .join('')
    : '';
  return `
    <div style="margin:18px 0 22px;padding:18px 18px 16px;border:1px solid #e5e7eb;border-radius:10px;background:#fafafa;">
      <p style="margin:0 0 6px;"><strong>Company name / Lead name:</strong> ${escapeHtml(record.companyName || 'Untitled company')} / ${escapeHtml(record.leadName || 'Untitled lead')}</p>
      <p style="margin:0 0 6px;"><strong>Type:</strong> ${escapeHtml(kindLabel)}</p>
      <p style="margin:0 0 6px;"><strong>Outreach signal:</strong> ${escapeHtml(record.outreachSignal || 'Review manually')}</p>
      <p style="margin:0 0 6px;"><strong>Last contact moment:</strong> ${escapeHtml(formatRecordDate(record.lastContactedDate, { includeTime: true }))}${record.lastContactRecordUrl ? ` <a href="${escapeHtml(record.lastContactRecordUrl)}" style="color:#2563eb;text-decoration:none;">Open record</a>` : ''}</p>
      <p style="margin:0 0 6px;"><strong>End date of latest project (based on SoW):</strong> ${escapeHtml(formatRecordDate(record.lastProjectEndDate))}</p>
      <p style="margin:0 0 6px;"><strong>Total value of all deals:</strong> ${escapeHtml(formatAmount(record.totalDealValue))}</p>
      ${signalSources ? `<p style="margin:0 0 6px;"><strong>Signal sources:</strong> ${escapeHtml(signalSources)}</p>` : ''}
      ${signalItems ? `<p style="margin:0 0 6px;"><strong>All signals:</strong></p><ul style="margin:0;padding-left:20px;">${signalItems}</ul>` : '<p style="margin:0 0 6px;"><strong>All signals:</strong> No outreach signals captured.</p>'}
      ${record.leadStage ? `<p style="margin:0;"><strong>Current lead stage:</strong> ${escapeHtml(record.leadStage)}</p>` : ''}
    </div>
  `;
}

function formatSignalLabel(signal = {}) {
  const title = cleanText(signal.title || 'Signal');
  const detail = cleanText(signal.detail || '');
  const score = Number(signal.score || 0);
  const source = cleanText(signal.source || '');
  const parts = [`${signalStrengthLabel(score)}`];
  parts.push(`${title}`);
  if (source) parts.push(`[${source}]`);
  parts.push(`score ${score}`);
  if (detail) parts.push(`- ${detail}`);
  return parts.join(' ');
}

function buildReportFallbackSignals(record = {}) {
  const signals = [];
  const companyName = cleanText(record.companyName || '');
  const website = cleanText(record.companyWebsite || '');
  const domain = cleanText(record.companyDomain || '');
  const industry = cleanText(record.companyIndustry || '');
  const activeContacts = Array.isArray(record.activeContacts) ? record.activeContacts : [];
  const recentDeals = Array.isArray(record.recentDeals) ? record.recentDeals : [];
  const proposedContact = record.proposedContact || null;

  if (website || domain) {
    signals.push({
      source: 'fallback',
      score: 1,
      title: 'Website on file',
      detail: `${companyName || 'Company'} has a public website${website ? `: ${website}` : domain ? `: ${domain}` : ''}.`,
      evidence: website || domain,
    });
  }

  if (industry) {
    signals.push({
      source: 'fallback',
      score: 1,
      title: 'Industry context',
      detail: `${companyName || 'Company'} is tagged as ${industry}.`,
      evidence: industry,
    });
  }

  if (activeContacts.length) {
    signals.push({
      source: 'fallback',
      score: 1,
      title: 'Reachable contact on file',
      detail: `${activeContacts.length} active contact${activeContacts.length === 1 ? '' : 's'} available for ${companyName || 'this account'}.`,
      evidence: proposedContact ? contactReference(proposedContact) : '',
    });
  }

  if (recentDeals.length) {
    signals.push({
      source: 'fallback',
      score: 1,
      title: 'Won deal history',
      detail: `${recentDeals.length} won deal${recentDeals.length === 1 ? '' : 's'} are in scope for this account.`,
      evidence: '',
    });
  }

  return dedupeSignals(signals);
}

function topSignals(record, limit = 3) {
  return [...(record?.outreachContext?.signals || [])]
    .sort((a, b) => (Number(b.score || 0) - Number(a.score || 0)) || cleanText(a.title || '').localeCompare(cleanText(b.title || '')))
    .slice(0, limit);
}

function sourceLabel(source = '') {
  const normalized = cleanText(source).toLowerCase();
  const labels = {
    app: 'App',
    review: 'Review',
    website: 'Website',
    news: 'News',
    search: 'Search',
    event: 'Event',
    funding: 'Funding',
    leadership: 'Leadership',
    product: 'Product',
    partnership: 'Partnership',
    hiring: 'Hiring',
    service_fit: 'Service fit',
  };
  return labels[normalized] || normalized || 'Other';
}

function signalsBySource(record, limitPerSource = 2) {
  const signals = Array.isArray(record?.outreachSignals)
    ? record.outreachSignals
    : Array.isArray(record?.outreachContext?.signals)
      ? record.outreachContext.signals
      : [];
  const groups = new Map();
  for (const signal of signals) {
    const source = cleanText(signal.source || 'other').toLowerCase() || 'other';
    if (!groups.has(source)) groups.set(source, []);
    groups.get(source).push(signal);
  }
  return [...groups.entries()]
    .map(([source, groupSignals]) => ({
      source,
      signals: [...groupSignals]
        .sort((a, b) => (Number(b.score || 0) - Number(a.score || 0)) || cleanText(a.title || '').localeCompare(cleanText(b.title || '')))
        .slice(0, limitPerSource),
      bestScore: Math.max(...groupSignals.map((signal) => Number(signal.score || 0)), 0),
    }))
    .sort((a, b) => b.bestScore - a.bestScore || sourceLabel(a.source).localeCompare(sourceLabel(b.source)));
}

function formatSignalDateHint(signal = {}) {
  const detail = cleanText(signal.detail || '');
  const evidence = cleanText(signal.evidence || '');
  const text = `${detail} ${evidence}`;
  const dateMatch = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  return dateMatch ? dateMatch[1] : '';
}

function buildClientReadyDraft(record = {}) {
  const companyName = cleanText(record.companyName || 'this company');
  const signals = sortedSignals(record);
  const top = signals[0] || null;
  const secondary = signals[1] || null;
  if (!top) {
    return `Could we revisit ${companyName} and see whether there is a timely reason to reconnect?`;
  }

  const topDetail = cleanText(top.detail || '');
  const secondaryDetail = secondary ? cleanText(secondary.detail || '') : '';
  const dateHint = formatSignalDateHint(top);
  const secondClause = secondaryDetail ? ` ${secondaryDetail}` : '';

  switch (cleanText(top.source || '').toLowerCase()) {
    case 'app':
      return `Could we revisit the app experience for ${companyName}? ${topDetail || `The strongest signal points to the mobile experience${dateHint ? ` around ${dateHint}` : ''}.`}${secondClause}`;
    case 'website':
      return `Could we revisit the website experience for ${companyName}? ${topDetail || 'The strongest signal points to the current website setup and there is likely room to improve the digital journey.'}${secondClause}`;
    case 'news':
      return `Could we reopen the conversation with ${companyName} while this market signal is fresh? ${topDetail || 'There is a recent external trigger worth connecting back to the account.'}${secondClause}`;
    case 'event':
      return `Could we use the upcoming event timing at ${companyName} as a reason to reconnect? ${topDetail || 'There is a live event-related trigger that can support a relevant follow-up.'}${secondClause}`;
    case 'deal_timing':
      return `Could we reconnect on ${companyName} while the project history is still fresh? ${topDetail || 'The latest project timing gives us a concrete reason to follow up.'}${secondClause}`;
    case 'funding':
      return `Could we reconnect with ${companyName} around the recent funding context? ${topDetail || 'There is a financing trigger that can support a timely follow-up.'}${secondClause}`;
    case 'leadership':
      return `Could we reconnect with ${companyName} around the leadership change? ${topDetail || 'A leadership update gives us a natural reason to follow up.'}${secondClause}`;
    case 'product':
      return `Could we reconnect with ${companyName} around the product signal? ${topDetail || 'A product update gives us a clear reason to follow up.'}${secondClause}`;
    case 'partnership':
      return `Could we reconnect with ${companyName} around the partnership or integration signal? ${topDetail || 'A partnership update gives us a concrete reason to follow up.'}${secondClause}`;
    case 'hiring':
      return `Could we reconnect with ${companyName} around the hiring signal? ${topDetail || 'Hiring activity gives us a credible reason to follow up.'}${secondClause}`;
    case 'service_fit':
      return `Could we reconnect with ${companyName} around the service-fit signal? ${topDetail || 'There is enough context to frame a relevant follow-up.'}${secondClause}`;
    default:
      return `Could we reconnect with ${companyName}? ${topDetail || 'There is a concrete outreach trigger worth following up on.'}${secondClause}`;
  }
}

function buildTelegramMessage(summary, records = []) {
  const candidates = [...records]
    .filter((record) => Array.isArray(record?.outreachContext?.signals) && record.outreachContext.signals.length)
    .sort((a, b) => (Number(b?.outreachContext?.totalScore || 0) - Number(a?.outreachContext?.totalScore || 0)) || cleanText(a.companyName || '').localeCompare(cleanText(b.companyName || '')))
    .slice(0, 5);

  const lines = [
    'Weekly Reengagement Outreach Advice uitgevoerd',
    `Companies scanned: ${summary.scannedCompanies}`,
    `Potential new leads: ${summary.potentialNewLeads}`,
    'Reply with the company name you want me to turn into a client-ready draft.',
  ];

  if (!candidates.length) {
    lines.push('No strong outreach signals were captured in this run.');
    return lines.join('\n');
  }

  lines.push('');
  lines.push('Top candidate drafts:');
  for (const record of candidates) {
    lines.push(`- ${record.companyName || 'Untitled company'}: ${buildClientReadyDraft(record)}`);
  }
  return lines.join('\n');
}

function companySignalBlockMarkdown(record) {
  const signals = sortedSignals(record);
  const totalSignals = Array.isArray(record?.outreachContext?.signals) ? record.outreachContext.signals.length : 0;
  const breakdown = signalStrengthBreakdown(record?.outreachContext?.signals || []);
  const sources = [...new Set((record?.outreachContext?.signals || []).map((signal) => cleanText(signal.source || '')).filter(Boolean))];
  const lines = [
    `### ${record.companyName || 'Untitled company'}`,
    `- Strong enough: ${record?.outreachContext?.isStrong ? 'yes' : 'no'}`,
    `- Signals found: ${totalSignals}`,
    `- Signal mix: ${breakdown.strong} strong, ${breakdown.medium} medium, ${breakdown.weak} weak`,
    `- Last contact moment: ${formatRecordDate(record.lastContactedDate, { includeTime: true })}${record.lastContactRecordUrl ? ` ([Open record](${record.lastContactRecordUrl}))` : ''}`,
    `- End date of latest project (based on SoW): ${formatRecordDate(record.lastProjectEndDate)}`,
    `- Total value of all deals: ${formatAmount(record.totalDealValue)}`,
  ];
  if (sources.length) {
    lines.push(`- Signal sources: ${sources.join(', ')}`);
  }
  if (!signals.length) {
    lines.push('- No outreach signals captured.');
    return lines.join('\n');
  }
  lines.push('- All signals:');
  for (const signal of signals) {
    lines.push(`  - ${formatSignalLabel(signal)}`);
  }
  return lines.join('\n');
}

function companySignalBlockHtml(record) {
  const signals = sortedSignals(record);
  const totalSignals = Array.isArray(record?.outreachContext?.signals) ? record.outreachContext.signals.length : 0;
  const breakdown = signalStrengthBreakdown(record?.outreachContext?.signals || []);
  const sources = [...new Set((record?.outreachContext?.signals || []).map((signal) => cleanText(signal.source || '')).filter(Boolean))];
  const signalItems = signals.length
    ? signals
        .map((signal) => `<li style="margin:0 0 4px;">${escapeHtml(formatSignalLabel(signal))}</li>`)
        .join('')
    : '<li style="margin:0 0 4px;">No outreach signals captured.</li>';
  return `
    <div style="margin:18px 0 22px;padding:18px 18px 16px;border:1px solid #e5e7eb;border-radius:10px;background:#fafafa;">
      <p style="margin:0 0 6px;"><strong>Company name:</strong> ${escapeHtml(record.companyName || 'Untitled company')}</p>
      <p style="margin:0 0 8px;"><strong>Strong enough:</strong> ${escapeHtml(record?.outreachContext?.isStrong ? 'yes' : 'no')}</p>
      <p style="margin:0 0 6px;"><strong>Signals found:</strong> ${escapeHtml(String(totalSignals))}</p>
      <p style="margin:0 0 6px;"><strong>Signal mix:</strong> ${escapeHtml(`${breakdown.strong} strong, ${breakdown.medium} medium, ${breakdown.weak} weak`)}</p>
      <p style="margin:0 0 6px;"><strong>Last contact moment:</strong> ${escapeHtml(formatRecordDate(record.lastContactedDate, { includeTime: true }))}${record.lastContactRecordUrl ? ` <a href="${escapeHtml(record.lastContactRecordUrl)}" style="color:#2563eb;text-decoration:none;">Open record</a>` : ''}</p>
      <p style="margin:0 0 6px;"><strong>End date of latest project (based on SoW):</strong> ${escapeHtml(formatRecordDate(record.lastProjectEndDate))}</p>
      <p style="margin:0 0 6px;"><strong>Total value of all deals:</strong> ${escapeHtml(formatAmount(record.totalDealValue))}</p>
      ${sources.length ? `<p style="margin:0 0 6px;"><strong>Signal sources:</strong> ${escapeHtml(sources.join(', '))}</p>` : ''}
      <p style="margin:0 0 6px;"><strong>All signals:</strong></p>
      <ul style="margin:0;padding-left:20px;">${signalItems}</ul>
    </div>
  `;
}

function buildReengagementSummaryHtml(summary) {
  return `
    <div style="margin:18px 0 24px;padding:18px 18px 16px;border:1px solid #dbe2ea;border-radius:12px;background:#f8fafc;">
      <p style="margin:0 0 8px;"><strong>Filter applied:</strong> ${escapeHtml(summary.filterDescription)}</p>
      <p style="margin:0 0 8px;"><strong>Companies scanned:</strong> ${escapeHtml(String(summary.scannedCompanies))}</p>
    </div>
  `;
}

function buildReengagementSummaryMarkdown(summary) {
  return [
    '## Summary',
    `- Filter applied: ${summary.filterDescription}`,
    `- Companies scanned: ${summary.scannedCompanies}`,
  ].join('\n');
}

function buildCompanyReviewMarkdown(scannedCompanies = [], limit = 10) {
  const rows = sortRecords(scannedCompanies).slice(0, limit);
  if (!rows.length) return '- No companies reviewed.';
  return rows
    .map((record) => `- ${record.companyName || 'Untitled company'}`)
    .join('\n');
}

function buildCompanyReviewHtml(scannedCompanies = [], limit = 10) {
  const rows = sortRecords(scannedCompanies).slice(0, limit);
  if (!rows.length) return '<p style="margin:0;color:#374151;">No companies reviewed.</p>';
  return rows
    .map((record) => `
      <div style="margin:14px 0;padding:14px 16px;border:1px solid #e5e7eb;border-radius:10px;background:#fff;">
        <p style="margin:0;"><strong>${escapeHtml(record.companyName || 'Untitled company')}</strong></p>
      </div>
    `)
    .join('');
}

function buildPotentialNewLeadBlocksHtml(scannedCompanies = [], newLeadRecords = []) {
  const leadSet = new Set((newLeadRecords || []).map((record) => String(record.companyId || '').trim()).filter(Boolean));
  const leadBlocks = sortRecords(newLeadRecords).map((record) => recordBlockHtml(record, 'Potential new lead')).join('');
  const companyBlocks = sortRecords(scannedCompanies)
    .filter((record) => !leadSet.has(String(record.companyId || '').trim()))
    .map((record) => companySignalBlockHtml(record, 3))
    .join('');
  return `${leadBlocks}${companyBlocks}`;
}

function buildReengagementEmailHtml(runDate, summary, scannedCompanies, newLeadRecords) {
  const combinedBlocks = buildPotentialNewLeadBlocksHtml(scannedCompanies, newLeadRecords);

  return `
    <html>
      <body style="font-family: Arial, Helvetica, sans-serif; line-height:1.5; color:#111827; background:#f9fafb; padding:24px;">
        <div style="max-width:920px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;padding:24px;">
          <h2 style="margin:0 0 12px;font-size:24px;">${escapeHtml(REPORT_TITLE)} - ${escapeHtml(runDate)}</h2>
          <p style="margin:0 0 14px;color:#374151;">Weekly company re-engagement review for the current recipient.</p>
          ${buildReengagementSummaryHtml(summary)}
          <section style="margin:28px 0 0;">
            <h3 style="margin:0 0 10px;font-size:20px;color:#111827;">Potential New Leads</h3>
            ${
              combinedBlocks ||
              '<p style="margin:0;color:#374151;">No outreach signals captured.</p>'
            }
          </section>
          <p style="margin-top:24px;color:#6b7280;font-size:12px;">This email is generated by ISA, the AI assistant of Seamgen. ISA has been fed and trained with relevant knowledge, and the content and expressions are supervised. For personal contact, you can always call or email me.</p>
        </div>
      </body>
    </html>
  `;
}

function buildReengagementReportMarkdown(runDate, summary, scannedCompanies, newLeadRecords) {
  const lines = [];
  lines.push(`# ${REPORT_TITLE} - ${runDate}`);
  lines.push('');
  lines.push(buildReengagementSummaryMarkdown(summary));
  lines.push('');
  lines.push('## Potential New Leads');
  const leadSet = new Set((newLeadRecords || []).map((record) => String(record.companyId || '').trim()).filter(Boolean));
  const leadBlocks = sortRecords(newLeadRecords).map((record) => recordBlockMarkdown(record, 'Potential new lead'));
  const companyBlocks = sortRecords(scannedCompanies)
    .filter((record) => !leadSet.has(String(record.companyId || '').trim()))
    .map((record) => companySignalBlockMarkdown(record, 3));
  if (leadBlocks.length || companyBlocks.length) {
    for (const block of [...leadBlocks, ...companyBlocks]) {
      lines.push(block);
      lines.push('');
    }
  } else {
    lines.push('- No outreach signals captured.');
    lines.push('');
  }
  lines.push('---');
  lines.push('This email is generated by ISA, the AI assistant of Seamgen. ISA has been fed and trained with relevant knowledge, and the content and expressions are supervised. For personal contact, you can always call or email me.');
  return lines.join('\n');
}

async function sendReengagementEmail(htmlPath, runDate) {
  const args = [
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
    '--body-html-file',
    htmlPath,
    '--no-input',
  ];
  if (REPORT_CC) {
    args.splice(args.indexOf('--subject'), 0, '--cc', REPORT_CC);
  }
  return await runJson('gog', args, { timeoutMs: 45000 });
}

async function main() {
  const input = await readInput();
  const runDate = normalizeText(input.runDate || new Date().toISOString().slice(0, 10));
  const dryRun = String(process.env.REENGAGEMENT_DRY_RUN || '').trim() === '1';
  const testOnly = String(process.env.REENGAGEMENT_TEST_ONLY || '').trim() === '1';
  const leadClient = await loadHubSpotLeadsClient();
  const leadSnapshot = await leadClient.getLeadSnapshot({ pipelineIds: [process.env.REENGAGEMENT_LEAD_PIPELINE_ID || '2487349963'] }).catch(() => ({ total: 0, records: [] }));
  const selection = await selectReengagementCompanies({ runDate, leadSnapshot, testOnly });

  const summary = {
    filterDescription: `Companies with 1+ closed won or SoW signed deals in the last 5 years (${selection.scanStart} to ${selection.scanEnd}).`,
    scannedCompanies: selection.reviewedCompanies.length || selection.companyCount,
    existingLeadsReviewed: (selection.scannedCompanies || []).filter((record) => record.hasExistingLead).length,
    potentialNewLeads: selection.newLeadRecords.length,
  };

  const debugCompany = cleanText(process.env.REENGAGEMENT_DEBUG_COMPANY || '');
  if (debugCompany) {
    const match = (selection.scannedCompanies || selection.reviewedCompanies || []).find((record) =>
      cleanText(record.companyName || '').toLowerCase().includes(debugCompany.toLowerCase()),
    );
    process.stdout.write(
      `${JSON.stringify(
        {
          debugCompany,
          matchedCompany: match
            ? {
                companyName: match.companyName || '',
                outreachScore: Number(match?.outreachContext?.totalScore || 0),
                signalCount: Array.isArray(match?.outreachContext?.signals) ? match.outreachContext.signals.length : 0,
                signals: (match?.outreachContext?.signals || []).map((signal) => ({
                  source: signal.source || '',
                  title: signal.title || '',
                  detail: signal.detail || '',
                  score: Number(signal.score || 0),
                })),
              }
            : null,
        },
        null,
        2,
      )}\n`,
    );
  }

  const reportCompanies = selection.reviewedCompanies.length
    ? selection.reviewedCompanies
    : selection.scannedCompanies;

  if (testOnly) {
    process.stdout.write(
      `${JSON.stringify(
        {
          runDate,
          filterDescription: summary.filterDescription,
          scannedCompanies: summary.scannedCompanies,
          potentialNewLeads: summary.potentialNewLeads,
          selectedCompanies: selection.newLeadRecords.map((record) => record.companyName),
        },
        null,
        2,
      )}\n`,
    );
    return;
  }

  const reportMarkdown = buildReengagementReportMarkdown(runDate, summary, reportCompanies, selection.newLeadRecords);
  const reportHtml = buildReengagementEmailHtml(runDate, summary, reportCompanies, selection.newLeadRecords);

  await fs.mkdir(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, `${runDate}.md`);
  await fs.writeFile(reportPath, reportMarkdown, 'utf8');
  await fs.writeFile(path.join(reportDir, 'latest.md'), reportMarkdown, 'utf8');
  const reportHtmlPath = path.join(reportDir, `${runDate}.html`);
  const latestHtmlPath = path.join(reportDir, 'latest.html');
  await fs.writeFile(reportHtmlPath, reportHtml, 'utf8');
  await fs.writeFile(latestHtmlPath, reportHtml, 'utf8');

  let emailStatus = 'skipped (dry run)';
  let emailError = '';
  if (!dryRun) {
    const emailResult = await sendReengagementEmail(reportHtmlPath, runDate);
    emailStatus = emailResult.timedOut
      ? 'timed out'
      : emailResult.exitCode === 0
        ? 'sent'
        : `failed (${emailResult.exitCode})`;
    emailError = emailResult.exitCode === 0 ? '' : (emailResult.stderr || emailResult.stdout || 'unknown Gmail error').trim();
  }

  const telegramMessage = buildTelegramMessage(summary, reportCompanies);
  let telegramStatus = 'skipped (dry run)';
  let telegramError = '';
  if (!dryRun && !NO_TELEGRAM) {
    let telegramResult = { exitCode: 0 };
    for (const target of TELEGRAM_TARGETS) {
      telegramResult = await runJson('openclaw', [
        'message',
        'send',
        '--channel',
        'telegram',
        '--target',
        target,
        '--message',
        telegramMessage,
      ], { timeoutMs: 45000 });
    }
    telegramStatus = telegramResult.timedOut
      ? 'timed out'
      : telegramResult.exitCode === 0
        ? 'sent'
        : `failed (${telegramResult.exitCode})`;
    telegramError = telegramResult.exitCode === 0 ? '' : (telegramResult.stderr || telegramResult.stdout || 'unknown Telegram error').trim();
  } else if (NO_TELEGRAM) {
    telegramStatus = 'skipped';
  }

  const output = [
    `Report written to ${reportPath}`,
    `Email status: ${emailStatus}`,
    emailError ? `Email error: ${emailError}` : '',
    `Telegram status: ${telegramStatus}`,
    telegramError ? `Telegram error: ${telegramError}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  process.stdout.write(`${output}\n`);
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
