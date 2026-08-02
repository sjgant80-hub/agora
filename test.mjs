// test.mjs — PROOF-OF-PLAY for AGORA, the personal sovereign agent-economy. Zero tokens. REAL Ed25519.
// Proves: agents hold value + transact with SIGNED, non-forgeable transfers; VALUE IS CONSERVED (no printing);
// NO overdraft / double-spend; you EARN only by doing verified work (a wrong answer is not paid); the ledger
// is HASH-CHAINED + tamper-evident; and — the flag — the economy RUNS: value flows between agents over ticks,
// conservation holding the whole time. All on one machine, no network (checkable).
import { readFileSync } from 'node:fs';
import { genesis, transfer, postJob, claimJob, completeJob, tick, verifyLedger, balances, doWork } from './agora.mjs';
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

console.log('\n' + (fail === 0
  ? `=== ✅ AGORA BREATHES — agents earn, spend, transact; value conserved + signed; a sovereign economy on your machine · ${pass}/${pass} · zero tokens ===`
  : `=== ✗ ${fail} FAILED (${pass} passed) ===`));
process.exit(fail === 0 ? 0 : 1);
