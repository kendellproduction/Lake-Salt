# Lake Salt Quote Template — How to Make a Quote

This folder is the single source of truth for Lake Salt quote PDFs. Every quote must
use this template so the look stays identical (navy #14293e, gold #c9a04c, cream
#faf6ec, DejaVu Serif/Sans fonts, blue-header price cards).

## Files
- `lake-salt-quote-template.html` — the master template (Alisa Hartline 4-option quote,
  the reference standard). Copy it, never edit it in place.
- `example-ben-quote.html` — a 2-option variant (Ben Gilchrist) showing how to adapt
  the cards and swap page 3 content ("Your questions, answered").
- `barsetup_0.png` — the mobile bar footprint image used on the last page.

## Required proposal fields
- Quote number: `{{QUOTE_NUMBER}}`
- Proposal type: `{{PROPOSAL_TYPE}}`
- Client, venue/city, event date, guest scope, staffing, and service window
- Issued date and valid-through date
- Exact 10% deposit amount for every displayed option, final-payment due date, and link
- `{{PRICE_STATUS}}`, exactly `Preliminary estimate` or `Final quote`
- `{{PAYMENT_LINK}}`, an actual HTTPS checkout URL for every Final quote
- `{{OVERTIME_RATE}}`, stated as a dollar rate and billing unit
- `{{OPTION_1_MOBILE_BAR_STATUS}}` (and one status for every other package)
- Total guests, drinking guests, and the included non-alcoholic scope (mocktails,
  sodas/juice, and staffed or self-serve water station)

The master HTML contains `{{PLACEHOLDER}}` tokens. A quote is not ready to send while
any token remains. Run `rg '\{\{' <quote-file>` before rendering.

For `Preliminary estimate`, replace the status-specific tokens with a non-acceptance CTA
that says the estimate cannot be accepted or used to reserve a date and invites the client
to request a Final quote. It must contain no checkout link, payment CTA, or statement that
payment/deposit constitutes acceptance. For `Final quote`, include the exact deposit for
every option, the acceptance language, and an actual HTTPS payment link.

## Rules (non-negotiable)
1. One blue-header card per price option. Header = OPTION label + big price + tagline.
2. Every card contains its full line-item breakdown ending in Service subtotal →
   gratuity → Total. The math must add up exactly.
3. Gratuity is either "20% built in — no tip jar" or "$0 — tip jar at the bar".
4. Always include the "Alcohol is not included" dry-hire band and the booking terms.
5. Personalize the drinks section to what THIS client actually asked for — never leave
   generic menu options once the client has told us their picks (they need to feel heard).
6. Standard disposable cups are included unless the proposal explicitly upgrades to
   premium disposables or glassware. Do not make client-supplied cups the normal option.
7. State alcohol-drinking guests separately from total guests. Price mocktails and any
   water/soda/juice station according to their actual guest count and staffing scope.
8. Next steps: 1) choose package, 2) pay the stated deposit to accept the proposal and
   terms, 3) finalize menu and shopping guide.
9. The internal legal-review metadata must remain in source HTML. It is deliberately
   invisible in the client PDF. It must remain `NOT-APPROVED-FOR-PRODUCTION` until counsel
   approves a version. See `docs/legal/TERMS-REVIEW.md`.
10. Footer: KENDELL · LAKE SALT BARTENDING | LAKESALT.COM · CONTACT@LAKESALT.US · (801) 692-3585

## To build a quote (agent or human with the tools)
1. Copy the template, edit client name, event meta line, intro, cards, and drinks section.
2. Replace every placeholder, verify the math, and review the terms against the selected
   scope. The valid-through date prevents an old proposal from silently reserving a date
   or locking in stale costs; it does not cancel a booking after the deposit is accepted.
3. Run the build/send gate. It validates all tokens, legal approval, price status,
   exact deposits, overtime, payment link, bundled fonts, and portable image assets before
   rendering. It generates PNG visual-QA images and verifies that they exist; a person or
   visual-capable agent must still inspect every image before sending:
   `node templates/validate-and-render-quote.mjs quote.html out.pdf`
4. Save BOTH the .html source and the .pdf to `quotes/<Client Name>/` so the quote can
   always be edited later (never let the only copy live in a Gmail attachment).
5. Attach the PDF to the client email, send, then update the CRM lead: stage →
   Proposal Sent, note with the quote amounts and date sent.

Never overwrite a previously sent or accepted PDF. Render drafts with `QA-DRAFT-NOT-APPROVED`
in the filename. See `docs/legal/STALE-PDF-INVENTORY.md` for PDFs created before the current
gate; they are historical references, not approved reusable templates.

## Pricing structure reference (wedding tier)
- Bartender (setup through breakdown): ~$400 each
- Mixers/garnishes/ice: scale to drinker count; keep premium-cup cost as a separate line
- Standard plastic cups: $20 per 150 · Premium plastic cups: ~$60 per 150
- Glass rental: pass-through (Rent Event Utah) + $45 coordination
- Equipment & transport: $100 · Menu planning + shopping guide: $50
- Gratuity: 20% of service subtotal when built in
- Dry hire always: client buys alcohol at store prices, no markup, we send shopping guide

## Draft policy defaults

- Final balance: due seven calendar days before the event.
- Deposit: 10%, non-refundable.
- Client cancellation 30+ days out: refund additional payments except documented
  nonrecoverable commitments.
- Client cancellation 15-29 days out: 50% of service price due.
- Client cancellation 14 days or less: full service price due.
- Reschedule: subject to availability; deposit transfers once only when requested 30+
  days out. Later requests use the cancellation schedule.
- Final quotes must state an overtime dollar rate per bartender and billing unit.
- Standard disposable cups are baseline. Client-provided cups are an exception by request.
- The quote must say separately who buys bottled/canned soda, juice, and water and what
  Lake Salt supplies for any non-alcoholic station.
