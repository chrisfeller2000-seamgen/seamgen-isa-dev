// Fetches an RFP's documents from the agency's own posting when HigherGov has none, or has
// no solicitation. October 30: 20 of the 48 RFPs scoring 50+ on their listing got no
// full-text score for missing documents, and HigherGov never refused a download; it just
// didn't have the files. Most were on agency portals behind a vendor login.
//
// Anonymous only. The job never logs in, registers, accepts terms, submits a form, pays,
// or works around a bot check or captcha: each of those is recorded as an outcome and the
// report names the portal. Every request is a GET with no cookies kept, robots.txt is
// honored, and sites listed with `fetch: false` in rfp-portals.mjs are never requested.
// Download links can carry tokens, so only a URL's origin and path are ever stored.
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { READABLE_EXTENSIONS } from './document-text.mjs';
import { chooseLocalFileName, classifyDocumentRecord, detectSignature, documentStem } from './highergov-document-flow.mjs';
import { distinctive, words } from './rfp-hubspot-match.mjs';
import { PORTAL_ACCESS_TEXT, hostOf, portalFor } from './rfp-portals.mjs';

// Honest about what it is, in the form sites expect from a browser-compatible client.
export const USER_AGENT = 'Mozilla/5.0 (compatible; SeamgenISA-RFP/1.0)';
const ROBOTS_AGENT = 'seamgenisa-rfp';
const REQUEST_TIMEOUT_MS = 20000;
const MAX_REDIRECTS = 3;
const PAGE_BYTES = 2 * 1024 * 1024;
const FILE_BYTES = 25 * 1024 * 1024;
const RFP_BYTES = 60 * 1024 * 1024;
const MAX_FILES = 10;
// HigherGov PDFs whose links are read for a portal summary's attachment list.
const MAX_SUMMARY_PDFS = 5;
const PDF_STREAM_BYTES = 8 * 1024 * 1024;
const PDF_TOTAL_BYTES = 40 * 1024 * 1024;
const LOGIN_PATH = /\/(?:login|log-in|signin|sign-in|account\/|auth|sso|register)/i;
// Cloudflare, Akamai and Imperva challenge pages, and generic captchas.
const CHALLENGE = /cf-mitigated|__cf_chl|just a moment\.\.\.|checking your browser|attention required|captcha|incapsula|access denied.*reference #/i;
const LOGIN_FORM = /<input[^>]+type\s*=\s*["']?password|\bplease\s+(?:log|sign)\s?in\b|\b(?:log|sign)\s?in\s+to\s+(?:view|download|access)\b|please login to view/i;
const NEEDS_JS = /enable javascript|requires javascript|javascript (?:is )?(?:disabled|required)|you need to enable javascript/i;
const BY_REQUEST = /(?:specifications?|documents?|bid (?:package|documents?)|rfp|solicitation)[^.]{0,60}\b(?:by|via|upon)\s+(?:e-?mail|written request|request)|\brequest (?:a copy|the (?:specifications|documents))\b/i;
// File links without an extension: CivicPlus document centers and generic download handlers.
const DOWNLOAD_PATH = /\/(?:DocumentCenter\/View|ViewFile|FileDownload|GetFile|Download(?:File|Document)?(?:\.aspx)?|PublicEventDownload)(?:\/|$|\?)/i;
const FILE_EXTENSIONS = READABLE_EXTENSIONS.filter(ext => !['.html', '.htm', '.md'].includes(ext));

// `not-attempted` is the outcome while RFP_POSTING_FETCH_ENABLED is off and the site isn't
// one the job never requests anyway.
export const OUTCOMES = ['documents-found', 'skipped-known-portal', 'login-required', 'bot-check', 'js-only', 'by-request',
  'not-a-posting', 'no-documents-listed', 'posting-gone', 'posting-unavailable', 'rate-limited', 'robots-disallowed',
  'budget-exhausted', 'no-posting-url', 'not-attempted'];

// One per run. Spreads requests to a host at least `perHostDelayMs` apart, stops after
// `maxRfps` RFPs or `totalMs`, and remembers hosts that rate-limited or challenged us.
export function createPostingBudget({ totalMs = 15 * 60 * 1000, maxRfps = 30, perHostDelayMs = 2000,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), now = () => Date.now() } = {}) {
  const started = now();
  const lastRequest = new Map(), blocked = new Map(), robots = new Map();
  let rfps = 0;
  return {
    robots,
    exhausted: () => rfps >= maxRfps || now() - started >= totalMs,
    startRfp() {
      if (rfps >= maxRfps || now() - started >= totalMs) return false;
      rfps += 1;
      return true;
    },
    async wait(host) {
      const last = lastRequest.get(host);
      if (last !== undefined) {
        const gap = last + perHostDelayMs - now();
        if (gap > 0) await sleep(gap);
      }
      lastRequest.set(host, now());
    },
    block: (host, outcome) => blocked.set(host, outcome),
    blockedOutcome: host => blocked.get(host) || null,
  };
}

// The base domain two URLs must share: the last two labels, three for country domains with
// a second level (gov.uk), four for US locality domains (ci.boston.ma.us). It errs toward
// rejecting: a file link it can't place is not followed.
export function siteOf(host) {
  const labels = String(host || '').toLowerCase().replace(/^www\./, '').split('.').filter(Boolean);
  if (labels.length < 2) return labels.join('.');
  const last = labels.at(-1), second = labels.at(-2);
  const keep = last === 'us' && labels.length >= 4 ? 4
    : last.length === 2 && ['gov', 'co', 'com', 'org', 'edu', 'ac', 'net'].includes(second) ? 3 : 2;
  return labels.slice(-keep).join('.');
}

// Origin and path only: a query string can be a signed token.
export function storedUrl(url) {
  try {
    const parsed = new URL(String(url));
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return '';
  }
}

/**
 * A GET with a timeout, a size cap and manual redirects. There is no method parameter:
 * this job never posts anything to an agency site. `allowed(url)` decides which hosts a
 * redirect may go to. `peekBytes` reads only the start of the body (the probe's dry run).
 */
export async function politeGet(url, { fetchImpl, budget, allowed = () => true, accept = '*/*', referer = '', maxBytes = PAGE_BYTES, peekBytes = 0 }) {
  let current = new URL(String(url));
  for (let hop = 0; ; hop += 1) {
    await budget.wait(current.hostname);
    let response;
    try {
      response = await fetchImpl(current.href, {
        method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: { 'user-agent': USER_AGENT, accept, 'accept-language': 'en-US,en;q=0.8', ...(referer ? { referer } : {}) },
      });
    } catch (error) {
      return { url: current, error: error?.name === 'TimeoutError' ? 'timeout' : error?.cause?.code || error?.message || 'network error' };
    }
    const location = response.headers.get('location');
    if (response.status >= 300 && response.status < 400 && location) {
      await response.body?.cancel().catch(() => {});
      const next = new URL(location, current);
      if (LOGIN_PATH.test(next.pathname)) return { url: current, status: response.status, loginRedirect: true };
      if (!['http:', 'https:'].includes(next.protocol) || !allowed(next)) return { url: current, status: response.status, offSite: true };
      if (hop + 1 > MAX_REDIRECTS) return { url: current, status: response.status, error: 'too many redirects' };
      current = next;
      continue;
    }
    const declared = Number.parseInt(response.headers.get('content-length') || '', 10);
    if (!peekBytes && Number.isFinite(declared) && declared > maxBytes) {
      await response.body?.cancel().catch(() => {});
      return { url: current, status: response.status, headers: response.headers, overCap: true };
    }
    const limit = peekBytes || maxBytes;
    const chunks = [];
    let size = 0, overCap = false;
    if (response.body) {
      const reader = response.body.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(Buffer.from(value));
          size += value.length;
          if (size > limit) {
            overCap = !peekBytes;
            await reader.cancel().catch(() => {});
            break;
          }
        }
      } catch (error) {
        // A connection dropped or timed out partway through the body.
        return { url: current, status: response.status, error: error?.name === 'TimeoutError' ? 'timeout' : 'the download was cut off' };
      }
    }
    if (overCap) return { url: current, status: response.status, headers: response.headers, overCap: true };
    const buffer = Buffer.concat(chunks);
    return { url: current, status: response.status, headers: response.headers, buffer: peekBytes ? buffer.subarray(0, peekBytes) : buffer };
  }
}

/** robots.txt rules for `*` and this job's agent, as path prefixes (`*` and `$` honored). */
export function parseRobots(text) {
  const groups = [];
  let current = null, lastWasAgent = false;
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const match = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!match) continue;
    const [, field, value] = match;
    if (/^user-agent$/i.test(field)) {
      if (!lastWasAgent) groups.push(current = { agents: [], rules: [] });
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (current && /^(?:dis)?allow$/i.test(field)) current.rules.push({ allow: /^allow$/i.test(field), path: value });
  }
  const ours = groups.filter(group => group.agents.some(agent => agent !== '*' && ROBOTS_AGENT.includes(agent)));
  return (ours.length ? ours : groups.filter(group => group.agents.includes('*'))).flatMap(group => group.rules);
}

export function robotsAllows(rules, pathname) {
  let best = null;
  for (const rule of rules || []) {
    if (!rule.path) continue;
    const pattern = new RegExp(`^${rule.path.replace(/[.+?^{}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$|\$$/, '$')}`);
    if (pattern.test(pathname) && (!best || rule.path.length > best.path.length || (rule.path.length === best.path.length && rule.allow))) best = rule;
  }
  return !best || best.allow;
}

async function robotsFor(url, context) {
  const { budget } = context;
  if (!budget.robots.has(url.origin)) {
    const answer = await politeGet(`${url.origin}/robots.txt`, { ...context, accept: 'text/plain', maxBytes: 200 * 1024 });
    budget.robots.set(url.origin, answer.status === 200 && answer.buffer ? parseRobots(answer.buffer.toString('utf8')) : []);
  }
  return budget.robots.get(url.origin);
}

/** What an HTTP answer to the posting page means, or null when the page can be read. */
export function classifyPostingPage({ status, headers, html = '' }) {
  const challenged = headers?.get?.('cf-mitigated') || CHALLENGE.test(html.slice(0, 20000));
  if (status === 401) return 'login-required';
  if (status === 403) return challenged ? 'bot-check' : 'login-required';
  if (status === 404 || status === 410) return 'posting-gone';
  if (status === 429) return 'rate-limited';
  if (!(status >= 200 && status < 300)) return 'posting-unavailable';
  if (challenged && visibleText(html).length < 2000) return 'bot-check';
  return null;
}

// A readable page with no file links: why there were none.
export function classifyEmptyPage(html = '', { scriptLinks = 0 } = {}) {
  if (LOGIN_FORM.test(html)) return 'login-required';
  const text = visibleText(html);
  if (BY_REQUEST.test(text)) return 'by-request';
  const scripts = (html.match(/<script\b/gi) || []).length;
  if (scriptLinks || NEEDS_JS.test(html) || (text.length < 300 && scripts >= 3)) return 'js-only';
  return 'no-documents-listed';
}

function visibleText(html) {
  return String(html).replace(/<(script|style|noscript)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ').replace(/\s+/g, ' ').trim();
}

const decodeEntities = text => String(text).replace(/&amp;/g, '&').replace(/&#0*39;|&apos;/g, "'").replace(/&quot;/g, '"')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));

const decodePath = value => { try { return decodeURIComponent(value); } catch { return value; } };

function looksLikeFile(url) {
  const pathname = decodePath(url.pathname).toLowerCase();
  return FILE_EXTENSIONS.some(ext => pathname.endsWith(ext)) || DOWNLOAD_PATH.test(url.pathname + (url.search ? '?' : ''));
}

/**
 * File links on a posting page. Only links on `allowed` hosts are kept; HTML pages are not
 * followed. `scriptLinks` counts JavaScript-only links, which this job can't follow.
 */
export function harvestLinks(html, baseUrl, { allowed }) {
  const links = [], seen = new Set();
  let offDomain = 0, scriptLinks = 0;
  for (const match of String(html).matchAll(/<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = decodeEntities((match[1] ?? match[2] ?? match[3] ?? '').trim());
    if (/^javascript:/i.test(href)) { scriptLinks += 1; continue; }
    let url;
    try { url = new URL(href, baseUrl); } catch { continue; }
    if (!['http:', 'https:'].includes(url.protocol) || !looksLikeFile(url)) continue;
    if (!allowed(url)) { offDomain += 1; continue; }
    url.hash = '';
    if (seen.has(url.href)) continue;
    seen.add(url.href);
    const label = decodeEntities(visibleText(match[4]));
    links.push({ name: label.length >= 3 && label.length <= 160 ? label : fileNameOf(url), url });
  }
  return { links, offDomain, scriptLinks };
}

function fileNameOf(url) {
  const base = decodePath(url.pathname.split('/').filter(Boolean).at(-1) || '');
  return base || url.hostname;
}

function dispositionName(headers) {
  const value = headers?.get?.('content-disposition') || '';
  const star = value.match(/filename\*\s*=\s*[^']*''([^;]+)/i);
  if (star) return decodeURIComponent(star[1].trim());
  return (value.match(/filename\s*=\s*"?([^";]+)"?/i) || [])[1]?.trim() || '';
}

function unescapePdfString(text) {
  return text.replace(/\\([nrtbf()\\]|[0-7]{1,3}|\r?\n)/g, (_, code) => {
    if (/^[0-7]+$/.test(code)) return String.fromCharCode(Number.parseInt(code, 8));
    return { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '(': '(', ')': ')', '\\': '\\' }[code] ?? '';
  });
}

function urisIn(text, found) {
  for (const match of text.matchAll(/\/URI\s*\(((?:\\[\s\S]|[^\\)])*)\)/g)) found.add(unescapePdfString(match[1]));
  for (const match of text.matchAll(/\/URI\s*<([0-9A-Fa-f\s]+)>/g)) found.add(Buffer.from(match[1].replace(/\s+/g, ''), 'hex').toString('latin1'));
}

/**
 * The link targets in a PDF (its /URI actions), from the raw file and from its Flate
 * streams, where PDF 1.5+ files keep annotations in object streams. pdftotext gives only
 * the visible text, and a Jaggaer summary's attachment list is visible names whose links
 * live in the file structure (fetch skill Step 7a).
 */
export function extractPdfLinks(buffer) {
  const raw = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
  const latin = raw.toString('latin1');
  if (/\/Encrypt\b/.test(latin)) return { links: [], encrypted: true };
  const found = new Set();
  urisIn(latin, found);
  let inflated = 0;
  for (const match of latin.matchAll(/stream\r?\n/g)) {
    if (inflated >= PDF_TOTAL_BYTES) break;
    const dictionary = latin.slice(Math.max(0, match.index - 400), match.index);
    if (!/\/FlateDecode/.test(dictionary.slice(dictionary.lastIndexOf('<<')))) continue;
    const start = match.index + match[0].length;
    const end = latin.indexOf('endstream', start);
    if (end < 0) break;
    try {
      const output = zlib.inflateSync(raw.subarray(start, end), { maxOutputLength: PDF_STREAM_BYTES, finishFlush: zlib.constants.Z_SYNC_FLUSH });
      inflated += output.length;
      urisIn(output.toString('latin1'), found);
    } catch { /* not a stream we can read; its links stay unread */ }
  }
  return { links: [...found].map(link => link.trim()).filter(link => /^https?:\/\//i.test(link)), encrypted: false };
}

/**
 * True when a file's text is about this RFP: it names the RFP number, or at least two of
 * the title's distinctive words. A city's bid board lists every open bid's files, and one
 * for another RFP must not stand in for this one's solicitation.
 */
export function postingRowMatchesRfp(text, { number = '', title = '' } = {}) {
  const compact = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const id = compact(number).replace(/^(?:rfp|rfq|ifb|itb|no)+/, '');
  if (id.length >= 3 && compact(text).includes(id)) return true;
  const wanted = distinctive(title);
  if (!wanted.size) return false;
  const present = new Set(words(text));
  const hits = [...wanted].filter(word => present.has(word)).length;
  return hits >= Math.min(2, wanted.size);
}

const EXPECTS_ZIP = new Set(['.docx', '.xlsx', '.xlsm']);

/**
 * Fetches the RFP's documents from its agency posting, anonymously. `highergovRows` are the
 * manifest rows HigherGov gave (their PDFs are read for a portal summary's links and their
 * names and hashes are not fetched twice). Returns { outcome, rows }: `rows` are manifest
 * rows for the files saved, marked `source: 'posting'` and `match_required`, for
 * extractManifestEvidence to read, classify and check against this RFP with
 * postingRowMatchesRfp.
 */
function postingOutcome(postingUrl) {
  const portal = portalFor(postingUrl);
  return { host: hostOf(postingUrl), portal: portal.name, access: portal.access, outcome: '', reason: '', pageStatus: null, listed: 0, downloaded: 0,
    skipped: { offDomain: 0, duplicate: 0, unsupported: 0, overCap: 0, unmatched: 0 }, seconds: 0 };
}

/**
 * The outcome decided without any request: no usable posting link, or a site the job
 * never requests (rfp-portals.mjs). Null when the site would be tried.
 */
export function knownPostingOutcome(postingUrl) {
  const outcome = postingOutcome(postingUrl);
  const portal = portalFor(postingUrl);
  let url = null;
  try { url = new URL(String(postingUrl || '')); } catch { /* no link */ }
  if (!url || !['http:', 'https:'].includes(url.protocol) || /(^|\.)highergov\.com$/i.test(url.hostname)) {
    return { ...outcome, outcome: 'no-posting-url', reason: 'The listing has no agency posting link.' };
  }
  if (portal.access === 'not-a-posting') return { ...outcome, outcome: 'not-a-posting', reason: `The documents ${PORTAL_ACCESS_TEXT['not-a-posting']()}.` };
  if (!portal.fetch) {
    const text = PORTAL_ACCESS_TEXT[portal.access];
    return { ...outcome, outcome: 'skipped-known-portal', reason: text ? `The documents ${text(portal.name)}.` : `${portal.name} is not read automatically.` };
  }
  return null;
}

/** The outcome while posting fetch is turned off: what the portal list knows, nothing more. */
export function postingWithoutFetch(postingUrl) {
  return knownPostingOutcome(postingUrl)
    || { ...postingOutcome(postingUrl), outcome: 'not-attempted', reason: 'Fetching from agency postings is turned off.' };
}

export async function fetchPostingDocuments({ postingUrl, highergovRows = [], resourcesDir, startIndex = 0, budget,
  fetchImpl = globalThis.fetch, dryRun = false, now = () => Date.now() }) {
  const known = knownPostingOutcome(postingUrl);
  if (known) return { outcome: known, rows: [] };
  const started = now();
  const portal = portalFor(postingUrl);
  const outcome = postingOutcome(postingUrl);
  const finish = (value, reason = '', rows = []) => {
    Object.assign(outcome, { outcome: value, reason, seconds: Math.round((now() - started) / 1000) });
    return { outcome, rows };
  };
  const url = new URL(String(postingUrl));
  const blocked = budget.blockedOutcome(url.hostname);
  if (blocked) return finish(blocked, 'The site turned away an earlier request this run.');
  if (!budget.startRfp()) return finish('budget-exhausted', "This run's time for agency sites was used up.");

  const site = siteOf(url.hostname);
  const documentHosts = new Set(portal.documentHosts);
  const allowed = candidate => siteOf(candidate.hostname) === site || documentHosts.has(candidate.hostname.toLowerCase());
  const context = { fetchImpl, budget, allowed };
  if (!robotsAllows(await robotsFor(url, context), url.pathname)) return finish('robots-disallowed', "The site's robots.txt asks automated clients not to read this page.");

  const page = await politeGet(url, { ...context, accept: 'text/html,application/xhtml+xml,*/*;q=0.8' });
  outcome.pageStatus = page.status ?? null;
  if (page.loginRedirect) return finish('login-required', 'The posting redirected to a sign-in page.');
  if (page.offSite) return finish('posting-unavailable', 'The posting redirected to another site.');
  if (page.error) return finish('posting-unavailable', `The posting did not answer (${page.error}).`);
  if (page.overCap) return finish('posting-unavailable', 'The posting page was too large to read.');
  const signature = detectSignature(page.buffer);
  const disposition = dispositionName(page.headers);
  const isFile = ['pdf', 'zip'].includes(signature) || Boolean(disposition);
  const html = isFile ? '' : page.buffer.toString('utf8');
  const status = classifyPostingPage({ status: page.status, headers: page.headers, html });
  if (status) {
    if (['rate-limited', 'bot-check'].includes(status)) budget.block(url.hostname, status);
    return finish(status, { 'login-required': 'The posting needs a sign-in.', 'bot-check': 'The site challenged the request; it is not worked around.',
      'posting-gone': 'The posting is gone.', 'rate-limited': 'The site asked us to slow down.', 'posting-unavailable': `The posting answered HTTP ${page.status}.` }[status]);
  }

  // The links to try: the page's file links, the links inside HigherGov's summary PDFs, or
  // the posting itself when it is a file.
  const candidates = [];
  let harvest = { links: [], offDomain: 0, scriptLinks: 0 };
  if (isFile) {
    candidates.push({ name: disposition || fileNameOf(page.url), url: page.url, prefetched: page });
  } else {
    harvest = harvestLinks(html, page.url, { allowed });
    candidates.push(...harvest.links);
  }
  outcome.skipped.offDomain += harvest.offDomain;
  const summaries = highergovRows.filter(row => row.downloaded && row.local_path && row.signature === 'pdf' && row.role !== 'solicitation').slice(0, MAX_SUMMARY_PDFS);
  for (const row of summaries) {
    const buffer = await fs.readFile(row.local_path).catch(() => null);
    if (!buffer || buffer.length > FILE_BYTES) continue;
    for (const link of extractPdfLinks(buffer).links) {
      let target;
      try { target = new URL(link); } catch { continue; }
      const onDocumentHost = documentHosts.has(target.hostname.toLowerCase());
      if (!onDocumentHost && !(allowed(target) && looksLikeFile(target))) { outcome.skipped.offDomain += 1; continue; }
      if (candidates.some(item => item.url.href === target.href)) continue;
      candidates.push({ name: fileNameOf(target), url: target });
    }
  }
  outcome.listed = candidates.length;
  if (!candidates.length) {
    const empty = classifyEmptyPage(html, harvest);
    return finish(empty, { 'login-required': 'The posting lists its documents only after a sign-in.', 'by-request': 'The agency sends the documents by email on request.',
      'js-only': 'The posting lists its documents only in a browser.', 'no-documents-listed': 'The posting lists no documents.' }[empty]);
  }

  // Solicitation first, forms dropped, nothing HigherGov already gave.
  const knownStems = new Set(highergovRows.map(documentStem).filter(Boolean));
  const knownHashes = new Set(highergovRows.map(row => row.hash).filter(Boolean));
  const chosen = candidates
    .map(item => ({ ...item, kind: classifyDocumentRecord({ file_name: item.name }) }))
    .filter(item => item.kind.role !== 'form')
    .filter(item => {
      const duplicate = knownStems.has(documentStem({ source_file_name: item.name }));
      if (duplicate) outcome.skipped.duplicate += 1;
      return !duplicate;
    })
    .sort((a, b) => b.kind.priority - a.kind.priority);
  outcome.skipped.overCap += Math.max(0, chosen.length - MAX_FILES);

  const rows = [];
  let total = 0, loginPages = 0;
  const referer = `${url.origin}/`;
  for (const item of chosen.slice(0, MAX_FILES)) {
    const answer = item.prefetched || await politeGet(item.url, { ...context, referer, maxBytes: FILE_BYTES, peekBytes: dryRun ? 1024 : 0 });
    const base = { source: 'posting', source_host: item.url.hostname, fetched_from: storedUrl(item.url), source_document_id: '',
      source_file_name: item.name, match_required: true, extracted: false, extracted_text_chars: 0, hash: '' };
    if (answer.loginRedirect) { loginPages += 1; continue; }
    if (answer.overCap) { outcome.skipped.overCap += 1; continue; }
    if (answer.error || answer.offSite || !(answer.status >= 200 && answer.status < 300)) {
      rows.push({ ...base, ...item.kind, required: false, local_file_name: '', local_path: '', content_type: '', size_bytes: 0,
        downloaded: false, document_status: 'failed', http_status: answer.status ?? null });
      continue;
    }
    const contentType = answer.headers?.get?.('content-type') || '';
    const signatureOf = detectSignature(answer.buffer);
    const record = { file_name: dispositionName(answer.headers) || item.name, content_type: contentType };
    const fileName = chooseLocalFileName({ record, index: startIndex + rows.length });
    const ext = path.extname(fileName).toLowerCase();
    // A sign-in or error page served where a document was expected. Web pages are never
    // harvested as documents, so any HTML answer here is one, whatever its name.
    if (signatureOf === 'html' || /text\/html/i.test(contentType)) { loginPages += 1; continue; }
    if (signatureOf === 'zip' && !EXPECTS_ZIP.has(ext)) { outcome.skipped.unsupported += 1; continue; }
    const hash = crypto.createHash('sha256').update(answer.buffer).digest('hex');
    if (!dryRun && knownHashes.has(hash)) { outcome.skipped.duplicate += 1; continue; }
    if (!dryRun && total + answer.buffer.length > RFP_BYTES) { outcome.skipped.overCap += 1; continue; }
    total += answer.buffer.length;
    const localPath = path.join(resourcesDir || '', fileName);
    if (!dryRun) {
      await fs.mkdir(path.dirname(localPath), { recursive: true });
      const temp = `${localPath}.tmp-${crypto.randomUUID()}`;
      await fs.writeFile(temp, answer.buffer);
      await fs.rename(temp, localPath);
    }
    knownHashes.add(hash);
    rows.push({ ...base, source_file_name: record.file_name, ...classifyDocumentRecord(record), local_file_name: fileName, local_path: dryRun ? '' : localPath,
      content_type: contentType, size_bytes: answer.buffer.length, downloaded: !dryRun, signature: signatureOf,
      document_status: dryRun ? 'probed' : 'downloaded', hash: dryRun ? '' : hash });
  }
  outcome.downloaded = rows.filter(row => row.downloaded || row.document_status === 'probed').length;
  if (outcome.downloaded) return finish('documents-found', '', rows);
  if (loginPages) return finish('login-required', 'The document links led to a sign-in page.', rows);
  return finish('no-documents-listed', 'The posting lists files, but none could be downloaded.', rows);
}
