import { test } from 'node:test';
import assert from 'node:assert/strict';
import { queryRef, bindAnswer, boundTo, settlement, bundleShape } from './federation-kernel.mjs';
import { runFederation, verifyBundle } from './federation.mjs';
import { nodeCrypto } from './crypto-node.mjs';

const Q = { from: 'alice', nonce: 'n1', ask: 'what is X?' };

// ── queryRef ──
test('queryRef is deterministic and total; null/non-object → empty', () => {
  assert.equal(queryRef(Q), queryRef({ ...Q }));
  assert.equal(queryRef(null), '');
  assert.equal(queryRef(5), '');
  assert.notEqual(queryRef(Q), queryRef({ ...Q, nonce: 'n2' }));  // a different query → a different ref
  assert.ok(queryRef(Q).includes('what is X?'));
});

// ── bindAnswer / boundTo (anti-substitution) ──
test('bindAnswer commits the answer to its query; boundTo confirms the binding', () => {
  const body = bindAnswer('bob', Q, 'the answer', 100);
  assert.equal(body.kind, 'answer');
  assert.equal(body.from, 'bob');
  assert.equal(body.replyTo, queryRef(Q));
  assert.equal(body.value, 100);
  assert.equal(boundTo(body, Q), true);
});
test('boundTo REJECTS an answer lifted onto a different query, and rejects garbage', () => {
  const body = bindAnswer('bob', Q, 'the answer', 100);
  assert.equal(boundTo(body, { ...Q, ask: 'a DIFFERENT question' }), false);  // the whole point
  assert.equal(boundTo(body, { ...Q, nonce: 'n2' }), false);
  assert.equal(boundTo(null, Q), false);
  assert.equal(boundTo(5, Q), false);
});

// ── settlement (bounded provenance payout) ──
test('settlement pays the contributor V and a bounded, decaying upstream royalty', () => {
  const s = settlement(1, 100, 0.5);
  assert.equal(s.ok, true);
  assert.equal(s.contributorKeeps, 100);
  assert.equal(s.upstream.length, 1);
  assert.equal(s.upstream[0].level, 1);
  assert.equal(s.upstream[0].share, 50);        // 100 · 0.5^1
  assert.equal(s.upstreamTotal, 50);
  assert.equal(s.withinBound, true);
});
test('settlement depth 0 is valid (no upstream); a two-hop lineage compounds and stays bounded', () => {
  const s0 = settlement(0, 100, 0.5);
  assert.equal(s0.ok, true);
  assert.equal(s0.upstream.length, 0);          // depth 0 kept (kills < → <=)
  const s2 = settlement(2, 100, 0.5);
  assert.equal(s2.upstreamTotal, 75);           // 50 + 25
  assert.ok(s2.upstreamTotal <= s2.bound + 1e-9);
});
test('settlement REFUSES bad inputs at each boundary', () => {
  assert.equal(settlement(-1, 100, 0.5).ok, false);   // depth < 0
  assert.equal(settlement(1.5, 100, 0.5).ok, false);  // non-integer depth
  assert.equal(settlement(1, -5, 0.5).ok, false);     // value < 0
  assert.equal(settlement(1, 0, 0.5).ok, true);       // value 0 is valid (kills < → <=)
  assert.equal(settlement(1, 100, 0).ok, false);      // decay <= 0
  assert.equal(settlement(1, 100, 1).ok, false);      // decay >= 1
  assert.equal(settlement(1, 100, 0.999).ok, true);   // decay just under 1 is valid (kills >= → >)
  assert.equal(settlement(1, 100, NaN).ok, false);
});

// ── bundleShape ──
test('bundleShape names exactly what a complete bundle needs', () => {
  const full = { seeker: 1, contributor: 1, birthCert: 1, queryToken: 1, answer: 1, answerToken: 1, settlement: 1 };
  assert.equal(bundleShape(full).ok, true);
  const { answerToken, ...missingOne } = full;
  const r = bundleShape(missingOne);
  assert.equal(r.ok, false);
  assert.deepEqual(r.missing, ['answerToken']);
  assert.equal(bundleShape(null).ok, false);
});

// ── INTEGRATION: the real N=2 exchange, cold, with real Ed25519 ──
test('runFederation: two independent identities exchange a signed query/answer + settle a payout, ALL verified', async () => {
  const bundle = await runFederation(nodeCrypto());
  // two genuinely-distinct identities (not the same key twice)
  assert.notEqual(bundle.seeker.id, bundle.contributor.id);
  assert.notEqual(bundle.contributor.id, bundle.estate.id);
  // every verification passed
  assert.equal(bundle.verifications.queryTokenValid, true);
  assert.equal(bundle.verifications.answerTokenValid, true);
  assert.equal(bundle.verifications.answerBoundToQuery, true);
  assert.equal(bundle.verifications.contributorLineageValid, true);
  assert.equal(bundle.verifications.settlementWithinBound, true);
  assert.equal(bundle.allValid, true);
  // and a third party re-verifies from the bundle alone
  const rev = await verifyBundle(nodeCrypto(), bundle);
  assert.equal(rev.allValid, true);
});
test('verifyBundle CATCHES tampering — flip one byte of the answer and it fails', async () => {
  const bundle = await runFederation(nodeCrypto());
  const tampered = JSON.parse(JSON.stringify(bundle));
  tampered.answer.answer = tampered.answer.answer + ' (tampered)';   // change the answer text after signing
  const rev = await verifyBundle(nodeCrypto(), tampered);
  assert.equal(rev.allValid, false);                                  // the signature no longer covers the body
  assert.equal(rev.answerTokenMatchesBody, false);
});
test('verifyBundle CATCHES a forged payout — inflate the upstream royalty and it fails', async () => {
  const bundle = await runFederation(nodeCrypto());
  const tampered = JSON.parse(JSON.stringify(bundle));
  tampered.settlement.upstreamTotal = 999999;                         // claim a runaway royalty
  const rev = await verifyBundle(nodeCrypto(), tampered);
  assert.equal(rev.settlementRecomputes, false);
  assert.equal(rev.allValid, false);
});
