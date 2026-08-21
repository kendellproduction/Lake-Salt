# Lake Salt v1.1 Local Operations Runbook

## Current state

The v1.1 platform is implemented locally as provider-neutral domain and safety services. It is not deployed and policy release `1.0.0` is a proposal, not active. The legacy autonomous task runner has been cut to draft-only behavior in source. The authenticated manual reply callable and explicitly invoked legacy campaign scripts remain unchanged external-action boundaries because removing production functionality requires separate authority.

## Safety controls

- Kill switch is fail-closed: missing state behaves as enabled.
- Shadow is the default disposition. Draft and shadow operations are terminally non-deliverable.
- Live operations require a verified pinned policy snapshot and a single-use authorization capability bound to the exact operation, policy manifest, recipient/thread/event identity, money record, and immutable payload envelope.
- The channel adapter receives the exact verified frozen payload snapshot. It must never re-fetch a mutable draft or attachment reference.
- Uncertain sends reconcile with the provider before retry.
- Dead letters retain `attentionTaskPending` and are swept with an idempotent task upsert at no more than 15-minute intervals.
- Pricing remains shadow-only. Payment workflows are read-only.

## Local verification

```bash
cd functions
npm test
```

From the repository root:

```bash
node --test scripts/test/dash-core.test.js scripts/test/sync-classify.test.js scripts/tests/quote-pricing.test.mjs
node --check functions/index.js
git diff --check
```

Firestore emulator verification additionally requires Java:

```bash
cd functions
npm run test:emulator:ci
```

Do not run `firebase deploy`, `scripts/send-scheduled.js`, or campaign send commands as a verification step.

## Recovery

1. Set/leave the outbound kill switch on.
2. Inspect outbox operations in `uncertain`, `retrying`, or `dead_letter` state.
3. For `uncertain`, run provider reconciliation; never infer failure.
4. Run the pending-attention sweep and confirm each dead letter has one deterministic owner task.
5. Keep the policy snapshot pinned for the whole recovery run.
6. Correct code/policy through a new proposal and regression test. Never edit a published release.

## Rollback

- Code: revert only the migration commit/change set after preserving incident evidence.
- Policy: owner performs one atomic pointer change to the last verified release. No automated job may activate or roll back policy.
- Pricing: remain in shadow; no rollback affects accepted historical quotes.
- Booking: use idempotent lifecycle recovery and never release a confirmed booking through a generic update.

## Credential and integration boundaries

Credential values must never enter logs, fixtures, policy files, or prompts. Current named boundaries are Gmail OAuth, Anthropic API, Firebase Admin/Secret Manager, public EmailJS identifiers, calendar-provider credentials, and the MCP capability token. Ignored local credential files were inventoried by filename only and were not read. Production setup still needs an owner-approved least-privilege/rotation review.

## Authority still required

Separate explicit owner authority is required to:

- deploy functions, rules, indexes, or UI;
- publish or activate the proposed policy release;
- migrate the authenticated manual reply callable and legacy CLI send scripts to the new service, because that cutover changes production functionality;
- connect Gmail push/Pub/Sub, a real calendar provider, payment read adapters, or model providers;
- create/consume live send-authorization records;
- observe live traffic, send any message, move money, change permissions, or graduate autonomous pricing.

## Success ownership

The owner cockpit read model reports lead response SLA, booking completeness, payment/capacity/prep/CRM integrity, outbox/dead-letter health, audit presence, kill-switch state, and shadow-pricing variance. The Lake Salt owner owns policy activation and Red decisions; deterministic jobs own routine processing and visible exception creation.

