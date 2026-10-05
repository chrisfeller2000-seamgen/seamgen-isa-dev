import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { pathToFileURL } from 'node:url';
import { companySources, recordedJudgment } from './fixtures/rfp-recorded-judgments.mjs';

const weeklyFunctions = ['normalizeText', 'cleanName', 'formatIsoDate', 'parseIsoDate', 'formatUtcDate', 'daysBetween', 'recordField', 'recordString', 'getHigherGovPrefilter', 'deadlineLabelFromText', 'buildMetadataText', 'extractDeadlines', 'extractDeadlinesFromMetadata', 'extractContractValue', 'evaluateQualificationGates', 'analyzeFit', 'assessSolutionLandscape', 'verifyCapabilities', 'scoreCandidateFromText'];
const secondaryFunctions = ['normalize', 'detectAgencyType', 'detectCompliance', 'detectAiAngle', 'detectTechAlignment', 'detectDealSize', 'detectCaseStudyMatch', 'detectCompetitivePosition', 'detectGates', 'buildScore'];
const documentFunctions = ['normalizeText', 'classifyDocumentRecord', 'evaluateDocumentCompleteness'];

// The weekly module executes main() on import. Select only its named calculation
// functions instead: never import that entrypoint or execute its top-level code.
// This adapter is for trusted ISA source, not a security boundary for arbitrary code.
export function extractCalculationFunction(source, name) {
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(name)) throw new Error('Invalid calculation function name.');
  const header = new RegExp(`^(?:export )?(?:async )?function ${name}\\(`, 'gm');
  const matches = [...source.matchAll(header)];
  if (matches.length !== 1) throw new Error(`Expected one ${name} calculation function; found ${matches.length}. Review the adapter after source drift.`);
  const start = matches[0].index;
  const closing = /^\}/gm;
  closing.lastIndex = start;
  const end = closing.exec(source);
  if (!end) throw new Error(`No column-zero closing brace for ${name}. Review the adapter.`);
  const code = source.slice(start, end.index + 1).replace(/^export /, '');
  // Compile before running; a formatting change must fail, never silently use a
  // rewritten approximation of a business calculation.
  new vm.Script(`(${code})`);
  return code;
}

function contextFor(code, date, bindings = {}) {
  const context = vm.createContext({ ...bindings }, { codeGeneration: { strings: false, wasm: false } });
  vm.runInContext(`const NativeDate = Date; Date = class extends NativeDate { constructor(...args) { super(...(args.length ? args : [${JSON.stringify(`${date}T12:00:00Z`)}])); } static now() { return NativeDate.parse(${JSON.stringify(`${date}T12:00:00Z`)}); } };`, context, { timeout: 1000 });
  vm.runInContext(code, context, { timeout: 1000 });
  return context;
}

function invoke(context, expression, input) {
  context.alignmentInputJson = JSON.stringify(input);
  try {
    return JSON.parse(vm.runInContext(`JSON.stringify((() => { const input = JSON.parse(alignmentInputJson); return ${expression}; })())`, context, { timeout: 1000 }));
  } finally {
    delete context.alignmentInputJson;
  }
}

function normalizeWeekly(value) {
  if (value.gate) return { ...value, gates: value.gate, categoryCount: Object.keys(value.categories).length, failedGate: value.gateReasons?.find(item => item.pass === false) || null, deadlines: value.timeline };
  return {
    total: value.score, gates: Object.fromEntries(value.gateCheck.results.map(r => [r.gate.replace('Gate ', 'gate'), r.pass])),
    gateReasons: value.gateCheck.results, categories: value.categories ?? null,
    categoryCount: value.categories ? Object.keys(value.categories).length : 0,
    failedGate: value.gateCheck.failed, deadlines: value.deadlines,
  };
}

export async function createAlignmentAdapter(workspace, contract) {
  const sources = [];
  async function read(file) {
    const absolute = path.resolve(workspace, 'scripts', file);
    const stat = await fs.lstat(absolute);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1_000_000) throw new Error(`Unexpected source file: ${file}`);
    const text = await fs.readFile(absolute, 'utf8');
    sources.push({ file: `scripts/${file}`, sha256: crypto.createHash('sha256').update(text).digest('hex') });
    return text;
  }
  const [weekly, secondary, documents, deadline] = await Promise.all(['weekly-rfp-pursue-decision.mjs', 'secondary-fulltext-score.mjs', 'highergov-document-flow.mjs', 'rfp-deadline.mjs'].map(read));
  if (/^import\s/m.test(deadline) || !deadline.includes('export function assessDeadline(')) throw new Error('Deadline helper no longer has the reviewed pure-module shape.');
  const deadlineCode = deadline.replace(/^export (?=function )/gm, '');
  const shared = weekly.includes('export function buildWeeklyScore(') && secondary.includes('return judgment ? finalizeRfpScore(');
  let policy;
  if (shared) {
    await Promise.all(['rfp-scoring-policy.mjs', 'rfp-scoring-judgment.mjs'].map(read));
    policy = await import(pathToFileURL(path.resolve(workspace, 'scripts/rfp-scoring-policy.mjs')).href);
  }
  const bindings = policy ? { finalizeRfpScore: policy.finalizeRfpScore, unscoredRfp: policy.unscoredRfp } : {};
  const weeklyNames = shared ? [...weeklyFunctions.slice(0, 10), 'buildWeeklyScore'] : weeklyFunctions;
  const secondaryNames = shared ? ['buildScore'] : secondaryFunctions;
  const weeklyContext = contextFor('const FULL_QUALIFY_MIN_DAYS = 10; const FULL_QUALIFY_MIN_VALUE = 100000;\n' + weeklyNames.map(n => extractCalculationFunction(weekly, n)).join('\n'), contract.assessmentDate, bindings);
  const secondaryContext = contextFor(deadlineCode + '\n' + secondaryNames.map(n => extractCalculationFunction(secondary, n)).join('\n'), contract.assessmentDate, bindings);
  const documentContext = contextFor(documentFunctions.map(n => extractCalculationFunction(documents, n)).join('\n'), contract.assessmentDate);
  return {
    sources: sources.sort((a, b) => a.file.localeCompare(b.file)),
    evaluate(fixture) {
      if (fixture.kind === 'documents') {
        return invoke(documentContext, `(() => {
          const classifications = input.records.map(classifyDocumentRecord);
          const manifest = input.records.map((r, i) => ({ ...classifications[i], source_file_name: r.file_name, local_file_name: r.file_name, downloaded: r.downloaded !== false, extracted: Boolean(r.text), document_status: r.status || (r.text ? 'downloaded and extracted' : 'downloaded but unsupported') }));
          const completeness = evaluateDocumentCompleteness({ manifest, extractedTextByPath: new Map(input.records.map(r => [r.file_name, r.text])) });
          return { documents: { classifications, completeness } };
        })()`, fixture);
      }
      const intake = invoke(weeklyContext, 'getHigherGovPrefilter(input.record, { seamgenProfile: input.companyProfile })', fixture);
      if (fixture.kind === 'intake') return { intake };
      const input = { ...fixture, runDate: contract.assessmentDate };
      if (shared) {
        const assessment = { runDate: contract.assessmentDate, assessmentTimestamp: null, reportingTimeZone: 'UTC', overrideUsed: true };
        const preliminaryInput = { candidate: fixture.candidate, companySources, documents: [], assessment, phase: 'preliminary' };
        const documentInput = { candidate: fixture.candidate, companySources, documents: fixture.documents, assessment, phase: 'full-text' };
        const preliminary = invoke(weeklyContext, 'buildWeeklyScore(input.candidate, input.options)', { candidate: fixture.candidate, options: { ...preliminaryInput, judgment: recordedJudgment(preliminaryInput) } });
        const options = { ...documentInput, judgment: recordedJudgment(documentInput) };
        const document = fixture.documents.length ? invoke(weeklyContext, 'buildWeeklyScore(input.candidate, input.options)', { candidate: fixture.candidate, options }) : null;
        const scored = invoke(secondaryContext, 'buildScore(input.candidate, "", input.options)', { candidate: fixture.candidate, options });
        return { intake, weekly: { preliminary: normalizeWeekly(preliminary), document: document ? normalizeWeekly(document) : null }, secondary: { ...scored, gates: scored.gate } };
      }
      const preliminary = invoke(weeklyContext, 'scoreCandidateFromText({ candidate: input.candidate, text: buildMetadataText(input.candidate), runDate: input.runDate })', input);
      const document = fixture.documents.length ? invoke(weeklyContext, 'scoreCandidateFromText({ candidate: input.candidate, text: input.documents.map(d => d.text).join("\\n\\n"), runDate: input.runDate })', input) : null;
      const scored = invoke(secondaryContext, 'buildScore(input.candidate, input.documents.map(d => d.text).join("\\n\\n"), { documents: input.documents, assessment: createAssessmentContext({ runDate: input.runDate, reportingTimeZone: "UTC" }) })', input);
      return {
        intake, weekly: { preliminary: normalizeWeekly(preliminary), document: document ? normalizeWeekly(document) : null },
        secondary: { ...scored, gates: scored.gate },
      };
    },
  };
}
