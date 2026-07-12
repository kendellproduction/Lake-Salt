# Receipt Scanner — AI Org Chart Implementation Plan

> **For agentic workers:** This plan is executed by a Worker–Checker–Boss orchestration loop (Claude Code Workflow tool + /loop). The Boss is the main session; Workers and Checkers are dispatched subagents. Tasks use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the AI receipt scanner per `docs/superpowers/specs/2026-07-11-receipt-scanner-design.md` using a multi-tier agent loop that keeps costs low (cheap workers) and hallucinations out (independent checkers).

**Architecture:** Client scan UI in `website/admin/js/expenses.js` → Firebase Storage → `parseReceipt` Cloud Function → Claude vision → auto-saved `expenses` docs → Recent Scans strip + year-end deduction export.

**Tech Stack:** Plain JS (no build step) admin SPA, Firebase (Firestore, Storage, Cloud Functions v2, secrets), Anthropic API (vision), Firebase emulators for verification.

---

## 1. THE ORCHESTRATOR (Boss)

**Who:** The main Claude Code session (Fable), running a `/loop` that dispatches one task per iteration via the Workflow/Agent tools. **The Boss never writes production code.**

**Responsibilities:**
- Dispatch each Worker task with the exact spec excerpt, file paths, and relevant Constitution articles inlined in the prompt (workers get zero conversation context — prompts must be self-contained).
- Dispatch the paired Checker only after the Worker reports done; never accept a Worker's self-report as evidence.
- **Merge authority:** only the Boss commits. A task commits only when its Checker returns PASS.
- **Dispute resolution:** rule on Worker↔Checker escalations (see §4). Boss rulings are logged as amendments at the bottom of this file.
- **Sequencing & state:** maintain the checkbox state below; enforce task order (schema/rules tasks before UI tasks that depend on them).
- **Budget guardrail:** workers run on the cheap tier (Haiku) by default; Boss may promote a single task to Sonnet after two consecutive checker failures on that task. Third failure → Boss re-reads the task itself and rewrites the Worker prompt (still doesn't code).
- **Constitution custody:** only the Boss may amend the Constitution, and only in response to a formal dispute.

## 2. THE WORKERS (Cheap Tier — Haiku by default)

Each worker gets one bite-sized task, self-contained prompt, and must return: files changed, exact diff summary, and commands they ran. Worker output is *never trusted* — it is input to the Checker.

| # | Task | Files | Worker deliverable |
|---|------|-------|--------------------|
| W1 | Storage security rules for `receipts/**` (admin-only read/write) | Create/modify `storage.rules` | Rules file matching existing `isAdmin()` pattern from `firestore.rules` |
| W2 | Client image compression utility (`compressReceiptImage(file) → Blob`, max 1600px longest edge, JPEG q0.8) | Modify `website/admin/js/expenses.js` | Pure function, canvas-based, no dependencies |
| W3 | Scan UI: 📷 Scan Receipt button, hidden multi-file input (`accept="image/*" capture="environment" multiple`), per-file flow: create stub expense doc (`status:'processing'`, `taxYear:null`) → upload compressed blob to `receipts/{expenseId}.jpg` → toast on failure with one retry | Modify `website/admin/js/expenses.js` | UI + upload pipeline wired to existing `db`/`storage` globals |
| W4 | `parseReceipt` Cloud Function skeleton: v2 `onObjectFinalized` on `receipts/*`, `defineSecret('ANTHROPIC_API_KEY')`, downloads image, loads events ±45 days + `EXPENSE_CATEGORIES`, idempotency guard (skip if expense `status !== 'processing'`) | Modify `functions/index.js` | Deployable function that reaches "call Claude" stub |
| W5 | Claude vision call + structured JSON schema (merchant, date, total, tax, lineItems, category, matchedEventId, matchConfidence, deductionType, paymentMethod) with the event-matching prompt from the spec; unparseable → `status:'needs-review'` | Modify `functions/index.js` | Prompt + response validation; writes parsed fields onto stub doc, `status:'ok'` |
| W6 | Duplicate detection + taxYear derivation as pure exported functions with unit tests (same merchant + total + date ±1 day → `status:'duplicate'`; `taxYear` from receipt date) | Create `functions/receipt-utils.js`, `functions/test/receipt-utils.test.js`; wire into `functions/index.js` | Tests written first, failing, then passing |
| W7 | Recent Scans strip: real-time listener on latest 10 `aiParsed` expenses, shows merchant/amount/match+confidence, amber for `needs-review`, one-tap edit, duplicate restore action | Modify `website/admin/js/expenses.js` | Strip renders above stats grid |
| W8 | Edit modal + table additions: event dropdown, receipt thumbnail (tap → full image), deductionType, paymentMethod fields; 📎 receipt column in table | Modify `website/admin/js/expenses.js` | Backward-compatible with non-AI expenses (all new fields optional) |
| W9 | Export Deductions: tax-year picker → CSV grouped by category with totals, payment method, event name, receipt URLs; excludes `duplicate`/`processing`, flags `needs-review` | Modify `website/admin/js/expenses.js` | CSV generation reusing existing `exportExpensesCSV` patterns |

## 3. THE CHECKERS (Independent Evaluators)

One checker per worker task, dispatched fresh with **no access to the worker's report** — only the task definition, the Constitution, and the repo. Verdict must be PASS/FAIL with evidence (command output, rendered state), never opinion.

| Checker | Verifies | Independent method (no reliance on worker's claims) |
|---------|----------|------------------------------------------------------|
| C1 | Storage rules | Run `firebase emulators:exec --only storage` rules unit test: unauthenticated write to `receipts/x.jpg` DENIED, admin write ALLOWED. Character-check that no `allow read, write: if true` exists anywhere in the file. |
| C2 | Compression util | Node/browser harness: feed a generated 4000×3000 test image, assert output longest edge ≤1600 and MIME `image/jpeg`. Grep for external deps (must be none). |
| C3 | Scan UI | Load admin page via preview server; snapshot confirms button + hidden input attrs character-for-character (`capture="environment"`, `multiple`). Simulate file select with a fixture image against emulators; assert a Firestore stub doc with `status:'processing'` and a Storage object at `receipts/{docId}.jpg` exist. |
| C4 | Function skeleton | `firebase emulators:exec --only functions,firestore,storage`: upload fixture → function fires, logs show event fetch; re-fire same object → idempotency guard skips (no double processing). `firebase deploy --only functions --dry-run` compiles. Grep: secret accessed only via `defineSecret`, never hardcoded. |
| C5 | Claude parsing | With a stubbed Claude response fixture: every schema field lands on the doc with exact spec field names (character-for-character against the spec's data-model table). Malformed-JSON fixture → doc becomes `needs-review`, image retained. |
| C6 | Dup/taxYear utils | Run `npm test` in `functions/` fresh; also run tests against a *mutated* copy (flip the ±1 day logic) to confirm tests actually catch the mutation — guards against vacuous tests. |
| C7 | Recent Scans strip | Preview + emulator: insert 3 fixture expenses (`ok`, `needs-review`, `duplicate`); snapshot asserts all three render with correct styling class per status, confidence text matches fixture value exactly. |
| C8 | Edit modal/table | Preview: open a legacy expense (no new fields) — modal must render without JS console errors (layout compilation test). Open an AI expense — all new fields populated; thumbnail element's `src` equals fixture `receiptUrl`. |
| C9 | Export CSV | Generate export from a fixture set with known totals; parse the CSV and assert numeric totals to the cent, `duplicate` rows absent, `needs-review` rows flagged, and rows from the wrong `taxYear` absent. |

**Global checker rules:** every checker also runs the console-error check on any page it loads and verifies `git status` shows only the task's declared files changed (scope containment).

## 4. THE DISPUTE LOOP

1. **Worker escalation:** if a Worker believes a Constitution article or checker criterion is wrong for its task (outlier receipt format, spec ambiguity, impossible constraint), it does NOT silently deviate. It returns a structured objection: `{article, conflict, proposed_exception, evidence}`.
2. **Checker escalation:** if a Checker fails a task but suspects its own criterion is over-strict (e.g., exact-string check broken by legitimate whitespace), it returns FAIL plus a `criterion_dispute` note.
3. **Boss ruling:** the Boss (never a worker/checker) rules within the same loop iteration: uphold the rule (worker retries), grant a one-time exception (logged), or amend the Constitution (logged in the Amendments section with date + rationale). Amendments propagate: subsequent checker prompts include the amended text.
4. **Deadlock breaker:** after 3 fail cycles on one task even post-ruling, the Boss halts the loop and surfaces the task to Kendell rather than burning tokens.
5. **Audit trail:** every ruling appended under "Amendments & Rulings" below — checkers test against the Constitution *as amended*.

## 5. THE CONSTITUTION (Non-negotiable — every checker tests against these)

1. **Exact schema names.** Expense fields must match the spec's data-model table character-for-character: `receiptUrl`, `receiptPath`, `lineItems`, `aiParsed`, `matchConfidence`, `deductionType`, `paymentMethod`, `status`, `taxYear`. No synonyms, no casing drift.
2. **Status enum is closed.** `status ∈ {'processing','ok','needs-review','duplicate'}`. Nothing else, ever.
3. **Never destroy tax evidence.** No code path deletes an expense doc or receipt image. Duplicates and failures are status-marked, not removed.
4. **taxYear comes from the receipt date,** never the scan/upload date. If the receipt date is unreadable, `taxYear:null` and `status:'needs-review'`.
5. **Admin-only everywhere.** Firestore `expenses` and Storage `receipts/**` require the existing admin auth pattern. No public read/write, no signed-URL shortcuts in rules.
6. **Secrets stay server-side.** The Anthropic key exists only as a Cloud Function secret. Any occurrence of an API key or `api.anthropic.com` in `website/` is an automatic FAIL.
7. **Backward compatibility.** Existing expenses (manual, no new fields) must render and edit without errors; all new fields are optional reads.
8. **Idempotent function.** `parseReceipt` re-invocation on the same object must not create or overwrite a completed expense.
9. **Exports are audit-grade.** Deduction exports exclude `duplicate` and `processing`, include `needs-review` only with an explicit flag, and totals must be exact to the cent.
10. **No new dependencies or build steps.** Admin JS stays plain-JS/global-style matching the existing modules; `functions/` may add only the `@anthropic-ai/sdk` package.
11. **Scope containment.** A task touches only its declared files. Drive-by edits = FAIL.
12. **Zero console errors** on any admin page a change touches.
13. **Compression bound.** Uploaded receipt images ≤1600px longest edge, JPEG.
14. **One commit per passed task,** made by the Boss only, conventional-commit message.

## Execution order

W1 → W2 → W3 → W4 → W5 → W6 → W7 → W8 → W9 (each: Worker → Checker → Boss commit)

- [x] W1 rules · C1 pass · commit
- [ ] W2 compression · C2 pass · commit
- [ ] W3 scan UI · C3 pass · commit
- [ ] W4 function skeleton · C4 pass · commit
- [ ] W5 Claude parsing · C5 pass · commit
- [ ] W6 dup/taxYear utils · C6 pass · commit
- [ ] W7 recent scans strip · C7 pass · commit
- [ ] W8 modal/table · C8 pass · commit
- [ ] W9 export · C9 pass · commit
- [ ] Final: Boss runs end-to-end verification per spec's Testing section; Kendell sets `ANTHROPIC_API_KEY` secret (only human-gated step)

## Amendments & Rulings

*(Boss appends dated rulings here during execution.)*
