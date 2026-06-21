/**
 * PartyKit relay server for Override battle multiplayer.
 *
 * One PartyKit "room" == one battle session (its id is the room code). The server
 * keeps the two players' forces (by role: host / guest) so a late joiner or a
 * refresh re-syncs, and relays per-unit damage updates between the two clients.
 *
 * Deploy:  npx partykit deploy            (needs a free Cloudflare/PartyKit login)
 * It prints a host like `override-battle.<you>.partykit.dev` — paste that into the
 * app's multiplayer "Server" field.
 */
import type * as Party from "partykit/server";

type Force = { name: string; units: { damage?: unknown }[] };
type State = { host?: Force; guest?: Force };

export default class BattleServer implements Party.Server {
  state: State = {};

  constructor(readonly room: Party.Room) {}

  /** Send the current state + presence to a freshly-connected client. */
  onConnect(conn: Party.Connection): void {
    conn.send(JSON.stringify({ type: "state", host: this.state.host, guest: this.state.guest }));
    this.presence();
  }

  onClose(): void {
    this.presence();
  }

  onMessage(message: string, sender: Party.Connection): void {
    let m: { type?: string; role?: "host" | "guest"; idx?: number; damage?: unknown; force?: Force };
    try {
      m = JSON.parse(message) as typeof m;
    } catch {
      return;
    }
    if (m.type === "hello" && (m.role === "host" || m.role === "guest") && m.force) {
      // A player joined / re-sent their force. Cache it and broadcast full state.
      this.state[m.role] = m.force;
      this.room.broadcast(JSON.stringify({ type: "state", host: this.state.host, guest: this.state.guest }));
    } else if (m.type === "damage" && (m.role === "host" || m.role === "guest") && typeof m.idx === "number") {
      // Update our cached copy so late joiners get current damage, then relay.
      const f = this.state[m.role];
      if (f?.units?.[m.idx]) f.units[m.idx].damage = m.damage;
      this.room.broadcast(message, [sender.id]);
    }
  }

  presence(): void {
    const count = [...this.room.getConnections()].length;
    this.room.broadcast(JSON.stringify({ type: "presence", count }));
  }
}
