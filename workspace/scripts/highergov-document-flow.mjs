import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const WORKSPACE = process.env.WORKSPACE_DIR || '/home/azureuser/.openclaw/workspace';
const PRE_SUBMISSION_ROOT = path.join(WORKSPACE, 'RFPs', '1-pre-submission');

function normalizeText(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function sanitizeRemoteFilename(value = '') {
  const cleaned = normalizeText(value)
    .replace(/[\/\\:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || 'document';
}

function safeExtension(fileName = '', contentType = '') {
  const ext = path.extname(String(fileName || '')).toLowerCase();
  if (['.pdf', '.docx', '.txt', '.md', '.html', '.htm', '.xlsx'].includes(ext)) {
    return ext;
  }
  const type = String(contentType || '').toLowerCase();
  if (type.includes('pdf')) return '.pdf';
  if (type.includes('wordprocessingml.document')) return '.docx';
  if (type.includes('spreadsheetml.sheet')) return '.xlsx';
  if (type.includes('html')) return '.html';
  if (type.startsWith('text/')) return '.txt';
  return ext || '';
}

function classifyDocumentRecord(record = {}) {
  const name = normalizeText(record.file_name || record.name || record.title || record.description || '').toLowerCase();
  const type = normalizeText(record.document_type || record.type || '').toLowerCase();
  const haystack = `${name} ${type}`;
  let role = 'other';
  let required = false;
  let priority = 0;

  if (/\b(addendum|amendment|qa|q&a|questions and answers|errata)\b/.test(haystack)) {
    role = 'addendum';
    required = true;
    priority = 80;
  }
  if (/\b(requirement|requirements|spec|specs|scope|statement of work|sow|workbook|mandatory attachment|mandatory form|exhibit|attachment)\b/.test(haystack)) {
    role = role === 'addendum' ? role : 'requirements';
    required = true;
    priority = Math.max(priority, 70);
  }
  if (/\b(evaluation|criteria|scoring|rubric)\b/.test(haystack)) {
    role = role === 'addendum' ? role : 'evaluation';
    required = true;
    priority = Math.max(priority, 60);
  }
  if (/\b(rfp|request for proposal|request for proposals|solicitation|bid invitation|invitation to bid|request for quotation|final)\b/.test(haystack)) {
    role = 'solicitation';
    required = true;
    priority = Math.max(priority, 100);
  }
  if (/mandatory/.test(haystack) && role === 'other') {
    role = 'mandatory_attachment';
    required = true;
    priority = 50;
  }

  return { role, required, priority };
}

async function ensureCandidateResourcesDir(slug, { stage = '1-pre-submission' } = {}) {
  const resourcesDir = path.join(WORKSPACE, 'RFPs', stage, slug, 'resources');
  await fs.mkdir(resourcesDir, { recursive: true });
  return resourcesDir;
}

const RETRIABLE_STATUSES = [429, 500, 502, 503, 504];

// GET a HigherGov API URL and parse its JSON, retrying HTTP 429/5xx and network failures.
// HigherGov's nginx answers 502 when its app server is slow, which saved-search queries can be.
async function fetchHigherGovJson(url, { label, fetchImpl = fetch, attempts = 3, retryDelayMs = 1500 } = {}) {
  for (let attempt = 1; ; attempt += 1) {
    let error;
    try {
      const response = await fetchImpl(url, { method: 'GET' });
      const text = await response.text();
      if (response.ok) {
        try {
          return JSON.parse(text);
        } catch {
          throw new Error(`HigherGov ${label} returned invalid JSON.`);
        }
      }
      error = new Error(`HigherGov ${label} failed (HTTP ${response.status})`);
      error.status = response.status;
    } catch (fetchError) {
      // fetch rejects with a TypeError on DNS, TLS, and connection failures.
      if (!(fetchError instanceof TypeError)) throw fetchError;
      error = new Error(`HigherGov ${label} failed (network: ${fetchError.cause?.code || fetchError.message})`);
    }
    const retriable = !error.status || RETRIABLE_STATUSES.includes(error.status);
    if (!retriable || attempt >= attempts) throw error;
    await new Promise((resolve) => setTimeout(resolve, retryDelayMs * attempt));
  }
}

function recordMatchesKeys(record, { versionKey, oppKey }) {
  const recordVersionKey = normalizeText(record?.version_key || '');
  const recordOppKey = normalizeText(record?.opp_key || '');
  return Boolean((versionKey && recordVersionKey === versionKey) || (oppKey && recordOppKey === oppKey));
}

async function lookupOpportunityRecord({
  apiKey,
  searchId,
  sourceType,
  capturedDate,
  versionKey = '',
  oppKey = '',
  pageSize = 25,
  maxPages = 50,
  fetchImpl = fetch,
  retryDelayMs,
}) {
  const targetVersionKey = normalizeText(versionKey);
  const targetOppKey = normalizeText(oppKey);
  if (!apiKey) throw new Error('HIGHERGOV_API_KEY is required.');
  if (!targetVersionKey && !targetOppKey) throw new Error('versionKey or oppKey is required.');
  const targets = { versionKey: targetVersionKey, oppKey: targetOppKey };
  const fetchOptions = { label: 'opportunity lookup', fetchImpl, retryDelayMs };

  // Direct key lookups answer in well under a second. Only a record whose key really
  // matches is accepted, so a filter the API ignored falls through to the scan below.
  for (const [param, value] of [['version_key', targetVersionKey], ['opp_key', targetOppKey]]) {
    if (!value) continue;
    const url = new URL('https://www.highergov.com/api-external/opportunity/');
    url.searchParams.set('api_key', apiKey);
    url.searchParams.set(param, value);
    url.searchParams.set('page_size', '10');
    const data = await fetchHigherGovJson(url, fetchOptions);
    const results = Array.isArray(data.results) ? data.results : [];
    const match = results.find((record) => recordMatchesKeys(record, targets));
    if (match) return { record: match, method: param, pageNumber: null, pages: null };
  }

  // Fallback: page through the saved search for the captured day. Slow (20-90 s a page
  // for the SAM half), so it only runs when the direct lookups found nothing.
  if (!searchId || !capturedDate) return { record: null, method: null, pageNumber: null, pages: null };
  for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
    const url = new URL('https://www.highergov.com/api-external/opportunity/');
    url.searchParams.set('api_key', apiKey);
    url.searchParams.set('search_id', searchId);
    url.searchParams.set('source_type', sourceType);
    url.searchParams.set('captured_date', capturedDate);
    url.searchParams.set('page_size', String(pageSize));
    url.searchParams.set('page_number', String(pageNumber));

    const data = await fetchHigherGovJson(url, fetchOptions);
    const results = Array.isArray(data.results) ? data.results : [];
    const match = results.find((record) => recordMatchesKeys(record, targets));
    if (match) {
      return { record: match, method: 'search', pageNumber, pages: Number.parseInt(data?.meta?.pagination?.pages || '0', 10) || pageNumber };
    }

    const pages = Number.parseInt(data?.meta?.pagination?.pages || '0', 10) || 0;
    if (pages && pageNumber >= pages) break;
    if (!results.length) break;
  }

  return { record: null, method: null, pageNumber: null, pages: null };
}

function documentListUrl(documentPath, apiKey, pageNumber) {
  let url;
  try {
    url = new URL(documentPath, 'https://www.highergov.com');
  } catch {
    throw new Error('HigherGov document_path is not a valid URL.');
  }
  if (url.protocol !== 'https:' || url.hostname !== 'www.highergov.com' || url.port ||
      url.username || url.password || url.pathname !== '/api-external/document/' ||
      !url.searchParams.get('related_key')) {
    throw new Error('HigherGov document_path is not an approved document endpoint.');
  }
  // HigherGov supplies a complete URL, not a related_key value. Refresh its key in memory.
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('page_size', '50');
  url.searchParams.set('page_number', String(pageNumber));
  return url;
}

async function listDocumentRecords({ apiKey, documentPath, fetchImpl = fetch, retryDelayMs }) {
  if (!apiKey) throw new Error('HIGHERGOV_API_KEY is required.');
  if (!documentPath) throw new Error('documentPath is required.');
  const records = [];
  for (let pageNumber = 1; pageNumber <= 100; pageNumber += 1) {
    const url = documentListUrl(documentPath, apiKey, pageNumber);
    const data = await fetchHigherGovJson(url, { label: 'document lookup', fetchImpl, retryDelayMs });
    if (!Array.isArray(data.results)) {
      throw new Error('HigherGov document lookup response has no results array.');
    }
    records.push(...data.results);
    const pages = Number.parseInt(data?.meta?.pagination?.pages, 10);
    if (!Number.isFinite(pages) || pageNumber >= pages) return records;
    if (pages > 100) throw new Error('HigherGov document lookup exceeds the 100-page safety limit.');
  }
  return records;
}

function detectSignature(buffer) {
  if (!buffer || buffer.length < 4) return 'unknown';
  if (buffer.slice(0, 4).toString('utf8') === '%PDF') return 'pdf';
  if (buffer.slice(0, 2).toString('utf8') === 'PK') return 'zip';
  const head = buffer.slice(0, 128).toString('utf8').trimStart();
  if (head.startsWith('<')) return 'html';
  return 'text-or-unknown';
}

function chooseLocalFileName({ record, index = 0 }) {
  const { role } = classifyDocumentRecord(record);
  const base = sanitizeRemoteFilename(record.file_name || record.name || record.title || `document-${index + 1}`);
  const ext = safeExtension(base, record.content_type || record.mime_type || '');
  const stem = ext && base.toLowerCase().endsWith(ext) ? base.slice(0, -ext.length) : base;
  const prefix = String(index + 1).padStart(2, '0');
  return sanitizeRemoteFilename(`${prefix}-${role}-${stem}`) + (ext || '');
}

async function hashFile(filePath) {
  const data = await fs.readFile(filePath);
  return crypto.createHash('sha256').update(data).digest('hex');
}

async function saveDocumentRecord({
  apiKey,
  record,
  resourcesDir,
  index = 0,
}) {
  const fileName = chooseLocalFileName({ record, index });
  const downloadUrl = normalizeText(record.download_url || '');
  const localPath = path.join(resourcesDir, fileName);
  const sourceDocumentId = normalizeText(record.id || record.document_id || record.document_key || '');
  const kind = classifyDocumentRecord(record);
  const baseRow = {
    source_document_id: sourceDocumentId,
    source_file_name: normalizeText(record.file_name || record.name || record.title || ''),
    local_file_name: fileName,
    local_path: localPath,
    content_type: normalizeText(record.content_type || record.mime_type || ''),
    size_bytes: Number.parseInt(record.file_size || record.size || '0', 10) || 0,
    role: kind.role,
    required: kind.required,
    priority: kind.priority,
    document_status: 'downloaded',
    extracted: false,
    extracted_text_chars: 0,
    hash: '',
  };

  if (!downloadUrl) {
    return { ...baseRow, document_status: 'portal-gated', downloaded: false };
  }

  const response = await fetch(downloadUrl, { method: 'GET' });
  if (!response.ok) {
    return { ...baseRow, document_status: 'failed', downloaded: false, http_status: response.status };
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const contentType = normalizeText(response.headers.get('content-type') || baseRow.content_type || '');
  const signature = detectSignature(buffer);
  const ext = safeExtension(fileName, contentType);
  const targetPath = ext && !fileName.toLowerCase().endsWith(ext) ? `${localPath}${ext}` : localPath;
  const finalPath = targetPath;
  await fs.mkdir(path.dirname(finalPath), { recursive: true });
  const tempPath = `${finalPath}.tmp-${crypto.randomUUID()}`;
  await fs.writeFile(tempPath, buffer);
  await fs.rename(tempPath, finalPath);
  const hash = await hashFile(finalPath);

  return {
    ...baseRow,
    local_path: finalPath,
    downloaded: true,
    document_status: signature === 'unknown' ? 'downloaded but unsupported' : 'downloaded',
    signature,
    content_type: contentType || baseRow.content_type,
    size_bytes: buffer.length,
    hash,
  };
}

function countBy(rows, key) {
  const tally = {};
  for (const row of rows || []) {
    const value = normalizeText(row?.[key] || '');
    if (!value) continue;
    tally[value] = (tally[value] || 0) + 1;
  }
  return tally;
}

function evaluateDocumentCompleteness({ manifest = [], extractedTextByPath = new Map() } = {}) {
  const rows = Array.isArray(manifest) ? manifest : [];
  const primary = rows.find((row) => row.role === 'solicitation' && row.downloaded && row.extracted);
  const missingRequired = rows.filter((row) => row.required && (!row.downloaded || !row.extracted || ['portal-gated', 'failed', 'downloaded but unsupported'].includes(row.document_status)));
  const hasAnyDocs = rows.some((row) => row.downloaded);
  const hasPortalBlock = rows.some((row) => row.document_status === 'portal-gated');
  const hasFailure = rows.some((row) => row.document_status === 'failed');
  const unsupported = rows.some((row) => row.document_status === 'downloaded but unsupported');

  if (!rows.length) {
    return { complete: false, status: 'document-list-empty', reasons: ['No document records were returned.'] };
  }
  if (!hasAnyDocs && hasPortalBlock) {
    return { complete: false, status: 'access-blocked', reasons: ['The returned documents were portal-gated.'] };
  }
  if (hasFailure && !hasAnyDocs) {
    return { complete: false, status: 'failed', reasons: ['Document download failed before any usable file was saved.'] };
  }
  if (!primary) {
    return { complete: false, status: unsupported ? 'partial-documents' : 'partial-documents', reasons: ['No extractable solicitation file was saved.'] };
  }
  if (missingRequired.length) {
    return {
      complete: false,
      status: 'partial-documents',
      reasons: missingRequired.map((row) => `Missing or unreadable required document: ${row.source_file_name || row.local_file_name}`),
    };
  }
  return { complete: true, status: 'full-text', reasons: [] };
}

function buildDocumentManifestMarkdown({ candidateTitle = '', candidateSlug = '', versionKey = '', oppKey = '', sourceUrl = '', records = [] } = {}) {
  const rows = Array.isArray(records) ? records : [];
  const lines = [
    `# Document manifest for ${candidateTitle || candidateSlug}`,
    '',
    `- candidate_slug: ${candidateSlug || 'unknown'}`,
    `- version_key: ${versionKey || 'unknown'}`,
    `- opp_key: ${oppKey || 'unknown'}`,
    `- highergov_page: ${sourceUrl || 'unknown'}`,
    `- generated_utc: ${new Date().toISOString()}`,
    '',
    '## Documents',
    '',
  ];
  for (const row of rows) {
    lines.push(`- ${row.local_file_name || row.source_file_name || 'document'} | ${row.role || 'other'} | ${row.document_status || 'unknown'} | ${row.size_bytes || 0} bytes`);
  }
  return `${lines.join('\n')}\n`;
}

async function writeDocumentManifestJson(resourcesDir, manifest) {
  const filePath = path.join(resourcesDir, '_document-manifest.json');
  await fs.writeFile(filePath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return filePath;
}

async function writeDocumentManifestMarkdown(resourcesDir, manifest) {
  const filePath = path.join(resourcesDir, '_document-manifest.md');
  const markdown = buildDocumentManifestMarkdown({
    candidateTitle: manifest.candidate_title,
    candidateSlug: manifest.candidate_slug,
    versionKey: manifest.version_key,
    oppKey: manifest.opp_key,
    sourceUrl: manifest.highergov_page,
    records: manifest.documents || [],
  });
  await fs.writeFile(filePath, markdown, 'utf8');
  return filePath;
}

export {
  buildDocumentManifestMarkdown,
  classifyDocumentRecord,
  countBy,
  ensureCandidateResourcesDir,
  evaluateDocumentCompleteness,
  hashFile,
  listDocumentRecords,
  lookupOpportunityRecord,
  saveDocumentRecord,
  sanitizeRemoteFilename,
  writeDocumentManifestJson,
  writeDocumentManifestMarkdown,
};
