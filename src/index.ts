import { createAction, createPiece, PieceAuth, Property } from '@activepieces/pieces-framework';
import { sanctionskitClient } from './client';

const auth = PieceAuth.SecretText({
  displayName: 'SanctionsKit API key', required: true,
  description: 'Use your own sk_test_ key for the free synthetic sandbox, or sk_live_ key for paid production. Screen needs screenings:write; Retrieve needs results:read. Saving the connection does not authenticate or screen a subject.',
});
const environment = Property.StaticDropdown({ displayName: 'Environment', required: true, options: { options: [{ label: 'Synthetic sandbox', value: 'sandbox' }, { label: 'Paid production', value: 'production' }] } });
const errorHandlingOptions = { retryOnFailure: { defaultValue: false, hide: true }, continueOnFailure: { defaultValue: false, hide: true } };
const screenSubject = createAction({
  name: 'screen_subject', displayName: 'Screen subject', auth,
  description: 'Compare one subject with explicitly selected coverage. Potential matches need analyst review; no match is limited to selected sources and is not legal clearance.',
  errorHandlingOptions,
  props: {
    environment,
    operationId: Property.ShortText({ displayName: 'Stable operation ID', required: true, description: 'Map a nonsecret unique ID from the triggering event. Reuse it only with identical input for a deliberate retry. Never generate a new ID automatically on a retry.' }),
    name: Property.ShortText({ displayName: 'Subject name', required: true }),
    entityType: Property.StaticDropdown({ displayName: 'Entity type', required: true, options: { options: ['person', 'organization', 'vessel', 'aircraft', 'other'].map((value) => ({ label: value, value })) } }),
    country: Property.ShortText({ displayName: 'Known country', required: false, description: 'Supporting identity evidence; does not select sources.' }),
    birthDate: Property.ShortText({ displayName: 'Known birth date', required: false, description: 'YYYY, YYYY-MM or YYYY-MM-DD. Preserve the known precision.' }),
    identifiers: Property.Json({ displayName: 'Identifiers', required: false, description: 'Optional array of objects with type, value and optional issuer. For example [{"type":"passport","value":"DEMO-001"}].' }),
    coverageMode: Property.StaticDropdown({ displayName: 'Coverage selection', required: true, options: { options: [{ label: 'Exact versioned package', value: 'package' }, { label: 'Explicit source IDs', value: 'sources' }] } }),
    package: Property.ShortText({ displayName: 'Package', required: false, description: 'Sandbox: sandbox@1. Leave empty when using source IDs. Production coverage must be approved and available.' }),
    sourceIds: Property.ShortText({ displayName: 'Source IDs', required: false, description: 'Comma-separated IDs from GET /sources. Leave empty when using a package.' }),
    retention: Property.StaticDropdown({ displayName: 'Retention', required: true, options: { options: [{ label: 'Standard', value: 'standard' }, { label: 'Minimal (24-hour API evidence)', value: 'minimal' }] }, description: 'Organization governance can require standard. Activepieces flow history is separate and can retain inputs and outputs.' }),
    policyId: Property.ShortText({ displayName: 'Approved policy UUID', required: false, description: 'Supply with exact version when required by your organization. Production policy requests require source IDs.' }),
    policyVersion: Property.Number({ displayName: 'Approved policy version', required: false }),
    reference: Property.ShortText({ displayName: 'Caller reference', required: false }),
  },
  async run(context) { return sanctionskitClient.screen({ key: context.auth.secret_text, input: context.propsValue }); },
});
const retrieveResult = createAction({
  name: 'retrieve_result', displayName: 'Retrieve retained result', auth, errorHandlingOptions,
  description: 'Retrieve existing evidence by UUID. This does not run a new screening or establish current status. Expired evidence is not reconstructed.',
  props: { environment, id: Property.ShortText({ displayName: 'Result UUID', required: true }) },
  async run(context) { return sanctionskitClient.retrieve({ key: context.auth.secret_text, environment: context.propsValue.environment, id: context.propsValue.id }); },
});

export const sanctionskit = createPiece({ displayName: 'SanctionsKit', description: 'Explicit sanctions screening and retained evidence for analyst review. Free synthetic sandbox and paid production are separate.', auth, authors: ['SanctionsKit'], logoUrl: 'https://www.sanctionskit.com/brand/sanctions-kit-logo-symbol.svg', actions: [screenSubject, retrieveResult], triggers: [] });
