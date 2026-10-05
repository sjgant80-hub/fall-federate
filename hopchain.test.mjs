import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  hopBody, hopRef, originOk, linkOk, chainLinks,
  deliveryMetrics, hopLatencies, latencyStats, evalPrereg,
} from './hopchain-kernel.mjs';
import { canonical } from './wallet.mjs';
import { nodeCrypto } from './crypto-node.mjs';

// ── hopBody / hopRef ──
test('hopBody pins the signed fields and coerces; null → null', () => {
  const b = hopBody({ seq: 0, from: 'A', to: 'B', prev: '', payload: 'hi', t: 7 });
  assert.deepEqual(b, { seq: 0, from: 'A', to: 'B', prev: '', payload: 'hi', t: 7 });
  const d = hopBody({ seq: 1 });                 // missing fields default, never throw
  assert.equal(d.from, ''); assert.equal(d.to, ''); assert.equal(d.prev, ''); assert.equal(d.payload, ''); assert.equal(d.t, 0);
  assert.equal(hopBody(null), null);
  assert.equal(hopBody(5), null);
});
test('hopRef is deterministic; every field change changes the ref', () => {
  const h = { seq: 0, from: 'A', to: 'B', prev: '', payload: 'hi', t: 7 };
  assert.equal(hopRef(h), hopRef({ ...h }));
  assert.equal(hopRef(null), '');
  assert.notEqual(hopRef(h), hopRef({ ...h, payload: 'HI' }));   // tamper the message
  assert.notEqual(hopRef(h), hopRef({ ...h, seq: 1 }));
  assert.notEqual(hopRef(h), hopRef({ ...h, from: 'Z' }));
  assert.notEqual(hopRef(h), hopRef({ ...h, t: 8 }));
  assert.ok(hopRef(h).includes('hi'));
});

// ── originOk ──
test('originOk accepts only a seq-0 empty-prev head', () => {
  assert.equal(originOk({ seq: 0, prev: '' }), true);
  assert.equal(originOk({ seq: 1, prev: '' }), false);          // not the head
  assert.equal(originOk({ seq: 0, prev: 'x' }), false);         // commits to something before it
  assert.equal(originOk({ seq: 0.5, prev: '' }), false);        // non-integer seq
  assert.equal(originOk(null), false);
  assert.equal(originOk(5), false);
});

// ── linkOk (anti-reorder / anti-drop / anti-inject) ──
test('linkOk holds only when seq advances by exactly one AND prev commits to the prior hop', () => {
  const prev = { seq: 0, from: 'A', to: 'B', prev: '', payload: 'm', t: 0 };
  const good = { seq: 1, from: 'B', to: 'C', prev: hopRef(prev), payload: '', t: 1 };
  assert.equal(linkOk(prev, good), true);
  assert.equal(linkOk(prev, { ...good, seq: 2 }), false);        // skipped a seq (kills seq+1 → seq+2)
  assert.equal(linkOk(prev, { ...good, seq: 0 }), false);        // did not advance (kills !== → ===)
  assert.equal(linkOk(prev, { ...good, prev: 'wrong' }), false); // broke the hash link
  assert.equal(linkOk(prev, { ...good, prev: hopRef({ ...prev, payload: 'TAMPERED' }) }), false);
  assert.equal(linkOk(null, good), false);
  assert.equal(linkOk(prev, null), false);
  assert.equal(linkOk({ seq: 0.1 }, good), false);               // non-integer seq never lands on prev.seq+1
  assert.equal(linkOk(5, good), false);                          // scalar prev → no false-positive, no throw
  assert.equal(linkOk(prev, 7), false);                          // scalar hop → no false-positive, no throw
});

// ── chainLinks ──
function unsigned(seq, from, to, prev, payload, t) { return { seq, from, to, prev, payload, t }; }
function buildStructuralChain(n) {
  const chain = [];
  for (let i = 0; i < n; i++) {
    const prev = i === 0 ? '' : hopRef(chain[i - 1]);
    chain.push(unsigned(i, 'node' + i, i + 1 < n ? 'node' + (i + 1) : '', prev, i === 0 ? 'the message' : '', i));
  }
  return chain;
}
test('chainLinks verifies a whole sound chain and points at the first break', () => {
  const ok = buildStructuralChain(3);
  assert.deepEqual(chainLinks(ok), { ok: true, n: 3, brokenAt: -1 });

  const badOrigin = buildStructuralChain(3); badOrigin[0].prev = 'x';
  assert.deepEqual(chainLinks(badOrigin), { ok: false, n: 3, brokenAt: 0 });

  const brokeMiddle = buildStructuralChain(4); brokeMiddle[2].prev = 'forged';
  assert.equal(chainLinks(brokeMiddle).brokenAt, 2);             // exact break index

  const reordered = buildStructuralChain(3); [reordered[1], reordered[2]] = [reordered[2], reordered[1]];
  assert.equal(chainLinks(reordered).ok, false);                 // reorder is caught

  assert.deepEqual(chainLinks([]), { ok: false, n: 0, brokenAt: 0 });
  assert.deepEqual(chainLinks('nope'), { ok: false, n: 0, brokenAt: 0 });   // non-array → n:0, not its char length
});

// ── deliveryMetrics ──
test('deliveryMetrics is complete only when linked AND every expected hop arrived', () => {
  const chain = buildStructuralChain(3);
  assert.deepEqual(deliveryMetrics(3, chain), { expected: 3, delivered: 3, linked: true, brokenAt: -1, complete: true });
  assert.equal(deliveryMetrics(4, chain).complete, false);       // one short (kills >= → nonsense)
  assert.equal(deliveryMetrics(3, chain.slice(0, 2)).complete, false);
  assert.equal(deliveryMetrics(0, chain).complete, false);       // expected 0 is never "complete" (kills >0 → >=0)
  const broken = buildStructuralChain(3); broken[1].prev = 'x';
  assert.equal(deliveryMetrics(3, broken).complete, false);      // delivered but not linked
  assert.equal(deliveryMetrics(3, 'nope').delivered, 0);
});

// ── hopLatencies ──
test('hopLatencies pairs send/recv marks; bad pairs → null, never a throw', () => {
  assert.deepEqual(hopLatencies([{ sentAt: 100, recvAt: 140 }, { sentAt: 200, recvAt: 260 }]), [40, 60]);
  assert.deepEqual(hopLatencies([{ sentAt: 100, recvAt: 90 }]), [null]);   // recv before send
  assert.deepEqual(hopLatencies([{ sentAt: 100 }]), [null]);               // missing recv
  assert.deepEqual(hopLatencies([{ sentAt: 100, recvAt: 100 }]), [0]);     // zero is legal (kills >= → >)
  assert.deepEqual(hopLatencies('nope'), []);
});

// ── latencyStats ──
test('latencyStats computes min/max/mean/median, odd and even, sorting first', () => {
  const odd = latencyStats([30, 10, 20]);
  assert.deepEqual(odd, { n: 3, min: 10, max: 30, mean: 20, median: 20 });
  const even = latencyStats([10, 20, 30, 40]);
  assert.equal(even.median, 25);                                 // (20+30)/2 (kills /2 → *2, mid off-by-one)
  assert.equal(even.mean, 25);
  assert.equal(even.min, 10); assert.equal(even.max, 40);
  const two = latencyStats([20, 10]);
  assert.equal(two.median, 15);
  assert.deepEqual(latencyStats([]), { n: 0, min: null, max: null, mean: null, median: null });
  assert.equal(latencyStats([5, null, NaN, 15]).n, 2);           // non-finite skipped
});

// ── evalPrereg (measure-only) ──
const PREREG = { minHops: 2, maxMedianLatencyMs: 2000, requireDelivery: true, requireTwoNetworks: true };
test('evalPrereg passes only when every registered criterion is met', () => {
  const pass = evalPrereg(PREREG, { hops: 3, medianLatencyMs: 300, delivered: 3, complete: true, twoNetworks: true, chainLinked: true });
  assert.equal(pass.pass, true);
  assert.equal(pass.criteria.length, 5);
  // hops exactly AT the minimum still passes (kills >= → >)
  assert.equal(evalPrereg(PREREG, { hops: 2, medianLatencyMs: 300, delivered: 2, complete: true, twoNetworks: true, chainLinked: true }).pass, true);
});
test('evalPrereg fails a run that misses ANY criterion — honestly, one at a time', () => {
  const base = { hops: 3, medianLatencyMs: 300, delivered: 3, complete: true, twoNetworks: true, chainLinked: true };
  assert.equal(evalPrereg(PREREG, { ...base, hops: 1 }).pass, false);            // too few hops
  assert.equal(evalPrereg(PREREG, { ...base, chainLinked: false }).pass, false); // chain broke
  assert.equal(evalPrereg(PREREG, { ...base, complete: false }).pass, false);    // not delivered
  assert.equal(evalPrereg(PREREG, { ...base, medianLatencyMs: 5000 }).pass, false); // too slow
  assert.equal(evalPrereg(PREREG, { ...base, twoNetworks: false }).pass, false); // one network only
  assert.equal(evalPrereg(PREREG, { ...base, medianLatencyMs: 2000 }).pass, true); // exactly at cap (kills <= → <)
  // relaxed prereg drops the optional criteria
  const relaxed = evalPrereg({ minHops: 2, maxMedianLatencyMs: 2000, requireDelivery: false, requireTwoNetworks: false }, { ...base, complete: false, twoNetworks: false });
  assert.equal(relaxed.criteria.length, 3);
  assert.equal(relaxed.pass, true);
  assert.equal(evalPrereg(null, base).ok, false);
  assert.equal(evalPrereg(PREREG, null).ok, false);
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// THE WIRE — a REAL Ed25519 signed hop chain, same logic the /crossing page runs, proven cold in Node.
// (In the browser this is WebCrypto; here it is node:crypto. The kernel above is identical on both sides.)
// ════════════════════════════════════════════════════════════════════════════════════════════════
async function signedChain(crypto, message, nodes) {
  const chain = [];
  for (let i = 0; i < nodes.length; i++) {
    const prev = i === 0 ? '' : hopRef(chain[i - 1]);
    const hop = { seq: i, from: nodes[i].pk, to: i + 1 < nodes.length ? nodes[i + 1].pk : '', prev, payload: i === 0 ? message : '', t: i };
    hop.sig = await crypto.sign(canonical(hopBody(hop)), nodes[i].sk);
    chain.push(hop);
  }
  return chain;
}
async function verifySignedChain(crypto, chain) {
  const structural = chainLinks(chain);
  let sigsOk = true;
  for (const hop of chain) {
    const { sig, ...rest } = hop;
    const ok = await crypto.verify(canonical(hopBody(rest)), sig, hop.from);
    if (!ok) sigsOk = false;
  }
  return { structural: structural.ok, sigsOk, allValid: structural.ok && sigsOk };
}

test('a 3-node signed hop chain verifies end to end (every hop signed by its own node, every link bound)', async () => {
  const crypto = nodeCrypto();
  const A = await crypto.generate(), B = await crypto.generate(), C = await crypto.generate();
  assert.notEqual(A.pk, B.pk); assert.notEqual(B.pk, C.pk);       // three genuinely independent identities
  const chain = await signedChain(crypto, 'relay this across the mesh', [A, B, C]);
  assert.equal(chain.length, 3);
  const v = await verifySignedChain(crypto, chain);
  assert.equal(v.structural, true);
  assert.equal(v.sigsOk, true);
  assert.equal(v.allValid, true);
  assert.equal(deliveryMetrics(3, chain).complete, true);
});

test('tampering a middle hop breaks BOTH the signature and the chain link (tamper-evident)', async () => {
  const crypto = nodeCrypto();
  const A = await crypto.generate(), B = await crypto.generate(), C = await crypto.generate();
  const chain = await signedChain(crypto, 'the original message', [A, B, C]);
  chain[0].payload = 'a swapped message';                        // rewrite the origin payload after signing
  const v = await verifySignedChain(crypto, chain);
  assert.equal(v.sigsOk, false);                                 // hop 0's signature no longer covers its body
  assert.equal(v.structural, false);                             // hop 1's prev no longer matches hop 0's ref
  assert.equal(chainLinks(chain).brokenAt, 1);
});

test('a forged hop (signed by the wrong key / an outsider) is rejected', async () => {
  const crypto = nodeCrypto();
  const A = await crypto.generate(), B = await crypto.generate(), evil = await crypto.generate();
  const chain = await signedChain(crypto, 'legit', [A, B]);
  // an attacker rewrites hop 1 to claim it came from B, signing with their OWN key but keeping B's pk in `from`
  const forged = { ...chain[1] };
  forged.sig = await crypto.sign(canonical(hopBody(forged)), evil.sk);   // wrong signer
  chain[1] = forged;
  const v = await verifySignedChain(crypto, chain);
  assert.equal(v.sigsOk, false);                                 // sig does not verify under the claimed `from`
});
