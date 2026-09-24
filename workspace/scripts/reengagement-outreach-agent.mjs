import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const WORKSPACE = process.env.WORKSPACE_DIR || '/home/azureuser/.openclaw/workspace';
const DEFAULT_MODEL = process.env.REENGAGEMENT_AGENT_MODEL || 'openai/gpt-5.5';
const DEFAULT_THINKING = process.env.REENGAGEMENT_AGENT_THINKING || 'medium';
const DEFAULT_TIMEOUT_SECONDS = Number(process.env.REENGAGEMENT_AGENT_TIMEOUT_SECONDS || 180);
const DEFAULT_BATCH_SIZE = Number(process.env.REENGAGEMENT_AGENT_BATCH_SIZE || 3);

function trimText(value = '', maxChars = 800) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (!Number.isFinite(maxChars) || maxChars <= 0 || text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

function normalizeText(value = '') {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isBannedDraftText(text = '') {
  return /(hubspot|mailbox|drive|crm|lead|deal)\b/i.test(String(text || ''));
}

function normalizeNoteText(value = '') {
  return trimText(value, 500);
}

function ensureFollowUpQuestion(body = '', entry = {}) {
  const text = normalizeText(body);
  if (!text) return '';

  const question =
    entry.step === 'Closure'
      ? 'Would it be worth revisiting this later if the timing changes?'
      : entry.step === 'Reminder'
      ? 'Would you be open to a quick follow-up conversation next week?'
      : 'Would you be open to a short conversation to see if this is worth pursuing?';

  if (/^[?؟]/.test(text)) return text;
  return `${question} ${text}`.replace(/\s+/g, ' ').trim();
}

function safeJsonParse(text = '') {
  const raw = String(text || '').trim();
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {}

  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    try {
      return JSON.parse(raw.slice(start, end + 1));
    } catch {}
  }

  return null;
}

async function run(cmd, args, options = {}) {
  return await new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd: WORKSPACE,
      env: { ...process.env, ...(options.env || {}) },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let timeoutHandle = null;
    let timedOut = false;

    if (Number.isFinite(options.timeoutMs) && options.timeoutMs > 0) {
      timeoutHandle = setTimeout(() => {
        timedOut = true;
        try {
          child.kill('SIGTERM');
        } catch {}
        setTimeout(() => {
          try {
            child.kill('SIGKILL');
          } catch {}
        }, 5000);
      }, options.timeoutMs);
    }

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
      if (stdout.length > 20 * 1024 * 1024) stdout = stdout.slice(-20 * 1024 * 1024);
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
      if (stderr.length > 20 * 1024 * 1024) stderr = stderr.slice(-20 * 1024 * 1024);
    });

    child.on('error', (error) => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      resolve({
        stdout,
        stderr: stderr || error.message || '',
        exitCode: 1,
        timedOut,
      });
    });

    child.on('close', (exitCode) => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      resolve({
        stdout,
        stderr,
        exitCode: typeof exitCode === 'number' ? exitCode : 1,
        timedOut,
      });
    });

    child.stdin.end(options.input ?? '');
  });
}

function normalizeEntryForPrompt(entry, index) {
  return {
    index: Number.isFinite(index) ? index : 0,
    companyId: String(entry.companyId || entry.id || entry.company?.id || ''),
    companyName: normalizeText(entry.companyName || entry.name || entry.company?.name || ''),
    contactName: normalizeText(entry.contactName || ''),
    contactEmail: normalizeText(entry.contactEmail || ''),
    mode: normalizeText(entry.mode || ''),
    step: normalizeText(entry.step || entry.stepName || ''),
    stepSummary: trimText(entry.stepSummary || entry.stepText || '', 320),
    hasEarlierCommunication: Boolean(entry.hasEarlierCommunication),
    currentStage: normalizeText(entry.currentStage || ''),
    companyDescription: trimText(entry.companyDescription || '', 280),
    latestAssignment: trimText(entry.latestAssignment || '', 220),
    hubspotContext: trimText(entry.hubspotContext || '', 260),
    mailboxContext: trimText(entry.mailboxContext || '', 260),
    driveContext: trimText(entry.driveContext || '', 260),
    seamgenContext: trimText(entry.seamgenContext || '', 260),
    outreachStyle: trimText(entry.outreachStyle || '', 240),
    signals: trimText(entry.signals || '', 260),
    publicSignals: trimText(entry.publicSignals || '', 260),
    additionalContext: trimText(entry.additionalContext || '', 280),
  };
}

function chunkEntries(entries = [], batchSize = DEFAULT_BATCH_SIZE) {
  const size = Number.isFinite(batchSize) && batchSize > 0 ? Math.floor(batchSize) : DEFAULT_BATCH_SIZE;
  if (!Array.isArray(entries) || entries.length <= size) {
    return [entries];
  }

  const batches = [];
  for (let i = 0; i < entries.length; i += size) {
    batches.push(entries.slice(i, i + size));
  }
  return batches;
}

export function buildReengagementOutreachPrompt({ flowName, mode, entries = [], runDate = '' }) {
  const normalizedEntries = entries.map((entry, index) => normalizeEntryForPrompt(entry, index));
  const instructions = [
    `You are writing customer-facing outreach email body text for Seamgen.`,
    `Flow: ${normalizeText(flowName) || 'reengagement'}.`,
    `Mode: ${normalizeText(mode) || 'unknown'}.`,
    `Run date: ${normalizeText(runDate) || 'unknown'}.`,
    '',
    'You must output valid JSON only, with this shape:',
    '{"drafts":[{"companyId":"string","body":"string","notes":"string optional"}]}',
    '',
    'Rules:',
    '- Write the email body only. Do not include greeting, signoff, subject, markdown, or code fences.',
    '- Write the email body in English only.',
    '- The text must be 1:1 customer-sendable.',
    '- Never mention HubSpot, mailbox, Drive, CRM, leads, deals, or any internal source labels.',
    '- Use the evidence order internally: HubSpot communication -> mailbox thread -> Drive context on earlier deals/SOWs -> Seamgen context and earlier outreach style -> generic signals.',
    '- If earlier communication exists, the body must clearly continue that thread rather than read like a first touch.',
    '- If the entry is a recent-customer flow, keep the tone like a practical follow-up to an active thread.',
    '- If the entry is an old-customer flow, keep the tone like a warm re-engagement that connects back to the prior project or relationship.',
    '- Start with one clear follow-up question so the next step is explicit.',
    '- Keep each body concise, concrete, and human.',
    '- Use the optional "notes" field for a short HubSpot write-back note that captures the strongest live signal and the reason chasing is still justified; do not use it as local state.',
    '- Include existing-lead follow-ups when the last outreach mail, last communication, or reply thread provides a clear follow-up trigger.',
    '- If no entry clearly qualifies, still write a short fallback customer-sendable email that says no strong new leads were found and what signal is being watched next.',
    '- At the very start of the email, use this exact format on separate lines: "Filter applied: ..." and "Companies scanned: ...". Make it clear what selection was used before the body starts.',
    '- Always include an explicit "Companies scanned: N" line in the summary, where N is the number of companies reviewed in that run.',
    '- Do not cross-contaminate companies. Treat each entry independently.',
    '- If an entry has insufficient context, still write the best possible customer-ready follow-up, but keep it grounded in the available signals.',
    '- For new leads, be creative about the outreach trigger: learn from earlier outreaches, compare similar companies, and use a reference-case angle when that makes the outreach more credible.',
    '',
    'Company entries:',
    JSON.stringify(normalizedEntries, null, 2),
  ];

  return instructions.join('\n');
}

async function runOpenClawAgent(promptPath, { sessionKey, model, thinking, timeoutSeconds }) {
  const result = await run(
    'openclaw',
    [
      'agent',
      '--json',
      '--session-key',
      sessionKey,
      '--model',
      model,
      '--thinking',
      thinking,
      '--message-file',
      promptPath,
    ],
    { timeoutMs: Number(timeoutSeconds) * 1000 },
  );

  if (result.exitCode !== 0) {
    throw new Error((result.stderr || result.stdout || `openclaw agent exited with ${result.exitCode}`).trim());
  }

  const parsed = safeJsonParse(result.stdout);
  const rawText =
    parsed?.result?.finalAssistantRawText ||
    parsed?.result?.finalAssistantVisibleText ||
    parsed?.result?.payloads?.[0]?.text ||
    '';
  const payload = safeJsonParse(rawText);
  const drafts = Array.isArray(payload?.drafts) ? payload.drafts : [];
  const byCompanyId = new Map();

  for (const draft of drafts) {
    const companyId = normalizeText(draft?.companyId || '');
    const body = normalizeText(draft?.body || '');
    const note = normalizeNoteText(draft?.notes || '');
    if (!companyId || !body) continue;
    if (isBannedDraftText(body)) continue;
    if (body.length < 40) continue;
    byCompanyId.set(companyId, { body, note });
  }

  return byCompanyId;
}

async function runPromptBatch({
  flowName,
  mode,
  entries,
  runDate,
  sessionKeySuffix,
  model,
  thinking,
  timeoutSeconds,
}) {
  const prompt = buildReengagementOutreachPrompt({ flowName, mode, entries, runDate });
  const promptPath = path.join(
    '/tmp',
    `reengagement-agent-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.txt`,
  );
  await fs.writeFile(promptPath, prompt, 'utf8');

  const sessionKey =
    `agent:reengagement:${normalizeText(mode || 'shared').toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'shared'}:${normalizeText(
      runDate || 'run',
    ).replace(/[^a-z0-9]+/gi, '-') || 'run'}` + (sessionKeySuffix ? `:${normalizeText(sessionKeySuffix).replace(/[^a-z0-9]+/gi, '-')}` : '');

  try {
    const attempts = [
      { model, thinking, timeoutSeconds },
      {
        model,
        thinking: 'low',
        timeoutSeconds: Math.max(60, Math.min(Number(timeoutSeconds) || DEFAULT_TIMEOUT_SECONDS, 120)),
      },
    ];

    let lastError = null;
    for (const attempt of attempts) {
      try {
        return await runOpenClawAgent(promptPath, {
          sessionKey,
          model: attempt.model,
          thinking: attempt.thinking,
          timeoutSeconds: attempt.timeoutSeconds,
        });
      } catch (error) {
        lastError = error;
      }
    }

    if (lastError) {
      throw lastError;
    }

    return new Map();
  } finally {
    await fs.unlink(promptPath).catch(() => {});
  }
}

export async function generateReengagementOutreachBodies({
  flowName,
  mode,
  entries = [],
  runDate = '',
  sessionKeySuffix = '',
  model = DEFAULT_MODEL,
  thinking = DEFAULT_THINKING,
  timeoutSeconds = DEFAULT_TIMEOUT_SECONDS,
}) {
  if (!entries.length || ['1', 'true', 'yes'].includes(String(process.env.REENGAGEMENT_AGENT_DISABLED || '').toLowerCase())) {
    return new Map();
  }

  const normalizedEntries = entries.map((entry, index) => normalizeEntryForPrompt(entry, index));
  const batches = chunkEntries(normalizedEntries, DEFAULT_BATCH_SIZE);
  const byCompanyId = new Map();

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
    const batch = batches[batchIndex];
    if (!Array.isArray(batch) || !batch.length) continue;

    try {
      const batchDrafts = await runPromptBatch({
        flowName,
        mode,
        entries: batch,
        runDate,
        sessionKeySuffix: `${sessionKeySuffix || 'batch'}-${batchIndex + 1}`,
        model,
        thinking,
        timeoutSeconds,
      });

      for (const [companyId, draft] of batchDrafts.entries()) {
        const entry = normalizedEntries.find((item) => item.companyId === companyId) || {};
        const normalizedBody = ensureFollowUpQuestion(draft?.body || '', entry);
        if (!companyId || !normalizedBody) continue;
        byCompanyId.set(companyId, normalizedBody);
      }
    } catch {
      continue;
    }
  }

  return byCompanyId;
}

export async function generateReengagementOutreachDrafts({
  flowName,
  mode,
  entries = [],
  runDate = '',
  sessionKeySuffix = '',
  model = DEFAULT_MODEL,
  thinking = DEFAULT_THINKING,
  timeoutSeconds = DEFAULT_TIMEOUT_SECONDS,
}) {
  if (!entries.length || ['1', 'true', 'yes'].includes(String(process.env.REENGAGEMENT_AGENT_DISABLED || '').toLowerCase())) {
    return new Map();
  }

  const normalizedEntries = entries.map((entry, index) => normalizeEntryForPrompt(entry, index));
  const batches = chunkEntries(normalizedEntries, DEFAULT_BATCH_SIZE);
  const byCompanyId = new Map();

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
    const batch = batches[batchIndex];
    if (!Array.isArray(batch) || !batch.length) continue;

    try {
      const batchDrafts = await runPromptBatch({
        flowName,
        mode,
        entries: batch,
        runDate,
        sessionKeySuffix: `${sessionKeySuffix || 'batch'}-${batchIndex + 1}`,
        model,
        thinking,
        timeoutSeconds,
      });

      for (const [companyId, draft] of batchDrafts.entries()) {
        const entry = normalizedEntries.find((item) => item.companyId === companyId) || {};
        const normalizedBody = ensureFollowUpQuestion(draft?.body || '', entry);
        const normalizedNote = normalizeNoteText(draft?.notes || draft?.note || '');
        if (!companyId || !normalizedBody) continue;
        byCompanyId.set(companyId, {
          body: normalizedBody,
          note: normalizedNote,
        });
      }
    } catch {
      continue;
    }
  }

  return byCompanyId;
}
