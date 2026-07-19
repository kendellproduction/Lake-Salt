/* Pure helpers for the Gmail sync matcher — no Firebase deps so they can be
   unit-tested directly (scripts/test/sync-classify.test.js). */

/* Local-parts that always indicate automated / non-human senders. */
const AUTOMATED_LOCALPART_RE =
  /^(no-?reply|do-?not-?reply|donotreply|notifications?|notify|alerts?|updates?|news(letter)?s?|marketing|promo(tions)?|offers?|mailer(-daemon)?|bounce[s]?|billing|statements?|receipts?|digest|security|account|hello|info|reply)[-._+@]/i;

/* Domains (matched on the registrable suffix) that never belong to a lead:
   social-network notifiers, banks, insurers, big SaaS mailers. */
const AUTOMATED_DOMAINS = [
  'facebookmail.com', 'instagram.com', 'meta.com', 'metamail.com',
  'tiktok.com', 'linkedin.com', 'pinterest.com', 'twitter.com', 'x.com',
  'chase.com', 'alerts.chase.com', 'capitalone.com', 'wellsfargo.com',
  'americanexpress.com', 'discover.com', 'paypal.com', 'venmo.com',
  'stripe.com', 'squareup.com', 'intuit.com', 'quickbooks.com',
  'geico.com', 'progressive.com', 'statefarm.com', 'allstate.com',
  'hiscox.com', 'nextinsurance.com', 'thehartford.com', 'simplybusiness.com',
  'google.com', 'accounts.google.com', 'youtube.com', 'firebase.google.com',
  'github.com', 'amazon.com', 'amazonses.com', 'shopify.com', 'godaddy.com',
  'mailchimp.com', 'constantcontact.com', 'sendgrid.net', 'hubspot.com',
  'docusign.net', 'docusign.com', 'usps.com', 'ups.com', 'fedex.com',
];

/* Subdomain-heavy ESP infrastructure suffixes (anything under these). */
const AUTOMATED_SUFFIXES = [
  '.facebookmail.com', '.instagram.com', '.chase.com', '.paypal.com',
  '.amazonses.com', '.sendgrid.net', '.mailchimpapp.com', '.rsgsv.net',
  '.mcsv.net', '.google.com', '.github.com', '.docusign.net',
];

function domainOf(email) {
  const at = String(email || '').lastIndexOf('@');
  return at >= 0 ? String(email).slice(at + 1).toLowerCase() : '';
}

/* True when the sender is clearly automated/marketing mail that can never be
   a lead — used to auto-resolve unmatched inbound as 'not_a_lead'. */
function isAutomatedNonLead(email) {
  const e = String(email || '').toLowerCase().trim();
  if (!e || !e.includes('@')) return false;
  const local = e.slice(0, e.indexOf('@')) + '@';        // pad so the regex's trailing sep matches bare locals
  if (AUTOMATED_LOCALPART_RE.test(local)) return true;
  const d = domainOf(e);
  if (AUTOMATED_DOMAINS.includes(d)) return true;
  return AUTOMATED_SUFFIXES.some(s => d.endsWith(s));
}

/* For an outbound (SENT) message, every address that might identify the lead:
   all To + Cc recipients, deduped, minus our own mailbox. */
function outboundCandidates(msg, selfEmails) {
  const self = new Set((selfEmails || []).map(s => String(s).toLowerCase()));
  const out = [];
  for (const a of [...(msg.to || []), ...(msg.cc || [])]) {
    const e = String(a || '').toLowerCase().trim();
    if (e && !self.has(e) && !out.includes(e)) out.push(e);
  }
  return out;
}

module.exports = { isAutomatedNonLead, outboundCandidates, domainOf };
