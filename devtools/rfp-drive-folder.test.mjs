import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdirFolderId, resetRfpFolderCache, resolveRfpFolderId } from '../workspace/scripts/weekly-rfp-pursue-decision.mjs';

const CHANDLER_TITLE = 'Request for Proposals ; City of Chandler Economic Development and Tourism Website Redesign, Support, and Maintenance ; ED7-918-5161';
const CHANDLER_SLUG = 'request-for-proposals-city-of-chandler-economic-development-';
const NEW_ID = '1IylsIqJxw6xHCIOwkUKbmmD5eCQs0un2';

// `gog drive search --plain` prints a header row, then one tab-separated row per file.
const listing = (rows) => ['ID\tNAME\tTYPE\tSIZE\tMODIFIED', ...rows.map(([id, name]) => `${id}\t${name}\tfolder\t-\t2026-11-06`)].join('\n');

// A fake gog that answers searches from `folders` and mkdir with `mkdir()`, recording calls.
function fakeGog({ folders = [], mkdir = () => `id\t${NEW_ID}\nname\t${CHANDLER_SLUG}\nlink\thttps://drive.google.com/drive/folders/${NEW_ID}` } = {}) {
  const calls = [];
  const gog = async (args) => {
    calls.push(args[3]);
    if (args[3] === 'search') return listing(folders);
    if (args[3] === 'mkdir') return mkdir();
    throw new Error(`unexpected gog ${args[3]}`);
  };
  return { gog, calls };
}

test('mkdirFolderId reads the id line of gog drive mkdir --plain', () => {
  assert.equal(mkdirFolderId(`id\t${NEW_ID}\nname\tx\nlink\thttps://drive.google.com/x`), NEW_ID);
  assert.equal(mkdirFolderId(''), '');
  assert.equal(mkdirFolderId('name\tx'), '');
  assert.equal(mkdirFolderId('id\tnot an id'), '');
});

test('a new folder uses the ID mkdir printed even when the re-list would miss it', async () => {
  // The November 6 Chandler case: the parent listing never shows the new folder.
  resetRfpFolderCache();
  const { gog, calls } = fakeGog({ folders: [['1rN9v3Bndhj3VTbCNAFcf9cm3Wh8wfS7K', 'website-redesign-hosting-and-maintenance']] });
  const id = await resolveRfpFolderId('City of Chandler', CHANDLER_TITLE, CHANDLER_SLUG, { gog });
  assert.equal(id, NEW_ID);
  assert.deepEqual(calls, ['search', 'mkdir']);
});

test('an existing folder is reused without mkdir', async () => {
  resetRfpFolderCache();
  const { gog, calls } = fakeGog({ folders: [[NEW_ID, CHANDLER_SLUG]] });
  assert.equal(await resolveRfpFolderId('City of Chandler', CHANDLER_TITLE, CHANDLER_SLUG, { gog }), NEW_ID);
  assert.deepEqual(calls, ['search']);
});

test('when mkdir fails, the re-list still finds a folder Drive made anyway', async () => {
  resetRfpFolderCache();
  let listed = 0;
  const calls = [];
  const gog = async (args) => {
    calls.push(args[3]);
    if (args[3] === 'mkdir') throw new Error('gog timed out');
    listed += 1;
    return listing(listed === 1 ? [] : [[NEW_ID, CHANDLER_SLUG]]);
  };
  assert.equal(await resolveRfpFolderId('City of Chandler', CHANDLER_TITLE, CHANDLER_SLUG, { gog }), NEW_ID);
  assert.deepEqual(calls, ['search', 'mkdir', 'search']);
});

test('no folder ID anywhere returns empty, so the run skips the upload', async () => {
  resetRfpFolderCache();
  const { gog } = fakeGog({ mkdir: () => 'name\tsomething' });
  assert.equal(await resolveRfpFolderId('City of Chandler', CHANDLER_TITLE, CHANDLER_SLUG, { gog }), '');
});
