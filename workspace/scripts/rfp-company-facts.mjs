// Seamgen's dated qualifications and references: the record the RFP scorer trusts for
// "do we hold this today?" and "can this client act as a reference?".
//
// The record is private company data. It lives outside Git, on the VM at
// resources/proposal-sources/company-facts.json, beside the case-study library. The
// case studies and Proposal - Assets.txt are historical proposal text: they show past
// delivery, but not that a registration is still active, a policy is in force, or a
// client has agreed to take a reference call. Each fact here names who confirmed it,
// when, and where the proof is kept, so a stale or unconfirmed claim can't pass a gate.
//
// Check a copy before uploading it: node devtools/company-facts.mjs <file>

export const COMPANY_FACTS_FILE = 'company-facts.json';
export const COMPANY_FACTS_SOURCE_ID = 'company-facts';
// A confirmation older than this no longer counts as current. Registrations, insurance
// and reference contacts change at least yearly, and most policies renew annually.
export const MAX_FACT_AGE_DAYS = 365;

const QUALIFICATION_TYPES = ['registration', 'certification', 'insurance'];
const QUALIFICATION_STATUS = ['held', 'not-held', 'unconfirmed'];
const REFERENCE_STATUS = ['available', 'unavailable', 'unconfirmed'];
const CLIENT_TYPES = ['government', 'nonprofit', 'commercial'];
const COMMON = ['id', 'type', 'status', 'verifiedBy', 'verifiedDate', 'source', 'confirmWith', 'notes'];
const FIELDS = {
  qualification: [...COMMON, 'name', 'holder', 'expires', 'coverage'],
  reference: [...COMMON, 'client', 'clientType', 'project', 'completed', 'value'],
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const validDate = value => DATE.test(value) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const daysBetween = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);

// Each fact becomes one paragraph, and the scorer splits sources on blank lines, so a
// line break inside a value would split one fact across two citable excerpts.
function text(fact, key, { required = true } = {}) {
  const value = fact[key];
  if (value === null || value === undefined) {
    if (required) throw new Error(`Company fact ${fact.id}: ${key} is required.`);
    return null;
  }
  if (typeof value !== 'string' || !value.trim() || /[\r\n]/.test(value)) {
    throw new Error(`Company fact ${fact.id}: ${key} must be one line of text.`);
  }
  return value.trim();
}

function validateFact(fact, index, ids) {
  if (!fact || typeof fact !== 'object' || Array.isArray(fact)) throw new Error(`Company fact #${index + 1} is not an object.`);
  if (typeof fact.id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(fact.id)) throw new Error(`Company fact #${index + 1}: id must be lowercase-kebab-case.`);
  if (ids.has(fact.id)) throw new Error(`Company fact ${fact.id} appears twice.`);
  ids.add(fact.id);
  const kind = fact.type === 'reference' ? 'reference' : QUALIFICATION_TYPES.includes(fact.type) ? 'qualification' : null;
  if (!kind) throw new Error(`Company fact ${fact.id}: type must be registration, certification, insurance or reference.`);
  const unknown = Object.keys(fact).filter(key => !FIELDS[kind].includes(key));
  if (unknown.length) throw new Error(`Company fact ${fact.id}: unknown field ${unknown.join(', ')}.`);
  if (!(kind === 'reference' ? REFERENCE_STATUS : QUALIFICATION_STATUS).includes(fact.status)) {
    throw new Error(`Company fact ${fact.id}: status must be ${(kind === 'reference' ? REFERENCE_STATUS : QUALIFICATION_STATUS).join(', ')}.`);
  }

  // Anything other than "unconfirmed" is a claim someone made, so it must say who,
  // when, and where the proof is. An unconfirmed fact is the to-do list.
  const confirmed = fact.status !== 'unconfirmed';
  const clean = { id: fact.id, type: fact.type, status: fact.status,
    verifiedBy: text(fact, 'verifiedBy', { required: confirmed }),
    verifiedDate: fact.verifiedDate ?? null,
    source: text(fact, 'source', { required: confirmed }),
    confirmWith: text(fact, 'confirmWith', { required: false }),
    notes: text(fact, 'notes', { required: false }) };
  if (confirmed || clean.verifiedDate !== null) {
    if (!validDate(clean.verifiedDate)) throw new Error(`Company fact ${fact.id}: verifiedDate must be a real YYYY-MM-DD date.`);
  }

  if (kind === 'qualification') {
    clean.name = text(fact, 'name');
    clean.holder = text(fact, 'holder');
    // Held qualifications must say whether they expire, so "no expiry" is a decision,
    // not a forgotten field.
    if (fact.status === 'held' && !Object.hasOwn(fact, 'expires')) throw new Error(`Company fact ${fact.id}: a held ${fact.type} needs expires (a date, or null when it does not expire).`);
    clean.expires = fact.expires ?? null;
    if (clean.expires !== null && !validDate(clean.expires)) throw new Error(`Company fact ${fact.id}: expires must be a real YYYY-MM-DD date or null.`);
    clean.coverage = text(fact, 'coverage', { required: fact.type === 'insurance' && fact.status === 'held' });
    if (clean.coverage && fact.type !== 'insurance') throw new Error(`Company fact ${fact.id}: coverage is only for insurance.`);
  } else {
    clean.client = text(fact, 'client');
    clean.project = text(fact, 'project');
    if (!CLIENT_TYPES.includes(fact.clientType)) throw new Error(`Company fact ${fact.id}: clientType must be government, nonprofit or commercial.`);
    clean.clientType = fact.clientType;
    clean.completed = fact.completed ?? null;
    if (clean.completed !== null && !/^(?:\d{4}(?:-(?:0[1-9]|1[0-2]))?|ongoing)$/.test(clean.completed)) {
      throw new Error(`Company fact ${fact.id}: completed must be YYYY, YYYY-MM or ongoing.`);
    }
    // RFPs ask for completed work "within N years"; an available reference must say when.
    if (fact.status === 'available' && clean.completed === null) throw new Error(`Company fact ${fact.id}: an available reference needs completed.`);
    clean.value = fact.value ?? null;
    if (clean.value !== null && (!Number.isFinite(clean.value) || clean.value < 0)) throw new Error(`Company fact ${fact.id}: value must be a dollar amount or null.`);
  }
  return clean;
}

export function parseCompanyFacts(json) {
  const data = typeof json === 'string' ? JSON.parse(json) : json;
  if (!data || data.version !== 1 || !Array.isArray(data.facts)) throw new Error('Company facts must be {"version": 1, "facts": [...]}.');
  const extra = Object.keys(data).filter(key => !['version', 'facts', 'comment'].includes(key));
  if (extra.length) throw new Error(`Company facts: unknown top-level field ${extra.join(', ')}.`);
  const ids = new Set();
  return data.facts.map((fact, i) => validateFact(fact, i, ids));
}

// Whether a fact can be relied on for an assessment made on assessmentDate (YYYY-MM-DD).
export function factCurrency(fact, assessmentDate) {
  if (!['held', 'available'].includes(fact.status)) return { current: false, reason: `${label(fact)} is ${fact.status}` };
  if (fact.verifiedDate > assessmentDate) return { current: false, reason: `${label(fact)} is dated after the assessment` };
  const age = daysBetween(fact.verifiedDate, assessmentDate);
  if (age > MAX_FACT_AGE_DAYS) return { current: false, reason: `${label(fact)} was last confirmed ${fact.verifiedDate}, over ${MAX_FACT_AGE_DAYS} days ago` };
  if (fact.expires && fact.expires < assessmentDate) return { current: false, reason: `${label(fact)} expired ${fact.expires}` };
  return { current: true, reason: null };
}

export const label = fact => fact.type === 'reference' ? `${fact.client} reference` : fact.name;

// The paragraph the model cites. "Company fact <id>" leads every paragraph so the
// policy can map a citation back to the structured fact it came from.
function renderFact(fact) {
  const verified = fact.status === 'unconfirmed' ? 'Not yet confirmed by a company owner.'
    : `Verified ${fact.verifiedDate} by ${fact.verifiedBy} (${fact.source}).`;
  const notes = fact.notes ? ` Note: ${fact.notes}` : '';
  if (fact.type === 'reference') {
    const value = fact.value === null ? 'not recorded' : `$${fact.value.toLocaleString('en-US')}`;
    return `Company fact ${fact.id} (reference): ${fact.client}, ${fact.clientType} client. Project: ${fact.project}. `
      + `Completed: ${fact.completed ?? 'not recorded'}. Contract value: ${value}. Reference status: ${fact.status}. ${verified}${notes}`;
  }
  const coverage = fact.coverage ? ` Coverage: ${fact.coverage}.` : '';
  return `Company fact ${fact.id} (${fact.type}): ${fact.name}. Holder: ${fact.holder}. Status: ${fact.status}.${coverage} `
    + `Expires: ${fact.expires ?? 'no expiry recorded'}. ${verified}${notes}`;
}

const PREAMBLE = `Seamgen company facts record. A registration, certification or insurance policy is held today only when its fact says Status: held, it was verified within ${MAX_FACT_AGE_DAYS} days of the assessment, and it has not expired. A client is an available reference only when its fact says Reference status: available under the same ${MAX_FACT_AGE_DAYS}-day rule. Anything unconfirmed, older, or not listed is unknown.`;

// A scoring source: the rendered text for the model plus the parsed facts for the policy.
export function companyFactsSource(json, file = COMPANY_FACTS_FILE) {
  const facts = parseCompanyFacts(json);
  return { id: COMPANY_FACTS_SOURCE_ID, kind: 'company', file, facts,
    text: [PREAMBLE, ...facts.map(renderFact)].join('\n\n') };
}

// The structured fact behind a cited excerpt from the company-facts source, or null.
export function factFromQuote(source, quote) {
  if (source?.id !== COMPANY_FACTS_SOURCE_ID || !Array.isArray(source.facts)) return null;
  const id = String(quote ?? '').trim().match(/^Company fact ([a-z0-9-]+) \(/)?.[1];
  return source.facts.find(fact => fact.id === id) || null;
}
