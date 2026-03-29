# clippy

**Real-time Twitch stream intelligence & auto-clipping** — [clippy.build](https://clippy.build/)

Detects chat spikes, classifies moments with AI, clips highlights automatically.

[![MIT License](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT) [![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)](https://typescriptlang.org) [![Twitch](https://img.shields.io/badge/Twitch-9146FF?logo=twitch&logoColor=white)](https://twitch.tv) [![Claude AI](https://img.shields.io/badge/Claude_AI-Haiku_4.5-orange)](https://anthropic.com)

### Demo

https://x.com/WWantep/status/2036900603087974480

---

## What is clippy?

[clippy.build](https://clippy.build/) monitors Twitch streams in real time, detects when chat goes crazy, figures out what happened using AI, and automatically creates clips — all hands-free.

You add up to 3 channels, confirm them when they're live, and clippy handles the rest. Every spike gets classified, described, and clipped to your Twitch account.

```
Chat Firehose → Spike Detection → AI Classification → Auto-Clip
```

### How spike detection works

```
Every second, per channel:
  burst     = messages in last 5s      ← instant reaction
  sustained = messages in last 30s     ← confirms it's real
  baseline  = avg of non-zero bursts   ← adapts to channel size (30 sample window)

Spike fires when:
  burst > baseline × adaptive_threshold   (1.5x to 2.5x depending on channel size)
  burst > 1 msg/s                         (absolute minimum)
  viewers ≥ 500
  30s debounce                            (no spam)
```

Chat also gets a fast regex-based **vibe score** (funny, hype, awkward, win, loss) from emote/keyword patterns — this is the instant label before the LLM responds.

### How AI classification works

When a spike fires on a watched channel, the last 50 chat messages + streamer context (name, game, stream title, viewer count) are sent to Claude Haiku 4.5 with a system prompt that understands Twitch culture — emotes from Twitch, 7TV, BTTV, FFZ, spam patterns, copypasta, and chat behavior.

The LLM returns:
- **mood** — hype, funny, rage, clutch, awkward, wholesome, drama, shock, sad
- **description** — one punchy sentence about what happened on stream
- **clipWorthy** — whether a viewer would actually want to rewatch this

---

## Features

- **Real-time chat monitoring** — WebSocket firehose across thousands of Twitch channels
- **Adaptive spike detection** — dual-window rate analysis (5s burst + 30s sustained) with per-channel baselines
- **AI-powered classification** — Claude Haiku 4.5 with full Twitch emote knowledge
- **Auto-clipping** — creates Twitch clips on your account when moments are detected
- **Per-user dashboard** — 3 channel slots, persistent moments, clip embeds, streamer filtering
- **Invite system** — multi-use codes with configurable limits, auto-apply from URL
- **Admin whitelist** — whitelist Twitch usernames for invite-free access
- **User management** — admin can revoke users, delete invite codes
- **VOD deep-links** — direct links to exact VOD timestamps
- **Trending sidebar** — top channels by burst rate across all of Twitch
- **MPP API** — pay-per-use endpoints for programmatic access via Tempo micropayments
- **Postgres persistence** — moments, clips, user channels, LLM budget all survive restarts
- **Twitch token auto-refresh** — OAuth tokens persist in DB, refresh automatically on startup + every 3 hours
- **Rate limiting** — auth endpoints rate-limited to prevent abuse

---

## Quick start

```bash
git clone https://github.com/hamzaskewl/clippy.git
cd clippy
npm install
cp .env.example .env
npm run dev
```

### Environment variables

```env
# Required
TWITCH_CLIENT_ID=         # Twitch app client ID
TWITCH_CLIENT_SECRET=     # Twitch app client secret
ANTHROPIC_API_KEY=        # Claude API key for classifications

# Database (optional — runs in-memory without it)
DATABASE_URL=             # Postgres connection string

# Admin
ADMIN_TWITCH=             # Twitch username that gets admin role automatically

# Optional
LLM_BUDGET_USD=20         # Max LLM spend before auto-pause (default $20)
PORT=3000                 # Server port
WALLET_ADDRESS=           # Tempo wallet for MPP payments
```

---

## Project structure

```
src/
  index.ts          Express server, routes, auth, MPP payment setup
  firehose.ts       Twitch chat WebSocket, rate analysis, spike detection, stream context
  moments.ts        Moment capture, per-user channel management (3 slots), DB persistence
  clip.ts           Twitch clip creation, OAuth token persistence + auto-refresh
  summarize.ts      Claude Haiku classification, system prompt, budget tracking
  auth.ts           User auth, sessions, invite codes, whitelist, TOS
  db/
    schema.ts       Drizzle ORM schema (users, moments, channels, tokens, invites, whitelist)
    index.ts        Database init, auto-migration on startup

public/
  index.html        Landing page — public stats, live spike feed, trending
  dashboard.html    Per-user dashboard — channel slots, moments, clip embeds
  clips.html        Clip directory with pagination + "my channels" filter
  admin.html        Admin panel — invite codes, users, whitelist, LLM budget
  login.html        Twitch OAuth login with TOS consent
  invite.html       Invite code entry (supports auto-fill from URL)
  docs.html         API documentation
  llms.txt          LLM-readable service manifest
```

---

## API

### Free endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api` | Service info + endpoint discovery |
| `GET` | `/health` | Status + stats |
| `GET` | `/trending` | Top 10 trending channels |
| `GET` | `/alerts` | SSE spike stream (filterable by `?channel=name`) |
| `GET` | `/moments/:id` | Moment details |
| `GET` | `/moments/latest/:channel` | Latest moment for a channel |
| `GET` | `/api/stats` | Public stats for landing page |
| `GET` | `/api/clips` | Clip directory |
| `GET` | `/clip/:id` | Embedded clip player page |

### Authenticated endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/my/channels` | Your 3 channel slots |
| `POST` | `/my/channels` | Add a channel |
| `DELETE` | `/my/channels/:channel` | Remove a channel |
| `POST` | `/my/channels/:channel/confirm` | Confirm (must be live) |
| `GET` | `/my/moments` | All moments for your channels |
| `GET` | `/channel-stats/:name` | Live channel rates |
| `POST` | `/clip/:id` | Create a Twitch clip for a moment |

### Paid endpoints (Tempo MPP, USDC)

| Method | Endpoint | Cost | Description |
|--------|----------|------|-------------|
| `POST` | `/trending` | $0.001 | Full trending list |
| `POST` | `/channel` | $0.001 | Channel stats + chat |
| `POST` | `/spikes` | $0.002 | All active spikes with VOD links |
| `POST` | `/summarize` | $0.01 | LLM summary of channel chat |
| `POST` | `/moments` | $0.001 | Query captured moments |
| `POST` | `/watch/:channel` | $0.03/spike | Live AI-classified spikes + auto-clip |

---

## Tech stack

- **Runtime** — Node.js, Express 5, TypeScript
- **AI** — Claude Haiku 4.5 (Anthropic API)
- **Database** — PostgreSQL + Drizzle ORM
- **Payments** — Tempo MPP, Viem, USDC on Tempo Chain
- **Twitch** — Helix API, OAuth 2.0, GQL for stream context
- **Frontend** — Vanilla JS, SSE, dark monospace UI
- **Hosting** — Railway ([clippy.build](https://clippy.build/))

---

## Contributing

PRs welcome. If you're adding a feature, open an issue first so we can discuss.
