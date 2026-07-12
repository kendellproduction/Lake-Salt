# Receipt Scanner — Design Spec

**Date:** 2026-07-11
**Feature:** AI receipt scanning in the Lake Salt CRM for expense tracking and year-end tax deductions.

## Goal

Kendell snaps a photo of a receipt (or bulk-selects a backlog from the camera roll) in the CRM Expenses module. AI parses it, auto-matches it to an event or flags it as a general business deduction, saves the expense with the receipt image attached, and everything rolls up into a year-end deduction export for the accountant.

## User Flow

1. In **Expenses**, tap **📷 Scan Receipt**. File input accepts camera capture or multi-select (bulk backlog upload).
2. Each image is compressed client-side (max ~1600px longest edge, JPEG ~0.8 quality) and uploaded to Firebase Storage at `receipts/{expenseId}.jpg`.
3. A Cloud Function parses the image with Claude and **auto-saves** the expense — no review gate (Kendell's explicit choice). Unreadable receipts are saved as `status: 'needs-review'` with the image attached so nothing is lost.
4. A **Recent Scans strip** at the top of the Expenses module shows the latest AI-created expenses with their event match and confidence (e.g. "→ Samson wedding · 92%") and a one-tap edit — the audit safety net for fully-automatic mode.

## Architecture

### Client (`website/admin/js/expenses.js`)

- Scan button + hidden `<input type="file" accept="image/*" capture="environment" multiple>`.
- Client-side compression via canvas before upload.
- Creates a stub Firestore doc in `expenses` with `status: 'processing'`, then uploads the image to Storage. Real-time listener updates the Recent Scans strip as the function completes each one.
- Existing expense edit modal gains: event dropdown, receipt thumbnail (tap to open full image), deduction type, payment method.
- Expenses table gains a receipt thumbnail column (📎 icon when present).

### Cloud Function (`functions/index.js`)

- `parseReceipt`: Storage `onFinalize` trigger on `receipts/*`.
- Loads the image, fetches events within **±45 days** of today (and, after parsing the receipt date, re-scopes to ±45 days of the receipt date), and the expense category list.
- Calls the Claude API (vision) with the image + event list + categories. Structured JSON output:
  - `merchant`, `date`, `total`, `tax`, `lineItems[] {description, qty, price}`
  - `category` (one of the 10 existing EXPENSE_CATEGORIES)
  - `matchedEventId` + `matchConfidence` (0–100), or null
  - `deductionType`: `'event'` | `'general'`
  - `paymentMethod` (e.g. "VISA ****4821") when readable
- **Duplicate check:** before writing, query `expenses` for same merchant + total + date (±1 day). If found, mark the new doc `status: 'duplicate'` (kept, not merged) instead of creating a live expense.
- Writes results onto the stub expense doc; sets `status: 'ok'` / `'needs-review'` / `'duplicate'`.
- Anthropic API key stored as a Firebase function secret (`ANTHROPIC_API_KEY` via `defineSecret`). Model: latest Sonnet-class (cost ~$0.01–0.03/receipt).

### Data model — `expenses` doc additions

Existing fields (amount, date, category, eventId, description, …) unchanged. New:

```
receiptUrl        string   Storage download URL
receiptPath       string   Storage path (for deletes)
lineItems         array    [{description, qty, price}]
aiParsed          boolean
matchConfidence   number   0–100 (null if no event match)
deductionType     'event' | 'general'
paymentMethod     string | null
status            'processing' | 'ok' | 'needs-review' | 'duplicate'
taxYear           number   derived from receipt date, not scan date
```

### Event matching logic

Claude matches on (a) receipt date proximity to event date, (b) semantic fit of line items to the event (e.g. prosecco quantities before a wedding). No plausible event → `deductionType: 'general'`, `matchedEventId: null`. Recurring general categories (Insurance, Licensing, Marketing) bias toward `general` regardless of date.

### Year-end deduction export

- New **Export Deductions** action in Expenses: pick tax year → generates CSV grouped by category with totals, payment method, event linkage, and receipt image URLs. Filters on `taxYear` (receipt date), so backlog receipts land in the correct year.
- Excludes `status: 'duplicate'` and `'processing'` rows; flags `'needs-review'` rows in the output.

### Security / rules

- Storage rules: `receipts/**` read/write only for admin-authenticated users (same isAdmin pattern as Firestore rules).
- Firestore `expenses` already admin-gated; no rule change expected.

## Error handling

- Function failure / Claude error → expense stays `needs-review` with image attached; Recent Scans strip shows it in amber.
- Upload failure → client retries once, then surfaces a toast.
- Duplicate suspected → saved as `duplicate`, visible via a filter, restorable with one tap if it's a false positive.

## Out of scope (YAGNI)

- Mileage / per-diem tracking (no receipt image; separate feature).
- Multi-user approval workflows.
- OCR fallback provider.

## Testing

- Unit-test the duplicate-check and taxYear derivation in the function.
- Manual end-to-end: single snap, bulk 10-photo upload, unreadable image, deliberate duplicate, receipt with no plausible event.
- Verify export CSV against a hand-checked sample month.
