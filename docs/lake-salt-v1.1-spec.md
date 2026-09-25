# Lake Salt AI Operations — v1.1 Specification

**Status:** Target architecture, approved. Supersedes v1.
**Owner:** Kendell (all policy merges, pricing activation, Red decisions)
**Prime directive:** Milestone 1 is the safety cutover. Nothing in this document's engineering ambition may delay shutting off unsafe send paths.

---

## 0. Purpose & Principles

One governed operating system — not a collection of agents:

1. **One policy repository** (immutable versioned releases)
2. **One client-send service** (deterministic gate + durable outbox)
3. **One operational event store** (append-only Firestore collection)
4. **A small set of deterministic jobs** (event-driven ingestion + scheduled sweeps)

Invariants (never negotiable):
- One send path; no other code may call a client-facing send API.
- Gate checks are code, not model judgment. Model QA is an additional layer only.
- Append-only audit of every external action, with policy version.
- Idempotent everything; retries never duplicate sends, tasks, or records.
- Kill switch halts all outbound sends; nothing bypasses it.
- System proposes, Kendell merges — no self-authorization, ever.
- Read-only on money. No transfers, account changes, purchases, or legal acceptance.
- Secrets server-side only; least-privilege credentials per job.
- Never guess. Ambiguity → hold for reconciliation, not best-effort send.

---

## 1. Event-Driven Lead Processing

Polling is the recovery mechanism, not the primary trigger.

**Primary path:**
1. Gmail/platform event arrives (Gmail `users.watch` → Pub/Sub push; platform webhooks/relays as available).
2. Ingest and normalize immediately.
3. Create an idempotent processing job (keyed on source message ID).
4. Process after the configured human-feel delay.

**Recovery path:** a scheduled sweep every 10–15 minutes that is **complete on its own** — it must catch anything push missed, because Gmail push expires (~weekly renewal required) and occasionally drops events. Treat push as a latency optimization; trust the sweep.

Every ingested event records: source channel, source message ID, conversation/thread ID, received timestamp, lead/business-event association, ingestion status, processing status, idempotency key.

**SLA:** first response to a qualified inbound lead < 10 minutes during coverage hours.

---

## 2. Operational Event Store

Append-only Firestore collection: `operations_events/{eventId}`.

Fields per event:

```
eventId, idempotencyKey, correlationId, causationId,
leadId, businessEventId, conversationId, sourceChannel,
actor, actionType, status, policyVersion,
createdAt, startedAt, completedAt,
inputHash, bodyHash, attachmentHashes, externalMessageId,
errorClass, retryCount
```

plus privacy-safe metadata needed for audit and recovery.

Rules:
- Client applications cannot modify or delete records (enforced in `firestore.rules`).
- Server processes may append, and may perform narrowly defined privacy redactions under an auditable retention policy.
- Do NOT store permanent copies of full client message bodies, credentials, or attachments — store hashes and references.
- Every event logs the active policy release it ran under.

Note on scope: `correlationId`/`causationId` are cheap to write — include them — but build no tooling around them yet. Same for dead-lettering: it's a status, not a queueing subsystem.

---

## 3. Client-Send Service

### 3.1 The Gate (single entry point, all channels)

Every channel adapter — Gmail, WeddingPro/The Knot relay, future SMS — calls this one service. Checks in order:

1. **Kill switch** — global flag; if set, nothing sends.
2. **Action authority** — action type is Green (or approved Yellow) for this context.
3. **Lead & business-event identity** — recipient maps to the intended lead AND the intended event (returning clients have multiple events; email address alone is insufficient).
4. **Conversation/thread resolution** — see §4. Ambiguity = hold.
5. **Recipient / relay address verification.**
6. **Calendar & capacity claims** — any availability/date statement verified against the calendar and date-capacity records.
7. **Duplicate / idempotency state** — see §5.
8. **Structured money validation** — see §8. Every monetary value in the payload must match the referenced structured record.
9. **Content safety** — see §7.
10. **Attachment safety** — see §7.
11. **Brand/promise review** — model-based QA layer (tone, promises, brand voice). Advisory + can block; can never substitute for checks 1–10.
12. **Durable outbox reservation** — see §3.2.
13. **External send.**
14. **Confirmation** — record platform response + external message ID; update CRM and event store.

### 3.2 Transactional Outbox

State machine:

```
created → validated → reserved → sending → sent
                     ↘ failed → retrying → (reserved…) | dead_letter
```

Requirements:
- Reserve the idempotency key **transactionally** (Firestore transaction) before sending; concurrent workers cannot both hold it.
- Lease with expiration for abandoned work.
- Record the Gmail/platform response immediately after sending; store the external message ID.
- **Crash in an uncertain state → reconcile against Gmail Sent / the platform before any retry. Never infer an uncertain send failed and resend blindly.**
- Every retry reuses the original operation ID.
- Bounded retries → `dead_letter` status → surfaced as a visible task. No silently stranded lead, ever.

---

## 4. Conversation-First Thread Resolution

Resolution hierarchy — stop at the first hit:

1. Exact stored Gmail/platform conversation ID.
2. Exact reply-to message ID.
3. CRM business-event → conversation mapping.
4. Platform relay thread mapping.
5. Email search — fallback only, when no known mapping exists.

If the fallback finds multiple plausible conversations: **hold for reconciliation. Never guess.**

Corrections/follow-ups require a known prior message or conversation ID and stay in the original thread unless no technically valid reply path exists.

---

## 5. Duplicate Protection

No blanket "no email to this recipient for N minutes" rule — that blocks legitimate active-conversation replies.

Deduplicate on: operation/idempotency key, conversation/thread ID, workflow action type, normalized body/intent hash, attachment hashes, external message ID, and recent outbound state.

A recent outbound message triggers a **conversation re-check** (has the client replied since? is this the same intent?) — it informs, it does not auto-block.

---

## 6. Content & Attachment Validation

Deterministic, context-aware checks — not a naive blocklist that fails on every occurrence of "draft":

- Known internal banners and exact prohibited phrases.
- `TODO`, placeholders, unresolved merge tokens.
- Template tokens (`{{CLIENT_NAME}}`, `[BRACKET]` patterns).
- Document comments, tracked changes, revision markup.
- Internal filenames and draft suffixes.
- Unsupported payment details.
- Unverified availability claims.
- Wrong attachment type; wrong client/event identity.
- Empty, corrupt, or password-protected attachments; unexpected type or size.

**PDF / client agreements — full pipeline:** extract text, render every page, inspect visible content, verify filename, verify client name and event, verify signature requirements, verify no internal banner or unresolved token remains.

This addresses the historical incident (agreement sent with internal "draft/legal review" language) as a permanent regression test.

---

## 7. Structured Money & Quote Records

Money is never validated by searching email text against a pricing file.

Structured quote record:

```
quoteId, leadId, businessEventId, policyVersion,
requiredInputs, lineItems, subtotal, discounts, total,
depositPercent, depositAmount, balance, dueDates,
paymentMethods, computationTrace, confidence, status
```

- Any email containing money must be generated from, or explicitly reference, one of these records.
- The send gate validates every monetary value in the payload against the record.
- Invoice, deposit, balance, refund, and quote amounts are distinct — never interchangeable.

---

## 8. Quote Inputs & Pricing Model

Required inputs (asking for missing ones is **Green** — never an owner escalation):

- Event date and year; service start/end times.
- Setup/access and venue exit constraints when relevant.
- Venue name and city; travel distance/zone.
- Guest count; event type.
- Venue bar vs. Lake Salt provides the bar.
- Scope: beer, wine, cocktails, mocktails, champagne/toast.
- Signature drink complexity; glassware requirements.
- Allergies/special requests.
- Staffing requirements; equipment/add-ons.
- Date capacity and availability.

The pricing model must reflect Lake Salt's **real** cost and staffing structure — do not force base-package + per-person if reality is more nuanced. Source of truth: Kendell + existing `pricing-guidelines.md` + historical quotes. Shadow mode (§9) validates the model against reality before autonomy.

---

## 9. Pricing Shadow Mode

Autonomous quoting launches in shadow mode:

1. System computes a recommended quote.
2. The actually-approved quote is recorded separately.
3. Variance is measured and attributed to the responsible rule.
4. Win/loss outcomes feed reporting.
5. Pricing changes are proposed — never auto-promoted.

Seed the test set with **real historical quotes**, de-identified, not synthetic scenarios.

**Promotion to autonomous quoting requires ALL of:**
- Historical scenario tests pass.
- All pricing invariants pass.
- No unexplained variance outside agreed tolerance.
- Required inputs consistently captured.
- Date capacity verified.
- Rollback mechanism exists.
- **Kendell explicitly activates the pricing policy version.**

Even after promotion: autonomous quotes send only when all inputs are complete, the event is within policy, and confidence exceeds the approved threshold. Anything else → Yellow.

---

## 10. Atomic Policy Releases

No "read individual files fresh" — a job could otherwise read pricing v3 with escalation v2 mid-edit. Instead, immutable versioned releases:

```
policy-releases/
  1.0.0/
    constitution.md
    communication.yaml
    pricing.yaml
    booking.yaml
    payment.yaml
    event-prep.yaml
    escalation.yaml
    security.yaml
    manifest.json   # file hashes + release metadata
```

- Activation is a single pointer flip (`activeRelease: "1.0.0"`) that **only Kendell can change**.
- A job reads exactly one release for its entire run and logs it on every event.
- Releases are immutable once published; changes = new release with version, rationale, test evidence, rollback note.
- No automated process may publish or activate a release. Proposals are diffs for Kendell.

---

## 11. Jobs

| Job | Trigger | Scope |
|---|---|---|
| **Inbox & Lead Processing** | Event-driven + 10–15 min recovery sweep | Ingest → CRM → qualify → reply/quote via send gate → follow-ups per policy |
| **Event Prep** | Daily | Booked events vs. event-prep timeline: 8-week check-in, 3–4-week supply list, 2-week confirm, deposits/balances, post-event closeout |
| **Finance Watch** | Daily | Read-only reconciliation of invoices/deposits/balances vs. CRM; missing payments become tasks |
| **Weekly Audit (QA)** | Weekly | Independent, NO send authority. Samples sends, CRM, quotes vs. policy; detects drift; incidents → regression tests + proposed policy diffs |

Deferred (not in v1.1): Growth/SEO/content automation, autonomous social outreach (finding + drafting OK, sending is human-triggered), corporate pipeline automation. Permanently prohibited: financial writes, self-modification of policy/permissions/guardrails, anything implying Adobe endorsement or touching Adobe internal systems.

---

## 12. Autonomy & Notifications

**Green** — do and log: routine replies, info-gathering, in-policy quotes (post-promotion), follow-ups, CRM updates, prep tasks, payment reminders, review requests.

**Yellow** — draft and hold: new message type, low-confidence pricing, unfamiliar venue constraint, first-of-kind content/outreach. Owner non-response within the policy window → documented default action.

**Red** — owner decision, no default: money movement, new payment accounts, refunds/disputes/legal, contract or policy changes, out-of-policy pricing, account changes, brand/liability risk, anything Adobe-related.

Notifications: no push for routine work; one daily digest (bookings, payments, high-value movement, system issues); immediate interrupt only for Red, with a recommended default and 2–4 choices; no repeated reminders.

---

## 13. Build Milestones (sequencing is the point)

**M1 — Safety cutover (ship first, keep it small):**
- Kill switch.
- One send-gate interface with the *simple* checks (thread must exist → reply in it; recipient verification; basic dedup; internal-language scan; audit write to Firestore).
- Disable/delete every other send path in the repo and plugins.
- Regression tests for both historical incidents (wrong-thread send, internal-language agreement).
- *Exit: no code path can reach a client except through the gate.*

**M2 — Event store + outbox:**
- Full `operations_events` schema + security rules.
- Transactional outbox state machine, leases, reconcile-before-retry, dead-letter surfacing.
- Thread-resolution hierarchy (§4) and nuanced dedup (§5) replace M1's simple versions behind the same interface.

**M3 — Ingestion + structured money:**
- Gmail push + recovery sweep; idempotent processing jobs; human-feel delay.
- Structured quote/payment records; gate validates money against records.
- Launch Inbox & Lead Processing in monitored autonomy (Green live, Yellow queued). Run 2 weeks. *Exit: zero duplicate sends, zero thread errors, zero content leaks, zero untracked leads.*

**M4 — Policy releases + shadow pricing:**
- Atomic policy releases + activation pointer.
- Pricing engine in shadow mode, seeded with historical quotes.
- Launch Event Prep, then Finance Watch (read-only).

**M5 — Audit loop + graduation:**
- Weekly Audit job + incident → regression-test → proposed-diff loop.
- Pricing promotion review against §9 criteria (Kendell activates).
- Only after all above run clean: revisit deferred Growth lane.

**Change governance (all milestones):** bounded tasks with acceptance criteria; independent verification against the repo, not the worker's self-report; every incident becomes a regression test; after 3 failed repair cycles, halt and surface.

---

## 14. Acceptance Metrics

- First response to qualified inbound lead < 10 min during coverage hours.
- Zero: untracked leads, duplicate sends, wrong-thread sends, internal language in client-facing content, unvalidated monetary values sent.
- 100% of booked events have payment status, calendar hold, prep timeline, current CRM state.
- Every failure visible as a task within 15 minutes; dead-letters never silent.
- Weekly audit produces a report even when it finds nothing.
- Shadow-mode pricing variance tracked and attributed per rule.
