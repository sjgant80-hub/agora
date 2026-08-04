// test.mjs — PROOF-OF-PLAY for AGORA, the personal sovereign agent-economy. Zero tokens. REAL Ed25519.
// Proves: agents hold value + transact with SIGNED, non-forgeable transfers; VALUE IS CONSERVED (no printing);
// NO overdraft / double-spend; you EARN only by doing verified work (a wrong answer is not paid); the ledger
// is HASH-CHAINED + tamper-evident; and — the flag — the economy RUNS: value flows between agents over ticks,
// conservation holding the whole time. All on one machine, no network (checkable).
import { readFileSync } from 'node:fs';
import { genesis, transfer, postJob, claimJob, completeJob, tick, verifyLedger, balances, doWork, h16, canonical, WORKS } from './agora.mjs';
import { nodeCrypto } from './crypto-node.mjs';

const C = nodeCrypto();
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ FAIL ') + m); };
// each agent gets a real Ed25519 keypair; the economy signs spends with the spender's key
async function keys(ids) { const k = {}; for (const id of ids) k[id] = await C.generate(); return k; }
const ctxOf = (K, econ) => id => ({ crypto: C, sk: K[id]?.sk });

console.log('=== §1 · GENESIS — agents hold value; the supply is minted once ===');
{
  const e = genesis([{ id: 'a', balance: 30 }, { id: 'b', balance: 20 }]);
  ok(e.supply === 50 && e.agents.get('a').balance === 30, 'agents minted with starting value; supply = 50');
  ok((await verifyLedger(e)).ok, 'the genesis ledger verifies');
}

console.log('\n=== §2 · SIGNED TRANSFER — real Ed25519; a forged or tampered entry is rejected ===');
{
  const K = await keys(['a', 'b']);
  const e = genesis([{ id: 'a', balance: 30, pk: K.a.pk }, { id: 'b', balance: 20, pk: K.b.pk }]);
  const t = await transfer(e, 'a', 'b', 12, 'thanks', { crypto: C, sk: K.a.sk });
  ok(t.ok && e.agents.get('a').balance === 18 && e.agents.get('b').balance === 32, 'a signed transfer moves value (a:30→18, b:20→32)');
  ok((await verifyLedger(e, { crypto: C })).ok, 'the ledger verifies with real signatures');
  const forged = { ...e }; forged.ledger = e.ledger.slice(); forged.ledger[1] = { ...e.ledger[1], sig: e.ledger[1].sig.replace(/^../, '00') };
  ok(!(await verifyLedger(forged, { crypto: C })).ok, 'a FORGED signature is rejected');
  const tampered = { ...e }; tampered.ledger = e.ledger.slice(); tampered.ledger[1] = { ...e.ledger[1], amount: 999 };
  ok(!(await verifyLedger(tampered, { crypto: C })).ok, 'a TAMPERED amount (12→999) breaks the entry hash → rejected');
}

console.log('\n=== §3 · NO OVERDRAFT / NO DOUBLE-SPEND ===');
{
  const K = await keys(['a', 'b']);
  const e = genesis([{ id: 'a', balance: 10 }, { id: 'b', balance: 0 }]);
  ok(!(await transfer(e, 'a', 'b', 25, '', { crypto: C, sk: K.a.sk })).ok, 'a transfer beyond the balance is REFUSED (no overdraft)');
  await transfer(e, 'a', 'b', 10, '', { crypto: C, sk: K.a.sk });
  ok(e.agents.get('a').balance === 0 && !(await transfer(e, 'a', 'b', 10, '', { crypto: C, sk: K.a.sk })).ok, 'having spent its 10, a cannot spend it again (no double-spend)');
}

console.log('\n=== §4 · CONSERVATION — value is never printed or lost ===');
{
  const K = await keys(['a', 'b', 'c']);
  const e = genesis([{ id: 'a', balance: 40, pk: K.a.pk }, { id: 'b', balance: 30, pk: K.b.pk }, { id: 'c', balance: 30, pk: K.c.pk }]);
  for (let i = 0; i < 20; i++) { const ids = ['a', 'b', 'c']; const f = ids[i % 3], to = ids[(i + 1) % 3]; await transfer(e, f, to, 1 + (i % 5), '', { crypto: C, sk: K[f].sk }); }
  const total = Object.values(balances(e)).reduce((s, x) => s + x, 0);
  ok(total === 100, `after 20 transfers total value is still exactly the minted supply (${total} = 100)`);
  ok((await verifyLedger(e, { crypto: C })).ok, 'the ledger still verifies (chain + sigs + conservation)');
}

console.log('\n=== §5 · EARN BY WORK — you are paid ONLY for a verified, correct result ===');
{
  const K = await keys(['boss', 'worker']);
  const e = genesis([{ id: 'boss', balance: 20, wants: ['primes'] }, { id: 'worker', balance: 5, skills: ['primes'] }]);
  const job = (await postJob(e, 'boss', 'primes', 8, 10, { crypto: C, sk: K.boss.sk })).job;
  ok(e.agents.get('boss').balance === 10 && e.agents.get('escrow').balance === 10, 'posting a job ESCROWS the bounty (boss 20→10, escrow holds 10)');
  claimJob(e, job.id, 'worker');
  const wrong = await completeJob(e, job.id, 'i did not actually compute this');
  ok(!wrong.ok && e.agents.get('worker').balance === 5, 'a WRONG result is NOT paid — you cannot earn without doing the work');
  // re-post + do it right
  const job2 = (await postJob(e, 'boss', 'primes', 8, 10, { crypto: C, sk: K.boss.sk })).job; claimJob(e, job2.id, 'worker');
  const right = await completeJob(e, job2.id, doWork('primes', 8));
  ok(right.ok && e.agents.get('worker').balance === 15, 'the CORRECT result is paid (worker 5→15) — earning requires real work');
}

console.log('\n=== §6 · TAMPER-EVIDENT LEDGER — break any link and verification fails ===');
{
  const K = await keys(['a', 'b']);
  const e = genesis([{ id: 'a', balance: 50, pk: K.a.pk }, { id: 'b', balance: 0, pk: K.b.pk }]);
  for (let i = 0; i < 4; i++) await transfer(e, 'a', 'b', 5, 'x' + i, { crypto: C, sk: K.a.sk });
  ok((await verifyLedger(e, { crypto: C })).ok, 'a clean 5-entry chain verifies');
  const cut = { ...e, ledger: e.ledger.slice() }; cut.ledger[2] = { ...cut.ledger[2], prevHash: 'deadbeefdeadbeef' };
  ok(!(await verifyLedger(cut, { crypto: C })).ok, 'altering one prev-hash breaks the chain → rejected');
}

console.log('\n=== §7 · THE ECONOMY RUNS — value flows between agents, conservation holding ===');
{
  const K = await keys(['alice', 'bob']);
  // a circular economy: alice buys primes + sells sort; bob buys sort + sells primes
  const e = genesis([{ id: 'alice', balance: 40, pk: K.alice.pk, wants: ['primes'], skills: ['sort'] }, { id: 'bob', balance: 40, pk: K.bob.pk, wants: ['sort'], skills: ['primes'] }]);
  let posted = 0, earned = 0;
  for (let i = 0; i < 6; i++) { const ev = await tick(e, ctxOf(K, e)); posted += ev.filter(x => x.t === 'posted').length; earned += ev.filter(x => x.t === 'earned').length; const v = await verifyLedger(e, { crypto: C }); if (!v.ok) { ok(false, 'conservation broke mid-run: ' + v.why); break; } }
  ok(posted > 0 && earned > 0, `over 6 ticks the market moved: ${posted} jobs posted, ${earned} completed + paid`);
  ok(e.agents.get('alice').earned > 0 && e.agents.get('bob').earned > 0, `BOTH agents earned by working (alice +${e.agents.get('alice').earned}, bob +${e.agents.get('bob').earned}) — value circulated`);
  const v = await verifyLedger(e, { crypto: C });
  ok(v.ok && Object.values(balances(e)).reduce((s, x) => s + x, 0) === 80, `a breathing economy, and value STILL conserved (80) across ${v.entries} ledger entries`);
}

console.log('\n=== §7½ · CONCURRENCY — overlapping signed transfers stay a valid chain (a running economy overlaps ticks) ===');
{
  // REGRESSION WITNESS: signing is async, so a running economy fires transfers that OVERLAP across the await.
  // Before the ledger lock this raced — each signed for the same tip then appended at different positions, so
  // verify reported "bad signature". This fires many concurrent signed transfers AND overlapping ticks and
  // asserts the chain still verifies. (Reproduced the red on 2026-08-02: "bad signature at 2".)
  const K = await keys(['a', 'b', 'c']);
  const e = genesis([
    { id: 'a', balance: 40, pk: K.a.pk, wants: ['fib'], skills: ['primes'] },
    { id: 'b', balance: 40, pk: K.b.pk, wants: ['primes'], skills: ['fib'] },
    { id: 'c', balance: 40, pk: K.c.pk, wants: ['sort'], skills: ['sort'] },
  ]);
  // burst of directly-concurrent SIGNED transfers (the exact overlap that used to break verify)
  await Promise.all([
    transfer(e, 'a', 'b', 1, 'x', { crypto: C, sk: K.a.sk }),
    transfer(e, 'b', 'a', 1, 'y', { crypto: C, sk: K.b.sk }),
    transfer(e, 'a', 'c', 1, 'z', { crypto: C, sk: K.a.sk }),
    transfer(e, 'c', 'b', 1, 'w', { crypto: C, sk: K.c.sk }),
    transfer(e, 'b', 'c', 1, 'u', { crypto: C, sk: K.b.sk }),
  ]);
  const vb = await verifyLedger(e, { crypto: C });
  ok(vb.ok, `5 concurrent signed transfers still form a valid, signed, conserved chain (${vb.entries} entries)` + (vb.ok ? '' : ' — ' + vb.why));
  // overlapping TICKS (fire several ticks without awaiting between them, as a fast run loop would)
  await Promise.all([0, 1, 2, 3].map(() => tick(e, ctxOf(K, e))));
  const seqs = e.ledger.map(x => x.seq);
  ok(new Set(seqs).size === seqs.length && seqs.every((s, i) => s === i), 'every ledger entry has a unique, gap-free seq (no two transfers grabbed the same slot)');
  const vt = await verifyLedger(e, { crypto: C });
  ok(vt.ok, `after overlapping ticks the ledger still verifies end-to-end (chain + every signature + conservation)` + (vt.ok ? '' : ' — ' + vt.why));
}

console.log('\n=== §8 · SOVEREIGN — the engine has NO network primitive (no cloud, no chain you don\'t control) ===');
{
  const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, '');
  const src = strip(readFileSync(new URL('./agora.mjs', import.meta.url), 'utf8')) + strip(readFileSync(new URL('./crypto-node.mjs', import.meta.url), 'utf8'));
  const NET = [/\bfetch\s*\(/, /\bWebSocket\b/, /\bRTCPeerConnection\b/, /\bXMLHttpRequest\b/, /\bEventSource\b/, /sendBeacon/, /\bWebTransport\b/, /require\s*\(\s*['"](net|http|https|ws|dgram)/];
  const found = NET.filter(re => re.test(src)).map(re => re.source);
  ok(found.length === 0, `the economy engine touches NO network — it runs entirely on your machine (found: ${found.join(', ') || 'nothing'})`);
}

console.log('\n=== §9 · DETERMINISM + FUZZ ===');
{
  const run = async () => { const K = await keys(['x', 'y']); const e = genesis([{ id: 'x', balance: 30, pk: K.x.pk, wants: ['fib'], skills: ['sum'] }, { id: 'y', balance: 30, pk: K.y.pk, wants: ['sum'], skills: ['fib'] }]); for (let i = 0; i < 4; i++) await tick(e, ctxOf(K, e)); return (await verifyLedger(e, { crypto: C })).ok; };
  ok((await run()) && (await run()), 'the economy runs cleanly on repeat (verifies each time)');
  let threw = false;
  try { const e = genesis([{ id: 'a', balance: 5 }]); await transfer(e, 'a', 'nobody', 1); await transfer(e, 'ghost', 'a', 1); await postJob(e, 'a', 'nope', 1, 1); await completeJob(e, 999, 'x'); await tick(e); } catch ( err) { threw = true; console.log('    threw:', err.message); }
  ok(!threw, 'garbage ops (unknown agents, missing work, bad job ids) never throw');
}

console.log('\n=== §10 · GATE — boundary + product-output assertions that pin every guarded line (kill test-theatre) ===');
{
  // ── h16 fixed vector: the content hash is pinned, so ANY change to its mixing loop is observable (line 12) ──
  ok(h16('agora-witness-vector') === '9c18eb439ddf69cb', 'h16 matches its fixed vector — the hash mixing loop is pinned end-to-end');

  // ── canonical is the deterministic signing-bytes function: it SORTS keys and passes primitives through (line 13) ──
  ok(canonical({ b: 2, a: 1 }) === '{"a":1,"b":2}', 'canonical SORTS object keys (a signature covers stable bytes, not insertion order)');
  ok(canonical(5) === '5', 'canonical passes a primitive straight through (the typeof-object guard, not the object branch)');

  // ── WORKS fixed vectors: the real work is pinned, so a broken loop bound / default is caught (lines 17,18) ──
  ok(WORKS.primes(8) === '2,3,5,7,11,13,17,19', 'primes(8) is EXACTLY the first 8 primes (trial-division bound + count + default all pinned)');
  ok(WORKS.fib(8) === '0,1,1,2,3,5,8,13', 'fib(8) is EXACTLY the first 8 Fibonacci numbers (loop bound + default pinned)');

  // ── amount>0 boundary: a zero-value transfer is refused, nothing moves (line 50) ──
  {
    const e = genesis([{ id: 'a', balance: 10 }, { id: 'b', balance: 0 }]);
    ok(!(await transfer(e, 'a', 'b', 0, '')).ok && e.agents.get('a').balance === 10, 'a ZERO-value transfer is REFUSED (amount>0 boundary; nothing moves)');
  }

  // ── memo is recorded verbatim on the entry (line 51 String(memo || '')) ──
  {
    const e = genesis([{ id: 'a', balance: 10 }, { id: 'b', balance: 0 }]);
    const t = await transfer(e, 'a', 'b', 3, 'hello');
    ok(t.ok && t.entry.memo === 'hello', 'the transfer memo is recorded verbatim on the ledger entry');
  }

  // ── the overdraft refusal names the shortfall as "balance < amount" (line 54 template ` < `) ──
  {
    const e = genesis([{ id: 'a', balance: 10 }, { id: 'b', balance: 0 }]);
    const t = await transfer(e, 'a', 'b', 999, '');
    ok(!t.ok && t.why.includes(' < '), 'the overdraft refusal reports the shortfall as "balance < amount"');
  }

  // ── claimJob guard: a missing job OR a missing worker is refused — never crashes (line 73 || ||) ──
  {
    const e = genesis([{ id: 'p', balance: 20 }, { id: 'w', balance: 5, skills: ['primes'] }]);
    await postJob(e, 'p', 'primes', 8, 5);
    ok(!claimJob(e, 99999, 'w').ok, 'claiming a NON-EXISTENT job is refused (guard short-circuits, no crash)');
    ok(!claimJob(e, 0, 'ghost').ok, 'a NON-EXISTENT worker cannot claim an open job (guard short-circuits, no crash)');
  }

  // ── tick posts at EXACTLY the affordable balance (line 94 balance >= bounty) ──
  {
    const e = genesis([{ id: 'c', balance: 5, wants: ['primes'] }]);
    await tick(e);
    ok(e.jobs.length === 1, 'an agent with balance EXACTLY the bounty (5) still posts its want (>= boundary)');
  }

  // ── tick DEDUP: an OPEN want is not re-posted next tick (line 93 poster===/work===/status===open/||, line 94 &&) ──
  {
    const e = genesis([{ id: 'c', balance: 100, wants: ['primes'] }]);   // no worker → the job stays OPEN forever
    await tick(e); await tick(e);
    ok(e.jobs.length === 1, 'a want with an OPEN job is NOT re-posted next tick (dedup on poster ∧ work ∧ open)');
  }

  // ── tick DEDUP holds while the job is CLAIMED too (line 93 status === 'claimed') ──
  {
    const e = genesis([{ id: 'c', balance: 100, wants: ['primes'] }, { id: 'wk', balance: 0, skills: ['primes'] }]);
    await postJob(e, 'c', 'primes', 8, 5);
    claimJob(e, 0, 'wk');                                                 // the job is now CLAIMED, not open
    await tick(e);
    ok(e.jobs.length === 1, 'a want whose job is CLAIMED is NOT re-posted (dedup covers claimed, not only open)');
  }

  // ── tick DEDUP keys on WORK too: holding a primes job does NOT suppress posting a fib want (line 93 && &&) ──
  {
    const e = genesis([{ id: 'c', balance: 100, wants: ['fib'] }]);
    await postJob(e, 'c', 'primes', 8, 5);                               // c holds an OPEN primes job (a different work)
    await tick(e);
    ok(e.jobs.length === 2, 'holding a primes job does NOT block posting the DIFFERENT fib want (dedup keys on work, not just poster)');
  }

  // ── tick producer picks a SKILLED non-poster worker, skipping an unskilled non-poster (line 98 &&) ──
  {
    const e = genesis([
      { id: 'p', balance: 20, wants: ['primes'] },
      { id: 'x', balance: 5, skills: [] },            // NOT the poster, but UNSKILLED — must be skipped
      { id: 'y', balance: 5, skills: ['primes'] },    // the real worker, reached only past x
    ]);
    await tick(e);
    ok(e.agents.get('y').earned === 5, 'the SKILLED worker earns the bounty; an unskilled non-poster is NOT mistakenly chosen (worker = ¬poster ∧ skilled)');
  }

  // ── verifyLedger rejects a first entry that is not genesis (line 106 ||) ──
  {
    const e = genesis([{ id: 'a', balance: 10 }]);
    e.ledger[0] = { ...e.ledger[0], type: 'notgenesis' };
    ok(!(await verifyLedger(e)).ok, 'a ledger whose FIRST entry is not genesis is rejected');
  }

  // ── verifyLedger REJECTS (does not crash on) a signed entry whose signer is unknown (line 114 ||) ──
  {
    const K = await keys(['a', 'b']);
    const e = genesis([{ id: 'a', balance: 10, pk: K.a.pk }, { id: 'b', balance: 0, pk: K.b.pk }]);
    await transfer(e, 'a', 'b', 5, 'm', { crypto: C, sk: K.a.sk });
    e.agents.delete('a');                                                // the signer is no longer a known agent
    ok(!(await verifyLedger(e, { crypto: C })).ok, 'a signed entry from an UNKNOWN signer is REJECTED, not crashed (the no-pubkey guard must fire before verify)');
  }
}

console.log('\n' + (fail === 0
  ? `=== ✅ AGORA BREATHES — agents earn, spend, transact; value conserved + signed; a sovereign economy on your machine · ${pass}/${pass} · zero tokens ===`
  : `=== ✗ ${fail} FAILED (${pass} passed) ===`));
process.exit(fail === 0 ? 0 : 1);
