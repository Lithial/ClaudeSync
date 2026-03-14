import type { WebSocket } from "ws";
import type { PeerInfo } from "@claude-sync/protocol";

export interface ConnectedPeer {
  name: string;
  ws: WebSocket;
  connectedAt: number;
}

export class PeerRegistry {
  private peers = new Map<string, ConnectedPeer>();

  add(name: string, ws: WebSocket): boolean {
    if (this.peers.has(name)) return false;
    this.peers.set(name, { name, ws, connectedAt: Date.now() });
    return true;
  }

  remove(name: string): boolean {
    return this.peers.delete(name);
  }

  get(name: string): ConnectedPeer | undefined {
    return this.peers.get(name);
  }

  getBySocket(ws: WebSocket): ConnectedPeer | undefined {
    for (const peer of this.peers.values()) {
      if (peer.ws === ws) return peer;
    }
    return undefined;
  }

  list(): PeerInfo[] {
    return Array.from(this.peers.values()).map((p) => ({
      name: p.name,
      connectedAt: p.connectedAt,
    }));
  }

  get size(): number {
    return this.peers.size;
  }
}
