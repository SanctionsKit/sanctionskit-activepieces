# SanctionsKit for Activepieces

A standalone, company-maintained piece with two actions: **Screen subject** and
**Retrieve retained result**. The reviewed source is published as a prerelease candidate, not an official
Activepieces catalogue entry. It has not been published to npm or installed in an
Activepieces platform.

Screening uses explicitly chosen coverage and preserves the full returned evidence.
Potential matches need analyst review. A no-match result applies only to the selected
sources and dataset; it is not legal clearance. Scores are review signals, not identity
probabilities or findings of wrongdoing.

## Connection and actions

Save your own API key as the piece's secret connection. Saving this connection makes
no API call and does not prove authentication. Select the environment in each action:

- **Synthetic sandbox:** a `sk_test_` key and package `sandbox@1`. Records are invented.
- **Paid production:** a `sk_live_` key and approved, available production coverage.

**Screen subject** requires `screenings:write`. Supply a stable, nonsecret operation ID
from the triggering event, a name, entity type, retention choice and exactly one
coverage selection. Use either an exact versioned package or comma-separated source
IDs from `GET /sources`. Optional country, birth date and typed identifiers provide
identity evidence; country does not select sources. Preserve partial-date precision.
Supply an approved policy UUID and exact version when your organization requires it;
production policy requests use explicit source IDs. The piece does not discover or
choose sources/policies, alter account settings, create counterparties or set matching
thresholds.

Map the same operation ID and identical input when deliberately retrying an uncertain
screening. The piece makes one request and has no automatic retry. Its action metadata
disables retry/continue-on-failure defaults. A timeout does not undo a completed remote
request. Workflow-engine recovery and manual reruns remain separate responsibilities;
never generate a new operation ID merely because an attempt failed.

**Retrieve retained result** requires `results:read` and the result UUID. It returns
historical evidence without screening again. Coverage freshness in that saved snapshot
is not current source status. A missing, expired or unauthorized result fails the action;
it never becomes a no-match result. Minimal retention returns null subject/reference
and normally lasts 24 hours. Organization governance may require standard retention.

Both actions return `{ data, synthetic }`; screening adds `operationId`, and retrieval
adds `historicalEvidence: true`. `data` preserves the API's complete validated result,
including disclaimer, source evidence, conflicts, matching settings and optional
assessment fields. Missing or null name similarity is not replaced with the legacy
score.

## Privacy and transport

Activepieces flow history can retain subject inputs and returned evidence independently
of SanctionsKit's retention setting. Protect workflow access and review platform logging
and retention before using personal or production data. The piece does not log keys,
subjects or provider error bodies. Error messages contain fixed wording and a known
API error code/status only.

Requests use a fixed HTTPS origin with explicit certificate verification, no redirects,
no environment proxy discovery, a 30-second overall deadline, a 1 MiB request limit and
an 8 MiB response limit. Compressed responses, duplicate JSON members, non-finite numbers,
invalid UTF-8, and nesting beyond 64 levels are rejected. No successful result is created
from an incomplete response. The current `pieces-common` HTTP helper is not imported;
this transport does not change process-wide TLS settings.

## Build and offline verification

Node 22.0.0, 22.23.3 and 24.16.0 passed the 86 offline tests. The Node 22.0.0
and 24.16.0 builds produced the same bundle. Other Node versions and platform
editions have not been qualified. The tested published framework is
`@activepieces/pieces-framework@0.32.0` with its `@activepieces/shared@0.95.1` dependency.
The current upstream source framework is 0.40.0; no compatibility with that unreleased
workspace runtime is claimed. The piece uses the tested framework's default minimum
release metadata (0.82.0); this is an API-context floor, not certification of any
Activepieces platform release.

```sh
npm ci --ignore-scripts
npm run build
npm test
node scripts/prepare-release.cjs
cd release
npm pack --ignore-scripts
```

The build creates a self-contained `bundle/index.js`. The release manifest has no
runtime npm dependencies; bundled dependency licenses are included. Tests use the
actual published framework and Node HTTPS with intercepted requests and invented
fixtures. External connections are blocked. No live API key, sandbox/production request,
model call or platform account is used.

Schemas are extracted without relaxing constraints from the October 14 public OpenAPI;
provenance is in `src/contracts/provenance.json`. The checks do not establish live
coverage, policy compatibility or platform authentication. See the
[API documentation](https://www.sanctionskit.com/docs/quickstart).

## Distribution and remaining checks

Activepieces currently pauses unsolicited upstream pull requests. Its
[contribution policy](https://github.com/activepieces/activepieces/blob/main/CONTRIBUTING.md)
explicitly permits independently published pieces. The documented
[public npm route](https://www.activepieces.com/docs/build-pieces/sharing-pieces/community)
uses an organization-scoped package and manual installation by name; it does not create
an official catalogue listing. The
[custom-piece build guide](https://www.activepieces.com/docs/build-pieces/misc/bundling-pieces)
requires bundled artifacts. This package bundles the tested published framework with
esbuild; it has not run the current upstream monorepo CLI.

Before publishing the npm package, verify company scope permissions and the intended
prerelease version, then verify the exact published artifact. Before using it in a platform, verify its current
edition's custom-piece entitlement and install the exact tarball or package in a test
project. The current
[platform management guide](https://www.activepieces.com/docs/admin-guide/guides/manage-pieces)
describes a paid administration feature; availability in a particular self-hosted or
cloud plan is not assumed. Confirm action forms, secret masking, engine retry behavior,
flow-history protection and an authorized synthetic run there. No upload, account,
license agreement, payment or platform publication has been performed by this candidate.
