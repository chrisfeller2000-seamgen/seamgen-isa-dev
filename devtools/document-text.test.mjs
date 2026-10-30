import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { extractDocumentText } from '../workspace/scripts/document-text.mjs';

const TYPED_PAGE = 'Proposals are due no later than 2:00 P.M. on October 23, 2026.';
// The deadline line of a scanned RFQ exactly as OCR returned it on the VM,
// including the misread ordinal.
const OCR_PAGE = 'https://www.bidnetdirect.com/illinois/madisoncounty no later than 2:00 P.M., Friday, October 23"4 2026.';

// Stands in for pdftotext and ocrmypdf. `direct` is pdftotext on the original file,
// `afterOcr` is pdftotext on the file ocrmypdf wrote.
function pdfTools({ direct, afterOcr = '', ocr = { ok: true, stdout: '' }, source = 'scan.pdf' }) {
  const calls = [];
  const run = async (command, args) => {
    calls.push(command);
    if (command === 'ocrmypdf') return ocr;
    return args[0] === source ? direct : { ok: true, stdout: afterOcr };
  };
  return { run, calls };
}

test('a typed PDF is read from its text layer without OCR', async () => {
  const { run, calls } = pdfTools({ direct: { ok: true, stdout: `${TYPED_PAGE}\f${TYPED_PAGE}\f` } });
  const extraction = await extractDocumentText('scan.pdf', { run });
  assert.equal(extraction.status, 'extracted');
  assert.equal(extraction.method, 'text-layer');
  assert.equal(extraction.pages, 2);
  assert.equal(extraction.ocrPages, 0);
  assert.deepEqual(calls, ['pdftotext']);
});

test('a scanned PDF is read by OCR and marked as OCR text', async () => {
  const { run, calls } = pdfTools({ direct: { ok: true, stdout: '\f\f' }, afterOcr: `${OCR_PAGE}\f${OCR_PAGE}\f` });
  const extraction = await extractDocumentText('scan.pdf', { run });
  assert.equal(extraction.status, 'extracted');
  assert.equal(extraction.method, 'ocr');
  assert.equal(extraction.ocrPages, 2);
  assert.match(extraction.text, /October 23"4 2026/);
  assert.deepEqual(calls, ['pdftotext', 'ocrmypdf', 'pdftotext']);
});

test('a PDF with typed and scanned pages reports how many pages came from OCR', async () => {
  const { run } = pdfTools({ direct: { ok: true, stdout: `${TYPED_PAGE}\f\f` }, afterOcr: `${TYPED_PAGE}\f${OCR_PAGE}\f` });
  const extraction = await extractDocumentText('scan.pdf', { run });
  assert.equal(extraction.method, 'text-layer+ocr');
  assert.equal(extraction.pages, 2);
  assert.equal(extraction.ocrPages, 1);
});

test('a blank page in a typed PDF keeps the text-layer result', async () => {
  const { run } = pdfTools({ direct: { ok: true, stdout: `${TYPED_PAGE}\f\f` }, afterOcr: `${TYPED_PAGE}\f\f` });
  const extraction = await extractDocumentText('scan.pdf', { run });
  assert.equal(extraction.status, 'extracted');
  assert.equal(extraction.method, 'text-layer');
  assert.equal(extraction.ocrPages, 0);
  assert.equal(extraction.reason, '1 of 2 pages have no readable text.');
});

test('a scanned PDF without OCR installed is reported as needing OCR', async () => {
  const { run } = pdfTools({ direct: { ok: true, stdout: '\f' }, ocr: { ok: false, stdout: '', missing: true } });
  const extraction = await extractDocumentText('scan.pdf', { run });
  assert.equal(extraction.status, 'needs-ocr');
  assert.equal(extraction.text, '');
  assert.equal(extraction.method, '');
});

test('OCR failures and missing tools are told apart from an empty document', async () => {
  const timedOut = pdfTools({ direct: { ok: true, stdout: '\f' }, ocr: { ok: false, stdout: '', timedOut: true } });
  assert.equal((await extractDocumentText('scan.pdf', { run: timedOut.run })).status, 'ocr-failed');

  const unreadable = pdfTools({ direct: { ok: false, stdout: '' }, ocr: { ok: false, stdout: '' } });
  assert.equal((await extractDocumentText('scan.pdf', { run: unreadable.run })).status, 'failed');

  const noPdftotext = pdfTools({ direct: { ok: false, stdout: '', missing: true } });
  const missing = await extractDocumentText('scan.pdf', { run: noPdftotext.run });
  assert.equal(missing.status, 'tool-missing');
  assert.deepEqual(noPdftotext.calls, ['pdftotext']);

  const nothingFound = pdfTools({ direct: { ok: true, stdout: '\f' }, afterOcr: '\f' });
  assert.equal((await extractDocumentText('scan.pdf', { run: nothingFound.run })).status, 'empty');
});

test('reasons never repeat the file path', async () => {
  const secret = path.join('customer-folder', 'confidential-rfq.pdf');
  const { run } = pdfTools({ direct: { ok: true, stdout: '\f' }, ocr: { ok: false, stdout: '' }, source: secret });
  const extraction = await extractDocumentText(secret, { run });
  assert.doesNotMatch(extraction.reason, /customer-folder|confidential-rfq/);
});

test('HTML, plain text, and unsupported files', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'document-text-test-'));
  try {
    const html = path.join(dir, 'notice.html');
    await fs.writeFile(html, '<html><style>p{}</style><p>Bids &amp; proposals</p><script>x()</script></html>');
    const fromHtml = await extractDocumentText(html);
    assert.equal(fromHtml.text, 'Bids & proposals');
    assert.equal(fromHtml.method, 'html');

    const txt = path.join(dir, 'notes.txt');
    await fs.writeFile(txt, '  Scope of work  \n');
    assert.deepEqual(await extractDocumentText(txt), { text: 'Scope of work', method: 'plain', status: 'extracted', reason: '', pages: null, ocrPages: 0 });

    const empty = path.join(dir, 'empty.md');
    await fs.writeFile(empty, '\n');
    assert.equal((await extractDocumentText(empty)).status, 'empty');

    assert.equal((await extractDocumentText(path.join(dir, 'drawing.dwg'))).status, 'unsupported-type');
    assert.equal((await extractDocumentText(path.join(dir, 'missing.txt'))).status, 'failed');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('Word and Excel files report a missing python3 instead of an empty document', async () => {
  const run = async () => ({ ok: false, stdout: '', missing: true });
  assert.equal((await extractDocumentText('scope.docx', { run })).status, 'tool-missing');
  const ok = async () => ({ ok: true, stdout: 'Pricing sheet 1200\n' });
  const sheet = await extractDocumentText('pricing.xlsx', { run: ok });
  assert.equal(sheet.method, 'xlsx');
  assert.equal(sheet.text, 'Pricing sheet 1200');
  const matrix = await extractDocumentText('Functional Specifications Matrix.xlsm', { run: ok });
  assert.equal(matrix.status, 'extracted');
  assert.equal(matrix.method, 'xlsx');
});

const hasPython = spawnSync('python3', ['--version']).status === 0;

// Shaped like an SF City Partner event export: ISO-8859-15 declared but UTF-8 curly
// quotes written, inline <B>/<Font> cells, the event header repeated on every tab,
// and a hidden tab.
const header = '<Row><Cell><Data ss:Type="String">Event ID</Data></Cell><Cell><Data ss:Type="String">SFGOV-0000000001</Data></Cell></Row>';
const PEOPLESOFT_XML = `<?xml version="1.0" encoding="ISO-8859-15"?> <?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet" xmlns:x="urn:schemas-microsoft-com:office:excel"><!-- PLEASE READ TO OPEN THIS FILE -->
<Worksheet ss:Name="General Details"><Table>${header}
<Row><Cell><Data ss:Type="String">This Request for Proposals (“RFP”) seeks web design &amp;&#10;data services.</Data></Cell></Row>
</Table></Worksheet>
<Worksheet ss:Name="Line Details"><Table>${header}
<Row><Cell><ss:Data ss:Type="String" xmlns="http://www.w3.org/TR/REC-html40"><B>Description: </B><Font>2027 Portal RFP</Font></ss:Data></Cell><Cell><ss:Data ss:Type="String" xmlns="http://www.w3.org/TR/REC-html40"/></Cell></Row>
</Table></Worksheet>
<Worksheet ss:Name="Test"><Table><Row><Cell><Data ss:Type="String">Item ID:</Data></Cell></Row></Table>
<WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><Visible>SheetHidden</Visible></WorksheetOptions></Worksheet>
</Workbook>`;

test('an SF City Partner Excel XML event is read tab by tab', { skip: !hasPython && 'python3 is not installed' }, async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'document-text-test-'));
  try {
    const file = path.join(dir, 'Request_for_Proposals.xml');
    await fs.writeFile(file, PEOPLESOFT_XML, 'utf8');
    const extraction = await extractDocumentText(file);
    assert.equal(extraction.status, 'extracted');
    assert.equal(extraction.method, 'xml');
    assert.equal(extraction.text, [
      '[General Details]',
      'Event ID | SFGOV-0000000001',
      'This Request for Proposals (“RFP”) seeks web design & data services.',
      '[Line Details]',
      'Description: 2027 Portal RFP',
    ].join('\n'));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('other XML is read as plain text, skipping images and refusing a DOCTYPE', { skip: !hasPython && 'python3 is not installed' }, async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'document-text-test-'));
  try {
    const word = path.join(dir, 'scope.xml');
    await fs.writeFile(word, '<?xml version="1.0"?><w:wordDocument xmlns:w="http://schemas.microsoft.com/office/word/2003/wordml"><w:body><w:p><w:t>Scope of work</w:t></w:p><w:binData>iVBORw0KGgo=</w:binData></w:body></w:wordDocument>');
    const fromWord = await extractDocumentText(word);
    assert.equal(fromWord.text, 'Scope of work');

    const bomb = path.join(dir, 'bomb.xml');
    await fs.writeFile(bomb, '<?xml version="1.0"?><!DOCTYPE a [<!ENTITY x "xxxxxxxx">]><a>&x;&x;</a>');
    const refused = await extractDocumentText(bomb);
    assert.equal(refused.status, 'failed');
    assert.equal(refused.text, '');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
