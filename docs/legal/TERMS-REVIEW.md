# Lake Salt booking terms - legal review required

Status: **NOT APPROVED FOR PRODUCTION; business draft, not legal certification**

The proposal template contains practical plain-language booking terms drafted for Lake
Salt's intended workflow. Before the terms are used as the company's production contract,
have a Utah attorney review them together with Lake Salt's insurance policy, business
entity, payment processor flow, venue practices, and actual operating procedures.

## Review decisions

- Review the selected 10% non-refundable deposit and cancellation schedule: 30+ days
  refunds additional payments except documented nonrecoverable commitments; 15-29 days
  makes 50% of the service price due; 14 days or less makes the full service price due.
- Review the one-time deposit transfer for rescheduling requested 30+ days before the
  event, subject to availability; later requests use the cancellation schedule.
- Review the final-payment deadline of seven calendar days before the event.
- Confirm dry-hire language under Utah alcohol law and Lake Salt's insurance requirements,
  including who purchases, transports, possesses, and removes alcohol.
- Confirm liquor-liability representations and any required client or venue insurance.
- Review limitation of liability, indemnity, dispute-resolution, governing-law, attorney-
  fee, severability, electronic-signature, and entire-agreement clauses. These were not
  improvised into the client copy because they require legal judgment.
- Confirm cancellation, rescheduling, force-majeure, safety/refusal-of-service, damage,
  overtime, and change-order language.
- Confirm whether clicking a payment link and paying the deposit provides adequate notice
  and affirmative acceptance. The checkout should display or link the exact version of
  the proposal and terms, require an unchecked acceptance box, store timestamp/version/IP
  evidence where lawful, and email a receipt plus immutable copy.
- Confirm sales-tax treatment and payment processor chargeback/refund language.

## Operational controls before launch

1. Give every proposal a unique quote number and immutable terms version.
2. Store the accepted PDF, selected option, price, terms version, payment ID, acceptance
   timestamp, and client email in the CRM.
3. Do not treat a date as booked until payment succeeds and availability is rechecked.
4. Prevent checkout after the valid-through date or after the date becomes unavailable.
5. Make preliminary estimates visibly non-guaranteed and require a final confirmed quote
   before accepting a deposit.
6. Keep `<meta name="lake-salt-legal-status" content="NOT-APPROVED-FOR-PRODUCTION">`
   until counsel approves the exact terms. After approval, record an immutable version as
   `APPROVED-FOR-PRODUCTION:YYYY-MM-DD:COUNSEL-OR-REVISION-ID`; the validator recognizes
   only that explicit format.
7. Preliminary estimates must not include deposit/payment acceptance language or a
   checkout URL. Final quotes must state the exact 10% deposit for every option and use an
   actual checkout URL.
