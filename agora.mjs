// agora.mjs — a PERSONAL SOVEREIGN AGENT-ECONOMY. Your own agents hold value, do work, and transact with
// each other inside your machine — no bank, no cloud, no chain you don't control. The-wallet's Ed25519
// identity made into a running micro-economy: agents EARN by doing verified work, SPEND to get work done,
// and pay each other with SIGNED, non-forgeable transfers recorded on a HASH-CHAINED sovereign ledger.
//
// HONEST SCOPE: not real money, not a cryptocurrency, not distributed trustless consensus. It is YOUR economy
// on YOUR machine (the sovereignty), with internal value units and toy-but-REAL compute. Conservation (no
// printing) and no-double-spend are provable; the trust model is "you own the engine." Pure kernel + injected
// Ed25519; the engine does NO network I/O (checkable). Node + browser, zero-dep.

// ── content hash (FNV-1a ×2 → 16 hex), and canonical JSON for signing/hashing ──
export function h16(s) { s = String(s); let a = 0x811c9dc5 >>> 0, b = 0x9e3779b9 >>> 0; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); a = Math.imul(a ^ c, 0x01000193) >>> 0; b = Math.imul((b ^ c) >>> 0, 0x85ebca6b) >>> 0; b = ((b << 13) | (b >>> 19)) >>> 0; } return (b >>> 0).toString(16).padStart(8, '0') + (a >>> 0).toString(16).padStart(8, '0'); }
export function canonical(o) { if (o === null || typeof o !== 'object') return JSON.stringify(o); if (Array.isArray(o)) return '[' + o.map(canonical).join(',') + ']'; return '{' + Object.keys(o).sort().map(k => JSON.stringify(k) + ':' + canonical(o[k])).join(',') + '}'; }

// ── the real, deterministic WORK agents do to EARN (you cannot fake it — the result is re-checked) ──
export const WORKS = {
  primes: a => { const n = Math.max(1, Math.min(40, Math.floor(+a) || 1)), out = []; for (let i = 2; out.length < n; i++) { let p = true; for (let j = 2; j * j <= i; j++) if (i % j === 0) { p = false; break; } if (p) out.push(i); } return out.join(','); },
  fib: a => { const n = Math.max(1, Math.min(40, Math.floor(+a) || 1)), out = []; let x = 0, y = 1; for (let i = 0; i < n; i++) { out.push(x);[x, y] = [y, x + y]; } return out.join(','); },
  sort: a => String(a).split(',').map(Number).filter(Number.isFinite).sort((x, y) => x - y).join(','),
  sum: a => String(String(a).split(',').map(Number).reduce((s, x) => s + (Number.isFinite(x) ? x : 0), 0)),
};
export const doWork = (name, arg) => { const fn = WORKS[name]; if (!fn) return null; try { return String(fn(arg)); } catch { return null; } };

// ══ THE ECONOMY ══
export function genesis(specs = []) {
  const agents = new Map();
  let supply = 0;
  for (const s of specs) { const a = { id: String(s.id), pk: s.pk || null, balance: Math.max(0, s.balance || 0), skills: [...(s.skills || [])], wants: [...(s.wants || [])], earned: 0, spent: 0 }; agents.set(a.id, a); supply += a.balance; }
  agents.set('escrow', { id: 'escrow', balance: 0, skills: [], wants: [], earned: 0, spent: 0, system: true });   // holds locked bounties
  const g = { seq: 0, type: 'genesis', supply, prevHash: '0'.repeat(16) }; g.hash = h16(canonical(g));
  return { agents, ledger: [g], supply, jobs: [], jobSeq: 0, tick: 0 };
}

function append(econ, body, sig = null) { const prev = econ.ledger[econ.ledger.length - 1]; const e = { ...body, seq: econ.ledger.length, prevHash: prev.hash, sig }; e.hash = h16(canonical({ ...body, seq: e.seq, prevHash: e.prevHash }) + (sig || '')); econ.ledger.push(e); return e; }

// a SIGNED transfer — the agent authorizes spending its OWN value. Conservation + no overdraft/double-spend.
export async function transfer(econ, fromId, toId, amount, memo, { crypto, sk } = {}) {
  const from = econ.agents.get(fromId), to = econ.agents.get(toId);
  if (!from || !to) return { ok: false, why: 'unknown agent' };
  amount = Math.round(amount);
  if (!(amount > 0)) return { ok: false, why: 'non-positive amount' };
  if (from.balance < amount) return { ok: false, why: `insufficient funds (${from.balance} < ${amount}) — no overdraft, no double-spend` };
  const body = { type: 'transfer', from: fromId, to: toId, amount, memo: String(memo || '') };
  const sig = crypto ? await crypto.sign(canonical({ ...body, seq: econ.ledger.length, prevHash: econ.ledger[econ.ledger.length - 1].hash }), sk) : null;
  from.balance -= amount; to.balance += amount;
  if (!from.system) from.spent += amount; if (!to.system) to.earned += amount;
  return { ok: true, entry: append(econ, body, sig) };
}

// ── the MARKET: post a job (escrow the bounty), a skilled agent claims + does it, verified payout ──
export async function postJob(econ, posterId, work, arg, bounty, ctx = {}) {
  const poster = econ.agents.get(posterId); if (!poster) return { ok: false, why: 'unknown poster' };
  if (!WORKS[work]) return { ok: false, why: 'no such work' };
  const t = await transfer(econ, posterId, 'escrow', bounty, `escrow:${work}`, ctx);   // lock the bounty (signed by poster)
  if (!t.ok) return t;
  const job = { id: econ.jobSeq++, poster: posterId, work, arg: String(arg), bounty: Math.round(bounty), status: 'open', claimant: null, result: null, correct: null };
  econ.jobs.push(job);
  return { ok: true, job };
}
export function claimJob(econ, jobId, workerId) { const job = econ.jobs.find(j => j.id === jobId); const w = econ.agents.get(workerId); if (!job || !w || job.status !== 'open') return { ok: false, why: 'unclaimable' }; if (!w.skills.includes(job.work)) return { ok: false, why: 'worker lacks the skill' }; if (workerId === job.poster) return { ok: false, why: 'cannot claim own job' }; job.status = 'claimed'; job.claimant = workerId; return { ok: true, job }; }
// the worker submits a result; the ENGINE recomputes the truth and pays ONLY if it matches (earning requires real work)
export async function completeJob(econ, jobId, submittedResult, ctx = {}) {
  const job = econ.jobs.find(j => j.id === jobId); if (!job || job.status !== 'claimed') return { ok: false, why: 'not claimed' };
  const truth = doWork(job.work, job.arg);
  job.result = String(submittedResult); job.correct = (job.result === truth);
  if (!job.correct) { job.status = 'rejected'; return { ok: false, why: 'wrong result — no pay for work not actually done', truth }; }
  const pay = await transfer(econ, 'escrow', job.claimant, job.bounty, `pay:${job.work}#${job.id}`, {});   // engine payout (verified)
  job.status = 'paid';
  return { ok: true, job, paid: job.bounty, to: job.claimant };
}

// ── ONE TICK of the economy: consumers post their wants, producers claim + do the work + get paid ──
export async function tick(econ, ctxOf = () => ({})) {
  econ.tick++;
  const events = [];
  const live = [...econ.agents.values()].filter(a => !a.system);
  // consumers: post any `want` you don't already have an open/claimed job for, if you can afford the bounty
  for (const a of live) for (const want of a.wants) {
    const bounty = 5;
    const has = econ.jobs.some(j => j.poster === a.id && j.work === want && (j.status === 'open' || j.status === 'claimed'));
    if (!has && a.balance >= bounty) { const arg = 8; const r = await postJob(econ, a.id, want, arg, bounty, ctxOf(a.id)); if (r.ok) events.push({ t: 'posted', by: a.id, work: want, bounty }); }
  }
  // producers: claim the oldest open job you can do, do the real work, get paid
  for (const job of econ.jobs.filter(j => j.status === 'open')) {
    const worker = live.find(a => a.id !== job.poster && a.skills.includes(job.work));
    if (worker) { const c = claimJob(econ, job.id, worker.id); if (c.ok) { const result = doWork(job.work, job.arg); const done = await completeJob(econ, job.id, result); if (done.ok) events.push({ t: 'earned', by: worker.id, from: job.poster, work: job.work, amount: job.bounty }); } }
  }
  return events;
}

// ── VERIFY the whole ledger: hash-chain intact + signatures valid + value CONSERVED ──
export async function verifyLedger(econ, { crypto } = {}) {
  const L = econ.ledger; if (!L.length || L[0].type !== 'genesis') return { ok: false, why: 'no genesis' };
  const supply = L[0].supply;
  if (h16(canonical({ seq: 0, type: 'genesis', supply, prevHash: L[0].prevHash })) !== L[0].hash) return { ok: false, why: 'genesis hash' };
  for (let i = 1; i < L.length; i++) {
    const e = L[i];
    if (e.prevHash !== L[i - 1].hash) return { ok: false, why: 'broken chain at ' + i };
    const { sig, hash, seq, prevHash, ...body } = e;
    if (h16(canonical({ ...body, seq, prevHash }) + (sig || '')) !== hash) return { ok: false, why: 'tampered entry ' + i };
    if (crypto && sig) { const signer = econ.agents.get(e.from); if (!signer || !signer.pk) return { ok: false, why: 'no pubkey for signer ' + e.from }; if (!(await crypto.verify(canonical({ ...body, seq, prevHash }), sig, signer.pk))) return { ok: false, why: 'bad signature at ' + i }; }
  }
  const total = [...econ.agents.values()].reduce((s, a) => s + a.balance, 0);
  if (total !== supply) return { ok: false, why: `value not conserved: ${total} ≠ ${supply}` };
  return { ok: true, supply, entries: L.length };
}

export const balances = econ => Object.fromEntries([...econ.agents.values()].map(a => [a.id, a.balance]));
export default { h16, canonical, WORKS, doWork, genesis, transfer, postJob, claimJob, completeJob, tick, verifyLedger, balances };
