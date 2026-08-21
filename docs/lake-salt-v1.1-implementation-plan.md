# Lake Salt AI Operations v1.1 — Implementation Plan

Status: active migration plan  
Target: `docs/lake-salt-v1.1-spec.md`  
Authority: local, reversible repository implementation only

## Outcome and authority boundary

Build one provider-neutral operations platform for lead intake, communication, CRM, pricing, quotes, booking, agreements, read-only payment reconciliation, capacity, event preparation, follow-up, monitoring, and recovery.

This migration may add and test repository code, fixtures, rules, documentation, and reversible schemas. It must not deploy, contact clients, move money, change account permissions, activate a policy release, remove production functionality, or perform live data migrations without separate owner authority.

## Evidence hierarchy

1. The v1.1 specification is the approved target architecture.
2. The current-knowledge extraction identifies confirmed knowledge, conflicts, and safe interim behavior.
3. Current code, skills, historical documents, and live notes are migration evidence and regression inputs, not automatically active policy.
4. Accepted client-specific records remain immutable even when later policy differs.

## Source boundaries

| Source | Sensitivity | Permitted local use | Prohibited in this migration |
|---|---|---|---|
| Specifications and repository docs | internal business policy | read, normalize, test | silently promote contradictions |
| Firestore schemas/rules and local fixtures | operational/customer-data shape | inspect code; use synthetic or de-identified fixtures | read or mutate production data |
| Gmail, marketplace relays, EmailJS | client communication | adapter contracts and fakes | send, draft, or alter live messages |
| Calendar providers | owner/staff availability | adapter contracts and fakes | create, update, or delete live events |
| Payment providers/accounts | financial | read-only reconciliation contracts and fixtures | charges, refunds, transfers, account changes |
| Secret Manager and ignored credential files | restricted credentials | inventory names/boundaries only | print, copy, rotate, or use credentials |
| Model providers | untrusted-content processing | provider-neutral interfaces and fixtures | live inference that triggers consequential action |

## Phases and acceptance gates

### Phase 1 — Safety foundation

- Immutable policy-release loader with manifest verification and one pinned release per run.
- Privacy-safe append-only operational event contract.
- One deterministic send-gate contract, global kill switch, authority taxonomy, identity/thread/recipient checks, content and attachment validation, structured-money validation, and shadow/draft default.
- Transactional outbox with leases, uncertain-send reconciliation, bounded retry, dead-letter visibility, and deterministic idempotency.
- Static and runtime regression tests for wrong-thread delivery and internal agreement language.

Gate: no integrated sender may bypass the service; migration defaults fail closed. Existing live send paths are not deleted until the replacement is locally verified and an explicit production cutover is authorized.

### Phase 2 — Domain and lifecycle contracts

- Canonical lead plus business-event identity and conversation resolution.
- Structured quote inputs, deterministic calculation, immutable accepted snapshots, shadow/approved comparison, and attributed variance.
- Booking/capacity orchestration preserving current fail-safe calendar behavior.
- Separate sales, booked-event, and campaign follow-up policies.
- Event-prep timelines, read-only finance reconciliation, attention items, and weekly audit reports.

Gate: all flows are pure, fixture-driven, provider-neutral, idempotent, and policy-versioned.

### Phase 3 — Repository integration

- Route callable and automated communication through the service; legacy direct paths become shadow/draft adapters or explicit blocked compatibility shims.
- Add Firestore rules for append-only audit visibility, owner-only activation, outbox/task access, and new operational collections.
- Add ingestion jobs with push-compatible event contracts plus an independently complete recovery sweep.
- Add owner cockpit read models, exception digest, kill-switch/recovery controls, and visible dead letters.

Gate: existing unit tests and new security/failure tests pass; no live providers are called.

### Phase 4 — Verification and reversible handoff

- Run unit, integration where locally available, architecture-boundary, failure-injection, and end-to-end fixture suites.
- Independently review every delegated implementation diff; resolve security, privacy, correctness, idempotency, and data-integrity findings.
- Document local operating procedures, recovery, rollback, retention, known limitations, and external activation/deployment decisions.

Gate: local implementation is review-clean. Production activation, deployment, provider credentials, live observation, and autonomous-pricing graduation remain separate owner-controlled actions.

## Safe interim decisions

- Kill switch defaults on for migrated outbound operations; unknown state also blocks.
- Green actions may progress only through the send service after an activated policy exists; until activation, produce a preview/draft/hold.
- Yellow actions produce drafts or attention items. Red actions never execute.
- Pricing remains shadow-only. Accepted Alisa terms remain $792 total and $79.20 deposit.
- Unknown payment rails, due dates, cancellation/refund terms, availability, event identity, recipient, or conversation are held for reconciliation.
- External calendar absence or staleness never becomes an availability claim.
- No full client bodies, attachments, credentials, or unnecessary personal data enter operational audit events.

## Success measures

- Zero fixture-observed duplicate, wrong-thread, cross-event, or internal-language sends.
- Zero unvalidated monetary values reaching an external-send adapter.
- Every failure and dead letter yields a visible attention record.
- Every operation is attributable to one policy version and idempotency key.
- Every booked-event fixture has capacity, CRM, payment-status, and preparation state.
- Weekly audit produces a report when findings are empty and when dependencies partially fail.

