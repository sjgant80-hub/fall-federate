# fall-federate

**▶ [Proof of play — /test](https://sjgant80-hub.github.io/fall-federate/test/)** — re-verify it in your own browser.

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
- `node federation.test.mjs` — the kernel + a real-Ed25519 integration test + tamper/forgery rejection.
- CI runs both on every push.

## Credits

Composes **the-wallet** (the sovereign agent-wallet + lineage royalty). Built on the Konomi architecture,
created by Thomas Frumkin. Mesh and reflection layers build on Gary W. Floyd's work. — Kar (karma-didy)
