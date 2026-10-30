#!/usr/bin/env node
// Reads the text of an RFP document for the RFP jobs and for ISA in chat.
// Usage: node scripts/document-text.mjs <file> [--json]
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const READABLE_EXTENSIONS = ['.pdf', '.docx', '.xlsx', '.xlsm', '.xml', '.html', '.htm', '.txt', '.md'];

// A page with fewer characters than this is treated as a scan. Typed pages, even
// near-empty ones such as "This page intentionally left blank", are above it.
const PAGE_TEXT_MIN_CHARS = 20;
const TOOL_TIMEOUT_MS = 120_000;
const OCR_TIMEOUT_MS = 600_000;

const DOCX_SCRIPT = `
import sys
from zipfile import ZipFile
from xml.etree import ElementTree as ET
with ZipFile(sys.argv[1]) as z:
    xml = z.read('word/document.xml')
root = ET.fromstring(xml)
texts = [node.text for node in root.iter() if node.tag.endswith('}t') and node.text]
print(' '.join(texts))
`;

const XLSX_SCRIPT = `
import sys
from zipfile import ZipFile
from xml.etree import ElementTree as ET
ns = {'a': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
with ZipFile(sys.argv[1]) as z:
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

// SF City Partner (PeopleSoft Strategic Sourcing) publishes an event's main RFP as
// an Excel 2003 XML Spreadsheet: one .xml file, one <Worksheet> per tab, and text in
// <Data> cells, some with inline <B>/<Font> markup. Any other XML, such as a Word 2003
// XML document, falls back to all of its text, minus base64 image data (<binData>).
const XML_SCRIPT = `
import re, sys
from xml.etree import ElementTree as ET
SS = '{urn:schemas-microsoft-com:office:spreadsheet}'
EXCEL = '{urn:schemas-microsoft-com:office:excel}'
with open(sys.argv[1], 'rb') as f:
    raw = f.read()
# ElementTree does not fetch external entities, but it does expand internal ones,
# so a DOCTYPE could be an entity-expansion bomb. Office XML never has one.
if re.search(rb'<!(DOCTYPE|ENTITY)', raw, re.I):
    sys.exit('DOCTYPE not allowed')
# PeopleSoft declares ISO-8859-15 but writes curly quotes that encoding cannot hold.
# Decode the bytes ourselves and drop the declaration so the parser cannot re-decode.
try:
    text = raw.decode('utf-8')
except UnicodeDecodeError:
    text = raw.decode('cp1252', errors='replace')
text = re.sub(r'^<\\?xml[^>]*\\?>', '', text.lstrip('\\ufeff \\t\\r\\n'))
root = ET.fromstring(text)
def clean(value):
    return ' '.join(value.split())
lines = []
if root.tag == SS + 'Workbook':
    # Every PeopleSoft tab repeats the same event header, so rows already printed
    # under an earlier tab are skipped. Hidden tabs hold form plumbing.
    earlier = set()
    for sheet in root.iter(SS + 'Worksheet'):
        visible = sheet.find('.//' + EXCEL + 'Visible')
        if visible is not None and visible.text in ('SheetHidden', 'SheetVeryHidden'):
            continue
        rows = []
        for row in sheet.iter(SS + 'Row'):
            cells = [clean(''.join(data.itertext())) for data in row.iter(SS + 'Data')]
            line = ' | '.join(cell for cell in cells if cell)
            if line and line not in earlier:
                rows.append(line)
        if rows:
            lines.append('[' + sheet.get(SS + 'Name', '') + ']')
            lines.extend(rows)
        earlier.update(rows)
else:
    for parent in list(root.iter()):
        for child in list(parent):
            if child.tag.endswith('}binData'):
                parent.remove(child)
    lines.append(clean(' '.join(root.itertext())))
# Node reads stdout as UTF-8; print() would use the locale's encoding instead.
sys.stdout.buffer.write('\\n'.join(lines).encode('utf-8'))
`;

function runTool(command, args, { timeoutMs = TOOL_TIMEOUT_MS } = {}) {
  return new Promise((resolve) => {
    execFile(command, args, { encoding: 'utf8', timeout: timeoutMs, maxBuffer: 256 * 1024 * 1024 }, (error, stdout) => {
      if (!error) resolve({ ok: true, stdout });
      else resolve({ ok: false, stdout: '', missing: error.code === 'ENOENT', timedOut: error.killed === true });
    });
  });
}

// `reason` reaches the RFP report and ISA's chat answers, so every reason here is
// fixed text: tool errors can carry file paths and customer document names.
function result({ text = '', method = '', status, reason = '', pages = null, ocrPages = 0 }) {
  const trimmed = String(text).trim();
  return { text: trimmed, method: trimmed ? method : '', status, reason, pages, ocrPages };
}

function extracted(text, method, extra = {}) {
  if (!String(text).trim()) return result({ status: 'empty', reason: 'The file contains no text.', ...extra });
  return result({ text, method, status: 'extracted', ...extra });
}

// pdftotext ends every page with a form feed.
function splitPages(output) {
  const pages = String(output).split('\f');
  if (pages.length > 1 && !pages.at(-1).trim()) pages.pop();
  return pages;
}

function hasText(page) {
  return page.replace(/\s+/g, '').length >= PAGE_TEXT_MIN_CHARS;
}

async function pdfText(filePath, run) {
  const direct = await run('pdftotext', [filePath, '-']);
  if (direct.missing) return result({ status: 'tool-missing', reason: 'pdftotext is not installed.' });
  const pages = direct.ok ? splitPages(direct.stdout) : [];
  const typedPages = pages.filter(hasText).length;
  if (direct.ok && typedPages === pages.length) {
    return extracted(direct.stdout, 'text-layer', { pages: pages.length });
  }

  // Some or all pages are scans. --skip-text leaves typed pages alone, so a mixed
  // RFP (typed body, scanned signature or insurance pages) keeps its exact text.
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'isa-document-text-'));
  try {
    const ocrPdf = path.join(workDir, 'ocr.pdf');
    const ocr = await run('ocrmypdf', ['--skip-text', '--quiet', '--output-type', 'pdf', '--optimize', '0', filePath, ocrPdf], { timeoutMs: OCR_TIMEOUT_MS });
    const after = ocr.ok ? await run('pdftotext', [ocrPdf, '-']) : { ok: false };
    if (after.ok) {
      const ocrPages = splitPages(after.stdout);
      const gained = ocrPages.filter((page, index) => hasText(page) && !(pages[index] && hasText(pages[index]))).length;
      if (gained > 0) {
        return extracted(after.stdout, typedPages > 0 ? 'text-layer+ocr' : 'ocr', { pages: ocrPages.length, ocrPages: gained });
      }
    }
    if (typedPages > 0) {
      const unread = pages.length - typedPages;
      // A blank page in a typed document lands here too, so this is not an error.
      return result({ text: direct.stdout, method: 'text-layer', status: 'extracted', pages: pages.length, reason: `${unread} of ${pages.length} pages have no readable text.` });
    }
    if (ocr.missing) return result({ status: 'needs-ocr', reason: 'Scanned PDF with no text, and OCR (ocrmypdf) is not installed.', pages: pages.length || null });
    if (ocr.timedOut) return result({ status: 'ocr-failed', reason: 'OCR timed out.', pages: pages.length || null });
    if (!ocr.ok) return result({ status: direct.ok ? 'ocr-failed' : 'failed', reason: direct.ok ? 'OCR could not process the PDF.' : 'The PDF could not be read.', pages: pages.length || null });
    return result({ status: 'empty', reason: 'OCR found no text in the PDF.', pages: pages.length || null });
  } finally {
    await fs.rm(workDir, { recursive: true, force: true });
  }
}

async function pythonText(script, filePath, method, run) {
  const output = await run('python3', ['-c', script, filePath]);
  if (output.missing) return result({ status: 'tool-missing', reason: 'python3 is not installed.' });
  if (!output.ok) return result({ status: 'failed', reason: 'The file could not be read.' });
  return extracted(output.stdout, method);
}

function stripHtml(raw) {
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
    .replace(/\s+/g, ' ');
}

// Returns { text, method, status, reason, pages, ocrPages }. `status` is
// 'extracted' only when `text` is non-empty. `method` says how the text was read;
// 'ocr' and 'text-layer+ocr' mean dates and amounts may contain recognition errors.
export async function extractDocumentText(filePath, { run = runTool } = {}) {
  const ext = path.extname(filePath).toLowerCase();
  if (!READABLE_EXTENSIONS.includes(ext)) return result({ status: 'unsupported-type', reason: 'This file type cannot be read.' });
  if (ext === '.pdf') return pdfText(filePath, run);
  if (ext === '.docx') return pythonText(DOCX_SCRIPT, filePath, 'docx', run);
  // .xlsm (macro-enabled) stores cells the same way as .xlsx; only cell values are read,
  // macros never run. Agencies use it for required forms such as requirements matrices.
  if (ext === '.xlsx' || ext === '.xlsm') return pythonText(XLSX_SCRIPT, filePath, 'xlsx', run);
  if (ext === '.xml') return pythonText(XML_SCRIPT, filePath, 'xml', run);
  let raw;
  try {
    raw = await fs.readFile(filePath, 'utf8');
  } catch {
    return result({ status: 'failed', reason: 'The file could not be read.' });
  }
  if (ext === '.html' || ext === '.htm') return extracted(stripHtml(raw), 'html');
  return extracted(raw, 'plain');
}

async function main() {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const filePath = args.find((arg) => arg !== '--json');
  if (!filePath) throw new Error('Usage: node scripts/document-text.mjs <file> [--json]');
  const extraction = await extractDocumentText(path.resolve(filePath));
  if (json) {
    console.log(JSON.stringify(extraction, null, 2));
  } else {
    if (extraction.text) console.log(extraction.text);
    const detail = [extraction.status, extraction.method, extraction.ocrPages ? `${extraction.ocrPages} pages by OCR` : '', extraction.reason].filter(Boolean).join(' | ');
    console.error(`[document-text] ${detail}`);
  }
  if (extraction.status !== 'extracted') process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
