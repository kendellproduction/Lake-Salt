# Historical and stale quote PDF inventory

These files predate the current legal, payment-link, exact-deposit, font, and build gates.
They must not be reused as templates or represented as newly approved terms. Preserve them
as historical records; do not overwrite a PDF that may have been sent or accepted.

## Client-record PDFs - historical, do not replace

- `quotes/Alisa Hartline/Alisa Hartline - Lake Salt Quote 3.pdf`
- `quotes/Ben Gilchrist/Ben Gilchrist - Lake Salt Quote.pdf`
- `Ben Gilchrist - Lake Salt Quote.pdf`

## Generated test PDFs - stale QA fixtures, never send

- `output/quote-test-pack/pdfs/01-alisa-benchmark.pdf`
- `output/quote-test-pack/pdfs/02-heather-winter-private.pdf`
- `output/quote-test-pack/pdfs/03-easy-short.pdf`
- `output/quote-test-pack/pdfs/04-large-wedding.pdf`
- `output/quote-test-pack/pdfs/05-champagne-toast.pdf`
- `output/quote-test-pack/pdfs/06-missing-info.pdf`
- `output/pdf/Ben-Gilchrist-Proposal-with-Booking-Terms.pdf`

## Required handling

1. Never replace a historical client-record PDF in place.
2. New unapproved renders must include `QA-DRAFT-NOT-APPROVED` in the filename.
3. A sendable PDF must be produced by `templates/validate-and-render-quote.mjs`, use an
   approved legal version, and receive page-by-page visual inspection of its generated
   PNG visual-QA images.
