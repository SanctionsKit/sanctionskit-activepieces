import https from 'node:https';
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { visit } from 'jsonc-parser';
import schemas from './contracts/schemas.json';

const ajv = new Ajv2020({ strict: false, allErrors: false, coerceTypes: false, useDefaults: false, removeAdditional: false });
addFormats(ajv);
const requestValid = ajv.compile({ $ref: '#/$defs/ScreeningRequest', $defs: schemas });
const resultValid = ajv.compile<Result>({ $ref: '#/$defs/ScreeningResult', $defs: schemas });
const retainedValid = ajv.compile<Result>({ $ref: '#/$defs/RetainedScreeningResult', $defs: schemas });
const secureAgent = new https.Agent({ keepAlive: false, rejectUnauthorized: true, proxyEnv: {} });
const origin = 'https://www.sanctionskit.com';
const errorCodes = new Set(['invalid_api_key', 'authentication_required', 'insufficient_scope', 'permission_denied', 'subscription_required', 'invalid_request', 'idempotency_conflict', 'idempotency_key_required', 'sandbox_coverage_required', 'screening_policy_required', 'screening_policy_changed', 'screening_policy_unavailable', 'policy_coverage_mismatch', 'policy_entity_type_unsupported', 'standard_retention_required', 'usage_cap_reached', 'invalid_coverage', 'coverage_unavailable', 'stale_coverage', 'production_screening_disabled', 'candidate_limit_exceeded', 'result_too_large', 'response_too_large', 'not_found', 'result_expired', 'rate_limited', 'screening_busy', 'internal_error', 'temporarily_unavailable']);

function failure(message: string): Error {
  return new Error(message);
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function checkKey({ key, environment }: { key: string; environment: string }): void {
  const prefix = environment === 'sandbox' ? 'sk_test_' : environment === 'production' ? 'sk_live_' : '';
  if (!prefix || typeof key !== 'string' || !key.startsWith(prefix) || key.length <= prefix.length || /\s/.test(key)) {
    throw failure('Select sandbox or production and use an API key for that environment.');
  }
}

function strictJson(text: string): unknown {
  const stack: Array<Set<string> | null> = [];
  const begin = (keys: Set<string> | null) => {
    stack.push(keys);
    if (stack.length > 64) throw failure('Invalid response JSON. No conclusion is available.');
  };
  visit(text, {
    onObjectBegin: () => begin(new Set()),
    onArrayBegin: () => begin(null),
    onObjectEnd: () => { stack.pop(); },
    onArrayEnd: () => { stack.pop(); },
    onObjectProperty: (name) => {
      const keys = stack.at(-1);
      if (!keys || keys.has(name)) throw failure('Invalid response JSON. No conclusion is available.');
      keys.add(name);
    },
    onLiteralValue: (value: unknown) => {
      if (typeof value === 'number' && !Number.isFinite(value)) throw failure('Invalid response JSON. No conclusion is available.');
    },
    onError: () => { throw failure('Invalid response JSON. No conclusion is available.'); },
  }, { disallowComments: true, allowTrailingComma: false, allowEmptyContent: false });
  return JSON.parse(text);
}

function buildBody(input: ScreenInput): Record<string, unknown> {
  if (typeof input.name !== 'string' || !['person', 'organization', 'vessel', 'aircraft', 'other'].includes(input.entityType) || !['standard', 'minimal'].includes(input.retention)) throw failure('Supply the subject name, entity type and explicit retention choice.');
  const subject: Record<string, unknown> = { name: input.name.trim(), entityType: input.entityType };
  if (input.country !== undefined && input.country !== '') subject.country = input.country;
  if (input.birthDate !== undefined && input.birthDate !== '') subject.birthDate = input.birthDate;
  if (input.identifiers !== undefined) subject.identifiers = input.identifiers;
  const body: Record<string, unknown> = { subject, retention: input.retention };
  if (input.coverageMode === 'package') {
    if (!input.package || input.sourceIds) throw failure('Supply one explicit package and leave source IDs empty.');
    body.package = input.package;
  } else if (input.coverageMode === 'sources') {
    if (!input.sourceIds || input.package) throw failure('Supply explicit source IDs and leave package empty.');
    const sources = input.sourceIds.split(',').map((value) => value.trim());
    if (new Set(sources).size !== sources.length) throw failure('Source IDs must be unique.');
    body.sources = sources;
  } else throw failure('Select an explicit coverage mode.');
  const hasPolicyId = input.policyId !== undefined && input.policyId !== '';
  if (hasPolicyId !== (input.policyVersion !== undefined)) throw failure('Supply the approved policy ID and exact version together.');
  if (hasPolicyId) body.policy = { id: input.policyId, version: input.policyVersion };
  if (input.reference !== undefined) body.reference = input.reference;
  if (!requestValid(body)) throw failure('Invalid screening input. Check fields, date precision, coverage and policy.');
  if (input.environment === 'sandbox' && body.package !== 'sandbox@1') throw failure('Sandbox requires package sandbox@1 and contains invented records only.');
  if (input.environment === 'production' && body.package === 'sandbox@1') throw failure('Choose available production coverage; sandbox@1 is synthetic.');
  if (input.environment === 'production' && body.policy && body.package) throw failure('Production policy screening requires explicit source IDs.');
  return body;
}

async function request({ key, path, method, body, operationId, expectedStatus }: RequestInput): Promise<unknown> {
  const encoded = body === undefined ? undefined : JSON.stringify(body);
  if (encoded && Buffer.byteLength(encoded) > 1_048_576) throw failure('Screening request exceeds the 1 MiB limit.');
  const headers: Record<string, string> = { Authorization: `Bearer ${key}`, Accept: 'application/json', 'Accept-Encoding': 'identity' };
  if (encoded) headers['Content-Type'] = 'application/json';
  if (operationId) headers['Idempotency-Key'] = operationId;
  const raw = await new Promise<{ status: number; body: Buffer }>((resolve, reject) => {
    const req = https.request(`${origin}${path}`, { method, headers, agent: secureAgent, rejectUnauthorized: true }, (res) => {
      const chunks: Buffer[] = [];
      let bytes = 0;
      if (res.headers['content-encoding'] && res.headers['content-encoding'] !== 'identity') {
        res.destroy();
        req.destroy();
        reject(failure('Unexpected response encoding. No conclusion is available.'));
        return;
      }
      res.on('data', (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > 8 * 1024 * 1024) {
          res.destroy();
          req.destroy();
          reject(failure('Response exceeds the 8 MiB connector limit. No evidence was truncated into a result.'));
        } else chunks.push(chunk);
      });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks) }));
      res.on('error', () => reject(failure('Response interrupted. No conclusion is available. Preserve the operation ID for any identical retry.')));
    });
    const timer = setTimeout(() => { req.destroy(); reject(failure('Request deadline exceeded. Remote outcome is unconfirmed; preserve the operation ID for an identical retry.')); }, 30_000);
    req.on('close', () => clearTimeout(timer));
    req.on('error', () => reject(failure('Request failed. Remote outcome is unconfirmed; preserve the operation ID for an identical retry.')));
    if (encoded) req.write(encoded);
    req.end();
  });
  let envelope: unknown;
  try { envelope = strictJson(new TextDecoder('utf-8', { fatal: true }).decode(raw.body)); }
  catch { throw failure('Invalid response JSON. No conclusion is available.'); }
  if (raw.status !== expectedStatus) {
    const detail = record(envelope) && record(envelope.error) ? envelope.error.code : undefined;
    const code = typeof detail === 'string' && errorCodes.has(detail) ? detail : 'request_failed';
    throw failure(`SanctionsKit ${code} (HTTP ${raw.status}). No conclusion is available; no automatic retry was attempted.`);
  }
  if (!record(envelope) || !Object.hasOwn(envelope, 'data')) throw failure('Invalid response envelope. No conclusion is available.');
  return envelope.data;
}

function checkResult({ value, environment, retained }: { value: unknown; environment: string; retained: boolean }): Result {
  const valid = retained ? retainedValid : resultValid;
  if (!valid(value)) throw failure('Response does not match the published result contract. No conclusion is available.');
  if (value.environment !== environment || (value.status === 'potential_match') !== (value.matches.length > 0)) throw failure('Inconsistent result environment or status. No conclusion is available.');
  return value;
}

async function screen({ key, input }: { key: string; input: ScreenInput }): Promise<Record<string, unknown>> {
  checkKey({ key, environment: input.environment });
  if (typeof input.operationId !== 'string' || !/^[A-Za-z0-9_:.-]{8,128}$/.test(input.operationId)) throw failure('Supply a stable, nonsecret operation ID of 8–128 URL-safe characters.');
  const body = buildBody(input);
  const value = await request({ key, method: 'POST', path: '/api/v1/screenings', body, operationId: input.operationId, expectedStatus: 201 });
  const data = checkResult({ value, environment: input.environment, retained: false });
  if (!data.coverage.length || data.coverage.some((item) => !item.fresh)) throw failure('Coverage is empty or stale. No conclusion is available.');
  if (body.package && data.versions.package !== body.package) throw failure('Returned package differs from selected coverage.');
  if (Array.isArray(body.sources)) {
    const covered = new Set(data.coverage.map((item) => item.sourceId));
    if (covered.size !== body.sources.length || body.sources.some((id) => !covered.has(id))) throw failure('Returned sources differ from selected coverage.');
  }
  if (record(body.policy) && (!record(data.policySnapshot) || data.policySnapshot.id !== body.policy.id || data.policySnapshot.version !== body.policy.version)) throw failure('Returned policy differs from the selected exact version.');
  return { data, operationId: input.operationId, synthetic: data.environment === 'sandbox' };
}

async function retrieve({ key, environment, id }: { key: string; environment: string; id: string }): Promise<Record<string, unknown>> {
  checkKey({ key, environment });
  if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw failure('Provide the retained result UUID.');
  const value = await request({ key, method: 'GET', path: `/api/v1/results/${encodeURIComponent(id)}`, expectedStatus: 200 });
  const data = checkResult({ value, environment, retained: true });
  if (data.id.toLowerCase() !== id.toLowerCase()) throw failure('Returned result ID differs from requested evidence.');
  return { data, synthetic: data.environment === 'sandbox', historicalEvidence: true };
}

export const sanctionskitClient = { screen, retrieve, buildBody, checkKey, strictJson };
export type ScreenInput = { environment: string; operationId: string; name: string; entityType: string; country?: string; birthDate?: string; identifiers?: unknown; coverageMode: string; package?: string; sourceIds?: string; retention: string; policyId?: string; policyVersion?: number; reference?: string };
type RequestInput = { key: string; path: string; method: 'POST' | 'GET'; body?: Record<string, unknown>; operationId?: string; expectedStatus: number };
type Result = Record<string, unknown> & { id: string; environment: string; status: string; matches: unknown[]; coverage: Array<{ sourceId: string; fresh: boolean }>; versions: Record<string, unknown> };
