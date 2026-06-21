# Live multiplayer (battle tracker)

The battle tracker can sync a battle between two players in real time over a tiny
[PartyKit](https://www.partykit.io/) relay (runs on Cloudflare's free tier). The
relay only carries the two forces + per-unit damage — no accounts, no database.

## 1. Deploy the relay (one time)

From the repo root:

```bash
npx partykit deploy
```

The first run asks you to log in (GitHub/Cloudflare — free). It deploys
`party/battle.ts` and prints a host, e.g.:

```
  Deployed override-battle to https://override-battle.YOURNAME.partykit.dev
```

Copy that host (`override-battle.YOURNAME.partykit.dev`).

## 2. Point the app at it

In the app: **⚔ Battle → Host online** (or Join online). Paste the host into the
**Server** field. It's remembered in your browser, so you only do this once.

## 3. Play

- **Host online**: pick your force, Start. You get a **room link** — send it to
  your opponent (chat/Discord/etc.).
- **Join online**: paste the room link (or code), pick your force, Start.

Both players now see the same battle: your force vs theirs. Mark damage / heat /
ammo / out-of-action on any unit and it updates on the other screen. Refreshing
re-syncs from the relay; the room stays alive as long as someone's connected.

## Notes / limits

- The relay is a thin pass-through: each player edits, the other sees it
  (last-write-wins per unit — fine for turn-based play). No turn/initiative
  enforcement yet.
- It's free-tier; for a hobby group that's plenty. The PartyKit server API can
  change between versions — if `npx partykit deploy` errors on `party/battle.ts`,
  check the current [PartyKit server docs](https://docs.partykit.io/) for the
  `Party.Room` / `broadcast` signatures and adjust.
- Self-hosting instead: any WebSocket server that relays JSON messages and caches
  the last `state` per room works; mirror the protocol in `party/battle.ts`.
