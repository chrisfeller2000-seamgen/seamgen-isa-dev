// Agency posting sites the Friday RFP job meets, and how each one gives out documents.
// HigherGov mirrors agency postings; when it has no documents, they are usually on the
// agency's portal behind a vendor login. This list does two things: it names the portal
// in the report ("needs a free Public Purchase account"), and it stops the job from
// requesting sites it must not, or cannot, read anonymously (posting-documents.mjs).
//
// `access`:
//   public         documents download without an account
//   mixed          some documents download without an account; others need a login
//   free-account   a free vendor account is needed to download
//   paid           an account plus a fee or subscription is needed
//   bot-check      the site challenges automated requests; never worked around
//   js-only        the page lists documents only with JavaScript, which the job doesn't run
//   by-request     the agency sends the documents by email on request
//   api            documents come from an API the job doesn't call yet
//   not-a-posting  the link is a notice (a newspaper), not a posting with documents
// `fetch: false` means the job never requests the site. `verified` is the last date someone
// saw the behavior; null means it comes from the portal's own help pages only. Add a
// portal from the hosts that miss most in the weekly audit (`npm run rfp:posting-probe`).
export const PORTALS = [
  // Terms of use §4(I) ban robots and scrapers; documents cost $5 a bid beyond one free agency.
  { id: 'demandstar', name: 'DemandStar', hosts: ['demandstar.com'], access: 'paid', fetch: false, verified: null,
    note: 'Seamgen holds an account (reference-team-and-signature.md); downloads are still manual.' },
  // 401 to an anonymous request, November 3.
  { id: 'publicpurchase', name: 'Public Purchase', hosts: ['publicpurchase.com'], access: 'free-account', fetch: false, verified: '2026-11-03' },
  { id: 'rampla', name: 'RAMP LA', hosts: ['rampla.org'], access: 'free-account', fetch: false, verified: null,
    note: '"Only registered RAMP users will be able to view and download documents."' },
  { id: 'nyscr', name: 'NYS Contract Reporter', hosts: ['nyscr.ny.gov'], access: 'free-account', fetch: false, verified: null },
  { id: 'bonfire', name: 'Bonfire', hosts: ['bonfirehub.com'], access: 'free-account', fetch: false, verified: null },
  { id: 'opengov', name: 'OpenGov Procurement', hosts: ['procurement.opengov.com'], access: 'free-account', fetch: false, verified: null },
  { id: 'bidnet', name: 'BidNet Direct', hosts: ['bidnetdirect.com'], access: 'free-account', fetch: false, verified: null },
  { id: 'planetbids', name: 'PlanetBids', hosts: ['planetbids.com'], access: 'free-account', fetch: false, verified: null },
  // "Checking your browser" to an anonymous request, November 3.
  { id: 'emma', name: 'eMMA (Maryland)', hosts: ['emma.maryland.gov'], access: 'bot-check', fetch: false, verified: '2026-11-03' },
  // UVM's Oct 30 posting: "UVM will only accept requests for the specifications via email".
  { id: 'vermont', name: 'Vermont Business Registry', hosts: ['vermontbusinessregistry.com'], access: 'by-request', fetch: false, verified: '2026-11-03' },
  // Microsoft Power Pages; an anonymous request got "You don't have permissions", November 3.
  { id: 'ncevp', name: 'NC eVP', hosts: ['evp.nc.gov'], access: 'js-only', fetch: false, verified: '2026-11-03' },
  { id: 'citizentribune', name: 'Citizen Tribune (newspaper)', hosts: ['citizentribune.com'], access: 'not-a-posting', fetch: false, verified: '2026-10-30' },
  { id: 'sam', name: 'SAM.gov', hosts: ['sam.gov'], access: 'api', fetch: false, verified: null,
    note: "SAM.gov's attachments come from its public API, which needs a free API key." },
  // Some files download anonymously, others say "please login to view this document".
  { id: 'ionwave', name: 'IonWave', hosts: ['ionwave.net'], access: 'mixed', fetch: true, verified: '2026-11-03' },
  { id: 'commbuys', name: 'COMMBUYS', hosts: ['commbuys.com'], access: 'mixed', fetch: true, verified: null,
    note: 'Mass.gov: no registration needed to download; attachments are JavaScript links.' },
  // A Jaggaer event summary lists its "Buyer Attachments" as links to bids01.jaggaer.com's
  // PublicEventDownload, which served Texas State's whole package with no login (fetch skill v1.7).
  { id: 'jaggaer', name: 'Jaggaer', hosts: ['sciquest.com', 'jaggaer.com'], access: 'mixed', fetch: true,
    adapter: 'jaggaer-summary', documentHosts: ['bids01.jaggaer.com'], verified: '2026-09-09' },
  { id: 'oracle', name: 'Oracle supplier portal', hosts: ['oraclecloud.com'], access: 'mixed', fetch: true, verified: null },
].map(portal => ({ adapter: null, documentHosts: [], note: '', ...portal }));

export const ACCESS_VALUES = ['public', 'mixed', 'free-account', 'paid', 'bot-check', 'js-only', 'by-request', 'api', 'not-a-posting', 'unknown'];

const UNKNOWN = Object.freeze({ id: 'unknown', name: '', hosts: [], access: 'unknown', fetch: true, adapter: null, documentHosts: [], verified: null, note: '' });

export function hostOf(url) {
  try {
    return new URL(String(url)).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** The portal a posting URL is on: its host or any parent domain is listed. */
export function portalFor(url) {
  const host = hostOf(url);
  if (!host) return UNKNOWN;
  return PORTALS.find(portal => portal.hosts.some(listed => host === listed || host.endsWith(`.${listed}`))) || UNKNOWN;
}

/** True when downloading the documents needs a vendor account on the portal. */
export function loginPortal(portal) {
  return ['free-account', 'paid'].includes(portal?.access);
}

// The plain clause for each access model, finishing "the documents …".
export const PORTAL_ACCESS_TEXT = {
  'free-account': name => `need a free ${name || 'vendor'} account to download`,
  paid: name => `need a paid ${name || 'vendor'} account to download`,
  'bot-check': () => 'are on an agency site with a bot check, so someone has to download them',
  'js-only': () => "are on an agency site that lists them only in a browser",
  'by-request': () => 'are sent by the agency by email on request',
  api: name => `come from ${name || "the agency's"} API, which ISA doesn't read yet`,
  'not-a-posting': () => 'were never posted: the link is a public notice',
};
