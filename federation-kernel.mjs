// federation-kernel.mjs — the PURE federation invariants (witness-gated). The wire (real Ed25519, the run)
// lives in federation.mjs; this is the logic that makes a two-node exchange trustable without trusting
// either machine: an answer is cryptographically BOUND to the exact query it answers, and the provenance
// payout is BOUNDED so it can never run away.
//
// Composes the estate's proven wallet kernel (canonical + lineageSplit, the-wallet, Thomas Frumkin lineage).
import { canonical, lineageSplit } from './wallet.mjs';

// queryRef — the exact canonical bytes an answer must commit to. Binding an answer to this means it can never
// be lifted onto a DIFFERENT query (anti-substitution): the seeker's id + nonce + the ask, canonicalised.
export function queryRef(query) {
  if (!query || typeof query !== 'object') return '';
  return canonical({ ask: String(query.ask ?? ''), from: String(query.from ?? ''), nonce: String(query.nonce ?? '') });
}

// bindAnswer — the body a contributor signs. It commits to the query it answers (replyTo = queryRef), so the
// contributor's signature covers "this specific answer, for this specific query, worth this value".
export function bindAnswer(from, query, answer, value) {
  return { kind: 'answer', from: String(from ?? ''), replyTo: queryRef(query), answer: String(answer ?? ''), value: Number(value) };
}

// boundTo — does a received answer body actually commit to THIS query? Checked before its value is trusted.
export function boundTo(answerBody, query) {
  if (!answerBody || typeof answerBody !== 'object') return false;
  return answerBody.replyTo === queryRef(query);
}

// settlement — the provenance payout for a value V realized at a node of the given lineage depth. The
// contributor keeps V; each ancestor earns a bounded, decaying provenance share. `decay` is a plain
// parameter strictly between zero and one; the upstream total is bounded and can never run away.
export function settlement(depth, value, decay) {
  if (!Number.isInteger(depth) || depth < 0) return { ok: false, why: 'depth must be a non-negative integer' };
  if (!Number.isFinite(value) || value < 0) return { ok: false, why: 'value must be a finite non-negative number' };
  if (!Number.isFinite(decay) || decay <= 0 || decay >= 1) return { ok: false, why: 'decay must be strictly between 0 and 1' };
  const ls = lineageSplit(depth, value, decay);
  return { ok: true, contributorKeeps: ls.self, upstream: ls.split.slice(1), upstreamTotal: ls.upstreamTotal, bound: ls.upstreamBound, withinBound: ls.withinBound };
}

// bundleShape — a federation bundle is complete when it carries both identities, the contributor's birth
// cert (its lineage), the query token, the answer token bound to the query, and the settlement.
export function bundleShape(b) {
  const need = ['seeker', 'contributor', 'birthCert', 'queryToken', 'answer', 'answerToken', 'settlement'];
  if (!b || typeof b !== 'object') return { ok: false, missing: need.slice() };
  const missing = [];
  for (const key of need) if (!b[key]) missing.push(key);
  return { ok: missing.length === 0, missing };
}

export default { queryRef, bindAnswer, boundTo, settlement, bundleShape };
