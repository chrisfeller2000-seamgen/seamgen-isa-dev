import fs from 'node:fs/promises';
import { describeOutreachStageCadence } from './outreach-flow.mjs';

const DEFAULT_BASE_URL = 'https://api.hubapi.com';
const DEFAULT_PORTAL_ID = 21542978;
const DEFAULT_TOKEN_ENV_NAMES = [
  'HUBSPOT_SERVICE_KEY',
  'HUBSPOT_API_TOKEN',
  'HUBSPOT_PRIVATE_APP_TOKEN',
];
const DEFAULT_TOKEN_FILE_PATHS = [
  '/home/azureuser/.openclaw/credentials/hubspot-service-key',
  '/home/azureuser/.openclaw/credentials/hubspot-api-token',
];

function ensureTrailingSlash(value) {
  const text = String(value || '').trim();
  if (!text) return DEFAULT_BASE_URL;
  return text.endsWith('/') ? text : `${text}/`;
}

function getEnvToken(env = process.env) {
  for (const name of DEFAULT_TOKEN_ENV_NAMES) {
    const value = env[name];
    if (value && String(value).trim()) return String(value).trim();
  }
  return '';
}

async function readTokenFile(filePath) {
  try {
    const text = await fs.readFile(filePath, 'utf8');
    return String(text || '').trim();
  } catch {
    return '';
  }
}

async function getTokenFromFiles(paths = DEFAULT_TOKEN_FILE_PATHS) {
  for (const filePath of paths) {
    const value = await readTokenFile(filePath);
    if (value) return value;
  }
  return '';
}

function normalizeProperties(properties) {
  if (!properties) return [];
  if (Array.isArray(properties)) return properties.map((value) => String(value)).filter(Boolean);
  if (typeof properties === 'string') {
    return properties
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
  }
  return [];
}

export function buildLeadName(contactName = '', companyName = '') {
  const contact = String(contactName || '').trim();
  const company = String(companyName || '').trim();
  if (contact && company) return `${contact} - ${company}`;
  if (contact) return contact;
  if (company) return company;
  return '';
}

export function describeLeadFollowUp(pipelineName = '', stageName = '') {
  const pipeline = String(pipelineName || '').trim();
  const cadence = describeOutreachStageCadence(stageName);
  return {
    ...cadence,
    pipeline,
  };
}

function toJsonString(value) {
  return JSON.stringify(value, null, 2);
}

export class HubSpotLeadsError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'HubSpotLeadsError';
    this.status = details.status ?? null;
    this.correlationId = details.correlationId ?? null;
    this.responseBody = details.responseBody ?? null;
    this.url = details.url ?? null;
    this.method = details.method ?? null;
  }
}

export class HubSpotLeadsClient {
  constructor(options = {}) {
    this.baseUrl = ensureTrailingSlash(options.baseUrl || process.env.HUBSPOT_API_BASE_URL || DEFAULT_BASE_URL);
    this.portalId = Number.isFinite(Number(options.portalId))
      ? Number(options.portalId)
      : Number(process.env.HUBSPOT_PORTAL_ID || DEFAULT_PORTAL_ID);
    this.tokenPromise = null;
    this.token = options.token || getEnvToken(options.env || process.env);
    this.fetchImpl = options.fetchImpl || globalThis.fetch;

    if (typeof this.fetchImpl !== 'function') {
      throw new Error('A fetch implementation is required');
    }
  }

  async request(path, options = {}) {
    const token = await this.getToken();
    if (!token) {
      throw new HubSpotLeadsError('Missing HubSpot service key/token', { method: options.method || 'GET', url: path });
    }

    const url = new URL(path.replace(/^\//, ''), this.baseUrl);
    if (options.query) {
      for (const [key, value] of Object.entries(options.query)) {
        if (value == null || value === '') continue;
        if (Array.isArray(value)) {
          for (const item of value) url.searchParams.append(key, String(item));
        } else {
          url.searchParams.set(key, String(value));
        }
      }
    }

    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    };

    const response = await this.fetchImpl(url, {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    const text = await response.text();
    const correlationId =
      response.headers.get('x-hubspot-correlation-id') ||
      response.headers.get('x-request-id') ||
      null;

    if (!response.ok) {
      throw new HubSpotLeadsError(
        `HubSpot API request failed with ${response.status} ${response.statusText}`,
        {
          status: response.status,
          correlationId,
          responseBody: text,
          url: url.toString(),
          method: options.method || 'GET',
        },
      );
    }

    if (!text) {
      return null;
    }

    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  async getToken() {
    if (this.token) return this.token;
    if (!this.tokenPromise) {
      this.tokenPromise = getTokenFromFiles().then((value) => {
        this.token = value;
        return value;
      });
    }
    return this.tokenPromise;
  }

  listLeadProperties({ limit = 100, archived = false } = {}) {
    return this.request('/crm/v3/properties/leads', {
      method: 'GET',
      query: { limit, archived },
    });
  }

  listLeadPipelines() {
    return this.request('/crm/v3/pipelines/leads', { method: 'GET' });
  }

  searchLeads({
    limit = 100,
    after,
    properties,
    filterGroups,
    sorts,
    query,
    archived = false,
  } = {}) {
    const body = {
      limit,
      archived,
    };

    const props = normalizeProperties(properties);
    if (props.length) body.properties = props;
    if (after != null) body.after = String(after);
    if (Array.isArray(filterGroups) && filterGroups.length) body.filterGroups = filterGroups;
    if (Array.isArray(sorts) && sorts.length) body.sorts = sorts;
    if (query != null && query !== '') body.query = String(query);

    return this.request('/crm/v3/objects/leads/search', {
      method: 'POST',
      body,
    });
  }

  getLead(leadId, properties) {
    if (!leadId) throw new Error('leadId is required');
    const props = normalizeProperties(properties);
    return this.request(`/crm/v3/objects/leads/${encodeURIComponent(String(leadId))}`, {
      method: 'GET',
      query: props.length ? { properties: props } : undefined,
    });
  }

  createLead({ properties = {}, associations = [] } = {}) {
    const body = { properties };
    if (Array.isArray(associations) && associations.length) body.associations = associations;
    return this.request('/crm/v3/objects/leads', { method: 'POST', body });
  }

  createNote({ properties = {}, associations = [] } = {}) {
    const body = { properties };
    if (Array.isArray(associations) && associations.length) body.associations = associations;
    return this.request('/crm/v3/objects/notes', { method: 'POST', body });
  }

  updateLead(leadId, properties = {}) {
    if (!leadId) throw new Error('leadId is required');
    return this.request(`/crm/v3/objects/leads/${encodeURIComponent(String(leadId))}`, {
      method: 'PATCH',
      body: { properties },
    });
  }

  archiveLead(leadId) {
    if (!leadId) throw new Error('leadId is required');
    return this.request(`/crm/v3/objects/leads/${encodeURIComponent(String(leadId))}`, {
      method: 'DELETE',
    });
  }

  async selfTest() {
    const local = await runLocalContractTest();
    const live = await runLiveSmokeTest(this);
    return { local, live, portalId: this.portalId, baseUrl: this.baseUrl };
  }

  async getLeadSnapshot({
    properties = [
      'hs_object_id',
      'hs_pipeline',
      'hs_pipeline_stage',
      'hubspot_owner_id',
      'hs_createdate',
      'hs_lastmodifieddate',
      'hs_lead_name',
      'hs_lead_name_calculated',
      'hs_associated_contact_firstname',
      'hs_associated_contact_lastname',
      'hs_associated_contact_email',
      'hs_associated_company_name',
      'hs_primary_contact_id',
      'hs_primary_company_id',
      'hs_lead_label',
    ],
    pipelineIds = [],
  } = {}) {
    const pipelines = await this.listLeadPipelines();
    const pipelineLabels = new Map();
    const stageLabels = new Map();
    const allowedPipelines = new Set(
      (Array.isArray(pipelineIds) ? pipelineIds : [pipelineIds])
        .map((value) => String(value || '').trim())
        .filter(Boolean),
    );
    for (const pipeline of pipelines?.results || []) {
      pipelineLabels.set(String(pipeline.id), pipeline.label || String(pipeline.id));
      for (const stage of pipeline?.stages || []) {
        stageLabels.set(`${pipeline.id}::${stage.id}`, stage.label || stage.id);
      }
    }

    const results = [];
    let after = undefined;
    do {
      const page = await this.searchLeads({
        limit: 100,
        after,
        properties,
      });
      for (const item of page?.results || []) {
        results.push(item);
      }
      after = page?.paging?.next?.after || null;
    } while (after);

    const byPipeline = new Map();
    const byStage = new Map();
    const records = [];
    for (const lead of results) {
      const pipeline = lead?.properties?.hs_pipeline || 'unknown';
      const stage = lead?.properties?.hs_pipeline_stage || 'unknown';
      if (allowedPipelines.size && !allowedPipelines.has(String(pipeline))) {
        continue;
      }
      const pipelineLabel = pipelineLabels.get(pipeline) || pipeline;
      const stageLabel = stageLabels.get(`${pipeline}::${stage}`) || stage;
      byPipeline.set(pipeline, (byPipeline.get(pipeline) || 0) + 1);
      byStage.set(`${pipeline}::${stage}`, (byStage.get(`${pipeline}::${stage}`) || 0) + 1);
      const props = lead?.properties || {};
      const contactName = [props.hs_associated_contact_firstname, props.hs_associated_contact_lastname].filter(Boolean).join(' ').trim();
      const companyName = props.hs_associated_company_name || '';
      const contactEmail = props.hs_associated_contact_email || '';
      const leadName =
        props.hs_lead_name ||
        props.hs_lead_name_calculated ||
        buildLeadName(contactName, companyName) ||
        props.hs_lead_label ||
        `Lead ${lead?.id || props.hs_object_id || 'unknown'}`;

      records.push({
        id: lead?.id || props.hs_object_id || '',
        name: leadName,
        companyName,
        companyId: props.hs_primary_company_id || '',
        contactName,
        contactId: props.hs_primary_contact_id || '',
        contactEmail,
        ownerId: props.hubspot_owner_id || '',
        pipeline: pipelineLabel,
        stage: stageLabel,
        createdAt: props.hs_createdate || '',
        lastModified: props.hs_lastmodifieddate || '',
        firstOutreachDate: props.hs_lead_first_outreach_date || '',
        isOpen: props.hs_lead_is_open_v2 ?? props.hs_lead_is_open ?? null,
        followUp: describeLeadFollowUp(pipelineLabel, stageLabel),
      });
    }

    return {
      total: records.length,
      byPipeline: Object.fromEntries(
        [...byPipeline.entries()].map(([pipelineId, count]) => [pipelineLabels.get(pipelineId) || pipelineId, count]),
      ),
      byStage: Object.fromEntries(
        [...byStage.entries()].map(([key, count]) => {
          const [pipelineId, stageId] = key.split('::');
          const pipelineLabel = pipelineLabels.get(pipelineId) || pipelineId;
          const stageLabel = stageLabels.get(key) || stageId;
          return [`${pipelineLabel} / ${stageLabel}`, count];
        }),
      ),
      records,
      sampleLead: results[0] || null,
    };
  }
}

async function runLocalContractTest() {
  const calls = [];
  const jsonResponse = (payload, status = 200) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  const emptyResponse = () => new Response(null, { status: 204 });
  const mockFetch = async (url, options = {}) => {
    const href = String(url);
    calls.push({
      url: href,
      method: options.method || 'GET',
      body: options.body ? JSON.parse(options.body) : null,
      headers: options.headers || {},
    });

    if (href.includes('/crm/v3/properties/leads')) {
      return jsonResponse({ results: [{ name: 'hs_object_id', label: 'Record ID' }] });
    }

    if (href.includes('/crm/v3/pipelines/leads')) {
      return jsonResponse({ results: [{ id: 'lead-pipeline-id', label: 'Lead pipeline' }] });
    }

    if (href.includes('/crm/v3/objects/leads/search')) {
      return jsonResponse({ results: [] });
    }

    if (href.includes('/crm/v3/objects/leads/')) {
      if ((options.method || 'GET') === 'DELETE') return emptyResponse();
      return jsonResponse({ id: '123', properties: {} });
    }

    return emptyResponse();
  };

  const client = new HubSpotLeadsClient({
    token: 'test-token',
    baseUrl: 'https://api.hubapi.com',
    fetchImpl: mockFetch,
    portalId: 21542978,
  });

  const properties = await client.listLeadProperties({ limit: 1 });
  const pipelines = await client.listLeadPipelines();
  await client.searchLeads({ limit: 1, properties: 'hs_object_id,hs_pipeline' });
  await client.getLead('123', ['hs_object_id']);
  await client.createLead({ properties: { lastname: 'Test Lead' } });
  await client.updateLead('123', { lastname: 'Updated Lead' });
  await client.archiveLead('123');

  return {
    passed: true,
    calls,
    sample: {
      propertyCount: properties?.results?.length || 0,
      pipelineCount: pipelines?.results?.length || 0,
    },
  };
}

async function runLiveSmokeTest(client) {
  const properties = await client.listLeadProperties({ limit: 5 });
  const pipelines = await client.listLeadPipelines();
  const search = await client.searchLeads({
    limit: 1,
    properties: ['hs_object_id', 'hs_pipeline', 'hs_pipeline_stage', 'hubspot_owner_id'],
  });

  let lead = null;
  if (search?.results?.[0]?.id) {
    lead = await client.getLead(search.results[0].id, [
      'hs_object_id',
      'hs_pipeline',
      'hs_pipeline_stage',
      'hubspot_owner_id',
    ]);
  }

  return {
    passed: true,
    propertyCount: properties?.results?.length || 0,
    pipelineLabels: (pipelines?.results || []).map((item) => item.label).filter(Boolean),
    leadId: lead?.id || search?.results?.[0]?.id || null,
    leadStage: lead?.properties?.hs_pipeline_stage || null,
    ownerId: lead?.properties?.hubspot_owner_id || null,
  };
}

export async function loadHubSpotLeadsClient(options = {}) {
  const client = new HubSpotLeadsClient(options);
  if (!client.token) {
    client.token = await getTokenFromFiles();
  }
  return client;
}

export async function getHubSpotLeadSnapshot(options = {}) {
  const client = await loadHubSpotLeadsClient(options);
  return await client.getLeadSnapshot(options);
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const client = new HubSpotLeadsClient();

  if (!command || command === '--help' || command === '-h') {
    console.log([
      'HubSpot Leads Sidecar',
      '',
      'Commands:',
      '  self-test',
      '  list-properties [limit]',
      '  list-pipelines',
      '  search [limit]',
      '  get <leadId> [properties]',
      '  create <json>',
      '  create-note <json>',
      '  update <leadId> <json>',
      '  archive <leadId>',
    ].join('\n'));
    return;
  }

  if (command === 'self-test') {
    const result = await client.selfTest();
    process.stdout.write(`${toJsonString(result)}\n`);
    return;
  }

  if (command === 'list-properties') {
    const limit = Number(args[0] || 100);
    const result = await client.listLeadProperties({ limit });
    process.stdout.write(`${toJsonString(result)}\n`);
    return;
  }

  if (command === 'list-pipelines') {
    const result = await client.listLeadPipelines();
    process.stdout.write(`${toJsonString(result)}\n`);
    return;
  }

  if (command === 'search') {
    const limit = Number(args[0] || 10);
    const result = await client.searchLeads({ limit });
    process.stdout.write(`${toJsonString(result)}\n`);
    return;
  }

  if (command === 'get') {
    const [leadId, properties] = args;
    const result = await client.getLead(leadId, properties);
    process.stdout.write(`${toJsonString(result)}\n`);
    return;
  }

  if (command === 'create') {
    const body = JSON.parse(args[0] || '{}');
    const result = await client.createLead(body);
    process.stdout.write(`${toJsonString(result)}\n`);
    return;
  }

  if (command === 'create-note') {
    const body = JSON.parse(args[0] || '{}');
    const result = await client.createNote(body);
    process.stdout.write(`${toJsonString(result)}\n`);
    return;
  }

  if (command === 'update') {
    const [leadId, json] = args;
    const result = await client.updateLead(leadId, JSON.parse(json || '{}'));
    process.stdout.write(`${toJsonString(result)}\n`);
    return;
  }

  if (command === 'archive') {
    const [leadId] = args;
    const result = await client.archiveLead(leadId);
    process.stdout.write(`${toJsonString(result)}\n`);
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    const payload = {
      name: error?.name || 'Error',
      message: error?.message || String(error),
      status: error?.status ?? null,
      correlationId: error?.correlationId ?? null,
      responseBody: error?.responseBody ?? null,
      url: error?.url ?? null,
      method: error?.method ?? null,
    };
    process.stderr.write(`${toJsonString(payload)}\n`);
    process.exitCode = 1;
  });
}
