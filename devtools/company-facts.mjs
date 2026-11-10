// Checks a company-facts record and prints what the RFP scorer will treat as current,
// and what still needs confirming, grouped by the person to ask.
//
//   node devtools/company-facts.mjs <file> [--as-of YYYY-MM-DD]
//
// Run it on the private copy before uploading it to the VM. It reads the file only and
// prints fact names, never the proof locations or notes, so the output is safe to paste
// into a request to a teammate.
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { MAX_FACT_AGE_DAYS, factCurrency, label, parseCompanyFacts } from '../workspace/scripts/rfp-company-facts.mjs';

export function summarizeCompanyFacts(facts, asOf) {
  const current = [], blocked = [], toConfirm = new Map();
  for (const fact of facts) {
    const check = factCurrency(fact, asOf);
    if (check.current) current.push(label(fact));
    else if (['not-held', 'unavailable'].includes(fact.status)
        && (Date.parse(asOf) - Date.parse(fact.verifiedDate)) / 86400000 <= MAX_FACT_AGE_DAYS) {
      blocked.push(`${label(fact)} (${fact.status}, confirmed ${fact.verifiedDate} by ${fact.verifiedBy})`);
    } else {
      const who = fact.confirmWith || 'unassigned';
      toConfirm.set(who, [...(toConfirm.get(who) || []), check.reason]);
    }
  }
  const commercial = facts.filter(fact => fact.type === 'reference' && fact.clientType === 'commercial');
  const lines = [`Company facts as of ${asOf}: ${facts.length} facts, ${current.length} current.`, ''];
  lines.push('Current (the scorer can rely on these):', ...(current.length ? current.map(item => `  - ${item}`) : ['  (none)']), '');
  lines.push('Confirmed not held or unavailable:', ...(blocked.length ? blocked.map(item => `  - ${item}`) : ['  (none)']), '');
  lines.push(`To confirm (unconfirmed, expired, or older than ${MAX_FACT_AGE_DAYS} days):`);
  if (!toConfirm.size) lines.push('  (none)');
  for (const [who, items] of toConfirm) lines.push(`  ${who}:`, ...items.map(item => `    - ${item}`));
  if (!commercial.length) {
    lines.push('', 'No commercial references are recorded. RFPs asking for N recent projects of any kind need clients who have agreed to take a call.');
  }
  return lines.join('\n');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const asOfAt = args.indexOf('--as-of');
  const asOf = asOfAt >= 0 ? args.splice(asOfAt, 2)[1] : new Date().toISOString().slice(0, 10);
  if (args.length !== 1 || !/^\d{4}-\d{2}-\d{2}$/.test(asOf || '')) {
    console.error('Usage: node devtools/company-facts.mjs <file> [--as-of YYYY-MM-DD]');
    process.exit(2);
  }
  try {
    console.log(summarizeCompanyFacts(parseCompanyFacts(await fs.readFile(args[0], 'utf8')), asOf));
  } catch (error) {
    console.error(`Invalid company facts: ${error.message}`);
    process.exit(1);
  }
}
