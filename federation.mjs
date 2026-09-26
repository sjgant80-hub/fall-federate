// federation.mjs — MINIMUM-VIABLE FEDERATION (N=2), run cold with REAL Ed25519.
//
// Two genuinely-independent sovereign identities exchange one signed query/answer and settle one provenance
// payout that BOTH sides — and any third party — can verify from the bundle alone, without trusting either
// machine. This is the mechanism the whole sovereign-mesh thesis rests on, proven end to end.
//
//   estate root ──fork──▶ B (contributor)   A (seeker) is a separate, independent identity
//   1. A signs a QUERY.                         (its own Ed25519 keypair — not a fork of B)
//   2. B verifies A's signature, then answers from its own expertise, signing an ANSWER token BOUND to
//      A's exact query (an answer can't be lifted onto another query).
//   3. A verifies B's answer signature AND the binding AND B's lineage birth-cert.
//   4. The answer realises value V. settlement() pays B and mints a bounded upstream provenance royalty to
//      the estate — deterministic, recomputable, within the runaway-proof bound.
//
// Transport is deliberately absent here: because every payload is a SIGNED TOKEN, it is verified without
// trusting the wire — so the same bundle is valid whether it crossed a WebRTC datachannel, a pasted blob, or
// this function's return value. The real cross-net transport (WebRTC + STUN) is demonstrated separately.
import { genesis, fork, authorize, verifyToken, verifyLineage, canonical } from './wallet.mjs';
import { queryRef, bindAnswer, boundTo, settlement, bundleShape } from './federation-kernel.mjs';

export async function runFederation(crypto, { decay = 0.5, value = 100, ask, answer } = {}) {
  ask = ask || 'What is the failure mode of training a model on its own output?';
  answer = answer || 'Model collapse (MAD): the rare cases vanish first, the distribution narrows, everything regresses to a bland mean. A mesh of independent nodes has no single mean to collapse toward — each node is a tail.';

  // ── identities: the estate root, and TWO independent sovereign nodes ──
  const estate = await genesis(crypto, { caps: ['*'], budget: 1e9 });
  const A = await genesis(crypto, { caps: ['query'], budget: 100 });            // seeker — its own keypair
  const b = await fork(crypto, estate.wallet, estate.sk, { caps: ['answer'], budget: 100 }); // contributor — its own keypair, born of the estate
  const B = { wallet: b.child, sk: b.sk };
  const birthCert = b.birthCert;

  // ── 1. A signs a query (a signed, budgeted action) ──
  const qNonce = 'demo-query-0001';
  const qAuth = await authorize(crypto, A.wallet, A.sk, { type: 'query', cost: 1 }, qNonce);
  const query = { from: A.wallet.id, nonce: qNonce, ask };
  const queryToken = qAuth.token;

  // ── 2. B verifies A's query, then answers, signing an answer BOUND to A's exact query ──
  const queryTokenValid = (await verifyToken(crypto, queryToken)).ok;
  const answerBody = bindAnswer(B.wallet.id, query, answer, value);
  const aAuth = await authorize(crypto, B.wallet, B.sk, { type: 'answer', cost: 1 }, canonical(answerBody));
  const answerToken = aAuth.token;

  // ── 3. A verifies B's answer: signature valid · token commits to this exact answer · answer bound to A's query · B's lineage valid ──
  const answerTokenValid = (await verifyToken(crypto, answerToken)).ok;
  const answerTokenMatchesBody = answerToken.nonce === canonical(answerBody);
  const answerBoundToQuery = boundTo(answerBody, query);
  const contributorLineageValid = (await verifyLineage(crypto, birthCert)).ok;

  // ── 4. settlement: value realised → B keeps V, the estate earns the bounded upstream provenance royalty ──
  const pay = settlement(B.wallet.lineage.depth, value, decay);

  const bundle = {
    v: 1,
    scenario: 'A seeker node queries an independent contributor node; the contributor answers from its own expertise; the value is settled to the contributor with a bounded provenance royalty upstream.',
    decay,
    estate: { id: estate.wallet.id },
    seeker: { id: A.wallet.id, caps: A.wallet.caps },
    contributor: { id: B.wallet.id, caps: B.wallet.caps, depth: B.wallet.lineage.depth, root: B.wallet.lineage.root },
    birthCert,
    query, queryToken,
    answer: answerBody, answerToken,
    settlement: pay,
    verifications: { queryTokenValid, answerTokenValid, answerTokenMatchesBody, answerBoundToQuery, contributorLineageValid, settlementWithinBound: pay.withinBound },
  };
  bundle.allValid = Object.values(bundle.verifications).every(Boolean) && bundleShape(bundle).ok;
  return bundle;
}

// verifyBundle(crypto, bundle) — re-verify EVERYTHING from the bundle alone (what a third party / the /test
// page runs). No secrets, no trust in either machine — just the public keys, the signatures, and the math.
export async function verifyBundle(crypto, bundle) {
  const out = {};
  try {
    const shape = bundleShape(bundle);
    out.shape = shape.ok;
    // A's query token: signature valid, and it is A's key that signed it
    const qv = await verifyToken(crypto, bundle.queryToken);
    out.queryTokenValid = qv.ok && bundle.queryToken.id === bundle.seeker.id;
    // B's answer token: signature valid, B's key, and it commits to the exact answer body
    const av = await verifyToken(crypto, bundle.answerToken);
    out.answerTokenValid = av.ok && bundle.answerToken.id === bundle.contributor.id;
    out.answerTokenMatchesBody = bundle.answerToken.nonce === canonical(bundle.answer);
    // the answer is bound to A's exact query (anti-substitution)
    out.answerBoundToQuery = boundTo(bundle.answer, bundle.query);
    // B's lineage birth-cert verifies against the estate root
    const lv = await verifyLineage(crypto, bundle.birthCert);
    out.contributorLineageValid = lv.ok && bundle.birthCert.parent === bundle.estate.id && bundle.birthCert.child === bundle.contributor.id;
    // the settlement recomputes to the same numbers and stays within the runaway-proof bound
    const recomputed = settlement(bundle.contributor.depth, bundle.settlement.contributorKeeps, bundle.decay);
    out.settlementRecomputes = recomputed.ok === true && Math.abs(recomputed.upstreamTotal - bundle.settlement.upstreamTotal) < 1e-9 && recomputed.withinBound === true;
  } catch (e) {
    out.error = String(e && e.message || e);
  }
  out.allValid = ['shape', 'queryTokenValid', 'answerTokenValid', 'answerTokenMatchesBody', 'answerBoundToQuery', 'contributorLineageValid', 'settlementRecomputes'].every((k) => out[k] === true);
  return out;
}

export default { runFederation, verifyBundle };
