// hopchain-kernel.mjs — the PURE invariants of a SIGNED RELAY HOP CHAIN (witness-gated).
//
// The honest gap this closes: the estate's mesh has been "proven" only on ONE laptop talking to itself. A
// real mesh relays a message through independent nodes on independent networks. This kernel is the logic that
// makes such a relay TRUSTABLE without trusting any machine in the middle:
//
//   • every hop is SIGNED by the node that forwarded it (the wire, in the page / in Node, uses real Ed25519);
//   • every hop COMMITS to the exact previous hop (prev = the canonical ref of hop n-1) — so a hop cannot be
//     reordered, dropped, duplicated, or forged into the middle without breaking the chain (tamper-evident);
//   • delivery and per-hop LATENCY are measured deterministically, so a cross-machine run is a measurement,
//     never a vibe.
//
// This kernel is the STRUCTURAL binding only — the signature check is the wire part (verified against public
// keys in the page and in hopchain.test.mjs). It composes the estate's proven wallet canonicaliser so a hop's
// bytes are canonical in exactly the same way as every other signed token in the estate.
//
// meshos (the estate's p2p relay) does friend-of-a-friend delivery but its README is honest that inner
// authorship "is claimed by the envelope, not yet proven (inner signatures are v2)". This kernel IS that v2:
// per-hop signatures over a chained body. Composes the-wallet (Thomas Frumkin's Konomi architecture); the
// mesh/relay lineage builds on Gary W. Floyd's work.
import { canonical } from './wallet.mjs';

// A hop (before the wire adds `sig`):
//   { seq, from, to, prev, payload, t }
// seq   — 0-based position in the chain (the origin is seq 0)
// from  — the public key of the node that produced/forwarded this hop
// to    — the public key this hop is handed to next ('' at the terminal hop)
// prev  — the canonical ref (hopRef) of hop seq-1, or '' for the origin
// payload — the carried message bytes (the origin carries the real message; relays may carry '')
// t     — a monotonic logical mark (nonce / ms) so two otherwise-identical hops differ

// hopBody — the exact, order-independent fields a hop's signature covers and the next hop commits to.
// Everything that matters to the chain is in here; `sig` is deliberately NOT (you can't sign your own sig).
export function hopBody(hop) {
  if (!hop || typeof hop !== 'object') return null;
  return {
    seq: Number(hop.seq),
    from: String(hop.from ?? ''),
    to: String(hop.to ?? ''),
    prev: String(hop.prev ?? ''),
    payload: String(hop.payload ?? ''),
    t: Number(hop.t ?? 0),
  };
}

// hopRef — the canonical bytes of a hop body. The NEXT hop's `prev` must equal this exactly. Change one byte
// of any field (payload, from, seq, t…) and the ref changes, so the next hop no longer links: tamper-evident.
export function hopRef(hop) {
  const b = hopBody(hop);
  return b ? canonical(b) : '';
}

// originOk — a valid chain head: seq 0 with an empty prev (it commits to nothing before it).
export function originOk(hop) {
  return !!hop && typeof hop === 'object' && Number.isInteger(hop.seq) && hop.seq === 0 && String(hop.prev ?? '') === '';
}

// linkOk — does `hop` chain correctly onto `prev`? The seq advances by exactly one AND hop.prev commits to
// the canonical ref of `prev`. This is the anti-reorder / anti-drop / anti-inject invariant. The sequence
// step (hop.seq one past prev.seq) and the hash binding (hop.prev equals hopRef of prev) are the two
// load-bearing checks; a null or scalar prev/hop falls out of one of them as false without a throw, so no
// redundant type-guard is needed.
export function linkOk(prev, hop) {
  if (!prev || !hop) return false;
  if (hop.seq !== prev.seq + 1) return false;
  return String(hop.prev ?? '') === hopRef(prev);
}

// chainLinks — verify the whole chain's structural binding (NOT the signatures — that is the wire). Returns
// { ok, n, brokenAt }: brokenAt is the seq index where linking first fails, or -1 when the chain is sound.
export function chainLinks(chain) {
  if (!Array.isArray(chain) || chain.length === 0) return { ok: false, n: 0, brokenAt: 0 };
  if (!originOk(chain[0])) return { ok: false, n: chain.length, brokenAt: 0 };
  for (let i = 1; i < chain.length; i++) {
    if (!linkOk(chain[i - 1], chain[i])) return { ok: false, n: chain.length, brokenAt: i };
  }
  return { ok: true, n: chain.length, brokenAt: -1 };
}

// deliveryMetrics — did the chain actually arrive whole? `expected` is the hop count the run set out to make.
export function deliveryMetrics(expected, chain) {
  const exp = Number(expected);
  const delivered = Array.isArray(chain) ? chain.length : 0;
  const links = chainLinks(chain);
  const complete = links.ok && Number.isFinite(exp) && exp > 0 && delivered >= exp;
  return { expected: Number.isFinite(exp) ? exp : 0, delivered, linked: links.ok, brokenAt: links.brokenAt, complete };
}

// hopLatencies — per-hop latency in ms from paired send/recv marks. A hop with a bad or out-of-order pair
// yields null (unmeasured), never a lie and never a throw. hops: [{ sentAt, recvAt }].
export function hopLatencies(hops) {
  if (!Array.isArray(hops)) return [];
  const out = [];
  for (const h of hops) {
    const s = Number(h && h.sentAt);
    const r = Number(h && h.recvAt);
    out.push(Number.isFinite(s) && Number.isFinite(r) && r >= s ? r - s : null);
  }
  return out;
}

// latencyStats — min / max / mean / median over the finite latencies (nulls skipped). Deterministic.
export function latencyStats(xs) {
  const v = (Array.isArray(xs) ? xs : []).filter((x) => Number.isFinite(x)).slice().sort((a, b) => a - b);
  if (v.length === 0) return { n: 0, min: null, max: null, mean: null, median: null };
  let sum = 0;
  for (const x of v) sum += x;
  const mid = Math.floor(v.length / 2);
  const median = v.length % 2 === 1 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
  return { n: v.length, min: v[0], max: v[v.length - 1], mean: sum / v.length, median };
}

// evalPrereg — MEASURE-ONLY. Compare a measured run to the thresholds registered BEFORE the run. No field
// here can be nudged after the fact: the page reads the committed prereg.json and the measured numbers and
// this function decides PASS/FAIL per criterion. A FAIL is a fine, honest outcome — it is reported, not hidden.
//   prereg:   { minHops, maxMedianLatencyMs, requireDelivery, requireTwoNetworks }
//   measured: { hops, medianLatencyMs, delivered, complete, twoNetworks, chainLinked }
export function evalPrereg(prereg, measured) {
  if (!prereg || typeof prereg !== 'object' || !measured || typeof measured !== 'object') {
    return { ok: false, pass: false, criteria: [], why: 'missing prereg or measured input' };
  }
  const criteria = [];
  const add = (name, pass, detail) => criteria.push({ name, pass: pass === true, detail: String(detail) });

  add('hops ≥ minHops', Number(measured.hops) >= Number(prereg.minHops),
      `${measured.hops} of ${prereg.minHops} required`);
  add('chain cryptographically linked (no broken/forged hop)', measured.chainLinked === true,
      measured.chainLinked);
  if (prereg.requireDelivery) {
    add('all hops delivered end to end', measured.complete === true, measured.complete);
  }
  add('median hop latency ≤ cap', Number.isFinite(Number(measured.medianLatencyMs)) && Number(measured.medianLatencyMs) <= Number(prereg.maxMedianLatencyMs),
      `${measured.medianLatencyMs}ms of ${prereg.maxMedianLatencyMs}ms cap`);
  if (prereg.requireTwoNetworks) {
    add('two distinct physical networks (real NAT traversal)', measured.twoNetworks === true,
        measured.twoNetworks);
  }

  let pass = true;
  for (const c of criteria) if (!c.pass) pass = false;
  return { ok: true, pass, criteria };
}

export default {
  hopBody, hopRef, originOk, linkOk, chainLinks,
  deliveryMetrics, hopLatencies, latencyStats, evalPrereg,
};
