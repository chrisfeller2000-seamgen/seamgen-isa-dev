// Is a scored RFP already a deal in HubSpot's RFP pipeline? Pure: the weekly job loads the
// deals and passes them in. A match is shown on the pick ("Already in HubSpot as ..."); it
// never hides the pick. On October 16 a loose word match against a commercial deal named
// "<university> - Website Design and Development" hid the week's only Strong Pursue.

// The pipeline the team uses for RFPs (daily-mail-hubspot-sync.mjs files RFP mail there too).
export const RFP_PIPELINE_ID = '2487569084';

// Words that say what kind of organization or work it is, not which one.
const GENERIC = new Set([
  'a', 'an', 'and', 'for', 'in', 'its', 'of', 'on', 'the', 'to', 'with',
  'agencies', 'agency', 'authority', 'board', 'city', 'college', 'commission', 'county', 'department', 'dept',
  'district', 'federal', 'government', 'office', 'public', 'school', 'schools', 'state', 'states', 'university',
  'bid', 'proposal', 'proposals', 'quote', 'request', 'rfa', 'rfi', 'rfp', 'rfq', 'solicitation', 'sow',
  'app', 'application', 'applications', 'apps', 'contract', 'custom', 'data', 'design', 'develop', 'development',
  'digital', 'implementation', 'integrated', 'integration', 'it', 'maintenance', 'management', 'modernization',
  'new', 'online', 'phase', 'platform', 'portal', 'program', 'project', 'redesign', 'replacement', 'service',
  'services', 'site', 'software', 'solution', 'solutions', 'support', 'system', 'systems', 'technology', 'tool',
  'tools', 'upgrade', 'web', 'website', 'websites',
]);

const words = text => String(text || '').replace(/&amp;/gi, '&').toLowerCase()
  .replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
const distinctive = text => new Set(words(text).filter(word => word.length > 1 && !GENERIC.has(word)));
// "Transportation Corridor Agencies" -> "tca"
const initials = text => words(text).filter(word => !['and', 'for', 'of', 'the'].includes(word)).map(word => word[0]).join('');

/**
 * The first RFP-pipeline deal naming the same agency and project, or null. A deal matches when
 * it shares at least two distinctive words with the RFP's agency, title and number, covering at
 * least half of the deal's own words, or names the agency by its acronym with no other word that
 * differs. A solicitation number in the deal counts when it matches, never against it.
 * `deals` are { name, pipeline } from HubSpot.
 */
export function findHubSpotDeal({ title = '', agency = '', number = '' } = {}, deals = []) {
  const rfp = distinctive(`${agency} ${title} ${number}`);
  const acronym = initials(agency);
  for (const deal of deals) {
    if (String(deal?.pipeline) !== RFP_PIPELINE_ID) continue;
    const name = [...distinctive(deal.name)];
    const named = name.filter(word => !/\d/.test(word));
    const shared = name.filter(word => rfp.has(word)).length;
    const byAcronym = acronym.length >= 3 && named.includes(acronym) && named.every(word => word === acronym || rfp.has(word));
    if ((shared >= 2 && shared * 2 >= named.length) || byAcronym) return deal;
  }
  return null;
}
