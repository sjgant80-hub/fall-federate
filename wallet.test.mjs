// test.mjs — PROOF-OF-PLAY for THE WALLET (the Seal's LINEAGE socket). REAL Ed25519 (node:crypto).
// The headline: a Seal with a signed budget CANNOT exceed it — the 2.2M-token leak becomes impossible,
// not by policy but by construction. Plus: forged sigs rejected, capability attenuation, verifiable
// lineage, bounded upstream credit, and a reference monitor that never runs an unauthorized action.
import { genesis, authorize, verifyToken, delegate, verifyCert, fork, verifyLineage, lineageSplit, guard, canonical, canDo, KAPPA } from './wallet.mjs';
import { nodeCrypto } from './crypto-node.mjs';

const C = nodeCrypto();
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ FAIL ') + m); };

console.log('=== §1 · GENESIS + AUTHORIZE — a wallet mints, acts within budget, the token verifies (real Ed25519) ===');
{
  const { wallet, sk } = await genesis(C, { caps: ['spend-tokens', 'http-get'], budget: 100 });
  ok(wallet.id === wallet.pk && wallet.id.length > 20, `wallet minted · id = pubkey (${wallet.id.slice(0, 16)}…)`);
  const a = await authorize(C, wallet, sk, { type: 'spend-tokens', cost: 30 });
  ok(a.ok && a.wallet.budget.spent === 30, 'authorize within budget → signed token, spent = 30');
  ok((await verifyToken(C, a.token)).ok, 'the signed token verifies (real Ed25519 signature)');
}

console.log('\n=== §2 · THE LEAK IS IMPOSSIBLE — a 100-unit budget cannot spend 101 ===');
{
  let { wallet, sk } = await genesis(C, { caps: ['spend-tokens'], budget: 100 });
  let done = 0;
  for (let i = 0; i < 100; i++) { const a = await authorize(C, wallet, sk, { type: 'spend-tokens', cost: 1 }); if (a.ok) { wallet = a.wallet; done++; } }
  ok(done === 100 && wallet.budget.spent === 100, `100 unit-actions authorized, spent = 100/100`);
  const over = await authorize(C, wallet, sk, { type: 'spend-tokens', cost: 1 });
  ok(!over.ok && /over budget/.test(over.why), `the 101st action is REFUSED (${over.why}) — the 2.2M leak is architecturally impossible`);
  const bigJump = await authorize(C, (await genesis(C, { caps: ['spend-tokens'], budget: 100000 })).wallet, sk, { type: 'spend-tokens', cost: 2200000 });
  ok(!bigJump.ok, 'a single 2.2M-cost action against a 100k budget is REFUSED outright');
}

console.log('\n=== §3 · CAPABILITY — an action whose type is not held is refused ===');
{
  const { wallet, sk } = await genesis(C, { caps: ['http-get'], budget: 100 });
  const a = await authorize(C, wallet, sk, { type: 'send-email', cost: 1 });
  ok(!a.ok && /capability not held/.test(a.why), `send-email refused for an http-get-only wallet (${a.why})`);
}

console.log('\n=== §4 · FORGED / TAMPERED TOKENS — rejected by real signature verification ===');
{
  const { wallet, sk } = await genesis(C, { caps: ['x'], budget: 100 });
  const a = await authorize(C, wallet, sk, { type: 'x', cost: 5 });
  const forged = { ...a.token, sig: a.token.sig.replace(/^../, '00') };
  ok(!(await verifyToken(C, forged)).ok, 'a token with a flipped signature is REJECTED');
  const tampered = { ...a.token, cost: 1 };   // same sig, changed body → sig no longer matches the bytes
  ok(!(await verifyToken(C, tampered)).ok, 'a token with a tampered body (cost 5→1) is REJECTED (sig binds the body)');
  const lie = { ...a.token, spentAfter: 999, budgetTotal: 100 };
  ok(!(await verifyToken(C, lie)).ok, 'a token asserting an over-budget spend is REJECTED');
}

console.log('\n=== §5 · ATTENUATION — a child can only be granted a SUBSET of what the parent holds ===');
{
  const { wallet: parent, sk } = await genesis(C, { caps: ['read', 'write'], budget: 100 });
  const childId = (await genesis(C, {})).wallet.id;
  const good = await delegate(C, parent, sk, childId, { caps: ['read'], budget: 40 });
  ok(good.ok && (await verifyCert(C, good.cert)).ok, 'delegate a held capability + affordable budget → signed, verifiable cert');
  const tooMuchCap = await delegate(C, parent, sk, childId, { caps: ['read', 'admin'], budget: 10 });
  ok(!tooMuchCap.ok, `cannot delegate a capability the parent lacks (${tooMuchCap.why})`);
  const tooMuchBudget = await delegate(C, parent, sk, childId, { caps: ['read'], budget: 500 });
  ok(!tooMuchBudget.ok, `cannot delegate more budget than the parent's remaining (${tooMuchBudget.why})`);
}

console.log('\n=== §6 · FORK = LINEAGE — the fork IS the child wallet, with verifiable birth (§19) ===');
{
  const { wallet: parent, sk } = await genesis(C, { caps: ['*'], budget: 1000 });
  const { child, birthCert } = await fork(C, parent, sk, { caps: ['read'], budget: 100 });
  ok(child.lineage.parent === parent.id && child.lineage.root === parent.lineage.root && child.lineage.depth === 1, 'child links to parent · root preserved · depth = 1');
  ok((await verifyLineage(C, birthCert)).ok, 'the birth certificate verifies (lineage is proven, not asserted)');
  const faked = { ...birthCert, child: 'imposter' };
  ok(!(await verifyLineage(C, faked)).ok, 'a forged birth cert (swapped child) is REJECTED');
}

console.log('\n=== §7 · UPSTREAM CREDIT — value flows up the lineage, BOUNDED by construction ===');
{
  const r = lineageSplit(5, 100);
  ok(Math.abs(r.self - 100) < 1e-9 && Math.abs(r.split[1].share - 100 * KAPPA) < 1e-9, 'the earner keeps 100 (self); level-1 upstream = 100·0.618 (each level decays)');
  ok(r.withinBound && r.upstreamTotal <= r.upstreamBound + 1e-9, `upstream credit ${r.upstreamTotal.toFixed(2)} ≤ bound ${r.upstreamBound.toFixed(2)} (= value·φ · payout can never run away)`);
  const deep = lineageSplit(50, 100);
  ok(deep.upstreamTotal <= deep.upstreamBound + 1e-9, 'even at depth 50 the upstream total stays under value·φ (convergent)');
}

console.log('\n=== §8 · REFERENCE MONITOR — an unauthorized action NEVER runs ===');
{
  const { wallet, sk } = await genesis(C, { caps: ['work'], budget: 3 });
  const ctx = { wallet, sk };
  let ran = 0;
  const results = [];
  for (let i = 0; i < 5; i++) results.push(await guard(C, ctx, { type: 'work', cost: 1 }, () => { ran++; return i; }));
  ok(ran === 3, `fn executed exactly 3 times (budget = 3), not 5 — the 4th and 5th never ran (ran=${ran})`);
  ok(results.filter(r => r.ran).length === 3 && results.slice(3).every(r => !r.ran), 'guard reports ran:true for the first 3, ran:false (refused) after');
}

console.log('\n=== §9 · FUZZ — spent never exceeds total, nothing throws ===');
{
  let threw = false, maxSeen = 0, viol = 0, seed = 0x1a2b3c4d >>> 0;
  const rnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed >>> 0; };
  try {
    for (let t = 0; t < 200; t++) {
      let { wallet, sk } = await genesis(C, { caps: ['a', 'b'], budget: 50 });
      for (let i = 0; i < 80; i++) {
        const act = { type: (rnd() % 3 === 0) ? 'c' : (rnd() % 2 ? 'a' : 'b'), cost: rnd() % 12 };
        const a = await authorize(C, wallet, sk, act);
        if (a.ok) wallet = a.wallet;
        if (wallet.budget.spent > wallet.budget.total) viol++;
      }
      maxSeen = Math.max(maxSeen, wallet.budget.spent);
    }
  } catch (e) { threw = true; console.log('    threw:', e.message); }
  ok(!threw && viol === 0, `200 wallets × 80 random actions: 0 budget violations, 0 throws (max spent seen ${maxSeen} ≤ 50)`);
}

console.log('\n=== §10 · DETERMINISM — canonical signing bytes are stable regardless of key order ===');
ok(canonical({ b: 1, a: [3, { z: 1, a: 2 }] }) === canonical({ a: [3, { a: 2, z: 1 }], b: 1 }), 'canonical() sorts keys → same object, same signing bytes, forever');

console.log('\n' + (fail === 0
  ? `=== ✅ THE WALLET HOLDS — capability + budget + verifiable lineage, real Ed25519 · ${pass}/${pass} · the leak is impossible by construction ===`
  : `=== ✗ ${fail} FAILED (${pass} passed) ===`));
process.exit(fail === 0 ? 0 : 1);
