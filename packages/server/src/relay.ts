import type { WebSocket } from "ws";
import {
  type Message,
  MessageTypes,
  createMessage,
  parseMessage,
  MAX_MESSAGE_SIZE,
} from "@claude-sync/protocol";
import { PeerRegistry } from "./peers.js";
import { validateToken } from "./auth.js";

export class Relay {
  readonly peers = new PeerRegistry();
  private readonly token: string;

  constructor(token: string) {
    this.token = token;
  }

  handleConnection(ws: WebSocket): void {
    // Peer must register within 5 seconds
    const timeout = setTimeout(() => {
      ws.close(4001, "Registration timeout");
    }, 5000);

    ws.once("message", (raw) => {
      clearTimeout(timeout);
      const data = raw.toString();

      if (data.length > MAX_MESSAGE_SIZE) {
        ws.close(4002, "Message too large");
        return;
      }

      let msg: Message;
      try {
        msg = parseMessage(data);
      } catch {
        ws.close(4003, "Invalid message");
        return;
      }

      if (msg.type !== MessageTypes.PEER_REGISTER) {
        ws.close(4004, "First message must be peer:register");
        return;
      }

      if (!validateToken(msg.payload.token, this.token)) {
        ws.close(4005, "Authentication failed");
        return;
      }

      const name = msg.payload.name;
      if (!this.peers.add(name, ws)) {
        ws.close(4006, "Peer name already taken");
        return;
      }

      // Notify all other peers
      this.broadcast(
        createMessage(MessageTypes.PEER_JOINED, "server", null, { name }),
        name,
      );

      // Set up message handling
      ws.on("message", (raw) => this.handleMessage(ws, name, raw.toString()));
      ws.on("close", () => this.handleDisconnect(name));
      ws.on("error", () => this.handleDisconnect(name));
    });
  }

  private handleMessage(ws: WebSocket, senderName: string, data: string): void {
    if (data.length > MAX_MESSAGE_SIZE) {
      this.sendError(ws, senderName, "MESSAGE_TOO_LARGE", "Message exceeds 1MB limit");
      return;
    }

    let msg: Message;
    try {
      msg = parseMessage(data);
    } catch {
      this.sendError(ws, senderName, "INVALID_MESSAGE", "Could not parse message");
      return;
    }

    if (msg.type === MessageTypes.PEER_LIST) {
      const response = createMessage(
        MessageTypes.PEER_LIST_RESPONSE,
        "server",
        senderName,
        { peers: this.peers.list() },
      );
      ws.send(JSON.stringify(response));
      return;
    }

    // Route targeted messages
    if (msg.to) {
      const target = this.peers.get(msg.to);
      if (!target) {
        this.sendError(ws, senderName, "PEER_NOT_FOUND", `Peer "${msg.to}" not connected`);
        return;
      }
      target.ws.send(data);
    } else {
      // Broadcast (exclude sender)
      this.broadcast(msg, senderName);
    }
  }

  private handleDisconnect(name: string): void {
    if (this.peers.remove(name)) {
      this.broadcast(
        createMessage(MessageTypes.PEER_LEFT, "server", null, { name }),
        name,
      );
    }
  }

  private broadcast(msg: Message | object, excludeName?: string): void {
    const data = JSON.stringify(msg);
    for (const peer of this.peers.list()) {
      if (peer.name === excludeName) continue;
      const connected = this.peers.get(peer.name);
      if (connected) {
        connected.ws.send(data);
      }
    }
  }

  private sendError(ws: WebSocket, to: string, code: string, message: string): void {
    const errorMsg = createMessage(MessageTypes.ERROR, "server", to, { code, message });
    ws.send(JSON.stringify(errorMsg));
  }
}
