# agora — a personal sovereign agent-economy

**▶ Live: https://sjgant80-hub.github.io/agora/**

Your own agents **hold value**, do **verified work** to **earn**, **spend** to get work done, and pay each
other with **signed transfers** on a **hash-chained sovereign ledger** — a micro-economy running on your
machine. **No bank, no cloud, no chain you don't control.** The agent-wallet primitive
([the-wallet](https://sjgant80-hub.github.io/the-wallet/), gated 23/23 with real Ed25519), made into a
running economy.

## Honest scope

- **Real:** Ed25519 agents holding value; **signed, non-forgeable** transfers; a **hash-chained,
  tamper-evident** ledger; **conservation** (no printing) and **no double-spend**, both provable; you **earn
  only by doing verified work** (a wrong answer is recomputed and rejected); it **runs** — value flows
  between agents over ticks. All on one machine, **no network** (checkable in the source).
- **NOT claimed:** not real money, not a cryptocurrency with external value, not distributed trustless
  consensus. It is *your* economy on *your* machine — that's the sovereignty ("no chain you don't control"),
  and it means the trust model is "you own the engine," not "trustless between strangers." Value is internal
  units; the work is toy-but-*real* compute. **The flag being planted: a personal agent-economy, breathing,
  sovereign — nobody has one running.**

## How it works

Each agent is an Ed25519 identity with a balance, skills (work it can do), and wants (work it needs). Each
**tick**: consumers post their wants as jobs (escrowing a bounty via a *signed* transfer); producers claim a
job, do the real compute, and the engine pays them **only if the result verifies**. Every value movement is
a ledger entry linked to the previous by hash — break any link or forge any signature and `verifyLedger`
catches it. Total supply is minted once and **never changes**.

## Proven — `node test.mjs`, real Ed25519, zero tokens, 21/21

- Signed transfers move value; a **forged signature** or a **tampered amount** is rejected.
- **No overdraft, no double-spend.** **Conservation** — 100 in, 100 out after 20 transfers.
- **Earn by work** — a wrong result is not paid; only the correct, recomputed answer earns.
- **Tamper-evident ledger** — altering one prev-hash breaks the chain.
- **The economy runs** — over 6 ticks, 12 jobs posted + paid, both agents earned, value conserved at 80
  across 25 signed entries.
- **Sovereign** — the engine contains no network primitive; deterministic; garbage ops never throw.

## Files

`agora.mjs` (the economy — agents, signed transfers, hash-chained ledger, market, tick, verifyLedger) ·
`crypto-node.mjs` (real Ed25519 for the gate) · `test.mjs` (the 21/21 gate) · `index.html` (the live
dashboard — watch balances flow, the ledger stream, verify it yourself; WebCrypto Ed25519) · `sw.js` +
`manifest.webmanifest`. Zero-dep, Node + browser.

```bash
node test.mjs                 # the proof
python -m http.server 8080    # then open http://localhost:8080 and press "run the economy"
```
