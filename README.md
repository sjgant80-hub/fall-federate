# fall-federate

### ▶ Live: https://sjgant80-hub.github.io/fall-federate/crossing/ — the cross-machine mesh test

**[Proof of play — /test](https://sjgant80-hub.github.io/fall-federate/test/)** · **[Federate with a person — /join](https://sjgant80-hub.github.io/fall-federate/join/)** · re-verify it all in your own browser.

## Cross-machine signed-hop-chain (the honest gap, closed as far as it can be)

Every prior "mesh proven" in the estate was **one laptop talking to itself** — two browser contexts, one machine, one network. The [**/crossing**](https://sjgant80-hub.github.io/fall-federate/crossing/) page closes that gap: two **physical machines on two networks** (put one on a phone hotspot — a real NAT) connect directly over WebRTC with **manual signalling + public STUN only** (no TURN, no signalling server), and relay a message as a chain of **per-hop-signed, hash-chained hops** — tamper-evident, with **measured latency and delivery**.

**What's proven now vs pending a second device:**

| | state | where |
|---|---|---|
| Signed hop-chain **kernel** (binding, tamper-evidence, delivery/latency maths, measure-only claim evaluator) | **PROVEN** — witness **45/45 killed, clean** | `hopchain-kernel.mjs` |
| The **wire, cold, in Node** (real Ed25519 3-node chain; tamper breaks sig + link; forgery rejected) | **PROVEN** | `hopchain.test.mjs` |
| The **transport + harness, same machine** (two contexts, real datachannel, signed chain) | **PROVEN** — the /crossing smoke test, labelled *not the cross-machine proof* | `/crossing` |
| **N≥2 signed hops across two physical machines on two networks**, measured latency + delivery | **PENDING a 2nd device** — **pre-registered**, measure-only | `prereg.json` |

The cross-machine run is **pre-registered** in [`prereg.json`](prereg.json) with its pass/fail thresholds fixed in advance, so that when a second device appears the run is a measurement, not a story. It **may partly fail** — most likely at connection, since STUN-only (no TURN, by sovereign choice) can't always punch two symmetric NATs. That's a reported finding, not a bug; keeping the human-join + STUN-only is the correct sovereign design. ~2-minute run; the step-by-step for a second device is on the page and below.

### The ~2-minute run (when a second device is present)
1. On **device 2** (a phone on its hotspot is the truest NAT test), open `https://sjgant80-hub.github.io/fall-federate/crossing/` — check WebRTC + Ed25519 show green.
2. On **device 1**, tap *Device 1 → Make my code → Share join link*, send it to device 2.
3. On **device 2**, open the link (auto-fills) → *Make my reply code → Share reply* back to device 1.
4. On **device 1**, paste the reply, tick *"Device 2 is on a different network"*, tap *Connect & run*.
5. The results panel fills in with measured latency + delivery and the PASS/FAIL verdict against the pre-registered claim.

---

**▶ [Proof of play — /test](https://sjgant80-hub.github.io/fall-federate/test/)** — re-verify it in your own browser.

<!-- film-2026-09 -->
**▶ [Watch the 90-second film](https://www.ai-nativesolutions.com/explainer.html#film)** — federation and the mesh, inside the whole estate · [The brochure (PDF)](https://www.ai-nativesolutions.com/fall-os-prospectus.pdf) · [Every number, sourced](https://www.ai-nativesolutions.com/explainer.html#facts)

[![Peers connecting directly with no server between](https://www.ai-nativesolutions.com/media/images/mesh-no-server.jpg)](https://www.ai-nativesolutions.com/explainer.html#film)

Minimum-viable **federation (N=2)**: two *genuinely independent* sovereign identities exchange a signed
query/answer over a **real WebRTC datachannel** and settle a **bounded provenance payout** — every signature
checkable by a third party against nothing but the public keys. Plus the estate's mutation gate run against a
**real external repo we don't own**.

This is the mechanism the whole sovereign-mesh thesis rests on, proven end to end — not loopback theatre.

## What's proven (and what still needs a second human)

- **Signed exchange, cold** — `federation.mjs` runs the full loop with real Ed25519: a seeker signs a query;
  an independent contributor (born of the estate with a verifiable birth-certificate) verifies it, answers
  from its own expertise, and signs an answer **bound to that exact query**; the seeker verifies everything;
  the value settles to the contributor with a bounded upstream provenance royalty. A third party re-verifies
  it all from the bundle alone (`evidence.json`). Tamper one byte and it fails (tested).
- **Real transport** — the `/test` page connects two identities over an actual WebRTC datachannel (STUN for
  the reflexive address — the sovereign way, no relay) and runs a fresh signed exchange live.
- **Run against others** — the estate's `witness` mutation gate was run against **left-pad** (the package that
  broke npm in 2016) using its own 35-test suite; the real result is in `witness-external.json`.
- **Still needs a second human** — the live run is two identities in one browser. The true test is a second
  person on a different machine (e.g. fork `dannydotcomdidyos`, hatch a Didy, paste an offer blob over Signal).
  And landing `witness` in an external team's CI needs a willing maintainer. The mechanism is proven; those
  two steps need a real second party.

## Proof

- `federation-kernel.mjs` — the pure federation invariants (anti-substitution binding + the bounded payout).
  **Witness v0.2: 17/17 mutants killed, score 1.0.** Composes the estate's proven wallet lineage.
- `hopchain-kernel.mjs` — the pure signed-hop-chain invariants (per-hop binding + tamper-evidence + the
  delivery/latency maths + the measure-only `evalPrereg`). **Witness v0.2: 45/45 mutants killed, score 1.0.**
- `node federation.test.mjs` / `node hopchain.test.mjs` — the kernels + real-Ed25519 integration tests +
  tamper/forgery rejection (`hopchain.test.mjs` builds a real 3-node signed chain and proves a tampered middle
  hop breaks both its signature and the chain link).
- `prereg.json` — the pre-registered cross-machine claim and thresholds (measure-only when run).
- CI runs every assertion suite and every mutation gate on every push.

## Credits

Trust rail: the estate's **witness** mutation gate — the un-forgeable proof of the code. Composes
**the-wallet** (the sovereign agent-wallet + lineage royalty). Built on the Konomi architecture, created by
**Thomas Frumkin**. Mesh, relay and reflection layers build on **Gary W. Floyd**'s work. — Kar (karma-didy)
