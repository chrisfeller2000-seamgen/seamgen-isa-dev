export const OUTREACH_STAGE_CADENCE = new Map([
  ['Contact identified', { timing: '1 business day', note: 'Newly identified lead; keep the first touch prompt.' }],
  ['Qualified Lead', { timing: '1 business day', note: 'Qualified lead; send the first outreach as soon as possible.' }],
  ['First attempt', { timing: '10 days', note: 'If there is no response, wait ten days before the second attempt.' }],
  ['Second attempt', { timing: '15 days', note: 'If there is no response, wait fifteen days before closure.' }],
  ['Closure attemp', { timing: '9 months', note: 'If there is no response, revisit after about nine months.' }],
  ['Closure attempt', { timing: '9 months', note: 'If there is no response, revisit after about nine months.' }],
]);

export function describeOutreachStageCadence(stageName = '') {
  const stage = String(stageName || '').trim();
  const rule = OUTREACH_STAGE_CADENCE.get(stage) || null;
  if (!rule) {
    return {
      timing: 'Review manually',
      note: 'No default cadence is defined for this stage.',
      relevant: false,
      stage,
    };
  }

  return {
    ...rule,
    relevant: /^(qualified lead|first attempt|second attempt|closure attempt|closure attemp)$/i.test(stage),
    stage,
  };
}

function toText(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return String(value).trim();
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysBetween(start, end = new Date()) {
  if (!start) return null;
  return Math.floor((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
}

function hashText(text) {
  let hash = 0;
  const input = toText(text);
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function pickDeterministicValue(seed, min, max) {
  const lower = Number.isFinite(min) ? min : 0;
  const upper = Number.isFinite(max) ? max : lower;
  if (upper <= lower) return lower;
  const span = upper - lower + 1;
  return lower + (seed % span);
}

function getCommunicationContext(contact) {
  const lastSend = parseDate(contact?.properties?.hs_email_last_send_date);
  const lastReply = parseDate(contact?.properties?.hs_email_last_reply_date);
  const notesLastContacted = parseDate(contact?.properties?.notes_last_contacted);
  const notesLastUpdated = parseDate(contact?.properties?.notes_last_updated);
  const latestActivity = [lastSend, lastReply, notesLastContacted, notesLastUpdated]
    .filter(Boolean)
    .sort((a, b) => b.getTime() - a.getTime())[0] || null;

  let source = 'unknown';
  if (latestActivity) {
    if (latestActivity === lastReply) source = 'email reply';
    else if (latestActivity === lastSend) source = 'sent email';
    else if (latestActivity === notesLastContacted) source = 'HubSpot contact update';
    else if (latestActivity === notesLastUpdated) source = 'HubSpot record update';
  }

  return {
    lastSend,
    lastReply,
    notesLastContacted,
    notesLastUpdated,
    latestActivity,
    source,
    daysSinceLatestActivity: latestActivity ? daysBetween(latestActivity) : null,
  };
}

export function determineFollowUpStep(contact, options = {}) {
  const reminderWindowMinDays = Number.isFinite(options.reminderWindowMinDays) ? options.reminderWindowMinDays : 1;
  const reminderWindowMaxDays = Number.isFinite(options.reminderWindowMaxDays) ? options.reminderWindowMaxDays : 1;
  const closureWindowMinDays = Number.isFinite(options.closureWindowMinDays) ? options.closureWindowMinDays : 15;
  const closureWindowMaxDays = Number.isFinite(options.closureWindowMaxDays) ? options.closureWindowMaxDays : 15;

  if (!contact) {
    return {
      step: 'Introduction',
      crmAction: 'No tracked email conversation found yet.',
      summary: 'No tracked email conversation found yet.',
      replyReceived: false,
    };
  }

  const communication = getCommunicationContext(contact);
  const { lastSend, lastReply, latestActivity, source, daysSinceLatestActivity } = communication;
  const contactName = [toText(contact.properties?.firstname), toText(contact.properties?.lastname)].filter(Boolean).join(' ').trim();
  const namePrefix = contactName ? `${contactName}: ` : '';
  const seed = hashText([contactName, toText(contact?.properties?.email || contact?.properties?.work_email), toText(contact?.id)].join('|'));
  const reminderStartDays = pickDeterministicValue(seed, reminderWindowMinDays, reminderWindowMaxDays);
  const closureStartDays = Math.max(
    pickDeterministicValue(seed >>> 8, closureWindowMinDays, closureWindowMaxDays),
    reminderStartDays + 1,
  );

  if (lastReply && (!lastSend || lastReply.getTime() >= lastSend.getTime())) {
    return {
      step: 'Qualification',
      crmAction: 'Customer replied. Create a deal in Sales Pipeline stage Qualification.',
      summary: `${namePrefix}reply received on ${lastReply.toISOString().slice(0, 10)}.`,
      replyReceived: true,
      communicationSource: source,
      thresholds: { reminderStartDays, closureStartDays },
    };
  }

  if (!latestActivity) {
    return {
      step: 'Introduction',
      crmAction: 'No outbound email found yet.',
      summary: `${namePrefix}no tracked email or HubSpot activity found yet.`,
      replyReceived: false,
      communicationSource: source,
      thresholds: { reminderStartDays, closureStartDays },
    };
  }

  if (daysSinceLatestActivity == null) {
    return {
      step: 'Introduction',
      crmAction: 'Latest communication date could not be determined.',
      summary: `${namePrefix}latest communication date could not be determined.`,
      replyReceived: false,
      communicationSource: source,
      thresholds: { reminderStartDays, closureStartDays },
    };
  }

  if (daysSinceLatestActivity < reminderStartDays) {
    return {
      step: 'Introduction',
      crmAction: `Initial outreach is still fresh (${daysSinceLatestActivity} days since latest communication).`,
      summary: `${namePrefix}last communication via ${source} was ${daysSinceLatestActivity} days ago and no reply has come in yet.`,
      replyReceived: false,
      communicationSource: source,
      thresholds: { reminderStartDays, closureStartDays },
    };
  }
  if (daysSinceLatestActivity < closureStartDays) {
    return {
      step: 'Reminder',
      crmAction: `A creative reminder makes sense (${daysSinceLatestActivity} days since latest communication).`,
      summary: `${namePrefix}last communication via ${source} was ${daysSinceLatestActivity} days ago and no reply has come in yet.`,
      replyReceived: false,
      communicationSource: source,
      thresholds: { reminderStartDays, closureStartDays },
    };
  }

  return {
    step: 'Closure',
    crmAction: `Close the loop politely (${daysSinceLatestActivity} days since latest communication).`,
    summary: `${namePrefix}last communication via ${source} was ${daysSinceLatestActivity} days ago and there is still no reply.`,
    replyReceived: false,
    communicationSource: source,
    thresholds: { reminderStartDays, closureStartDays },
  };
}
