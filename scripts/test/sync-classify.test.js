#!/usr/bin/env node
/* Unit tests for functions/sync-classify.js — pure logic, no Firebase.
   RUN: node scripts/test/sync-classify.test.js  */
const path = require('path');
const C = require(path.join(__dirname, '..', '..', 'functions', 'sync-classify.js'));

let passed = 0, failed = 0;
function ok(cond, msg) { if (cond) passed++; else { failed++; console.error(`  ✗ ${msg}`); } }
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { passed++; }
  else { failed++; console.error(`  ✗ ${msg}\n     expected ${e}\n     got      ${a}`); }
}
function group(name, fn) { console.log(`\n${name}`); fn(); }

group('isAutomatedNonLead — automated senders', () => {
  ok(C.isAutomatedNonLead('notification@facebookmail.com'), 'facebookmail');
  ok(C.isAutomatedNonLead('security@mail.instagram.com'), 'instagram subdomain');
  ok(C.isAutomatedNonLead('no-reply@alerts.chase.com'), 'chase alerts');
  ok(C.isAutomatedNonLead('noreply@somebiz.com'), 'noreply local-part, any domain');
  ok(C.isAutomatedNonLead('do-not-reply@insurerco.com'), 'do-not-reply local-part');
  ok(C.isAutomatedNonLead('newsletter@shopnews.io'), 'newsletter local-part');
  ok(C.isAutomatedNonLead('marketing@vendor.com'), 'marketing local-part');
  ok(C.isAutomatedNonLead('statements@mybank.com'), 'statements local-part');
  ok(C.isAutomatedNonLead('updates@nextinsurance.com'), 'insurer domain');
  ok(C.isAutomatedNonLead('bounce+abc123@em.example.com'), 'bounce+token local-part');
});

group('isAutomatedNonLead — real humans stay leads', () => {
  ok(!C.isAutomatedNonLead('jane.smith@gmail.com'), 'normal gmail person');
  ok(!C.isAutomatedNonLead('brideandgroom2026@yahoo.com'), 'yahoo person');
  ok(!C.isAutomatedNonLead('j.marketing.smith@gmail.com'), 'keyword mid-local-part is not a match');
  ok(!C.isAutomatedNonLead('renotarelli@icloud.com'), 'local part merely starting with letters of a keyword-ish word');
  ok(!C.isAutomatedNonLead(''), 'empty string');
  ok(!C.isAutomatedNonLead('not-an-email'), 'no @');
});

group('outboundCandidates', () => {
  const SELF = ['contact@lakesalt.us'];
  eq(C.outboundCandidates({ to: ['Jane@Gmail.com'], cc: [] }, SELF), ['jane@gmail.com'], 'lowercases');
  eq(C.outboundCandidates({ to: ['contact@lakesalt.us', 'a@b.com'], cc: ['c@d.com'] }, SELF),
     ['a@b.com', 'c@d.com'], 'drops self, keeps to+cc order');
  eq(C.outboundCandidates({ to: ['a@b.com', 'a@b.com'] }, SELF), ['a@b.com'], 'dedupes');
  eq(C.outboundCandidates({}, SELF), [], 'missing to/cc');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
