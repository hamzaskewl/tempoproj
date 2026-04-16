# Solana Frontier Hackathon — Track Fit for Clippy

Clippy already ships: real-time Twitch spike detection, Claude Haiku classification, auto-clipping, and an on-chain Anchor program (`programs/clippy_market`) that runs binary prediction markets settled via Ed25519 sigverify, with a Solana oracle in `src/oracle/`. That gives us a head start on several tracks.

## Best fits (strongest leverage from existing code)

### 1. Agents + Tokenization — **top pick**
The oracle + Claude classifier is already an autonomous agent: it watches streams, makes judgments, and signs on-chain attestations. Formalizing it as an onchain agent is a small delta.
- **Metaplex Agent Kit / Register an Agent** — register the clippy oracle in the 014 registry as a Core NFT so the agent has onchain identity. Its attestation signing key becomes the agent wallet.
- **Launch a Token** — a `$CLIPPY` agent token: stakers back the oracle's accuracy, earn a cut of market fees, get governance over which channels are watched.
- **Swig Smart Wallets** — wrap the oracle signer in a policy-controlled wallet (rate limits, per-market spend caps, delegated execution) so it can't be drained if compromised.
- **Solana Agent Skills** — package clippy's spike-detect + classify + clip pipeline as a reusable skill other agents can call.

### 2. DeFi + Stablecoins — **natural extension of the markets**
Markets currently settle in USDC. Swapping to interest-bearing collateral is a one-file change in the Anchor program's mint check.
- **Reflect (`@reflectmoney/stable.ts`)** — settle markets in an interest-bearing dollar so LPs earn yield while positions are open.
- **Phantom CASH** — accept CASH as an alternate collateral + use it for clip tipping / creator payouts.
- **Vanish Private Swaps** — privately rebalance oracle treasury without leaking strategy.

### 3. Blinks + Actions — **high-ROI, low-effort**
Every classified moment is already a shareable unit. Wrapping it in a Blink means any spike auto-generates a tweet-embeddable bet.
- **Solana Actions & Blinks + `@solana/actions`** — one Blink per market: "Will this clutch be clip-worthy? YES / NO", bet directly from Twitter/Discord.
- **Dialect Blinks** — branded component for the clip player page (`/clip/:id`).

## Plausible secondary fits

### 4. Identity + Human Verification
- **World IDKit** — gate invite codes behind proof-of-human instead of the current whitelist, kill sybil farming on the invite system.

### 5. Treasury + Security
- **Squads Multisig** — move `CLIPPY_PROGRAM_ID` upgrade authority and the oracle keypair behind a multisig before mainnet.
- **zauth Vector** — run the scanner against the Next.js API surface (lots of auth endpoints in `app/api`).

### 6. Privacy + Confidential Compute
- **Arcium** — hide which channels a user is betting on so whales can't front-run the oracle. Speculative but on-theme.

## Poor fits (skip)
- **Games** — wrong domain.
- **Mobile** — no RN code today, too large a pivot.
- **Governance / DAOs** — only relevant if we launch the agent token first.
- **Payments + Commerce** — tangential unless we lean into creator tipping.

## Suggested submission stack
Lead with **Agents + Tokenization** (Metaplex + Swig), bundle **Blinks + Actions** and **DeFi + Stablecoins** (Reflect) as secondary track submissions — all three reuse the existing oracle and Anchor program without a rewrite.
