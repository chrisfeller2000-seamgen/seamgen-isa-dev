// A temporary workspace for the RFP router tests: the real skills/rfp folder, RFPs in each
// phase, and a latest.json with one Strong Pursue that has no folder yet.
//   Phase 1: Carlsbad parks booking, Chandler permit portal, Laguna Hills city website
//   Phase 2: Laguna Beach website redesign
//   Phase 3: Yonkers senior services app
//   Phase 4: Boulder records portal
//   This week only: Pasco County records system (no folder)
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const RFPS = {
  'carlsbad-parks-recreation-booking-system': { dir: '1-pre-submission', title: 'Carlsbad parks and recreation booking system' },
  'chandler-permit-portal': { dir: '1-pre-submission', title: 'City of Chandler permit portal' },
  'laguna-hills-city-website': { dir: '1-pre-submission', title: 'Laguna Hills city website refresh' },
  'laguna-beach-website-redesign': { dir: '2-intermediate-stage', title: 'Website Redesign and Replacement Project for Laguna Beach', stage: true },
  'yonkers-senior-services-app': { dir: '3-building', title: 'Yonkers senior services mobile app', stage: true },
  'boulder-records-portal': { dir: '4-submitted', title: 'Boulder public records portal', stage: true },
};

export async function routeWorkspace() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'isa-route-'));
  await fs.cp(path.join(repoRoot, 'workspace', 'skills', 'rfp'), path.join(root, 'skills', 'rfp'), { recursive: true });
  for (const [slug, rfp] of Object.entries(RFPS)) {
    const dir = path.join(root, 'RFPs', rfp.dir, slug);
    await fs.mkdir(path.join(dir, 'resources'), { recursive: true });
    await fs.writeFile(path.join(dir, 'candidate.md'), `---\ntitle: "${rfp.title}"\n---\n`);
    if (rfp.stage) await fs.writeFile(path.join(dir, '_stage.json'), JSON.stringify({ title: rfp.title, history: [{ to: rfp.dir, by: 'Fixture', at: '2026-11-20T20:00:00.000Z' }] }));
  }
  // Laguna Beach has saved documents: an RFP, an addendum, the job's own manifest (not a document),
  // a file type the reader can't open, and a file name a shell would run if it were pasted into a
  // command. Every other RFP folder has an empty resources/.
  const laguna = path.join(root, 'RFPs', '2-intermediate-stage', 'laguna-beach-website-redesign', 'resources');
  await fs.writeFile(path.join(laguna, 'RFP 2026-31 Website Redesign.txt'), 'City of Laguna Beach RFP 2026-31\nQuestions due: December 11, 2026, 5:00 PM PT\nProposals due: January 14, 2027, 2:00 PM PT\n');
  await fs.writeFile(path.join(laguna, 'Addendum 1.html'), '<html><body><p>Addendum 1: the proposal due date moves to January 21, 2027.</p></body></html>');
  await fs.writeFile(path.join(laguna, '_document-manifest.json'), '{}');
  await fs.writeFile(path.join(laguna, 'Old pricing form.doc'), 'binary');
  await fs.writeFile(path.join(laguna, 'Exhibit $(touch pwned) `id`.txt'), 'Exhibit A: insurance requirements.\n');
  await fs.mkdir(path.join(root, 'reports', 'new-rfp-qualification'), { recursive: true });
  await fs.writeFile(path.join(root, 'reports', 'new-rfp-qualification', 'latest.json'), JSON.stringify({ week: '2026-W47', entries: [
    { slug: 'carlsbad-parks-recreation-booking-system', title: 'Carlsbad parks and recreation booking system', tier: 'worth' },
    { slug: 'pasco-county-records-system', title: 'Pasco County court records system', tier: 'strong' },
  ] }));
  return root;
}
