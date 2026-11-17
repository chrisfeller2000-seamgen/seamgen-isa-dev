import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { REFRESH_FILE, diffDocuments, freeName, plainDate, refreshMessage, runScheduled } from '../workspace/scripts/rfp-refresh.mjs';
import { mirrorLocalResourcesToDrive, resetRfpFolderCache } from '../workspace/scripts/weekly-rfp-pursue-decision.mjs';

const FOLDER = '1AbCdEfGhIjKlMnOpQrStUvWx';
const readJson = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const exists = target => fs.access(target).then(() => true, () => false);

// HigherGov as the November 17 check found it: versions newest first, one document list
// for the opportunity, document records with names and sizes but no IDs.
function fakeHigherGov({ versions, documents, files }) {
  const calls = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    calls.push(url.pathname);
    if (url.hostname === 'www.highergov.com' && url.pathname === '/api-external/opportunity/') {
      assert.equal(url.searchParams.get('opp_key'), 'opp-portal');
      return Response.json({ results: versions(), meta: { pagination: { pages: 1 } } });
    }
    if (url.hostname === 'www.highergov.com' && url.pathname === '/api-external/document/') {
      return Response.json({ results: documents(), meta: { pagination: { pages: 1 } } });
    }
    if (url.hostname === 'fixture.invalid') {
      const body = files()[decodeURIComponent(url.pathname.slice(1))];
      return body === undefined ? new Response('gone', { status: 404 }) : new Response(body, { headers: { 'content-type': 'application/pdf' } });
    }
    throw new Error(`unexpected request ${url}`);
  };
  return calls;
}
const version = (key, captured, due) => ({ version_key: key, opp_key: 'opp-portal', captured_date: captured, due_date: due,
  document_path: 'https://www.highergov.com/api-external/document/?related_key=portal-docs', path: 'https://www.highergov.com/x', source_path: '' });
const doc = (name, body) => ({ file_name: name, file_type: 'pdf', file_size: String(Buffer.byteLength(body)), posted_date: '2026-11-01',
  download_url: `https://fixture.invalid/${encodeURIComponent(name)}` });

// A fake gog: an empty Drive folder, recording uploads and anything else asked of it.
function fakeGog() {
  const calls = [];
  const gog = async (args) => {
    calls.push(args.slice(2, 4).join(' '));
    if (args[3] === 'search') return 'ID\tNAME\tTYPE\tSIZE\tMODIFIED';
    if (args[3] === 'upload') return '';
    if (args[3] === 'mkdir') return `id\t${FOLDER}\nname\tx`;
    throw new Error(`unexpected gog ${args.join(' ')}`);
  };
  return { gog, calls, uploads: () => calls.filter(call => call === 'drive upload').length };
}

// One RFP in Building, as the Friday job and a move leave it: two saved documents, a
// manifest, a candidate.md copy, and the Drive link in a Friday report.
const RFP_BODY = '%PDF solicitation';
const SOW_BODY = '%PDF scope of work';
async function buildingWorkspace({ fridayLink = true } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'isa-refresh-'));
  const dir = path.join(root, 'RFPs', '3-building', 'city-portal');
  await fs.mkdir(path.join(dir, 'resources'), { recursive: true });
  await fs.writeFile(path.join(dir, 'resources', '01-solicitation-RFP.pdf'), RFP_BODY);
  await fs.writeFile(path.join(dir, 'resources', '02-requirements-SOW.pdf'), SOW_BODY);
  await fs.writeFile(path.join(dir, 'resources', '_document-manifest.json'), JSON.stringify({
    candidate_slug: 'city-portal', candidate_title: 'City Permit Portal', version_key: 'v1', opp_key: 'opp-portal', documents: [
      { source: 'highergov', source_file_name: 'RFP.pdf', local_file_name: '01-solicitation-RFP.pdf', size_bytes: Buffer.byteLength(RFP_BODY), downloaded: true },
      { source: 'highergov', source_file_name: 'SOW.pdf', local_file_name: '02-requirements-SOW.pdf', size_bytes: Buffer.byteLength(SOW_BODY), downloaded: true },
    ] }));
  await fs.writeFile(path.join(dir, 'candidate.md'), '---\ntitle: City Permit Portal\nagency_name: City of Example\nopp_key: opp-portal\nversion_key: v1\ndue_date: 2026-11-02\n---\n');
  await fs.writeFile(path.join(dir, '_stage.json'), JSON.stringify({ slug: 'city-portal', title: 'City Permit Portal', stage: '3-building', history: [] }));
  if (fridayLink) {
    await fs.mkdir(path.join(root, 'reports', 'new-rfp-qualification'), { recursive: true });
    await fs.writeFile(path.join(root, 'reports', 'new-rfp-qualification', '2026-11-13.json'),
      JSON.stringify({ entries: [{ slug: 'city-portal', links: { documents: `https://drive.google.com/drive/folders/${FOLDER}` } }] }));
  }
  return { root, dir };
}

test('documents are matched by name and size, since HigherGov gives them no ID', () => {
  const known = [{ name: 'RFP.pdf', size: 100 }, { name: 'SOW.pdf', size: 50 }, { name: 'Map.pdf', size: 0 }];
  const records = [{ file_name: 'rfp.pdf', file_size: '100' }, { file_name: 'SOW.pdf', file_size: '60' }, { file_name: 'Addendum 1.pdf', file_size: '9' },
    { file_name: 'Map.pdf', file_size: '70' }];
  const diff = diffDocuments(known, records);
  assert.deepEqual(diff.added.map(r => r.file_name), ['Addendum 1.pdf']);
  assert.deepEqual(diff.updated.map(r => r.file_name), ['SOW.pdf']);
  assert.deepEqual(diff.removed, []);
  assert.deepEqual(diffDocuments(known, [records[0]]).removed, ['SOW.pdf', 'Map.pdf']);
  assert.equal(plainDate('2026-11-30'), 'November 30, 2026');
});

test('a new file name never replaces a saved one', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'isa-names-'));
  try {
    await fs.writeFile(path.join(dir, 'a.pdf'), 'x');
    assert.equal(await freeName(dir, 'b.pdf'), 'b.pdf');
    assert.equal(await freeName(dir, 'a.pdf'), 'a-2.pdf');
    assert.equal(await freeName(dir, 'a.pdf', { reissued: true, on: '2026-11-24' }), 'a-updated-2026-11-24.pdf');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('a quiet Tuesday sends nothing and touches no Drive folder', async () => {
  const { root } = await buildingWorkspace();
  resetRfpFolderCache();
  try {
    fakeHigherGov({ versions: () => [version('v1', '2026-10-05', '2026-11-02')], documents: () => [doc('RFP.pdf', RFP_BODY), doc('SOW.pdf', SOW_BODY)], files: () => ({}) });
    const { gog, calls } = fakeGog();
    const sent = [];
    const report = await runScheduled({ apiKey: 'k', workspace: root, gog, send: async text => sent.push(text), now: new Date('2026-11-24T15:00:00Z') });
    assert.deepEqual(sent, []);
    assert.deepEqual(calls, []);
    assert.equal(report.telegram.status, 'not sent: nothing changed');
    assert.equal(report.results.length, 1);
    assert.deepEqual(await readJson(path.join(root, 'reports', 'rfp-refresh', 'latest.json')), report);
    const state = await readJson(path.join(root, 'RFPs', '3-building', 'city-portal', REFRESH_FILE));
    assert.deepEqual([state.dueDate, state.documents.length, state.history.length], ['2026-11-02', 2, 0]);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('an amendment: the new files are saved beside the originals, uploaded to the Friday Drive folder, and posted once', async () => {
  const { root, dir } = await buildingWorkspace();
  resetRfpFolderCache();
  try {
    const NEW_SOW = '%PDF scope of work, revised with a new section';
    const ADDENDUM = '%PDF addendum one';
    fakeHigherGov({
      versions: () => [version('v2', '2026-11-20', '2026-11-30'), version('v1', '2026-10-05', '2026-11-02')],
      documents: () => [doc('RFP.pdf', RFP_BODY), doc('SOW.pdf', NEW_SOW), doc('Addendum 1.pdf', ADDENDUM)],
      files: () => ({ 'SOW.pdf': NEW_SOW, 'Addendum 1.pdf': ADDENDUM }),
    });
    const { gog, calls, uploads } = fakeGog();
    const sent = [];
    const report = await runScheduled({ apiKey: 'k', workspace: root, gog, send: async text => sent.push(text), now: new Date('2026-11-24T15:00:00Z') });

    const resources = path.join(dir, 'resources');
    const names = (await fs.readdir(resources)).sort();
    // The original scope of work is untouched; the re-issued one sits beside it.
    assert.equal(await fs.readFile(path.join(resources, '02-requirements-SOW.pdf'), 'utf8'), SOW_BODY);
    const reissued = names.find(name => name.includes('-updated-2026-11-24'));
    assert.ok(reissued, names.join(', '));
    assert.equal(await fs.readFile(path.join(resources, reissued), 'utf8'), NEW_SOW);
    assert.ok(names.some(name => name.includes('Addendum') && !name.includes('updated')), names.join(', '));
    assert.ok(!names.some(name => name.startsWith('.refresh')), 'the working folder is removed');
    const manifest = await readJson(path.join(resources, '_document-manifest.json'));
    assert.deepEqual(manifest.documents.filter(row => row.added_by_refresh).map(row => [row.source_file_name, Boolean(row.reissued)]),
      [['Addendum 1.pdf', false], ['SOW.pdf', true]]);
    assert.match(await fs.readFile(path.join(resources, '_document-manifest.md'), 'utf8'), /Addendum 1\.pdf/);

    // Drive: the Friday folder, found from the report without searching for a name; every
    // agency document it lacked, and never the manifest.
    assert.ok(!calls.includes('drive mkdir'));
    assert.equal(uploads(), 4);
    const result = report.results[0];
    assert.deepEqual(result.drive.uploaded.sort(), names.filter(name => !name.startsWith('_')).sort());
    assert.deepEqual([result.dueBefore, result.dueAfter, result.newVersion], ['2026-11-02', '2026-11-30', '2026-11-20']);

    assert.equal(sent.length, 1);
    assert.equal(sent[0], [
      'RFP updates from this morning\'s document check:', '',
      `• City Permit Portal (Building): the due date moved from November 2, 2026 to November 30, 2026; 1 new document (Addendum 1.pdf); re-issued: SOW.pdf. Documents: https://drive.google.com/drive/folders/${FOLDER}`,
      '', 'Ask me to go through any of these.',
    ].join('\n'));
    assert.equal(report.telegram.status, 'sent');
    const state = await readJson(path.join(dir, REFRESH_FILE));
    assert.deepEqual([state.driveFolder.id, state.dueDate, state.versionKey, state.history.length], [FOLDER, '2026-11-30', 'v2', 1]);

    // The next Tuesday nothing has changed, so nothing is downloaded, uploaded or sent.
    const quiet = fakeGog();
    const again = await runScheduled({ apiKey: 'k', workspace: root, gog: quiet.gog, send: async text => sent.push(text), now: new Date('2026-12-01T15:00:00Z') });
    assert.equal(sent.length, 1);
    assert.deepEqual(quiet.calls, []);
    assert.equal(again.telegram.status, 'not sent: nothing changed');
    assert.deepEqual((await fs.readdir(resources)).sort(), names);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('a document that can\'t be downloaded is reported once, and an RFP with no Drive folder gets one', async () => {
  const { root, dir } = await buildingWorkspace({ fridayLink: false });
  resetRfpFolderCache();
  try {
    fakeHigherGov({
      versions: () => [version('v1', '2026-10-05', '2026-11-02')],
      documents: () => [doc('RFP.pdf', RFP_BODY), doc('SOW.pdf', SOW_BODY), doc('Bid Form.pdf', 'x'), doc('Q&A.pdf', '%PDF answers')],
      files: () => ({ 'Q&A.pdf': '%PDF answers' }),
    });
    const { gog, calls } = fakeGog();
    const sent = [];
    const first = await runScheduled({ apiKey: 'k', workspace: root, gog, send: async text => sent.push(text), now: new Date('2026-11-24T15:00:00Z') });
    assert.deepEqual([first.results[0].added, first.results[0].notDownloaded], [['Q&A.pdf'], ['Bid Form.pdf']]);
    assert.ok(calls.includes('drive mkdir'), 'no Friday link, so the folder is made by name');
    assert.match(sent[0], /1 new document \(Q&A\.pdf\); listed but couldn't be downloaded: Bid Form\.pdf\. Documents: https:\/\/drive\.google\.com\/drive\/folders\/1AbC/);
    assert.equal((await readJson(path.join(dir, REFRESH_FILE))).driveFolder.id, FOLDER);

    const second = await runScheduled({ apiKey: 'k', workspace: root, gog, send: async text => sent.push(text), now: new Date('2026-12-01T15:00:00Z') });
    assert.equal(sent.length, 1, 'the same undownloadable file is not reported again');
    assert.deepEqual(second.results[0].notDownloaded, []);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('preview says what it would do and saves, uploads, records and sends nothing; an RFP with no HigherGov key is listed only when a message goes out', async () => {
  const { root, dir } = await buildingWorkspace();
  resetRfpFolderCache();
  try {
    const nokey = path.join(root, 'RFPs', '2-intermediate-stage', 'forwarded-rfp');
    await fs.mkdir(nokey, { recursive: true });
    await fs.writeFile(path.join(nokey, '_stage.json'), JSON.stringify({ slug: 'forwarded-rfp', title: 'Forwarded RFP', history: [] }));
    fakeHigherGov({ versions: () => [version('v1', '2026-10-05', '2026-11-09')], documents: () => [doc('RFP.pdf', RFP_BODY), doc('SOW.pdf', SOW_BODY), doc('Addendum 1.pdf', 'x')],
      files: () => { throw new Error('a preview must not download'); } });
    const { gog, calls } = fakeGog();
    const sent = [];
    const before = (await fs.readdir(path.join(dir, 'resources'))).sort();
    const report = await runScheduled({ apiKey: 'k', workspace: root, gog, send: async text => sent.push(text), preview: true, now: new Date('2026-11-24T15:00:00Z') });
    assert.deepEqual(calls, []);
    assert.deepEqual(sent, []);
    assert.equal(report.telegram.status, 'not sent: preview');
    assert.match(report.telegram.text, /City Permit Portal \(Building\): the due date moved from November 2, 2026 to November 9, 2026; 1 new document \(Addendum 1\.pdf\)\./);
    assert.match(report.telegram.text, /Couldn't check: Forwarded RFP\./);
    assert.match(report.results.find(r => r.slug === 'forwarded-rfp').error, /No HigherGov listing key/);
    assert.equal(await exists(path.join(dir, REFRESH_FILE)), false);
    assert.deepEqual((await fs.readdir(path.join(dir, 'resources'))).sort(), before);

    // On its own, an RFP that can't be checked sends nothing.
    assert.equal(refreshMessage([{ title: 'Forwarded RFP', added: [], updated: [], notDownloaded: [], error: 'x' }]), '');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('the Friday upload sends only agency documents, never the manifest', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'isa-mirror-'));
  try {
    for (const name of ['01-solicitation-RFP.pdf', '_document-manifest.json', '_document-manifest.md', '.refresh-1']) await fs.writeFile(path.join(dir, name), 'x');
    const { gog } = fakeGog();
    const mirror = await mirrorLocalResourcesToDrive(FOLDER, 'city-portal', { gog, resourcesDir: dir });
    assert.deepEqual([mirror.uploaded, mirror.failed], [['01-solicitation-RFP.pdf'], []]);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('--drive uploads saved documents Drive lacks, such as a file someone sent ISA, with nothing new on HigherGov', async () => {
  const { root, dir } = await buildingWorkspace();
  resetRfpFolderCache();
  try {
    await fs.writeFile(path.join(dir, 'resources', 'Addendum 2 from the portal.pdf'), '%PDF sent by Marianne');
    fakeHigherGov({ versions: () => [version('v1', '2026-10-05', '2026-11-02')], documents: () => [doc('RFP.pdf', RFP_BODY), doc('SOW.pdf', SOW_BODY)], files: () => ({}) });
    const { refreshRfp } = await import('../workspace/scripts/rfp-refresh.mjs');
    const stage = { dir: '3-building', label: 'Building' };
    const { gog, uploads } = fakeGog();
    const plain = await refreshRfp({ slug: 'city-portal', dir, stage, apiKey: 'k', workspace: root, gog });
    assert.equal(uploads(), 0, 'without --drive, nothing new means no upload');
    assert.equal(plain.drive, null);
    const pushed = await refreshRfp({ slug: 'city-portal', dir, stage, apiKey: 'k', workspace: root, gog, drive: true });
    assert.equal(uploads(), 3);
    assert.ok(pushed.drive.uploaded.includes('Addendum 2 from the portal.pdf'));
    assert.equal(pushed.drive.url, `https://drive.google.com/drive/folders/${FOLDER}`);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('a change recorded but not announced (Telegram down, or a crash before sending) is announced by the next run, once', async () => {
  const { root } = await buildingWorkspace();
  resetRfpFolderCache();
  try {
    const ADDENDUM = '%PDF addendum one';
    fakeHigherGov({ versions: () => [version('v2', '2026-11-20', '2026-11-30')], documents: () => [doc('RFP.pdf', RFP_BODY), doc('SOW.pdf', SOW_BODY), doc('Addendum 1.pdf', ADDENDUM)],
      files: () => ({ 'Addendum 1.pdf': ADDENDUM }) });
    const { gog } = fakeGog();
    const down = await runScheduled({ apiKey: 'k', workspace: root, gog, send: async () => { throw new Error('gateway refused'); }, now: new Date('2026-11-24T15:00:00Z') });
    assert.deepEqual([down.telegram.status, down.telegram.error], ['failed', 'gateway refused']);

    // The retry finds nothing new on HigherGov, but still sends what the first run recorded.
    const sent = [];
    const retry = await runScheduled({ apiKey: 'k', workspace: root, gog, send: async text => sent.push(text), now: new Date('2026-11-24T15:10:00Z') });
    assert.deepEqual(retry.results[0].added, []);
    assert.equal(sent.length, 1);
    assert.match(sent[0], /the due date moved from November 2, 2026 to November 30, 2026; 1 new document \(Addendum 1\.pdf\)\. Documents: https:\/\/drive\.google\.com/);

    const next = await runScheduled({ apiKey: 'k', workspace: root, gog, send: async text => sent.push(text), now: new Date('2026-12-01T15:00:00Z') });
    assert.equal(sent.length, 1);
    assert.equal(next.telegram.status, 'not sent: nothing changed');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('a Drive upload that failed is tried again by the next run', async () => {
  const { root, dir } = await buildingWorkspace();
  resetRfpFolderCache();
  try {
    const ADDENDUM = '%PDF addendum one';
    fakeHigherGov({ versions: () => [version('v1', '2026-10-05', '2026-11-02')], documents: () => [doc('RFP.pdf', RFP_BODY), doc('SOW.pdf', SOW_BODY), doc('Addendum 1.pdf', ADDENDUM)],
      files: () => ({ 'Addendum 1.pdf': ADDENDUM }) });
    let driveUp = false;
    const uploads = [];
    const gog = async (args) => {
      if (args[3] === 'search') return 'ID\tNAME\tTYPE\tSIZE\tMODIFIED';
      if (args[3] === 'upload') {
        if (!driveUp) throw new Error('Drive unavailable');
        uploads.push(path.basename(args[4]));
        return '';
      }
      throw new Error(`unexpected gog ${args[3]}`);
    };
    const sent = [];
    const first = await runScheduled({ apiKey: 'k', workspace: root, gog, send: async text => sent.push(text), now: new Date('2026-11-24T15:00:00Z') });
    assert.ok(first.results[0].drive.failed.length >= 1);
    assert.match(sent[0], /Some files didn't upload to Drive \(.*Addendum.*\); ask me for them\./);

    driveUp = true;
    const second = await runScheduled({ apiKey: 'k', workspace: root, gog, send: async text => sent.push(text), now: new Date('2026-11-24T15:10:00Z') });
    assert.ok(uploads.some(name => name.includes('Addendum')), uploads.join(', '));
    assert.deepEqual(second.results[0].drive.failed, []);
    assert.deepEqual((await readJson(path.join(dir, REFRESH_FILE))).history.at(-1).driveFailed, []);
    assert.equal(sent.length, 1, 'the retried upload is not announced again');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('a forwarded RFP whose listing the Friday run matched is checked by the key saved in _refresh.json', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'isa-refresh-matched-'));
  resetRfpFolderCache();
  try {
    const dir = path.join(root, 'RFPs', '3-building', 'forwarded-portal');
    await fs.mkdir(path.join(dir, 'resources'), { recursive: true });
    await fs.writeFile(path.join(dir, 'resources', 'RFP.pdf'), RFP_BODY);
    await fs.writeFile(path.join(dir, '_stage.json'), JSON.stringify({ slug: 'forwarded-portal', title: 'Forwarded Portal', agency: 'City of Example', history: [] }));
    // What adoptHigherGovKeys() writes after a match: the key, and the files already saved.
    await fs.writeFile(path.join(dir, REFRESH_FILE), JSON.stringify({ version: 1, slug: 'forwarded-portal', oppKey: 'opp-portal', versionKey: 'v1',
      dueDate: '2026-11-02', documents: [{ name: 'RFP.pdf', size: Buffer.byteLength(RFP_BODY), localFile: 'RFP.pdf' }], history: [],
      matched: { rule: 'number' } }));
    const SOW = '%PDF scope from HigherGov';
    fakeHigherGov({ versions: () => [version('v1', '2026-10-05', '2026-11-02')], documents: () => [doc('RFP.pdf', RFP_BODY), doc('SOW.pdf', SOW)],
      files: () => ({ 'SOW.pdf': SOW }) });
    const { gog } = fakeGog();
    const sent = [];
    const report = await runScheduled({ apiKey: 'k', workspace: root, gog, send: async text => sent.push(text), now: new Date('2026-11-24T15:00:00Z') });
    assert.equal(report.results[0].error, null);
    assert.deepEqual(report.results[0].added, ['SOW.pdf'], 'only what the forwarded set lacked');
    assert.match(sent[0], /Forwarded Portal \(Building\): 1 new document \(SOW\.pdf\)\./);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
